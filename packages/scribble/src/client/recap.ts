import type { EndReason, TurnRecord } from '../rules/game.js';
import type { Premium } from '../rules/types.js';
import type { GameRecap, TableSnapshot } from '../runtime/types.js';

export type Outcome = 'win' | 'tie' | 'abandoned' | 'none';

export interface WordMark {
  text: string;
  score: number;
  turnNumber: number;
}

export interface PlayMark {
  turnNumber: number;
  total: number;
  words: string[];
  bingo: boolean;
}

export interface PlayerReport {
  seatId: string;
  name: string;
  avatarId: number;
  isLocal: boolean;
  /** Still in the game when it ended; players who left are listed but not ranked. */
  finished: boolean;
  rank: number | null;
  score: number;
  /** End-of-game rack settlement. */
  adjustment: number;
  wentOut: boolean;
  turns: number;
  plays: number;
  passes: number;
  exchanges: number;
  words: number;
  tiles: number;
  blanks: number;
  bingos: number;
  premiums: Record<Premium, number>;
  bestPlay: PlayMark | null;
  bestWord: WordMark | null;
  longestWord: WordMark | null;
  averagePlay: number | null;
}

export interface ScoreSeries {
  seatId: string;
  points: Array<{ turn: number; score: number }>;
}

export interface GameReport {
  outcome: Outcome;
  endReason: EndReason | null;
  winners: PlayerReport[];
  /** Finishers by rank, then players who left. */
  players: PlayerReport[];
  /** Winner's lead over the runner-up. */
  margin: number | null;
  turns: number;
  /** The most turns any one player took. */
  rounds: number;
  durationMs: number | null;
  words: number;
  points: number;
  tiles: number;
  bingos: number;
  leadChanges: number;
  biggestPlay: (PlayMark & { seatId: string }) | null;
  bestWord: (WordMark & { seatId: string }) | null;
  longestWord: (WordMark & { seatId: string }) | null;
  series: ScoreSeries[];
  /** True when rack settlement moved a score, so the chart gets a closing column. */
  settled: boolean;
  lastTurn: number;
  history: TurnRecord[];
}

const EMPTY_RECAP: GameRecap = { history: [], finalScores: null, roster: {}, startedAt: null, endedAt: null };

function isBetterWord(candidate: WordMark, best: WordMark | null, by: 'score' | 'length'): boolean {
  if (!best) {
    return true;
  }
  if (by === 'length' && candidate.text.length !== best.text.length) {
    return candidate.text.length > best.text.length;
  }
  return candidate.score > best.score;
}

function playerStats(seatId: string, turns: ReadonlyArray<TurnRecord>) {
  const premiums: Record<Premium, number> = { DL: 0, TL: 0, DW: 0, TW: 0 };
  let bestPlay: PlayMark | null = null;
  let bestWord: WordMark | null = null;
  let longestWord: WordMark | null = null;
  let plays = 0;
  let playPoints = 0;
  const stats = { turns: 0, passes: 0, exchanges: 0, words: 0, tiles: 0, blanks: 0, bingos: 0 };
  for (const turn of turns) {
    if (turn.seatId !== seatId) {
      continue;
    }
    stats.turns++;
    if (turn.kind === 'exchange') {
      stats.exchanges++;
    } else if (turn.kind !== 'play') {
      stats.passes++;
    }
    if (turn.kind !== 'play') {
      continue;
    }
    plays++;
    playPoints += turn.total;
    stats.words += turn.words.length;
    stats.tiles += turn.tiles;
    stats.blanks += turn.blanks;
    stats.bingos += turn.bingo ? 1 : 0;
    for (const premium of turn.premiums) {
      premiums[premium]++;
    }
    if (!bestPlay || turn.total > bestPlay.total) {
      bestPlay = { turnNumber: turn.turnNumber, total: turn.total, words: turn.words.map((w) => w.text), bingo: turn.bingo };
    }
    for (const word of turn.words) {
      const mark = { text: word.text, score: word.score, turnNumber: turn.turnNumber };
      if (isBetterWord(mark, bestWord, 'score')) {
        bestWord = mark;
      }
      if (isBetterWord(mark, longestWord, 'length')) {
        longestWord = mark;
      }
    }
  }
  return {
    ...stats,
    plays,
    premiums,
    bestPlay,
    bestWord,
    longestWord,
    averagePlay: plays > 0 ? Math.round((playPoints / plays) * 10) / 10 : null,
  };
}

/** A sole leader, or null while scores are level. */
function leaderOf(scores: Map<string, number>): string | null {
  let leader: string | null = null;
  let top = -Infinity;
  let tied = false;
  for (const [seatId, score] of scores) {
    if (score > top) {
      top = score;
      leader = seatId;
      tied = false;
    } else if (score === top) {
      tied = true;
    }
  }
  return tied ? null : leader;
}

function countLeadChanges(history: ReadonlyArray<TurnRecord>, finalScores: Record<string, number> | null): number {
  const scores = new Map<string, number>();
  let leader: string | null = null;
  let changes = 0;
  const observe = () => {
    const next = leaderOf(scores);
    if (next !== null) {
      if (leader !== null && next !== leader) {
        changes++;
      }
      leader = next;
    }
  };
  for (const turn of history) {
    scores.set(turn.seatId, turn.score);
    observe();
  }
  if (finalScores) {
    for (const [seatId, score] of Object.entries(finalScores)) {
      scores.set(seatId, score);
    }
    observe();
  }
  return changes;
}

