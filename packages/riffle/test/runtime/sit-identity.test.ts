import { validateGamerTag } from '@galaxyclass/accounts/gamer-tag';
import { describe, expect, it, vi } from 'vitest';
import { createRuntimeHandler } from '../../src/runtime/handler.js';
import { createPlayerResolver, type ResolvePlayer } from '../../src/runtime/player-identity.js';
import type { OutboundMessage, TableSnapshotMessage, WebSocketEvent } from '../../src/runtime/types.js';
import {
  accessClaims,
  attackerKey,
  signJwt,
  testAccessTokenVerifier,
  unsignedJwt,
} from '../helpers/cognito-tokens.js';
import { MemoryMatchStore } from '../support/memory-store.js';

const TABLE_ID = 'table-1';
const PROFILES: Record<string, { gamerTag: string | null; avatarId: number | null }> = {
  'sub-river-rat': { gamerTag: 'River_Rat', avatarId: 42 },
  'sub-no-tag': { gamerTag: null, avatarId: 17 },
};

function wsEvent(routeKey: string, connectionId: string, body?: unknown): WebSocketEvent {
  return {
    requestContext: {
      routeKey,
      connectionId,
      domainName: 'example.execute-api.us-east-1.amazonaws.com',
      stage: 'prod',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  };
}

function cognitoResolver(): ResolvePlayer {
  return createPlayerResolver(testAccessTokenVerifier(), async (sub) => PROFILES[sub] ?? { gamerTag: null, avatarId: null });
}

async function harness(resolvePlayer: ResolvePlayer | null = cognitoResolver()) {
  const store = new MemoryMatchStore();
  const sent = new Map<string, OutboundMessage[]>();
  const handler = createRuntimeHandler({
    store,
    postToConnection: async (connectionId, message) => {
      sent.set(connectionId, [...(sent.get(connectionId) ?? []), message]);
    },
    now: () => '2026-09-30T12:00:00.000Z',
    rngSeed: () => 1,
    nextHandDelayMs: null,
    resolvePlayer,
    random: () => 0,
  });
  await store.createTable(TABLE_ID, '2026-09-30T12:00:00.000Z');

  const join = async (connectionId: string) => {
    await handler(wsEvent('$connect', connectionId), {});
    await handler(wsEvent('$default', connectionId, { action: 'join_table', tableId: TABLE_ID }), {});
  };
  const sit = (connectionId: string, message: Record<string, unknown>) =>
    handler(wsEvent('$default', connectionId, { action: 'sit', ...message }), {});
  const last = (connectionId: string) => sent.get(connectionId)?.at(-1);
  const lastSnapshot = (connectionId: string) =>
    sent
      .get(connectionId)
      ?.filter((message): message is TableSnapshotMessage => message.type === 'table_snapshot')
      .at(-1);

  return { store, sent, join, sit, last, lastSnapshot };
}

describe('sit identity', () => {
  it('ignores a guest-supplied gamer tag and avatar and seats a server-named guest', async () => {
    const t = await harness();
    await t.join('conn-guest');

    await t.sit('conn-guest', { seatId: '1', displayName: 'River_Rat', avatarId: 42 });

    const seat = await t.store.getSeat(TABLE_ID, '1');
    expect(seat).not.toBeNull();
    expect(seat!.displayName).not.toBe('River_Rat');
    expect(seat!.displayName).toBe('Lucky Otter');
    expect(validateGamerTag(seat!.displayName).ok).toBe(false);
    expect(seat!.avatarId).toBe(1);
    expect(seat!.playerSub).toBeUndefined();
  });

  it('seats a verified player under the profile gamer tag and avatar, not the ones in the message', async () => {
    const t = await harness();
    await t.join('conn-a');

    await t.sit('conn-a', {
      seatId: '2',
      accessToken: signJwt(accessClaims()),
      displayName: 'Mallory',
      avatarId: 7,
    });

    expect(t.last('conn-a')).toMatchObject({ type: 'table_snapshot' });
    const seat = await t.store.getSeat(TABLE_ID, '2');
    expect(seat).toMatchObject({ displayName: 'River_Rat', avatarId: 42, playerSub: 'sub-river-rat' });
  });

  it('gives a verified player without a gamer tag a guest name but keeps their avatar', async () => {
    const t = await harness();
    await t.join('conn-a');
    await t.sit('conn-a', { seatId: '1', accessToken: signJwt(accessClaims({ sub: 'sub-no-tag' })) });

    const seat = await t.store.getSeat(TABLE_ID, '1');
    expect(validateGamerTag(seat!.displayName).ok).toBe(false);
    expect(seat).toMatchObject({ avatarId: 17, playerSub: 'sub-no-tag' });
  });

  it.each([
    ['forged signature', () => signJwt(accessClaims(), attackerKey)],
    ['unsigned token', () => unsignedJwt(accessClaims())],
    ['wrong issuer', () => signJwt(accessClaims({ iss: 'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_Evil' }))],
    ['wrong audience', () => signJwt(accessClaims({ client_id: 'otherclient' }))],
    ['expired', () => signJwt(accessClaims({ exp: Math.floor(Date.now() / 1000) - 5 }))],
    [
      'tampered claims',
      () => {
        const [header, , signature] = signJwt(accessClaims()).split('.');
        const payload = Buffer.from(JSON.stringify(accessClaims({ sub: 'sub-river-rat', client_id: 'x' }))).toString('base64url');
        return `${header}.${payload}.${signature}`;
      },
    ],
    ['non-string token', () => ({ sub: 'sub-river-rat' })],
  ])('refuses to seat anyone for a %s and leaves the table unchanged', async (_label, token) => {
    const t = await harness();
    await t.join('conn-a');
    const versionBefore = (await t.store.getTable(TABLE_ID))!.version;

    await t.sit('conn-a', { seatId: '1', accessToken: token(), displayName: 'River_Rat' });

    expect(t.last('conn-a')).toEqual({ type: 'error', code: 'invalid_access_token' });
    expect(await t.store.getSeat(TABLE_ID, '1')).toBeNull();
    expect((await t.store.getTable(TABLE_ID))!.version).toBe(versionBefore);
  });

  it('refuses tokens when the runtime has no Cognito configuration', async () => {
    const t = await harness(null);
    await t.join('conn-a');
    await t.sit('conn-a', { seatId: '1', accessToken: signJwt(accessClaims()) });

    expect(t.last('conn-a')).toEqual({ type: 'error', code: 'invalid_access_token' });
    expect(await t.store.getSeat(TABLE_ID, '1')).toBeNull();
  });

  it('reports identity_unavailable when the profile lookup fails', async () => {
    const t = await harness(
      createPlayerResolver(testAccessTokenVerifier(), vi.fn(async () => {
        throw new Error('dynamo down');
      })),
    );
    await t.join('conn-a');
    await t.sit('conn-a', { seatId: '1', accessToken: signJwt(accessClaims()) });

    expect(t.last('conn-a')).toEqual({ type: 'error', code: 'identity_unavailable' });
    expect(await t.store.getSeat(TABLE_ID, '1')).toBeNull();
  });

  it('keeps one account to one seat per table', async () => {
    const t = await harness();
    await t.join('conn-a');
    await t.join('conn-b');
    await t.sit('conn-a', { seatId: '1', accessToken: signJwt(accessClaims()) });

    await t.sit('conn-b', { seatId: '2', accessToken: signJwt(accessClaims({ jti: 'jti-2' })) });

    expect(t.last('conn-b')).toEqual({ type: 'error', code: 'account_already_seated' });
    expect(await t.store.getSeat(TABLE_ID, '2')).toBeNull();
  });

  it('never lets a guest name collide with a verified gamer tag at the table', async () => {
    const t = await harness();
    await t.join('conn-a');
    await t.join('conn-b');
    await t.sit('conn-a', { seatId: '1', accessToken: signJwt(accessClaims()) });
    await t.sit('conn-b', { seatId: '2', displayName: 'river_rat' });

    const names = (await t.store.listSeats(TABLE_ID)).map((seat) => seat.displayName.toLowerCase());
    expect(names.filter((name) => name === 'river_rat')).toHaveLength(1);
  });

  it('keeps the verified sub out of every snapshot', async () => {
    const t = await harness();
    await t.join('conn-a');
    await t.join('conn-b');
    await t.sit('conn-a', { seatId: '1', accessToken: signJwt(accessClaims()) });
    await t.sit('conn-b', { seatId: '2' });

    for (const conn of ['conn-a', 'conn-b']) {
      const text = JSON.stringify(t.sent.get(conn));
      expect(text).not.toContain('sub-river-rat');
      expect(text).not.toContain('playerSub');
    }
    expect(t.lastSnapshot('conn-b')?.seats.find((seat) => seat.seatId === '1')).toMatchObject({
      displayName: 'River_Rat',
      avatarId: 42,
    });
  });
});
