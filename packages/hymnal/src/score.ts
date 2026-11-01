/**
 * A hymn's MIDI file read as music: which tracks hold the harmony, the
 * melody, the meter and key, and where the intro ends and each verse begins.
 *
 * The hymnal's files play an intro (some bars of the tune) and then every
 * verse in full. The tracks and the tune come from `melody.ts`.
 */

import * as Chord from './chord.js';
import { harmonyTracks, melodyOf } from './melody.js';
import type { Midi, Note, TimeSignature } from './midi.js';

export { harmonyTracks, melodyOf, topVoice } from './melody.js';

/** Where one verse is played, in ticks: from its first note to the next verse's first note. */
export interface Span {
  readonly start: number;
  readonly end: number;
}

export interface Verses {
  /** Each verse's span; the intro is everything before the first. */
  readonly spans: readonly Span[];
  /** True when every verse's melody repeats the first exactly. */
  readonly exact: boolean;
}

export interface Score {
  readonly ticksPerBeat: number;
  /** Quarter-note beats in a bar: 3 for 3/4, 3 for 6/8. */
  readonly beatsPerBar: number;
  readonly meter: { readonly numerator: number; readonly denominator: number };
  /** Every meter from the tick it starts, the opening one at tick 0; bars count from each. */
  readonly meters: readonly TimeSignature[];
  readonly key: Chord.Key;
  readonly harmony: readonly Note[];
  /** The tune's notes, one per sung note, start to end of the file. */
  readonly melody: readonly Note[];
  readonly verses: Verses;
}

/** The key the closing chord's bass names, for files with no key signature. */
const closingKey = (harmony: readonly Note[]): Chord.Key => {
  const end = Math.max(...harmony.map((note) => note.end));
  const last = harmony.filter((note) => note.end === end);
  const bass = Math.min(...last.map((note) => note.key)) % 12;
  const minor = last.some((note) => (note.key - bass + 12) % 12 === 3);
  return Chord.keyOnPitch(bass, minor);
};

/**
 * Splits the melody into an intro and verses. Where the tune repeats note
 * for note, the verses are equal: `expected` (the text's verse count) is
 * tried first, then the most verses that repeat exactly. A verse sung in its
 * own rhythm, a note split or joined for its words, breaks the repeat: when
 * fewer verses repeat exactly than the text has, the missing ones are found
 * beside them (`fewer`). With no exact repeat, the expected count's closest
 * equal split only places each verse near its start: the verse starts on the
 * note nearby that opens as the first verse does, after the longest pause
 * (the end of a phrase).
 */
export const findVerses = (melody: readonly Note[], expected: number): Verses => {
  const keys = melody.map((note) => note.key);
  const end = melody.at(-1)?.end ?? 0;
  // The time from the note before to this one: a long note or a rest ends a phrase. The files
  // play an intro first, so the first note is no verse's start.
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
  /** The notes within `REACH` of `center`, after note `after` and before note `before`. */
  const nearby = (center: number, after: number, before = keys.length) =>
    Array.from({ length: 2 * REACH + 1 }, (_, d) => center - REACH + d).filter(
      (i) => i > after && i < before,
    );
  const best = (candidates: readonly number[], score: (i: number) => number, center: number) =>
    candidates.reduce((a, b) => {
      const [sa, sb] = [score(a), score(b)];
      return sb > sa || (sb === sa && Math.abs(b - center) < Math.abs(a - center)) ? b : a;
    }, candidates[0] ?? center);

  /**
   * `count` verses of `length` notes repeat exactly after `intro` notes, fewer than the text's
   * stanzas: the missing stanzas are sung in their own rhythm, or the file plays fewer verses.
   * Each verse found here starts on the note nearby that opens on the exact verses' first key,
   * after the longest pause.
   * - When the intro has room for the missing verses, they come first, each about a verse
   *   before the next. The first exact verse may itself be the one in its own rhythm, its
   *   opening key sung once more, so the keys repeat from a note late: it starts nearby too.
   * - Else, when the text's count is a multiple of `count`, each exact span holds that many
   *   stanzas, the alternate ones in a second rhythm.
   * - Else the file plays `count` verses.
   */
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

  const first = best(nearby(wanted.intro, -1), pause, wanted.intro);
  // How many of the first verse's opening keys this note begins with, in a row.
  const opens = (i: number) => {
    let k = 0;
    while (k < OPENING && keys[i + k] !== undefined && keys[i + k] === keys[first + k]) k++;
    return k;
  };
  const starts = [first];
  for (let k = 1; k < expected; k++) {
    const center = (starts.at(-1) ?? first) + wanted.length;
    const after = starts.at(-1) ?? first;
    const ranked = (i: number) => opens(i) * end + Math.min(pause(i), end - 1);
    starts.push(best(nearby(center, after), ranked, center));
  }
  return { spans: spans(starts), exact: false };
};

/** Reads a hymn's file; `expectedVerses` is the number of verses its text has. */
export const fromMidi = (midi: Midi, expectedVerses: number): Score => {
  const tracks = harmonyTracks(midi);
  const harmony = tracks.flatMap((track) => track.notes).sort((a, b) => a.start - b.start);
  const melody = melodyOf(midi, tracks);
  const meter = midi.timeSignatures[0] ?? { numerator: 4, denominator: 4 };
  const signature = midi.keySignatures[0];
  return {
    ticksPerBeat: midi.ticksPerBeat,
    beatsPerBar: (meter.numerator * 4) / meter.denominator,
    meter: { numerator: meter.numerator, denominator: meter.denominator },
    meters: [{ ...meter, tick: 0 }, ...midi.timeSignatures.slice(1)],
    key:
      signature === undefined
        ? closingKey(harmony)
        : Chord.keyFromSignature(signature.fifths, signature.minor),
    harmony,
    melody,
    verses: findVerses(melody, expectedVerses),
  };
};
