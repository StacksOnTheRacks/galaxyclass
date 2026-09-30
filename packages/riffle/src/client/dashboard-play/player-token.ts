import type { PlayAuthConfig } from './config.js';

/** Resolves the signed-in player's Cognito access token, or null for guests. */
export type GetAccessToken = () => Promise<string | null>;

export const guestAccessToken: GetAccessToken = async () => null;

/**
 * Reads the studio's Amplify session (same origin) and refreshes it when expired.
 * The token is proof for the server to verify; Riffle never decodes it for identity.
 */
export function createAmplifyAccessToken(auth: PlayAuthConfig): GetAccessToken {
  let configured = false;
  return async () => {
    try {
      const [{ Amplify }, { fetchAuthSession }] = await Promise.all([
        import('aws-amplify'),
        import('aws-amplify/auth'),
      ]);
      if (!configured) {
        Amplify.configure({
          Auth: { Cognito: { userPoolId: auth.userPoolId, userPoolClientId: auth.userPoolClientId } },
        });
        configured = true;
      }
      const session = await fetchAuthSession();
      const token = session.tokens?.accessToken?.toString() ?? null;
      if (!token) {
        console.warn('[riffle] no studio session tokens; sitting as a guest');
      }
      return token;
    } catch (error) {
      console.warn('[riffle] could not read the studio session; sitting as a guest', {
        error: error instanceof Error ? error.name : 'unknown',
        detail: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  };
}
