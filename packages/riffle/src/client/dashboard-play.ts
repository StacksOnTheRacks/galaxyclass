import './dashboard/styles.css';
import './dashboard-play/styles.css';
import { startDashboardPlay } from './dashboard-play/session.js';

const root = typeof document !== 'undefined' ? document.getElementById('app') : null;
if (root) {
  void startDashboardPlay({
    root,
    pathname: window.location.pathname,
    fetch: window.fetch.bind(window),
    createSocket: (url) => new WebSocket(url),
  });
}
