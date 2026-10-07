import { avatarUrl } from '@galaxyclass/accounts/avatars';
import type { TurnRecord } from '../rules/game.js';
import { LETTER_VALUES } from '../rules/tiles.js';
import type { Premium } from '../rules/types.js';
import type { TableSnapshot } from '../runtime/types.js';
import { buildReport, type GameReport, type PlayerReport } from './recap.js';
import { publicBase } from './route.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
/** One per seat, picked to read on every theme's dark panel. */
const PLAYER_COLORS = ['#34e4ea', '#ff6aa8', '#92f070', '#ffb830'] as const;
const HEADLINE_TILES = 10;
const WORD_TILES = 9;
const PREMIUM_LABEL: Record<Premium, string> = { DL: '2× letter', TL: '3× letter', DW: '2× word', TW: '3× word' };
const REASONS = {
  played_out: 'A player used their last tile.',
  scoreless_turns: 'Six scoreless turns in a row.',
  abandoned: 'Too few players stayed to finish.',
} as const;

type Child = Node | string | null | false;

function html<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === 'class') {
      node.className = value;
    } else {
      node.setAttribute(key, value);
    }
  }
  node.append(...children.filter((child): child is Node | string => child !== null && child !== false));
  return node;
}

function svg(tag: string, attrs: Record<string, string | number> = {}, ...children: Array<Node | string>): SVGElement {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) {
    node.setAttribute(key, String(value));
  }
  node.append(...children);
  return node;
}

export function playerColor(seatId: string): string {
  const index = (Number(seatId) - 1) % PLAYER_COLORS.length;
  return PLAYER_COLORS[Number.isInteger(index) && index >= 0 ? index : 0]!;
}

const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;
const points = (count: number) => plural(count, 'point');
const signed = (value: number) => (value > 0 ? `+${value}` : value < 0 ? `−${Math.abs(value)}` : '0');

export function formatDuration(ms: number): string {
  const minutes = Math.round(ms / 60_000);
  if (minutes < 1) {
    return 'Under a minute';
  }
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

function ordinal(rank: number): string {
  const tens = rank % 100;
  const suffix = tens >= 11 && tens <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][rank % 10] ?? 'th');
  return `${rank}${suffix}`;
}

function nameList(names: string[]): string {
  return names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}

function displayName(player: PlayerReport): string {
  return player.isLocal ? 'You' : player.name;
}

/** A row of letter tiles. Decorative: callers always put the same text next to it for assistive tech. */
function tileRow(text: string, className: string): HTMLElement {
  const row = html('span', { class: className, 'aria-hidden': 'true' });
  [...text.toUpperCase()].forEach((char, index) => {
    if (char === ' ') {
      row.append(html('span', { class: 'tile-gap' }));
      return;
    }
    const value = LETTER_VALUES[char];
    const tile = html('span', { class: 'tile', style: `--i: ${index}` }, html('span', { class: 'tile-letter' }, char));
    if (value !== undefined) {
      tile.append(html('span', { class: 'tile-value' }, String(value)));
    }
    row.append(tile);
  });
  return row;
}

function wordTiles(text: string): HTMLElement {
  return html(
    'span',
    { class: 'recap-word' },
    text.length <= WORD_TILES ? tileRow(text, 'tiles mini') : html('span', { class: 'recap-word-text', 'aria-hidden': 'true' }, text),
    html('span', { class: 'sr-only' }, text),
  );
}

function headlineTiles(report: GameReport): string {
  if (report.outcome === 'tie') {
    return 'TIE GAME';
  }
  if (report.outcome === 'win') {
    const name = report.winners[0]!.name.toUpperCase().replace(/[^A-Z0-9 ]/g, '').trim();
    return name.length > 0 && name.length <= HEADLINE_TILES ? name : 'WINNER';
  }
  return 'GAME OVER';
}

