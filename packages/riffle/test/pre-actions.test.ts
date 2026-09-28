// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  renderSeatedControls,
  type SeatAction,
  type SeatedControlsState,
} from '../src/client/dashboard-play/seated-controls.js';
import type { PlayerSnapshotSeat, TableSnapshotMessage } from '../src/runtime/types.js';

function seat(overrides: Partial<PlayerSnapshotSeat> & { seatId: string }): PlayerSnapshotSeat {
  return {
    displayName: overrides.seatId,
    isLocal: false,
    stack: 1000,
    inHand: true,
    committed: 0,
    position: null,
    acting: false,
    folded: false,
    ...overrides,
  };
}

/** Table order: Ana, Ben, You, Cam. */
function snapshot(options: {
  acting: 'ana' | 'ben' | 'you' | 'cam';
  currentBet?: number;
  toCall?: number;
  street?: TableSnapshotMessage['street'];
  handNumber?: number;
  streetActions?: TableSnapshotMessage['streetActions'];
  youFolded?: boolean;
}): TableSnapshotMessage {
  const ids = ['ana', 'ben', 'you', 'cam'] as const;
  return {
    type: 'table_snapshot',
    tableId: 't1',
    version: 1,
    status: 'hand_in_progress',
    createdAt: '2026-09-27T00:00:00.000Z',
    handNumber: options.handNumber ?? 3,
    street: options.street ?? 'flop',
    blindsLabel: '$10 / $20',
    seatedPlayersLabel: '4 / 8',
    pot: 120,
    buttonSeatId: 'cam',
    currentSeatId: options.acting,
    phase: 'betting',
    currentBet: options.currentBet ?? 0,
    toCall: options.toCall ?? 0,
    minRaiseTo: 20,
    bigBlind: 20,
    streetActions: options.streetActions ?? [],
    seats: ids.map((id) =>
      seat({
        seatId: id,
        displayName: id === 'you' ? 'You' : id[0]!.toUpperCase() + id.slice(1),
        isLocal: id === 'you',
        acting: id === options.acting,
        folded: id === 'you' ? (options.youFolded ?? false) : false,
      }),
    ),
  };
}

function setup() {
  const root = document.createElement('main');
  root.dataset.surface = 'dashboard';
  root.dataset.breakpoint = 'desktop';
  const region = document.createElement('section');
  region.dataset.region = 'actions';
  root.append(region);
  document.body.replaceChildren(root);
  const state: SeatedControlsState = { pending: false, notice: null };
  const send = vi.fn<(action: SeatAction) => void>();
  const render = (snap: TableSnapshotMessage) => {
    const local = snap.seats.find((entry) => entry.isLocal)!;
    renderSeatedControls(region, snap, local, state, send);
  };
  return { region, state, send, render };
}

function toggle(region: HTMLElement, id: string): HTMLButtonElement {
  return region.querySelector<HTMLButtonElement>(`[data-pre-action="${id}"]`)!;
}

function labels(region: HTMLElement): string[] {
  return [...region.querySelectorAll<HTMLElement>('.pre-action-label')].map((node) => node.textContent!);
}

