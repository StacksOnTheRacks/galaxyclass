import { describe, expect, it } from 'vitest';
import { ServerClock } from '../../src/client/clock.js';

describe('server clock', () => {
  it('estimates the offset from the pong with the smallest round trip', () => {
    let now = 1_000;
    const clock = new ServerClock(() => now);
    // Server is 5 000 ms ahead. A slow, asymmetric sample reads 5 150; a fast one reads 5 000.
    clock.onPong(6_300, 1_000, 1_300);
    clock.onPong(7_020, 2_000, 2_040);
    clock.onPong(8_100, 3_000, 3_200);
    expect(clock.offset).toBe(5_000);
    now = 4_000;
    expect(clock.serverNow()).toBe(9_000);
    expect(clock.toLocal(9_000)).toBe(4_000);
  });

  it('keeps only the last five samples', () => {
    const clock = new ServerClock(() => 0);
    clock.onPong(1_005, 0, 10); // the best, but it will age out
    for (let i = 1; i <= 5; i++) {
      clock.onPong(i * 1_000 + 2_000 + 50, i * 1_000, i * 1_000 + 100);
    }
    expect(clock.sampleCount).toBe(5);
    expect(clock.offset).toBe(2_000);
  });

  it('falls back to a snapshot timestamp until the first pong, then ignores snapshots', () => {
    const clock = new ServerClock(() => 0);
    expect(clock.offset).toBe(0);
    clock.onServerTs(10_400, 400);
    expect(clock.offset).toBe(10_000);
    expect(clock.calibrated).toBe(false);
    clock.onPong(20_050, 10_000, 10_100);
    clock.onServerTs(99_999, 0);
    expect(clock.calibrated).toBe(true);
    expect(clock.offset).toBe(10_000);
  });

  it('ignores impossible samples', () => {
    const clock = new ServerClock(() => 0);
    clock.onPong(Number.NaN, 0, 10);
    clock.onPong(100, 50, 10);
    expect(clock.sampleCount).toBe(0);
  });
});
