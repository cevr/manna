import { Array as Arr, Option } from 'effect';

const MIN_HZ = 60;
const MAX_HZ = 1200;
const LAG_SHARE = 0.8;
const QUIET_RMS = 0.004;
const CLARITY = 0.7;
const PEAK_SHARE = 0.9;
const OCTAVE_RISE = 0.02;
const OCTAVE_REACH = 0.02;

interface Plan {
  readonly size: number;
  readonly half: number;
  readonly reversed: Uint32Array;
  readonly cos: Float64Array;
  readonly sin: Float64Array;
  readonly splitCos: Float64Array;
  readonly splitSin: Float64Array;
  readonly re: Float64Array;
  readonly im: Float64Array;
  readonly signal: Float64Array;
  readonly power: Float64Array;
  readonly spectrumRe: Float64Array;
  readonly spectrumIm: Float64Array;
}

const plans = new Map<number, Plan>();

const makePlan = (size: number): Plan => {
  const half = size / 2;
  const bits = Math.log2(half);
  const reversed = new Uint32Array(half);
  for (let i = 0; i < half; i++) {
    let r = 0;
    for (let b = 0; b < bits; b++) r |= ((i >>> b) & 1) << (bits - 1 - b);
    reversed[i] = r;
  }
  const cos = new Float64Array(half / 2);
  const sin = new Float64Array(half / 2);
  for (let j = 0; j < half / 2; j++) {
    cos[j] = Math.cos((2 * Math.PI * j) / half);
    sin[j] = -Math.sin((2 * Math.PI * j) / half);
  }
  const splitCos = new Float64Array(half + 1);
  const splitSin = new Float64Array(half + 1);
  for (let k = 0; k <= half; k++) {
    splitCos[k] = Math.cos((2 * Math.PI * k) / size);
    splitSin[k] = -Math.sin((2 * Math.PI * k) / size);
  }
  const plan: Plan = {
    size,
    half,
    reversed,
    cos,
    sin,
    splitCos,
    splitSin,
    re: new Float64Array(half),
    im: new Float64Array(half),
    signal: new Float64Array(size),
    power: new Float64Array(size),
    spectrumRe: new Float64Array(half + 1),
    spectrumIm: new Float64Array(half + 1),
  };
  return plan;
};

const planFor = (size: number): Plan =>
  Option.getOrElse(Option.fromNullishOr(plans.get(size)), () => {
    const plan = makePlan(size);
    plans.set(size, plan);
    return plan;
  });

const fft = (plan: Plan) => {
  const { half, reversed, cos, sin, re, im } = plan;
  for (let i = 0; i < half; i++) {
    const j = reversed[i] ?? 0;
    if (j > i) {
      const tr = re[i] ?? 0;
      re[i] = re[j] ?? 0;
      re[j] = tr;
      const ti = im[i] ?? 0;
      im[i] = im[j] ?? 0;
      im[j] = ti;
    }
  }
  for (let span = 1; span < half; span *= 2) {
    const step = half / (span * 2);
    for (let start = 0; start < half; start += span * 2) {
      for (let k = 0; k < span; k++) {
        const wr = cos[k * step] ?? 1;
        const wi = sin[k * step] ?? 0;
        const a = start + k;
        const b = a + span;
        const br = re[b] ?? 0;
        const bi = im[b] ?? 0;
        const xr = wr * br - wi * bi;
        const xi = wr * bi + wi * br;
        const ar = re[a] ?? 0;
        const ai = im[a] ?? 0;
        re[b] = ar - xr;
        im[b] = ai - xi;
        re[a] = ar + xr;
        im[a] = ai + xi;
      }
    }
  }
};

const realSpectrum = (plan: Plan, input: Float64Array) => {
  const { half, re, im, splitCos, splitSin, spectrumRe, spectrumIm } = plan;
  for (let k = 0; k < half; k++) {
    re[k] = input[2 * k] ?? 0;
    im[k] = input[2 * k + 1] ?? 0;
  }
  fft(plan);
  for (let k = 0; k <= half; k++) {
    const i = k % half;
    const j = (half - k) % half;
    const ar = re[i] ?? 0;
    const ai = im[i] ?? 0;
    const br = re[j] ?? 0;
    const bi = -(im[j] ?? 0);
    const evenRe = (ar + br) / 2;
    const evenIm = (ai + bi) / 2;
    const oddRe = (ai - bi) / 2;
    const oddIm = -(ar - br) / 2;
    const wr = splitCos[k] ?? 1;
    const wi = splitSin[k] ?? 0;
    spectrumRe[k] = evenRe + wr * oddRe - wi * oddIm;
    spectrumIm[k] = evenIm + wr * oddIm + wi * oddRe;
  }
};

interface Key {
  readonly lag: number;
  readonly value: number;
}

const paddedSize = (n: number) => {
  let size = 2;
  while (size < n) size *= 2;
  return size;
};

