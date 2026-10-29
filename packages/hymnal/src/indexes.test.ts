/**
 * The back-matter index checks (`scripts/indexes.ts`) on a small made-up
 * book of 12 hymns: every index file once, consistent, so the checks find
 * nothing; then each mutation the checks must catch, applied at every entry
 * it applies to, through the same decode and checks the CLI runs. No real
 * entry, name or hymn text: the topics, tunes, people and books are invented.
 */

import { describe, expect, it } from 'bun:test';

import {
  bookOf,
  checkIndexes,
  type Context,
  decodeIndexes,
  decodeRulings,
  measureOrder,
  normalMetre,
  parseReference,
  type Problem,
  problemLine,
  seeHymnOf,
  seeTargets,
  settle,
  sortKey,
} from '../scripts/indexes.js';
import type { IndexName } from './indexes.js';

/** A made-up file as plain JSON, mutated in place before it is written out as the text the CLI reads. */
// oxlint-disable-next-line effect/noUnsafeDictionaryType -- a fixture the cases mutate key by key; the decode under test parses it
type Json = Record<string, unknown>;

/** The file's text, as the CLI reads it from disk. */
// oxlint-disable-next-line effect/noGlobals -- the fixture's own encoder: the text is the decode's input under test
const text = (file: Json) => JSON.stringify(file);

/** n as three letters, in number order: titles that sort as their numbers do. */
const word = (n: number) =>
  String.fromCharCode(97 + Math.floor(n / 676), 97 + (Math.floor(n / 26) % 26), 97 + (n % 26));

/** Two made-up books: book 1 of two chapters (10 and 5 verses), book 2 of one (8). */
const CHAPTERS = new Map([
  ['1:1', 10],
  ['1:2', 5],
  ['2:1', 8],
]);

const ctx: Context = {
  lastVerse: (book, chapter) => CHAPTERS.get(`${book}:${chapter}`),
  bookName: (book) => `Book${book}`,
  hymn: (n) =>
    n >= 1 && n <= 12 ? { title: `the ${word(n)}`, stanzas: 3, refrain: n % 3 === 0 } : undefined,
  sections: [
    { name: 'Bright Fields', first: 1, last: 4 },
    { name: 'Quiet Hills', first: 5, last: 12 },
  ],
  metre: (n) => (n === 12 ? null : n <= 6 ? 'C.M.' : '8.7.8.7.'),
  hymnCount: 12,
};

const head = (index: IndexName, title: string, pages: ReadonlyArray<[number, number]>) => ({
  version: 1,
  book: 'sdah-1985',
  index,
  title,
  pages: pages.map(([page, entries]) => ({ page, entries })),
});
const refs = (page: number, ns: ReadonlyArray<number>) => ns.map((number) => ({ number, page }));
const at = (book: number, chapter: number, ...verses: ReadonlyArray<[number, number]>) => ({
  book,
  chapter,
  verses: verses.map(([from, to]) => ({ from, to })),
});
const across = () => ({ book: 1, from: { chapter: 1, verse: 9 }, to: { chapter: 2, verse: 2 } });

