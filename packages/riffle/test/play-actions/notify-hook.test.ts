import { describe, expect, it, vi } from 'vitest';
import { createWsHub } from '../../src/ws/hub.js';
import { bearerHeaders, playActionUrl, seedOpenHandFixture } from './helpers.js';

describe('play action notify hook', () => {
  it('calls notifyPublicTable after HTTP 200 when hub is injected', async () => {
    const wsHub = createWsHub();
    const notifySpy = vi.spyOn(wsHub, 'notifyPublicTable');
    const fixture = seedOpenHandFixture({ wsHub });

    const response = await fixture.app.request(
      playActionUrl(fixture.matchId, fixture.onTurnSeatId),
      {
        method: 'POST',
        headers: bearerHeaders(fixture.onTurnPlayer.bearer),
        body: JSON.stringify({ action: { type: 'call' } }),
      },
    );

    expect(response.status).toBe(200);
    expect(notifySpy).toHaveBeenCalledWith(fixture.matchId);
  });

  it('does not notify on reject', async () => {
    const wsHub = createWsHub();
    const notifySpy = vi.spyOn(wsHub, 'notifyPublicTable');
    const fixture = seedOpenHandFixture({ wsHub });

    const response = await fixture.app.request(
      playActionUrl(fixture.matchId, fixture.offTurnSeatId),
      {
        method: 'POST',
        headers: bearerHeaders(fixture.offTurnPlayer.bearer),
        body: JSON.stringify({ action: { type: 'fold' } }),
      },
    );

    expect(response.status).toBe(409);
    expect(notifySpy).not.toHaveBeenCalled();
  });

  it('still returns 200 when notify throws', async () => {
    const wsHub = createWsHub();
    vi.spyOn(wsHub, 'notifyPublicTable').mockImplementation(() => {
      throw new Error('notify failed');
    });
    const fixture = seedOpenHandFixture({ wsHub });

    const response = await fixture.app.request(
      playActionUrl(fixture.matchId, fixture.onTurnSeatId),
      {
        method: 'POST',
        headers: bearerHeaders(fixture.onTurnPlayer.bearer),
        body: JSON.stringify({ action: { type: 'call' } }),
      },
    );

    expect(response.status).toBe(200);
  });
});
