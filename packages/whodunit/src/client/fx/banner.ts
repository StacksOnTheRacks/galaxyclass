import { EASE_OUT, FxClock } from './animate.js';
import { REDUCED_FADE_MS } from './timeline.js';

export type BannerTone = 'mine' | 'theirs' | 'neutral' | 'win' | 'lose' | 'alarm';

export interface BannerSpec {
  title: string;
  sub?: string;
  tone: BannerTone;
  /** Shown above the title, e.g. "Suggestion". */
  kicker?: string;
}

const SLIDE_MS = 250;
const FADE_MS = 200;
export const BANNER_HOLD_MS = 1100;

function bannerElement(spec: BannerSpec): HTMLElement {
  const banner = document.createElement('div');
  banner.className = 'wd-banner';
  banner.dataset.tone = spec.tone;
  banner.setAttribute('aria-hidden', 'true');
  if (spec.kicker) {
    const kicker = document.createElement('span');
    kicker.className = 'wd-banner-kicker';
    kicker.textContent = spec.kicker;
    banner.append(kicker);
  }
  const title = document.createElement('strong');
  title.className = 'wd-banner-title';
  title.textContent = spec.title;
  banner.append(title);
  if (spec.sub) {
    const sub = document.createElement('span');
    sub.className = 'wd-banner-sub';
    sub.textContent = spec.sub;
    banner.append(sub);
  }
  return banner;
}

/**
 * A banner that slides down over the board, holds, and fades: on the event clock when `clock` is
 * an event's, so every detective reads "Captain Rook, with the Poison Vial…" together. Screen
 * readers get the same news from the live region instead.
 */
export function scheduleBanner(
  layer: HTMLElement,
  spec: BannerSpec,
  options: { clock?: FxClock; start?: number; hold?: number; reduced: boolean },
): { element: HTMLElement; done: number } {
  const clock = options.clock ?? new FxClock(0);
  const start = options.start ?? 0;
  const hold = options.hold ?? BANNER_HOLD_MS;
  const element = bannerElement(spec);
  layer.append(element);
  const enter = options.reduced ? REDUCED_FADE_MS : SLIDE_MS;
  const exit = options.reduced ? REDUCED_FADE_MS : FADE_MS;
  const total = enter + hold + exit;
  const frames: Keyframe[] = options.reduced
    ? [{ opacity: 0 }, { opacity: 1, offset: enter / total }, { opacity: 1, offset: (enter + hold) / total }, { opacity: 0 }]
    : [
        { transform: 'translateY(-110%)', opacity: 0, easing: EASE_OUT },
        { transform: 'translateY(0)', opacity: 1, offset: enter / total },
        { transform: 'translateY(0)', opacity: 1, offset: (enter + hold) / total },
        { transform: 'translateY(0) scale(0.98)', opacity: 0 },
      ];
  const animation = clock.at(element, frames, { start, duration: total });
  const remaining = start + total - clock.elapsed;
  if (!animation) {
    // No WAAPI: show it plainly for the same span.
    element.style.opacity = start <= clock.elapsed ? '1' : '0';
    if (start > clock.elapsed) {
      setTimeout(() => (element.style.opacity = '1'), start - clock.elapsed);
    }
  }
  setTimeout(() => element.remove(), Math.max(0, remaining) + 50);
  return { element, done: remaining };
}