/** The made-up book's indexes, consistent with `ctx`. */
const book = (): Record<IndexName, Json> => ({
  topical: {
    ...head('topical', 'MADE-UP TOPICS', [
      [10, 6],
      [11, 7],
    ]),
    note: 'Entries in italics are readings',
    topics: [
      { name: 'BRIGHT FIELDS', see: [], hymns: refs(10, [1, 2, 3, 4]), readings: refs(10, [700]) },
      { name: 'MEADOWS', see: ['See BRIGHT FIELDS'], hymns: [], readings: [] },
      {
        name: 'QUIET HILLS',
        see: [],
        hymns: [...refs(10, [5]), ...refs(11, [6, 7, 8, 9, 10, 11, 12])],
        readings: [],
      },
    ],
  },
  'worship-aids': {
    ...head('worship-aids', 'MADE-UP AIDS', [[12, 3]]),
    entries: [
      { passage: at(1, 1, [1, 1]), reading: 700, page: 12 },
      { passage: at(1, 1, [2, 3]), reading: 701, page: 12 },
      { passage: at(2, 1, [4, 4]), reading: 702, page: 12 },
    ],
  },
  scriptural: {
    ...head('scriptural', 'MADE-UP ALLUSIONS', [
      [13, 3],
      [14, 2],
    ]),
    entries: [
      { passage: at(1, 1, [1, 1]), hymn: 2, stanza: 'a', page: 13 },
      { passage: at(1, 1, [1, 1]), hymn: 5, stanza: 'b', page: 13 },
      { passage: across(), hymn: 7, page: 13 },
      { passage: at(1, 2, [3, 3]), hymn: 3, stanza: 'r', page: 14 },
      { passage: at(2, 1, [5, 5], [6, 6]), hymn: 4, stanza: 'c', page: 14 },
    ],
  },
  'scriptural-by-hymn': {
    ...head('scriptural-by-hymn', 'MADE-UP ALLUSIONS', [
      [14, 3],
      [15, 2],
    ]),
    entries: [
      { hymn: 2, stanza: 'a', passage: at(1, 1, [1, 1]), page: 14 },
      { hymn: 3, stanza: 'r', passage: at(1, 2, [3, 3]), page: 14 },
      { hymn: 4, stanza: 'c', passage: at(2, 1, [5, 5], [6, 6]), page: 14 },
      { hymn: 5, stanza: 'b', passage: at(1, 1, [1, 1]), page: 15 },
      { hymn: 7, passage: across(), page: 15 },
    ],
  },
  sentences: {
    ...head('sentences', 'MADE-UP SENTENCES', [[15, 2]]),
    groups: [
      {
        name: 'Call',
        hymns: [
          { number: 1, stanzas: ['a', 'b'], page: 15 },
          { number: 6, stanzas: ['r'], page: 15 },
        ],
      },
    ],
  },
  canons: {
    ...head('canons', 'MADE-UP ROUNDS', [[16, 1]]),
    groups: [{ name: 'ROUNDS', hymns: refs(16, [8]) }],
  },
  young: {
    ...head('young', 'MADE-UP YOUNG', [[17, 2]]),
    hymns: [
      { number: 2, starred: true, page: 17 },
      { number: 9, starred: false, page: 17 },
    ],
  },
  authors: {
    ...head('authors', 'MADE-UP AUTHORS', [[18, 3]]),
    people: [
      { name: 'Ashgrove, Ann', hymns: refs(18, [1, 2]) },
      { name: 'Birch, Bo', see: 'Bo Birch', hymns: [] },
      { name: 'Birch Book', source: true, hymns: refs(18, [3]) },
    ],
  },
  composers: {
    ...head('composers', 'MADE-UP COMPOSERS', [[19, 2]]),
    people: [
      { name: 'Cedar, Cal', hymns: refs(19, [4]) },
      { name: 'Dale, Dee', hymns: refs(19, [5]) },
    ],
  },
  tunes: {
    ...head('tunes', 'MADE-UP TUNES', [[20, 13]]),
    tunes: [
      { name: 'Alder', hymns: refs(20, [1, 2, 3, 4, 5, 6]) },
      { name: 'Elm', alias: true, hymns: refs(20, [3]) },
      { name: 'Birch Tune', hymns: refs(20, [7, 8, 9, 10, 11, 12]) },
    ],
  },
  metrical: {
    ...head('metrical', 'MADE-UP METRES', [[21, 12]]),
    metres: [
      {
        metre: 'C. M.',
        gloss: '(Made-up)',
        tunes: [{ name: 'Alder', hymns: refs(21, [1, 2, 3, 4, 5, 6]) }],
      },
      {
        metre: '8.7.8.7.',
        tunes: [{ name: 'Birch Tune', hymns: refs(21, [7, 8, 9, 10, 11, 12]) }],
      },
    ],
  },
});

