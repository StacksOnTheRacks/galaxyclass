import { expect, test, type Browser, type Page } from '@playwright/test';
import type { ScribbleDebug } from '../src/client/table-app.js';

declare global {
  interface Window {
    __scribble?: ScribbleDebug;
  }
}

const SCRIPTED = 'c2b7f5a0-3d1e-4f6a-9b8c-5e4d3c2b1a00';
const TABLE_URL = `/scribble/${SCRIPTED}`;

async function openPlayer(browser: Browser, devSub?: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const frames: string[] = [];
  page.on('websocket', (socket) => socket.on('framereceived', (frame) => frames.push(String(frame.payload))));
  page.on('pageerror', (error) => console.log('[pageerror]', error.message));
  if (devSub) {
    const response = await page.request.get(`/dev/token?sub=${devSub}`);
    const { accessToken } = (await response.json()) as { accessToken: string };
    await context.addInitScript((token) => sessionStorage.setItem('scribble.devAccessToken', token), accessToken);
  }
  await page.goto(TABLE_URL);
  await page.waitForFunction(() => !!window.__scribble?.model.snapshot?.you);
  return { page, frames };
}

/** Reads from the dev test hook; `read` must be self-contained because it runs in the page. */
const state = <T>(page: Page, read: (debug: ScribbleDebug) => T): Promise<T> =>
  page.evaluate(`(${read.toString()})(window.__scribble)`) as Promise<T>;

async function waitTurn(page: Page, turnNumber: number) {
  await page.waitForFunction((n) => (window.__scribble?.model.snapshot?.turnNumber ?? -1) >= n, turnNumber);
}

async function rackIdFor(page: Page, letter: string): Promise<string> {
  return page.evaluate((l) => {
    const model = window.__scribble!.model;
    const tile = model.rackTiles.find((t) => t.letter === l);
    if (!tile) {
      throw new Error(`no ${l} on the rack`);
    }
    return tile.id;
  }, letter);
}

/** Drags a rack tile onto a square with real mouse input on the canvas. */
async function dragToSquare(page: Page, letter: string, row: number, col: number) {
  const tileId = await rackIdFor(page, letter);
  const from = await page.evaluate((id) => window.__scribble!.rackTilePoint(id), tileId);
  const to = await page.evaluate(([r, c]) => window.__scribble!.squarePoint(r!, c!), [row, col]);
  await page.mouse.move(from!.x, from!.y);
  await page.mouse.down();
  await page.mouse.move(from!.x + 12, from!.y - 12, { steps: 3 });
  await page.mouse.move(to.x, to.y, { steps: 10 });
  await page.mouse.up();
  await page.waitForFunction(
    ([id, r, c]) => {
      const spot = window.__scribble!.model.draft.placed[id as string];
      return spot?.row === r && spot?.col === c;
    },
    [tileId, row, col] as const,
  );
}

async function waitForCount(page: Page, label: string) {
  await page.waitForFunction((l) => window.__scribble!.model.timelineLog.includes(l), label, { timeout: 15_000 });
}

