import type { Pcm } from '../audio.ts';

interface Loudness {
  readonly integrated: number;
  readonly momentaryMax: number;
  readonly peak: number;
}

interface Coefficients {
  readonly b0: number;
  readonly b1: number;
  readonly b2: number;
  readonly a1: number;
  readonly a2: number;
}

const runBiquad = (x: Float32Array, c: Coefficients): Float32Array => {
  const out = new Float32Array(x.length);
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const x0 = x[i] ?? 0;
    const y = c.b0 * x0 + c.b1 * x1 + c.b2 * x2 - c.a1 * y1 - c.a2 * y2;
    x2 = x1;
    x1 = x0;
    y2 = y1;
    y1 = y;
    out[i] = y;
  }
  return out;
};

const BLOCK = 0.4;
const HOP = 0.1;
export const ABSOLUTE_GATE = -70;
const RELATIVE_GATE = -10;

const kWeighting = (rate: number): ReadonlyArray<Coefficients> => {
  const shelf = (() => {
    const k = Math.tan((Math.PI * 1681.974450955533) / rate);
    const q = 0.7071752369554196;
    const vh = 10 ** (3.999843853973347 / 20);
    const vb = vh ** 0.4996667741545416;
    const a0 = 1 + k / q + k * k;
    return {
      b0: (vh + (vb * k) / q + k * k) / a0,
      b1: (2 * (k * k - vh)) / a0,
      b2: (vh - (vb * k) / q + k * k) / a0,
      a1: (2 * (k * k - 1)) / a0,
      a2: (1 - k / q + k * k) / a0,
    };
  })();
  const highPass = (() => {
    const k = Math.tan((Math.PI * 38.13547087602444) / rate);
    const q = 0.5003270373238773;
    const a0 = 1 + k / q + k * k;
    return { b0: 1, b1: -2, b2: 1, a1: (2 * (k * k - 1)) / a0, a2: (1 - k / q + k * k) / a0 };
  })();
  return [shelf, highPass];
};

const lufsOf = (power: number): number => -0.691 + 10 * Math.log10(power);

const blockPowers = (pcm: Pcm): ReadonlyArray<number> => {
  const block = Math.round(BLOCK * pcm.rate);
  const hop = Math.round(HOP * pcm.rate);
  const starts: Array<number> = [];
  for (let s = 0; s + block <= pcm.frames; s += hop) starts.push(s);
  if (starts.length === 0) starts.push(0);
  const powers = starts.map(() => 0);
  for (const plane of pcm.channels) {
    let weighted = plane.subarray(0, pcm.frames);
    for (const stage of kWeighting(pcm.rate)) weighted = runBiquad(weighted, stage);
    const sums = new Float64Array(pcm.frames + 1);
    for (let i = 0; i < pcm.frames; i++) sums[i + 1] = (sums[i] ?? 0) + (weighted[i] ?? 0) ** 2;
    for (const [k, s] of starts.entries()) {
      const end = Math.min(pcm.frames, s + block);
      powers[k] = (powers[k] ?? 0) + ((sums[end] ?? 0) - (sums[s] ?? 0)) / block;
    }
  }
  return powers;
};

const meanOf = (xs: ReadonlyArray<number>): number =>
  xs.reduce((sum, x) => sum + x, 0) / Math.max(1, xs.length);

interface Block {
  readonly from: number;
  readonly to: number;
  readonly lufs: number;
}

export const momentaryBlocks = (pcm: Pcm): ReadonlyArray<Block> => {
  const hop = Math.round(HOP * pcm.rate) / pcm.rate;
  const block = Math.round(BLOCK * pcm.rate) / pcm.rate;
  return blockPowers(pcm).map((power, k) => ({
    from: k * hop,
    to: k * hop + block,
    lufs: lufsOf(power),
  }));
};

export const loudness = (pcm: Pcm): Loudness => {
  const powers = blockPowers(pcm);
  const loud = powers.filter((p) => lufsOf(p) > ABSOLUTE_GATE);
  const relative = lufsOf(meanOf(loud)) + RELATIVE_GATE;
  const gated = loud.filter((p) => lufsOf(p) > relative);
  let peak = 0;
  for (const plane of pcm.channels)
    for (let i = 0; i < pcm.frames; i++) peak = Math.max(peak, Math.abs(plane[i] ?? 0));
  return {
    integrated: gated.length > 0 ? lufsOf(meanOf(gated)) : Number.NEGATIVE_INFINITY,
    momentaryMax: lufsOf(Math.max(0, ...powers)),
    peak: 20 * Math.log10(peak),
  };
};
