import { getBibleBook, getBibleBookByName } from '@manna/core/bible';
import { Result, Schema } from 'effect';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import {
  IndexFile,
  type IndexName,
  type Indexes,
  type Metrical,
  type Passage,
  Rulings,
  type Scriptural,
  type ScripturalByHymn,
  type Topical,
  type Tunes,
} from '../src/indexes.ts';

export type Check =
  | 'decode'
  | 'range'
  | 'scripture'
  | 'order'
  | 'stanza'
  | 'sections'
  | 'tunes'
  | 'metre'
  | 'coverage'
  | 'pages'
  | 'rulings'
  | 'directions';

export interface Problem {
  readonly index: IndexName | 'rulings';
  readonly page: number;
  readonly at: string;
  readonly check: Check;
  readonly what: string;
  readonly value: string;
}

export interface Context {
  readonly lastVerse: (book: number, chapter: number) => number | undefined;
  readonly bookName: (book: number) => string;
  readonly hymn: (
    n: number,
  ) => { readonly title: string; readonly stanzas: number; readonly refrain: boolean } | undefined;
  readonly sections: ReadonlyArray<{
    readonly name: string;
    readonly first: number;
    readonly last: number;
  }>;
  readonly metre: (n: number) => string | null | undefined;
  readonly hymnCount: number;
}

export const HYMNS = { first: 1, last: 695 } as const;
export const READINGS = { first: 696, last: 920 } as const;

const NAMES = Object.keys(IndexFile) as ReadonlyArray<IndexName>;

const DECODE = { onExcessProperty: 'error', errors: 'all' } as const;

const decodeProblem = (index: IndexName | 'rulings', error: Schema.SchemaError): Problem => ({
  index,
  page: 0,
  at: '-',
  check: 'decode',
  what: error.message.split('\n').slice(0, 6).join(' | '),
  value: '',
});

export const decodeIndexes = (texts: Partial<Record<IndexName, string>>) => {
  const decoded: Array<[IndexName, Indexes[IndexName]]> = [];
  const problems: Array<Problem> = [];
  for (const name of NAMES) {
    const text = texts[name];
    if (text === undefined) continue;
    const result = Schema.decodeResult(
      Schema.fromJsonString(IndexFile[name] as Schema.Codec<Indexes[IndexName]>),
    )(text, DECODE);
    if (Result.isSuccess(result)) decoded.push([name, result.success]);
    else problems.push(decodeProblem(name, result.failure));
  }
  return { indexes: Object.fromEntries(decoded) as Indexes, problems };
};

export const decodeRulings = (text: string) => {
  const result = Schema.decodeResult(Schema.fromJsonString(Rulings))(text, DECODE);
  return Result.isSuccess(result)
    ? { rulings: result.success.rulings, problems: [] }
    : { rulings: [], problems: [decodeProblem('rulings', result.failure)] };
};

export interface Item {
  readonly index: IndexName;
  readonly page: number;
  readonly at: string;
  readonly number: number;
  readonly kind: 'hymn' | 'reading';
}

const numbered = (
  index: IndexName,
  rows: ReadonlyArray<{
    readonly page: number;
    readonly number: number;
    readonly kind: 'hymn' | 'reading';
  }>,
): Array<Item> => {
  const seen = new Map<number, number>();
  return rows.map((r) => {
    const k = (seen.get(r.page) ?? 0) + 1;
    seen.set(r.page, k);
    return { index, page: r.page, at: `#${k}`, number: r.number, kind: r.kind };
  });
};

type Row = {
  readonly page: number;
  readonly number: number;
  readonly kind: 'hymn' | 'reading';
  readonly holder: object;
  readonly key: 'number' | 'hymn' | 'reading';
};

const hymn = (h: { readonly page: number; readonly number: number }): Row => ({
  page: h.page,
  number: h.number,
  kind: 'hymn',
  holder: h,
  key: 'number',
});

const byHymn = (e: { readonly page: number; readonly hymn: number }): Row => ({
  page: e.page,
  number: e.hymn,
  kind: 'hymn',
  holder: e,
  key: 'hymn',
});

const ROWS = {
  topical: (x: Indexes) =>
    (x.topical?.topics ?? []).flatMap((t) => [
      ...t.hymns.map(hymn),
      ...t.readings.map((h): Row => ({ ...hymn(h), kind: 'reading' })),
    ]),
  'worship-aids': (x: Indexes) =>
    (x['worship-aids']?.entries ?? []).map((e): Row => ({
      page: e.page,
      number: e.reading,
      kind: 'reading',
      holder: e,
      key: 'reading',
    })),
  scriptural: (x: Indexes) => (x.scriptural?.entries ?? []).map(byHymn),
  'scriptural-by-hymn': (x: Indexes) =>
    [...(x['scriptural-by-hymn']?.entries ?? []), ...(x['scriptural-by-hymn']?.see ?? [])].map(
      byHymn,
    ),
  sentences: (x: Indexes) => (x.sentences?.groups ?? []).flatMap((g) => g.hymns.map(hymn)),
  canons: (x: Indexes) => (x.canons?.groups ?? []).flatMap((g) => g.hymns.map(hymn)),
  young: (x: Indexes) => (x.young?.hymns ?? []).map(hymn),
  authors: (x: Indexes) => (x.authors?.people ?? []).flatMap((p) => p.hymns.map(hymn)),
  composers: (x: Indexes) => (x.composers?.people ?? []).flatMap((p) => p.hymns.map(hymn)),
  tunes: (x: Indexes) => (x.tunes?.tunes ?? []).flatMap((t) => t.hymns.map(hymn)),
  metrical: (x: Indexes) =>
    (x.metrical?.metres ?? []).flatMap((m) => m.tunes.flatMap((t) => t.hymns.map(hymn))),
};

export const itemsOf = (indexes: Indexes, name: IndexName): Array<Item> =>
  numbered(name, ROWS[name](indexes));

