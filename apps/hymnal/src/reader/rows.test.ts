/**
 * The phones' hymn rows (`rowsOf`): for each maximal run of consecutive
 * hymns with one topic, one topic row, then that run's hymn rows. Seeded
 * lists of 0 to 800 hymns, topics from pools of 1 to 70 names that come back
 * after other topics, a single run, a run per hymn, and names with spaces
 * and punctuation; then the real 695.
 */

import { describe, expect, it } from 'bun:test';
import { Match, Option } from 'effect';

import { hymns } from '~/hymns/hymns';

import { groupRowsOf, type Row, plainRowsOf, resultRowsOf, rowsOf, STRONG } from './rows';

/** A seeded generator in [0, 1) (mulberry32), as the player's world draws. */
const rng = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

// oxlint-disable-next-line effect/noGlobals -- the run's seed comes from its shell, outside any Effect.
const seed = Number(process.env['HYMNAL_ROWS_SEED'] ?? Date.now() % 1_000_000);
// The test's name prints the seed: `HYMNAL_ROWS_SEED=<seed>` runs those cases again.
const cases = 300;

const names = [
  'Adoration and Praise',
  'Love of God',
  "Christ's Return",
  'Faith & Trust',
  'A, B; C',
];

interface Fixture {
  readonly number: number;
  readonly topic: string;
}

/** How long a drawn list is: empty, the longest, or any length up to it. */
const lengthOf = (r: () => number, k: number) => {
  if (k === 0) return 0;
  if (k === 1) return 800;
  return Math.floor(r() * 801);
};

/** One drawn list: its length, its pool and how its runs are cut, from the whole domain. */
const draw = (r: () => number, k: number): ReadonlyArray<Fixture> => {
  const length = lengthOf(r, k);
  const pool = 1 + Math.floor(r() * 70);
  // 0: one run; 1: a new draw for every hymn; otherwise runs of random length.
  const cut = k % 4;
  const drawTopic = () => {
    const n = Math.floor(r() * pool);
    return `${names[n % names.length]} ${n}`;
  };
  const out: Array<Fixture> = [];
  let topic = drawTopic();
  for (let i = 0; i < length; i++) {
    if (cut === 1 || (cut > 1 && r() < 0.15)) topic = drawTopic();
    out.push({ number: i + 1, topic });
  }
  return out;
};

/** The runs the rule names: maximal stretches of equal neighbouring topics. */
const runsOf = (list: ReadonlyArray<Fixture>) =>
  list.reduce<Array<{ readonly topic: string; readonly numbers: Array<number> }>>(
    (runs, hymn, i) => {
      if (i > 0 && list[i - 1]?.topic === hymn.topic) runs.at(-1)?.numbers.push(hymn.number);
      else runs.push({ topic: hymn.topic, numbers: [hymn.number] });
      return runs;
    },
    [],
  );

/** A row as the rule names it: a topic or a shelf by its name (a shelf by where it opens too), a hymn by its number. */
type Seen =
  | { readonly kind: 'topic'; readonly name: string }
  | { readonly kind: 'shelf'; readonly name: string; readonly href: string }
  | { readonly kind: 'hymn'; readonly number: number };

const seenOf = (row: Row<Fixture>): Seen => {
  if (row.kind === 'topic') return { kind: 'topic', name: row.name };
  if (row.kind === 'shelf') return { kind: 'shelf', name: row.name, href: row.href };
  return { kind: 'hymn', number: row.hymn.number };
};