/**
 * Everything the after-action report shows, worked out from the ended snapshot. Older tables that
 * ended before turn history was kept still get standings, just no per-turn detail.
 */
export function buildReport(snapshot: TableSnapshot): GameReport {
  const recap = snapshot.recap ?? EMPTY_RECAP;
  const history = recap.history;
  const seated = new Map(snapshot.seats.filter((seat) => seat.occupied).map((seat) => [seat.seatId, seat]));
  const finisherIds = recap.finalScores
    ? Object.keys(recap.finalScores)
    : snapshot.seats.filter((seat) => seat.occupied && seat.inGame).map((seat) => seat.seatId);
  const finishers = new Set(finisherIds);
  const departedIds = [...new Set(history.map((turn) => turn.seatId))].filter((seatId) => !finishers.has(seatId));
  const lastTurn = history.at(-1)?.turnNumber ?? snapshot.turnNumber;

  const report = (seatId: string, finished: boolean): PlayerReport => {
    const seat = seated.get(seatId);
    const listed = recap.roster[seatId];
    const sameOccupant = !!seat && (!listed || listed.displayName === seat.displayName);
    const lastScore = history.filter((turn) => turn.seatId === seatId).at(-1)?.score ?? 0;
    return {
      seatId,
      name: listed?.displayName ?? seat?.displayName ?? `Seat ${seatId}`,
      avatarId: listed?.avatarId ?? seat?.avatarId ?? 1,
      isLocal: sameOccupant && !!seat?.isLocal,
      finished,
      rank: null,
      score: finished ? (recap.finalScores?.[seatId] ?? seat?.score ?? lastScore) : lastScore,
      adjustment: finished ? (snapshot.finalAdjustments?.[seatId] ?? 0) : 0,
      wentOut: finished && snapshot.wentOutSeatId === seatId,
      ...playerStats(seatId, history),
    };
  };

  const ranked = finisherIds.map((seatId) => report(seatId, true)).sort((a, b) => b.score - a.score);
  ranked.forEach((player, index) => {
    const previous = ranked[index - 1];
    player.rank = previous && previous.score === player.score ? previous.rank : index + 1;
  });
  const departed = departedIds.map((seatId) => report(seatId, false));
  const players = [...ranked, ...departed];

  const winners = snapshot.endReason === 'abandoned' ? [] : ranked.filter((player) => player.rank === 1);
  const outcome: Outcome =
    snapshot.endReason === 'abandoned' ? 'abandoned' : winners.length > 1 ? 'tie' : winners.length === 1 ? 'win' : 'none';
  const runnerUp = ranked.find((player) => player.rank !== 1);
  const margin = outcome === 'win' && runnerUp ? winners[0]!.score - runnerUp.score : null;

  let biggestPlay: GameReport['biggestPlay'] = null;
  let bestWord: GameReport['bestWord'] = null;
  let longestWord: GameReport['longestWord'] = null;
  for (const player of players) {
    if (player.bestPlay && (!biggestPlay || player.bestPlay.total > biggestPlay.total)) {
      biggestPlay = { ...player.bestPlay, seatId: player.seatId };
    }
    if (player.bestWord && isBetterWord(player.bestWord, bestWord, 'score')) {
      bestWord = { ...player.bestWord, seatId: player.seatId };
    }
    if (player.longestWord && isBetterWord(player.longestWord, longestWord, 'length')) {
      longestWord = { ...player.longestWord, seatId: player.seatId };
    }
  }

  const settled = ranked.some((player) => player.adjustment !== 0);
  const series: ScoreSeries[] = players.map((player) => {
    const points = [{ turn: 0, score: 0 }];
    for (const turn of history) {
      if (turn.seatId === player.seatId) {
        points.push({ turn: turn.turnNumber, score: turn.score });
      }
    }
    if (player.finished) {
      const last = points.at(-1)!;
      if (last.turn < lastTurn) {
        points.push({ turn: lastTurn, score: last.score });
      }
      if (settled) {
        points.push({ turn: lastTurn + 1, score: player.score });
      }
    }
    return { seatId: player.seatId, points };
  });

  const started = recap.startedAt ? Date.parse(recap.startedAt) : Number.NaN;
  const ended = recap.endedAt ? Date.parse(recap.endedAt) : Number.NaN;
  const plays = history.filter((turn) => turn.kind === 'play');

  return {
    outcome,
    endReason: snapshot.endReason,
    winners,
    players,
    margin,
    turns: history.length,
    rounds: players.reduce((most, player) => Math.max(most, player.turns), 0),
    durationMs: Number.isFinite(started) && Number.isFinite(ended) ? Math.max(0, ended - started) : null,
    words: plays.reduce((sum, turn) => sum + turn.words.length, 0),
    points: plays.reduce((sum, turn) => sum + turn.total, 0),
    tiles: plays.reduce((sum, turn) => sum + turn.tiles, 0),
    bingos: plays.filter((turn) => turn.bingo).length,
    leadChanges: countLeadChanges(history, recap.finalScores),
    biggestPlay,
    bestWord,
    longestWord,
    series,
    settled,
    lastTurn,
    history,
  };
}
