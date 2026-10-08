/**
 * Synthesized manor sounds: no audio files, nothing until the detective has interacted with the
 * page (browsers block audio before that), and a mute toggle remembered in localStorage.
 */
export const MUTE_KEY = 'whodunit.muted';

export type SoundName =
  | 'dice'
  | 'land'
  | 'step'
  | 'door'
  | 'passage'
  | 'sting'
  | 'pass'
  | 'card'
  | 'gasp'
  | 'drumroll'
  | 'right'
  | 'wrong'
  | 'turn'
  | 'win'
  | 'lose';

type AudioCtor = typeof AudioContext;

export class ManorAudio {
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
      case 'dice':
        // A rattle of little clacks in a cup, then the tumble across felt.
        for (let i = 0; i < 9; i++) {
          this.burst(t + i * 0.07 + (i % 3) * 0.012, 0.04, 3200 + (i % 4) * 500, 0.16, 1800);
        }
        break;
      case 'land':
        this.burst(t, 0.06, 2400, 0.22, 1200);
        this.burst(t + 0.09, 0.05, 2000, 0.16, 1000);
        break;
      case 'step':
        this.tone(t, 150, 90, 0.07, 0.1, 'sine', 600);
        this.burst(t, 0.05, 900, 0.05);
        break;
      case 'door':
        this.tone(t, 320, 180, 0.35, 0.06, 'sawtooth', 900);
        this.tone(t + 0.3, 110, 70, 0.18, 0.18, 'sine');
        break;
      case 'passage':
        this.tone(t, 90, 260, 0.9, 0.12, 'sawtooth', 500);
        this.burst(t + 0.2, 0.8, 700, 0.1, 200);
        break;
      case 'sting':
        // The minor-key piano stab of a classic whodunit.
        [196, 233, 277, 370].forEach((f) => this.tone(t, f, f, 0.9, 0.08, 'triangle'));
        this.tone(t, 98, 96, 1.1, 0.14, 'sine');
        break;
      case 'pass':
        this.tone(t, 300, 260, 0.14, 0.06, 'triangle');
        break;
      case 'card':
        this.burst(t, 0.09, 4200, 0.18, 1500);
        this.tone(t + 0.05, 880, 1320, 0.12, 0.05, 'sine');
        break;
      case 'gasp':
        this.burst(t, 0.6, 1800, 0.12, 3600);
        this.tone(t, 523, 494, 0.6, 0.08, 'triangle');
        break;
      case 'drumroll':
        for (let i = 0; i < 18; i++) {
          this.burst(t + i * 0.06, 0.05, 260, 0.08 + i * 0.008);
        }
        break;
      case 'right':
        [392, 523, 659, 784].forEach((f, i) => this.tone(t + i * 0.1, f, f, 0.45, 0.13, 'triangle'));
        break;
      case 'wrong':
        this.tone(t, 220, 110, 0.7, 0.18, 'sawtooth', 700);
        this.tone(t + 0.04, 233, 116, 0.7, 0.12, 'sawtooth', 700);
        break;
      case 'turn':
        this.tone(t, 587, 587, 0.12, 0.07, 'sine');
        this.tone(t + 0.12, 880, 880, 0.16, 0.07, 'sine');
        break;
      case 'win':
        [523, 659, 784, 1047].forEach((f, i) => this.tone(t + i * 0.14, f, f, 0.36, 0.14, 'triangle'));
        break;
      case 'lose':
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