export const passageText = (p: Passage, bookName: (book: number) => string): string => {
  if (p._tag === 'Chapter') {
    const verses = p.verses
      .map((v) => (v.from === v.to ? `${v.from}` : `${v.from}-${v.to}`))
      .join(', ');
    return `${bookName(p.book)} ${p.chapter}${verses === '' ? '' : `:${verses}`}`;
  }
  return `${bookName(p.book)} ${p.from.chapter}:${p.from.verse}-${p.to.chapter}:${p.to.verse}`;
};

const passageKey = (p: Passage): [number, number, number] =>
  p._tag === 'Chapter'
    ? [p.book, p.chapter, p.verses[0]?.from ?? 0]
    : [p.book, p.from.chapter, p.from.verse];

const compareKeys = (
  a: ReadonlyArray<number | string>,
  b: ReadonlyArray<number | string>,
): number => {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? '';
    const y = b[i] ?? '';
    if (x < y) return -1;
    if (x > y) return 1;
  }
  return 0;
};

export const passageFaults = (p: Passage, ctx: Context): ReadonlyArray<string> => {
  const faults: Array<string> = [];
  if (p.book < 1 || p.book > 66) return [`book ${p.book} is not 1-66`];
  const verse = (chapter: number, v: number, what: string) => {
    const last = ctx.lastVerse(p.book, chapter);
    if (last === undefined) faults.push(`${what}: chapter ${chapter} is past the book's last`);
    else if (v > last) faults.push(`${what}: verse ${v} is past ${chapter}:${last}`);
  };
  if (p._tag === 'Chapter') {
    if (ctx.lastVerse(p.book, p.chapter) === undefined)
      faults.push(`chapter ${p.chapter} is past the book's last`);
    else
      for (const v of p.verses) {
        verse(p.chapter, v.from, 'from');
        if (v.to !== v.from) verse(p.chapter, v.to, 'to');
        if (v.from > v.to) faults.push(`range ${v.from}-${v.to} runs backwards`);
      }
  } else {
    verse(p.from.chapter, p.from.verse, 'from');
    verse(p.to.chapter, p.to.verse, 'to');
    if (compareKeys([p.from.chapter, p.from.verse], [p.to.chapter, p.to.verse]) > 0)
      faults.push('the passage runs backwards');
  }
  return faults;
};

const PRINTED_BOOKS: ReadonlyMap<string, number> = new Map([
  ['is', 23],
  ['ss', 22],
  ['songofsolomon', 22],
  ['philem', 57],
]);

export const bookOf = (printed: string): number | undefined => {
  const name = printed.trim().replace(/\.$/, '').replace(/\s+/g, ' ');
  const known = getBibleBookByName(name);
  if (known._tag === 'Some') return known.value.number;
  return PRINTED_BOOKS.get(name.toLowerCase().replace(/[^a-z0-9]/g, ''));
};

type Piece =
  | {
      readonly _tag: 'cross';
      readonly from: { chapter: number; verse: number };
      readonly to: { chapter: number; verse: number };
    }
  | {
      readonly _tag: 'chapter';
      readonly chapter: number;
      readonly from: number;
      readonly to: number;
    }
  | { readonly _tag: 'verses'; readonly from: number; readonly to: number };

const pieceOf = (piece: string): Piece | undefined => {
  const cross = /^(\d+):(\d+)-(\d+):(\d+)$/.exec(piece);
  if (cross)
    return {
      _tag: 'cross',
      from: { chapter: Number(cross[1]), verse: Number(cross[2]) },
      to: { chapter: Number(cross[3]), verse: Number(cross[4]) },
    };
  const withChapter = /^(\d+):(\d+)(?:-(\d+))?$/.exec(piece);
  if (withChapter)
    return {
      _tag: 'chapter',
      chapter: Number(withChapter[1]),
      from: Number(withChapter[2]),
      to: Number(withChapter[3] ?? withChapter[2]),
    };
  const bare = /^(\d+)(?:-(\d+))?$/.exec(piece);
  return bare
    ? { _tag: 'verses', from: Number(bare[1]), to: Number(bare[2] ?? bare[1]) }
    : undefined;
};

export const seeHymnOf = (text: string): number | undefined => {
  const m = /^see\s+(\d+)\.?$/i.exec(text.trim());
  return m ? Number(m[1]) : undefined;
};

const ONE_CHAPTER: ReadonlySet<number> = new Set([31, 57, 63, 64, 65]);

export const parseReference = (book: number, text: string): ReadonlyArray<Passage> | undefined => {
  const printed = text
    .replace(/\s+/g, '')
    .replace(/[–—]/g, '-')
    .replace(/\.$/, '')
    .replace(/(\d)[a-d](?=$|[,;-])/g, '$1');
  if (ONE_CHAPTER.has(book) && !printed.includes(':')) return parseReference(book, `1:${printed}`);
  const pieces = printed.split(/[,;]/).map(pieceOf);
  if (!printed.includes(':') && pieces.every((p) => p?._tag === 'verses' && p.from === p.to))
    return pieces.flatMap((p): Array<Passage> =>
      p?._tag === 'verses' ? [{ _tag: 'Chapter', book, chapter: p.from, verses: [] }] : [],
    );
  const out: Array<Passage> = [];
  for (const piece of pieces) {
    const last = out[out.length - 1];
    if (piece === undefined) return undefined;
    if (piece._tag === 'cross') out.push({ _tag: 'Span', book, from: piece.from, to: piece.to });
    else if (piece._tag === 'chapter')
      out.push({
        _tag: 'Chapter',
        book,
        chapter: piece.chapter,
        verses: [{ from: piece.from, to: piece.to }],
      });
    else if (last && last._tag === 'Chapter')
      out[out.length - 1] = {
        ...last,
        verses: [...last.verses, { from: piece.from, to: piece.to }],
      };
    else return undefined;
  }
  return out.length > 0 ? out : undefined;
};

export const fold = (s: string): string =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[^a-z]/g, '');

