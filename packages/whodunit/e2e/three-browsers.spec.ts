import { expect, test, type Browser, type Page } from '@playwright/test';
import { SCRIPTED_DEAL_SEED } from '../src/dev/dev-tables.js';
import type { CardId, GameEvent, SeatId, SuspectId, TableSnapshot } from '../src/protocol.js';
import { SUSPECT_IDS, WEAPON_IDS } from '../src/rules/constants.js';
import { dealCase } from '../src/rules/game.js';
import { seededRandom } from '../src/rules/random.js';

/** The `window.__whodunit` dev hook (present only when config.dev). */
interface WhodunitDebug {
  model: { snapshot: TableSnapshot | null };
  destinations(): string[];
  destPoint(key: string): { x: number; y: number } | null;
  fxLog(): string[];
}
type DebugWindow = Window & { __whodunit?: WhodunitDebug };

type Member = { page: Page; frames: string[]; seatId: SeatId; suspect: SuspectId };

/** The scripted case, replayed exactly as the dev server deals it to seats 1–3 with seat 1 first. */
const DEAL = dealCase(['1', '2', '3'], seededRandom(SCRIPTED_DEAL_SEED), '1');

async function signedInPage(browser: Browser, devSub: string, seatId: SeatId, suspect: SuspectId): Promise<Member> {
  const context = await browser.newContext();
  const page = await context.newPage();
  const frames: string[] = [];
  page.on('websocket', (socket) => socket.on('framereceived', (frame) => frames.push(String(frame.payload))));
  page.on('pageerror', (error) => console.log(`[pageerror ${devSub}]`, error.message));
  const response = await page.request.get(`/dev/token?sub=${devSub}`);
  const { accessToken } = (await response.json()) as { accessToken: string };
  await context.addInitScript((token) => sessionStorage.setItem('whodunit.devAccessToken', token), accessToken);
  return { page, frames, seatId, suspect };
}

function tableIdFromFrames(frames: string[], tableName: string): string | null {
  for (const frame of frames) {
    const message = JSON.parse(frame) as { type?: string; tables?: Array<{ tableId: string; tableName: string | null }> };
    const table = message.type === 'my_tables' ? message.tables?.find((t) => t.tableName === tableName) : undefined;
    if (table) {
      return table.tableId;
    }
  }
  return null;
}

const snapshotOf = (page: Page) => page.evaluate(() => (window as DebugWindow).__whodunit!.model.snapshot!);

/** Opens the table and waits for the auto-sit to land in the expected seat. */
async function openTable(member: Member, url: string) {
  await member.page.goto(url);
  await member.page.waitForFunction(
    (seatId) => (window as DebugWindow).__whodunit?.model.snapshot?.you?.seatId === seatId,
    member.seatId,
  );
}

async function waitFor(page: Page, predicate: string, arg?: unknown) {
  await page.waitForFunction(
    ([source, value]) => {
      const s = (window as DebugWindow).__whodunit?.model.snapshot;
      return !!s && (new Function('s', 'arg', `return (${source});`) as (s: TableSnapshot, arg: unknown) => boolean)(s, value);
    },
    [predicate, arg ?? null] as const,
    { timeout: 30_000 },
  );
}

/** Waits until the server would accept this detective's next action, so `turn_not_open` never happens. */
async function waitMyMove(member: Member, phase?: string) {
  await waitFor(
    member.page,
    `s.status === 'playing' && s.currentSeatId === arg.seat && (arg.phase === null || s.turn?.phase === arg.phase) && s.nextActionAt !== null && Date.now() >= s.nextActionAt`,
    { seat: member.seatId, phase: phase ?? null },
  );
}

/** Every event this page received over the wire, live or in snapshot logs. */
function eventsInFrames(frames: string[]): GameEvent[] {
  const events: GameEvent[] = [];
  for (const frame of frames) {
    const message = JSON.parse(frame) as { type?: string; event?: GameEvent; log?: GameEvent[]; recap?: { events: GameEvent[] } };
    if (message.type === 'event' && message.event) {
      events.push(message.event);
    }
    if (message.type === 'table_snapshot') {
      events.push(...(message.log ?? []), ...(message.recap?.events ?? []));
    }
  }
  return events;
}

