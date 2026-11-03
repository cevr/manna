import { Option, Schema } from 'effect';

import * as Chord from './chord.js';

const Count = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0));
const Beats = Schema.Finite.check(Schema.isGreaterThanOrEqualTo(0));

export const Level = Schema.Literals(['syllable', 'line', 'text']);
export type Level = typeof Level.Type;

export const Reason = Schema.Literals([
  'held',
  'notes',
  'shared',
  'cost',
  'melismas',
  'inexact',
  'reused',
]);
export type Reason = typeof Reason.Type;

const Placed = Schema.Struct({ chord: Chord.Chord, at: Beats });

const Syllable = Schema.Struct({
  text: Schema.String,
  word: Count,
  notes: Count,
  beats: Beats,
  full: Schema.optionalKey(Schema.NonEmptyArray(Placed)),
  guitar: Schema.optionalKey(Schema.NonEmptyArray(Placed)),
});
export type Syllable = typeof Syllable.Type;

const Fit = Schema.Struct({
  notes: Schema.Int,
  syllables: Schema.Int,
  melismas: Schema.Int,
  shared: Schema.Struct({ inWord: Schema.Int, acrossWords: Schema.Int }),
  cost: Schema.Finite,
});
export type Fit = typeof Fit.Type;

const Sung = Schema.TaggedStruct('Sung', {
  level: Schema.Literals(['syllable', 'line']),
  lines: Schema.NonEmptyArray(Schema.NonEmptyArray(Syllable)),
  fit: Fit,
  why: Schema.Array(Reason),
});
export type Sung = typeof Sung.Type;

const Plain = Schema.TaggedStruct('Plain', {
  lines: Schema.NonEmptyArray(Schema.String),
  fit: Schema.optionalKey(Fit),
  why: Schema.NonEmptyArray(Reason),
  full: Schema.optionalKey(Schema.Never),
  guitar: Schema.optionalKey(Schema.Never),
});
export type Plain = typeof Plain.Type;

const Part = Schema.Union([Sung, Plain]);
export type Part = typeof Part.Type;

export const Order = Schema.Literals([
  'after-each',
  'first-and-after-each',
  'before-each',
  'first-and-last',
  'after-last',
]);
export type Order = typeof Order.Type;

const Refrain = Schema.Struct({ order: Order, part: Part });

export const PER_BEAT = 96;

const Time = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0));

const LineTime = Schema.Struct({
  start: Time,
  until: Time,
  syllables: Schema.Array(Time),
  played: Schema.Boolean,
  even: Schema.Boolean,
});

export const Timing = Schema.Struct({
  perBeat: Schema.Literal(PER_BEAT),
  tempos: Schema.Array(Schema.Tuple([Time, Schema.Int.check(Schema.isGreaterThan(0))])),
  intro: Time,
  end: Time,
  lines: Schema.Array(LineTime),
});
export type Timing = typeof Timing.Type;

export const Hymn = Schema.Struct({
  version: Schema.Literal(1),
  book: Schema.Literals(['sdah-1985']),
  number: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)),
  title: Schema.String,
  key: Chord.Key,
  meter: Schema.Struct({ numerator: Schema.Int, denominator: Schema.Int }),
  verses: Schema.Struct({ text: Schema.Int, midi: Schema.Int, exact: Schema.Boolean }),
  stanzas: Schema.NonEmptyArray(Part),
  refrain: Schema.optionalKey(Refrain),
  timing: Schema.optionalKey(Timing),
});
export type Hymn = typeof Hymn.Type;

interface Line {
  readonly verse: number | 'refrain';
  readonly part: Part;
  readonly line: number;
  readonly text: string;
}

const linesOf = (part: Part, verse: Line['verse']): Line[] =>
  part._tag === 'Plain'
    ? part.lines.map((text, line) => ({ verse, part, line, text }))
    : part.lines.map((syllables, line) => ({
        verse,
        part,
        line,
        text: syllables
          .map((s, k) => `${k === 0 ? '' : syllables[k - 1]?.word === s.word ? '' : ' '}${s.text}`)
          .join(''),
      }));

export const sung = (hymn: Hymn): Line[] => {
  const stanzas = hymn.stanzas.map((part, n) => linesOf(part, n + 1));
  const all = stanzas.flat();
  const refrain = hymn.refrain;
  if (refrain === undefined) return all;
  const chorus = linesOf(refrain.part, 'refrain');
  const each = stanzas.flatMap((lines) => [...lines, ...chorus]);
  switch (refrain.order) {
    case 'after-each':
      return each;
    case 'first-and-after-each':
      return [...chorus, ...each];
    case 'before-each':
      return stanzas.flatMap((lines) => [...chorus, ...lines]);
    case 'first-and-last':
      return [...chorus, ...all, ...chorus];
    case 'after-last':
      return [...all, ...chorus];
  }
};

export const Index = Schema.Struct({
  version: Schema.Literal(1),
  book: Schema.Literals(['sdah-1985']),
  hymns: Schema.Array(Schema.Struct({ number: Schema.Int, title: Schema.String, level: Level })),
});
export type Index = typeof Index.Type;

const LAST_HYMN = 695;

export const Topic = Schema.Struct({
  id: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)),
  name: Schema.String.check(Schema.isNonEmpty(), Schema.isTrimmed()),
  first: Schema.Int,
  last: Schema.Int,
});
export type Topic = typeof Topic.Type;

const partitionFault = (topics: readonly Topic[]): string | undefined => {
  if (topics.length === 0) return 'no topics';
  const ids = new Set<number>();
  for (const [i, topic] of topics.entries()) {
    if (ids.has(topic.id)) return `topic ${i}: id ${topic.id} repeats`;
    ids.add(topic.id);
    if (topic.first > topic.last)
      return `topic ${i}: first ${topic.first} after last ${topic.last}`;
    const start = i === 0 ? 1 : (topics[i - 1]?.last ?? 0) + 1;
    if (topic.first !== start) return `topic ${i}: starts at ${topic.first}, not ${start}`;
  }
  const end = topics[topics.length - 1]?.last;
  return end === LAST_HYMN ? undefined : `the last topic ends at ${end}, not ${LAST_HYMN}`;
};

export const Topics = Schema.Struct({
  version: Schema.Literal(1),
  book: Schema.Literals(['sdah-1985']),
  topics: Schema.Array(Topic),
}).check(
  Schema.makeFilter((table) => partitionFault(table.topics) ?? true, {
    expected: 'topics that partition hymns 1-695 in order',
  }),
);
export type Topics = typeof Topics.Type;

export const topicOf = (topics: Topics, number: number): Option.Option<Topic> =>
  Option.fromUndefinedOr(
    topics.topics.find(
      (topic) => topic.first <= number && number <= topic.last && Number.isInteger(number),
    ),
  );