export const sortKey = (s: string): string =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/['’]/g, '')
    .replace(/(^|[^a-z])st\.?(?=\s)/g, '$1saint')
    .split(/[^a-z]+/)
    .filter((w) => w.length > 0)
    .join(' ');

export const ORDER_RULES = [
  'scriptural: passages by book, chapter and first verse',
  'scriptural: the hymns of one reference ascending',
  'worship-aids: passages by book, chapter and first verse',
  'worship-aids: the readings of one reference ascending',
  'scriptural-by-hymn: hymns ascending',
  'tunes: names alphabetical (aliases aside)',
  'authors: names alphabetical',
  'composers: names alphabetical',
  'metrical: tunes alphabetical within a metre',
  'topical: topics alphabetical',
  'topical: hymns by compiled title within a topic',
  'sentences: hymns by compiled title within a group',
  'canons: hymns by compiled title within a group',
  'young: hymns by compiled title',
  'authors: the hymns of one name ascending',
  'composers: the hymns of one name ascending',
] as const;
export type OrderRule = (typeof ORDER_RULES)[number];

interface Pair {
  readonly rule: OrderRule;
  readonly index: IndexName;
  readonly page: number;
  readonly at: string;
  readonly broken: boolean;
  readonly value: string;
}

const NOWHERE = { page: 0, at: '-' } as const;

const pick = (p: { readonly page: number; readonly at: string }) => ({ page: p.page, at: p.at });

const neighbours = <R extends { readonly page: number; readonly at: string }>(
  rule: OrderRule,
  index: IndexName,
  rows: ReadonlyArray<R>,
  broken: (a: R, b: R) => boolean,
  value: (a: R, b: R) => string,
): Array<Pair> =>
  rows.slice(1).flatMap((b, i) => {
    const a = rows[i];
    return a ? [{ rule, index, ...pick(b), broken: broken(a, b), value: value(a, b) }] : [];
  });

const scriptureOrder = (
  indexes: Indexes,
  ctx: Context,
  name: 'scriptural' | 'worship-aids',
): Array<Pair> => {
  const entries =
    name === 'scriptural'
      ? (indexes.scriptural?.entries ?? []).map((e) => ({ passage: e.passage, n: e.hymn }))
      : (indexes['worship-aids']?.entries ?? []).map((e) => ({ passage: e.passage, n: e.reading }));
  const items = itemsOf(indexes, name);
  const rows = entries.map((e, i) => ({ ...e, ...pick(items[i] ?? NOWHERE) }));
  const same = (a: (typeof rows)[number], b: (typeof rows)[number]) =>
    passageText(a.passage, String) === passageText(b.passage, String);
  const value = (a: (typeof rows)[number], b: (typeof rows)[number]) =>
    `${passageText(a.passage, ctx.bookName)} ${a.n} > ${passageText(b.passage, ctx.bookName)} ${b.n}`;
  const byPassage: OrderRule = `${name}: passages by book, chapter and first verse`;
  const byNumber: OrderRule =
    name === 'scriptural'
      ? 'scriptural: the hymns of one reference ascending'
      : 'worship-aids: the readings of one reference ascending';
  return neighbours(
    byPassage,
    name,
    rows,
    (a, b) => !same(a, b) && compareKeys(passageKey(a.passage), passageKey(b.passage)) > 0,
    value,
  ).map((p, i) => {
    const a = rows[i];
    const b = rows[i + 1];
    return a && b && same(a, b) ? { ...p, rule: byNumber, broken: a.n > b.n } : p;
  });
};

const byHymnOrder = (indexes: Indexes): Array<Pair> => {
  const items = itemsOf(indexes, 'scriptural-by-hymn');
  const rows = (indexes['scriptural-by-hymn']?.entries ?? []).map((e, i) => ({
    hymn: e.hymn,
    ...pick(items[i] ?? NOWHERE),
  }));
  return neighbours(
    'scriptural-by-hymn: hymns ascending',
    'scriptural-by-hymn',
    rows,
    (a, b) => a.hymn > b.hymn,
    (a, b) => `${a.hymn} > ${b.hymn}`,
  );
};

const placedNames = <R extends { readonly name: string; readonly hymns: ReadonlyArray<unknown> }>(
  items: ReadonlyArray<Item>,
  rows: ReadonlyArray<R>,
  first = 0,
) => {
  let i = first;
  return rows.map((r) => {
    const placed = { row: r, name: r.name, ...pick(items[i] ?? NOWHERE) };
    i += r.hymns.length;
    return placed;
  });
};

const alphabetical = (
  rule: OrderRule,
  index: IndexName,
  rows: ReadonlyArray<{ readonly name: string; readonly page: number; readonly at: string }>,
) =>
  neighbours(
    rule,
    index,
    rows,
    (a, b) => sortKey(a.name) > sortKey(b.name),
    (a, b) => `${a.name} > ${b.name}`,
  );

const nameOrders = (indexes: Indexes): Array<Pair> => {
  const pairs: Array<Pair> = [];
  if (indexes.tunes) {
    const rows = placedNames(itemsOf(indexes, 'tunes'), indexes.tunes.tunes).filter(
      (r) => r.row.alias === undefined,
    );
    pairs.push(...alphabetical('tunes: names alphabetical (aliases aside)', 'tunes', rows));
  }
  for (const who of ['authors', 'composers'] as const) {
    const file = indexes[who];
    if (file)
      pairs.push(
        ...alphabetical(
          `${who}: names alphabetical`,
          who,
          placedNames(itemsOf(indexes, who), file.people),
        ),
      );
  }
  if (indexes.metrical) {
    const items = itemsOf(indexes, 'metrical');
    let first = 0;
    for (const m of indexes.metrical.metres) {
      pairs.push(
        ...alphabetical(
          'metrical: tunes alphabetical within a metre',
          'metrical',
          placedNames(items, m.tunes, first),
        ),
      );
      first += m.tunes.reduce((n, t) => n + t.hymns.length, 0);
    }
  }
  return pairs;
};

const topicalOrder = (topical: Topical, ctx: Context): Array<Pair> => {
  const top = topical.topics
    .filter((t) => t.parent === undefined)
    .map((t) => ({
      name: t.name,
      page: t.hymns[0]?.page ?? t.readings[0]?.page ?? 0,
      at: `topic ${t.name}`,
    }));
  const titled = topical.topics.flatMap((t) => {
    const rows = t.hymns.flatMap((h) => {
      const title = ctx.hymn(h.number)?.title;
      return title === undefined
        ? []
        : [{ n: h.number, title, page: h.page, at: `topic ${topicPath(t)} ${h.number}` }];
    });
    return neighbours(
      'topical: hymns by compiled title within a topic',
      'topical',
      rows,
      (a, b) => sortKey(a.title) > sortKey(b.title),
      (a, b) => `${a.n} > ${b.n}`,
    );
  });
  return [...alphabetical('topical: topics alphabetical', 'topical', top), ...titled];
};

type Placed = { readonly n: number; readonly page: number; readonly at: string };

const placedLists = (
  items: ReadonlyArray<Item>,
  lists: ReadonlyArray<ReadonlyArray<{ readonly number: number }>>,
): Array<Array<Placed>> => {
  let i = 0;
  return lists.map((hymns) =>
    hymns.map((h) => {
      const placed = { n: h.number, ...pick(items[i] ?? NOWHERE) };
      i += 1;
      return placed;
    }),
  );
};

const titledLists = (
  rule: OrderRule,
  index: IndexName,
  ctx: Context,
  lists: ReadonlyArray<ReadonlyArray<Placed>>,
): Array<Pair> =>
  lists.flatMap((list) =>
    neighbours(
      rule,
      index,
      list.flatMap((r) => {
        const title = ctx.hymn(r.n)?.title;
        return title === undefined ? [] : [{ ...r, title }];
      }),
      (a, b) => sortKey(a.title) > sortKey(b.title),
      (a, b) => `${a.n} > ${b.n}`,
    ),
  );

const listOrders = (indexes: Indexes, ctx: Context): Array<Pair> => [
  ...titledLists(
    'sentences: hymns by compiled title within a group',
    'sentences',
    ctx,
    placedLists(
      itemsOf(indexes, 'sentences'),
      (indexes.sentences?.groups ?? []).map((g) => g.hymns),
    ),
  ),
  ...titledLists(
    'canons: hymns by compiled title within a group',
    'canons',
    ctx,
    placedLists(
      itemsOf(indexes, 'canons'),
      (indexes.canons?.groups ?? []).map((g) => g.hymns),
    ),
  ),
  ...titledLists(
    'young: hymns by compiled title',
    'young',
    ctx,
    placedLists(itemsOf(indexes, 'young'), [indexes.young?.hymns ?? []]),
  ),
  ...(['authors', 'composers'] as const).flatMap((who) =>
    placedLists(
      itemsOf(indexes, who),
      (indexes[who]?.people ?? []).map((p) => p.hymns),
    ).flatMap((list) =>
      neighbours(
        `${who}: the hymns of one name ascending`,
        who,
        list,
        (a, b) => a.n > b.n,
        (a, b) => `${a.n} > ${b.n}`,
      ),
    ),
  ),
];

export const orderPairs = (indexes: Indexes, ctx: Context): ReadonlyArray<Pair> => [
  ...scriptureOrder(indexes, ctx, 'scriptural'),
  ...scriptureOrder(indexes, ctx, 'worship-aids'),
  ...byHymnOrder(indexes),
  ...nameOrders(indexes),
  ...(indexes.topical ? topicalOrder(indexes.topical, ctx) : []),
  ...listOrders(indexes, ctx),
];

const topicPath = (t: Topical['topics'][number]) =>
  t.parent === undefined ? t.name : `${t.parent}: ${t.name}`;

export const measureOrder = (indexes: Indexes, ctx: Context) =>
  ORDER_RULES.map((rule) => {
    const of = orderPairs(indexes, ctx).filter((p) => p.rule === rule);
    return { rule, pairs: of.length, broken: of.filter((p) => p.broken).length };
  });

const rangeProblems = (indexes: Indexes): Array<Problem> =>
  NAMES.flatMap((name) =>
    itemsOf(indexes, name).flatMap((it) => {
      const r = it.kind === 'hymn' ? HYMNS : READINGS;
      return it.number < r.first || it.number > r.last
        ? [
            {
              index: name,
              page: it.page,
              at: it.at,
              check: 'range' as const,
              what: `${it.kind} ${it.number} is not ${r.first}-${r.last}`,
              value: `${it.number}`,
            },
          ]
        : [];
    }),
  );

const scriptureProblems = (indexes: Indexes, ctx: Context): Array<Problem> => {
  const out: Array<Problem> = [];
  const hold = (name: IndexName, entries: ReadonlyArray<{ readonly passage: Passage }>) => {
    const items = itemsOf(indexes, name);
    entries.forEach((e, i) => {
      const it = items[i];
      for (const fault of passageFaults(e.passage, ctx))
        out.push({
          index: name,
          page: it?.page ?? 0,
          at: it?.at ?? '-',
          check: 'scripture',
          what: fault,
          value: passageText(e.passage, ctx.bookName),
        });
    });
  };
  if (indexes.scriptural) hold('scriptural', indexes.scriptural.entries);
  if (indexes['scriptural-by-hymn'])
    hold('scriptural-by-hymn', indexes['scriptural-by-hymn'].entries);
  if (indexes['worship-aids']) hold('worship-aids', indexes['worship-aids'].entries);
  return out;
};

const orderProblems = (
  indexes: Indexes,
  ctx: Context,
  rules: ReadonlyArray<OrderRule>,
): Array<Problem> =>
  orderPairs(indexes, ctx)
    .filter((p) => p.broken && rules.includes(p.rule))
    .map((p) => ({
      index: p.index,
      page: p.page,
      at: p.at,
      check: 'order' as const,
      what: p.rule,
      value: p.value,
    }));

export const stanzaOf = (letter: string): number =>
  letter === 'r' ? 0 : letter.charCodeAt(0) - 96;

const stanzaFault = (hymn: number, letter: string, ctx: Context): string | undefined => {
  const h = ctx.hymn(hymn);
  if (!h) return undefined;
  const s = stanzaOf(letter);
  if (s === 0) return h.refrain ? undefined : `hymn ${hymn} has no refrain`;
  return s <= h.stanzas ? undefined : `hymn ${hymn} has ${h.stanzas} stanzas, not ${s}`;
};

const stanzaProblems = (indexes: Indexes, ctx: Context): Array<Problem> => {
  const out: Array<Problem> = [];
  const hold = (
    name: IndexName,
    rows: ReadonlyArray<{ readonly hymn: number; readonly stanzas: ReadonlyArray<string> }>,
  ) => {
    const items = itemsOf(indexes, name);
    rows.forEach((r, i) => {
      const it = items[i];
      for (const letter of r.stanzas) {
        const fault = stanzaFault(r.hymn, letter, ctx);
        if (fault)
          out.push({
            index: name,
            page: it?.page ?? 0,
            at: it?.at ?? '-',
            check: 'stanza',
            what: fault,
            value: `${r.hymn}${letter}`,
          });
      }
    });
  };
  const one = (e: { readonly hymn: number; readonly stanza?: string }) => ({
    hymn: e.hymn,
    stanzas: e.stanza === undefined ? [] : [e.stanza],
  });
  if (indexes.scriptural) hold('scriptural', indexes.scriptural.entries.map(one));
  if (indexes['scriptural-by-hymn'])
    hold('scriptural-by-hymn', indexes['scriptural-by-hymn'].entries.map(one));
  if (indexes.sentences)
    hold(
      'sentences',
      indexes.sentences.groups.flatMap((g) =>
        g.hymns.map((h) => ({ hymn: h.number, stanzas: h.stanzas })),
      ),
    );
  return out;
};

export const SECTION_TOPICS: ReadonlyMap<string, ReadonlyArray<string>> = new Map([
  ['loveofgod', ['GOD THE FATHER: Love']],
  ['faithfulnessofgod', ['GOD THE FATHER: Faithfulness']],
]);

export const seeTargets = (
  see: string,
): ReadonlyArray<{ readonly parent?: string; readonly name: string }> =>
  see
    .replace(/^\(?\s*See\s+/i, '')
    .replace(/\)$/, '')
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s !== '')
    .flatMap((s) => {
      const colon = s.indexOf(':');
      if (colon < 0) return [{ name: s }];
      const parent = s.slice(0, colon).trim();
      return s
        .slice(colon + 1)
        .split(',')
        .map((name) => ({ parent, name: name.trim() }));
    });