describe('waiting pre-actions', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('shows who is acting, your order, and the check-to-you options', () => {
    const { region, render } = setup();
    render(snapshot({ acting: 'ana' }));
    expect(region.querySelector('[data-field="pre-actions-waiting"]')?.textContent).toBe('Waiting · Ana to act');
    expect(region.querySelector('[data-field="pre-actions-order"]')?.textContent).toBe('You act in 2');
    expect(labels(region)).toEqual(['Check / Fold', 'Check', 'Call any']);
    expect(region.querySelector('[data-field="leave-seat"]')).not.toBeNull();
    expect(region.querySelector('[data-field="action-controls"]')).toBeNull();
  });

  it('offers Fold / Call $X / Call any when facing a bet', () => {
    const { region, render } = setup();
    render(snapshot({ acting: 'ben', currentBet: 40, toCall: 40 }));
    expect(labels(region)).toEqual(['Fold', 'Call $40', 'Call any']);
    expect(region.querySelector('[data-field="pre-actions-order"]')?.textContent).toBe('You act in 1');
  });

  it('skips folded seats when counting your order', () => {
    const { region, render } = setup();
    const snap = snapshot({ acting: 'ana' });
    snap.seats[1]!.folded = true;
    render(snap);
    expect(region.querySelector('[data-field="pre-actions-order"]')?.textContent).toBe('You act in 1');
  });

  it('arms a pre-action, then unsets it by toggle, Clear, and Escape', () => {
    const { region, render } = setup();
    render(snapshot({ acting: 'ana' }));

    toggle(region, 'check_fold').click();
    expect(toggle(region, 'check_fold').getAttribute('aria-pressed')).toBe('true');
    expect(region.querySelector('[data-field="pre-action-armed"]')?.textContent).toContain(
      'Check / Fold is set — you’ll check if free, otherwise fold.',
    );

    toggle(region, 'check_fold').click();
    expect(toggle(region, 'check_fold').getAttribute('aria-pressed')).toBe('false');
    expect(region.querySelector('[data-field="pre-action-armed"]')).toBeNull();

    toggle(region, 'check').click();
    region.querySelector<HTMLButtonElement>('[data-field="pre-action-clear"]')!.click();
    expect(toggle(region, 'check').getAttribute('aria-pressed')).toBe('false');

    toggle(region, 'call_any').click();
    toggle(region, 'check').click();
    expect(toggle(region, 'call_any').getAttribute('aria-pressed')).toBe('false');
    expect(toggle(region, 'check').getAttribute('aria-pressed')).toBe('true');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(toggle(region, 'check').getAttribute('aria-pressed')).toBe('false');
  });

  it('keeps the armed choice across snapshots on the same street', () => {
    const { region, render } = setup();
    render(snapshot({ acting: 'ana' }));
    toggle(region, 'check').click();
    render(snapshot({ acting: 'ben' }));
    expect(toggle(region, 'check').getAttribute('aria-pressed')).toBe('true');
  });

  it('clears Check when someone bets and says why', () => {
    const { region, render } = setup();
    render(snapshot({ acting: 'ana' }));
    toggle(region, 'check').click();
    render(
      snapshot({
        acting: 'ben',
        currentBet: 60,
        toCall: 60,
        streetActions: [{ seatId: 'ana', displayName: 'Ana', type: 'bet', amount: 60 }],
      }),
    );
    expect(region.querySelector('[data-pre-action][aria-pressed="true"]')).toBeNull();
    expect(region.querySelector('[data-field="pre-action-cleared"]')?.textContent).toBe(
      'Ana bet $60 — your “Check” pre-action was cleared.',
    );

    toggle(region, 'call').click();
    expect(region.querySelector('[data-field="pre-action-cleared"]')).toBeNull();
  });

  it('clears Call $X on a raise but keeps Call any and Fold', () => {
    const { region, render } = setup();
    const facing = snapshot({ acting: 'ben', currentBet: 40, toCall: 40 });
    const raised = snapshot({
      acting: 'ben',
      currentBet: 120,
      toCall: 120,
      streetActions: [{ seatId: 'ana', displayName: 'Ana', type: 'raise', amount: 120 }],
    });

    render(facing);
    toggle(region, 'call').click();
    render(raised);
    expect(region.querySelector('[data-field="pre-action-cleared"]')?.textContent).toBe(
      'Ana raised to $120 — your “Call $40” pre-action was cleared.',
    );

    const other = setup();
    other.render(facing);
    toggle(other.region, 'call_any').click();
    other.render(raised);
    expect(toggle(other.region, 'call_any').getAttribute('aria-pressed')).toBe('true');
  });

  it('starts clean on a new street', () => {
    const { region, render } = setup();
    render(snapshot({ acting: 'ana' }));
    toggle(region, 'check_fold').click();
    render(snapshot({ acting: 'ana', street: 'turn' }));
    expect(region.querySelector('[data-pre-action][aria-pressed="true"]')).toBeNull();
  });

  it('hides pre-actions once you have folded', () => {
    const { region, render } = setup();
    render(snapshot({ acting: 'ana', youFolded: true }));
    expect(region.querySelector('[data-field="pre-actions"]')).toBeNull();
  });

  describe('auto-fire on your turn', () => {
    it.each([
      ['check_fold', 0, { action: 'check' }],
      ['check_fold', 40, { action: 'fold' }],
      ['check', 0, { action: 'check' }],
      ['call_any', 0, { action: 'check' }],
      ['call_any', 80, { action: 'call' }],
    ] as const)('%s with $%i to call sends %o', (id, toCall, expected) => {
      const { region, render, send } = setup();
      render(snapshot({ acting: 'ana' }));
      toggle(region, id).click();
      render(snapshot({ acting: 'you', currentBet: toCall, toCall }));
      expect(send).toHaveBeenCalledTimes(1);
      expect(send).toHaveBeenCalledWith(expected);
    });

    it('calls the armed amount when it has not changed', () => {
      const { region, render, send } = setup();
      render(snapshot({ acting: 'ben', currentBet: 40, toCall: 40 }));
      toggle(region, 'call').click();
      render(snapshot({ acting: 'you', currentBet: 40, toCall: 40 }));
      expect(send).toHaveBeenCalledWith({ action: 'call' });
    });

    it('does nothing without an armed choice and shows your-turn controls', () => {
      const { region, render, send } = setup();
      render(snapshot({ acting: 'ana' }));
      render(snapshot({ acting: 'you' }));
      expect(send).not.toHaveBeenCalled();
      expect(region.querySelector('[data-field="action-controls"]')).not.toBeNull();
    });

    it('fires once, then leaves the next spot on the street unarmed', () => {
      const { region, render, send, state } = setup();
      render(snapshot({ acting: 'ana' }));
      toggle(region, 'call_any').click();
      render(snapshot({ acting: 'you' }));
      state.pending = false;
      render(snapshot({ acting: 'you' }));
      expect(send).toHaveBeenCalledTimes(1);
    });
  });
});
