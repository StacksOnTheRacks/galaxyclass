import { expect, test, type Browser, type Page } from '@playwright/test';
import type { Fleet, ShipPlacement, TableSnapshot } from '../src/protocol.js';
import { COL_LABELS, ROW_LABELS, SHIP_LENGTH } from '../src/rules/constants.js';

/** The `window.__warships` dev hook (present only when config.dev). */
interface WarshipsDebug {
  model: { snapshot: TableSnapshot | null; fxLog: string[] };
  cellPoint(board: 'own' | 'target', row: number, col: number): { x: number; y: number } | null;
  setDraft(fleet: Fleet): void;
}
type DebugWindow = Window & { __warships?: WarshipsDebug };

type Member = { page: Page; frames: string[] };

/** Every ship on the top-left side, rows A, C, E, G, I. */
const ADMIRAL_FLEET: Fleet = [
  { shipId: 'carrier', row: 0, col: 0, orientation: 'horizontal' },
  { shipId: 'battleship', row: 2, col: 0, orientation: 'horizontal' },
  { shipId: 'cruiser', row: 4, col: 0, orientation: 'horizontal' },
  { shipId: 'submarine', row: 6, col: 0, orientation: 'horizontal' },
  { shipId: 'destroyer', row: 8, col: 0, orientation: 'horizontal' },
];

/** No placement matches an Admiral placement, so a leak is detectable by exact match. */
const CAPTAIN_FLEET: Fleet = [
  { shipId: 'carrier', row: 9, col: 0, orientation: 'horizontal' },
  { shipId: 'battleship', row: 6, col: 1, orientation: 'horizontal' },
  { shipId: 'cruiser', row: 2, col: 2, orientation: 'vertical' },
  { shipId: 'submarine', row: 2, col: 5, orientation: 'horizontal' },
  { shipId: 'destroyer', row: 0, col: 0, orientation: 'horizontal' },
];

const label = (row: number, col: number) => `${ROW_LABELS[row]}${COL_LABELS[col]}`;

function shipCells(ship: ShipPlacement): Array<[number, number]> {
  return Array.from({ length: SHIP_LENGTH[ship.shipId] }, (_, i): [number, number] =>
    ship.orientation === 'horizontal' ? [ship.row, ship.col + i] : [ship.row + i, ship.col],
  );
}

