import { validateGamerTag } from '../gamer-tag.js';
import { SIGN_UP_ERROR_CODES } from '../profile-api-contract.js';
import type { ProfileStore } from '../profile-store.js';
import { profileStoreFromEnv } from './dynamo.js';

/** Cognito user pool trigger fields this handler reads; the event is returned unchanged. */
export interface CognitoTriggerEvent {
  triggerSource: string;
  userName?: string;
  request: {
    userAttributes?: Record<string, string | undefined>;
    clientMetadata?: Record<string, string | undefined>;
  };
  response: Record<string, unknown>;
}

export function createCognitoTriggerHandler(getStore: () => ProfileStore) {
  return async function handle<T extends CognitoTriggerEvent>(event: T): Promise<T> {
    if (event.triggerSource === 'PreSignUp_SignUp') {
      const email = event.request.userAttributes?.email ?? '';
      const raw = event.request.clientMetadata?.gamerTag;
      if (!raw || !raw.trim()) {
        throw new Error(SIGN_UP_ERROR_CODES.required);
      }
      const tag = validateGamerTag(raw);
      if (!tag.ok) {
        throw new Error(SIGN_UP_ERROR_CODES.invalid);
      }
      const reserved = await getStore().reservePendingGamerTag(email, tag.value);
      if (reserved === 'taken') {
        throw new Error(SIGN_UP_ERROR_CODES.taken);
      }
      return event;
    }

    if (event.triggerSource === 'PostConfirmation_ConfirmSignUp') {
      const sub = event.request.userAttributes?.sub;
      const email = event.request.userAttributes?.email;
      if (sub && email) {
        try {
          await getStore().claimPendingGamerTag(sub, email);
        } catch (error) {
          // Never block confirmation; the account page lets the player finish their profile.
          console.error('post confirmation profile claim failed', error);
        }
      }
      return event;
    }

    return event;
  };
}

export const handler = createCognitoTriggerHandler(profileStoreFromEnv);
