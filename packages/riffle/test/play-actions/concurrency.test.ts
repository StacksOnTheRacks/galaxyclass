import { describe, expect, it } from 'vitest';
import { isActionPayload } from '../../src/server/hands/move-types.js';
import { bearerHeaders, playActionUrl, seedOpenHandFixture } from './helpers.js';

describe('play action concurrency', () => {
  it('returns 409 illegal_turn for overlapping writes and only the winner persists', async () => {
    const fixture = seedOpenHandFixture();
    const hold = fixture.matchStore.holdWrite(fixture.matchId);
    expect(hold.ok).toBe(true);
    if (!hold.ok) {
      return;
    }

    const movesBefore = fixture.matchStore.getMoves(fixture.matchId);
    if (!movesBefore.ok) {
      throw new Error('moves failed');
    }

    const loser = await fixture.app.request(
      playActionUrl(fixture.matchId, fixture.onTurnSeatId),
      {
        method: 'POST',
        headers: bearerHeaders(fixture.onTurnPlayer.bearer),
        body: JSON.stringify({ action: { type: 'call' } }),
      },
    );

    expect(loser.status).toBe(409);
    expect(await loser.json()).toEqual({ error: 'illegal_turn' });

    const movesAfterLoser = fixture.matchStore.getMoves(fixture.matchId);
    expect(movesAfterLoser).toEqual(movesBefore);

    hold.value.release();

    const winner = await fixture.app.request(
      playActionUrl(fixture.matchId, fixture.onTurnSeatId),
      {
        method: 'POST',
        headers: bearerHeaders(fixture.onTurnPlayer.bearer),
        body: JSON.stringify({ action: { type: 'call' } }),
      },
    );

    expect(winner.status).toBe(200);

    const movesAfter = fixture.matchStore.getMoves(fixture.matchId);
    if (!movesAfter.ok) {
      throw new Error('moves failed');
    }
    expect(movesAfter.value.filter((item) => isActionPayload(item.payload))).toHaveLength(1);
  });
});