test('three detectives pick suspects, walk, suggest, refute privately, accuse, and close the case', async ({ browser }, testInfo) => {
  const inspector = await signedInPage(browser, 'dev-inspector', '1', 'vesper');
  const sleuth = await signedInPage(browser, 'dev-sleuth', '2', 'finch');
  const constable = await signedInPage(browser, 'dev-constable', '3', 'juniper');
  const members = [inspector, sleuth, constable];

  await inspector.page.goto('/whodunit');
  await expect(inspector.page.locator('.wdl-card:not(.wdl-card-skeleton)').first()).toBeVisible();
  await expect.poll(() => tableIdFromFrames(inspector.frames, 'Scripted case')).not.toBeNull();
  await inspector.page.screenshot({ path: testInfo.outputPath('lobby-inspector.png') });
  const url = `/whodunit/${tableIdFromFrames(inspector.frames, 'Scripted case')}`;

  for (const member of members) {
    await openTable(member, url);
  }
  for (const member of members) {
    await member.page.getByTestId(`pick-suspect-${member.suspect}`).click();
    await waitFor(member.page, `s.you?.suspect === arg`, member.suspect);
    await member.page.getByTestId('ready').click();
    await waitFor(member.page, `s.seats.find((seat) => seat.isLocal)?.ready === true`);
  }
  await waitFor(inspector.page, `s.seats.filter((seat) => seat.ready).length === 3`);
  await inspector.page.screenshot({ path: testInfo.outputPath('setup-inspector.png') });
  await expect(sleuth.page.getByTestId('start-game')).toBeHidden();
  await inspector.page.getByTestId('start-game').click();

  for (const member of members) {
    await waitFor(member.page, `s.status === 'playing'`);
    const snapshot = await snapshotOf(member.page);
    expect(snapshot.you!.hand.sort()).toEqual([...DEAL.hands[member.seatId]!].sort());
    expect(snapshot.solution).toBeNull();
    expect(snapshot.weapons).toEqual(DEAL.weapons);
  }

  // Turn 1: the Inspector rolls and walks; the board lights only reachable squares and rooms.
  await waitMyMove(inspector, 'start');
  await inspector.page.getByTestId('roll').click();
  await waitMyMove(inspector, 'moving');
  const litOf = () => inspector.page.evaluate(() => (window as DebugWindow).__whodunit!.destinations());
  await expect.poll(async () => (await litOf()).length, { timeout: 10_000 }).toBeGreaterThan(0);
  const lit = await litOf();
  const target = lit.find((key) => key.startsWith('room:')) ?? lit.at(-1)!;
  const point = await inspector.page.evaluate((key) => (window as DebugWindow).__whodunit!.destPoint(key), target);
  expect(point, `destination ${target}`).not.toBeNull();
  await inspector.page.mouse.click(point!.x, point!.y);
  await waitMyMove(inspector, 'moved');
  await inspector.page.screenshot({ path: testInfo.outputPath('walked-inspector.png') });

  // Every detective watched the same walk.
  for (const member of members) {
    await expect.poll(() => member.page.evaluate(() => (window as DebugWindow).__whodunit!.fxLog().some((line) => line.startsWith('walk 1')))).toBe(true);
  }

  const turn = (await snapshotOf(inspector.page)).turn!;
  let shownCard: CardId | null = null;
  if (turn.enteredRoom) {
    // Name a suspect and weapon so the first detective clockwise who holds any of the three must show one.
    const room = turn.enteredRoom;
    const others: SeatId[] = ['2', '3'];
    const suspect = SUSPECT_IDS.find((id) => others.some((seat) => DEAL.hands[seat]!.includes(id))) ?? DEAL.solution.suspect;
    const weapon = DEAL.solution.weapon;
    const named: CardId[] = [suspect, weapon, room];
    const refuterSeat = others.find((seat) => DEAL.hands[seat]!.some((card) => named.includes(card)))!;
    const refuter = members.find((member) => member.seatId === refuterSeat)!;
    const bystander = members.find((member) => member !== inspector && member !== refuter)!;

    await inspector.page.getByTestId('suggest-open').click();
    await inspector.page.getByTestId(`suggest-suspect-${suspect}`).click();
    await inspector.page.getByTestId(`suggest-weapon-${weapon}`).click();
    await inspector.page.getByTestId('suggest-submit').click();

    await waitFor(refuter.page, `s.you?.refute !== null && s.you?.refute !== undefined && s.nextActionAt !== null && Date.now() >= s.nextActionAt`);
    await expect(refuter.page.getByTestId('refute-prompt')).toBeVisible();
    await refuter.page.screenshot({ path: testInfo.outputPath('refute-prompt.png') });
    const matching = (await snapshotOf(refuter.page)).you!.refute!.matching;
    expect(matching.sort()).toEqual(DEAL.hands[refuterSeat]!.filter((card) => named.includes(card)).sort());
    shownCard = matching[0]!;
    await refuter.page.getByTestId(`refute-card-${shownCard}`).click();

    await waitFor(inspector.page, `s.turn?.phase === 'suggested'`);
    await expect
      .poll(() => eventsInFrames(inspector.frames).find((event) => event.kind === 'refuted' && event.card === shownCard))
      .toBeTruthy();
    expect(eventsInFrames(refuter.frames).some((event) => event.kind === 'refuted' && event.card === shownCard)).toBe(true);
    await waitFor(bystander.page, `s.log.some((event) => event.kind === 'refuted')`);
    // The bystander learns that a card was shown, never which.
    for (const event of eventsInFrames(bystander.frames)) {
      if (event.kind === 'refuted') {
        expect(event.card).toBeUndefined();
      }
    }
    await inspector.page.screenshot({ path: testInfo.outputPath('refuted-inspector.png') });
  }
  await waitMyMove(inspector);
  await inspector.page.screenshot({ path: testInfo.outputPath('table-inspector-full.png'), fullPage: true });
  await inspector.page.getByTestId('end-turn').click();

  // Turn 2: the Sleuth accuses wrongly and is out of the running, but stays at the table.
  await waitMyMove(sleuth, 'start');
  const wrongSuspect = SUSPECT_IDS.find((id) => id !== DEAL.solution.suspect)!;
  await sleuth.page.getByTestId('accuse-open').click();
  await sleuth.page.getByTestId(`accuse-suspect-${wrongSuspect}`).click();
  await sleuth.page.getByTestId(`accuse-weapon-${DEAL.solution.weapon}`).click();
  await sleuth.page.getByTestId(`accuse-room-${DEAL.solution.room}`).click();
  await sleuth.page.getByTestId('accuse-submit').click();
  await sleuth.page.getByTestId('accuse-confirm').click();
  await waitFor(sleuth.page, `s.seats.find((seat) => seat.seatId === '2')?.eliminated === true && s.currentSeatId === '3'`);
  expect((await snapshotOf(sleuth.page)).solution).toBeNull();

  // Before the case closes, nobody has seen the case file or anyone else's hand.
  for (const member of members) {
    for (const frame of member.frames) {
      expect(frame).not.toMatch(/"solution":\{/);
      const snapshot = JSON.parse(frame) as Partial<TableSnapshot>;
      if (snapshot.type === 'table_snapshot' && snapshot.you) {
        expect(snapshot.you.hand.every((card) => DEAL.hands[member.seatId]!.includes(card))).toBe(true);
      }
    }
  }

  // Turn 3: the Constable names the case file and wins.
  await waitMyMove(constable, 'start');
  await constable.page.getByTestId('accuse-open').click();
  await constable.page.getByTestId(`accuse-suspect-${DEAL.solution.suspect}`).click();
  await constable.page.getByTestId(`accuse-weapon-${DEAL.solution.weapon}`).click();
  await constable.page.getByTestId(`accuse-room-${DEAL.solution.room}`).click();
  await constable.page.getByTestId('accuse-submit').click();
  await constable.page.getByTestId('accuse-confirm').click();

  for (const member of members) {
    await waitFor(member.page, `s.status === 'finished'`);
    const snapshot = await snapshotOf(member.page);
    expect(snapshot.winnerSeatId).toBe('3');
    expect(snapshot.endReason).toBe('solved');
    expect(snapshot.solution).toEqual(DEAL.solution);
    expect(snapshot.recap?.solution).toEqual(DEAL.solution);
    await expect(member.page.getByTestId('end-dialog')).toBeVisible({ timeout: 15_000 });
  }
  await constable.page.screenshot({ path: testInfo.outputPath('solved-constable.png') });
  if (shownCard) {
    // The recap keeps the shown card private to the two who saw it.
    const bystanderRecap = (await snapshotOf(members.find((m) => m.seatId !== '1' && !DEAL.hands[m.seatId]!.includes(shownCard!))!.page)).recap!;
    expect(bystanderRecap.events.filter((event) => event.kind === 'refuted').every((event) => event.card === undefined)).toBe(true);
  }
  await inspector.page.getByTestId('recap-toggle').click();
  await expect(inspector.page.getByTestId('recap')).toBeVisible();
  await inspector.page.screenshot({ path: testInfo.outputPath('recap-inspector.png') });

  // The host opens a new case with the same detectives and suspects.
  await inspector.page.getByTestId('new-case').click();
  for (const member of members) {
    await waitFor(member.page, `s.status === 'setup' && s.you?.suspect === arg`, member.suspect);
  }
  expect(WEAPON_IDS.length).toBe(6);
});

test('a signed-out visitor is asked to sign in', async ({ page }) => {
  await page.goto('/whodunit');
  await expect(page.getByRole('link', { name: /sign in/i }).first()).toBeVisible();
});
