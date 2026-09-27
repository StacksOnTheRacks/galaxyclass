import { describe, expect, it } from 'vitest';
import {
  bearerHeaders,
  collectDenylistedKeys,
  playViewUrl,
  seedOpenHandFixture,
} from './helpers.js';

describe('GET play seat view', () => {
  it('returns own hole cards with Cache-Control no-store after openHand', async () => {
    const fixture = seedOpenHandFixture();

    const response = await fixture.app.request(playViewUrl(fixture.matchId, fixture.seatA), {
      headers: bearerHeaders(fixture.playerA.bearer),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');

    const body = await response.json();
    expect(body.seatId).toBe(fixture.seatA);
    expect(body.view.hole).toHaveLength(2);
    expect(body.view.hole).toEqual(fixture.holeA);
    expect(body.view.hole).not.toContain(fixture.holeB?.[0] ?? '');
    expect(body.view.hole).not.toContain(fixture.holeB?.[1] ?? '');
  });

  it('returns the other occupant only their holes', async () => {
    const fixture = seedOpenHandFixture();

    const response = await fixture.app.request(playViewUrl(fixture.matchId, fixture.seatB), {
      headers: bearerHeaders(fixture.playerB.bearer),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.view.hole).toEqual(fixture.holeB);
    expect(body.view.hole).not.toContain(fixture.holeA?.[0] ?? '');
    expect(body.view.hole).not.toContain(fixture.holeA?.[1] ?? '');
  });
});

describe('GET play seat view authority', () => {
  it('rejects cross-seat bearer with not_occupant and no hole keys', async () => {
    const fixture = seedOpenHandFixture();

    const response = await fixture.app.request(playViewUrl(fixture.matchId, fixture.seatB), {
      headers: bearerHeaders(fixture.playerA.bearer),
    });

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body).toEqual({ error: 'not_occupant' });
    expect(collectDenylistedKeys(body).size).toBe(0);
  });

  it('rejects missing bearer', async () => {
    const fixture = seedOpenHandFixture();

    const response = await fixture.app.request(playViewUrl(fixture.matchId, fixture.seatA));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'unauthorized' });
  });
});
