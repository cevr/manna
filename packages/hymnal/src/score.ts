import * as Chord from './chord.js';
import { harmonyTracks, melodyOf } from './melody.js';
import type { Midi, Note, TimeSignature } from './midi.js';

export { harmonyTracks, melodyOf, topVoice } from './melody.js';

export interface Span {
  readonly start: number;
  readonly end: number;
}

export interface Verses {
  readonly spans: readonly Span[];
  readonly exact: boolean;
}

export interface Score {
  readonly ticksPerBeat: number;
  readonly beatsPerBar: number;
  readonly meter: { readonly numerator: number; readonly denominator: number };
  readonly meters: readonly TimeSignature[];
  readonly key: Chord.Key;
  readonly harmony: readonly Note[];
  readonly melody: readonly Note[];
  readonly verses: Verses;
}

const closingKey = (harmony: readonly Note[]): Chord.Key => {
  const end = Math.max(...harmony.map((note) => note.end));
  const last = harmony.filter((note) => note.end === end);
  const bass = Math.min(...last.map((note) => note.key)) % 12;
  const minor = last.some((note) => (note.key - bass + 12) % 12 === 3);
  return Chord.keyOnPitch(bass, minor);
};

export const findVerses = (melody: readonly Note[], expected: number, bar: number): Verses => {
  const keys = melody.map((note) => note.key);
  const end = melody.at(-1)?.end ?? 0;
  const pause = (i: number) => {
    const [before, note] = [melody[i - 1], melody[i]];
    if (note === undefined) return Number.NEGATIVE_INFINITY;
    return before === undefined ? 0 : note.start - before.start;
  };
  const split = (count: number) => {
    let best: { intro: number; length: number; share: number } | undefined;
    for (let intro = 0; intro <= keys.length / 2; intro++) {
      const length = (keys.length - intro) / count;
      if (!Number.isInteger(length) || length < 8) continue;
      let same = 0;
      for (let i = 0; i < length; i++) {
        const first = keys[intro + i];
        let all = true;
        for (let k = 1; k < count && all; k++) all = keys[intro + k * length + i] === first;
        if (all) same++;
      }
      const share = same / length;
      if (best === undefined || share > best.share) best = { intro, length, share };
      if (share === 1) break;
    }
    return best;
  };
  const spans = (starts: readonly number[]): Verses['spans'] =>
    starts.map((i, k) => ({
      start: melody[i]?.start ?? end,
      end: melody[starts[k + 1] ?? melody.length]?.start ?? end,
    }));
  const equal = (count: number, intro: number, length: number) =>
    spans(Array.from({ length: count }, (_, k) => intro + k * length));
  const REACH = 4;
  const OPENING = 8;
  const ENDING = 4;
  const nearby = (center: number, after: number, before = keys.length) =>
    Array.from({ length: 2 * REACH + 1 }, (_, d) => center - REACH + d).filter(
      (i) => i > after && i < before,
    );
  const best = (candidates: readonly number[], score: (i: number) => number, center: number) =>
    candidates.reduce((a, b) => {
      const [sa, sb] = [score(a), score(b)];
      return sb > sa || (sb === sa && Math.abs(b - center) < Math.abs(a - center)) ? b : a;
    }, candidates[0] ?? center);

  const fewer = (count: number, intro: number, length: number): Verses => {
    const exact = Array.from({ length: count }, (_, k) => intro + k * length);
    const missing = expected - count;
    const opening = keys[intro];
    const ranked = (i: number) => (keys[i] === opening ? end : 0) + Math.min(pause(i), end - 1);
    const near = (center: number, after: number, before: number) =>
      best(nearby(center, after, before), ranked, center);
    if (missing > 0 && intro >= missing * length - REACH) {
      const starts = [near(intro, -1, intro + length), ...exact.slice(1)];
      for (let k = 0; k < missing; k++) {
        const next = starts[0] ?? intro;
        starts.unshift(near(next - length, -1, next));
      }
      return { spans: spans(starts), exact: false };
    }
    if (missing > 0 && expected % count === 0) {
      const each = expected / count;
      const starts: number[] = [];
      for (const start of exact) {
        starts.push(start);
        for (let j = 1; j < each; j++)
          starts.push(
            near(Math.round(start + (j * length) / each), starts.at(-1) ?? start, start + length),
          );
      }
      return { spans: spans(starts), exact: false };
    }
    return { spans: equal(count, intro, length), exact: true };
  };

  const wanted = split(expected);
  if (wanted?.share === 1)
    return { spans: equal(expected, wanted.intro, wanted.length), exact: true };
  for (let count = 8; count >= 2; count--) {
    const found = count === expected ? undefined : split(count);
    if (found?.share === 1) return fewer(count, found.intro, found.length);
  }
  if (wanted === undefined) return { spans: [{ start: 0, end }], exact: false };

  const top = (
    candidates: readonly number[],
    ranks: (i: number) => readonly number[],
    center: number,
  ) => {
    const ranked = (i: number) => [...ranks(i), -Math.abs(i - center)];
    return candidates.reduce((a, b) => {
      const [ra, rb] = [ranked(a), ranked(b)];
      const d = rb.findIndex((r, k) => r !== ra[k]);
      return d >= 0 && (rb[d] ?? 0) > (ra[d] ?? 0) ? b : a;
    }, candidates[0] ?? center);
  };
  const ends = (i: number) => {
    let k = 0;
    while (k < OPENING && i - 1 - k >= 0 && keys[i - 1 - k] === keys[keys.length - 1 - k]) k++;
    return k;
  };
  const firsts = [...new Set([0, ...nearby(wanted.intro, -1)])].filter(
    (i) => i === 0 || (melody[i]?.start ?? 0) >= 2 * bar,
  );
  const ended = Math.max(...firsts.map(ends)) >= ENDING;
  const first = top(firsts, (i) => (ended ? [ends(i), pause(i)] : [pause(i)]), wanted.intro);
  const opens = (i: number, from = first) => {
    let k = 0;
    while (k < OPENING && keys[i + k] !== undefined && keys[i + k] === keys[from + k]) k++;
    return k;
  };
  const starts = [first];
  for (let k = 1; k < expected; k++) {
    const after = starts.at(-1) ?? first;
    const center = after + wanted.length;
    starts.push(top(nearby(center, after), (i) => [ends(i) + opens(i), pause(i)], center));
  }
  const placed = (i: number) => ends(i) >= OPENING || opens(i) >= OPENING;
  if (starts.slice(1).every(placed)) return { spans: spans(starts), exact: false };
  const nearest = (tick: number) => {
    const next = melody.findIndex((note) => note.start >= tick);
    if (next === -1) return melody.length - 1;
    const before = melody[next - 1];
    const after = melody[next]?.start ?? tick;
    return before !== undefined && tick - before.start < after - tick ? next - 1 : next;
  };
  const timed = (from: number) => {
    const tick = melody[from]?.start ?? end;
    if (from > 0 && tick < 2 * bar) return undefined;
    const length = (end - tick) / expected;
    const read = [from];
    for (let k = 1; k < expected; k++) {
      const i = nearest(tick + k * length);
      if (i <= (read.at(-1) ?? from) || ends(i) < OPENING || opens(i, from) < OPENING) return;
      read.push(i);
    }
    return read;
  };
  for (let from = 0; from <= keys.length / 2; from++) {
    const read = timed(from);
    if (read !== undefined) return { spans: spans(read), exact: false };
  }
  return { spans: spans(starts), exact: false };
};

export const fromMidi = (midi: Midi, expectedVerses: number): Score => {
  const tracks = harmonyTracks(midi);
  const harmony = tracks.flatMap((track) => track.notes).sort((a, b) => a.start - b.start);
  const melody = melodyOf(midi, tracks);
  const meter = midi.timeSignatures[0] ?? { numerator: 4, denominator: 4 };
  const signature = midi.keySignatures[0];
  const beatsPerBar = (meter.numerator * 4) / meter.denominator;
  return {
    ticksPerBeat: midi.ticksPerBeat,
    beatsPerBar,
    meter: { numerator: meter.numerator, denominator: meter.denominator },
    meters: [{ ...meter, tick: 0 }, ...midi.timeSignatures.slice(1)],
    key:
      signature === undefined
        ? closingKey(harmony)
        : Chord.keyFromSignature(signature.fifths, signature.minor),
    harmony,
    melody,
    verses: findVerses(melody, expectedVerses, beatsPerBar * midi.ticksPerBeat),
  };
};
