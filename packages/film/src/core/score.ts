import { type Pcm, SPEECH_GATE, concat, slice, windowPowers } from './audio.ts';
import { loudness } from './synth/loudness.ts';
import type { Interval } from './time.ts';

export const SCORE = {
  window: 0.1,
  alone: 3,
  lead: 0.25,
  ramp: 1,
} as const;

export const speechSpans = (voice: Pcm): ReadonlyArray<Interval> => {
  const size = Math.max(1, Math.round(SCORE.window * voice.rate));
  const end = voice.frames / voice.rate;
  const levels = windowPowers(voice, size);
  const spans: Array<Interval> = [];
  let open = -1;
  for (const [w, level] of levels.entries()) {
    const speaking = level > SPEECH_GATE;
    if (speaking && open < 0) open = w;
    if (!speaking && open >= 0) {
      spans.push({ from: (open * size) / voice.rate, to: (w * size) / voice.rate });
      open = -1;
    }
  }
  if (open >= 0) spans.push({ from: (open * size) / voice.rate, to: end });
  return spans;
};

interface Alone {
  readonly hold: Interval;
  readonly rise: boolean;
  readonly fall: boolean;
}

export const aloneSpans = (
  speech: ReadonlyArray<Interval>,
  seconds: number,
): ReadonlyArray<Alone> => {
  const bounds = [{ from: 0, to: 0 }, ...speech, { from: seconds, to: seconds }];
  const out: Array<Alone> = [];
  for (let k = 0; k + 1 < bounds.length; k++) {
    const a = bounds[k]?.to ?? 0;
    const b = bounds[k + 1]?.from ?? seconds;
    const rise = k > 0;
    const fall = k + 2 < bounds.length;
    const edge = SCORE.lead + SCORE.ramp;
    let from = a;
    if (rise) from = a + edge;
    let to = b;
    if (fall) to = b - edge;
    const long = b - a >= SCORE.alone || !rise || !fall;
    if (long && to > from) out.push({ hold: { from, to }, rise, fall });
  }
  return out;
};

export const aloneWeights = (
  spans: ReadonlyArray<Alone>,
  rate: number,
  frames: number,
): Float32Array => {
  const weights = new Float32Array(frames);
  const at = (secs: number) => Math.max(0, Math.min(frames, Math.round(secs * rate)));
  for (const span of spans) {
    const from = at(span.hold.from);
    const to = at(span.hold.to);
    weights.fill(1, from, to);
    const ramp = Math.round(SCORE.ramp * rate);
    if (span.rise)
      for (let i = Math.max(0, from - ramp); i < from; i++)
        weights[i] = Math.max(weights[i] ?? 0, 1 - (from - i) / ramp);
    if (span.fall)
      for (let i = to; i < Math.min(frames, to + ramp); i++)
        weights[i] = Math.max(weights[i] ?? 0, 1 - (i - to + 1) / ramp);
  }
  return weights;
};

const where = (pcm: Pcm, weights: Float32Array, keep: (w: number) => boolean): Pcm => {
  const blocks: Array<Pcm> = [];
  let open = -1;
  for (let i = 0; i <= pcm.frames; i++) {
    const on = i < pcm.frames && keep(weights[i] ?? 0);
    if (on && open < 0) open = i;
    if (!on && open >= 0) {
      blocks.push(slice(pcm, open, i - open));
      open = -1;
    }
  }
  return concat(pcm.rate, pcm.channels.length, blocks);
};

interface ScoreGains {
  readonly under: number;
  readonly alone: number;
}

export const scoreGains = (
  score: Pcm,
  voice: Pcm,
  weights: Float32Array,
  levels: { readonly under: number; readonly alone: number },
): ScoreGains => {
  const target = loudness(voice).integrated;
  const gain = (part: Pcm, db: number) => {
    const measured = loudness(part).integrated;
    if (!Number.isFinite(measured) || !Number.isFinite(target)) return 1;
    return 10 ** ((target + db - measured) / 20);
  };
  return {
    under: gain(
      where(score, weights, (w) => w === 0),
      levels.under,
    ),
    alone: gain(
      where(score, weights, (w) => w === 1),
      levels.alone,
    ),
  };
};

export const applyScore = (
  channels: ReadonlyArray<Float32Array>,
  weights: Float32Array,
  gains: ScoreGains,
): void => {
  const under = Math.log(gains.under);
  const alone = Math.log(gains.alone);
  for (const plane of channels)
    for (let i = 0; i < plane.length; i++) {
      const w = weights[i] ?? 0;
      plane[i] = (plane[i] ?? 0) * Math.exp(under + (alone - under) * w);
    }
};