describe('the hymn rows', () => {
  it(`hold one topic row before each run of one topic (seed ${seed})`, () => {
    const r = rng(seed);
    for (let k = 0; k < cases; k++) {
      const list = draw(r, k);
      const { rows, sticky } = rowsOf(list);
      const expected = runsOf(list).flatMap((run): Array<Seen> => [
        { kind: 'topic', name: run.topic },
        ...run.numbers.map((number): Seen => ({ kind: 'hymn', number })),
      ]);
      const seen = rows.map(seenOf);
      expect({ seed, k, seen }).toEqual({ seed, k, seen: expected });
      expect(sticky).toEqual(rows.flatMap((row, i) => [i].filter(() => row.kind === 'topic')));
      expect(new Set(rows.map((row) => row.key)).size).toBe(rows.length);
      // No topic row is empty or followed by another topic row.
      for (const i of sticky) expect(rows[i + 1]?.kind).toBe('hymn');
    }
  });

  it('give a topic that comes back a second row of its own', () => {
    const { rows, sticky } = rowsOf([
      { number: 1, topic: 'A' },
      { number: 2, topic: 'B' },
      { number: 3, topic: 'A' },
    ]);
    expect(sticky).toEqual([0, 2, 4]);
    expect(rows.filter((row) => row.kind === 'topic').map((row) => row.key)).toEqual([
      'topic:1',
      'topic:2',
      'topic:3',
    ]);
  });

  it("open the real hymnal on hymn 1's topic, with 695 hymn rows and one row per run", () => {
    const { rows, sticky } = rowsOf(hymns);
    expect(rows[0]).toMatchObject({ kind: 'topic', name: hymns[0]?.topic });
    expect(rows.length).toBe(695 + runsOf(hymns).length);
    expect(sticky.length).toBe(runsOf(hymns).length);
  });
});

describe('the reader’s shelves above the topics', () => {
  const list: ReadonlyArray<Fixture> = [
    { number: 1, topic: 'A' },
    { number: 2, topic: 'A' },
    { number: 3, topic: 'B' },
  ];
  const at = (n: number) => list.filter((hymn) => hymn.number === n);

  it('come first, each under a header naming it and where it opens, its hymns in its order; only topics are pinned', () => {
    const { rows, sticky } = rowsOf(list, [
      { name: 'Favourites', hymns: [...at(1), ...at(3)], href: '/favourites' },
      { name: 'Recent', hymns: [...at(3), ...at(2)], href: '/recent' },
    ]);
    expect(rows.map(seenOf)).toEqual([
      { kind: 'shelf', name: 'Favourites', href: '/favourites' },
      { kind: 'hymn', number: 1 },
      { kind: 'hymn', number: 3 },
      { kind: 'shelf', name: 'Recent', href: '/recent' },
      { kind: 'hymn', number: 3 },
      { kind: 'hymn', number: 2 },
      { kind: 'topic', name: 'A' },
      { kind: 'hymn', number: 1 },
      { kind: 'hymn', number: 2 },
      { kind: 'topic', name: 'B' },
      { kind: 'hymn', number: 3 },
    ]);
    expect(sticky).toEqual([6, 9]);
    // A hymn on a shelf and under its topic is two rows, each keyed apart.
    expect(new Set(rows.map((row) => row.key)).size).toBe(rows.length);
  });

  it('hand every row’s press the list under the topics to page through, a shelf’s rows too', () => {
    const { rows } = rowsOf(list, [
      { name: 'Favourites', hymns: [...at(1), ...at(3)], href: '/favourites' },
      { name: 'Recent', hymns: [...at(3), ...at(2)], href: '/recent' },
    ]);
    const sources = rows.flatMap((row) => {
      if (row.kind === 'hymn') return [row.source];
      return [];
    });
    expect(sources).toEqual(Array.from({ length: 7 }, () => [1, 2, 3]));
  });

  it('show no header for an empty shelf', () => {
    const { rows } = rowsOf(list, [
      { name: 'Favourites', hymns: [], href: '/favourites' },
      { name: 'Recent', hymns: at(2), href: '/recent' },
    ]);
    expect(rows.slice(0, 3).map(seenOf)).toEqual([
      { kind: 'shelf', name: 'Recent', href: '/recent' },
      { kind: 'hymn', number: 2 },
      { kind: 'topic', name: 'A' },
    ]);
  });
});

