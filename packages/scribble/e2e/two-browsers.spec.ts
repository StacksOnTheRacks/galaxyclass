import { expect, test, type Browser, type Page } from '@playwright/test';
import type { ScribbleDebug } from '../src/client/table-app.js';

declare global {
  interface Window {
    __scribble?: ScribbleDebug;
  }
}

const SCRIPTED = 'c2b7f5a0-3d1e-4f6a-9b8c-5e4d3c2b1a00';
const TABLE_URL = `/scribble/${SCRIPTED}`;

async function signedInPage(browser: Browser, devSub: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const frames: string[] = [];
  page.on('websocket', (socket) => socket.on('framereceived', (frame) => frames.push(String(frame.payload))));
  page.on('pageerror', (error) => console.log('[pageerror]', error.message));
  const response = await page.request.get(`/dev/token?sub=${devSub}`);
  const { accessToken } = (await response.json()) as { accessToken: string };
  await context.addInitScript((token) => sessionStorage.setItem('scribble.devAccessToken', token), accessToken);
  return { page, frames };
}

async function openPlayer(browser: Browser, devSub: string) {
  const player = await signedInPage(browser, devSub);
  await player.page.goto(TABLE_URL);
  await player.page.waitForFunction(() => !!window.__scribble?.model.snapshot?.you);
  return player;
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

test('two members finish a game with hidden racks, the count, themes, a locked seat, and a rejoin', async ({ browser }, testInfo) => {
  const alice = await openPlayer(browser, 'dev-word-smith');
  const quill = await openPlayer(browser, 'dev-quill-driver');

  const seatsSeenByQuill = await state(quill.page, (d) => d.model.snapshot!.seats.filter((s) => s.occupied));
  expect(seatsSeenByQuill.map((s) => [s.seatId, s.displayName, s.signedIn])).toEqual([
    ['1', 'WordSmith', true],
    ['2', 'QuillDriver', true],
  ]);

  await alice.page.getByRole('button', { name: 'Start game' }).click();
  await alice.page.waitForFunction(() => window.__scribble!.model.snapshot?.status === 'playing');
  await quill.page.waitForFunction(() => window.__scribble!.model.snapshot?.status === 'playing');
  const aliceRack = await state(alice.page, (d) => d.model.rack.map((t) => t.letter).join(''));
  const quillRack = await state(quill.page, (d) => d.model.rack.map((t) => t.letter).join(''));
  expect(aliceRack).toBe('CATDOGS');
  expect(quillRack).toBe('HEARTSE');
  await expect(alice.page.locator('.turn-status')).toHaveText('Your turn');
  await expect(quill.page.locator('.turn-status')).toHaveText("WordSmith's turn");

  // A member who opens the link mid-game can watch, but every seat stays locked until the game ends.
  const late = await signedInPage(browser, 'dev-ink-blot');
  await late.page.goto(TABLE_URL);
  await late.page.waitForFunction(() => window.__scribble?.model.snapshot?.status === 'playing');
  await expect(late.page.locator('.toast')).toContainText('seats are locked');
  await expect(late.page.getByRole('button', { name: 'Seats locked' })).toBeDisabled();
  expect(await state(late.page, (d) => d.model.snapshot!.you)).toBeNull();
  expect(await state(alice.page, (d) => d.model.snapshot!.seats.filter((s) => s.occupied).length)).toBe(2);
  await late.page.context().close();

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
  await waitTurn(quill.page, 1);
  for (const page of [alice.page, quill.page]) {
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
  await quill.page.screenshot({ path: testInfo.outputPath('turn-1-quill.png') });

  // Turn 2: HEART down onto the T, with a triple letter under the A.
  await dragToSquare(quill.page, 'H', 3, 9);
  await dragToSquare(quill.page, 'E', 4, 9);
  await dragToSquare(quill.page, 'A', 5, 9);
  await dragToSquare(quill.page, 'R', 6, 9);
  await quill.page.getByRole('button', { name: 'Play', exact: true }).click();
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
  const heldRack = await state(quill.page, (d) => d.model.rack.map((t) => t.id).join(','));
  const quillContext = quill.page.context();
  await quill.page.close();
  await alice.page.waitForFunction(() => window.__scribble!.model.snapshot!.seats.find((s) => s.seatId === '2')?.connected === false);
  await expect(alice.page.locator('.seat.away')).toContainText('Away');
  expect(await state(alice.page, (d) => d.model.snapshot!.status)).toBe('playing');
  quill.page = await quillContext.newPage();
  quill.page.on('websocket', (socket) => socket.on('framereceived', (frame) => quill.frames.push(String(frame.payload))));
  await quill.page.goto(TABLE_URL);
  await quill.page.waitForFunction(() => window.__scribble?.model.snapshot?.you?.seatId === '2');
  expect(await state(quill.page, (d) => d.model.rack.map((t) => t.id).join(','))).toBe(heldRack);
  await alice.page.waitForFunction(() => window.__scribble!.model.snapshot!.seats.find((s) => s.seatId === '2')?.connected === true);

  // A rejected word comes back as a message, and the tiles stay in the draft.
  await dragToSquare(alice.page, 'D', 8, 8);
  await dragToSquare(alice.page, 'G', 8, 7);
  await alice.page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(alice.page.locator('.toast')).toContainText('word list');
  await alice.page.getByRole('button', { name: 'Recall' }).click();

  // The theme is shared by the table.
  await alice.page.getByLabel('Table theme').selectOption('halloween');
  await quill.page.waitForFunction(() => window.__scribble!.model.theme.id === 'halloween');
  await expect(quill.page.locator('.table-screen')).toHaveAttribute('data-theme', 'halloween');
  await quill.page.waitForTimeout(400);
  await quill.page.screenshot({ path: testInfo.outputPath('halloween-quill.png') });
  await quill.page.getByLabel('Table theme').selectOption('christmas');
  await alice.page.waitForFunction(() => window.__scribble!.model.theme.id === 'christmas');
  await alice.page.waitForTimeout(400);
  await alice.page.screenshot({ path: testInfo.outputPath('christmas-alice.png') });

  // Six scoreless turns end the game, then racks are subtracted.
  for (let turn = 3; turn <= 8; turn++) {
    const mover = turn % 2 === 1 ? alice.page : quill.page;
    await mover.getByRole('button', { name: 'Pass' }).click();
    await waitTurn(alice.page, turn);
  }
  await alice.page.waitForFunction(() => window.__scribble!.model.snapshot?.status === 'ended');
  const ended = await state(alice.page, (d) => d.model.snapshot!);
  expect(ended.endReason).toBe('scoreless_turns');
  const aliceScore = ended.seats.find((s) => s.seatId === '1')!.score;
  const quillScore = ended.seats.find((s) => s.seatId === '2')!.score;
  expect(aliceScore).toBe(10 + ended.finalAdjustments!['1']!);
  expect(quillScore).toBe(10 + ended.finalAdjustments!['2']!);
  expect(ended.finalAdjustments!['1']).toBeLessThan(0);
  await expect(quill.page.locator('.end-panel')).toBeVisible();
  await expect(quill.page.locator('.end-panel')).toContainText('Six scoreless turns');
  await quill.page.screenshot({ path: testInfo.outputPath('game-over-quill.png') });

  // Leave and sit back down.
  await quill.page.getByRole('button', { name: 'Leave seat' }).click();
  await quill.page.waitForFunction(() => window.__scribble!.model.snapshot?.you === null);
  await alice.page.waitForFunction(() => window.__scribble!.model.snapshot!.seats.filter((s) => s.occupied).length === 1);
  await quill.page.getByRole('button', { name: 'Sit down' }).click();
  await quill.page.waitForFunction(() => !!window.__scribble!.model.snapshot?.you);
  await alice.page.waitForFunction(() => window.__scribble!.model.snapshot!.seats.filter((s) => s.occupied).length === 2);

  // Nothing QuillDriver received ever carried WordSmith's tiles or server-only fields.
  const aliceTileIds = new Set<string>();
  for (const frame of alice.frames) {
    const message = JSON.parse(frame) as { type?: string; you?: { rack: Array<{ id: string }> } | null };
    for (const tile of message.you?.rack ?? []) {
      aliceTileIds.add(tile.id);
    }
  }
  expect(aliceTileIds.size).toBeGreaterThanOrEqual(7);
  const quillWire = quill.frames.join('\n');
  for (const id of aliceTileIds) {
    expect(quillWire).not.toContain(id);
  }
  for (const secret of ['seatTokenHash', 'playerSub', 'connectionId', '"bag":', 'dev-word-smith']) {
    expect(quillWire).not.toContain(secret);
  }
});

test('a signed-out visitor is asked to sign in before seeing any table', async ({ page }) => {
  await page.goto(TABLE_URL);
  await expect(page.getByRole('heading', { name: 'Members only' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Sign in', exact: true }).first()).toHaveAttribute(
    'href',
    `/sign-in?next=${encodeURIComponent(TABLE_URL)}`,
  );
  await page.goto('/scribble/a/b');
  await expect(page.getByRole('heading', { name: 'Table not found' })).toBeVisible();
  await page.goto('/scribble');
  await expect(page.getByRole('heading', { name: 'Scribble is for Galaxy Class members' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Back to the Galaxy Class game library' })).toHaveAttribute('href', '/');
});

test('an unknown table id says table not found to a member', async ({ browser }) => {
  const { page } = await signedInPage(browser, 'dev-quill-driver');
  await page.goto('/scribble/00000000-0000-4000-8000-000000000000');
  await expect(page.getByRole('heading', { name: 'Table not found' })).toBeVisible();
});

test('a member manages their own tables: create, invite link, and enter', async ({ browser }, testInfo) => {
  const { page } = await signedInPage(browser, 'dev-word-smith');
  await page.goto('/scribble');
  await expect(page.locator('.gc-game-header-player-name')).toHaveText('WordSmith');
  await expect(page.locator('.sl-card')).toHaveCount(3);
  for (const name of ['Inkwell', 'Margins', 'Scripted practice']) {
    await expect(page.getByRole('heading', { level: 3, name })).toBeVisible();
  }
  await page.screenshot({ path: testInfo.outputPath('table-list.png'), fullPage: true });

  await page.getByLabel('Table name').fill('Friday word night');
  await page.getByRole('button', { name: 'Create table' }).click();
  const card = page.locator('.sl-card').first();
  await expect(card.getByRole('heading', { name: 'Friday word night' })).toBeVisible();
  await expect(page.getByRole('status')).toContainText('Friday word night is ready');
  const link = await card.locator('.sl-invite-field').inputValue();
  expect(link).toMatch(/\/scribble\/[0-9a-f-]{36}$/);
  await page.screenshot({ path: testInfo.outputPath('table-created.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: testInfo.outputPath('table-created-phone.png'), fullPage: true });

  const friend = await signedInPage(browser, 'dev-quill-driver');
  await friend.page.goto(link);
  await friend.page.waitForFunction(() => !!window.__scribble?.model.snapshot?.you);
  await page.reload();
  const hosted = page.locator('.sl-card').filter({ has: page.getByRole('heading', { name: 'Friday word night' }) });
  await expect(hosted.locator('.sl-seat:not(.sl-seat-open)')).toHaveAttribute('aria-label', 'QuillDriver');

  // The table is now on the friend's own list; leaving before the game starts frees their seat.
  await friend.page.goto('/scribble');
  const newest = friend.page.locator('.sl-card').first();
  await expect(newest.getByRole('heading', { level: 3 })).toHaveText('Friday word night');
  await expect(newest.locator('.sl-card-meta')).not.toContainText('You host');
  await expect(newest.locator('.sl-btn-primary')).toHaveText('Take a seat');
  await expect(friend.page.getByRole('heading', { level: 3, name: 'Inkwell' })).toHaveCount(0);
  await expect(newest.getByRole('button', { name: 'Remove from my tables' })).toBeVisible();
  await expect(newest.getByRole('button', { name: 'Delete table' })).toHaveCount(0);

  // Only the host can delete it, and the friend sitting at it is told.
  await friend.page.goto(link);
  await friend.page.waitForFunction(() => !!window.__scribble?.model.snapshot?.you);
  page.once('dialog', (dialog) => {
    expect(dialog.message()).toContain('Delete “Friday word night” for everyone?');
    void dialog.accept();
  });
  await hosted.getByRole('button', { name: 'Delete table' }).click();
  await expect(page.getByRole('status')).toHaveText('Friday word night deleted.');
  await expect(page.getByRole('heading', { level: 3, name: 'Friday word night' })).toHaveCount(0);
  await expect(friend.page.getByRole('heading', { name: 'Table deleted' })).toBeVisible();
  await friend.page.goto('/scribble');
  await expect(friend.page.getByRole('heading', { level: 3, name: 'Friday word night' })).toHaveCount(0);
});
