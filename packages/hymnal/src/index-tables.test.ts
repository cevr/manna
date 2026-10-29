/**
 * The `index_*` tables hold every index as decoded: made-up sets drawn from a
 * fixed seed, with every optional key both present and absent, are written
 * to an in-memory database and read back equal, and the comparison names an
 * index whose rows differ. The committed files' round trip is
 * `index-tables.slow.test.ts`.
 */
import { Database } from 'bun:sqlite';
import { describe, expect, it } from 'bun:test';

import { Schema } from 'effect';

import {
  diffIndexTables,
  IndexesSchema,
  type IndexSources,
  readIndexTables,
  writeIndexTables,
} from './index-tables.js';
import { IndexName, Rulings } from './indexes.js';

const roundTrip = (sources: IndexSources) => {
  const db = new Database(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  db.transaction(() => writeIndexTables(db, sources))();
  const read = readIndexTables(db);
  db.close();
  return read;
};

/** A fixed-seed source of numbers in [0, 1) (mulberry32), so each run draws the same sets. */
const seeded = (seed: number) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/** Made-up encoded index files over a seed: small, with every optional key both present and absent. */
const generator = (random: () => number) => {
  const int = (min: number, max: number) => min + Math.floor(random() * (max - min + 1));
  const chance = (p = 0.5) => random() < p;
  const list = <A>(max: number, draw: () => A) => Array.from({ length: int(0, max) }, draw);
  const word = () => Array.from({ length: int(0, 6) }, () => 'qxzvkj -,'[int(0, 8)]).join('');
  const maybe = <A>(key: string, draw: () => A): object =>
    Object.fromEntries(chance() ? [[key, draw()]] : []);
  const ref = () => ({ number: int(1, 999), page: int(1, 999) });
  const stanza = () => 'abcdefgh'[int(0, 7)];
  const passage = () =>
    chance()
      ? {
          book: int(1, 66),
          chapter: int(1, 150),
          verses: list(3, () => ({ from: int(1, 176), to: int(1, 176) })),
        }
      : {
          book: int(1, 66),
          from: { chapter: int(1, 150), verse: int(1, 176) },
          to: { chapter: int(1, 150), verse: int(1, 176) },
        };
  const header = (index: IndexName) => ({
    version: 1,
    book: 'sdah-1985',
    index,
    title: word(),
    ...maybe('note', word),
    pages: Array.from({ length: int(1, 3) }, () => ({ page: int(1, 999), entries: int(0, 99) })),
  });
  const people = () =>
    list(4, () => ({
      name: word(),
      ...maybe('source', () => true),
      ...maybe('see', word),
      hymns: list(3, ref),
    }));
  const bodies = {
    topical: () => ({
      topics: list(4, () => ({
        name: word(),
        ...maybe('parent', word),
        see: list(2, word),
        hymns: list(3, ref),
        readings: list(3, ref),
      })),
    }),
    'worship-aids': () => ({
      entries: list(4, () => ({ passage: passage(), reading: int(696, 920), page: int(1, 999) })),
    }),
    scriptural: () => ({
      entries: list(4, () => ({
        passage: passage(),
        hymn: int(1, 695),
        ...maybe('stanza', stanza),
        page: int(1, 999),
      })),
    }),
    'scriptural-by-hymn': () => ({
      entries: list(4, () => ({
        hymn: int(1, 695),
        ...maybe('stanza', stanza),
        passage: passage(),
        page: int(1, 999),
      })),
      // An empty `see` has no rows to tell it from an absent one, so the draw is absent or non-empty.
      ...maybe('see', () =>
        Array.from({ length: int(1, 3) }, () => ({
          hymn: int(1, 695),
          see: int(1, 695),
          page: int(1, 999),
        })),
      ),
    }),
    sentences: () => ({
      groups: list(3, () => ({
        name: word(),
        hymns: list(3, () => ({
          number: int(1, 999),
          stanzas: list(3, stanza),
          page: int(1, 999),
        })),
      })),
    }),
    canons: () => ({ groups: list(3, () => ({ name: word(), hymns: list(3, ref) })) }),
    young: () => ({
      hymns: list(4, () => ({ number: int(1, 695), starred: chance(), page: int(1, 999) })),
    }),
    authors: () => ({ people: people() }),
    composers: () => ({ people: people() }),
    tunes: () => ({
      tunes: list(4, () => ({ name: word(), ...maybe('alias', () => true), hymns: list(3, ref) })),
    }),
    metrical: () => ({
      metres: list(3, () => ({
        metre: word(),
        ...maybe('gloss', word),
        tunes: list(3, () => ({ name: word(), hymns: list(3, ref) })),
      })),
    }),
  } satisfies { readonly [K in IndexName]: () => object };
  return (): IndexSources => ({
    indexes: Schema.decodeSync(IndexesSchema)(
      Object.fromEntries(
        IndexName.literals
          .filter(() => chance(0.7))
          .map((name) => [name, { ...header(name), ...bodies[name]() }]),
      ),
    ),
    rulings: Schema.decodeUnknownSync(Rulings)({
      version: 1,
      book: 'sdah-1985',
      rulings: list(3, () => ({
        index: IndexName.literals[int(0, IndexName.literals.length - 1)],
        page: int(1, 999),
        at: word(),
        check: word(),
        value: word(),
        judge: word(),
        why: word(),
      })),
    }),
  });
};

describe('index tables', () => {
  it('read back each made-up set of indexes as drawn', () => {
    const draw = generator(seeded(20261029));
    for (let run = 0; run < 40; run++) {
      const sources = draw();
      const read = roundTrip(sources);
      expect(read).toStrictEqual(sources);
      expect(diffIndexTables(sources, read)).toStrictEqual([]);
    }
  });

  it('name each index present on one side only', () => {
    const draw = generator(seeded(7));
    const sources = draw();
    const other = draw();
    const read = roundTrip(sources);
    const differs = IndexName.literals.filter(
      (name) => (sources.indexes[name] === undefined) !== (other.indexes[name] === undefined),
    );
    expect(differs.length).toBeGreaterThan(0);
    expect(diffIndexTables(other, read)).toEqual(expect.arrayContaining(differs));
  });
});
