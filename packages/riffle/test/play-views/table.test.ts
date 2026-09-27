import { describe, expect, it } from 'vitest';
import {
  bearerHeaders,
  playTableUrl,
  publicPlayTableUrl,
  seedOpenHandFixture,
} from './helpers.js';

describe('GET play seat table', () => {
  it('includes own hole and omits the other seat holes', async () => {
    const fixture = seedOpenHandFixture();

    const response = await fixture.app.request(playTableUrl(fixture.matchId, fixture.seatA), {
      headers: bearerHeaders(fixture.playerA.bearer),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');

    const body = await response.json();
    expect(body.seatId).toBe(fixture.seatA);
    expect(body.hole).toEqual(fixture.holeA);
    expect(body.seats).toHaveLength(2);
    expect(JSON.stringify(body)).not.toContain(fixture.holeB?.[0] ?? '');
  });

  it('public table omits hole fields', async () => {
    const fixture = seedOpenHandFixture();

    const response = await fixture.app.request(publicPlayTableUrl(fixture.matchId));
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.matchId).toBe(fixture.matchId);
    expect(body).not.toHaveProperty('hole');
    expect(body).not.toHaveProperty('view');
    expect(JSON.stringify(body)).not.toContain(fixture.holeA?.[0] ?? '');
    expect(JSON.stringify(body)).not.toContain(fixture.holeB?.[0] ?? '');
  });
});
