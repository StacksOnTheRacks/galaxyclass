export const SVG_NS = 'http://www.w3.org/2000/svg';

export function svg<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
  ...children: SVGElement[]
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attrs)) {
    node.setAttribute(name, String(value));
  }
  node.append(...children);
  return node;
}

export interface Cue {
  /** ms from the event's start. */
  start: number;
  duration: number;
  easing?: string;
  fill?: FillMode;
  iterations?: number;
}

/**
 * Every animation of an event shares one clock: each starts `start` ms after the event begins and
 * is seeked to `elapsed`, so a detective who arrives mid-walk sees the token exactly where everyone
 * else does. Elements without WAAPI (old browsers, tests) simply skip the motion.
 */
export class FxClock {
  readonly animations: Animation[] = [];

  constructor(readonly elapsed: number) {}

  at(el: Element, keyframes: Keyframe[], cue: Cue): Animation | null {
    if (typeof (el as Partial<Element>).animate !== 'function' || cue.duration <= 0) {
      return null;
    }
    const animation = el.animate(keyframes, {
      duration: cue.duration,
      delay: cue.start,
      easing: cue.easing ?? 'linear',
      fill: cue.fill ?? 'both',
      iterations: cue.iterations ?? 1,
    });
    animation.currentTime = this.elapsed;
    this.animations.push(animation);
    return animation;
  }

  cancel(): void {
    for (const animation of this.animations) {
      animation.cancel();
    }
    this.animations.length = 0;
  }
}

/** Deterministic per-event noise, so every detective sees the same dice tumble. */
export function seeded(seed: string): () => number {
  let state = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    state ^= seed.charCodeAt(i);
    state = Math.imul(state, 16777619);
  }
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return ((state >>> 0) % 10000) / 10000;
  };
}

export const EASE_OUT = 'cubic-bezier(0.22, 1, 0.36, 1)';
export const EASE_IN_OUT = 'cubic-bezier(0.65, 0, 0.35, 1)';