const sectionProblems = (topical: Topical, ctx: Context): Array<Problem> => {
  const out: Array<Problem> = [];
  const page = topical.pages[0].page;
  const find = (parent: string | undefined, name: string) =>
    topical.topics.filter(
      (t) =>
        fold(t.name) === fold(name) &&
        (parent === undefined || fold(t.parent ?? '') === fold(parent)),
    );
  for (const section of ctx.sections) {
    const named = SECTION_TOPICS.get(fold(section.name));
    let topics = named
      ? named.flatMap((path) => {
          const [target] = seeTargets(path);
          return target ? find(target.parent, target.name) : [];
        })
      : find(undefined, section.name);
    topics = topics.flatMap((t) =>
      t.hymns.length === 0 && t.readings.length === 0
        ? t.see.flatMap((s) => seeTargets(s).flatMap((x) => find(x.parent, x.name)))
        : [t],
    );
    if (topics.length === 0) {
      out.push({
        index: 'topical',
        page,
        at: `section ${section.name}`,
        check: 'sections',
        what: `no topic lists section ${section.name}`,
        value: section.name,
      });
      continue;
    }
    const listed = new Set(topics.flatMap((t) => [...t.hymns, ...t.readings].map((h) => h.number)));
    for (let n = section.first; n <= section.last; n++)
      if (!listed.has(n))
        out.push({
          index: 'topical',
          page: topics[0]?.hymns[0]?.page ?? page,
          at: `section ${section.name}`,
          check: 'sections',
          what: `hymn ${n} of section ${section.name} is not under its topic`,
          value: `${n}`,
        });
  }
  return out;
};

