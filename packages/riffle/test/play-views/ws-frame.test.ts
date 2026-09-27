import { describe, expect, it, vi } from 'vitest';
import { createWsHub } from '../../src/ws/hub.js';
import { bearerHeaders, playActionUrl, seedOpenHandFixture } from '../play-actions/helpers.js';

describe('public WS frames after street advance', () => {
  it('emits cursor-only table.refresh frames', async () => {
    const wsHub = createWsHub();
    const emitted: unknown[] = [];
    const originalNotify = wsHub.notifyPublicTable.bind(wsHub);
    vi.spyOn(wsHub, 'notifyPublicTable').mockImplementation((matchId) => {
      const cursor = originalNotify(matchId);
      emitted.push({ type: 'table.refresh', matchId, cursor });
      return cursor;
    });

    const fixture = seedOpenHandFixture({ wsHub });

    const call = await fixture.app.request(
      playActionUrl(fixture.matchId, fixture.onTurnSeatId),
      {
        method: 'POST',
        headers: {
          ...bearerHeaders(fixture.onTurnPlayer.bearer),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: { type: 'call' } }),
      },
    );
    expect(call.status).toBe(200);

    expect(emitted.length).toBeGreaterThan(0);
    for (const frame of emitted) {
      expect(frame).toEqual({
        type: 'table.refresh',
        matchId: fixture.matchId,
        cursor: expect.any(Number),
      });
      expect(JSON.stringify(frame)).not.toMatch(/hole|hiddenView|board/);
    }
  });
});
