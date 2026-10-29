/* oxlint-disable effect/noNodeBuiltinImport, effect/noGlobals -- reads the committed index files once, mutates their JSON key by key and prints counts. */
/**
 * The back-matter index checks (`scripts/indexes.ts`) on the committed
 * indexes: the data as committed, with its rulings, prints no problem; then
 * each mutation class is applied at every place it applies to, in batches,
 * through the same decode, checks and rulings the CLI runs, and every mutant
 * must print a problem at its own place. Each class prints its counts per
 * index (numbers only). The look-alike digit reach is a measurement, not a
 * check: `bun run indexes --reach`.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'bun:test';

import {
  checkIndexes,
  decodeIndexes,
  decodeRulings,
  fold,
  itemsOf,
  loadContext,
  passageText,
  type Problem,
  SECTION_TOPICS,
  seeTargets,
  settle,
  sortKey,
  titledTune,
} from '../scripts/indexes.js';
import type { IndexName, Indexes, Passage } from './indexes.js';

/** A file's parsed JSON, mutated in place before it is written back out as the text the CLI reads. */
interface Json extends Fields {
  [key: string]: Value;
}
/** The keys this file reads of a row by name; a key held in a variable is read as `row[key]`. */
type Fields = {
  [
    K in
      | 'alias'
      | 'book'
      | 'chapter'
      | 'entries'
      | 'from'
      | 'groups'
      | 'hymn'
      | 'hymns'
      | 'metres'
      | 'name'
      | 'number'
      | 'page'
      | 'pages'
      | 'parent'
      | 'passage'
      | 'people'
      | 'readings'
      | 'see'
      | 'stanza'
      | 'stanzas'
      | 'to'
      | 'topics'
      | 'tunes'
      | 'verse'
      | 'verses'
  ]?: Value;
};
/** One JSON value as the files hold it. */
type Value = string | number | boolean | null | undefined | Json | Array<Value>;

const NAMES: ReadonlyArray<IndexName> = [
  'topical',
  'worship-aids',
  'scriptural',
  'scriptural-by-hymn',
  'sentences',
  'canons',
  'young',
  'authors',
  'composers',
  'tunes',
  'metrical',
];

/** The indexes a check reads beside the one mutated: the two tune indexes, the two Scripture ones. */
const PARTNERS: Partial<Record<IndexName, ReadonlyArray<IndexName>>> = {
  tunes: ['metrical'],
  metrical: ['tunes'],
  scriptural: ['scriptural-by-hymn'],
  'scriptural-by-hymn': ['scriptural'],
};

const DIR = join(import.meta.dir, '../data/indexes');
const texts = Object.fromEntries(
  NAMES.map((n) => [n, readFileSync(join(DIR, `${n}.json`), 'utf8')]),
) as Record<IndexName, string>;
const rulingsText = readFileSync(join(DIR, 'rulings.json'), 'utf8');
const ctx = loadContext();
const decoded = decodeIndexes(texts);
const rulings = decodeRulings(rulingsText);

const keyOf = (p: Problem) => `${p.index}|${p.page}|${p.at}|${p.check}|${p.value}`;
/** What the CLI prints of `problems` once the rulings settle them; a ruling a subset leaves stale is not the mutant's. */
const openOf = (problems: ReadonlyArray<Problem>) =>
  settle(problems, rulings.rulings).open.filter((p) => p.check !== 'rulings');

const list = (x: Value) => (Array.isArray(x) ? x : []) as Array<Json>;
const num = (x: Value) => x as number;
const str = (x: Value) => x as string;

/** One number an index prints, in `itemsOf` order: the row holding it, its key, and the list the row sits in. */
interface Slot {
  readonly row: Json;
  readonly key: string;
  readonly list: Array<Json>;
  readonly idx: number;
  readonly kind: 'hymn' | 'reading';
}

const each = (x: Value, key: string, kind: Slot['kind']): Array<Slot> => {
  const rows = list(x);
  return rows.map((row, idx) => ({ row, key, list: rows, idx, kind }));
};

