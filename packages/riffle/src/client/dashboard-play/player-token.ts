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
      return session.tokens?.accessToken?.toString() ?? null;
    } catch {
      return null;
    }
  };
}
