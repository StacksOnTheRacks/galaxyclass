/** Pong samples kept for the offset estimate; the one with the smallest round trip wins. */
const SAMPLE_WINDOW = 5;

interface Sample {
  rtt: number;
  offset: number;
}

/**
 * Estimates server time so every detective plays an event against the same `serverTs`. Each pong
 * gives `offset = serverTs − (sentAt + receivedAt) / 2`; the sample with the shortest round trip has
 * the least room for asymmetric delay. Before any pong, a snapshot's `serverTs` gives a rough fallback.
 */
export class ServerClock {
  private samples: Sample[] = [];
  private fallback: number | null = null;

  constructor(private readonly now: () => number = Date.now) {}

  get calibrated(): boolean {
    return this.samples.length > 0;
  }

  get sampleCount(): number {
    return this.samples.length;
  }

  onPong(serverTs: number, sentAt: number, receivedAt = this.now()): void {
    if (!Number.isFinite(serverTs) || receivedAt < sentAt) {
      return;
    }
    this.samples.push({ rtt: receivedAt - sentAt, offset: serverTs - (sentAt + receivedAt) / 2 });
    if (this.samples.length > SAMPLE_WINDOW) {
      this.samples.shift();
    }
  }

  /** Only used until the first pong: it ignores the one-way delay, so it reads slightly early. */
  onServerTs(serverTs: number, receivedAt = this.now()): void {
    if (Number.isFinite(serverTs) && this.samples.length === 0) {
      this.fallback = serverTs - receivedAt;
    }
  }

  get offset(): number {
    if (this.samples.length === 0) {
      return this.fallback ?? 0;
    }
    let best = this.samples[0]!;
    for (const sample of this.samples) {
      if (sample.rtt < best.rtt) {
        best = sample;
      }
    }
    return best.offset;
  }

  serverNow(): number {
    return this.now() + this.offset;
  }

  /** Server epoch ms → local `Date.now()` ms. */
  toLocal(serverTs: number): number {
    return serverTs - this.offset;
  }
}
