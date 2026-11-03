import { momentaryBlocks, type Pcm } from '@manna/film/measure';

export const LIMITS = {
  length: 0.05,
  truePeak: -1,
  loudness: 1,
  meters: 0.1,
  clip: 0.999,
  silence: 1,
  quiet: -45,
  lag: 30,
  onsetDb: -50,
  memory: { piano: 3.0e9, sampler: 0.5e9, render: 1.5e9 },
} as const;

export interface Check {
  readonly ok: boolean;
  readonly value: number;
  readonly limit: number;
}

export interface Span {
  readonly from: number;
  readonly to: number;
}

export const merged = (spans: ReadonlyArray<Span>): Span[] => {
  const out: Span[] = [];
  for (const span of [...spans].sort((a, b) => a.from - b.from)) {
    const last = out.at(-1);
    if (last !== undefined && span.from <= last.to)
      out[out.length - 1] = { from: last.from, to: Math.max(last.to, span.to) };
    else out.push(span);
  }
  return out;
};

const WINDOW = 0.01;

export const firstSound = (pcm: Pcm, db: number): number | undefined => {
  const size = Math.round(WINDOW * pcm.rate);
  const floor = 10 ** (db / 10);
  for (let start = 0; start + size <= pcm.frames; start += size) {
    let power = 0;
    for (const plane of pcm.channels)
      for (let i = start; i < start + size; i++) power += (plane[i] ?? 0) ** 2;
    if (power / size / pcm.channels.length > floor) return start / pcm.rate;
  }
  return undefined;
};

export const longestQuiet = (pcm: Pcm, sounding: ReadonlyArray<Span>, quiet: number): number => {
  const spans = merged(sounding);
  const isSounding = (t: number) => spans.some((s) => t >= s.from && t < s.to);
  let longest = 0;
  let run: Span | undefined;
  for (const block of momentaryBlocks(pcm)) {
    const middle = (block.from + block.to) / 2;
    if (block.lufs < quiet && isSounding(middle)) {
      run = { from: run?.from ?? block.from, to: block.to };
      longest = Math.max(longest, run.to - run.from);
    } else run = undefined;
  }
  return longest;
};

export const samplePeak = (pcm: Pcm) => {
  let peak = 0;
  for (const plane of pcm.channels)
    for (let i = 0; i < pcm.frames; i++) peak = Math.max(peak, Math.abs(plane[i] ?? 0));
  return peak;
};

export interface Measured {
  readonly seconds: number;
  readonly expectedSeconds: number;
  readonly truePeak: number;
  readonly lufs: number;
  readonly ebur128Lufs: number;
  readonly targetLufs: number;
  readonly peak: number;
  readonly longestQuiet: number;
  readonly lagMs: number;
  readonly stems: ReadonlyArray<{
    readonly lufs: number;
    readonly frames: number;
    readonly needed: number;
  }>;
  readonly rss: { readonly piano: number; readonly sampler: number; readonly render: number };
}

const check = (ok: boolean, value: number, limit: number): Check => ({ ok, value, limit });

export const checksOf = (m: Measured) => ({
  length: check(
    Math.abs(m.seconds - m.expectedSeconds) <= LIMITS.length,
    m.seconds - m.expectedSeconds,
    LIMITS.length,
  ),
  truePeak: check(m.truePeak <= LIMITS.truePeak, m.truePeak, LIMITS.truePeak),
  loudness: check(
    Math.abs(m.lufs - m.targetLufs) <= LIMITS.loudness &&
      Math.abs(m.lufs - m.ebur128Lufs) <= LIMITS.meters,
    m.lufs,
    m.targetLufs,
  ),
  clipping: check(m.peak < LIMITS.clip, m.peak, LIMITS.clip),
  silence: check(m.longestQuiet <= LIMITS.silence, m.longestQuiet, LIMITS.silence),
  onsetLag: check(Math.abs(m.lagMs) <= LIMITS.lag, m.lagMs, LIMITS.lag),
  stems: check(
    m.stems.every((s) => Number.isFinite(s.lufs) && s.frames >= s.needed),
    m.stems.filter((s) => !(Number.isFinite(s.lufs) && s.frames >= s.needed)).length,
    0,
  ),
  memory: check(
    m.rss.piano <= LIMITS.memory.piano &&
      m.rss.sampler <= LIMITS.memory.sampler &&
      m.rss.render <= LIMITS.memory.render,
    Math.max(
      m.rss.piano / LIMITS.memory.piano,
      m.rss.sampler / LIMITS.memory.sampler,
      m.rss.render / LIMITS.memory.render,
    ),
    1,
  ),
});

export type Checks = ReturnType<typeof checksOf>;

export const passed = (checks: Checks) => Object.values(checks).every((c) => c.ok);