const SLOTS: Record<IndexName, (f: Json) => Array<Slot>> = {
  topical: (f) =>
    list(f.topics).flatMap((t) => [
      ...each(t.hymns, 'number', 'hymn'),
      ...each(t.readings, 'number', 'reading'),
    ]),
  'worship-aids': (f) => each(f.entries, 'reading', 'reading'),
  scriptural: (f) => each(f.entries, 'hymn', 'hymn'),
  'scriptural-by-hymn': (f) => [...each(f.entries, 'hymn', 'hymn'), ...each(f.see, 'hymn', 'hymn')],
  sentences: (f) => list(f.groups).flatMap((g) => each(g.hymns, 'number', 'hymn')),
  canons: (f) => list(f.groups).flatMap((g) => each(g.hymns, 'number', 'hymn')),
  young: (f) => each(f.hymns, 'number', 'hymn'),
  authors: (f) => list(f.people).flatMap((p) => each(p.hymns, 'number', 'hymn')),
  composers: (f) => list(f.people).flatMap((p) => each(p.hymns, 'number', 'hymn')),
  tunes: (f) => list(f.tunes).flatMap((t) => each(t.hymns, 'number', 'hymn')),
  metrical: (f) =>
    list(f.metres).flatMap((m) => list(m.tunes).flatMap((t) => each(t.hymns, 'number', 'hymn'))),
};

/** Each index's items as committed: slot `i` prints at `places[name][i]`. */
const places = Object.fromEntries(NAMES.map((n) => [n, itemsOf(decoded.indexes, n)])) as Record<
  IndexName,
  ReturnType<typeof itemsOf>
>;

/** The index decoded from `text`, checked beside its committed partners: the problems the CLI prints. */
const checked = (name: IndexName, text: string): Array<Problem> => {
  const d = decodeIndexes({ [name]: text });
  const ix: Indexes = {
    ...Object.fromEntries((PARTNERS[name] ?? []).map((p) => [p, decoded.indexes[p]])),
    ...d.indexes,
  };
  return openOf([...d.problems, ...checkIndexes(ix, ctx)]);
};

const baseline: ReadonlyMap<IndexName, ReadonlySet<string>> = new Map(
  NAMES.map((n) => [n, new Set(checked(n, texts[n]).map(keyOf))]),
);

const fresh = (name: IndexName) => JSON.parse(texts[name]) as Json;

/** The problems a mutated file prints that the committed one does not. */
const after = (name: IndexName, file: Json) =>
  checked(name, JSON.stringify(file)).filter((p) => !baseline.get(name)?.has(keyOf(p)));

/** Whether slot `i` of `name` has one of `found` printed at its place. */
const caughtAt = (name: IndexName, found: ReadonlyArray<Problem>) => {
  const where = new Set(found.map((p) => `${p.page}|${p.at}`));
  return (i: number) => {
    const it = places[name][i];
    return it !== undefined && where.has(`${it.page}|${it.at}`);
  };
};

interface Count {
  readonly mutation: string;
  readonly index: IndexName;
  readonly applied: number;
  readonly caught: number;
  readonly blind?: number;
}

const counts: Array<Count> = [];

const report = (rows: ReadonlyArray<Count>) => {
  for (const r of rows) {
    counts.push(r);
    console.log(
      `mutation ${r.mutation} ${r.index}: applied ${r.applied} caught ${r.caught}${r.blind === undefined ? '' : ` blind ${r.blind}`}`,
    );
  }
  expect(rows.reduce((n, r) => n + r.applied, 0)).toBeGreaterThan(0);
  expect(rows.filter((r) => r.caught + (r.blind ?? 0) !== r.applied)).toEqual([]);
};

/**
 * Sets each mutation's `value` at every slot its `pick` takes, all in one batch (the picks take
 * disjoint slots); each must print a range problem at its place. A mutation no slot takes is left out.
 */