export const tuneKey = (name: string): string => tuneWords(name).replace(/ /g, '');

const tuneWords = (name: string): string => sortKey(name).replace(/^the /, '').replace(/ the$/, '');

export const titledTune = (name: string, n: number, ctx: Context): boolean => {
  const title = ctx.hymn(n)?.title;
  if (title === undefined) return false;
  const [tune, words] = [tuneWords(name), tuneWords(title)];
  return (
    tune.length > 0 &&
    (tune === words || words.startsWith(`${tune} `) || tune.startsWith(`${words} `))
  );
};

const titledHymns = (
  metreTunes: ReadonlyArray<{
    readonly name: string;
    readonly hymns: ReadonlyArray<{ readonly number: number }>;
  }>,
  ctx: Context,
): ReadonlySet<number> =>
  new Set(
    metreTunes.flatMap((t) =>
      t.hymns.filter((h) => titledTune(t.name, h.number, ctx)).map((h) => h.number),
    ),
  );

const tunePairs = (
  rows: ReadonlyArray<{
    readonly name: string;
    readonly hymns: ReadonlyArray<{ readonly number: number }>;
  }>,
) => new Set(rows.flatMap((t) => t.hymns.map((h) => `${tuneKey(t.name)} ${h.number}`)));

const tuneRows = (
  rows: ReadonlyArray<{
    readonly name: string;
    readonly alias?: true;
    readonly hymns: ReadonlyArray<{ readonly number: number }>;
  }>,
  items: ReadonlyArray<Item>,
) => {
  let i = 0;
  return rows.flatMap((t) =>
    t.hymns.map((h) => ({
      name: t.name,
      alias: t.alias === true,
      number: h.number,
      key: `${tuneKey(t.name)} ${h.number}`,
      ...pick(items[i++] ?? NOWHERE),
    })),
  );
};

