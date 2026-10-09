// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ManorAudio } from '../../src/client/audio.js';
import { eventSchedule } from '../../src/client/fx/timeline.js';
import { namesFor } from '../../src/client/narrate.js';
import { noteRows } from '../../src/client/notes.js';
import { viewModel } from '../../src/client/view-model.js';
import { TableView, type TableIntents } from '../../src/client/views/table-view.js';
import type { TableSnapshot } from '../../src/protocol.js';
import { eventMessage, setupSnapshot, snapshot } from './support.js';

function table() {
  const host = document.createElement('div');
  document.body.replaceChildren(host);
  const intents = new Proxy({}, { get: () => vi.fn() }) as TableIntents;
  const view = new TableView(host, intents, { audio: new ManorAudio(null, null), reducedMotion: () => false, shareLink: 'https://x/whodunit/t', copy: async () => true });
  const render = (state: TableSnapshot | null) =>
    view.render(viewModel(state, { serverNow: 5_000, resolving: false }), state, state?.you ? noteRows(state, {}) : [], namesFor(state?.seats ?? [], state?.you?.seatId ?? null));
  return { view, host, render };
}

beforeEach(() => {
  vi.useFakeTimers();
});

describe('table screen', () => {
  it('shows the line-up before the case, then the board and panel during it, then the end screen', () => {
    const { view, host, render } = table();
    render(null);
    expect(host.querySelector('.wd-app')?.getAttribute('data-screen')).toBe('connecting');
    expect(host.querySelector('[data-testid="board"]')).toBeNull();

    render(setupSnapshot());
    expect(host.querySelector<HTMLElement>('[data-testid="setup"]')!.hidden).toBe(false);
    expect(host.querySelector<HTMLElement>('[data-testid="panel"]')!.hidden).toBe(true);
    expect(host.querySelector('[data-testid="board"]')).not.toBeNull();

    render(snapshot());
    expect(host.querySelector<HTMLElement>('[data-testid="setup"]')!.hidden).toBe(true);
    expect(host.querySelector<HTMLElement>('[data-testid="panel"]')!.hidden).toBe(false);
    expect(host.querySelector('[data-testid="status"]')?.textContent).toBe('Your turn — roll the dice');

    const roll = eventMessage({ kind: 'rolled', seatId: '1', dice: [2, 5], animationMs: 1400 });
    view.playEvent(roll, eventSchedule(roll.event, { reduced: false }), 0, snapshot(), namesFor(snapshot().seats, '1'));
    vi.advanceTimersByTime(1500);
    expect(host.querySelector('.sr-only')?.textContent).toBe('You rolled 2 and 5: 7.');

    render(snapshot({ status: 'finished', winnerSeatId: '1', endReason: 'solved', solution: { suspect: 'duarte', weapon: 'bust', room: 'foyer' } }));
    vi.advanceTimersByTime(500);
    const end = host.querySelector<HTMLElement>('[data-testid="end-dialog"]')!;
    expect(end.hidden).toBe(false);
    expect(end.querySelector('.wd-end-title')?.textContent).toBe('Case solved!');
    expect(end.querySelector('.wd-end-solution-line')?.textContent).toBe('It was Chef Duarte with the Marble Bust in the Grand Foyer.');
    expect(end.querySelector<HTMLElement>('[data-testid="new-case"]')!.hidden).toBe(false);
    view.stopFx();
  });

  it('lays out your controls, the board, and the notepad side by side, in that order', () => {
    const { host, render } = table();
    render(snapshot());
    const theater = host.querySelector('.wd-theater')!;
    const columns = [...theater.children].filter((child) => !(child as HTMLElement).hidden).map((child) => child.className);
    expect(columns).toEqual(['wd-panel', 'wd-surface', 'wd-notes']);
    expect(host.querySelector<HTMLElement>('[data-testid="notes"]')!.querySelector('[data-testid="notepad"]')).not.toBeNull();
  });

  it('puts the card you were shown up large, then tucks it away', () => {
    const { view, host, render } = table();
    const names = namesFor(snapshot().seats, '1');
    render(snapshot());
    const shown = host.querySelector<HTMLElement>('[data-testid="shown-card"]')!;
    expect(shown.hidden).toBe(true);

    const refuted = eventMessage({ kind: 'refuted', suggesterSeatId: '1', refuterSeatId: '2', card: 'juniper' });
    view.playEvent(refuted, eventSchedule(refuted.event, { reduced: false }), 0, snapshot(), names);
    expect(shown.hidden).toBe(false);
    expect(shown.querySelector('.wd-shown-kicker')?.textContent).toBe('Sleuth shows you');
    expect(shown.querySelector('.wd-card-name')?.textContent).toBe('Juniper Lark');
    expect(shown.querySelector('.wd-shown-chip [data-suspect="finch"]')).not.toBeNull();
    // The popup replaces the suggester's banner rather than doubling it.
    expect(host.querySelector('.wd-banner')).toBeNull();

    // Folding the same event into the log does not put it up a second time.
    shown.querySelector<HTMLButtonElement>('[data-testid="shown-card-dismiss"]')!.click();
    expect(shown.hidden).toBe(true);
    render(snapshot({ log: [refuted.event] }));
    expect(shown.hidden).toBe(true);

    const again = eventMessage({ kind: 'refuted', suggesterSeatId: '1', refuterSeatId: '3', card: 'bust' });
    view.playEvent(again, eventSchedule(again.event, { reduced: false }), 0, snapshot(), names);
    expect(shown.hidden).toBe(false);
    vi.advanceTimersByTime(6100);
    expect(shown.hidden).toBe(true);
    view.stopFx();
  });

  it('shows the card only to the detective it was shown to', () => {
    const { view, host, render } = table();
    render(snapshot());
    const shown = host.querySelector<HTMLElement>('[data-testid="shown-card"]')!;
    const mine = eventMessage({ kind: 'refuted', suggesterSeatId: '2', refuterSeatId: '1', card: 'rook' });
    view.playEvent(mine, eventSchedule(mine.event, { reduced: false }), 0, snapshot(), namesFor(snapshot().seats, '1'));
    expect(shown.hidden).toBe(true);
    const theirs = eventMessage({ kind: 'refuted', suggesterSeatId: '2', refuterSeatId: '3' });
    view.playEvent(theirs, eventSchedule(theirs.event, { reduced: false }), 0, snapshot(), namesFor(snapshot().seats, '1'));
    expect(shown.hidden).toBe(true);
    view.stopFx();
  });

  it('still shows a card that arrived while the tab was away, while it is the latest news', () => {
    const { host, render } = table();
    const refuted = eventMessage({ kind: 'refuted', suggesterSeatId: '1', refuterSeatId: '2', card: 'juniper' }).event;
    render(snapshot({ log: [refuted] }));
    const shown = host.querySelector<HTMLElement>('[data-testid="shown-card"]')!;
    expect(shown.hidden).toBe(false);
    expect(shown.querySelector('.wd-card-name')?.textContent).toBe('Juniper Lark');
  });

  it('shows a notice, and no board, to a member at a locked table', () => {
    const { host, render } = table();
    const base = snapshot();
    render(snapshot({ you: null, positions: null, weapons: null, seats: base.seats.map((s) => ({ ...s, isLocal: false })) }));
    expect(host.querySelector('.wd-notice h2')?.textContent).toBe('A case is under way — seats are locked');
    expect(host.querySelector('[data-testid="board"]')).toBeNull();
  });
});