function hero(report: GameReport): HTMLElement {
  const winners = report.winners;
  let title = 'Game over';
  let detail = '';
  if (report.outcome === 'win') {
    const winner = winners[0]!;
    title = winner.isLocal ? 'You win!' : `${winner.name} wins!`;
    const runnerUp = report.players.find((player) => player.finished && player.rank !== 1);
    detail =
      report.margin !== null && runnerUp
        ? `Won by ${points(report.margin)}, ${winner.score} to ${runnerUp.score}.`
        : `Finished on ${points(winner.score)}.`;
  } else if (report.outcome === 'tie') {
    title = 'It’s a tie!';
    detail = `${nameList(winners.map(displayName))} share the win on ${points(winners[0]!.score)}.`;
  } else if (report.outcome === 'abandoned') {
    title = 'Game abandoned';
    const leader = report.players.find((player) => player.finished);
    detail = leader ? `${displayName(leader)} ${leader.isLocal ? 'were' : 'was'} still at the table with ${points(leader.score)}.` : '';
  }
  const wentOut = report.players.find((player) => player.wentOut);
  const reason =
    report.endReason === 'played_out' && wentOut
      ? `${displayName(wentOut)} played ${wentOut.isLocal ? 'your' : 'their'} last tile.`
      : report.endReason
        ? REASONS[report.endReason]
        : '';
  return html(
    'header',
    { class: 'recap-hero', 'data-outcome': report.outcome, 'aria-live': 'polite' },
    html('p', { class: 'recap-kicker' }, 'Game over · After-action report'),
    tileRow(headlineTiles(report), 'tiles headline'),
    html('h2', { id: 'recap-title' }, title),
    detail ? html('p', { class: 'recap-detail' }, detail) : null,
    reason ? html('p', { class: 'recap-reason' }, reason) : null,
  );
}

function avatar(player: PlayerReport, size: number): HTMLImageElement {
  return html('img', {
    class: 'avatar',
    src: avatarUrl(player.avatarId),
    alt: '',
    width: String(size),
    height: String(size),
    loading: 'lazy',
  });
}

function nameLabel(player: PlayerReport): HTMLElement {
  return html('span', { class: 'recap-name' }, player.name, player.isLocal ? html('span', { class: 'you' }, ' (you)') : null);
}

function crown(): SVGElement {
  return svg(
    'svg',
    { class: 'recap-crown', viewBox: '0 0 24 24', 'aria-hidden': 'true', width: 18, height: 18 },
    svg('path', { d: 'M3 18h18l-1.5-10-4.5 4-3-6-3 6-4.5-4L3 18z', fill: 'currentColor' }),
  );
}

function adjustmentNote(player: PlayerReport): string {
  if (player.adjustment === 0) {
    return '';
  }
  return player.adjustment > 0 ? `${signed(player.adjustment)} from other racks` : `${signed(player.adjustment)} tiles left`;
}

function standings(report: GameReport): HTMLElement {
  const finishers = report.players.filter((player) => player.finished);
  const departed = report.players.filter((player) => !player.finished);
  const top = Math.max(1, ...finishers.map((player) => player.score));
  const rows = finishers.map((player) => {
    const winner = report.winners.includes(player);
    const share = Math.max(0, player.score) / top;
    return html(
      'li',
      { class: `recap-standing${winner ? ' winner' : ''}`, style: `--player: ${playerColor(player.seatId)}; --share: ${share.toFixed(3)}` },
      html('span', { class: 'recap-rank tile', 'aria-hidden': 'true' }, String(player.rank)),
      html('span', { class: 'sr-only' }, `${ordinal(player.rank!)} place: `),
      avatar(player, 40),
      html(
        'span',
        { class: 'recap-standing-body' },
        html(
          'span',
          { class: 'recap-standing-name' },
          nameLabel(player),
          winner ? crown() : null,
          player.wentOut ? html('span', { class: 'badge' }, 'Went out') : null,
          html('small', { class: 'recap-adjust' }, adjustmentNote(player)),
        ),
        html('span', { class: 'recap-bar', 'aria-hidden': 'true' }, html('span', { class: 'recap-bar-fill' })),
      ),
      html('strong', { class: 'recap-standing-score' }, String(player.score)),
    );
  });
  return html(
    'section',
    { class: 'recap-section', 'aria-labelledby': 'recap-standings-title' },
    html('h3', { id: 'recap-standings-title' }, 'Final standings'),
    html('ol', { class: 'recap-standings' }, ...rows),
    departed.length > 0
      ? html(
          'p',
          { class: 'recap-left' },
          `Left before the end: ${departed.map((player) => `${player.name} (${player.score})`).join(', ')}.`,
        )
      : null,
  );
}

function niceStep(span: number): number {
  const raw = Math.max(1, span) / 4;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const scaled = raw / magnitude;
  return (scaled <= 1 ? 1 : scaled <= 2 ? 2 : scaled <= 5 ? 5 : 10) * magnitude;
}

