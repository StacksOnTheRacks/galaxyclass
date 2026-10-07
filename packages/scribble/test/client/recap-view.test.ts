// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { formatDuration, RecapPanel } from '../../src/client/recap-view.js';
import { wonGame } from '../support/recap-fixtures.js';
import { snapshot } from '../support/snapshots.js';

function rendered(state = wonGame()): HTMLElement {
  const panel = new RecapPanel();
  document.body.replaceChildren(panel.root);
  panel.update(state);
  return panel.root;
}

const text = (root: ParentNode, selector: string) =>
  [...root.querySelectorAll(selector)].map((node) => node.textContent?.replace(/\s+/g, ' ').trim());

describe('after-action report', () => {
  it('stays hidden until the game ends', () => {
    const panel = new RecapPanel();
    panel.update(snapshot({ status: 'playing' }));
    expect(panel.root.hidden).toBe(true);
    panel.update(null);
    expect(panel.root.hidden).toBe(true);
  });

  it('announces the winner with letter tiles and a plain-text headline', () => {
    const root = rendered();
    expect(root.hidden).toBe(false);
    expect(root.getAttribute('aria-labelledby')).toBe('recap-title');
    expect(root.querySelector('h2')!.textContent).toBe('You win!');
    expect(root.querySelector('.recap-detail')!.textContent).toBe('Won by 70 points, 93 to 23.');
    expect(root.querySelector('.recap-reason')!.textContent).toBe('You played your last tile.');
    const tiles = root.querySelector('.tiles.headline')!;
    expect(tiles.getAttribute('aria-hidden')).toBe('true');
    expect(text(tiles, '.tile-letter').join('')).toBe('ALICE');
    expect(text(tiles, '.tile-value')).toEqual(['1', '1', '1', '3', '1']);
  });

  it('ranks the standings with bars sized to the top score and lists who left', () => {
    const root = rendered();
    const rows = root.querySelectorAll<HTMLElement>('.recap-standing');
    expect(rows).toHaveLength(2);
    expect(rows[0]!.classList.contains('winner')).toBe(true);
    expect(rows[0]!.textContent).toContain('1st place');
    expect(rows[0]!.textContent).toContain('Alice (you)');
    expect(rows[0]!.textContent).toContain('+5 from other racks');
    expect(rows[1]!.textContent).toContain('−5 tiles left');
    expect(rows[0]!.style.getPropertyValue('--share')).toBe('1.000');
    expect(rows[1]!.style.getPropertyValue('--share')).toBe('0.247');
    expect(root.querySelector('.recap-bar')!.getAttribute('aria-hidden')).toBe('true');
    expect(root.querySelector('.recap-left')!.textContent).toBe('Left before the end: Cara (66).');
  });

  it('draws the score chart with a text description and a full turn log', () => {
    const root = rendered();
    const chart = root.querySelector('svg.recap-chart')!;
    expect(chart.getAttribute('role')).toBe('img');
    expect(chart.querySelector('desc')!.textContent).toContain('Final scores: Alice 93, Bob 23, Cara 66.');
    expect(chart.querySelectorAll('polyline')).toHaveLength(3);
    expect(text(chart, '.chart-grid text')).toContain('End');
    const log = root.querySelectorAll('.recap-log tbody tr');
    expect(log).toHaveLength(8);
    expect(text(log[2]!, 'td')).toEqual(['3', 'Cara', 'RETAINS · bingo', '+66', '66']);
    expect(text(log[4]!, 'td')).toEqual(['5', 'Bob', 'Swapped 3 tiles', '0', '8']);
    expect(text(log[5]!, 'td')).toEqual(['6', 'Cara', 'Passed (left the table)', '0', '66']);
  });

  it('gives each player a highlights card', () => {
    const root = rendered();
    const cards = root.querySelectorAll('.recap-card');
    expect(cards).toHaveLength(3);
    const alice = cards[0]!.textContent!;
    expect(alice).toContain('1st · 93 points');
    expect(alice).toContain('+48 QUART');
    expect(alice).toContain('2× letter ×1, 3× letter ×1, 2× word ×1');
    expect(alice).toContain('3 plays · 0 passes · 0 swaps');
    expect(alice).toContain('29.3 points');
    expect(cards[2]!.textContent).toContain('Left early · 66 points');
    expect(text(cards[1]!, '.sr-only')).toContain('EXCITING');
  });

  it('shows game stats and notable moments', () => {
    const root = rendered();
    const stats = Object.fromEntries(
      [...root.querySelectorAll('.recap-stats .recap-stat')].map((node) => [node.querySelector('dt')!.textContent, node.querySelector('dd')!.textContent]),
    );
    expect(stats).toEqual({
      Duration: '42 min',
      Turns: '8',
      Rounds: '3',
      'Words formed': '8',
      'Points scored': '182',
      'Tiles played': '20',
      Bingos: '1',
      'Lead changes': '2',
    });
    expect(text(root, '.recap-moments li')).toEqual([
      'Biggest play Cara scored 66 points with RETAINS on turn 3, a bingo.',
      'Best word RETAINS for 66 points by Cara.',
      'Longest word EXCITING, 8 letters, by Bob.',
    ]);
  });

  it('offers a rematch to seated players, a way back to the tables, and a look at the board', () => {
    const root = rendered();
    expect(root.querySelector('[data-action="new-game"]')!.textContent).toBe('Rematch');
    expect(root.querySelector<HTMLAnchorElement>('.recap-link')!.getAttribute('href')).toBe('/scribble');
    const toggle = root.querySelector<HTMLButtonElement>('[data-action="recap-toggle"]')!;
    expect(toggle.textContent).toBe('View board');
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    toggle.click();
    expect(root.dataset.view).toBe('board');
    expect(root.querySelector<HTMLElement>('.recap-body')!.hidden).toBe(true);
    expect(toggle.textContent).toBe('Show report');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');

    const spectator = rendered(wonGame({ you: null }));
    expect(spectator.querySelector('[data-action="new-game"]')).toBeNull();
    expect(spectator.querySelector('.recap-link')).not.toBeNull();
  });

  it('does not redraw for an unchanged result, so scroll and the board view survive', () => {
    const panel = new RecapPanel();
    panel.update(wonGame());
    const hero = panel.root.querySelector('.recap-hero');
    panel.root.querySelector<HTMLButtonElement>('[data-action="recap-toggle"]')!.click();
    panel.update(wonGame({ version: 99 }));
    expect(panel.root.querySelector('.recap-hero')).toBe(hero);
    expect(panel.root.dataset.view).toBe('board');
    panel.update(wonGame({ gameNumber: 2 }));
    expect(panel.root.dataset.view).toBe('report');
  });

  it('handles a tie and an abandoned game', () => {
    const base = wonGame();
    const tie = rendered(
      wonGame({
        endReason: 'scoreless_turns',
        wentOutSeatId: null,
        finalAdjustments: { 1: 0, 2: 0 },
        recap: { ...base.recap!, finalScores: { 1: 50, 2: 50 } },
      }),
    );
    expect(tie.querySelector('h2')!.textContent).toBe('It’s a tie!');
    expect(tie.querySelector('.recap-detail')!.textContent).toBe('You and Bob share the win on 50 points.');
    expect(text(tie, '.tiles.headline .tile-letter').join('')).toBe('TIEGAME');
    expect(tie.querySelectorAll('.recap-standing.winner')).toHaveLength(2);
    expect([...tie.querySelectorAll<HTMLElement>('.recap-standing')].map((row) => row.style.getPropertyValue('--share'))).toEqual(['1.000', '1.000']);
    expect(tie.querySelector('.recap-reason')!.textContent).toBe('Six scoreless turns in a row.');

    const abandoned = rendered(wonGame({ endReason: 'abandoned', finalAdjustments: null, recap: { ...base.recap!, finalScores: { 1: 88 } } }));
    expect(abandoned.querySelector('h2')!.textContent).toBe('Game abandoned');
    expect(abandoned.querySelector('.recap-standing.winner')).toBeNull();
    expect(abandoned.querySelector('.recap-crown')).toBeNull();
  });

  it('falls back to standings alone for a game with no turn history', () => {
    const root = rendered(snapshot({ status: 'ended', endReason: 'scoreless_turns' }));
    expect(root.querySelectorAll('.recap-standing')).toHaveLength(2);
    expect(root.querySelector('.recap-chart')).toBeNull();
    expect(root.querySelector('.recap-cards')).toBeNull();
    expect(root.textContent).toContain('Six scoreless turns in a row.');
  });
});

describe('formatDuration', () => {
  it('reads like a person would say it', () => {
    expect(formatDuration(20_000)).toBe('Under a minute');
    expect(formatDuration(42 * 60_000)).toBe('42 min');
    expect(formatDuration(120 * 60_000)).toBe('2 h');
    expect(formatDuration(65 * 60_000)).toBe('1 h 5 min');
  });
});