const rangeBatch = (
  name: IndexName,
  mutations: ReadonlyArray<{
    readonly mutation: string;
    readonly value: number;
    readonly pick: (s: Slot) => boolean;
  }>,
): Array<Count> => {
  const file = fresh(name);
  const slots = SLOTS[name](file);
  const hits = mutations.map(({ value, pick }) =>
    slots.flatMap((s, i) => {
      if (!pick(s)) return [];
      s.row[s.key] = value;
      return [i];
    }),
  );
  const found = after(name, file).filter((p) => p.check === 'range' && p.index === name);
  const caught = caughtAt(name, found);
  return mutations.flatMap(({ mutation }, k) => {
    const hit = hits[k] ?? [];
    return hit.length === 0
      ? []
      : [{ mutation, index: name, applied: hit.length, caught: hit.filter(caught).length }];
  });
};

// ---------------------------------------------------------------- Scripture

const SCRIPTURE: ReadonlyArray<IndexName> = ['scriptural', 'scriptural-by-hymn', 'worship-aids'];

const lastChapters = new Map<number, number>();
const lastChapter = (book: number): number | undefined => {
  if (ctx.lastVerse(book, 1) === undefined) return undefined;
  let c = lastChapters.get(book);
  if (c === undefined) {
    c = 1;
    while (ctx.lastVerse(book, c + 1) !== undefined) c++;
    lastChapters.set(book, c);
  }
  return c;
};

const order2 = (a: ReadonlyArray<number>, b: ReadonlyArray<number>) => {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
};

/** Applies `mutate` to every entry's passage of a Scripture index; each it changes must print a scripture problem at its place. */
const passageBatch = (name: IndexName, mutation: string, mutate: (p: Json) => boolean) => {
  const file = fresh(name);
  const hit = list(file.entries).flatMap((e, i) => (mutate(e.passage as Json) ? [i] : []));
  const found = after(name, file).filter((p) => p.check === 'scripture' && p.index === name);
  return {
    mutation,
    index: name,
    applied: hit.length,
    caught: hit.filter(caughtAt(name, found)).length,
  };
};

const versePastLast = (p: Json): boolean => {
  const book = num(p.book);
  if ('verses' in p) {
    const last = ctx.lastVerse(book, num(p.chapter));
    const piece = list(p.verses).at(-1);
    if (last === undefined || piece === undefined) return false;
    piece.to = last + 1;
    return true;
  }
  const to = p.to as Json;
  const last = ctx.lastVerse(book, num(to.chapter));
  if (last === undefined) return false;
  to.verse = last + 1;
  return true;
};

const chapterPastLast = (p: Json): boolean => {
  const last = lastChapter(num(p.book));
  if (last === undefined) return false;
  if ('verses' in p) p.chapter = last + 1;
  else (p.to as Json).chapter = last + 1;
  return true;
};

const backwards = (p: Json): boolean => {
  if ('verses' in p) {
    const piece = list(p.verses).find((v) => num(v.from) < num(v.to));
    if (piece === undefined) return false;
    [piece.from, piece.to] = [piece.to, piece.from];
    return true;
  }
  const [from, to] = [p.from as Json, p.to as Json];
  if (order2([num(from.chapter), num(from.verse)], [num(to.chapter), num(to.verse)]) >= 0)
    return false;
  [p.from, p.to] = [to, from];
  return true;
};

// ---------------------------------------------------------------- stanzas

/** The letter one past hymn `n`'s stanzas, when the hymn is compiled and that letter is not `r` (the refrain) or past `z`. */
const pastLast = (n: number): string | undefined => {
  const h = ctx.hymn(n);
  if (h === undefined || h.stanzas >= 26 || h.stanzas + 1 === 18) return undefined;
  return String.fromCharCode(97 + h.stanzas);
};

