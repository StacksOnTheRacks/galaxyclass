import type { ResourcesConfig } from "aws-amplify";
import { COPY } from "./messages";

export class AuthConfigError extends Error {
  constructor() {
    super(COPY.configError);
    this.name = "AuthConfigError";
  }
}

export function authResources(): ResourcesConfig | null {
  const userPoolId = process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID;
  const userPoolClientId = process.env.NEXT_PUBLIC_COGNITO_USER_POOL_CLIENT_ID;
  const region = process.env.NEXT_PUBLIC_COGNITO_REGION;
  if (!userPoolId || !userPoolClientId || !region) return null;

  return {
    Auth: {
      Cognito: {
        userPoolId,
        userPoolClientId,
      },
    },
  };
}

type AuthModule = typeof import("aws-amplify/auth");

export async function withAuth<T>(
  fn: (auth: AuthModule) => Promise<T>,
): Promise<T> {
  const resources = authResources();
  if (!resources || typeof window === "undefined") {
    throw new AuthConfigError();
  }

  const { Amplify } = await import("aws-amplify");
  Amplify.configure(resources);
  const auth = await import("aws-amplify/auth");
  return fn(auth);
}
