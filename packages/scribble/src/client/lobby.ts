import type { ScribbleConfig } from './config.js';
import { tablePath } from './route.js';
import { fetchTableList, type TableList } from './session.js';

function occupancy(entry: TableList[number] | undefined): string {
  if (!entry) {
    return 'Open';
  }
  const seats = `${entry.seatedCount}/${entry.maxSeats} seated`;
  return entry.status === 'playing' ? `${seats} · game in progress` : seats;
}

/** `/scribble`: the configured open tables, with live seat counts once the server answers. */
export function renderLobby(host: HTMLElement, config: ScribbleConfig): void {
  const list = document.createElement('ul');
  list.className = 'lobby-tables';
  const rows = new Map<string, HTMLElement>();
  for (const table of config.tables) {
    const item = document.createElement('li');
    const link = document.createElement('a');
    link.href = tablePath(table.id);
    link.className = 'lobby-table';
    link.innerHTML = '<span class="lobby-name"></span><span class="lobby-blurb"></span><span class="lobby-seats"></span>';
    link.querySelector('.lobby-name')!.textContent = table.name;
    link.querySelector('.lobby-blurb')!.textContent = table.blurb;
    link.querySelector('.lobby-seats')!.textContent = '…';
    item.append(link);
    list.append(item);
    rows.set(table.id, link);
  }

  const main = document.createElement('main');
  main.className = 'lobby';
  main.innerHTML = `
    <header class="lobby-header">
      <span class="brand-mark" aria-hidden="true">S</span>
      <div>
        <h1>Scribble</h1>
        <p>A word game for two to four players. Pick a table and take a seat — sign in to Galaxy Class to play under your gamer tag, or sit down as a guest.</p>
      </div>
    </header>`;
  if (config.tables.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'lobby-empty';
    empty.textContent = 'No tables are open right now.';
    main.append(empty);
  } else {
    main.append(list);
  }
  host.replaceChildren(main);

  void fetchTableList(
    config.webSocketUrl,
    config.tables.map((table) => table.id),
  ).then((tables) => {
    const byId = new Map((tables ?? []).map((entry) => [entry.tableId, entry]));
    for (const [id, link] of rows) {
      const entry = byId.get(id);
      const seats = link.querySelector('.lobby-seats')!;
      if (tables && !entry) {
        link.closest('li')?.remove();
        continue;
      }
      seats.textContent = tables ? occupancy(entry) : '';
    }
  });
}

export function renderMessage(host: HTMLElement, title: string, body: string, linkText = 'See open tables', href?: string): void {
  const main = document.createElement('main');
  main.className = 'lobby message';
  const heading = document.createElement('h1');
  heading.textContent = title;
  const text = document.createElement('p');
  text.textContent = body;
  main.append(heading, text);
  if (href) {
    const link = document.createElement('a');
    link.href = href;
    link.className = 'lobby-back';
    link.textContent = linkText;
    main.append(link);
  }
  host.replaceChildren(main);
}