const stanzaBatch = (name: IndexName) => {
  const file = fresh(name);
  const rows =
    name === 'sentences'
      ? list(file.groups).flatMap((g) => list(g.hymns))
      : list(file.entries).map((e) => e);
  // A place whose letters already hold the one past the last is skipped: the
  // book prints it there, a ruling settles that exact value, and setting it
  // again adds no past-last letter (scriptural 39, by-hymn 31, sentences 2).
  const hit = rows.flatMap((r, i) => {
    const letter = pastLast(num(name === 'sentences' ? r.number : r.hymn));
    if (letter === undefined) return [];
    if (name === 'sentences') {
      const letters = list(r.stanzas) as unknown as Array<string>;
      const k = letters.findIndex((l) => l !== 'r');
      if (k < 0 || letters.includes(letter)) return [];
      letters[k] = letter;
      return [i];
    }
    if (r.stanza === undefined || r.stanza === 'r' || r.stanza === letter) return [];
    r.stanza = letter;
    return [i];
  });
  const found = after(name, file).filter((p) => p.check === 'stanza' && p.index === name);
  return {
    mutation: 'stanza-past-last',
    index: name,
    applied: hit.length,
    caught: hit.filter(caughtAt(name, found)).length,
  };
};

// ---------------------------------------------------------------- order

/** Neighbouring pairs `before` holds strictly ordered, none within two rows of the last one taken. */
const strictPairs = <R>(rows: ReadonlyArray<R>, before: (a: R, b: R) => boolean) => {
  const out: Array<number> = [];
  for (let i = 0; i + 1 < rows.length; i++) {
    const [a, b] = [rows[i], rows[i + 1]];
    const last = out.at(-1);
    if (a !== undefined && b !== undefined && (last === undefined || i >= last + 3) && before(a, b))
      out.push(i);
  }
  return out;
};

/** Swaps two entries' content and keeps each row's page, so every printed place stays put. */
const swapContent = (a: Json, b: Json) => {
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (k === 'page') continue;
    const [x, y] = [a[k], b[k]];
    if (y === undefined) delete a[k];
    else a[k] = y;
    if (x === undefined) delete b[k];
    else b[k] = x;
  }
};

const orderBatch = (name: IndexName, mutate: (file: Json) => ReadonlyArray<Problem['value']>) => {
  const file = fresh(name);
  const expected = mutate(file);
  const found = new Set(
    after(name, file)
      .filter((p) => p.check === 'order' && p.index === name)
      .map((p) => `${p.at}|${p.value}`),
  );
  return {
    mutation: 'order-swap',
    index: name,
    applied: expected.length,
    caught: expected.filter((v) =>
      v.includes('|') ? found.has(v) : [...found].some((f) => f.endsWith(`|${v}`)),
    ).length,
  };
};

const scriptureSwap = (name: 'scriptural' | 'worship-aids') => (file: Json) => {
  const n = name === 'scriptural' ? 'hymn' : 'reading';
  const entries = list(file.entries);
  const text = (e: Json) => passageText(e.passage as Passage, String);
  const keyOf3 = (e: Json) => {
    const p = e.passage as Json;
    return 'verses' in p
      ? [num(p.book), num(p.chapter), num(list(p.verses)[0]?.from ?? 0)]
      : [num(p.book), num((p.from as Json).chapter), num((p.from as Json).verse)];
  };
  return strictPairs(entries, (a, b) =>
    text(a) === text(b) ? num(a[n]) < num(b[n]) : order2(keyOf3(a), keyOf3(b)) < 0,
  ).map((i) => {
    const [a, b] = [entries[i] as Json, entries[i + 1] as Json];
    const value = `${passageText(b.passage as Passage, ctx.bookName)} ${num(b[n])} > ${passageText(a.passage as Passage, ctx.bookName)} ${num(a[n])}`;
    swapContent(a, b);
    return value;
  });
};

