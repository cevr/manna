/**
 * The KJV sounds-alike table (`data/kjv-hearings.json`, written by
 * `data/hearings.py` from Misaki's pronunciation dictionary): for each
 * archaic word, the modern words a recognizer writes for the same sound.
 * A hearing stands for its archaic word only, one way, never the reverse;
 * a word's modern forms, which a reader says when modernizing, never do.
 * The file is decoded once per process and fails loudly when it does not
 * decode.
 */

import { Order, Schema } from 'effect';

import data from '../../data/kjv-hearings.json';

const Phrases = Schema.Record(Schema.String, Schema.String);

const Entry = Schema.Struct({
  modern: Schema.Array(Schema.String),
  sounds: Schema.Array(Schema.String),
  hearings: Phrases,
});

const Table = Schema.Struct({
  archaic: Schema.Record(Schema.String, Entry),
  pronouns: Schema.Array(Schema.String),
  extra: Schema.Record(Schema.String, Phrases),
});

/** Decodes a sounds-alike table, throwing when it does not decode. */
export const decodeHearings = Schema.decodeUnknownSync(Table);

const table = decodeHearings(data);

const NONE: readonly string[] = [];

/** Each archaic word's hearings: the dictionary's in code-unit order, then the extras' in code-unit order. */
const HEARINGS: ReadonlyMap<string, readonly string[]> = new Map(
  Object.entries(table.archaic).map(([word, entry]) => [
    word,
    [
      ...Object.keys(entry.hearings).toSorted(Order.String),
      ...Object.keys(table.extra[word] ?? {}).toSorted(Order.String),
    ],
  ]),
);

const MODERN: ReadonlyMap<string, readonly string[]> = new Map(
  Object.entries(table.archaic).map(([word, entry]) => [word, entry.modern]),
);

/** The hearings of a word key, first hearing first; none for a word outside the table. */
export const hearingsOf = (key: string): readonly string[] => HEARINGS.get(key) ?? NONE;

/** The modern forms of a word key, in the table's order; none for a word outside the table. */
export const modernOf = (key: string): readonly string[] => MODERN.get(key) ?? NONE;

/** Every hearing of every word, as the spoken keys it is made of joined by one space. */
export const HEARD: ReadonlySet<string> = new Set([...HEARINGS.values()].flat());

/** The longest hearing in words, so a spoken span past it holds none. */
export const LONGEST_HEARING = Math.max(
  0,
  ...[...HEARD].map((hearing) => hearing.split(' ').length),
);
