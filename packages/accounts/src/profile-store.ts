import { DeleteCommand, GetCommand, TransactWriteCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { isAvatarId, randomAvatarId } from './avatars.js';
import { gamerTagKey } from './gamer-tag.js';
import type { PublicProfile } from './profile-api-contract.js';

/**
 * Single-table layout (partition key `pk` only):
 *
 * - `USER#<sub>`      { gamerTag?, avatarId, createdAt, updatedAt }  the player's profile.
 * - `TAG#<lowercase>` { gamerTag, status, ownerSub? | ownerEmail?, expiresAt? }
 *     The uniqueness lock. Every write goes through a conditional put, so two
 *     players can never hold the same lowercase key at once.
 *     `pending` locks are taken at sign-up (before the account has a sub) and
 *     expire so abandoned sign-ups release their tag.
 * - `PENDING#<email>` { gamerTag, expiresAt }  links an unconfirmed sign-up to its tag.
 */
export const PENDING_TAG_TTL_SECONDS = 72 * 60 * 60;

export interface DocumentClientLike {
  send(command: unknown): Promise<unknown>;
}

export type SetGamerTagResult =
  | { ok: true; profile: PublicProfile }
  | { ok: false; reason: 'taken' | 'conflict' };

export interface ProfileStore {
  getProfile(sub: string): Promise<PublicProfile>;
  isGamerTagAvailable(tag: string, sub?: string): Promise<boolean>;
  setGamerTag(sub: string, tag: string): Promise<SetGamerTagResult>;
  setAvatar(sub: string, avatarId: number): Promise<PublicProfile>;
  reservePendingGamerTag(email: string, tag: string): Promise<'reserved' | 'taken'>;
  claimPendingGamerTag(sub: string, email: string): Promise<PublicProfile>;
}

export interface ProfileStoreOptions {
  client: DocumentClientLike;
  tableName: string;
  now?: () => Date;
  random?: () => number;
}

interface UserItem {
  pk: string;
  gamerTag?: string;
  avatarId?: number;
}

interface TagItem {
  pk: string;
  gamerTag: string;
  status: 'pending' | 'claimed';
  ownerSub?: string;
  ownerEmail?: string;
  expiresAt?: number;
}

interface PendingItem {
  pk: string;
  gamerTag: string;
}

export const userPk = (sub: string): string => `USER#${sub}`;
export const tagPk = (tag: string): string => `TAG#${gamerTagKey(tag)}`;
export const pendingPk = (email: string): string => `PENDING#${email.trim().toLowerCase()}`;

/** A lock can be taken when it is free, already ours, or an expired pending sign-up. */
const TAG_CLAIMABLE_BY_SUB =
  'attribute_not_exists(pk) OR ownerSub = :sub OR (#status = :pending AND expiresAt < :now)';

function errorName(error: unknown): string {
  return typeof error === 'object' && error !== null && 'name' in error
    ? String((error as { name: unknown }).name)
    : '';
}

function cancellationCodes(error: unknown): string[] {
  const reasons = (error as { CancellationReasons?: Array<{ Code?: string }> }).CancellationReasons;
  return Array.isArray(reasons) ? reasons.map((reason) => reason.Code ?? 'None') : [];
}

function toProfile(item: UserItem): PublicProfile {
  return {
    gamerTag: typeof item.gamerTag === 'string' && item.gamerTag ? item.gamerTag : null,
    avatarId: isAvatarId(item.avatarId) ? item.avatarId : 1,
  };
}

export function createProfileStore(options: ProfileStoreOptions): ProfileStore {
  const { client, tableName } = options;
  const now = options.now ?? (() => new Date());
  const random = options.random ?? Math.random;
  const nowSeconds = (): number => Math.floor(now().getTime() / 1000);

  async function getItem<T>(pk: string): Promise<T | null> {
    const result = (await client.send(
      new GetCommand({ TableName: tableName, Key: { pk }, ConsistentRead: true }),
    )) as { Item?: T };
    return result.Item ?? null;
  }

  /** Existing accounts get a profile (with a random avatar) the first time it is read. */
  async function ensureUser(sub: string): Promise<UserItem> {
    const existing = await getItem<UserItem>(userPk(sub));
    if (existing && isAvatarId(existing.avatarId)) {
      return existing;
    }
    const timestamp = now().toISOString();
    const result = (await client.send(
      new UpdateCommand({
        TableName: tableName,
        Key: { pk: userPk(sub) },
        UpdateExpression:
          'SET avatarId = if_not_exists(avatarId, :avatar), createdAt = if_not_exists(createdAt, :now), updatedAt = :now',
        ExpressionAttributeValues: { ':avatar': randomAvatarId(random), ':now': timestamp },
        ReturnValues: 'ALL_NEW',
      }),
    )) as { Attributes?: UserItem };
    return result.Attributes ?? { pk: userPk(sub), avatarId: 1 };
  }

  return {
    async getProfile(sub) {
      return toProfile(await ensureUser(sub));
    },

    async isGamerTagAvailable(tag, sub) {
      const lock = await getItem<TagItem>(tagPk(tag));
      if (!lock) {
        return true;
      }
      if (sub && lock.ownerSub === sub) {
        return true;
      }
      return lock.status === 'pending' && (lock.expiresAt ?? 0) < nowSeconds();
    },

    async setGamerTag(sub, tag) {
      const user = await ensureUser(sub);
      const previous = typeof user.gamerTag === 'string' && user.gamerTag ? user.gamerTag : null;
      const newKey = gamerTagKey(tag);
      const timestamp = now().toISOString();

      const items: unknown[] = [
        {
          Put: {
            TableName: tableName,
            Item: { pk: tagPk(tag), gamerTag: tag, status: 'claimed', ownerSub: sub, claimedAt: timestamp },
            ConditionExpression: TAG_CLAIMABLE_BY_SUB,
            ExpressionAttributeNames: { '#status': 'status' },
            ExpressionAttributeValues: { ':sub': sub, ':pending': 'pending', ':now': nowSeconds() },
          },
        },
        {
          Update: {
            TableName: tableName,
            Key: { pk: userPk(sub) },
            UpdateExpression: 'SET gamerTag = :tag, updatedAt = :now',
            // Guards against a concurrent change from another device releasing the wrong lock.
            ConditionExpression: previous ? 'gamerTag = :previous' : 'attribute_not_exists(gamerTag)',
            ExpressionAttributeValues: previous
              ? { ':tag': tag, ':now': timestamp, ':previous': previous }
              : { ':tag': tag, ':now': timestamp },
          },
        },
      ];
      if (previous && gamerTagKey(previous) !== newKey) {
        items.push({
          Delete: {
            TableName: tableName,
            Key: { pk: tagPk(previous) },
            ConditionExpression: 'attribute_not_exists(pk) OR ownerSub = :sub',
            ExpressionAttributeValues: { ':sub': sub },
          },
        });
      }

      try {
        await client.send(new TransactWriteCommand({ TransactItems: items as never }));
      } catch (error) {
        if (errorName(error) === 'TransactionCanceledException') {
          const codes = cancellationCodes(error);
          return { ok: false, reason: codes[0] === 'ConditionalCheckFailed' ? 'taken' : 'conflict' };
        }
        throw error;
      }
      return { ok: true, profile: toProfile({ ...user, gamerTag: tag }) };
    },

    async setAvatar(sub, avatarId) {
      const timestamp = now().toISOString();
      const result = (await client.send(
        new UpdateCommand({
          TableName: tableName,
          Key: { pk: userPk(sub) },
          UpdateExpression: 'SET avatarId = :avatar, updatedAt = :now, createdAt = if_not_exists(createdAt, :now)',
          ExpressionAttributeValues: { ':avatar': avatarId, ':now': timestamp },
          ReturnValues: 'ALL_NEW',
        }),
      )) as { Attributes?: UserItem };
      return toProfile(result.Attributes ?? { pk: userPk(sub), avatarId });
    },

    async reservePendingGamerTag(email, tag) {
      const ownerEmail = email.trim().toLowerCase();
      const expiresAt = nowSeconds() + PENDING_TAG_TTL_SECONDS;
      try {
        await client.send(
          new TransactWriteCommand({
            TransactItems: [
              {
                Put: {
                  TableName: tableName,
                  Item: { pk: tagPk(tag), gamerTag: tag, status: 'pending', ownerEmail, expiresAt },
                  ConditionExpression:
                    'attribute_not_exists(pk) OR (#status = :pending AND (ownerEmail = :email OR expiresAt < :now))',
                  ExpressionAttributeNames: { '#status': 'status' },
                  ExpressionAttributeValues: { ':pending': 'pending', ':email': ownerEmail, ':now': nowSeconds() },
                },
              },
              {
                Put: {
                  TableName: tableName,
                  Item: { pk: pendingPk(ownerEmail), gamerTag: tag, expiresAt },
                },
              },
            ],
          }),
        );
      } catch (error) {
        if (errorName(error) === 'TransactionCanceledException') {
          return 'taken';
        }
        throw error;
      }
      return 'reserved';
    },

    async claimPendingGamerTag(sub, email) {
      const ownerEmail = email.trim().toLowerCase();
      const pending = await getItem<PendingItem>(pendingPk(ownerEmail));
      if (!pending) {
        return toProfile(await ensureUser(sub));
      }
      const timestamp = now().toISOString();
      try {
        await client.send(
          new TransactWriteCommand({
            TransactItems: [
              {
                Put: {
                  TableName: tableName,
                  Item: {
                    pk: tagPk(pending.gamerTag),
                    gamerTag: pending.gamerTag,
                    status: 'claimed',
                    ownerSub: sub,
                    claimedAt: timestamp,
                  },
                  ConditionExpression:
                    'attribute_not_exists(pk) OR ownerSub = :sub OR (#status = :pending AND (ownerEmail = :email OR expiresAt < :now))',
                  ExpressionAttributeNames: { '#status': 'status' },
                  ExpressionAttributeValues: {
                    ':sub': sub,
                    ':pending': 'pending',
                    ':email': ownerEmail,
                    ':now': nowSeconds(),
                  },
                },
              },
              {
                Update: {
                  TableName: tableName,
                  Key: { pk: userPk(sub) },
                  UpdateExpression:
                    'SET gamerTag = :tag, avatarId = if_not_exists(avatarId, :avatar), createdAt = if_not_exists(createdAt, :now), updatedAt = :now',
                  ConditionExpression: 'attribute_not_exists(gamerTag)',
                  ExpressionAttributeValues: {
                    ':tag': pending.gamerTag,
                    ':avatar': randomAvatarId(random),
                    ':now': timestamp,
                  },
                },
              },
              { Delete: { TableName: tableName, Key: { pk: pendingPk(ownerEmail) } } },
            ],
          }),
        );
      } catch (error) {
        if (errorName(error) !== 'TransactionCanceledException') {
          throw error;
        }
        // The tag went to someone else while this sign-up sat unconfirmed; the
        // account page asks the player for a new one.
        await client.send(
          new DeleteCommand({ TableName: tableName, Key: { pk: pendingPk(ownerEmail) } }),
        );
        return toProfile(await ensureUser(sub));
      }
      return toProfile(await ensureUser(sub));
    },
  };
}