const byHymnSwap = (file: Json) => {
  const entries = list(file.entries);
  return strictPairs(entries, (a, b) => num(a.hymn) < num(b.hymn)).map((i) => {
    const [a, b] = [entries[i] as Json, entries[i + 1] as Json];
    const value = `${num(b.hymn)} > ${num(a.hymn)}`;
    swapContent(a, b);
    return value;
  });
};

/** Swaps whole named rows (a tune, a person) of one list, both main names, so each pair prints reversed. */
const nameSwap = (rows: Array<Json>) =>
  strictPairs(
    rows,
    (a, b) =>
      a.alias === undefined && b.alias === undefined && sortKey(str(a.name)) < sortKey(str(b.name)),
  ).map((i) => {
    const [a, b] = [rows[i] as Json, rows[i + 1] as Json];
    rows[i] = b;
    rows[i + 1] = a;
    return `${str(b.name)} > ${str(a.name)}`;
  });

const topicalSwap = (file: Json) =>
  list(file.topics).flatMap((t) => {
    const path = t.parent === undefined ? str(t.name) : `${str(t.parent)}: ${str(t.name)}`;
    const hymns = list(t.hymns);
    const title = (h: Json) => ctx.hymn(num(h.number))?.title;
    return (
      strictPairs(hymns, (a, b) => {
        const [x, y] = [title(a), title(b)];
        return x !== undefined && y !== undefined && sortKey(x) < sortKey(y);
      })
        // A topic the book lists one hymn twice in (NEW YEAR, p785) can hold the pair's second
        // hymn just before its first. The swap then repeats that hymn before the first, so the
        // check prints the same step at the same place as the page does, which a ruling settles:
        // the swap makes no new order error.
        .filter((i) => hymns[i - 1]?.number !== hymns[i + 1]?.number)
        .map((i) => {
          const [a, b] = [hymns[i] as Json, hymns[i + 1] as Json];
          [a.number, b.number] = [b.number, a.number];
          return `topic ${path} ${num(b.number)}|${num(a.number)} > ${num(b.number)}`;
        })
    );
  });

// ---------------------------------------------------------------- sections

/** The topics a section is listed under, as the sections check finds them. */
const sectionTopics = (topics: ReadonlyArray<Json>, section: { readonly name: string }) => {
  const find = (parent: string | undefined, name: string) =>
    topics.filter(
      (t) =>
        fold(str(t.name)) === fold(name) &&
        (parent === undefined || fold(str(t.parent ?? '')) === fold(parent)),
    );
  const named = SECTION_TOPICS.get(fold(section.name));
  const found = named
    ? named.flatMap((path) => {
        const [target] = seeTargets(path);
        return target ? find(target.parent, target.name) : [];
      })
    : find(undefined, section.name);
  return found.flatMap((t) =>
    list(t.hymns).length === 0 && list(t.readings).length === 0
      ? (t.see as Array<string>).flatMap((s) =>
          seeTargets(s).flatMap((x) => find(x.parent, x.name)),
        )
      : [t],
  );
};

// ---------------------------------------------------------------- tunes

/** Splits `pairs` into batches that hold each hymn number `n` once, in order. */
const oneHymnEach = <P extends { readonly n: number }>(pairs: ReadonlyArray<P>) => {
  const batches: Array<Array<P>> = [];
  for (const p of pairs) {
    const batch = batches.find((b) => !b.some((q) => q.n === p.n));
    if (batch) batch.push(p);
    else batches.push([p]);
  }
  return batches;
};

