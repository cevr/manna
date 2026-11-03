import { describe, expect, it } from 'bun:test';
import { Option } from 'effect';

import { detect } from './pitch';
import { IN_TUNE_CENTS, reading, STRINGS } from './tuning';

const FRAME = 2048;

interface Voice {
  readonly hz: number;
  readonly rate: number;
  readonly partials: ReadonlyArray<number>;
  readonly phase: number;
  readonly decay: number;
  readonly start: number;
  readonly stiffness: number;
  readonly rms: number;
}

const voice = (
  hz: number,
  rate: number,
  partials: ReadonlyArray<number>,
  more: Partial<Voice> = {},
): Voice => ({
  hz,
  rate,
  partials,
  phase: 0.3,
  decay: Number.POSITIVE_INFINITY,
  start: 0,
  stiffness: 0,
  rms: 0.2,
  ...more,
});

const frameOf = (v: Voice) => {
  const out = new Float64Array(FRAME);
  for (let i = 0; i < FRAME; i++) {
    const t = v.start + i / v.rate;
    const envelope = Math.exp(-t / v.decay);
    let sample = 0;
    v.partials.forEach((amplitude, k) => {
      const stretch = Math.sqrt((1 + v.stiffness * (k + 1) ** 2) / (1 + v.stiffness));
      sample +=
        amplitude * Math.sin(2 * Math.PI * v.hz * (k + 1) * stretch * t + v.phase * (k + 1));
    });
    out[i] = sample * envelope;
  }
  const rms = Math.sqrt(out.reduce((sum, x) => sum + x * x, 0) / FRAME);
  return Float32Array.from(out, (x) => (x / rms) * v.rms);
};

const centsOff = (v: Voice) =>
  Option.match(detect(frameOf(v), v.rate), {
    onNone: () => Number.NaN,
    onSome: (found) => 1200 * Math.log2(found / v.hz),
  });

const cents = (hz: number, by: number) => hz * 2 ** (by / 1200);

const PLUCK = [1, 0.7, 0.45, 0.3, 0.2, 0.12, 0.08, 0.05];

