import { Hono } from 'hono';
import type { IdentityStore } from '../../identity/store.js';
import { identityError } from '../../identity/errors.js';
import type { RiffleEnv } from '../env.js';
import { parseIdentityBearer } from './bearer.js';

export interface IdentityRouteDeps {
  identityStore: IdentityStore;
}

export function createIdentityRoutes(env: RiffleEnv, deps: IdentityRouteDeps) {
  const routes = new Hono();
  const { identityStore } = deps;

  routes.post('/sign-up', async (c) => {
    let body: { email?: unknown; password?: unknown };
    try {
      body = await c.req.json();
    } catch {
      return Response.json(
        identityError('invalid_email', 'Enter a valid email address.'),
        { status: 400 },
      );
    }

    const email = typeof body.email === 'string' ? body.email : '';
    const password = typeof body.password === 'string' ? body.password : '';
    const result = await identityStore.signUp(email, password);
    if (!result.ok) {
      return Response.json(result.body, { status: result.status });
    }

    return Response.json(result.value, { status: 201 });
  });

  routes.post('/sign-in', async (c) => {
    let body: { email?: unknown; password?: unknown };
    try {
      body = await c.req.json();
    } catch {
      return Response.json(
        identityError('invalid_credentials', 'Incorrect email or password.'),
        { status: 401 },
      );
    }

    const email = typeof body.email === 'string' ? body.email : '';
    const password = typeof body.password === 'string' ? body.password : '';
    const result = await identityStore.signIn(email, password);
    if (!result.ok) {
      return Response.json(result.body, { status: result.status });
    }

    return Response.json(result.value, { status: 200 });
  });

  routes.post('/anonymous', async () => {
    const issued = identityStore.issueAnonymous();
    return Response.json(issued, { status: 201 });
  });

  routes.get('/session', (c) => {
    const bearer = parseIdentityBearer(c.req.header('Authorization'), env);
    if (!bearer) {
      return Response.json(
        identityError('unauthorized', 'Missing or invalid bearer session'),
        { status: 401 },
      );
    }

    const session = identityStore.getSession(bearer);
    if (!session) {
      return Response.json(
        identityError('unauthorized', 'Missing or invalid bearer session'),
        { status: 401 },
      );
    }

    return Response.json(session, { status: 200 });
  });

  routes.post('/sign-out', (c) => {
    const bearer = parseIdentityBearer(c.req.header('Authorization'), env);
    if (!bearer) {
      return Response.json(
        identityError('unauthorized', 'Missing or invalid bearer session'),
        { status: 401 },
      );
    }

    identityStore.signOut(bearer);
    return new Response(null, { status: 204 });
  });

  return routes;
}
