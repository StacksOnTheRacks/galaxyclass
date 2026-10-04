import type { AuthConfig, ScribbleConfig } from './config.js';

/** Resolves the signed-in player's Cognito access token, or null for guests. */
export type GetAccessToken = () => Promise<string | null>;

export const DEV_TOKEN_KEY = 'scribble.devAccessToken';

const guest: GetAccessToken = async () => null;

/**
 * Reads the studio's Amplify session (same origin) and refreshes it when expired. The token is
 * proof for the server to verify; Scribble never decodes it for identity.
 */
function amplifyAccessToken(auth: AuthConfig): GetAccessToken {
  let configured = false;
  return async () => {
    try {
      const [{ Amplify }, { fetchAuthSession }] = await Promise.all([import('aws-amplify'), import('aws-amplify/auth')]);
      if (!configured) {
        Amplify.configure({ Auth: { Cognito: { userPoolId: auth.userPoolId, userPoolClientId: auth.userPoolClientId } } });
        configured = true;
      }
      const session = await fetchAuthSession();
      return session.tokens?.accessToken?.toString() ?? null;
    } catch (error) {
      console.warn('[scribble] could not read the studio session; sitting as a guest', {
        error: error instanceof Error ? error.name : 'unknown',
      });
      return null;
    }
  };
}

/** The dev server signs its own tokens and verifies them; production config never sets `dev`. */
function devAccessToken(storage: Pick<Storage, 'getItem'>): GetAccessToken {
  return async () => storage.getItem(DEV_TOKEN_KEY);
}

export function accessTokenSource(config: ScribbleConfig, storage: Pick<Storage, 'getItem'>): GetAccessToken {
  if (config.dev) {
    return devAccessToken(storage);
  }
  return config.auth ? amplifyAccessToken(config.auth) : guest;
}