function describeTurn(turn: TurnRecord): string {
  switch (turn.kind) {
    case 'play':
      return `${turn.words.map((word) => word.text).join(', ')}${turn.bingo ? ' · bingo' : ''}`;
    case 'exchange':
      return `Swapped ${plural(turn.exchanged, 'tile')}`;
    case 'auto_pass':
      return 'Passed (left the table)';
    default:
      return 'Passed';
  }
}

function scoreChart(report: GameReport): HTMLElement | null {
  if (report.history.length === 0) {
    return null;
  }
  const width = 640;
  const height = 260;
  const pad = { left: 44, right: 18, top: 14, bottom: 34 };
  const xMax = Math.max(1, report.settled ? report.lastTurn + 1 : report.lastTurn);
  const scores = report.series.flatMap((series) => series.points.map((point) => point.score));
  const step = niceStep(Math.max(...scores) - Math.min(0, ...scores));
  const yMin = Math.floor(Math.min(0, ...scores) / step) * step;
  const yMax = Math.max(step, Math.ceil(Math.max(...scores) / step) * step);
  const x = (turn: number) => pad.left + (turn / xMax) * (width - pad.left - pad.right);
  const y = (score: number) => pad.top + ((yMax - score) / (yMax - yMin)) * (height - pad.top - pad.bottom);

  const grid = svg('g', { class: 'chart-grid' });
  for (let value = yMin; value <= yMax; value += step) {
    grid.append(
      svg('line', { x1: pad.left, x2: width - pad.right, y1: y(value), y2: y(value) }),
      svg('text', { x: pad.left - 8, y: y(value) + 4, 'text-anchor': 'end' }, String(value)),
    );
  }
  const turnStep = Math.max(1, Math.ceil(report.lastTurn / 8));
  for (let turn = turnStep; turn <= report.lastTurn; turn += turnStep) {
    grid.append(svg('text', { x: x(turn), y: height - 12, 'text-anchor': 'middle' }, String(turn)));
  }
  if (report.settled) {
    grid.append(svg('text', { x: x(xMax), y: height - 12, 'text-anchor': 'middle' }, 'End'));
  }
  grid.append(svg('text', { class: 'chart-axis', x: pad.left, y: height - 12, 'text-anchor': 'start' }, 'Turn'));

  const winners = new Set(report.winners.map((player) => player.seatId));
  const ordered = [...report.series].sort((a, b) => Number(winners.has(a.seatId)) - Number(winners.has(b.seatId)));
  const lines = svg('g', { class: 'chart-lines' });
  for (const series of ordered) {
    const color = playerColor(series.seatId);
    const coords = series.points.map((point) => `${x(point.turn).toFixed(1)},${y(point.score).toFixed(1)}`).join(' ');
    const last = series.points.at(-1)!;
    lines.append(
      svg('polyline', { points: coords, stroke: color, class: winners.has(series.seatId) ? 'lead' : '', pathLength: 1 }),
      svg('circle', { cx: x(last.turn), cy: y(last.score), r: 5, fill: color }),
    );
  }

  const byId = new Map(report.players.map((player) => [player.seatId, player]));
  const summary = report.players.map((player) => `${player.name} ${player.score}`).join(', ');
  const chart = svg(
    'svg',
    { class: 'recap-chart', viewBox: `0 0 ${width} ${height}`, role: 'img', 'aria-labelledby': 'recap-chart-title recap-chart-desc' },
    svg('title', { id: 'recap-chart-title' }, 'Score after each turn'),
    svg('desc', { id: 'recap-chart-desc' }, `Final scores: ${summary}. The lead changed ${plural(report.leadChanges, 'time')}. The turn log below lists every turn.`),
    grid,
    lines,
  );
  const legend = html(
    'ul',
    { class: 'recap-legend', 'aria-hidden': 'true' },
    ...report.players.map((player) =>
      html('li', { style: `--player: ${playerColor(player.seatId)}` }, html('span', { class: 'swatch' }), player.name),
    ),
  );

  const rows = report.history.map((turn) =>
    html(
      'tr',
      {},
      html('td', {}, String(turn.turnNumber)),
      html('td', {}, byId.get(turn.seatId)?.name ?? `Seat ${turn.seatId}`),
      html('td', {}, describeTurn(turn)),
      html('td', { class: 'num' }, turn.kind === 'play' ? `+${turn.total}` : '0'),
      html('td', { class: 'num' }, String(turn.score)),
    ),
  );
  const log = html(
    'details',
    { class: 'recap-log' },
    html('summary', {}, 'Turn-by-turn log'),
    html(
      'div',
      { class: 'recap-log-scroll' },
      html(
        'table',
        {},
        html('caption', { class: 'sr-only' }, 'Every turn, with the points it scored and the player’s running score'),
        html(
          'thead',
          {},
          html(
            'tr',
            {},
            html('th', { scope: 'col' }, 'Turn'),
            html('th', { scope: 'col' }, 'Player'),
            html('th', { scope: 'col' }, 'Move'),
            html('th', { scope: 'col', class: 'num' }, 'Points'),
            html('th', { scope: 'col', class: 'num' }, 'Score'),
          ),
        ),
        html('tbody', {}, ...rows),
      ),
    ),
  );

  return html(
    'section',
    { class: 'recap-section', 'aria-labelledby': 'recap-chart-heading' },
    html('h3', { id: 'recap-chart-heading' }, 'Score over time'),
    html('figure', { class: 'recap-figure' }, chart, legend),
    log,
  );
}

