/** Full page load, for paths served outside the Next app (the games). */
export function hardNavigate(path: string): void {
  window.location.assign(path);
}
