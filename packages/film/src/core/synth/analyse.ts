import type { Pcm } from '../audio.ts';

interface Described {
  readonly secs: number;
  readonly onset: number;
  readonly hit: number;
  readonly end: number;
  readonly stands: number;
  readonly centroid: number;
  readonly flatness: number;
}

const WINDOW = 0.01;
const AROUND = 15;
const FLOOR = 1e-12;
const SILENT_DB = 10 * Math.log10(FLOOR);
const FFT_SIZE = 2048;

const windowDb = (pcm: Pcm): ReadonlyArray<number> => {
  const n = Math.max(1, Math.round(WINDOW * pcm.rate));
  const out: Array<number> = [];
  for (let from = 0; from < pcm.frames; from += n) {
    let sum = 0;
    const to = Math.min(pcm.frames, from + n);
    for (const plane of pcm.channels) for (let i = from; i < to; i++) sum += (plane[i] ?? 0) ** 2;
    out.push(
      10 * Math.log10(Math.max(FLOOR, sum / Math.max(1, (to - from) * pcm.channels.length))),
    );
  }
  return out;
};

const bitReverse = (re: Float64Array, im: Float64Array): void => {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j] ?? 0, re[i] ?? 0];
      [im[i], im[j]] = [im[j] ?? 0, im[i] ?? 0];
    }
  }
};

const butterfly = (
  re: Float64Array,
  im: Float64Array,
  a: number,
  b: number,
  wr: number,
  wi: number,
): void => {
  const tr = (re[b] ?? 0) * wr - (im[b] ?? 0) * wi;
  const ti = (re[b] ?? 0) * wi + (im[b] ?? 0) * wr;
  re[b] = (re[a] ?? 0) - tr;
  im[b] = (im[a] ?? 0) - ti;
  re[a] = (re[a] ?? 0) + tr;
  im[a] = (im[a] ?? 0) + ti;
};

interface FftPlan {
  readonly twiddles: ReadonlyArray<{ readonly cos: Float64Array; readonly sin: Float64Array }>;
  readonly hann: Float64Array;
}

const plans = new Map<number, FftPlan>();

const planOf = (size: number): FftPlan => {
  const had = plans.get(size);
  if (had !== undefined) return had;
  const plan: FftPlan = {
    twiddles: Array.from({ length: Math.log2(size) }, (_, stage) => {
      const span = 2 << stage;
      const step = (-2 * Math.PI) / span;
      return {
        cos: Float64Array.from({ length: span / 2 }, (_, k) => Math.cos(step * k)),
        sin: Float64Array.from({ length: span / 2 }, (_, k) => Math.sin(step * k)),
      };
    }),
    hann: Float64Array.from(
      { length: size },
      (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / size),
    ),
  };
  plans.set(size, plan);
  return plan;
};

const fft = (re: Float64Array, im: Float64Array, plan: FftPlan): void => {
  const n = re.length;
  bitReverse(re, im);
  plan.twiddles.forEach(({ cos, sin }, stage) => {
    const span = 2 << stage;
    for (let start = 0; start < n; start += span)
      for (let k = 0; k < span / 2; k++)
        butterfly(re, im, start + k, start + k + span / 2, cos[k] ?? 1, sin[k] ?? 0);
  });
};

type Ends = 'silent' | 'looped';

const spectrumAt = (plane: Float32Array, from: number, size: number, ends: Ends): Float64Array => {
  const plan = planOf(size);
  const re = new Float64Array(size);
  const im = new Float64Array(size);
  const length = plane.length;
  if (ends === 'looped' && length > 0)
    for (let i = 0; i < size; i++) re[i] = (plane[(from + i) % length] ?? 0) * (plan.hann[i] ?? 0);
  else for (let i = 0; i < size; i++) re[i] = (plane[from + i] ?? 0) * (plan.hann[i] ?? 0);
  fft(re, im, plan);
  const power = new Float64Array(size / 2);
  for (let k = 0; k < power.length; k++) power[k] = (re[k] ?? 0) ** 2 + (im[k] ?? 0) ** 2;
  return power;
};

export const frameSpectrum = (plane: Float32Array, from: number, size: number): Float64Array =>
  spectrumAt(plane, from, size, 'silent');

const frameStarts = (length: number, size: number, ends: Ends): ReadonlyArray<number> => {
  const hop = size / 4;
  if (ends === 'looped') {
    const count = Math.max(4, Math.round(length / hop));
    return Array.from({ length: count }, (_, k) => Math.floor((k * length) / count));
  }
  return Array.from(
    { length: Math.ceil(Math.max(1, length) / hop) + 3 },
    (_, k) => hop - size + k * hop,
  );
};

export const powerSpectrum = (plane: Float32Array, size: number, ends: Ends): Float64Array => {
  const power = new Float64Array(size / 2);
  const starts = frameStarts(plane.length, size, ends);
  for (const from of starts) {
    const frame = spectrumAt(plane, from, size, ends);
    for (let k = 0; k < power.length; k++) power[k] = (power[k] ?? 0) + (frame[k] ?? 0);
  }
  return power.map((p) => p / starts.length);
};

const standing = (levels: ReadonlyArray<number>, at: number): number => {
  const near = Array.from(
    { length: 2 * AROUND + 1 },
    (_, k) => levels[at - AROUND + k] ?? SILENT_DB,
  ).sort((a, b) => a - b);
  return (levels[at] ?? SILENT_DB) - (near[AROUND] ?? SILENT_DB);
};

export const describeSound = (pcm: Pcm): Described => {
  const levels = windowDb(pcm);
  const loudest = Math.max(...levels);
  const hit = Math.max(0, levels.indexOf(loudest));
  const first = levels.findIndex((db) => db >= loudest - 30);
  const last = levels.findLastIndex((db) => db >= loudest - 40);
  const power = powerSpectrum(pcm.channels[0] ?? new Float32Array(), FFT_SIZE, 'silent');
  let weighted = 0;
  let total = 0;
  let logSum = 0;
  for (let k = 1; k < power.length; k++) {
    const p = Math.max(power[k] ?? 0, 1e-20);
    weighted += p * ((k * pcm.rate) / FFT_SIZE);
    total += p;
    logSum += Math.log(p);
  }
  const bins = power.length - 1;
  return {
    secs: pcm.frames / pcm.rate,
    onset: Math.max(0, first) * WINDOW,
    hit: hit * WINDOW,
    end: Math.min(pcm.frames / pcm.rate, (Math.max(0, last) + 1) * WINDOW),
    stands: standing(levels, hit),
    centroid: total > 0 ? weighted / total : 0,
    flatness: total > 0 ? Math.exp(logSum / bins) / (total / bins) : 0,
  };
};
