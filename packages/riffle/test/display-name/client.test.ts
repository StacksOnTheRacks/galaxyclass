// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DISPLAY_NAME_ERROR_MESSAGE } from '../../src/shared/display-name.js';
import { IDENTITY_SESSION_KEY } from '../../src/client/identity/session.js';
import { openDisplayNameEditor, postDisplayName } from '../../src/client/display-name.js';
import { renderTableShell } from '../../src/client/surfaces/table-shell.js';

const seats = [
  { seatId: 's_1', playerSubject: 'anon:1', displayName: null, stack: 10000 },
  { seatId: 's_2', playerSubject: null, displayName: null, stack: 10000 },
];

describe('display-name client', () => {
  beforeEach(() => {
    document.body.innerHTML = '<main id="app"></main>';
    sessionStorage.clear();
    sessionStorage.setItem(
      IDENTITY_SESSION_KEY,
      JSON.stringify({ bearer: 'bearer-1', playerSubject: 'anon:1' }),
    );
  });

  it('opens overlay with title, helper, labeled field, and Save', () => {
    const root = document.getElementById('app')!;
    renderTableShell(root, {
      matchId: 'm_ui',
      seatId: 's_1',
      seats,
      onEditDisplayName: () => {
        openDisplayNameEditor(root, {
          matchId: 'm_ui',
          seatId: 's_1',
          seats,
        });
      },
    });

    root.querySelector<HTMLButtonElement>('.table-edit-display-name')!.click();

    expect(root.querySelector('[data-surface="display-name-edit"]')).not.toBeNull();
    expect(root.textContent).toContain('Edit display name');
    expect(root.textContent).toContain('Shown to other players at the table');
    expect(root.querySelector('label[for="display-name-input"]')?.textContent).toBe('Display name');
    expect(root.querySelector('.display-name-save')?.textContent).toBe('Save');
    expect((root.querySelector('#display-name-input') as HTMLInputElement).value).toBe('');
  });

  it('successful save closes overlay and updates roster label', async () => {
    const root = document.getElementById('app')!;
    const updatedSeats = [
      { seatId: 's_1', playerSubject: 'anon:1', displayName: 'LuckyAce', stack: 10000 },
      { seatId: 's_2', playerSubject: null, displayName: null, stack: 10000 },
    ];

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input.url;
        if (url.endsWith('/display-name') && init?.method === 'POST') {
          return new Response(
            JSON.stringify({
              matchId: 'm_ui',
              seatId: 's_1',
              seats: updatedSeats,
              currentSeat: null,
            }),
            { status: 200 },
          );
        }
        return new Response('{}', { status: 404 });
      }),
    );

    openDisplayNameEditor(root, {
      matchId: 'm_ui',
      seatId: 's_1',
      seats,
    });

    const input = root.querySelector('#display-name-input') as HTMLInputElement;
    input.value = 'LuckyAce';
    root.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    await vi.waitFor(() => {
      expect(root.dataset.surface).toBe('table-shell');
    });
    expect(root.textContent).toContain('Seat 1 · LuckyAce');
    expect(root.textContent).not.toContain('anon:1');
  });

  it('shows validation error and keeps overlay open', async () => {
    const root = document.getElementById('app')!;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ error: 'invalid_display_name', message: DISPLAY_NAME_ERROR_MESSAGE }), {
          status: 400,
        }),
      ),
    );

    openDisplayNameEditor(root, {
      matchId: 'm_ui',
      seatId: 's_1',
      seats,
    });

    const input = root.querySelector('#display-name-input') as HTMLInputElement;
    input.value = 'Ab';
    root.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    await vi.waitFor(() => {
      expect(root.textContent).toContain(DISPLAY_NAME_ERROR_MESSAGE);
    });
    expect(root.querySelector('[data-surface="display-name-edit"]')).not.toBeNull();
  });

  it('shows Saving… polite live status while request is in flight', async () => {
    const root = document.getElementById('app')!;
    let resolveSave: (value: Response) => void = () => {};
    const pending = new Promise<Response>((resolve) => {
      resolveSave = resolve;
    });

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => pending),
    );

    openDisplayNameEditor(root, {
      matchId: 'm_ui',
      seatId: 's_1',
      seats,
    });

    const input = root.querySelector('#display-name-input') as HTMLInputElement;
    input.value = 'LuckyAce';
    root.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    await vi.waitFor(() => {
      expect(root.textContent).toContain('Saving…');
    });
    expect(root.querySelector('.display-name-save')?.hidden).toBe(true);
    expect(input.disabled).toBe(true);

    resolveSave(
      new Response(
        JSON.stringify({
          matchId: 'm_ui',
          seatId: 's_1',
          seats: [{ ...seats[0]!, displayName: 'LuckyAce' }, seats[1]!],
          currentSeat: null,
        }),
        { status: 200 },
      ),
    );

    await vi.waitFor(() => {
      expect(root.dataset.surface).toBe('table-shell');
    });
  });

  it('postDisplayName sends bearer from sessionStorage', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await postDisplayName('m_test', 'LuckyAce');
    expect(fetchMock).toHaveBeenCalledWith(
      '/v1/play/matches/m_test/display-name',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer bearer-1' }),
      }),
    );
  });

  it('Leave table control remains on waiting-for-deal shell', () => {
    const root = document.getElementById('app')!;
    renderTableShell(root, {
      matchId: 'm_ui',
      seatId: 's_1',
      seats,
    });
    expect(root.querySelector('.action-leave-table')?.textContent).toBe('Leave table');
  });
});
