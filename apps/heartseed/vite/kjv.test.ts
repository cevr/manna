/* oxlint-disable effect/noGlobals, effect/noTernary -- the test builds faulty corpora as plain branches over the rows, and reads the plugin's answer as the JSON it is. */

/**
 * The bundle-time corpus (hskjv K1, K2) and the plugin that serves it (K3).
 * Its seams: `chaptersOf` over the KJV's own rows and over rows with each
 * of K2's faults placed at the first chapter, a middle one and the last;
 * and the plugin's two hooks as the bundler calls them. The expected
 * chapters are the model's (`src/test/passages-model.ts`): each verse
 * placed by its own numbers, the display rule written again.
 *
 * It catches a derivation that drops one of the build's checks (a gap, a
 * repeat, a newline, a lost or misplaced chapter), shows a verse raw, and
 * a plugin that serves a module not its own or fails to serve the corpus
 * or the passage. It misses the bundler's own handling of the module.
 */

import { describe, expect, it } from 'bun:test';

import { corpusOf, type Row } from '../src/test/passages-model';
import { chaptersOf, CorpusMismatch, readChapters } from './kjv';
import { readPassage, readVerses } from './passage';
import { passage } from './plugin';

const ROWS: ReadonlyArray<Row> = readVerses();
const CORPUS = corpusOf(ROWS);
const KEYS = [...CORPUS.chapters.keys()];
const WANT = KEYS.map((key) => (CORPUS.chapters.get(key) ?? []).join('\n'));

/** The first chapter, one in the middle (Isaiah 41) and the last, by `book:chapter`. */
const PLACES = [KEYS[0], '23:41', KEYS[KEYS.length - 1]].map(String);

const at = (row: Row) => `${row.book}:${row.chapter}`;

/** Each of K2's faults, placed in the chapter `key`. */
const FAULTS: ReadonlyArray<readonly [string, (key: string) => ReadonlyArray<Row>]> = [
  ['a gap', (key) => ROWS.filter((row) => !(at(row) === key && row.verse === 2))],
  [
    'a verse repeated',
    (key) => ROWS.flatMap((row) => (at(row) === key && row.verse === 1 ? [row, row] : [row])),
  ],
  [
    'verses out of order',
    (key) => {
      const first = ROWS.findIndex((row) => at(row) === key);
      return ROWS.map(
        (row, index) =>
          (index === first ? ROWS[first + 1] : index === first + 1 ? ROWS[first] : row) ?? row,
      );
    },
  ],
  [
    'a newline in a verse',
    (key) =>
      ROWS.map((row) =>
        at(row) === key && row.verse === 1 ? { ...row, text: `${row.text}\nand more` } : row,
      ),
  ],
  ['a chapter lost', (key) => ROWS.filter((row) => at(row) !== key)],
  [
    'a chapter out of place',
    (key) => {
      const moved = ROWS.filter((row) => at(row) === key);
      const rest = ROWS.filter((row) => at(row) !== key);
      return key === PLACES[PLACES.length - 1] ? [...moved, ...rest] : [...rest, ...moved];
    },
  ],
];

/** The places two lists of chapters differ, by index: a failure names indexes, never a verse. */
const differ = (got: ReadonlyArray<unknown>, want: ReadonlyArray<string>) => ({
  length: got.length,
  differ: want.flatMap((chapter, index) => (got[index] === chapter ? [] : [index])),
});
const SAME = { length: 1189, differ: [] };

describe('chaptersOf', () => {
  it('derives the canon’s 1,189 chapters in order, each its verses’ shown text joined by a newline', () => {
    expect(differ(chaptersOf(ROWS), WANT)).toEqual(SAME);
    expect(differ(readChapters(), WANT)).toEqual(SAME);
  });

  it('fails the build at each fault, at the first chapter, a middle one and the last', () => {
    for (const [fault, make] of FAULTS)
      for (const place of PLACES)
        expect(() => chaptersOf(make(place)), `${fault} at ${place}`).toThrow(CorpusMismatch);
  });

  it('fails for a lost book, an extra chapter, and an empty corpus', () => {
    expect(() => chaptersOf(ROWS.filter((row) => row.book !== 65))).toThrow(CorpusMismatch);
    expect(() => chaptersOf([...ROWS, { book: 66, chapter: 23, verse: 1, text: 'x' }])).toThrow(
      CorpusMismatch,
    );
    expect(() => chaptersOf([])).toThrow(CorpusMismatch);
  });
});

describe('the plugin', () => {
  const plugin = passage();
  const served = (id: string) => {
    const code = String(plugin.load(id));
    expect(code.startsWith('export default ')).toBe(true);
    return JSON.parse(code.slice('export default '.length).replace(/;$/u, ''));
  };

  it('serves the corpus and Today’s passage, each as its derivation', () => {
    const kjv = plugin.resolveId('virtual:heartseed-kjv');
    const promise = plugin.resolveId('virtual:heartseed-passage');
    expect([kjv, promise]).toEqual(['\0virtual:heartseed-kjv', '\0virtual:heartseed-passage']);
    expect(differ(served(String(kjv)), WANT)).toEqual(SAME);
    expect(JSON.stringify(served(String(promise))) === JSON.stringify(readPassage())).toBe(true);
  });

  it('answers nothing for any other module', () => {
    for (const source of [
      'virtual:heartseed-other',
      'react',
      '\0virtual:heartseed-kjv',
      'virtual:heartseed-kjv.ts',
    ])
      expect(plugin.resolveId(source)).toBeUndefined();
    for (const id of [
      'virtual:heartseed-kjv',
      'virtual:heartseed-passage',
      '\0virtual:other',
      '\0react',
    ])
      expect(plugin.load(id)).toBeUndefined();
  });
});
