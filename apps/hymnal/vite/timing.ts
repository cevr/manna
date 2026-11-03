/* oxlint-disable effect/noGlobals, effect/noNewError, effect/noNodeBuiltinImport -- a build-time host script: the bundler plugin runs it under Bun and reads its JSON from standard output, it reads each hymn's sung file from the hymnal package's data, and the build fails naming the hymn that has no timing. */

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

import * as Midi from '../../../packages/hymnal/src/midi';
import * as Sung from '../../../packages/hymnal/src/sung';

import { readPlaybackHymns } from './chords';

export interface Note {
  readonly at: number;
  readonly key: number;
}

export type Verses = ReadonlyArray<ReadonlyArray<Note>>;

const midiFolder = new URL('../data/midi/', import.meta.resolve('@manna/hymnal/hymn'));

const versesRead = new Map<string, Verses>();

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

const wordsOf = (words: ReadonlyArray<number>): ReadonlyArray<ReadonlyArray<number>> => {
  const out: Array<Array<number>> = [];
  words.forEach((word, i) => {
    const last = out.at(-1);
    if (i > 0 && words[i - 1] === word) last?.push(i);
    else out.push([i]);
  });
  return out;
};

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

interface Weighed {
  readonly refrain: boolean;
  readonly line: number;
  readonly times: ReadonlyArray<number>;
  readonly syllables: Option.Option<ReadonlyArray<Syllable>>;
  readonly sure: boolean;
}

interface Placed {
  readonly key: string;
  readonly notes: ReadonlyArray<number>;
}

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

const sameNotes = (a: Placed, b: Placed) =>
  a.notes.length === b.notes.length && a.notes.every((k, i) => k === b.notes[i]);

const sameOpening = (a: Placed, b: Placed) => Math.abs((a.notes[0] ?? 0) - (b.notes[0] ?? 0)) <= 1;

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

const headOf = (hymn: Hymn, timing: HymnTiming): Option.Option<string> =>
  Option.map(
    Arr.findLast(timing.tempos, ([at]) => at <= timing.intro),
    ([, microsPerQuarter]) =>
      `${microsPerQuarter},${hymn.meter.numerator},${hymn.meter.denominator}|`,
  );

export const encodeTiming = (hymn: Hymn, verses: () => Verses): Option.Option<string> =>
  Option.flatMap(Option.fromUndefinedOr(hymn.timing), (timing) =>
    Option.map(headOf(hymn, timing), (head) => head + linesOf(hymn, timing, verses)),
  );

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