test('a signed-in player and a guest finish a game with hidden racks, the count, themes, and a rejoin', async ({ browser }, testInfo) => {
  const alice = await openPlayer(browser, 'dev-word-smith');
  const guest = await openPlayer(browser);

  const seatsSeenByGuest = await state(guest.page, (d) => d.model.snapshot!.seats.filter((s) => s.occupied));
  expect(seatsSeenByGuest.map((s) => [s.seatId, s.displayName, s.signedIn])).toEqual([
    ['1', 'WordSmith', true],
    ['2', expect.any(String), false],
  ]);
  expect(seatsSeenByGuest[1]!.displayName).not.toBe('WordSmith');

  await alice.page.getByRole('button', { name: 'Start game' }).click();
  await alice.page.waitForFunction(() => window.__scribble!.model.snapshot?.status === 'playing');
  await guest.page.waitForFunction(() => window.__scribble!.model.snapshot?.status === 'playing');
  const aliceRack = await state(alice.page, (d) => d.model.rack.map((t) => t.letter).join(''));
  const guestRack = await state(guest.page, (d) => d.model.rack.map((t) => t.letter).join(''));
  expect(aliceRack).toBe('CATDOGS');
  expect(guestRack).toBe('HEARTSE');
  await expect(alice.page.locator('.turn-status')).toHaveText('Your turn');
  await expect(guest.page.locator('.turn-status')).toHaveText("WordSmith's turn");

  // Turn 1: CAT across the centre square, which doubles the word.
  await dragToSquare(alice.page, 'C', 7, 7);
  await dragToSquare(alice.page, 'A', 7, 8);
  await dragToSquare(alice.page, 'T', 7, 9);
  const preview = alice.page.locator('.preview');
  await expect(preview).toHaveAttribute('data-tone', 'ok');
  await expect(preview).toContainText('CAT');
  await expect(preview.locator('.preview-total')).toContainText('10 points');
  await alice.page.screenshot({ path: testInfo.outputPath('turn-1-preview.png') });
  await alice.page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(preview).toBeHidden();
  await waitTurn(guest.page, 1);
  for (const page of [alice.page, guest.page]) {
    await waitForCount(page, '+10');
    expect(await state(page, (d) => d.model.timelineLog)).toEqual([
      'highlight CAT',
      '+3',
      '+1',
      '+1',
      '2× word ×2',
      'CAT 10',
      '+10',
    ]);
  }
  await guest.page.screenshot({ path: testInfo.outputPath('turn-1-guest.png') });

  // Turn 2: HEART down onto the T, with a triple letter under the A.
  await dragToSquare(guest.page, 'H', 3, 9);
  await dragToSquare(guest.page, 'E', 4, 9);
  await dragToSquare(guest.page, 'A', 5, 9);
  await dragToSquare(guest.page, 'R', 6, 9);
  await guest.page.getByRole('button', { name: 'Play', exact: true }).click();
  await waitTurn(alice.page, 2);
  await waitForCount(alice.page, '+10');
  expect(await state(alice.page, (d) => d.model.timelineLog)).toEqual([
    'highlight HEART',
    '+4',
    '+1',
    '+1',
    '+1',
    '+1',
    '3× letter +2',
    'HEART 10',
    '+10',
  ]);
  await alice.page.screenshot({ path: testInfo.outputPath('turn-2-alice.png') });
  await expect(alice.page.locator('.bag-count')).toContainText('HEART +10');

  // Closing the tab mid-game keeps the seat; a new tab takes it back with the same rack.
  const heldRack = await state(guest.page, (d) => d.model.rack.map((t) => t.id).join(','));
  const guestContext = guest.page.context();
  await guest.page.close();
  await alice.page.waitForFunction(() => window.__scribble!.model.snapshot!.seats.find((s) => s.seatId === '2')?.connected === false);
  await expect(alice.page.locator('.seat.away')).toContainText('Away');
  expect(await state(alice.page, (d) => d.model.snapshot!.status)).toBe('playing');
  guest.page = await guestContext.newPage();
  guest.page.on('websocket', (socket) => socket.on('framereceived', (frame) => guest.frames.push(String(frame.payload))));
  await guest.page.goto(TABLE_URL);
  await guest.page.waitForFunction(() => window.__scribble?.model.snapshot?.you?.seatId === '2');
  expect(await state(guest.page, (d) => d.model.rack.map((t) => t.id).join(','))).toBe(heldRack);
  await alice.page.waitForFunction(() => window.__scribble!.model.snapshot!.seats.find((s) => s.seatId === '2')?.connected === true);

  // A rejected word comes back as a message, and the tiles stay in the draft.
  await dragToSquare(alice.page, 'D', 8, 8);
  await dragToSquare(alice.page, 'G', 8, 7);
  await alice.page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(alice.page.locator('.toast')).toContainText('word list');
  await alice.page.getByRole('button', { name: 'Recall' }).click();

  // The theme is shared by the table.
  await alice.page.getByLabel('Table theme').selectOption('halloween');
  await guest.page.waitForFunction(() => window.__scribble!.model.theme.id === 'halloween');
  await expect(guest.page.locator('.table-screen')).toHaveAttribute('data-theme', 'halloween');
  await guest.page.waitForTimeout(400);
  await guest.page.screenshot({ path: testInfo.outputPath('halloween-guest.png') });
  await guest.page.getByLabel('Table theme').selectOption('christmas');
  await alice.page.waitForFunction(() => window.__scribble!.model.theme.id === 'christmas');
  await alice.page.waitForTimeout(400);
  await alice.page.screenshot({ path: testInfo.outputPath('christmas-alice.png') });

  // Six scoreless turns end the game, then racks are subtracted.
  for (let turn = 3; turn <= 8; turn++) {
    const mover = turn % 2 === 1 ? alice.page : guest.page;
    await mover.getByRole('button', { name: 'Pass' }).click();
    await waitTurn(alice.page, turn);
  }
  await alice.page.waitForFunction(() => window.__scribble!.model.snapshot?.status === 'ended');
  const ended = await state(alice.page, (d) => d.model.snapshot!);
  expect(ended.endReason).toBe('scoreless_turns');
  const aliceScore = ended.seats.find((s) => s.seatId === '1')!.score;
  const guestScore = ended.seats.find((s) => s.seatId === '2')!.score;
  expect(aliceScore).toBe(10 + ended.finalAdjustments!['1']!);
  expect(guestScore).toBe(10 + ended.finalAdjustments!['2']!);
  expect(ended.finalAdjustments!['1']).toBeLessThan(0);
  await expect(guest.page.locator('.end-panel')).toBeVisible();
  await expect(guest.page.locator('.end-panel')).toContainText('Six scoreless turns');
  await guest.page.screenshot({ path: testInfo.outputPath('game-over-guest.png') });

  // Leave and sit back down.
  await guest.page.getByRole('button', { name: 'Leave seat' }).click();
  await guest.page.waitForFunction(() => window.__scribble!.model.snapshot?.you === null);
  await alice.page.waitForFunction(() => window.__scribble!.model.snapshot!.seats.filter((s) => s.occupied).length === 1);
  await guest.page.getByRole('button', { name: 'Sit down' }).click();
  await guest.page.waitForFunction(() => !!window.__scribble!.model.snapshot?.you);
  await alice.page.waitForFunction(() => window.__scribble!.model.snapshot!.seats.filter((s) => s.occupied).length === 2);

  // Nothing the guest received ever carried the signed-in player's tiles or server-only fields.
  const aliceTileIds = new Set<string>();
  for (const frame of alice.frames) {
    const message = JSON.parse(frame) as { type?: string; you?: { rack: Array<{ id: string }> } | null };
    for (const tile of message.you?.rack ?? []) {
      aliceTileIds.add(tile.id);
    }
  }
  expect(aliceTileIds.size).toBeGreaterThanOrEqual(7);
  const guestWire = guest.frames.join('\n');
  for (const id of aliceTileIds) {
    expect(guestWire).not.toContain(id);
  }
  for (const secret of ['seatTokenHash', 'playerSub', 'connectionId', '"bag":', 'dev-word-smith']) {
    expect(guestWire).not.toContain(secret);
  }
});

test('an unknown table id says table not found', async ({ page }) => {
  await page.goto('/scribble/00000000-0000-4000-8000-000000000000');
  await expect(page.getByRole('heading', { name: 'Table not found' })).toBeVisible();
  await page.goto('/scribble/a/b');
  await expect(page.getByRole('heading', { name: 'Table not found' })).toBeVisible();
});

test('the lobby lists only the configured tables, with live seat counts', async ({ page }) => {
  await page.goto('/scribble');
  await expect(page.getByRole('heading', { name: 'Scribble' })).toBeVisible();
  await expect(page.locator('.lobby-table')).toHaveCount(3);
  await expect(page.locator('.lobby-seats').first()).toHaveText(/\d\/4 seated/);
});