/** Each file decoded once per distinct content: a mutant decodes only the file it changed. */
const decodedFiles = new Map<string, ReturnType<typeof decodeIndexes>>();
const decodeOne = (name: IndexName, file: string) => {
  const key = `${name} ${file}`;
  const known = decodedFiles.get(key);
  if (known) return known;
  const decoded = decodeIndexes({ [name]: file });
  decodedFiles.set(key, decoded);
  return decoded;
};

/** The CLI's decode and checks over the files given. */
const problemsOf = (files: Partial<Record<IndexName, Json>>): ReadonlyArray<Problem> => {
  const each = (Object.keys(files) as Array<IndexName>).map((name) =>
    decodeOne(name, text(files[name] ?? {})),
  );
  const indexes = Object.assign({}, ...each.map((d) => d.indexes)) as Parameters<
    typeof checkIndexes
  >[0];
  return [...each.flatMap((d) => d.problems), ...checkIndexes(indexes, ctx)];
};

const arr = (o: Json | undefined, key: string) => (o?.[key] ?? []) as Array<Json>;

/** Every numbered entry of an index's JSON as [object, key], in the order the checks place them. */
const numberSlots = (name: IndexName, file: Json): Array<[Json, string]> => {
  const each = (rows: Array<Json>, key: string) => rows.map((r): [Json, string] => [r, key]);
  switch (name) {
    case 'topical':
      return arr(file, 'topics').flatMap((t) => [
        ...each(arr(t, 'hymns'), 'number'),
        ...each(arr(t, 'readings'), 'number'),
      ]);
    case 'worship-aids':
      return each(arr(file, 'entries'), 'reading');
    case 'scriptural':
    case 'scriptural-by-hymn':
      return each(arr(file, 'entries'), 'hymn');
    case 'sentences':
    case 'canons':
      return arr(file, 'groups').flatMap((g) => each(arr(g, 'hymns'), 'number'));
    case 'young':
      return each(arr(file, 'hymns'), 'number');
    case 'authors':
    case 'composers':
      return arr(file, 'people').flatMap((p) => each(arr(p, 'hymns'), 'number'));
    case 'tunes':
      return arr(file, 'tunes').flatMap((t) => each(arr(t, 'hymns'), 'number'));
    case 'metrical':
      return arr(file, 'metres').flatMap((m) =>
        arr(m, 'tunes').flatMap((t) => each(arr(t, 'hymns'), 'number')),
      );
  }
};

const NAMES = Object.keys(book()) as ReadonlyArray<IndexName>;

/** Runs `mutate` on a fresh copy at each place `places` gives; each must leave a problem of `check`. */
const everyMutant = (
  places: (b: ReturnType<typeof book>) => number,
  mutate: (b: ReturnType<typeof book>, i: number) => void,
  check: Problem['check'] | ReadonlyArray<Problem['check']>,
) => {
  const total = places(book());
  const missed: Array<number> = [];
  const wanted: ReadonlyArray<string> = [check].flat();
  for (let i = 0; i < total; i++) {
    const b = book();
    mutate(b, i);
    const found = problemsOf(b).map((p) => p.check);
    if (!found.some((c) => wanted.includes(c))) missed.push(i);
  }
  return { total, missed };
};

describe('the made-up book', () => {
  it('decodes, and every check finds nothing', () => {
    expect(problemsOf(book()).map(problemLine)).toEqual([]);
  });

  it('refuses an excess key', () => {
    const b = book();
    (arr(b.scriptural, 'entries')[0] as Json)['firstLine'] = 'x';
    expect(problemsOf(b).map((p) => [p.index, p.check])).toEqual([['scriptural', 'decode']]);
  });
});

