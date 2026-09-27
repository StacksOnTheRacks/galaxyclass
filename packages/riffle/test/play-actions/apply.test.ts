import { describe, expect, it, vi } from 'vitest';
import * as rules from '../../src/rules/index.js';
import { isActionPayload } from '../../src/server/hands/move-types.js';
import { bearerHeaders, playActionUrl, seedOpenHandFixture } from './helpers.js';

describe('play action apply path', () => {
  it('runs legalize and applyAction for a legal call', async () => {
    const legalizeSpy = vi.spyOn(rules, 'legalize');
    const applySpy = vi.spyOn(rules, 'applyAction');
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
    expect(legalizeSpy).toHaveBeenCalled();
    expect(applySpy).toHaveBeenCalled();

    const moves = fixture.matchStore.getMoves(fixture.matchId);
    if (!moves.ok) {
      throw new Error('moves failed');
    }
    expect(moves.value.some((item) => isActionPayload(item.payload))).toBe(true);

    legalizeSpy.mockRestore();
    applySpy.mockRestore();
  });

  it('does not take stack or pot from the client body', async () => {
    const fixture = seedOpenHandFixture();
    const stateBefore = fixture.matchStore.getPublicState(fixture.matchId);
    if (!stateBefore.ok) {
      throw new Error('state failed');
    }
    const stacksBefore = stateBefore.value.seats.map((seat) => seat.stack);

    const response = await fixture.app.request(
      playActionUrl(fixture.matchId, fixture.onTurnSeatId),
      {
        method: 'POST',
        headers: bearerHeaders(fixture.onTurnPlayer.bearer),
        body: JSON.stringify({
          action: { type: 'call', pot: 5000, stack: 5000 },
        }),
      },
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'client_supplied_state' });

    const stateAfter = fixture.matchStore.getPublicState(fixture.matchId);
    if (!stateAfter.ok) {
      throw new Error('state failed');
    }
    expect(stateAfter.value.seats.map((seat) => seat.stack)).toEqual(stacksBefore);
  });
});