/** Drops each (tune, hymn) pair of a tune index, in batches that hold each hymn number once; a row left with no hymn goes too. */
const tuneDrops = (name: 'tunes' | 'metrical') => {
  const tunesOf = (f: Json) =>
    name === 'tunes' ? list(f.tunes) : list(f.metres).flatMap((m) => list(m.tunes));
  const pairs = tunesOf(fresh(name)).flatMap((t, ti) =>
    list(t.hymns).map((h, hi) => ({
      ti,
      hi,
      n: num(h.number),
      page: num(h.page),
      name: str(t.name),
    })),
  );
  const batches = oneHymnEach(pairs);
  let [byCheck, printed, titled] = [0, 0, 0];
  for (const batch of batches) {
    const file = fresh(name);
    const tunes = tunesOf(file);
    const drop = new Set(batch.map((p) => list(tunes[p.ti]?.hymns)[p.hi]));
    for (const t of tunes) t.hymns = list(t.hymns).filter((h) => !drop.has(h));
    if (name === 'tunes') file.tunes = list(file.tunes).filter((t) => list(t.hymns).length > 0);
    else
      file.metres = list(file.metres)
        .map((m) => ({ ...m, tunes: list(m.tunes).filter((t) => list(t.hymns).length > 0) }))
        .filter((m) => m.tunes.length > 0);
    const found = after(name, file);
    for (const p of batch) {
      const mine = found.some(
        (f) =>
          (f.check === 'tunes' || f.check === 'coverage') &&
          (f.value.endsWith(` ${p.n}`) || f.at === `hymn ${p.n}`),
      );
      if (mine) byCheck++;
      if (mine || found.some((f) => f.check === 'pages' && f.index === name && f.page === p.page))
        printed++;
      if (titledTune(p.name, p.n, ctx)) titled++;
    }
  }
  console.log(
    `tune pairs dropped from ${name}: ${pairs.length} in ${batches.length} batches; by the tune and coverage checks ${byCheck}; titled ${titled}`,
  );
  return { mutation: 'tune-pair-drop', index: name, applied: pairs.length, caught: printed };
};

// ---------------------------------------------------------------- the cases

