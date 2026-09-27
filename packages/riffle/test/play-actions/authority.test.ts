import { describe, expect, it } from 'vitest';
import { SEAT_CAPABILITY_HEADER } from '../../src/server/table/routes.js';
import { TEST_HOST_API_KEY } from '../helpers/fixtures.js';
import { bearerHeaders, playActionUrl, seedOpenHandFixture } from './helpers.js';

describe('play action authority', () => {
  it('rejects missing bearer with 401', async () => {
    const fixture = seedOpenHandFixture();

    const response = await fixture.app.request(
      playActionUrl(fixture.matchId, fixture.onTurnSeatId),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: { type: 'call' } }),
      },
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'unauthorized' });
  });

  it('rejects other-seat occupant with 403 not_occupant', async () => {
    const fixture = seedOpenHandFixture();

    const response = await fixture.app.request(
      playActionUrl(fixture.matchId, fixture.onTurnSeatId),
      {
        method: 'POST',
        headers: bearerHeaders(fixture.offTurnPlayer.bearer),
        body: JSON.stringify({ action: { type: 'call' } }),
      },
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'not_occupant' });
  });

  it('rejects cookie-only riffle_play', async () => {
    const fixture = seedOpenHandFixture();

    const response = await fixture.app.request(
      playActionUrl(fixture.matchId, fixture.onTurnSeatId),
      {
        method: 'POST',
        headers: {
          Cookie: 'riffle_play=sess-token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: { type: 'call' } }),
      },
    );

    expect(response.status).toBe(401);
  });

  it('rejects host API key bearer', async () => {
    const fixture = seedOpenHandFixture();

    const response = await fixture.app.request(
      playActionUrl(fixture.matchId, fixture.onTurnSeatId),
      {
        method: 'POST',
        headers: bearerHeaders(TEST_HOST_API_KEY),
        body: JSON.stringify({ action: { type: 'call' } }),
      },
    );

    expect(response.status).toBe(401);
  });

  it('rejects JWT-shaped bearer', async () => {
    const fixture = seedOpenHandFixture();

    const response = await fixture.app.request(
      playActionUrl(fixture.matchId, fixture.onTurnSeatId),
      {
        method: 'POST',
        headers: bearerHeaders(
          'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxIn0.sig',
        ),
        body: JSON.stringify({ action: { type: 'call' } }),
      },
    );

    expect(response.status).toBe(401);
  });

  it('ignores X-Riffle-Seat-Capability header', async () => {
    const fixture = seedOpenHandFixture();

    const response = await fixture.app.request(
      playActionUrl(fixture.matchId, fixture.onTurnSeatId),
      {
        method: 'POST',
        headers: {
          [SEAT_CAPABILITY_HEADER]: 'capability-token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: { type: 'call' } }),
      },
    );

    expect(response.status).toBe(401);
  });
});