function stat(label: string, value: Node | string): HTMLElement {
  return html('div', { class: 'recap-stat' }, html('dt', {}, label), html('dd', {}, value));
}

function premiumSummary(player: PlayerReport): Node | string {
  const used = (Object.keys(PREMIUM_LABEL) as Premium[]).filter((premium) => player.premiums[premium] > 0);
  if (used.length === 0) {
    return 'None';
  }
  const list = html('span');
  used.forEach((premium, index) => {
    list.append(index > 0 ? ', ' : '', html('span', { class: 'nowrap' }, `${PREMIUM_LABEL[premium]} ×${player.premiums[premium]}`));
  });
  return list;
}

function wordStat(mark: { text: string; score: number } | null): Node | string {
  return mark ? html('span', { class: 'recap-word-stat' }, wordTiles(mark.text), html('b', {}, `${mark.score}`)) : '—';
}

function playerCard(player: PlayerReport, report: GameReport): HTMLElement {
  const standing = player.finished ? `${ordinal(player.rank!)} · ${points(player.score)}` : `Left early · ${points(player.score)}`;
  const turnsLine = [plural(player.plays, 'play'), plural(player.passes, 'pass', 'passes'), plural(player.exchanges, 'swap')].join(' · ');
  const best = player.bestPlay;
  return html(
    'article',
    {
      class: `recap-card${report.winners.includes(player) ? ' winner' : ''}`,
      style: `--player: ${playerColor(player.seatId)}`,
      'aria-label': player.name,
    },
    html(
      'header',
      {},
      avatar(player, 36),
      html('span', {}, html('h4', {}, nameLabel(player)), html('small', {}, standing)),
    ),
    html(
      'dl',
      {},
      stat(
        'Best play',
        best ? html('span', {}, html('b', {}, `+${best.total}`), ` ${best.words.join(', ')}${best.bingo ? ' · bingo' : ''}`) : '—',
      ),
      stat('Best word', wordStat(player.bestWord)),
      stat('Longest word', wordStat(player.longestWord)),
      stat('Words formed', String(player.words)),
      stat('Turns', turnsLine),
      stat('Average play', player.averagePlay === null ? '—' : points(player.averagePlay)),
      stat('Bingos', String(player.bingos)),
      stat('Premium squares', premiumSummary(player)),
      stat('Blanks played', String(player.blanks)),
      player.finished ? stat('Rack at the end', player.adjustment === 0 ? 'Even' : signed(player.adjustment)) : null,
    ),
  );
}

function highlights(report: GameReport): HTMLElement | null {
  if (report.history.length === 0) {
    return null;
  }
  return html(
    'section',
    { class: 'recap-section', 'aria-labelledby': 'recap-players-title' },
    html('h3', { id: 'recap-players-title' }, 'Player highlights'),
    html('div', { class: 'recap-cards' }, ...report.players.map((player) => playerCard(player, report))),
  );
}

