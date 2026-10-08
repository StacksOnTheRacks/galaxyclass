// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { viewModel } from '../../src/client/view-model.js';
import { SetupPanel } from '../../src/client/views/setup.js';
import type { TableSnapshot } from '../../src/protocol.js';
import { SUSPECT_IDS } from '../../src/rules/constants.js';
import { setupSnapshot, you } from './support.js';

function setup(state: TableSnapshot) {
  const intents = { chooseSuspect: vi.fn(), ready: vi.fn(), unready: vi.fn(), startGame: vi.fn() };
  const toast = vi.fn();
  const view = new SetupPanel(intents, { shareLink: 'https://galaxyclass.app/whodunit/table-1', copy: async () => true, toast });
  document.body.replaceChildren(view.root);
  const update = (next: TableSnapshot) => view.update(viewModel(next, { serverNow: 5_000, resolving: false }).setup);
  update(state);
  const q = <T extends HTMLElement = HTMLElement>(testid: string) => view.root.querySelector<T>(`[data-testid="${testid}"]`)!;
  return { view, intents, toast, q, update };
}

const withSeat = (patch: (seatId: string) => Partial<TableSnapshot['seats'][number]>) => {
  const base = setupSnapshot();
  return setupSnapshot({ seats: base.seats.map((s) => ({ ...s, ...patch(s.seatId) })) });
};

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('suspect line-up', () => {
  it('shows all six suspects as portraits, marking yours and the ones taken', () => {
    const { q } = setup(setupSnapshot());
    for (const id of SUSPECT_IDS) {
      expect(q(`pick-suspect-${id}`).querySelector('svg.wd-pick-portrait')).not.toBeNull();
    }
    expect(q('pick-suspect-vesper').dataset.state).toBe('mine');
    expect(q('pick-suspect-vesper').getAttribute('aria-pressed')).toBe('true');
    expect(q<HTMLButtonElement>('pick-suspect-finch').disabled).toBe(true);
    expect(q('pick-suspect-finch').getAttribute('aria-label')).toBe('Orson Finch, An astronomer who never looks down, played by Sleuth');
    expect(q<HTMLButtonElement>('pick-suspect-juniper').disabled).toBe(false);
  });

  it('claims a free suspect on click', () => {
    const { q, intents } = setup(setupSnapshot());
    q('pick-suspect-juniper').click();
    expect(intents.chooseSuspect).toHaveBeenCalledWith('juniper');
  });

  it('toggles between Ready and Not ready yet', () => {
    const { q, intents, update } = setup(setupSnapshot());
    q('ready').click();
    expect(intents.ready).toHaveBeenCalled();
    update(withSeat((id) => (id === '1' ? { ready: true } : {})));
    expect(q('unready').textContent).toBe('Not ready yet');
    q('unready').click();
    expect(intents.unready).toHaveBeenCalled();
  });

  it('shows the host Start with the reason it is disabled, and hides it from everyone else', () => {
    const { q, update, intents } = setup(setupSnapshot());
    expect(q('start-game').hidden).toBe(false);
    expect(q<HTMLButtonElement>('start-game').disabled).toBe(true);
    expect(q('start-reason').textContent).toBe('Waiting for 3 detectives to ready up.');
    update(withSeat((id) => ({ ready: ['1', '2', '3'].includes(id) })));
    expect(q<HTMLButtonElement>('start-game').disabled).toBe(false);
    q('start-game').click();
    expect(intents.startGame).toHaveBeenCalled();

    const guest = withSeat((id) => ({ isLocal: id === '2' }));
    update({ ...guest, you: you({ seatId: '2', suspect: 'finch', hand: [] }) });
    expect(q('start-game').hidden).toBe(true);
    expect(q('start-reason').textContent).toBe('Inspector opens the case once everyone is ready.');
  });
});
