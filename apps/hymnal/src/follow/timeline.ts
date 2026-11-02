/**
 * When each sung line and word of a hymn comes, in milliseconds from the
 * recording's start, and where a time falls among them.
 *
 * The bundle carries each hymn's timing as one string (`virtual:hymnal-timing`,
 * made by `vite/timing.ts`, which documents the encoding): a head, the hymn's
 * first tempo and meter (`<microsPerQuarter>,<numerator>,<denominator>|`),
 * then its lines. `timelineOf` decodes it, and `timingBook` decodes each
 * hymn once, on first follow. The
 * lines are `sung(hymn)`'s, in that order, so line i is the i-th line the
 * reader shows. `placeAt` answers which line and syllable a time is in, and
 * when that next changes. Pure: no clock, no React.
 */

import { Effect, Option } from 'effect';

/** One sung line's times, in milliseconds. */
export interface TimedLine {
  readonly start: number;
  /** The next line's start; the last line's is the timeline's end. */
  readonly until: number;
  /** False for a line the recording does not sound (laid in its intro, or past its end). */
  readonly played: boolean;
  /** True when its times are even shares of its part's, not its notes'. */
  readonly even: boolean;
  /** Each syllable's start, when the line's words may be lit; empty for a line marked whole. */
  readonly syllables: ReadonlyArray<number>;
  /** Each syllable's word: its place among the line's words, so a word's syllables light together. */
  readonly words: ReadonlyArray<number>;
}

/** A hymn's first tempo: the tempo map's change in force at its first played sung note, and its meter. */
export interface FirstTempo {
  /** How long a quarter note lasts, in microseconds. */
  readonly microsPerQuarter: number;
  readonly numerator: number;
  readonly denominator: number;
}

export interface Timeline {
  /** The hymn's first tempo, from the string's head: what its bpm read-out and `Tap` count against. */
  readonly tempo: FirstTempo;
  readonly lines: ReadonlyArray<TimedLine>;
  /** The first sung line's start. */
  readonly first: number;
  /** The last line's `until`: past the recording's end when stanzas are sung it does not sound. */
  readonly end: number;
}

const count = (text: string): Option.Option<number> => {
  const n = Number(text);
  return Option.liftPredicate(n, (value) => text !== '' && Number.isInteger(value) && value >= 0);
};

/** One encoded line, read on from the line before's start; none when malformed. */
const lineOf = (text: string, before: number): Option.Option<TimedLine> => {
  const [flagText = '', startText = '', lengthText = '', ...wordTexts] = text.split(',');
  return Option.gen(function* () {
    const flags = yield* Option.filter(count(flagText), (n) => n <= 3);
    const start = before + (yield* count(startText));
    const until = start + (yield* count(lengthText));
    const syllables: Array<number> = [];
    const words: Array<number> = [];
    let at = start;
    for (const [word, wordText] of wordTexts.entries())
      for (const step of wordText.split('.')) {
        at += yield* count(step);
        syllables.push(at);
        words.push(word);
      }
    return { start, until, played: (flags & 1) === 1, even: (flags & 2) === 2, syllables, words };
  });
};

/** A positive whole number; none for anything else. */
const positive = (text: string): Option.Option<number> => Option.filter(count(text), (n) => n > 0);

/** The string's head, `<microsPerQuarter>,<numerator>,<denominator>`; none when malformed. */
const tempoOf = (text: string): Option.Option<FirstTempo> => {
  const [micros = '', numerator = '', denominator = '', ...rest] = text.split(',');
  return Option.gen(function* () {
    if (rest.length > 0) return yield* Option.none();
    return {
      microsPerQuarter: yield* positive(micros),
      numerator: yield* positive(numerator),
      denominator: yield* positive(denominator),
    };
  });
};

/**
 * A hymn's timeline from its bundled string; none when the string does not
 * decode, a string with no valid head among them.
 */
export const timelineOf = (encoded: string): Option.Option<Timeline> =>
  Option.gen(function* () {
    const bar = encoded.indexOf('|');
    if (bar < 0) return yield* Option.none();
    const tempo = yield* tempoOf(encoded.slice(0, bar));
    const lines: Array<TimedLine> = [];
    let before = 0;
    for (const text of encoded.slice(bar + 1).split(';')) {
      const line = yield* lineOf(text, before);
      lines.push(line);
      before = line.start;
    }
    const first = yield* Option.fromUndefinedOr(lines[0]);
    const last = yield* Option.fromUndefinedOr(lines.at(-1));
    return { tempo, lines, first: first.start, end: last.until };
  });

/**
 * Every hymn's timing as bundled, each decoded the first time it is asked
 * for and kept. A string that does not decode is logged
 * (`timing.decode.failed`) and the hymn is not followed.
 */
export const timingBook = (bundled: ReadonlyArray<readonly [number, string]>) => {
  const encoded = new Map(bundled);
  const kept = new Map<number, Option.Option<Timeline>>();
  const decode = (number: number): Option.Option<Timeline> => {
    const timeline = Option.flatMap(Option.fromUndefinedOr(encoded.get(number)), timelineOf);
    if (Option.isNone(timeline))
      Effect.runSync(Effect.logWarning(`[follow] timing.decode.failed number=${number}`));
    return timeline;
  };
  return {
    /** The timeline of hymn `number`, none when the bundle has none that decodes. */
    of: (number: number): Option.Option<Timeline> =>
      Option.getOrElse(Option.fromUndefinedOr(kept.get(number)), () => {
        const timeline = decode(number);
        kept.set(number, timeline);
        return timeline;
      }),
  };
};
export type TimingBook = ReturnType<typeof timingBook>;

/** Where a time falls on a timeline. */
export interface Place {
  /** The line being sung; -1 before the first line and from the end on. */
  readonly line: number;
  /** The syllable of that line being sung; -1 when none is (a line marked whole, or none sung). */
  readonly syllable: number;
  /** That syllable's word; -1 with no syllable. */
  readonly word: number;
  /** When the place next changes; `Infinity` from the end on. */
  readonly nextAt: number;
}

/** The last of `count` ascending starts at or before `ms`; -1 when none is. */
const lastAtOrBefore = (count: number, startOf: (i: number) => number, ms: number): number => {
  let low = 0;
  let high = count;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (startOf(middle) <= ms) low = middle + 1;
    else high = middle;
  }
  return low - 1;
};

const nowhere = (nextAt: number): Place => ({ line: -1, syllable: -1, word: -1, nextAt });

/** The line and syllable sung at `ms`, and when that next changes. */
export const placeAt = (timeline: Timeline, ms: number): Place => {
  const { lines } = timeline;
  if (ms >= timeline.end) return nowhere(Infinity);
  if (ms < timeline.first) return nowhere(timeline.first);
  const index = lastAtOrBefore(lines.length, (i) => lines[i]?.start ?? Infinity, ms);
  return Option.match(Option.fromUndefinedOr(lines[index]), {
    onNone: () => nowhere(timeline.first),
    onSome: (line) => {
      // Lines run on from one to the next, so only a line's own `until` can end it early.
      if (ms >= line.until) return nowhere(lines[index + 1]?.start ?? Infinity);
      const syllable = lastAtOrBefore(
        line.syllables.length,
        (i) => line.syllables[i] ?? Infinity,
        ms,
      );
      return {
        line: index,
        syllable,
        word: line.words[syllable] ?? -1,
        nextAt: Math.min(line.syllables[syllable + 1] ?? Infinity, line.until),
      };
    },
  });
};