describe('each mutation is caught, at every entry it applies to', () => {
  const isReading = ([obj, key]: [Json, string]) =>
    key === 'reading' || (obj['number'] as number) >= 696;
  const ranges: ReadonlyArray<[string, 'hymn' | 'reading' | 'any', number]> = [
    ['0', 'any', 0],
    ['696, in a hymn index', 'hymn', 696],
    ['921', 'any', 921],
    ['695, as a reading', 'reading', 695],
  ];
  for (const [label, kind, value] of ranges)
    it(`a number set to ${label}`, () => {
      for (const name of NAMES) {
        const slots = (b: ReturnType<typeof book>) =>
          numberSlots(name, b[name]).filter(
            (s) => kind === 'any' || (kind === 'reading') === isReading(s),
          );
        const result = everyMutant(
          (b) => slots(b).length,
          (b, i) => {
            const [obj, key] = slots(b)[i] ?? [{}, ''];
            obj[key] = value;
          },
          ['range', 'decode'],
        );
        expect({ name, missed: result.missed }).toEqual({ name, missed: [] });
      }
    });

  const scripture: ReadonlyArray<IndexName> = ['scriptural', 'scriptural-by-hymn', 'worship-aids'];
  const passageMutants: ReadonlyArray<[string, (p: Json) => void]> = [
    [
      'a verse one past its chapter',
      (p) => {
        if ('verses' in p) {
          const v = (p['verses'] as Array<Json>)[0];
          if (v) v['to'] = (CHAPTERS.get(`${p['book']}:${p['chapter']}`) ?? 0) + 1;
          else p['chapter'] = 99;
        } else
          (p['to'] as Json)['verse'] =
            (CHAPTERS.get(`${p['book']}:${(p['to'] as Json)['chapter']}`) ?? 0) + 1;
      },
    ],
    [
      'a chapter one past its book',
      (p) => {
        const last = Math.max(
          ...[...CHAPTERS.keys()]
            .filter((k) => k.startsWith(`${p['book']}:`))
            .map((k) => Number(k.split(':')[1])),
        );
        if ('verses' in p) p['chapter'] = last + 1;
        else (p['to'] as Json)['chapter'] = last + 1;
      },
    ],
    [
      'a range backwards',
      (p) => {
        if ('verses' in p) {
          const v = (p['verses'] as Array<Json>)[0];
          if (v) {
            v['from'] = 5;
            v['to'] = 4;
          }
        } else {
          p['from'] = { chapter: 2, verse: 2 };
          p['to'] = { chapter: 1, verse: 9 };
        }
      },
    ],
  ];
  for (const [label, mutate] of passageMutants)
    it(label, () => {
      for (const name of scripture) {
        const result = everyMutant(
          (b) => arr(b[name], 'entries').length,
          (b, i) => mutate(arr(b[name], 'entries')[i]?.['passage'] as Json),
          'scripture',
        );
        expect({ name, missed: result.missed }).toEqual({ name, missed: [] });
      }
    });

  it('a stanza letter one past the hymn’s stanzas', () => {
    for (const name of ['scriptural', 'scriptural-by-hymn'] as const) {
      const lettered = (b: ReturnType<typeof book>) =>
        arr(b[name], 'entries').filter((e) => e['stanza'] !== undefined);
      const result = everyMutant(
        (b) => lettered(b).length,
        (b, i) => {
          const e = lettered(b)[i];
          if (e) e['stanza'] = 'd';
        },
        'stanza',
      );
      expect({ name, missed: result.missed }).toEqual({ name, missed: [] });
    }
    const b = book();
    (arr(arr(b.sentences, 'groups')[0], 'hymns')[0] as Json)['stanzas'] = ['a', 'd'];
    expect(problemsOf(b).map((p) => p.check)).toContain('stanza');
  });

  it('two neighbours of different sort keys swapped', () => {
    const swap = (rows: Array<Json>, i: number) => {
      const a = rows[i];
      const b = rows[i + 1];
      if (a && b) {
        rows[i] = b;
        rows[i + 1] = a;
      }
    };
    /** Swapping must keep each row's page, so only the order changes. */
    const swapKeepPages = (rows: Array<Json>, i: number) => {
      const pages = rows.map((r) => r['page']);
      swap(rows, i);
      rows.forEach((r, k) => {
        if (pages[k] !== undefined) r['page'] = pages[k];
      });
    };
    const lists: ReadonlyArray<
      [string, (b: ReturnType<typeof book>) => Array<Json>, (rows: Array<Json>, i: number) => void]
    > = [
      ['scriptural entries', (b) => arr(b.scriptural, 'entries'), swapKeepPages],
      ['scriptural-by-hymn entries', (b) => arr(b['scriptural-by-hymn'], 'entries'), swapKeepPages],
      ['worship-aids entries', (b) => arr(b['worship-aids'], 'entries'), swapKeepPages],
      ['authors', (b) => arr(b.authors, 'people'), swap],
      ['composers', (b) => arr(b.composers, 'people'), swap],
      [
        'tunes (main names)',
        (b) => arr(b.tunes, 'tunes').filter((t) => t['alias'] === undefined),
        (rows) => {
          const names = rows.map((r) => r['name']);
          rows.forEach((r, k) => (r['name'] = names[rows.length - 1 - k]));
        },
      ],
      ['a topic’s hymns', (b) => arr(arr(b.topical, 'topics')[0], 'hymns'), swapKeepPages],
      ['the topics', (b) => arr(b.topical, 'topics'), swap],
    ];
    for (const [label, rows, mutate] of lists) {
      const result = everyMutant(
        (b) => rows(b).length - 1,
        (b, i) => mutate(rows(b), i),
        ['order', 'directions'],
      );
      expect({ label, missed: result.missed }).toEqual({ label, missed: [] });
    }
    // metrical: a metre's tunes out of order
    const b = book();
    const metre = arr(b.metrical, 'metres')[0] as Json;
    metre['tunes'] = [{ name: 'Zinnia', hymns: refs(21, [1]) }, ...(metre['tunes'] as Array<Json>)];
    expect(problemsOf(b).map((p) => p.check)).toContain('order');
  });

  it('a section’s hymn dropped from its topic, and a tune pair dropped from either tune index', () => {
    const topicHymns = (b: ReturnType<typeof book>) =>
      [0, 2].flatMap((t) =>
        arr(arr(b.topical, 'topics')[t], 'hymns').map((_, i) => [t, i] as const),
      );
    const dropTopic = everyMutant(
      (b) => topicHymns(b).length,
      (b, i) => {
        const [t, k] = topicHymns(b)[i] ?? [0, 0];
        arr(arr(b.topical, 'topics')[t], 'hymns').splice(k, 1);
      },
      'sections',
    );
    expect(dropTopic.missed).toEqual([]);
    // an alias's pair is another name of a hymn the main names list: no check reaches its loss
    const mainLists = (b: ReturnType<typeof book>, name: 'tunes' | 'metrical') =>
      name === 'tunes'
        ? arr(b.tunes, 'tunes').filter((t) => t['alias'] === undefined)
        : arr(b.metrical, 'metres').flatMap((m) => arr(m, 'tunes'));
    for (const name of ['tunes', 'metrical'] as const) {
      const pairs = (b: ReturnType<typeof book>) =>
        mainLists(b, name).flatMap((t) => arr(t, 'hymns').map((_, k) => [t, k] as const));
      const result = everyMutant(
        (b) => pairs(b).length,
        (b, i) => {
          const [t, k] = pairs(b)[i] ?? [{}, 0];
          arr(t, 'hymns').splice(k, 1);
        },
        'tunes',
      );
      expect({ name, missed: result.missed }).toEqual({ name, missed: [] });
    }
  });

  it('an entry dropped from its page', () => {
    for (const name of NAMES) {
      const result = everyMutant(
        (b) => numberSlots(name, b[name]).length,
        (b, i) => {
          const [obj] = numberSlots(name, b[name])[i] ?? [{} as Json];
          obj['page'] = 999; // it names no page of the index now: its page's count is short
        },
        'pages',
      );
      expect({ name, missed: result.missed }).toEqual({ name, missed: [] });
    }
  });

  it('a tune printed with and without its qualifier or article, or by its alias, is one tune', () => {
    const b = book();
    const metre = arr(b.metrical, 'metres')[0] as Json;
    metre['tunes'] = [
      { name: 'The Alder (Second)', hymns: refs(21, [1, 2, 4, 5, 6]) },
      { name: 'Elm', hymns: refs(21, [3]) },
    ];
    expect(problemsOf(b).filter((p) => p.check === 'tunes')).toEqual([]);
    metre['tunes'] = [
      { name: 'Alder', hymns: refs(21, [1, 2, 4, 5, 6]) },
      { name: 'Oak', hymns: refs(21, [3]) },
    ];
    expect(
      problemsOf(b)
        .filter((p) => p.check === 'tunes')
        .map((p) => p.value),
    ).toEqual(['Alder 3', 'Oak 3']);
  });

  it('a metre the hymn’s page does not print', () => {
    const b = book();
    (arr(b.metrical, 'metres')[1] as Json)['metre'] = 'L. M.';
    expect(problemsOf(b).map((p) => p.check)).toContain('metre');
  });

  it('a page skipped', () => {
    const b = book();
    (b.topical['pages'] as Array<Json>)[1] = { page: 12, entries: 7 };
    for (const r of arr(arr(b.topical, 'topics')[2], 'hymns')) if (r['page'] === 11) r['page'] = 12;
    expect(problemsOf(b).some((p) => p.check === 'pages' && p.what.includes('follows'))).toBe(true);
  });

  it('a page two indexes both end on', () => {
    const b = book();
    (b.scriptural['pages'] as Array<Json>)[1] = { page: 15, entries: 2 };
    for (const e of arr(b.scriptural, 'entries')) if (e['page'] === 14) e['page'] = 15;
    expect(
      problemsOf(b).some((p) => p.check === 'pages' && p.what.includes('not as the end of one')),
    ).toBe(true);
  });
});