describe('a favourite’s rows', () => {
  it(`are starred wherever the hymn shows, Recent and its topic alike, and no row is added (seed ${seed})`, () => {
    const r = rng(seed);
    for (let k = 0; k < cases; k++) {
      const list = draw(r, k);
      const favourites = new Set(list.filter(() => r() < 0.2).map((hymn) => hymn.number));
      const recent = list.filter(() => r() < 0.01).slice(0, 5);
      const shelves = [{ name: 'Recent', hymns: recent, href: '/recent' }];
      const starred = rowsOf(list, shelves, favourites);
      const plain = rowsOf(list, shelves);
      expect(starred.rows.map((row) => row.key)).toEqual(plain.rows.map((row) => row.key));
      expect(starred.sticky).toEqual(plain.sticky);
      expect(starred.rows.length).toBe(
        rowsOf(list).rows.length + recent.length + Math.min(1, recent.length),
      );
      for (const row of starred.rows) {
        if (row.kind === 'hymn')
          expect({ k, n: row.hymn.number, favourite: row.favourite }).toEqual({
            k,
            n: row.hymn.number,
            favourite: favourites.has(row.hymn.number),
          });
      }
      for (const row of plain.rows) if (row.kind === 'hymn') expect(row.favourite).toBe(false);
    }
  });

  it('are starred in a list with no topics too, such as a search’s results', () => {
    const { rows, sticky } = plainRowsOf(
      [
        { number: 4, topic: 'A' },
        { number: 9, topic: 'B' },
      ],
      new Set([9]),
    );
    expect(sticky).toEqual([]);
    expect(
      rows.map((row) => row.kind === 'hymn' && [row.hymn.number, row.favourite, row.source]),
    ).toEqual([
      [4, false, [4, 9]],
      [9, true, [4, 9]],
    ]);
  });
});

describe('a search’s result rows', () => {
  it('carry the line each hymn was found by, and no line where it has none', () => {
    const found = [
      { number: 4, topic: 'A' },
      { number: 9, topic: 'B' },
      { number: 2, topic: 'A' },
    ];
    const { rows } = plainRowsOf(found, new Set(), new Map([[9, 'a line found']]));
    expect(rows.map((row) => row.kind === 'hymn' && [row.hymn.number, row.line])).toEqual([
      [4, Option.none()],
      [9, Option.some('a line found')],
      [2, Option.none()],
    ]);
  });

  it('are never carried by the topics’ rows or a shelf’s', () => {
    const { rows } = rowsOf(
      [
        { number: 1, topic: 'A' },
        { number: 2, topic: 'B' },
      ],
      [{ name: 'Recent', href: '/recent', hymns: [{ number: 2, topic: 'B' }] }],
    );
    const lines = rows.flatMap((row) => [row].filter((r) => r.kind === 'hymn').map((r) => r.line));
    expect(lines.map(Option.isNone)).toEqual([true, true, true]);
  });
});