describe('the committed indexes', () => {
  it('print no problem once decoded, checked and settled by their rulings, as the CLI runs them', () => {
    const open = settle(
      [...decoded.problems, ...rulings.problems, ...checkIndexes(decoded.indexes, ctx)],
      rulings.rulings,
    ).open;
    console.log(`committed: problems ${open.length}, rulings ${rulings.rulings.length}`);
    expect(open.length).toBe(0);
    for (const n of NAMES)
      expect(SLOTS[n](fresh(n)).map((s) => num(s.row[s.key]))).toEqual(
        places[n].map((it) => it.number),
      );
  });

  it('decode no index with a number set to 0', () => {
    report(
      NAMES.map((name) => {
        const file = fresh(name);
        const slots = SLOTS[name](file);
        for (const s of slots) s.row[s.key] = 0;
        const d = decodeIndexes({ [name]: JSON.stringify(file) });
        return {
          mutation: 'zero',
          index: name,
          applied: slots.length,
          caught: d.problems.some((p) => p.index === name && p.check === 'decode')
            ? slots.length
            : 0,
        };
      }),
    );
  });

  it('print a range problem at each hymn set to 696 or 921 and each reading set to 695 or 921', () => {
    report(
      NAMES.flatMap((name) => [
        ...rangeBatch(name, [
          { mutation: 'hymn-696', value: 696, pick: (s) => s.kind === 'hymn' },
          { mutation: 'reading-695', value: 695, pick: (s) => s.kind === 'reading' },
        ]),
        ...rangeBatch(name, [{ mutation: 'any-921', value: 921, pick: () => true }]),
      ]),
    );
  });

  it('print a scripture problem at each passage given a verse or chapter past its last, or a range run backwards', () => {
    report(
      SCRIPTURE.flatMap((name) => [
        passageBatch(name, 'verse-past-last', versePastLast),
        passageBatch(name, 'chapter-past-last', chapterPastLast),
        passageBatch(name, 'backwards', backwards),
      ]),
    );
  });

  it("print a stanza problem at each stanza letter set one past its hymn's stanzas", () => {
    report((['scriptural', 'scriptural-by-hymn', 'sentences'] as const).map(stanzaBatch));
  });

  it('print an order problem for each neighbouring pair with different sort keys swapped', () => {
    report([
      orderBatch('scriptural', scriptureSwap('scriptural')),
      orderBatch('worship-aids', scriptureSwap('worship-aids')),
      orderBatch('scriptural-by-hymn', byHymnSwap),
      orderBatch('tunes', (f) => nameSwap(list(f.tunes))),
      orderBatch('authors', (f) => nameSwap(list(f.people))),
      orderBatch('composers', (f) => nameSwap(list(f.people))),
      orderBatch('metrical', (f) => list(f.metres).flatMap((m) => nameSwap(list(m.tunes)))),
      orderBatch('topical', topicalSwap),
    ]);
  });

  it('print a sections problem for one hymn dropped from each section a topic holds', () => {
    const file = fresh('topical');
    const topics = list(file.topics);
    // A section no topic holds is one C6 prints `no topic lists section` for: each must be
    // a ruled one, so that no section leaves C6 unseen.
    const held = ctx.sections.filter((s) => sectionTopics(topics, s).length > 0);
    const unheld = ctx.sections.filter((s) => !held.includes(s));
    for (const s of unheld)
      expect(
        rulings.rulings.some(
          (r) => r.check === 'sections' && r.at === `section ${s.name}` && r.value === s.name,
        ),
      ).toBe(true);
    const dropped = held.flatMap((section) => {
      const under = sectionTopics(topics, section);
      const numbers = (t: Json) =>
        [...list(t.hymns), ...list(t.readings)].map((h) => num(h.number));
      const listed = new Set(under.flatMap(numbers));
      const mid = (section.first + section.last) / 2;
      const n = [...listed]
        .filter(
          (x) =>
            x >= section.first &&
            x <= section.last &&
            under.every((t) => numbers(t).filter((y) => y !== x).length > 0),
        )
        .sort((a, b) => Math.abs(a - mid) - Math.abs(b - mid))[0];
      if (n === undefined) return [];
      for (const t of under) {
        t.hymns = list(t.hymns).filter((h) => num(h.number) !== n);
        t.readings = list(t.readings).filter((h) => num(h.number) !== n);
      }
      return [{ name: section.name, n }];
    });
    const found = after('topical', file).filter((p) => p.check === 'sections');
    console.log(
      `sections: ${ctx.sections.length} held ${held.length} ruled without a topic ${unheld.length}`,
    );
    report([
      {
        mutation: 'section-drop',
        index: 'topical',
        applied: dropped.length,
        caught: dropped.filter((d) =>
          found.some((p) => p.at === `section ${d.name}` && p.value === `${d.n}`),
        ).length,
      },
    ]);
    expect(dropped.map((d) => d.name)).toEqual(held.map((s) => s.name));
  });

  it('print a problem for each (tune, hymn) pair dropped from either tune index', () => {
    report([tuneDrops('tunes'), tuneDrops('metrical')]);
  });

  it('print a pages problem for one entry dropped from each page', () => {
    report(
      NAMES.map((name) => {
        const file = fresh(name);
        const slots = SLOTS[name](file);
        const pages = list(file.pages);
        const ruled = (page: number) =>
          rulings.rulings.some((r) => r.index === name && r.check === 'pages' && r.page === page);
        const picks = pages.flatMap((pg) => {
          const s = slots.find((x) => num(x.row.page) === num(pg.page) && x.list.length > 1);
          return s ? [{ s, page: num(pg.page) }] : [];
        });
        for (const { s } of [...picks].sort((a, b) => b.s.idx - a.s.idx)) s.list.splice(s.idx, 1);
        const found = after(name, file).filter((p) => p.check === 'pages' && p.index === name);
        const caught = picks.filter((p) => found.some((f) => f.page === p.page)).length;
        const blind = picks.filter((p) => ruled(p.page) && !found.some((f) => f.page === p.page));
        console.log(`pages ${name}: ${pages.length}, with an entry to drop ${picks.length}`);
        return {
          mutation: 'page-entry-drop',
          index: name,
          applied: picks.length,
          caught,
          blind: blind.length,
        };
      }),
    );
  });
});