const tuneProblems = (tunes: Tunes, metrical: Metrical, ctx: Context): Array<Problem> => {
  const listed = tunePairs(tunes.tunes);
  const metreTunes = metrical.metres.flatMap((m) => m.tunes);
  const metre = tunePairs(metreTunes);
  const metreHymns = new Set(metreTunes.flatMap((t) => t.hymns.map((h) => h.number)));
  const aliased = tunePairs(tunes.tunes.filter((t) => t.alias === true));
  const titled = titledHymns(metreTunes, ctx);
  const metred = (r: { readonly key: string; readonly number: number }) =>
    metre.has(r.key) ||
    titled.has(r.number) ||
    metreTunes.some((t) =>
      t.hymns.some((h) => h.number === r.number && aliased.has(`${tuneKey(t.name)} ${r.number}`)),
    );
  const unmetred = tuneRows(tunes.tunes, itemsOf({ tunes }, 'tunes'))
    .filter((r) => !metred(r) && !(r.alias && metreHymns.has(r.number)))
    .map((r): Problem => ({
      index: 'tunes',
      page: r.page,
      at: r.at,
      check: 'tunes',
      what: `${r.name} ${r.number} is under no metre`,
      value: `${r.name} ${r.number}`,
    }));
  const unlisted = tuneRows(metreTunes, itemsOf({ metrical }, 'metrical'))
    .filter((r) => !listed.has(r.key) && !titledTune(r.name, r.number, ctx))
    .map((r): Problem => ({
      index: 'metrical',
      page: r.page,
      at: r.at,
      check: 'tunes',
      what: `${r.name} ${r.number} is not in the alphabetical index`,
      value: `${r.name} ${r.number}`,
    }));
  return [...unmetred, ...unlisted];
};

export const normalMetre = (m: string): string => {
  const words = m
    .toLowerCase()
    .trim()
    .replace(/with\s*refrain|refrain|ref\.?/g, 'ref')
    .replace(/(?<=[.\d])r$|\bre…?$/, 'ref')
    .replace(/(with\s*)?amens?/g, 'amen')
    .replace(/(with\s*)?allelui\w*…?/g, 'alleluia')
    .split(/[\s.,…]+/)
    .filter(Boolean);
  const numbers = words.findIndex((w) => !/^\d+$/.test(w));
  const n = numbers === -1 ? words.length : numbers;
  const half = words.slice(0, n / 2);
  const doubled =
    n >= 2 && n % 2 === 0 && words[n] !== 'd' && half.join('.') === words.slice(n / 2, n).join('.');
  return (doubled ? [...half, 'd', ...words.slice(n)] : words).join('.');
};

const metreProblems = (metrical: Metrical, ctx: Context): Array<Problem> => {
  const out: Array<Problem> = [];
  const items = itemsOf({ metrical }, 'metrical');
  let i = 0;
  for (const m of metrical.metres)
    for (const t of m.tunes)
      for (const h of t.hymns) {
        const it = items[i++];
        const printed = ctx.metre(h.number);
        if (printed && normalMetre(printed) !== normalMetre(m.metre))
          out.push({
            index: 'metrical',
            page: it?.page ?? h.page,
            at: it?.at ?? '-',
            check: 'metre',
            what: `hymn ${h.number}'s page prints ${printed}`,
            value: `${m.metre} ${h.number}`,
          });
      }
  return out;
};

const coverageProblems = (indexes: Indexes, ctx: Context): Array<Problem> => {
  const out: Array<Problem> = [];
  const titled = titledHymns(indexes.metrical?.metres.flatMap((m) => m.tunes) ?? [], ctx);
  const hold = (name: IndexName, what: string, also: ReadonlySet<number> = new Set()) => {
    const file = indexes[name];
    if (!file) return;
    const has = new Set(itemsOf(indexes, name).map((it) => it.number));
    for (let n = HYMNS.first; n <= ctx.hymnCount; n++)
      if (!has.has(n) && !also.has(n))
        out.push({
          index: name,
          page: file.pages[0].page,
          at: `hymn ${n}`,
          check: 'coverage',
          what: `hymn ${n} is in no ${what}`,
          value: `${n}`,
        });
  };
  hold('tunes', 'tune', titled);
  hold('metrical', 'metre');
  hold('topical', 'topic');
  return out;
};

const pageProblems = (indexes: Indexes): Array<Problem> => {
  const out: Array<Problem> = [];
  const spans = new Map<number, Array<{ name: IndexName; first: boolean; last: boolean }>>();
  for (const name of NAMES) {
    const file = indexes[name];
    if (!file) continue;
    const counts = new Map<number, number>();
    for (const it of itemsOf(indexes, name)) counts.set(it.page, (counts.get(it.page) ?? 0) + 1);
    file.pages.forEach((p, i) => {
      const prev = file.pages[i - 1];
      if (prev && p.page !== prev.page + 1)
        out.push({
          index: name,
          page: p.page,
          at: '-',
          check: 'pages',
          what: `page ${p.page} follows ${prev.page}`,
          value: `${p.page}`,
        });
      const n = counts.get(p.page) ?? 0;
      if (n !== p.entries)
        out.push({
          index: name,
          page: p.page,
          at: '-',
          check: 'pages',
          what: `the page counts ${p.entries} entries; ${n} name it`,
          value: `${p.entries}`,
        });
      const list = spans.get(p.page) ?? [];
      list.push({ name, first: i === 0, last: i === file.pages.length - 1 });
      spans.set(p.page, list);
    });
    for (const page of counts.keys())
      if (!file.pages.some((p) => p.page === page))
        out.push({
          index: name,
          page,
          at: '-',
          check: 'pages',
          what: `entries name page ${page}, which the file does not list`,
          value: `${page}`,
        });
  }
  for (const [page, list] of spans) {
    if (list.length < 2) continue;
    const ends = list.filter((s) => s.last && !s.first).length;
    const begins = list.filter((s) => s.first && !s.last).length;
    const whole = list.filter((s) => s.first && s.last).length;
    if (ends > 1 || begins > 1 || ends + begins + whole !== list.length)
      out.push({
        index: list[0]?.name ?? 'topical',
        page,
        at: '-',
        check: 'pages',
        what: `page ${page} is in ${list.map((s) => s.name).join(', ')} not as the end of one and the head of the next`,
        value: `${page}`,
      });
  }
  return out;
};