function gameStats(report: GameReport): HTMLElement {
  const nameOf = (seatId: string) => report.players.find((player) => player.seatId === seatId)?.name ?? `Seat ${seatId}`;
  const moments: HTMLElement[] = [];
  const moment = (label: string, sentence: string) =>
    moments.push(html('li', {}, html('span', { class: 'recap-moment-label' }, label), ' ', sentence));
  const play = report.biggestPlay;
  if (play) {
    moment(
      'Biggest play',
      `${nameOf(play.seatId)} scored ${points(play.total)} with ${play.words.join(', ')} on turn ${play.turnNumber}${play.bingo ? ', a bingo' : ''}.`,
    );
  }
  if (report.bestWord) {
    moment('Best word', `${report.bestWord.text} for ${points(report.bestWord.score)} by ${nameOf(report.bestWord.seatId)}.`);
  }
  if (report.longestWord) {
    const word = report.longestWord;
    moment('Longest word', `${word.text}, ${plural(word.text.length, 'letter')}, by ${nameOf(word.seatId)}.`);
  }
  return html(
    'section',
    { class: 'recap-section', 'aria-labelledby': 'recap-game-title' },
    html('h3', { id: 'recap-game-title' }, 'The game'),
    html(
      'dl',
      { class: 'recap-stats' },
      report.durationMs !== null ? stat('Duration', formatDuration(report.durationMs)) : null,
      stat('Turns', String(report.turns)),
      stat('Rounds', String(report.rounds)),
      stat('Words formed', String(report.words)),
      stat('Points scored', String(report.points)),
      stat('Tiles played', String(report.tiles)),
      stat('Bingos', String(report.bingos)),
      stat('Lead changes', String(report.leadChanges)),
    ),
    moments.length > 0 ? html('ul', { class: 'recap-moments' }, ...moments) : null,
  );
}

/**
 * The after-action report shown when a game ends. It redraws only when the result changes, so the
 * overlay's frequent renders never reset its scroll position or re-announce the winner.
 */
export class RecapPanel {
  readonly root: HTMLElement;
  private key = '';
  private gameNumber: number | null = null;
  private showingBoard = false;

  constructor() {
    this.root = html('section', { class: 'end-panel recap', 'aria-labelledby': 'recap-title', hidden: '' });
    this.root.addEventListener('click', (event) => {
      if ((event.target as HTMLElement).closest('[data-action="recap-toggle"]')) {
        this.showingBoard = !this.showingBoard;
        this.applyView();
      }
    });
  }

  update(snapshot: TableSnapshot | null): void {
    if (!snapshot || snapshot.status !== 'ended') {
      this.root.hidden = true;
      this.key = '';
      return;
    }
    if (snapshot.gameNumber !== this.gameNumber) {
      this.gameNumber = snapshot.gameNumber;
      this.showingBoard = false;
    }
    const key = JSON.stringify([
      snapshot.gameNumber,
      snapshot.endReason,
      snapshot.finalAdjustments,
      snapshot.recap ?? null,
      !!snapshot.you,
      snapshot.seats.map((seat) => [seat.seatId, seat.occupied, seat.displayName, seat.isLocal, seat.inGame, seat.score]),
    ]);
    if (key !== this.key) {
      this.key = key;
      this.render(buildReport(snapshot), !!snapshot.you);
    }
    this.root.hidden = false;
  }

  private render(report: GameReport, seated: boolean): void {
    const body = html(
      'div',
      { class: 'recap-body', id: 'recap-body' },
      standings(report),
      scoreChart(report),
      highlights(report),
      gameStats(report),
    );
    const actions = html(
      'footer',
      { class: 'recap-actions' },
      seated ? html('button', { type: 'button', 'data-action': 'new-game', class: 'primary' }, 'Rematch') : null,
      html('button', { type: 'button', 'data-action': 'recap-toggle', 'aria-controls': 'recap-body' }, ''),
      html('a', { class: 'recap-link', href: publicBase() }, 'Back to tables'),
      seated ? html('p', { class: 'recap-hint' }, 'Rematch deals a new game to everyone still seated.') : null,
    );
    this.root.replaceChildren(html('div', { class: 'recap-scroll' }, hero(report), body), actions);
    this.applyView();
  }

  private applyView(): void {
    this.root.dataset.view = this.showingBoard ? 'board' : 'report';
    const body = this.root.querySelector<HTMLElement>('.recap-body');
    if (body) {
      body.hidden = this.showingBoard;
    }
    const toggle = this.root.querySelector<HTMLButtonElement>('[data-action="recap-toggle"]');
    if (toggle) {
      toggle.textContent = this.showingBoard ? 'Show report' : 'View board';
      toggle.setAttribute('aria-expanded', String(!this.showingBoard));
    }
  }
}
