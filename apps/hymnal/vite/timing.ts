/* oxlint-disable effect/noGlobals, effect/noNewError, effect/noNodeBuiltinImport -- a build-time host script: the bundler plugin runs it under Bun and reads its JSON from standard output, it reads each hymn's sung file from the hymnal package's data, and the build fails naming the hymn that has no timing. */

/**
 * Every compiled hymn's timing as the follow reads it: `[number, string]` in
 * number order, each string the hymn's sung lines in the encoding
 * `src/follow/timeline.ts` decodes. Read by the `virtual:hymnal-timing`
 * plugin (`hymnal.ts`) and by the app's tests; the compiled set is read as
 * `words.ts` reads it, and the build fails on a hymn with no timing.
 *
 * The string opens on a head, `<microsPerQuarter>,<numerator>,<denominator>|`:
 * the hymn's first tempo, the tempo map's change in force at `Timing.intro`
 * (the first played sung note, past any fast lead-in the file opens with),
 * as stored, and the meter the tune opens in (`Hymn.meter`). The player's
 * bpm read-out and `Tap` count against it.
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
 * Sung part, with note times that pass `sound`, and, in a `line`-level part,
 * laid as its other singings lay it (`agrees`). Any other line is marked
 * whole.
 *
 * A line's times are its notes' times at either chord level; the words the
 * compiler laid on those notes are less sure at `line` level, its grade for
 * a part whose syllables it could not place with confidence. Verses of the
 * sung file often play the same notes, and a line sung on the same notes in
 * two places shows where the compiler put its words in each: a `line`-level
 * line keeps its times only when no such singing puts them elsewhere. A
 * `syllable`-level line keeps its times as compiled.
 */

import { readFileSync } from 'node:fs';
import * as Timing from '@manna/hymnal/timing';
import {
  type Hymn,
  PER_BEAT,
  type Sung as SungPart,
  type Syllable,
  sung,
  type Timing as HymnTiming,
} from '@manna/hymnal/hymn';
import { Array as Arr, Effect, Option } from 'effect';

// The hymnal package does not export its read of the sung file; the encoder
// reads it as the compiler does (`compile.ts`), from the same modules.
import * as Midi from '../../../packages/hymnal/src/midi';
import * as Sung from '../../../packages/hymnal/src/sung';

import { readPlaybackHymns } from './chords';

/** A melody note of a hymn's sung file: its start, in the timing's units (`PER_BEAT` a beat), and its key. */
export interface Note {
  readonly at: number;
  readonly key: number;
}

/** The melody of each verse of a hymn's sung file, in order. */
export type Verses = ReadonlyArray<ReadonlyArray<Note>>;

const midiFolder = new URL('../data/midi/', import.meta.resolve('@manna/hymnal/hymn'));

/** Each sung file read so far, by hymn number and stanza count: the build and the tests read one many times. */
const versesRead = new Map<string, Verses>();

/** Hymn `hymn`'s sung file (`Sung.of`, a verse for each stanza) read into its verses' melodies. */
export const versesOf = (hymn: Hymn): Verses => {
  const id = `${hymn.number}/${hymn.stanzas.length}`;
  return Option.getOrElse(Option.fromUndefinedOr(versesRead.get(id)), () => {
    const verses = readVerses(hymn);
    versesRead.set(id, verses);
    return verses;
  });
};