describe('a Scripture direction and its twin in the other index', () => {
  /** Each direction problem as [index, its hymn and stanza]. */
  const unmatched = (b: ReturnType<typeof book>) =>
    problemsOf(b)
      .filter((p) => p.check === 'directions')
      .map((p) => [p.index, p.value.split(' ').at(-1)]);
  const byHymn = (b: ReturnType<typeof book>, hymn: number) =>
    arr(b['scriptural-by-hymn'], 'entries').find((e) => e['hymn'] === hymn) as Json;

  it('match when the hymn and stanza agree and the passages overlap, in one piece or two', () => {
    const b = book();
    byHymn(b, 4)['passage'] = at(2, 1, [5, 6]);
    byHymn(b, 2)['passage'] = at(1, 1, [1, 3]);
    expect(unmatched(b)).toEqual([]);
  });

  it('match when either side names no stanza: the whole hymn', () => {
    const b = book();
    delete byHymn(b, 5)['stanza'];
    expect(unmatched(b)).toEqual([]);
  });

  it('differ when the book, the stanza or the verses differ', () => {
    // each: the mutation, then the entry left unmatched in each index
    const cases: ReadonlyArray<[string, (b: ReturnType<typeof book>) => void, string, string]> = [
      ['another book', (b) => (byHymn(b, 2)['passage'] = at(2, 1, [1, 1])), '2a', '2a'],
      ['another stanza', (b) => (byHymn(b, 3)['stanza'] = 'a'), '3r', '3a'],
      ['verses apart', (b) => (byHymn(b, 4)['passage'] = at(2, 1, [7, 8])), '4c', '4c'],
    ];
    for (const [label, mutate, mine, twin] of cases) {
      const b = book();
      mutate(b);
      expect({ label, found: unmatched(b) }).toEqual({
        label,
        found: [
          ['scriptural', mine],
          ['scriptural-by-hymn', twin],
        ],
      });
    }
  });

  it('a hymn the by-hymn index sends to another (`See N`) takes that hymn’s passages', () => {
    const b = book();
    arr(b.scriptural, 'entries').push({ passage: at(1, 1, [1, 1]), hymn: 9, page: 14 });
    expect(unmatched(b)).toEqual([['scriptural', '9']]);
    b['scriptural-by-hymn']['see'] = [{ hymn: 9, see: 2, page: 15 }];
    expect(unmatched(b)).toEqual([]);
  });
});