const centre = (frame: Float32Array, signal: Float64Array) => {
  const length = frame.length;
  let mean = 0;
  for (let i = 0; i < length; i++) mean += frame[i] ?? 0;
  mean /= length;
  let energy = 0;
  for (let i = 0; i < length; i++) {
    const x = (frame[i] ?? 0) - mean;
    signal[i] = x;
    energy += x * x;
  }
  signal.fill(0, length);
  return energy;
};

const autocorrelate = (plan: Plan) => {
  const { signal, power, spectrumRe, spectrumIm, half, size } = plan;
  realSpectrum(plan, signal);
  for (let k = 0; k <= half; k++) {
    const p = (spectrumRe[k] ?? 0) ** 2 + (spectrumIm[k] ?? 0) ** 2;
    power[k] = p;
    if (k > 0 && k < half) power[size - k] = p;
  }
  realSpectrum(plan, power);
};

const nsdfAt = (scaledCorrelation: number, overlap: number, size: number) => {
  if (!(overlap > 0)) return 0;
  return (2 * (scaledCorrelation / size)) / overlap;
};

const nsdfValues = (plan: Plan, energy: number, length: number, maxLag: number) => {
  const { signal, spectrumRe, size } = plan;
  const values = new Float64Array(maxLag + 2);
  values[0] = 1;
  let overlap = 2 * energy;
  for (let lag = 1; lag <= maxLag + 1 && lag < length; lag++) {
    overlap -= (signal[lag - 1] ?? 0) ** 2 + (signal[length - lag] ?? 0) ** 2;
    values[lag] = nsdfAt(spectrumRe[lag] ?? 0, overlap, size);
  }
  return values;
};

const lobePeaks = (values: Float64Array, maxLag: number) => {
  const lobes: Array<number> = [];
  let seenNegative = false;
  let inLobe = false;
  let peak = 0;
  let peakLag = 0;
  for (let lag = 1; lag <= maxLag; lag++) {
    const value = values[lag] ?? 0;
    if (!seenNegative) {
      seenNegative = value < 0;
      continue;
    }
    if (value > 0) {
      if (!inLobe || value > peak) {
        peak = value;
        peakLag = lag;
      }
      inLobe = true;
      continue;
    }
    if (inLobe) lobes.push(peakLag);
    inLobe = false;
  }
  if (inLobe && peakLag < maxLag) lobes.push(peakLag);
  return lobes;
};

const refine = (values: Float64Array, lag: number): Key => {
  const before = values[lag - 1] ?? 0;
  const at = values[lag] ?? 0;
  const after = values[lag + 1] ?? 0;
  const curve = before - 2 * at + after;
  if (!(curve < 0)) return { lag, value: at };
  const offset = (0.5 * (before - after)) / curve;
  return { lag: lag + offset, value: at - ((before - after) * offset) / 4 };
};

const undertoneOf = (keys: ReadonlyArray<Key>, key: Key): Option.Option<Key> => {
  const target = 2 * key.lag;
  const reach = Math.max(2, Math.ceil(OCTAVE_REACH * target));
  let floor = key.value + OCTAVE_RISE;
  let found = Option.none<Key>();
  for (const other of keys) {
    if (Math.abs(other.lag - target) > reach || !(other.value > floor)) continue;
    floor = other.value;
    found = Option.some(other);
  }
  return found;
};

const settle = (keys: ReadonlyArray<Key>, key: Key): Key =>
  Option.match(undertoneOf(keys, key), {
    onNone: () => key,
    onSome: (undertone) => settle(keys, undertone),
  });

const periodKey = (keys: ReadonlyArray<Key>, minLag: number): Option.Option<Key> => {
  let highest = 0;
  for (const key of keys) if (key.lag >= minLag && key.value > highest) highest = key.value;
  if (highest < CLARITY) return Option.none();
  return Arr.findFirst(keys, (key) => key.lag >= minLag && key.value >= PEAK_SHARE * highest).pipe(
    Option.map((key) => settle(keys, key)),
  );
};

export const detect = (frame: Float32Array, sampleRate: number): Option.Option<number> => {
  const length = frame.length;
  if (length < 64 || !(sampleRate > 0)) return Option.none();
  const maxLag = Math.min(Math.floor(sampleRate / MIN_HZ), Math.floor(LAG_SHARE * length));
  const minLag = Math.max(2, Math.floor(sampleRate / MAX_HZ));
  if (maxLag <= minLag + 2) return Option.none();

  const plan = planFor(paddedSize(length + maxLag));
  const energy = centre(frame, plan.signal);
  if (!(Math.sqrt(energy / length) >= QUIET_RMS)) return Option.none();
  autocorrelate(plan);
  const values = nsdfValues(plan, energy, length, maxLag);
  const keys = lobePeaks(values, maxLag).map((lag) => refine(values, lag));
  return periodKey(keys, minLag).pipe(
    Option.map((key) => sampleRate / key.lag),
    Option.filter((hz) => hz >= MIN_HZ && hz <= MAX_HZ),
  );
};
