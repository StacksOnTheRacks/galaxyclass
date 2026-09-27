import assert from 'node:assert/strict';
import test from 'node:test';
import { runViewerRequest, type ViewerRequestEvent } from '../lib/cloudfront-canonical-redirect.js';

const TABLE_GUID = '11111111-1111-4111-8111-111111111111';

function event(
  uri: string,
  host: string,
  querystring?: ViewerRequestEvent['request']['querystring'],
): ViewerRequestEvent {
  return {
    request: {
      uri,
      headers: { host: { value: host } },
      querystring: querystring ?? {},
    },
  };
}

function asRequest(result: unknown): { uri: string; statusCode?: number } {
  return result as { uri: string; statusCode?: number };
}

function locationOf(result: unknown): string {
  const response = result as { statusCode: number; headers: { location: { value: string } } };
  assert.equal(response.statusCode, 301);
  return response.headers.location.value;
}

test('www redirects to apex 301 preserving path and query before any rewrite', () => {
  const signIn = locationOf(
    runViewerRequest(
      event('/sign-in', 'www.galaxyclass.app', { next: { value: '/account' } }),
    ),
  );
  assert.equal(signIn, 'https://galaxyclass.app/sign-in?next=/account');

  const riffle = locationOf(
    runViewerRequest(
      event(`/riffle/${TABLE_GUID}`, 'www.galaxyclass.app', { x: { value: '1' } }),
    ),
  );
  assert.equal(riffle, `https://galaxyclass.app/riffle/${TABLE_GUID}?x=1`);
});

test('cloudfront.net hosts are not redirected', () => {
  const result = asRequest(
    runViewerRequest(event('/sign-in', 'd111111abcdef8.cloudfront.net')),
  );
  assert.equal(result.statusCode, undefined);
  assert.equal(result.uri, '/sign-in.html');
});

test('studio extensionless paths rewrite to .html and extensions pass through', () => {
  assert.equal(asRequest(runViewerRequest(event('/sign-in', 'galaxyclass.app'))).uri, '/sign-in.html');
  assert.equal(asRequest(runViewerRequest(event('/', 'galaxyclass.app'))).uri, '/index.html');
  assert.equal(asRequest(runViewerRequest(event('/favicon.ico', 'galaxyclass.app'))).uri, '/favicon.ico');
  assert.equal(
    asRequest(runViewerRequest(event('/assets/app.js', 'galaxyclass.app'))).uri,
    '/assets/app.js',
  );
});

test('extensionless /riffle routes rewrite to /riffle/index.html and files pass through', () => {
  assert.equal(asRequest(runViewerRequest(event('/riffle', 'galaxyclass.app'))).uri, '/riffle/index.html');
  assert.equal(asRequest(runViewerRequest(event('/riffle/', 'galaxyclass.app'))).uri, '/riffle/index.html');
  assert.equal(
    asRequest(runViewerRequest(event(`/riffle/${TABLE_GUID}`, 'galaxyclass.app'))).uri,
    '/riffle/index.html',
  );
  assert.equal(
    asRequest(runViewerRequest(event('/riffle/config.json', 'galaxyclass.app'))).uri,
    '/riffle/config.json',
  );
  assert.equal(
    asRequest(runViewerRequest(event('/riffle/assets/app.js', 'galaxyclass.app'))).uri,
    '/riffle/assets/app.js',
  );
});
