import { describe, expect, it } from 'vitest';
import { SEAT_CAPABILITY_HEADER } from '../../src/server/table/routes.js';
import { authHeaders, createTestApp } from '../helpers/test-app.js';
import { TEST_HOST_API_KEY } from '../helpers/fixtures.js';
import {
  bearerHeaders,
  collectDenylistedKeys,
  jsonContainsCardStrings,
  playTableUrl,
  playViewUrl,
  publicPlayTableUrl,
  seedOpenHandFixture,
} from './helpers.js';

describe('play view leak prevention', () => {
  it('rejects host API key, capability header, and cookie-only reads', async () => {
    const fixture = seedOpenHandFixture();

    const hostKeyResponse = await fixture.app.request(
      playViewUrl(fixture.matchId, fixture.seatA),
      { headers: { Authorization: `Bearer ${TEST_HOST_API_KEY}` } },
    );
    expect(hostKeyResponse.status).toBe(401);
    expect(collectDenylistedKeys(await hostKeyResponse.json()).size).toBe(0);

    const capabilityResponse = await fixture.app.request(
      playViewUrl(fixture.matchId, fixture.seatA),
      { headers: { [SEAT_CAPABILITY_HEADER]: 'a'.repeat(64) } },
    );
    expect(capabilityResponse.status).toBe(401);

    const jwtResponse = await fixture.app.request(playViewUrl(fixture.matchId, fixture.seatA), {
      headers: { Authorization: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ4In0.sig' },
    });
    expect(jwtResponse.status).toBe(401);
  });

  it('error bodies omit denylisted hole keys', async () => {
    const fixture = seedOpenHandFixture();

    const crossSeat = await fixture.app.request(playViewUrl(fixture.matchId, fixture.seatB), {
      headers: bearerHeaders(fixture.playerA.bearer),
    });
    expect(crossSeat.status).toBe(403);
    const crossBody = await crossSeat.json();
    expect(collectDenylistedKeys(crossBody).size).toBe(0);
    expect(jsonContainsCardStrings(crossBody)).toBe(false);

    const missingMatch = await fixture.app.request(
      playViewUrl('missing-match', fixture.seatA),
      { headers: bearerHeaders(fixture.playerA.bearer) },
    );
    expect(missingMatch.status).toBe(404);
    expect(collectDenylistedKeys(await missingMatch.json()).size).toBe(0);
  });

  it('public table never includes hole card strings from either seat', async () => {
    const fixture = seedOpenHandFixture();
    const response = await fixture.app.request(publicPlayTableUrl(fixture.matchId));
    const body = await response.json();
    expect(collectDenylistedKeys(body).size).toBe(0);
    const text = JSON.stringify(body);
    for (const card of [...(fixture.holeA ?? []), ...(fixture.holeB ?? [])]) {
      expect(text).not.toContain(JSON.stringify(card));
    }
  });

  it('fails closed when identityStore is not injected', async () => {
    const fixture = seedOpenHandFixture();
    const { app } = createTestApp({ stores: { matchStore: fixture.matchStore } });

    const response = await app.request(playTableUrl(fixture.matchId, fixture.seatA), {
      headers: authHeaders(),
    });
    expect(response.status).toBe(401);
  });
});
