import { describe, expect, it } from 'vitest';
import { isStreetDealPayload } from '../../src/server/hands/move-types.js';
import {
  bearerHeaders,
  playTableUrl,
  publicPlayTableUrl,
  seedOpenHandFixture,
} from './helpers.js';

async function completePreflop(fixture: ReturnType<typeof seedOpenHandFixture>) {
  const first = await fixture.app.request(
    `/v1/play/matches/${fixture.matchId}/seats/${fixture.onTurnSeatId}/actions`,
    {
      method: 'POST',
      headers: {
        ...bearerHeaders(fixture.onTurnPlayer.bearer),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ action: { type: 'call' } }),
    },
  );
  expect(first.status).toBe(200);

  const second = await fixture.app.request(
    `/v1/play/matches/${fixture.matchId}/seats/${fixture.offTurnSeatId}/actions`,
    {
      method: 'POST',
      headers: {
        ...bearerHeaders(fixture.offTurnPlayer.bearer),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ action: { type: 'check' } }),
    },
  );
  expect(second.status).toBe(200);
}

describe('store street advance', () => {
  it('applyPlayerAction appends street_deal when preflop completes', async () => {
    const fixture = seedOpenHandFixture();
    await completePreflop(fixture);

    const moves = fixture.matchStore.getMoves(fixture.matchId);
    if (!moves.ok) {
      throw new Error('moves failed');
    }
    expect(moves.value.some((item) => isStreetDealPayload(item.payload))).toBe(true);

    const publicState = fixture.matchStore.getPublicState(fixture.matchId);
    if (!publicState.ok) {
      throw new Error('public state failed');
    }
    expect(publicState.value.board).toHaveLength(3);
  });

  it('applyPlayerAction heals preflop completion without a second lock', async () => {
    const fixture = seedOpenHandFixture();
    await completePreflop(fixture);

    const tableA = await fixture.app.request(playTableUrl(fixture.matchId, fixture.seatA), {
      headers: bearerHeaders(fixture.playerA.bearer),
    });
    const tableB = await fixture.app.request(playTableUrl(fixture.matchId, fixture.seatB), {
      headers: bearerHeaders(fixture.playerB.bearer),
    });
    const publicTable = await fixture.app.request(publicPlayTableUrl(fixture.matchId));

    const bodyA = await tableA.json();
    const bodyB = await tableB.json();
    const bodyPublic = await publicTable.json();

    expect(bodyA.board).toHaveLength(3);
    expect(bodyB.board).toEqual(bodyA.board);
    expect(bodyPublic.board).toEqual(bodyA.board);
    expect(bodyA).not.toHaveProperty('holes');
  });

  it('does not advance on river street_complete', async () => {
    const fixture = seedOpenHandFixture();
    const result = fixture.matchStore.advanceStreetIfComplete(fixture.matchId);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error('advance failed');
    }
    expect(result.value.advanced).toBe(false);
  });
});
