import { describe, expect, it } from 'vitest';
import { isActionPayload } from '../../src/server/hands/move-types.js';
import { bearerHeaders, playActionUrl, seedOpenHandFixture } from './helpers.js';

describe('play action routes', () => {
  it('accepts a legal on-turn action and appends an action move', async () => {
    const fixture = seedOpenHandFixture();

    const response = await fixture.app.request(
      playActionUrl(fixture.matchId, fixture.onTurnSeatId),
      {
        method: 'POST',
        headers: bearerHeaders(fixture.onTurnPlayer.bearer),
        body: JSON.stringify({ action: { type: 'call' } }),
      },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');

    const body = await response.json();
    expect(body.matchId).toBe(fixture.matchId);
    expect(body.seatId).toBe(fixture.onTurnSeatId);
    expect(body.hole).toHaveLength(2);
    expect(body.seats).toHaveLength(2);

    const moves = fixture.matchStore.getMoves(fixture.matchId);
    if (!moves.ok) {
      throw new Error('moves failed');
    }
    const actionMoves = moves.value.filter((item) => isActionPayload(item.payload));
    expect(actionMoves).toHaveLength(1);
    expect(actionMoves[0]?.payload).toEqual({
      kind: 'action',
      action: { type: 'call', amount: expect.any(Number) },
    });
  });

  it('rejects off-turn with 409 off_turn', async () => {
    const fixture = seedOpenHandFixture();
    const movesBefore = fixture.matchStore.getMoves(fixture.matchId);

    const response = await fixture.app.request(
      playActionUrl(fixture.matchId, fixture.offTurnSeatId),
      {
        method: 'POST',
        headers: bearerHeaders(fixture.offTurnPlayer.bearer),
        body: JSON.stringify({ action: { type: 'fold' } }),
      },
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'off_turn' });

    const movesAfter = fixture.matchStore.getMoves(fixture.matchId);
    expect(movesAfter).toEqual(movesBefore);
  });

  it('rejects illegal action with 400 illegal_action', async () => {
    const fixture = seedOpenHandFixture();
    const movesBefore = fixture.matchStore.getMoves(fixture.matchId);

    const response = await fixture.app.request(
      playActionUrl(fixture.matchId, fixture.onTurnSeatId),
      {
        method: 'POST',
        headers: bearerHeaders(fixture.onTurnPlayer.bearer),
        body: JSON.stringify({ action: { type: 'bet', amount: 1 } }),
      },
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'illegal_action' });
    expect(fixture.matchStore.getMoves(fixture.matchId)).toEqual(movesBefore);
  });

  it('rejects client-supplied stack in body', async () => {
    const fixture = seedOpenHandFixture();

    const response = await fixture.app.request(
      playActionUrl(fixture.matchId, fixture.onTurnSeatId),
      {
        method: 'POST',
        headers: bearerHeaders(fixture.onTurnPlayer.bearer),
        body: JSON.stringify({ action: { type: 'call' }, stack: 9999 }),
      },
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'invalid_body' });
  });
});