async function signedInPage(browser: Browser, devSub: string): Promise<Member> {
  const context = await browser.newContext();
  const page = await context.newPage();
  const frames: string[] = [];
  page.on('websocket', (socket) => socket.on('framereceived', (frame) => frames.push(String(frame.payload))));
  page.on('pageerror', (error) => console.log('[pageerror]', error.message));
  const response = await page.request.get(`/dev/token?sub=${devSub}`);
  const { accessToken } = (await response.json()) as { accessToken: string };
  await context.addInitScript((token) => sessionStorage.setItem('warships.devAccessToken', token), accessToken);
  return { page, frames };
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

/** The dev server seeds "Scripted practice" for Admiral, with Admiral (seat 1) firing first. */
async function scriptedTableUrl(admiral: Member): Promise<string> {
  await admiral.page.goto('/warships');
  await expect.poll(() => tableIdFromFrames(admiral.frames, 'Scripted practice')).not.toBeNull();
  return `/warships/${tableIdFromFrames(admiral.frames, 'Scripted practice')}`;
}

async function openTable(member: Member, url: string) {
  await member.page.goto(url);
  await member.page.waitForFunction(() => !!(window as DebugWindow).__warships?.model.snapshot?.you);
}

const snapshotOf = (page: Page) => page.evaluate(() => (window as DebugWindow).__warships!.model.snapshot!);

async function waitStatus(page: Page, status: TableSnapshot['status'], gameNumber?: number) {
  await page.waitForFunction(
    ([s, g]) => {
      const snapshot = (window as DebugWindow).__warships?.model.snapshot;
      return snapshot?.status === s && (g === null || snapshot.gameNumber === g);
    },
    [status, gameNumber ?? null] as const,
    { timeout: 30_000 },
  );
}

async function placeAndReady(member: Member, fleet: Fleet, screenshot?: string) {
  await member.page.evaluate((f) => (window as DebugWindow).__warships!.setDraft(f), fleet);
  if (screenshot) {
    await member.page.screenshot({ path: screenshot });
  }
  await member.page.getByRole('button', { name: 'Ready', exact: true }).click();
  await member.page.waitForFunction(() => (window as DebugWindow).__warships?.model.snapshot?.you?.ready === true);
}

/** Waits until the server would accept a fire from this captain, so `turn_not_open` never happens. */
async function waitMyTurn(page: Page) {
  await page.waitForFunction(
    () => {
      const s = (window as DebugWindow).__warships?.model.snapshot;
      return (
        s?.status === 'battle' &&
        s.currentSeatId === s.you?.seatId &&
        s.turnOpensAt !== null &&
        Date.now() >= s.turnOpensAt
      );
    },
    undefined,
    { timeout: 30_000 },
  );
}

/** Fires with a real click on the target grid. */
async function fire(shooter: Member, row: number, col: number) {
  await waitMyTurn(shooter.page);
  const point = await shooter.page.evaluate(
    ([r, c]) => (window as DebugWindow).__warships!.cellPoint('target', r!, c!),
    [row, col],
  );
  expect(point, `target cell ${label(row, col)}`).not.toBeNull();
  await shooter.page.mouse.click(point!.x, point!.y);
}

async function waitTurnNumber(pages: Page[], turnNumber: number) {
  for (const page of pages) {
    await page.waitForFunction(
      (n) => ((window as DebugWindow).__warships?.model.snapshot?.turnNumber ?? -1) >= n,
      turnNumber,
      { timeout: 30_000 },
    );
  }
}

/** The fx entries for the last shot at `coord`, up to the turn change. */
function shotSlice(log: string[], coord: string): string[] {
  const start = log.lastIndexOf(`lock ${coord}`);
  if (start < 0) {
    return [];
  }
  const rest = log.slice(start);
  const turn = rest.findIndex((entry) => entry.startsWith('turn '));
  return turn < 0 ? rest : rest.slice(0, turn);
}

/** Both captains play the same timeline for a shot, ending with `last`. */
async function expectSameTimeline(pages: Page[], coord: string, last: string) {
  const slices: string[][] = [];
  for (const page of pages) {
    await page.waitForFunction(
      ([c, l]) => {
        const log = (window as DebugWindow).__warships?.model.fxLog ?? [];
        const start = log.lastIndexOf(`lock ${c}`);
        return start >= 0 && log.slice(start).includes(l!);
      },
      [coord, last],
      { timeout: 15_000 },
    );
    slices.push(shotSlice(await page.evaluate(() => (window as DebugWindow).__warships!.model.fxLog), coord));
  }
  expect(slices[0]![0]).toBe(`lock ${coord}`);
  expect(slices[0]).toContain(last);
  for (const slice of slices.slice(1)) {
    expect(slice).toEqual(slices[0]);
  }
}

/**
 * Waits until a banner with `text` is actually on screen. The banner is in the DOM from the moment
 * the shot is scheduled, at opacity 0, so visibility alone would pass before it ever shows.
 */
async function expectBannerShown(page: Page, text: string) {
  await page.waitForFunction(
    (t) =>
      [...document.querySelectorAll<HTMLElement>('.ws-banner')].some(
        (banner) => banner.textContent?.includes(t) && Number(getComputedStyle(banner).opacity) > 0.5,
      ),
    text,
    { timeout: 10_000, polling: 'raf' },
  );
}

function parsedFrames(frames: string[]): Array<Record<string, unknown>> {
  return frames.map((frame) => JSON.parse(frame) as Record<string, unknown>);
}

/** Every object anywhere in `value`. */
function* objectsIn(value: unknown): Generator<Record<string, unknown>> {
  if (Array.isArray(value)) {
    for (const item of value) yield* objectsIn(item);
  } else if (value && typeof value === 'object') {
    yield value as Record<string, unknown>;
    for (const item of Object.values(value)) yield* objectsIn(item);
  }
}

test('two captains place, trade fire with synced sonar, sink, resume, finish, and rematch', async ({ browser }, testInfo) => {
  const admiral = await signedInPage(browser, 'dev-admiral');
  const url = await scriptedTableUrl(admiral);
  await openTable(admiral, url);
  const captain = await signedInPage(browser, 'dev-captain');
  await openTable(captain, url);
  const pages = [admiral.page, captain.page];

  // The second captain sitting starts placement; there is no Start button.
  for (const page of pages) {
    await waitStatus(page, 'placing', 1);
    const seats = (await snapshotOf(page)).seats.filter((s) => s.occupied);
    expect(seats.map((s) => [s.seatId, s.displayName])).toEqual([
      ['1', 'Admiral'],
      ['2', 'Captain'],
    ]);
  }

  await placeAndReady(admiral, ADMIRAL_FLEET, testInfo.outputPath('placement-admiral.png'));
  await placeAndReady(captain, CAPTAIN_FLEET);
  for (const page of pages) {
    await waitStatus(page, 'battle', 1);
  }
  expect((await snapshotOf(admiral.page)).currentSeatId).toBe('1');

  let turn = 0;
  // Admiral misses, Captain answers, then Admiral sinks the Destroyer on A1–A2.
  await fire(admiral, 9, 9);
  await admiral.page.waitForTimeout(600);
  await admiral.page.screenshot({ path: testInfo.outputPath('mid-sweep-admiral.png') });
  await expectSameTimeline(pages, 'J10', 'miss J10');
  await waitTurnNumber(pages, ++turn);

  // Coordinates never repeat across the two boards here, so `lock <coord>` names one shot in each log.
  await fire(captain, 9, 8);
  await expectSameTimeline(pages, 'J9', 'miss J9');
  await waitTurnNumber(pages, ++turn);

  await fire(admiral, 0, 0);
  await expectSameTimeline(pages, 'A1', 'hit A1');
  await waitTurnNumber(pages, ++turn);

  await fire(captain, 9, 7);
  await waitTurnNumber(pages, ++turn);

  await fire(admiral, 0, 1);
  await Promise.all([
    expectBannerShown(admiral.page, 'You sank their Destroyer!'),
    expectBannerShown(captain.page, 'Your Destroyer was sunk!'),
  ]);
  await captain.page.screenshot({ path: testInfo.outputPath('sink-banner-captain.png') });
  await expectSameTimeline(pages, 'A2', 'sunk destroyer');
  await waitTurnNumber(pages, ++turn);
  const afterSink = await snapshotOf(admiral.page);
  expect(afterSink.target!.sunk.map((s) => s.shipId)).toEqual(['destroyer']);
  expect(afterSink.target!.revealed).toBeNull();

  // A third member opening the link mid-battle gets a notice, no boards, and no shots.
  const ensign = await signedInPage(browser, 'dev-ensign');
  await ensign.page.goto(url);
  await expect(ensign.page.getByText(/Game in progress/)).toBeVisible();
  await expect(ensign.page.locator('[role="grid"]')).toHaveCount(0);

  // Captain reloads mid-battle and gets the same seat and boards back.
  const before = await snapshotOf(captain.page);
  await captain.page.reload();
  await captain.page.waitForFunction(() => (window as DebugWindow).__warships?.model.snapshot?.you?.seatId === '2');
  const resumed = await snapshotOf(captain.page);
  expect(resumed.status).toBe('battle');
  expect(resumed.you!.fleet).toEqual(CAPTAIN_FLEET);
  expect(resumed.you!.incoming).toEqual(before.you!.incoming);
  expect(resumed.target!.shots).toEqual(before.target!.shots);
  await admiral.page.waitForFunction(
    () => (window as DebugWindow).__warships?.model.snapshot?.seats.find((s) => s.seatId === '2')?.connected === true,
  );

  // Finish: Admiral works through the rest of Captain's fleet; Captain only fires into open water.
  const admiralTargets = CAPTAIN_FLEET.filter((ship) => ship.shipId !== 'destroyer').flatMap(shipCells);
  const captainTargets: Array<[number, number]> = [];
  for (let row = 0; row < 9; row++) {
    for (let col = 9; col >= 5; col--) {
      captainTargets.push([row, col]);
    }
  }

  await fire(captain, ...captainTargets.shift()!);
  await waitTurnNumber(pages, ++turn);
  expect(parsedFrames(ensign.frames).filter((m) => m.type === 'shot')).toHaveLength(0);
  const ensignSnapshot = await ensign.page.evaluate(() => (window as DebugWindow).__warships?.model.snapshot ?? null);
  expect(ensignSnapshot?.you ?? null).toBeNull();
  expect(ensignSnapshot?.target ?? null).toBeNull();
  await ensign.page.context().close();

  for (const [index, [row, col]] of admiralTargets.entries()) {
    await fire(admiral, row, col);
    if (index === admiralTargets.length - 1) {
      break;
    }
    await waitTurnNumber(pages, ++turn);
    await fire(captain, ...captainTargets.shift()!);
    await waitTurnNumber(pages, ++turn);
  }

  for (const page of pages) {
    await waitStatus(page, 'finished', 1);
  }
  await expect(admiral.page.getByText(/victory/i).first()).toBeVisible({ timeout: 15_000 });
  await expect(captain.page.getByText(/defeat/i).first()).toBeVisible({ timeout: 15_000 });
  await admiral.page.screenshot({ path: testInfo.outputPath('victory-admiral.png') });
  const finishedForAdmiral = await snapshotOf(admiral.page);
  const finishedForCaptain = await snapshotOf(captain.page);
  expect(finishedForAdmiral.winnerSeatId).toBe('1');
  expect(finishedForAdmiral.endReason).toBe('fleet_sunk');
  expect(finishedForAdmiral.target!.revealed).toEqual(CAPTAIN_FLEET);
  expect(finishedForCaptain.target!.revealed).toEqual(ADMIRAL_FLEET);

  // The shooter never had to see a turn refused.
  for (const member of [admiral, captain]) {
    expect(parsedFrames(member.frames).filter((m) => m.type === 'error' && m.code === 'turn_not_open')).toHaveLength(0);
  }

  // Nothing Captain received before the end placed an Admiral ship (Captain sank none), or carried server-only fields.
  const captainMessages = parsedFrames(captain.frames);
  const finishedAt = captainMessages.findIndex((m) => m.type === 'table_snapshot' && m.status === 'finished');
  expect(finishedAt).toBeGreaterThan(0);
  for (const message of captainMessages.slice(0, finishedAt)) {
    for (const object of objectsIn(message)) {
      const leaked = ADMIRAL_FLEET.find(
        (ship) =>
          object.shipId === ship.shipId &&
          object.row === ship.row &&
          object.col === ship.col &&
          object.orientation === ship.orientation,
      );
      expect(leaked, JSON.stringify(object)).toBeUndefined();
    }
    if (message.type === 'table_snapshot') {
      expect((message.target as TableSnapshot['target'])?.revealed ?? null).toBeNull();
    }
  }
  const captainWire = captain.frames.join('\n');
  for (const secret of ['seatTokenHash', 'playerSub', 'connectionId', '"boards"', 'dev-admiral']) {
    expect(captainWire).not.toContain(secret);
  }

  // Both vote for a rematch; the loser fires first in game 2.
  for (const page of pages) {
    await page.getByRole('button', { name: 'Rematch' }).first().click();
  }
  for (const page of pages) {
    await waitStatus(page, 'placing', 2);
  }
  await placeAndReady(admiral, ADMIRAL_FLEET);
  await placeAndReady(captain, CAPTAIN_FLEET);
  for (const page of pages) {
    await waitStatus(page, 'battle', 2);
  }
  expect((await snapshotOf(admiral.page)).currentSeatId).toBe('2');
});

test('two members in tabs of one browser profile each keep their own seat through reloads', async ({ browser }) => {
  // One context = one profile: both tabs share localStorage, as two tabs of the user's browser would.
  const context = await browser.newContext();
  const tab = async (devSub: string) => {
    const page = await context.newPage();
    const { accessToken } = (await (await page.request.get(`/dev/token?sub=${devSub}`)).json()) as { accessToken: string };
    await page.addInitScript((token) => sessionStorage.setItem('warships.devAccessToken', token), accessToken);
    return page;
  };
  const admiral = await tab('dev-admiral');
  const captain = await tab('dev-captain');
  const url = '/warships/3b2f8d1e-6c4a-4e7b-9a10-5d2c7e8f9a01';
  const seatOf = (page: Page) => page.evaluate(() => (window as DebugWindow).__warships?.model.snapshot?.you?.seatId ?? null);

  await openTable({ page: admiral, frames: [] }, url);
  await openTable({ page: captain, frames: [] }, url);
  for (const page of [admiral, captain]) {
    await waitStatus(page, 'placing');
  }
  expect(await seatOf(admiral)).toBe('1');
  expect(await seatOf(captain)).toBe('2');

  for (const page of [captain, admiral]) {
    await page.reload();
    await page.waitForFunction(() => !!(window as DebugWindow).__warships?.model.snapshot?.you);
  }
  expect(await seatOf(admiral)).toBe('1');
  expect(await seatOf(captain)).toBe('2');
  const seats = (await snapshotOf(admiral)).seats;
  expect(seats.map((s) => [s.displayName, s.connected])).toEqual([
    ['Admiral', true],
    ['Captain', true],
  ]);
  await context.close();
});

test('a signed-out visitor is asked to sign in and comes back to the same table', async ({ page }) => {
  const tableUrl = '/warships/00000000-0000-4000-8000-000000000000';
  await page.goto(tableUrl);
  await expect(page.getByRole('link', { name: 'Sign in', exact: true }).first()).toHaveAttribute(
    'href',
    `/sign-in?next=${encodeURIComponent(tableUrl)}`,
  );
  await page.goto('/warships');
  await expect(page.getByRole('link', { name: 'Sign in', exact: true }).first()).toHaveAttribute(
    'href',
    `/sign-in?next=${encodeURIComponent('/warships')}`,
  );
});

test('an unknown table id says table not found to a member', async ({ browser }) => {
  const { page } = await signedInPage(browser, 'dev-captain');
  await page.goto('/warships/00000000-0000-4000-8000-000000000000');
  await expect(page.getByRole('heading', { name: 'Table not found' })).toBeVisible();
});