describe('rulings', () => {
  const b = book();
  (arr(b.metrical, 'metres')[1] as Json)['metre'] = 'L. M.';
  const failures = problemsOf(b).filter((p) => p.check === 'metre');
  const ruling = (p: Problem) => ({
    index: p.index as IndexName,
    page: p.page,
    at: p.at,
    check: p.check,
    value: p.value,
    judge: 'j01',
    why: 'made up',
  });

  it('settle the failures they name, and nothing else', () => {
    const { open, ruled } = settle(failures, failures.map(ruling));
    expect(open).toEqual([]);
    expect(ruled.length).toBe(failures.length);
  });

  it('are a problem when stale or when their judge record is missing', () => {
    const stale = settle([], failures.slice(0, 1).map(ruling)).open;
    expect(stale.map((p) => p.check)).toEqual(['rulings']);
    const missing = settle(failures, failures.map(ruling), () => false).open;
    expect(missing.length).toBe(failures.length);
  });

  it('decode with excess keys refused', () => {
    const good = { version: 1, book: 'sdah-1985', rulings: failures.map(ruling) };
    expect(decodeRulings(text(good)).problems).toEqual([]);
    expect(
      decodeRulings(text({ ...good, rulings: [{ ...ruling(failures[0] as Problem), extra: 1 }] }))
        .problems.length,
    ).toBe(1);
  });
});