const spansOf = (p: Passage): ReadonlyArray<readonly [number, number]> => {
  const at = (chapter: number, verse: number) => chapter * 1000 + verse;
  return p._tag === 'Chapter'
    ? p.verses.length === 0
      ? [[at(p.chapter, 0), at(p.chapter, 999)]]
      : p.verses.map((v) => [at(p.chapter, v.from), at(p.chapter, v.to)] as const)
    : [[at(p.from.chapter, p.from.verse), at(p.to.chapter, p.to.verse)]];
};

const overlaps = (a: Passage, b: Passage): boolean =>
  a.book === b.book &&
  spansOf(a).some(([from, to]) => spansOf(b).some(([f, t]) => from <= t && f <= to));

const directionProblems = (
  scriptural: Scriptural,
  byHymn: ScripturalByHymn,
  ctx: Context,
): Array<Problem> => {
  const byNumber = new Map<number, Array<ScripturalByHymn['entries'][number]>>();
  for (const e of byHymn.entries) {
    const list = byNumber.get(e.hymn) ?? [];
    list.push(e);
    byNumber.set(e.hymn, list);
  }
  const sees = new Map((byHymn.see ?? []).map((s) => [s.hymn, s.see]));
  const items = itemsOf({ scriptural }, 'scriptural');
  return scriptural.entries.flatMap((e, i): Array<Problem> => {
    const see = sees.get(e.hymn);
    const twin = (see === undefined ? [e.hymn] : [e.hymn, see]).some((h) =>
      (byNumber.get(h) ?? []).some(
        (t) =>
          (t.stanza === undefined || e.stanza === undefined || t.stanza === e.stanza) &&
          overlaps(t.passage, e.passage),
      ),
    );
    if (twin) return [];
    const it = items[i];
    return [
      {
        index: 'scriptural',
        page: it?.page ?? 0,
        at: it?.at ?? '-',
        check: 'directions',
        what: 'not in the index by hymn number',
        value: `${passageText(e.passage, ctx.bookName)} ${e.hymn}${e.stanza ?? ''}`,
      },
    ];
  });
};

export const checkIndexes = (
  indexes: Indexes,
  ctx: Context,
  rules: ReadonlyArray<OrderRule> = ORDER_RULES,
): ReadonlyArray<Problem> => [
  ...rangeProblems(indexes),
  ...scriptureProblems(indexes, ctx),
  ...orderProblems(indexes, ctx, rules),
  ...stanzaProblems(indexes, ctx),
  ...(indexes.topical ? sectionProblems(indexes.topical, ctx) : []),
  ...(indexes.tunes && indexes.metrical ? tuneProblems(indexes.tunes, indexes.metrical, ctx) : []),
  ...(indexes.metrical ? metreProblems(indexes.metrical, ctx) : []),
  ...coverageProblems(indexes, ctx),
  ...pageProblems(indexes),
  ...(indexes.scriptural && indexes['scriptural-by-hymn']
    ? directionProblems(indexes.scriptural, indexes['scriptural-by-hymn'], ctx)
    : []),
];

const failureKey = (
  f: Pick<Problem, 'index' | 'page' | 'at' | 'value'> & { readonly check: string },
): string => JSON.stringify([f.index, f.page, f.at, f.check, f.value]);

export const settle = (
  problems: ReadonlyArray<Problem>,
  rulings: Rulings['rulings'],
  judgeExists?: (judge: string) => boolean,
) => {
  const ruledKeys = new Set(rulings.map(failureKey));
  const printedKeys = new Set(problems.map(failureKey));
  const open = problems.filter((p) => !ruledKeys.has(failureKey(p)));
  const ruled = problems.filter((p) => ruledKeys.has(failureKey(p)));
  const stale = rulings.flatMap((r): Array<Problem> => [
    ...(printedKeys.has(failureKey(r))
      ? []
      : [
          {
            index: r.index,
            page: r.page,
            at: r.at,
            check: 'rulings' as const,
            what: `the ruling settles no ${r.check} failure printed now`,
            value: r.value,
          },
        ]),
    ...(judgeExists && !judgeExists(r.judge)
      ? [
          {
            index: r.index,
            page: r.page,
            at: r.at,
            check: 'rulings' as const,
            what: `judge record ${r.judge} is missing`,
            value: r.value,
          },
        ]
      : []),
  ]);
  return { open: [...open, ...stale], ruled };
};

export const problemLine = (p: Problem): string =>
  `${p.index} p${p.page} ${p.at} ${p.check}: ${p.what}${p.value === '' ? '' : ` [${p.value}]`}`;

export const summaryLine = (
  indexes: Indexes,
  name: IndexName,
  ruled: number,
  problems: number,
): string => {
  const file = indexes[name];
  const first = file?.pages[0].page ?? 0;
  const last = file?.pages[file.pages.length - 1]?.page ?? 0;
  return `indexes ${name} pages=${first}-${last} entries=${itemsOf(indexes, name).length} ruled=${ruled} problems=${problems}`;
};

const LOOK_ALIKES = new Map<string, ReadonlyArray<string>>([
  ['0', ['8']],
  ['1', ['7']],
  ['3', ['8', '9']],
  ['5', ['6']],
  ['6', ['8', '5']],
  ['7', ['1']],
  ['8', ['3', '6', '9', '0']],
  ['9', ['8', '3']],
]);

export const lookAlikes = (n: number): Array<number> => {
  const s = `${n}`;
  return [...s].flatMap((d, i) =>
    (LOOK_ALIKES.get(d) ?? [])
      .map((r) => `${s.slice(0, i)}${r}${s.slice(i + 1)}`)
      .filter((t) => !(t.length > 1 && t.startsWith('0')))
      .map(Number),
  );
};