describe('a home tab’s group rows', () => {
  const list = [5, 1, 3, 2, 4].map((number) => ({ number, topic: 'A' }));
  const groups = [
    { name: 'Joy', hymns: [3, 1] },
    { name: 'Rest', hymns: [] },
    { name: 'Hope', hymns: [1, 4, 9] },
  ];

  it('put each group under its pinned row, its hymns in the group’s order, and leave out an empty group', () => {
    const { rows, sticky } = groupRowsOf('Topics', groups, list);
    const seen = rows.map((row) =>
      Match.value(row).pipe(
        Match.when({ kind: 'hymn' }, (r) => r.hymn.number),
        Match.orElse((r) => r.name),
      ),
    );
    expect(seen).toEqual(['Joy', 3, 1, 'Hope', 1, 4]);
    expect(sticky).toEqual([0, 3]);
  });

  it('give every row its own key when a hymn is in two groups', () => {
    const { rows } = groupRowsOf('Topics', groups, list);
    const keys = rows.map((row) => row.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(groupRowsOf('Metres', groups, list).rows.map((row) => row.key)).not.toEqual(keys);
  });

  it('page every hymn row through the whole list in number order', () => {
    const { rows } = groupRowsOf('Topics', groups, list, new Set([4]));
    for (const row of rows)
      if (row.kind === 'hymn') {
        expect(row.source).toEqual([1, 2, 3, 4, 5]);
        expect(row.favourite).toBe(row.hymn.number === 4);
      }
  });

  it('page the real hymnal from a Topics row in number order', () => {
    const { rows } = groupRowsOf('Topics', [{ name: 'All', hymns: [695, 1] }], hymns);
    const first = rows.find((row) => row.kind === 'hymn');
    expect(first?.kind === 'hymn' && first.source).toEqual(hymns.map((hymn) => hymn.number));
    expect(hymns.map((hymn) => hymn.number)).toEqual(
      Array.from({ length: hymns.length }, (_, i) => i + 1),
    );
  });
});

describe('a search’s result rows with the hymns about it', () => {
  const hymn = (number: number) => ({ number, topic: 'A' });
  type Rows = ReadonlyArray<Row<{ readonly number: number }>>;
  /** Each row as its hymn's number, `about:` before one in the about section, or a section's name. */
  const seen = (rows: Rows) =>
    rows.map((row) =>
      Match.value(row).pipe(
        Match.when({ kind: 'hymn' }, (r) => r.key.replace('hymn:', '')),
        Match.orElse((r) => r.name),
      ),
    );
  const hymnRowsOf = (rows: Rows) =>
    rows.flatMap((row) =>
      Match.value(row).pipe(
        Match.when({ kind: 'hymn' }, (r) => [r]),
        Match.orElse(() => []),
      ),
    );

  it('put the strongest matches first, then Hymns about this, then the rest under More matches', () => {
    const found = [1, 2, 3, 4, 5, 6, 7].map(hymn);
    const { rows, sticky } = resultRowsOf(found, [3, 9, 8].map(hymn));
    expect(STRONG).toBe(5);
    expect(seen(rows)).toEqual([
      '1',
      '2',
      '3',
      '4',
      '5',
      'Hymns about this',
      'about:9',
      'about:8',
      'More matches',
      '6',
      '7',
    ]);
    expect(sticky).toEqual([]);
  });

  it('show each hymn once, a match the section holds under it alone, and page through the rows in their order', () => {
    // 9 and 7 are both matches past the strongest and hymns about the query.
    const { rows } = resultRowsOf([1, 2, 3, 4, 5, 7, 6, 9].map(hymn), [9, 8, 7].map(hymn));
    const hymnRows = hymnRowsOf(rows);
    const shown = hymnRows.map((row) => row.hymn.number);
    expect(seen(rows)).toEqual([
      '1',
      '2',
      '3',
      '4',
      '5',
      'Hymns about this',
      'about:9',
      'about:8',
      'about:7',
      'More matches',
      '6',
    ]);
    expect(new Set(shown).size).toBe(shown.length);
    expect(hymnRows.map((row) => row.source)).toEqual(hymnRows.map(() => shown));
    expect(new Set(rows.map((row) => row.key)).size).toBe(rows.length);
  });

  it('show the section alone when the words match nothing, and no section for no hymn about it', () => {
    expect(seen(resultRowsOf([], [4, 2].map(hymn)).rows)).toEqual([
      'Hymns about this',
      'about:4',
      'about:2',
    ]);
    expect(seen(resultRowsOf([1, 2].map(hymn), [1, 2].map(hymn)).rows)).toEqual(['1', '2']);
    expect(seen(resultRowsOf([1, 2].map(hymn), []).rows)).toEqual(['1', '2']);
  });

  it('keep each match’s found line, and none on a hymn about the query', () => {
    const { rows } = resultRowsOf(
      [1].map(hymn),
      [7].map(hymn),
      new Set(),
      new Map([[1, 'a line']]),
    );
    expect(hymnRowsOf(rows).map((row) => Option.isSome(row.line))).toEqual([true, false]);
  });
});