describe('detect', () => {
  it.each(STRINGS.map((s) => [s.id, s.hz] as const))(
    'reads the %s string’s sine within 2 cents',
    (id, hz) => {
      const found = detect(frameOf(voice(hz, 44_100, [1])), 44_100).pipe(Option.getOrThrow);
      expect(Math.abs(1200 * Math.log2(found / hz))).toBeLessThan(2);
      expect(reading(found)).toMatchObject({ string: id, inTune: true });
    },
  );

  it.each([
    ['A2', 110, -10, 48_000],
    ['E4', 329.628, 3, 44_100],
    ['E2', 82.407, 25, 44_100],
  ] as const)('reads a plucked %s string %d Hz %d cents off within 2 cents', (id, hz, by, rate) => {
    const v = voice(cents(hz, by), rate, PLUCK, {
      phase: 1.1,
      decay: 1.2,
      start: 0.15,
      stiffness: 1e-4,
    });
    expect(Math.abs(centsOff(v))).toBeLessThan(2);
    expect(reading(v.hz).string).toBe(id);
  });

  it.each([
    [
      '200.76 Hz',
      voice(200.755, 48_000, [0.2528, 0.8426, 0.0564, 0.7739], {
        phase: 4.13,
        decay: 2.39,
        start: 0.464,
      }),
    ],
    [
      '271.08 Hz',
      voice(271.081, 48_000, [0.2907, 0.9689, 0.0501, 0.8817], {
        phase: 0.48,
        decay: 2.0,
        start: 0.263,
      }),
    ],
  ])('reads %s with strong even partials at its fundamental, not an octave up', (_, v) => {
    expect(Math.abs(centsOff(v))).toBeLessThan(3);
  });

  it.each([
    [
      '662.95 Hz',
      voice(662.949, 44_100, [0.2967, 0.9361, 0.4082, 0.8763, 0.2218, 0.2068, 0.989], {
        phase: 4.2986,
        decay: 2.685,
        start: 0.725,
      }),
    ],
    [
      '599.82 Hz',
      voice(599.822, 44_100, [0.2866, 0.5211, 0.8633, 0.4604, 0.7987, 0.9555, 0.7257, 0.7525], {
        phase: 4.2923,
        decay: 1.111,
        start: 0.469,
      }),
    ],
  ])('reads %s with many partials at its fundamental, not an octave off', (_, v) => {
    expect(Math.abs(centsOff(v))).toBeLessThan(3);
  });

  it('finds no pitch in silence, a whisper or white noise', () => {
    expect(Option.isNone(detect(new Float32Array(FRAME), 44_100))).toBe(true);
    expect(Option.isNone(detect(frameOf(voice(110, 44_100, [1], { rms: 0.001 })), 44_100))).toBe(
      true,
    );
    let state = 7;
    const noise = Float32Array.from({ length: FRAME }, () => {
      state = (Math.imul(state, 1_103_515_245) + 12_345) >>> 0;
      return (state / 2 ** 32 - 0.5) * 0.6;
    });
    expect(Option.isNone(detect(noise, 44_100))).toBe(true);
  });

  it('finds no pitch in noise rung through a resonance near 120 Hz', () => {
    const rate = 44_100;
    const theta = (2 * Math.PI * 120) / rate;
    const settle = 4096;
    let state = 28;
    let [y1, y2] = [0, 0];
    const rung = new Float32Array(FRAME);
    for (let i = 0; i < settle + FRAME; i++) {
      state = (Math.imul(state, 1_103_515_245) + 12_345) >>> 0;
      const y = state / 2 ** 32 - 0.5 + 2 * 0.99 * Math.cos(theta) * y1 - 0.99 ** 2 * y2;
      [y2, y1] = [y1, y];
      if (i >= settle) rung[i - settle] = y;
    }
    const rms = Math.sqrt(rung.reduce((sum, x) => sum + x * x, 0) / FRAME);
    expect(
      Option.isNone(
        detect(
          rung.map((x) => (x / rms) * 0.2),
          rate,
        ),
      ),
    ).toBe(true);
  });

  it('reads a pluck riding on a DC offset of 0.5 within 2 cents', () => {
    const v = voice(110, 44_100, PLUCK, { phase: 1.1, decay: 1.2, start: 0.15, stiffness: 1e-4 });
    const found = detect(
      frameOf(v).map((x) => x + 0.5),
      v.rate,
    ).pipe(Option.getOrThrow);
    expect(Math.abs(1200 * Math.log2(found / v.hz))).toBeLessThan(2);
  });

  it.each([
    ['E2', 82.407, 0],
    ['E2', 82.407, -25],
    ['A2', 110, 10],
  ] as const)(
    'reads a plucked %s string %d Hz %d cents off at 96 kHz within 2 cents',
    (_, hz, by) => {
      const v = voice(cents(hz, by), 96_000, PLUCK, {
        phase: 1.1,
        decay: 1.2,
        start: 0.15,
        stiffness: 1e-4,
      });
      expect(Math.abs(centsOff(v))).toBeLessThan(2);
    },
  );
});

describe('reading', () => {
  it('names the nearest note and its octave, A4 at 440 Hz', () => {
    const a4 = reading(440);
    expect(a4).toMatchObject({ note: 'A', octave: 4, string: 'E4' });
    expect(a4.cents).toBeCloseTo(0, 9);
    expect(a4.stringCents).toBeCloseTo(500, 1);
    expect(reading(261.626)).toMatchObject({ note: 'C', octave: 4 });
    expect(reading(cents(146.832, -30))).toMatchObject({ note: 'D', octave: 3, string: 'D3' });
    expect(reading(cents(146.832, -30)).cents).toBeCloseTo(-30, 1);
    expect(reading(cents(146.832, 60))).toMatchObject({ note: 'D#', octave: 3, string: 'D3' });
  });

  it('holds a string in tune within IN_TUNE_CENTS, inclusive of the window, signed sharp', () => {
    expect(IN_TUNE_CENTS).toBe(5);
    expect(reading(cents(110, 4.9))).toMatchObject({ string: 'A2', inTune: true });
    expect(reading(cents(110, -4.9))).toMatchObject({ string: 'A2', inTune: true });
    expect(reading(cents(110, 5.1))).toMatchObject({ string: 'A2', inTune: false });
    expect(reading(cents(110, 12)).stringCents).toBeCloseTo(12, 6);
    expect(reading(cents(82.407, -12)).stringCents).toBeLessThan(0);
  });
});