export const reach = (indexes: Indexes, ctx: Context, rulings: Rulings['rulings']) => {
  const work = structuredClone(indexes);
  const openOf = () =>
    settle(checkIndexes(work, ctx), rulings).open.filter((p) => p.check !== 'rulings');
  const key = (p: Problem) => `${p.index}|${p.page}|${p.at}|${p.check}|${p.value}`;
  const base = new Set(openOf().map(key));
  return NAMES.filter((name) => work[name] !== undefined).map((name) => {
    const rows = ROWS[name](work);
    const places = itemsOf(work, name);
    const variants = rows.map((r) => lookAlikes(r.number));
    const at = (i: number) => (p: Problem) => p.page === places[i]?.page && p.at === places[i]?.at;
    let [total, caught] = [0, 0];
    const most = Math.max(0, ...variants.map((v) => v.length));
    for (let k = 0; k < most; k++)
      for (let offset = 0; offset < 3; offset++) {
        const hit = rows.flatMap((r, i) => {
          const v = variants[i]?.[k];
          if (i % 3 !== offset || v === undefined) return [];
          Reflect.set(r.holder, r.key, v);
          return [{ i, r, v }];
        });
        if (hit.length === 0) continue;
        const found = openOf().filter((p) => !base.has(key(p)));
        for (const h of hit) {
          Reflect.set(h.r.holder, h.r.key, h.r.number);
          total++;
          if (
            h.v === 0 ||
            found.some(
              (p) =>
                (p.index === name && (at(h.i)(p) || (p.check === 'order' && at(h.i + 1)(p)))) ||
                p.at === `hymn ${h.r.number}`,
            )
          )
            caught++;
        }
      }
    return { index: name, caught, total };
  });
};

const DATA = join(import.meta.dir, '../data');

export const loadContext = (): Context => {
  const core = dirname(Bun.resolveSync('@manna/core/package.json', import.meta.dir));
  const kjv = JSON.parse(readFileSync(join(core, 'assets/kjv.json'), 'utf8')) as {
    verses: ReadonlyArray<{ book: number; chapter: number; verse: number }>;
  };
  const last = new Map<string, number>();
  for (const v of kjv.verses) {
    const key = `${v.book}:${v.chapter}`;
    last.set(key, Math.max(last.get(key) ?? 0, v.verse));
  }
  const hymns = new Map<number, { title: string; stanzas: number; refrain: boolean }>();
  for (const file of readdirSync(join(DATA, 'sdah-1985'))) {
    if (!/^\d{3}\.json$/.test(file)) continue;
    const h = JSON.parse(readFileSync(join(DATA, 'sdah-1985', file), 'utf8')) as {
      number: number;
      title: string;
      stanzas: ReadonlyArray<unknown>;
      refrain?: unknown;
    };
    hymns.set(h.number, {
      title: h.title,
      stanzas: h.stanzas.length,
      refrain: h.refrain !== undefined && h.refrain !== null,
    });
  }
  const sections = (
    JSON.parse(readFileSync(join(DATA, 'sdah-1985/topics.json'), 'utf8')) as {
      topics: ReadonlyArray<{ name: string; first: number; last: number }>;
    }
  ).topics;
  const printed = JSON.parse(readFileSync(join(DATA, 'shapes.json'), 'utf8')) as {
    hymns: ReadonlyArray<{ number: number; metre?: string | null }>;
  };
  const metres = new Map(printed.hymns.map((h) => [h.number, h.metre ?? null]));
  return {
    lastVerse: (book, chapter) => last.get(`${book}:${chapter}`),
    bookName: (book) => {
      const b = getBibleBook(book);
      return b._tag === 'Some' ? b.value.name : `book ${book}`;
    },
    hymn: (n) => hymns.get(n),
    sections,
    metre: (n) => metres.get(n),
    hymnCount: HYMNS.last,
  };
};

if (import.meta.main) {
  const args = process.argv.slice(2);
  const opt = (flag: string) => {
    const i = args.indexOf(flag);
    return i < 0 ? undefined : args[i + 1];
  };
  const dir = opt('--dir') ?? join(DATA, 'indexes');
  const judges = opt('--judges');
  const texts: Partial<Record<IndexName, string>> = {};
  for (const name of NAMES) {
    const file = join(dir, `${name}.json`);
    if (existsSync(file)) texts[name] = readFileSync(file, 'utf8');
  }
  const decoded = decodeIndexes(texts);
  const rulingsFile = join(dir, 'rulings.json');
  const rulings = existsSync(rulingsFile)
    ? decodeRulings(readFileSync(rulingsFile, 'utf8'))
    : { rulings: [], problems: [] };
  const ctx = loadContext();
  const { open, ruled } = settle(
    [...decoded.problems, ...rulings.problems, ...checkIndexes(decoded.indexes, ctx)],
    rulings.rulings,
    judges
      ? (judge) =>
          existsSync(join(judges, judge)) ||
          existsSync(join(judges, `${judge}.json`)) ||
          existsSync(join(judges, `${judge}.md`))
      : undefined,
  );
  for (const p of open) console.log(problemLine(p));
  if (args.includes('--measure'))
    for (const m of measureOrder(decoded.indexes, ctx))
      console.log(`order ${m.rule}: pairs=${m.pairs} broken=${m.broken}`);
  if (args.includes('--reach'))
    for (const r of reach(decoded.indexes, ctx, rulings.rulings))
      console.log(`reach ${r.index}: caught=${r.caught} variants=${r.total}`);
  let files = 0;
  let entries = 0;
  for (const name of NAMES) {
    if (!decoded.indexes[name]) continue;
    files++;
    entries += itemsOf(decoded.indexes, name).length;
    console.log(
      summaryLine(
        decoded.indexes,
        name,
        ruled.filter((p) => p.index === name).length,
        open.filter((p) => p.index === name).length,
      ),
    );
  }
  console.log(`indexes files=${files} entries=${entries} problems=${open.length}`);
  process.exit(open.length === 0 && files > 0 ? 0 : 1);
}