const readVerses = (hymn: Hymn): Verses => {
  const file = new URL(`${String(hymn.number).padStart(3, '0')}.mid`, midiFolder);
  const midi = Effect.runSync(Midi.parse(new Uint8Array(readFileSync(file))));
  const { midi: sungMidi, score } = Sung.of(midi, hymn.stanzas.length);
  const unit = (tick: number) => Math.round((tick * PER_BEAT) / sungMidi.ticksPerBeat);
  return score.verses.spans.map((span) =>
    score.melody
      .filter((note) => note.start >= span.start && note.start < span.end)
      .map((note) => ({ at: unit(note.start), key: note.key })),
  );
};

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
const sound = (
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

/** A sung line as the encoder weighs it. */
interface Weighed {
  /** Whether it is a refrain's line, and its index in its part: its place in the hymn's music. */
  readonly refrain: boolean;
  readonly line: number;
  /** Its syllables' starts, in the timing's units. */
  readonly times: ReadonlyArray<number>;
  /** Its part line's syllables when its note times may light it: played, not even, Sung, and `sound`. */
  readonly syllables: Option.Option<ReadonlyArray<Syllable>>;
  /** Whether its part is at `syllable` level, the compiler's surest placing of its words. */
  readonly sure: boolean;
}

/** Where a line's syllables fall in the sung file. */
interface Placed {
  /** Its verse's notes as one key: each note's start from the verse's first, and its key. */
  readonly key: string;
  /** Each syllable's note, by index in the verse's melody. */
  readonly notes: ReadonlyArray<number>;
}

/**
 * The verse whose notes a line's syllables start, and the note each starts;
 * none when a syllable starts no note of the verse its first one starts.
 */
const placed = (verses: Verses, times: ReadonlyArray<number>): Option.Option<Placed> =>
  Option.flatMap(
    Arr.findFirst(verses, (verse) => verse.some((note) => note.at === times[0])),
    (verse) =>
      Option.liftPredicate(
        {
          key: verse.map((note) => `${note.at - (verse[0]?.at ?? 0)}:${note.key}`).join(' '),
          notes: times.map((t) => verse.findIndex((note) => note.at === t)),
        },
        (place) => place.notes.length > 0 && place.notes.every((k) => k >= 0),
      ),
  );

/** Every syllable of two placings on the same note: the same words laid the same way. */
const sameNotes = (a: Placed, b: Placed) =>
  a.notes.length === b.notes.length && a.notes.every((k, i) => k === b.notes[i]);

/** Two placings opening within one note of each other. */
const sameOpening = (a: Placed, b: Placed) => Math.abs((a.notes[0] ?? 0) - (b.notes[0] ?? 0)) <= 1;

/**
 * Whether a line's words sit where every other singing of it on the same
 * notes puts them: each timed line of its place in the music whose verse
 * plays the same keys at the same steps. A refrain's line is the same words
 * each time, so each of its syllables sits on the same note; a stanza's line
 * carries other words, so it opens within one note of the other's opening.
 * A line whose syllables start no notes agrees with nothing, and a singing
 * whose syllables start no notes leaves none of its place lit.
 */
const agrees = (
  line: Weighed,
  place: Option.Option<Placed>,
  timed: ReadonlyArray<readonly [Weighed, Option.Option<Placed>]>,
): boolean =>
  Option.match(place, {
    onNone: () => false,
    onSome: (own) =>
      timed
        .filter(
          ([other]) => other !== line && other.refrain === line.refrain && other.line === line.line,
        )
        .every(([, theirs]) =>
          Option.match(theirs, {
            onNone: () => false,
            onSome: (other) =>
              other.key !== own.key ||
              (line.refrain && sameNotes(own, other)) ||
              (!line.refrain && sameOpening(own, other)),
          }),
        ),
  });

/**
 * Whether each line lights its words: a `syllable`-level line whose note
 * times may light it, and a `line`-level one that also `agrees`. `verses`
 * is read only when a `line`-level line has note times.
 */
const litOf = (weighed: ReadonlyArray<Weighed>, verses: () => Verses): ReadonlyArray<boolean> => {
  const timed = weighed.filter((one) => Option.isSome(one.syllables));
  if (timed.every((one) => one.sure)) return weighed.map((one) => Option.isSome(one.syllables));
  const read = verses();
  const places = timed.map((one) => [one, placed(read, one.times)] as const);
  return weighed.map((one) =>
    Option.match(
      Arr.findFirst(places, ([other]) => other === one),
      {
        onNone: () => false,
        onSome: ([, place]) => one.sure || agrees(one, place, places),
      },
    ),
  );
};

/** The head of the encoding: the tempo in force at the timing's `intro`, and the hymn's meter; none when no change is. */
const headOf = (hymn: Hymn, timing: HymnTiming): Option.Option<string> =>
  Option.map(
    Arr.findLast(timing.tempos, ([at]) => at <= timing.intro),
    ([, microsPerQuarter]) =>
      `${microsPerQuarter},${hymn.meter.numerator},${hymn.meter.denominator}|`,
  );

/**
 * The hymn's timing in the encoding above; none when it has no timing.
 * `verses` reads its sung file's melodies, called only when a `line`-level
 * line needs them.
 */
export const encodeTiming = (hymn: Hymn, verses: () => Verses): Option.Option<string> =>
  Option.flatMap(Option.fromUndefinedOr(hymn.timing), (timing) =>
    Option.map(headOf(hymn, timing), (head) => head + linesOf(hymn, timing, verses)),
  );

/** The hymn's sung lines in the encoding above, after the head. */
const linesOf = (hymn: Hymn, timing: HymnTiming, verses: () => Verses): string => {
  const seconds = Timing.secondsAt(timing);
  const ms = (time: number) => Math.round(seconds(time) * 1000);
  const lines = sung(hymn);
  const weighed = timing.lines.map((line, i): Weighed => {
    const at = Arr.get(lines, i);
    const index = Option.match(at, { onNone: () => 0, onSome: (one) => one.line });
    const part = Option.flatMap(at, (one) =>
      Option.liftPredicate(one.part, (p): p is SungPart => p._tag === 'Sung'),
    );
    return {
      refrain: Option.exists(at, (one) => one.verse === 'refrain'),
      line: index,
      times: line.syllables,
      syllables: Option.filter(
        Option.flatMap(part, (p) => Arr.get(p.lines, index)),
        (syllables) =>
          line.played &&
          !line.even &&
          sound(line.syllables.map(ms), syllables.length, ms(line.start), ms(line.until)),
      ),
      sure: Option.exists(part, (p) => p.level === 'syllable'),
    };
  });
  const lit = litOf(weighed, verses);
  let before = 0;
  return Arr.zip(timing.lines, weighed)
    .map(([line, one], i) => {
      const start = ms(line.start);
      const fields = [
        Number(line.played) + 2 * Number(line.even),
        start - before,
        ms(line.until) - start,
      ];
      before = start;
      return Option.match(
        Option.filter(one.syllables, () => lit[i] === true),
        {
          onNone: () => fields.join(','),
          onSome: (syllables) => {
            const times = line.syllables.map(ms);
            let step = start;
            const words = wordsOf(syllables.map((s) => s.word)).map((word) =>
              word
                .map((k) => {
                  const t = times[k] ?? step;
                  const gap = t - step;
                  step = t;
                  return gap;
                })
                .join('.'),
            );
            return [...fields, ...words].join(',');
          },
        },
      );
    })
    .join(';');
};

let encoded = Option.none<ReadonlyArray<readonly [number, string]>>();

export const readTiming = (): ReadonlyArray<readonly [number, string]> => {
  if (Option.isNone(encoded))
    encoded = Option.some(
      readPlaybackHymns().map(
        (hymn) =>
          [
            hymn.number,
            Option.getOrThrowWith(
              encodeTiming(hymn, () => versesOf(hymn)),
              () => new Error(`hymnal: hymn ${hymn.number} has no timing`),
            ),
          ] as const,
      ),
    );
  return Option.getOrThrow(encoded);
};

if (import.meta.main) process.stdout.write(JSON.stringify(readTiming()));
