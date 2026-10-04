import './styles.css';
import { loadConfig } from './config.js';
import { renderLobby, renderMessage } from './lobby.js';
import { parseRoute, publicBase } from './route.js';

async function fontsReady(): Promise<void> {
  if (!document.fonts) {
    return;
  }
  const loads = ['800 32px Poppins', '900 32px Poppins', '600 16px Inter', '700 16px Inter'].map((font) =>
    document.fonts.load(font).catch(() => []),
  );
  await Promise.race([Promise.all(loads), new Promise((resolve) => setTimeout(resolve, 1500))]);
}

async function main(): Promise<void> {
  const host = document.getElementById('app')!;
  const route = parseRoute(window.location.pathname);
  if (route.kind === 'not_found') {
    renderMessage(host, 'Table not found', 'That address is not a Scribble table.', 'See open tables', publicBase());
    return;
  }
  const config = await loadConfig(fetch);
  if (!config) {
    renderMessage(host, 'Scribble is unavailable', 'The tables could not be reached. Try again in a moment.');
    return;
  }
  if (route.kind === 'lobby') {
    renderLobby(host, config);
    return;
  }
  await fontsReady();
  const { startTable } = await import('./table-app.js');
  startTable(host, config, route.tableId);
}

void main();
