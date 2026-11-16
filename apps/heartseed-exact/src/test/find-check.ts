/* oxlint-disable effect/noGlobals, effect/noNullish, effect/noTernary -- Exact's app folder cannot import effect (docs/exact.md): a test helper; answers are compared as JSON. */

/**
 * Find's check over a run of queries (spec acceptance 1 to 3): each query
 * asked of a cold index under `withDataHost`, as the data module runs it,
 * then again, and of the model. The answer must be the model's verses in
 * the model's order with the model's count, each hit holding the query's
 * words and cut from its own verse, within the work bound, and a second
 * ask decodes nothing and answers the same. The `find-*.test.ts` parts
 * each check one run of the queries, so each part stays under a second.
 */

import { withDataHost } from '@manna/exact-kit/data-host/testing';

import { findPack } from '../../tools/find';

import { findWith, type FindShown } from '../find/find';
import { FIXED } from '../find/fixed';
import { findIndexOf } from '../find/index';
import { queryOf } from '../find/words';
import {
  drawQueries,
  modelFind,
  modelText,
  modelVerses,
  type Drawn,
  type ModelVerse,
} from './find-model';
import { seeded } from './random';

/** The hits find shows at most, as the contract asks. */
export const LIMIT = 50;

/** The list entries a query decodes at most, from a cold index. */
export const MOST_ENTRIES = 60_000;

/** The verses whose text a query reads at most. */
export const MOST_TEXTS = 400;

/** The queries drawn from the corpus by seed 1, all parts' together. */
export const DRAWN = 300;

const pack = findPack();
const verses = modelVerses();
const text = modelText(verses);
const indexOf = new Map(
  verses.map((verse, at) => [`${verse.book}.${verse.chapter}.${verse.verse}`, at]),
);

/** The drawn queries from `from` up to `to`. */
export const drawnQueries = (from: number, to: number): Array<Drawn> =>
  drawQueries(seeded(1), verses, DRAWN).slice(from, to);

/** Each fixed query of `FIXED` from `from` up to `to`, typed a character at a time: every keystroke a query. */
export const typedQueries = (from: number, to: number): Array<Drawn> =>
  FIXED.slice(from, to).flatMap((query) =>
    Array.from({ length: query.length }, (_, at) => ({
      kind: 'typed',
      query: query.slice(0, at + 1),
    })),
  );

/** The corpus verse of a hit. */
const verseOf = (hit: { book: number; chapter: number; verse: number }) =>
  indexOf.get(`${hit.book}.${hit.chapter}.${hit.verse}`) ?? -1;

/** Whether `verse` holds every word of `query`, the last as a prefix while typed. */
const holdsAll = (verse: ModelVerse, query: string) => {
  const { words, typing } = queryOf(query);
  return words.every((word, at) =>
    typing && at === words.length - 1
      ? verse.distinct.some((each) => each.startsWith(word))
      : verse.distinct.includes(word),
  );
};

/** What is wrong with find's answers to `queries`; empty when nothing is. */
export const findFailures = (queries: ReadonlyArray<Drawn>): Array<string> => {
  const failures: Array<string> = [];
  for (const { kind, query } of queries) {
    const index = findIndexOf(pack);
    const find = findWith(index);
    const shown: FindShown = withDataHost(() => find(query, LIMIT));
    const cold = { ...index.counts };
    const again = withDataHost(() => find(query, LIMIT));
    const model = modelFind(text, query, LIMIT);
    const got = shown.hits.map(verseOf);
    const said = `${kind} ${JSON.stringify(query)}`;
    if (JSON.stringify(got) !== JSON.stringify(model.verses))
      failures.push(`${said}: verses ${got.length} unlike the model's ${model.verses.length}`);
    if (shown.more + shown.hits.length !== model.count)
      failures.push(
        `${said}: more ${shown.more} + ${shown.hits.length} hits, the model ${model.count}`,
      );
    if (cold.entries > MOST_ENTRIES) failures.push(`${said}: decoded ${cold.entries} entries`);
    if (cold.texts > MOST_TEXTS) failures.push(`${said}: read ${cold.texts} verses' text`);
    if (index.counts.entries !== cold.entries)
      failures.push(`${said}: asked again, decoded ${index.counts.entries - cold.entries}`);
    if (JSON.stringify(again) !== JSON.stringify(shown))
      failures.push(`${said}: asked again, answers otherwise`);
    for (const hit of shown.hits) {
      const verse = verses[verseOf(hit)];
      if (verse === undefined || !holdsAll(verse, query))
        failures.push(`${said}: a hit lacks a word`);
      else if (hit.match === '' || !verse.text.includes(hit.before + hit.match + hit.after))
        failures.push(`${said}: a hit is no cut of its verse`);
    }
  }
  return failures;
};