describe('reading a printed reference', () => {
  it('splits comma pieces, crosses chapters and takes a whole chapter', () => {
    expect(parseReference(19, '98:4, 6')).toEqual([
      {
        book: 19,
        chapter: 98,
        verses: [
          { from: 4, to: 4 },
          { from: 6, to: 6 },
        ],
      },
    ]);
    expect(parseReference(1, '1:1-2:3')).toEqual([
      { book: 1, from: { chapter: 1, verse: 1 }, to: { chapter: 2, verse: 3 } },
    ]);
    expect(parseReference(19, '23')).toEqual([{ book: 19, chapter: 23, verses: [] }]);
    expect(parseReference(66, '21:4, 22:5')).toEqual([
      { book: 66, chapter: 21, verses: [{ from: 4, to: 4 }] },
      { book: 66, chapter: 22, verses: [{ from: 5, to: 5 }] },
    ]);
    expect(parseReference(1, '16:8-11, 14')).toEqual([
      {
        book: 1,
        chapter: 16,
        verses: [
          { from: 8, to: 11 },
          { from: 14, to: 14 },
        ],
      },
    ]);
    expect(parseReference(66, '15:3, 4; 19:1, 2')).toEqual([
      {
        book: 66,
        chapter: 15,
        verses: [
          { from: 3, to: 3 },
          { from: 4, to: 4 },
        ],
      },
      {
        book: 66,
        chapter: 19,
        verses: [
          { from: 1, to: 1 },
          { from: 2, to: 2 },
        ],
      },
    ]);
    expect(parseReference(1, 'see 4')).toBeUndefined();
  });

  it('reads a reference as the pages print it: a closing stop, a part verse, a list of chapters, a book of one chapter', () => {
    const verses = (chapter: number, ...vs: ReadonlyArray<[number, number]>) =>
      at(42, chapter, ...vs);
    expect(parseReference(42, '3:4, 9.')).toEqual([verses(3, [4, 4], [9, 9])]);
    expect(parseReference(42, '3:1-6a')).toEqual([verses(3, [1, 6])]);
    expect(parseReference(42, '3:2b, 5')).toEqual([verses(3, [2, 2], [5, 5])]);
    expect(parseReference(19, '40, 41')).toEqual([at(19, 40), at(19, 41)]);
    expect(parseReference(65, '20, 21')).toEqual([at(65, 1, [20, 20], [21, 21])]);
    expect(parseReference(31, '3-5')).toEqual([at(31, 1, [3, 5])]);
    expect(parseReference(42, '3:4x')).toBeUndefined();
  });

  it('reads a hymn’s `See N` in the reference place', () => {
    expect([
      seeHymnOf('See 12'),
      seeHymnOf('see 7.'),
      seeHymnOf('See MEADOWS'),
      seeHymnOf('3:4'),
    ]).toEqual([12, 7, undefined, undefined]);
  });

  it('names a book from its printed heading or abbreviation', () => {
    expect([
      bookOf('PSALMS'),
      bookOf('Ps'),
      bookOf('1 THESS.'),
      bookOf('S.S.'),
      bookOf('Philem'),
      bookOf('Is'),
      bookOf('Nowhere'),
    ]).toEqual([19, 19, 52, 22, 57, 23, undefined]);
  });

  it('reads a cross-reference’s targets', () => {
    expect(seeTargets('See GOD THE FATHER: Majesty and Power; TRINITY')).toEqual([
      { parent: 'GOD THE FATHER', name: 'Majesty and Power' },
      { name: 'TRINITY' },
    ]);
    expect(seeTargets('(See EARLY DAYS; GREAT HALL: First Room, Second Room)')).toEqual([
      { name: 'EARLY DAYS' },
      { parent: 'GREAT HALL', name: 'First Room' },
      { parent: 'GREAT HALL', name: 'Second Room' },
    ]);
  });

  it('writes a metre for comparison', () => {
    expect([
      normalMetre('C. M. with Refrain'),
      normalMetre('C.M. Ref'),
      normalMetre('8.7.8.7.D.'),
    ]).toEqual(['c.m.ref', 'c.m.ref', '8.7.8.7.d']);
  });

  it('reads a metre as the book prints it: a bare or cut refrain, amens, alleluias, doubled', () => {
    const same = [
      ['4.5.4.5.R', '4.5.4.5. with Refrain'],
      ['S.M.R', 'S. M. with Refrain'],
      ['4.5.4.5.D.R', '4.5.4.5.D. with Refrain'],
      ['4.5.4.5. Re', '4.5.4.5. with Refrain'],
      ['4.5.4.5.Re…', '4.5.4.5. Refrain'],
      ['Irregular, Ref.', 'Irregular with Refrain'],
      ['4.5. Amens', '4.5 with Amens'],
      ['4.5.4.5. Alleluias', '4.5.4.5. with Alleluias'],
      ['4.5.4.5.Allelui…', '4.5.4.5. with Alleluias'],
      ['4.5.4.5.4.5.4.5.', '4.5.4.5.D.'],
      ['12.3.12.3.', '12.3.D.'],
    ];
    expect(same.filter(([a, b]) => normalMetre(a as string) !== normalMetre(b as string))).toEqual(
      [],
    );
    const different = [
      ['4.5.4.5.', '4.5.4.5.D.'],
      ['4.5.4.5.4.5.', '4.5.4.5.D.'],
      ['12.3.12.3.', '1.23.1.23.'],
      ['4.5.4.5. Ref.', '4.5.4.5.'],
      ['Irregular', 'Irregular with Refrain'],
    ];
    expect(
      different.filter(([a, b]) => normalMetre(a as string) === normalMetre(b as string)),
    ).toEqual([]);
  });

  it('sorts word by word, `St.` as `Saint`, a qualifier left out and an apostrophe inside its word', () => {
    const printed = [
      'Zed Quay',
      'Zedbury',
      'Saint Alder',
      'St. Birch',
      'Salt Marsh',
      'Quill (Second)',
      'Quill Road',
      "Quill's End",
      'Quillby',
    ];
    expect([...printed].sort((a, b) => (sortKey(a) < sortKey(b) ? -1 : 1))).toEqual([
      'Quill (Second)',
      'Quill Road',
      'Quillby',
      "Quill's End",
      'Saint Alder',
      'St. Birch',
      'Salt Marsh',
      'Zed Quay',
      'Zedbury',
    ]);
  });

  it('measures each order rule over the made-up book with no pair broken', () => {
    const files = Object.fromEntries(
      Object.entries(book()).map(([name, file]) => [name, text(file)]),
    );
    expect(measureOrder(decodeIndexes(files).indexes, ctx).filter((m) => m.broken > 0)).toEqual([]);
  });
});
