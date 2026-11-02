/* oxlint-disable effect/noGlobals, effect/noNewError -- a build-time host script: the bundler plugin runs it under Bun and reads its JSON from standard output, and the build fails naming the hymn that has no timing. */

/**
 * Every compiled hymn's timing as the follow reads it: `[number, string]` in
 * number order, each string the hymn's sung lines in the encoding
 * `src/follow/timeline.ts` decodes. Read by the `virtual:hymnal-timing`
 * plugin (`hymnal.ts`) and by the app's tests; the compiled set is read as
 * `words.ts` reads it, and the build fails on a hymn with no timing.
 *
 * Times are whole milliseconds from the file's start, through the hymn's
 * tempo map (`Timing.secondsAt`, the same math `sync-check` holds to the
 * recordings). One line per `sung(hymn)` line, in that order, `;` between
 * lines; a line is `<flags>,<start>,<length>[,<word>…]`:
 * - `flags`: 1 when the file plays the line, plus 2 when its times are even
 *   shares rather than its notes';
 * - `start`: after the line before's start (the first, after 0);
 * - `length`: to its `until`, the next line's start (the last, the end);
 * - each `word`: its syllables' starts, `.` between them, each after the
 *   syllable before (the first, after the line's start).
 *   Two syllables on one note share a start, a step of 0.
 * Only a line whose words may be lit carries words: played, not even, in a
 * Sung part, and with note times that pass `sound`. The part's chord level
 * does not decide it: it grades how sure the chord anchors are, while a
 * line's syllable times are the notes' times at either level. Any other line
 * is marked whole.
 */

import * as Timing from '@manna/hymnal/timing';
import { type Hymn, sung } from '@manna/hymnal/hymn';
import { Option } from 'effect';

import { readPlaybackHymns } from './chords';

/** Each word's syllable indices, from the syllables' `word` places. */
const wordsOf = (words: ReadonlyArray<number>): ReadonlyArray<ReadonlyArray<number>> => {
  const out: Array<Array<number>> = [];
  words.forEach((word, i) => {
    const last = out.at(-1);
    if (i > 0 && words[i - 1] === word) last?.push(i);
    else out.push([i]);
  });
  return out;
};

/**
 * Whether a line's syllable times, in ms, may light its words: one per
 * syllable of its part's line, none before the one before, the first at or
 * after the line's `start` and the last before its `until`. A line that fails
 * is marked whole, so a time the compiler got wrong never lights a syllable.
 */
export const sound = (
  times: ReadonlyArray<number>,
  syllables: number,
  start: number,
  until: number,
): boolean =>
  times.length > 0 &&
  times.length === syllables &&
  (times[0] ?? -1) >= start &&
  (times.at(-1) ?? until) < until &&
  times.every((t, k) => k === 0 || t >= (times[k - 1] ?? t));

/** The hymn's timing in the encoding above; none when it has no timing. */
export const encodeTiming = (hymn: Hymn): Option.Option<string> =>
  Option.map(Option.fromUndefinedOr(hymn.timing), (timing) => {
    const seconds = Timing.secondsAt(timing);
    const ms = (time: number) => Math.round(seconds(time) * 1000);
    const lines = sung(hymn);
    let before = 0;
    return timing.lines
      .map((line, i) => {
        const start = ms(line.start);
        const fields = [
          Number(line.played) + 2 * Number(line.even),
          start - before,
          ms(line.until) - start,
        ];
        before = start;
        const part = lines[i]?.part;
        if (!line.played || line.even || part?._tag !== 'Sung') return fields.join(',');
        const syllables = part.lines[lines[i]?.line ?? 0] ?? [];
        const times = line.syllables.map(ms);
        if (!sound(times, syllables.length, start, ms(line.until))) return fields.join(',');
        let at = start;
        const words = wordsOf(syllables.map((s) => s.word)).map((word) =>
          word
            .map((k) => {
              const t = times[k] ?? at;
              const step = t - at;
              at = t;
              return step;
            })
            .join('.'),
        );
        return [...fields, ...words].join(',');
      })
      .join(';');
  });

let encoded = Option.none<ReadonlyArray<readonly [number, string]>>();

export const readTiming = (): ReadonlyArray<readonly [number, string]> => {
  if (Option.isNone(encoded))
    encoded = Option.some(
      readPlaybackHymns().map(
        (hymn) =>
          [
            hymn.number,
            Option.getOrThrowWith(
              encodeTiming(hymn),
              () => new Error(`hymnal: hymn ${hymn.number} has no timing`),
            ),
          ] as const,
      ),
    );
  return Option.getOrThrow(encoded);
};

if (import.meta.main) process.stdout.write(JSON.stringify(readTiming()));
