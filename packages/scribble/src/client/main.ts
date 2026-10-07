import '@galaxyclass/accounts/game-header.css';
import './styles.css';
import './lobby.css';
import { loadConfig } from './config.js';
import { renderLobby, renderNotice } from './lobby.js';
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
    renderNotice(host, {
      title: 'Table not found',
      body: 'That address is not a Scribble table.',
      actions: [{ label: 'Back to your tables', href: publicBase(), primary: true }],
    });
    return;
  }
  const config = await loadConfig(fetch);
  if (!config) {
    renderNotice(host, { title: 'Scribble is unavailable', body: 'The tables could not be reached. Try again in a moment.' });
    return;
  }
  if (route.kind === 'lobby') {
    await renderLobby(host, config);
    return;
  }
  await fontsReady();
  const { startTable } = await import('./table-app.js');
  startTable(host, config, route.tableId);
}

void main();
