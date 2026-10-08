const QUERY = '(prefers-reduced-motion: reduce)';

/** Tracks `prefers-reduced-motion`; reduced motion swaps every walk, camera flight, and tumble for cuts and fades. */
export class MotionPreference {
  private readonly media: MediaQueryList | null;

  constructor(win: Pick<Window, 'matchMedia'> | null = typeof window === 'undefined' ? null : window) {
    this.media = win?.matchMedia ? win.matchMedia(QUERY) : null;
  }

  get reduced(): boolean {
    return this.media?.matches ?? false;
  }

  onChange(listener: (reduced: boolean) => void): void {
    this.media?.addEventListener?.('change', (event) => listener(event.matches));
  }
}
