import { describe, expect, it } from 'vitest';
import {
  bearerHeaders,
  collectDenylistedKeys,
  playTableUrl,
  publicPlayTableUrl,
  seedOpenHandFixture,
} from './helpers.js';

function assertNoHoleCardsInJson(text: string, cards: readonly (string | undefined)[]): void {
  for (const card of cards) {
    if (card) {
      expect(text).not.toContain(JSON.stringify(card));
    }
  }
}

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
    assertNoHoleCardsInJson(JSON.stringify(body), fixture.holeB ?? []);
  });

  it('public table omits hole fields', async () => {
    const fixture = seedOpenHandFixture();

    const response = await fixture.app.request(publicPlayTableUrl(fixture.matchId));
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.matchId).toBe(fixture.matchId);
    expect(body).not.toHaveProperty('hole');
    expect(body).not.toHaveProperty('view');
    expect(collectDenylistedKeys(body).size).toBe(0);
    assertNoHoleCardsInJson(JSON.stringify(body), [...(fixture.holeA ?? []), ...(fixture.holeB ?? [])]);
  });
});
