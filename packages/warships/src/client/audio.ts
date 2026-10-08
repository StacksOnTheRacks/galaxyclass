/**
 * Synthesized sonar sounds: no audio files, nothing until the captain has interacted with the
 * page (browsers block audio before that), and a mute toggle remembered in localStorage.
 */
export const MUTE_KEY = 'warships.muted';

export type SoundName = 'sweep' | 'tick' | 'ping' | 'hit' | 'splash' | 'sink' | 'turn' | 'victory' | 'defeat';

type AudioCtor = typeof AudioContext;

export class SonarAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private mutedValue: boolean;
  private unlocked = false;

  constructor(
    private readonly storage: Pick<Storage, 'getItem' | 'setItem'> | null,
    private readonly Ctor: AudioCtor | null = typeof window === 'undefined'
      ? null
      : ((window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioCtor }).webkitAudioContext) ?? null),
  ) {
    let stored: string | null = null;
    try {
      stored = storage?.getItem(MUTE_KEY) ?? null;
    } catch {
      stored = null;
    }
    this.mutedValue = stored === '1';
  }

  get muted(): boolean {
    return this.mutedValue;
  }

  get available(): boolean {
    return this.Ctor !== null;
  }

  setMuted(muted: boolean): void {
    this.mutedValue = muted;
    try {
      this.storage?.setItem(MUTE_KEY, muted ? '1' : '0');
    } catch {
      // Private mode: the toggle still works for this visit.
    }
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(muted ? 0 : 0.5, this.ctx.currentTime, 0.02);
    }
    if (!muted) {
      this.unlock();
    }
  }

  /** Call from a user gesture (click, key). */
  unlock(): void {
    this.unlocked = true;
    const ctx = this.context();
    if (ctx && ctx.state === 'suspended') {
      void ctx.resume().catch(() => {});
    }
  }

  /** Plays `name` `delayMs` from now; negative delays (already past) are skipped. */
  play(name: SoundName, delayMs = 0): void {
    if (this.mutedValue || !this.unlocked || delayMs < -40) {
      return;
    }
    const ctx = this.context();
    if (!ctx || !this.master || ctx.state !== 'running') {
      return;
    }
    const t = ctx.currentTime + Math.max(0, delayMs) / 1000;
    switch (name) {
      case 'sweep':
        this.tone(t, 1180, 880, 0.9, 0.22, 'sine');
        this.tone(t + 0.32, 1180, 900, 0.6, 0.06, 'sine');
        break;
      case 'tick':
        this.tone(t, 2400, 2200, 0.03, 0.04, 'square');
        break;
      case 'ping':
        this.tone(t, 1560, 1500, 0.55, 0.26, 'sine');
        this.tone(t + 0.18, 1560, 1500, 0.4, 0.07, 'sine');
        break;
      case 'hit':
        this.burst(t, 0.5, 900, 0.5);
        this.tone(t, 110, 38, 0.5, 0.55, 'sine');
        break;
      case 'splash':
        this.burst(t, 0.45, 2600, 0.22, 600);
        this.tone(t, 420, 180, 0.18, 0.06, 'triangle');
        break;
      case 'sink':
        this.tone(t, 90, 30, 1.4, 0.4, 'sawtooth', 380);
        this.burst(t + 0.1, 1.2, 500, 0.25);
        break;
      case 'turn':
        this.tone(t, 660, 660, 0.12, 0.08, 'sine');
        this.tone(t + 0.12, 990, 990, 0.16, 0.08, 'sine');
        break;
      case 'victory':
        [523, 659, 784, 1047].forEach((f, i) => this.tone(t + i * 0.14, f, f, 0.32, 0.14, 'triangle'));
        break;
      case 'defeat':
        [392, 330, 262].forEach((f, i) => this.tone(t + i * 0.2, f, f * 0.97, 0.4, 0.12, 'triangle'));
        break;
    }
  }

  private context(): AudioContext | null {
    if (this.ctx || !this.Ctor || !this.unlocked) {
      return this.ctx;
    }
    try {
      this.ctx = new this.Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.mutedValue ? 0 : 0.5;
      this.master.connect(this.ctx.destination);
    } catch {
      this.ctx = null;
    }
    return this.ctx;
  }

  private tone(t: number, from: number, to: number, duration: number, peak: number, type: OscillatorType, lowpass?: number): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t + duration);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(peak, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    let node: AudioNode = osc;
    if (lowpass) {
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = lowpass;
      osc.connect(filter);
      node = filter;
    }
    node.connect(gain);
    gain.connect(this.master!);
    osc.start(t);
    osc.stop(t + duration + 0.05);
  }

  private burst(t: number, duration: number, cutoff: number, peak: number, sweepTo?: number): void {
    const ctx = this.ctx!;
    if (!this.noise) {
      const length = Math.floor(ctx.sampleRate * 1.5);
      this.noise = ctx.createBuffer(1, length, ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < length; i++) {
        data[i] = Math.random() * 2 - 1;
      }
    }
    const source = ctx.createBufferSource();
    source.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = sweepTo ? 'bandpass' : 'lowpass';
    filter.frequency.setValueAtTime(cutoff, t);
    if (sweepTo) {
      filter.frequency.exponentialRampToValueAtTime(sweepTo, t + duration);
    }
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(peak, t + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.master!);
    source.start(t);
    source.stop(t + duration + 0.05);
  }
}
