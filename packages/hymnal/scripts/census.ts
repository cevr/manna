import { HymnId } from '@manna/core/hymnal';
import { SourceHymnal, layerSourceText } from './source-text.js';
import * as BunServices from '@effect/platform-bun/BunServices';
import { Database } from 'bun:sqlite';
import { Effect, FileSystem, Layer, Option, Predicate, Schema, Struct } from 'effect';
import { createHash } from 'node:crypto';
import path from 'node:path';

import { Order } from '../src/hymn.js';
import { counts } from '../src/syllables.js';
import { decodeOrders } from './sources.js';

const DATA = path.resolve(import.meta.dir, '../data');
export const FIRST = 1;
export const LAST = 695;

export const PRIOR_FIXES: ReadonlySet<number> = new Set([138, 203, 220, 438, 593, 620, 628]);

const pad = (n: number) => String(n).padStart(3, '0');

export const wordsOf = (text: string) =>
  text
    .toLowerCase()
    .replace(/['’`ʼ]/g, '')
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word !== '');

export const printedOf = (crops: ReadonlyArray<{ readonly shows: string }>) =>
  crops
    .map((one) => one.shows.trim())
    .filter((shows) => shows !== '')
    .join(' ')
    .replace(/-\s+/g, '');

const same = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((word, i) => word === b[i]);

export type Verses = ReadonlyArray<{ readonly id: number; readonly text: string }>;

export const unitLinesOf = (verses: Verses): string[][] => {
  const lines = (text: string) =>
    text
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line !== '');
  const refrain = verses.filter((verse) => verse.id < 0).flatMap((verse) => lines(verse.text));
  return verses
    .filter((verse) => verse.id >= 0)
    .toSorted((a, b) => a.id - b.id)
    .map((verse) => [...lines(verse.text), ...refrain]);
};

export const unitsOf = (verses: Verses): string[][] =>
  unitLinesOf(verses).map((lines) => wordsOf(lines.join('\n')));

export const baseDigestOf = (units: ReadonlyArray<readonly string[]>) =>
  createHash('sha256').update(JSON.stringify(units)).digest('hex').slice(0, 16);

export interface Reading {
  readonly number: number;
  readonly images: readonly string[];
  readonly stanzas: readonly string[];
  readonly refrain?: string | null | undefined;
  readonly refrainRows?: readonly string[] | null | undefined;
  readonly odd?: string | null | undefined;
  readonly by?: 'reader' | 'ocr' | undefined;
}

export const readingUnitsOf = (reading: Reading): string[][] => {
  const refrain = wordsOf(reading.refrain ?? '');
  const rows = (reading.refrainRows ?? []).map(wordsOf);
  const first = rows[0] ?? [];
  const at = first.length === 0 ? -1 : indexOfRun(refrain, first);
  return reading.stanzas.map((stanza, i) => {
    const own = rows[i];
    const sung =
      own === undefined
        ? refrain
        : at >= 0
          ? [...refrain.slice(0, at), ...own, ...refrain.slice(at + first.length)]
          : [...refrain, ...own];
    return [...wordsOf(stanza), ...sung];
  });
};

const indexOfRun = (words: readonly string[], run: readonly string[]) => {
  for (let i = 0; i + run.length <= words.length; i++)
    if (run.every((word, k) => words[i + k] === word)) return i;
  return -1;
};

const lcsTable = (a: readonly string[], b: readonly string[]) => {
  const rows = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  const at = (i: number, j: number) => rows[i]?.[j] ?? 0;
  for (let i = a.length - 1; i >= 0; i--) {
    const row = rows[i] ?? [];
    for (let j = b.length - 1; j >= 0; j--)
      row[j] = a[i] === b[j] ? at(i + 1, j + 1) + 1 : Math.max(at(i + 1, j), at(i, j + 1));
  }
  return at;
};

const diffRuns = (a: readonly string[], b: readonly string[]) => {
  const at = lcsTable(a, b);
  const runs: Array<{ at: number; row: string[]; page: string[] }> = [];
  let open: { at: number; row: string[]; page: string[] } | undefined;
  let [i, j] = [0, 0];
  const take = (side: 'row' | 'page', word: string) => {
    open ??= { at: i, row: [], page: [] };
    open[side].push(word);
  };
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      if (open !== undefined) runs.push(open);
      open = undefined;
      i++;
      j++;
    } else if (j >= b.length || (i < a.length && at(i + 1, j) >= at(i, j + 1))) {
      take('row', a[i] ?? '');
      i++;
    } else take('page', b[j++] ?? '');
  }
  if (open !== undefined) runs.push(open);
  return runs;
};

export interface Run {
  readonly unit: number;
  readonly at: number;
  readonly row: readonly string[];
  readonly page: readonly string[];
}

export const runsBetween = (
  base: ReadonlyArray<readonly string[]>,
  other: ReadonlyArray<readonly string[]>,
): Run[] => {
  const runs: Run[] = [];
  for (let u = 0; u < Math.max(base.length, other.length); u++)
    for (const run of diffRuns(base[u] ?? [], other[u] ?? []))
      if (run.row.join('') !== run.page.join('')) runs.push({ unit: u + 1, ...run });
  return runs;
};

export const wordTag = (words: readonly string[]) =>
  words.length === 0
    ? '[0 words]'
    : `[${words.length} word${words.length === 1 ? '' : 's'} #${createHash('sha256').update(words.join(' ')).digest('hex').slice(0, 8)}]`;

const quoted = (words: readonly string[]) => `"${words.join(' ')}"`;

const FUNCTION_WORDS: ReadonlySet<string> = new Set(
  'a an the of in on at to by for from with and or but as is be it its this that so no not'.split(
    ' ',
  ),
);

export const hymnRunsOf = (rows: ReadonlyMap<number, Verses>): ReadonlySet<string> => {
  const runs = new Set<string>();
  for (const row of rows.values())
    for (const verse of row) {
      const words = wordsOf(verse.text);
      for (let i = 0; i + 3 <= words.length; i++) {
        const run = words.slice(i, i + 3);
        if (run.filter((word) => FUNCTION_WORDS.has(word)).length < 2) runs.add(run.join(' '));
      }
    }
  return runs;
};

export const linesQuoting = (lines: readonly string[], runs: ReadonlySet<string>): string[] =>
  lines.flatMap((line, k) => {
    const words = wordsOf(line);
    for (let i = 0; i + 3 <= words.length; i++)
      if (runs.has(words.slice(i, i + 3).join(' '))) return [`line ${k + 1} word ${i + 1}`];
    return [];
  });

const closedAt = (open: readonly string[], char: string) => {
  if (char === '"') return open.lastIndexOf('"');
  if (char !== '”') return -1;
  const curly = open.lastIndexOf('“');
  return curly === -1 ? open.length - 1 : curly;
};

export const wordlessLine = (line: string) => {
  let out = '';
  let inner = '';
  const open: string[] = [];
  for (const char of line) {
    const at = closedAt(open, char);
    if (at !== -1) open.length = at;
    else if (char === '“' || char === '"') open.push(char);
    if (at === 0) {
      out += wordTag(wordsOf(inner));
      inner = '';
    } else if (open.length > 0) inner += char;
    else out += char;
  }
  return open.length > 0 ? out + wordTag(wordsOf(inner)) : out;
};

const Kind = Schema.Literals([
  'words',
  'misprint',
  'echo',
  'repeat',
  'shared',
  'layout',
  'slip',
  'assumption',
  'disputed',
  'unreadable',
  'owner',
]);

const RulingCrop = Schema.Struct({
  image: Schema.String,
  crop: Schema.String,
  box: Schema.Tuple([Schema.Int, Schema.Int, Schema.Int, Schema.Int]),
  sha: Schema.String,
  shows: Schema.String,
});

const Ruling = Schema.Struct({
  sites: Schema.Array(Schema.Struct({ unit: Schema.Int, at: Schema.Int })),
  row: Schema.String,
  readings: Schema.Array(Schema.String),
  printed: Schema.String,
  sung: Schema.String,
  kind: Kind,
  crops: Schema.Array(RulingCrop),
  judge: Schema.String,
  why: Schema.String,
  settles: Schema.optionalKey(Schema.Array(Schema.String)),
  unreachable: Schema.optionalKey(Schema.Array(Schema.String)),
  gaps: Schema.optionalKey(Schema.Array(Schema.String)),
  layout: Schema.optionalKey(Schema.String),
  answer: Schema.optionalKey(
    Schema.Struct({
      by: Schema.Literal('owner'),
      on: Schema.String,
      keeps: Schema.Literals(['page', 'source']),
      quote: Schema.String,
    }),
  ),
});
export type Ruling = typeof Ruling.Type;

const awaitsOwner = (ruling: Ruling) => ruling.kind === 'disputed' && ruling.answer === undefined;

const keepsPage = (ruling: Ruling) => ruling.kind === 'disputed' && ruling.answer?.keeps === 'page';

const RulingsFile = Schema.Struct({ number: Schema.Int, rulings: Schema.Array(Ruling) });
const decodeRulings = Schema.decodeEffect(Schema.fromJsonString(RulingsFile));

const changes = (ruling: Ruling) =>
  ruling.kind !== 'unreadable' &&
  !same(wordsOf(ruling.sung), ruling.row.split(' ').filter(Boolean));

export interface Span {
  readonly ruling: Ruling;
  readonly unit: number;
  readonly start: number;
  readonly length: number;
}

export type RulingConflict =
  | {
      readonly kind: 'site';
      readonly unit: number;
      readonly at: number;
      readonly row: readonly string[];
    }
  | {
      readonly kind: 'nesting';
      readonly unit: number;
      readonly at: number;
      readonly sung: readonly string[];
      readonly inner: number;
      readonly innerSung: readonly string[];
    }
  | { readonly kind: 'twice'; readonly unit: number; readonly at: number; readonly other: number }
  | { readonly kind: 'judges'; readonly unit: number; readonly at: number; readonly other: number };

const conflictLine = {
  site: (c) => `unit ${c.unit} at ${c.at} holds no ${quoted(c.row)}`,
  nesting: (c) =>
    `unit ${c.unit} at ${c.at} is ruled ${quoted(c.sung)}, and a ruling inside it at ${c.inner} ${quoted(c.innerSung)}`,
  twice: (c) =>
    `unit ${c.unit} at ${c.at} and at ${c.other} are ruled twice, and the rulings disagree`,
  judges: (c) => `unit ${c.unit} at ${c.at} and at ${c.other} rule one stretch, by two judges`,
} satisfies {
  readonly [K in RulingConflict['kind']]: (
    conflict: Extract<RulingConflict, { kind: K }>,
  ) => string;
};

export const lineOfConflict = (conflict: RulingConflict): string =>
  (conflictLine[conflict.kind] as (c: RulingConflict) => string)(conflict);

export const applyRulings = (
  base: ReadonlyArray<readonly string[]>,
  rulings: readonly Ruling[],
) => {
  const edits = editsOf(rulings);
  const count = Math.max(base.length, ...edits.map((edit) => edit.unit));
  const units = Array.from({ length: count }, (_, u) => [...(base[u] ?? [])]);
  const misplaced = siteProblems(base, edits);
  const none = { units, spans: [] as Span[], applied: [] as Ruling[] };
  if (misplaced.length > 0) return { ...none, misplaced };
  const covered = coveredOf(edits);
  const disagree = [...nestingProblems(edits), ...stretchProblems(edits)];
  if (disagree.length > 0) return { ...none, misplaced: disagree };
  const applied = appliedOf(edits, covered);
  for (const edit of applied.toSorted((a, b) => b.unit - a.unit || b.at - a.at))
    units[edit.unit - 1]?.splice(edit.at, edit.row.length, ...edit.sung);
  const spans = edits.map((edit) => spanIn(applied, covered, edit));
  while (units.length > 0 && units[units.length - 1]?.length === 0) units.pop();
  return { units, spans, misplaced, applied: rulings.filter((r) => r.kind !== 'unreadable') };
};

interface Edit {
  readonly unit: number;
  readonly at: number;
  readonly ruling: Ruling;
  readonly row: readonly string[];
  readonly sung: readonly string[];
}

const editsOf = (rulings: readonly Ruling[]): Edit[] =>
  rulings
    .filter((ruling) => ruling.kind !== 'unreadable')
    .flatMap((ruling) =>
      ruling.sites.map((site) => ({
        ...site,
        ruling,
        row: ruling.row.split(' ').filter(Boolean),
        sung: wordsOf(ruling.sung),
      })),
    );

const siteProblems = (
  base: ReadonlyArray<readonly string[]>,
  edits: readonly Edit[],
): RulingConflict[] =>
  edits
    .filter((edit) => {
      const unit = base[edit.unit - 1] ?? [];
      return !same(unit.slice(edit.at, edit.at + edit.row.length), edit.row);
    })
    .map((edit) => ({ kind: 'site', unit: edit.unit, at: edit.at, row: edit.row }));

const endOf = (edit: Edit) => edit.at + edit.row.length;

const inside = (inner: Edit, outer: Edit) =>
  inner !== outer &&
  inner.unit === outer.unit &&
  outer.row.length > inner.row.length &&
  (inner.row.length === 0
    ? outer.at < inner.at && inner.at < endOf(outer)
    : outer.at <= inner.at && endOf(inner) <= endOf(outer));

const insertedAt = (insertion: Edit, edit: Edit) =>
  edit.at <= insertion.at && insertion.at <= endOf(edit);

const touch = (a: Edit, b: Edit) => {
  if (a.unit !== b.unit) return false;
  if (a.row.length === 0) return insertedAt(a, b);
  if (b.row.length === 0) return insertedAt(b, a);
  return a.at < endOf(b) && b.at < endOf(a);
};

const coveredOf = (edits: readonly Edit[]) =>
  new Set(edits.filter((one) => edits.some((outer) => inside(one, outer))));

const alignmentOf = (a: readonly string[], b: readonly string[]) => {
  const at = lcsTable(a, b);
  const pairs: Array<readonly [number, number]> = [];
  let [i, j] = [0, 0];
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) pairs.push([i++, j++]);
    else if (at(i + 1, j) >= at(i, j + 1)) i++;
    else j++;
  }
  return pairs;
};

const sungAt = (outer: Edit, from: number, to: number) => {
  const pairs = alignmentOf(outer.row, outer.sung);
  const before = pairs.filter(([i]) => i < from).at(-1);
  const after = pairs.find(([i]) => i >= to);
  return outer.sung.slice(
    before === undefined ? 0 : before[1] + 1,
    after === undefined ? outer.sung.length : after[1],
  );
};

const agrees = (one: Edit, outer: Edit) => {
  const from = one.at - outer.at;
  return same(sungAt(outer, from, from + one.row.length), one.sung);
};

const nestingProblems = (edits: readonly Edit[]): RulingConflict[] =>
  edits.flatMap((outer) =>
    edits
      .filter((one) => inside(one, outer) && !agrees(one, outer))
      .map((one) => ({
        kind: 'nesting' as const,
        unit: outer.unit,
        at: outer.at,
        sung: outer.sung,
        inner: one.at,
        innerSung: one.sung,
      })),
  );

const keeps = (edit: Edit) => same(edit.row, edit.sung);

const pairProblem = (a: Edit, b: Edit): RulingConflict | undefined => {
  const place = { unit: a.unit, at: a.at, other: b.at };
  if (same(a.row, b.row) && a.at === b.at)
    return same(a.sung, b.sung) ? undefined : { kind: 'twice', ...place };
  if (a.ruling.judge !== b.ruling.judge && !(keeps(a) && keeps(b)))
    return { kind: 'judges', ...place };
  return a.row.length > 0 && b.row.length > 0 ? { kind: 'twice', ...place } : undefined;
};

const stretchProblems = (edits: readonly Edit[]): RulingConflict[] =>
  edits.flatMap((a, i) =>
    edits
      .slice(i + 1)
      .filter((b) => touch(a, b) && !inside(a, b) && !inside(b, a))
      .flatMap((b) => pairProblem(a, b) ?? []),
  );

const sameSite = (a: Edit, b: Edit) => a.unit === b.unit && a.at === b.at && same(a.row, b.row);

const appliedOf = (edits: readonly Edit[], covered: ReadonlySet<Edit>) =>
  edits.filter(
    (edit, i) => !covered.has(edit) && !edits.slice(0, i).some((other) => sameSite(other, edit)),
  );

const spanOf = (applied: readonly Edit[], edit: Edit): Omit<Span, 'ruling'> => {
  const shift = applied
    .filter((other) => other.unit === edit.unit && other.at < edit.at)
    .reduce((sum, other) => sum + other.sung.length - other.row.length, 0);
  return { unit: edit.unit, start: edit.at + shift, length: edit.sung.length };
};

const within = (applied: readonly Edit[], edit: Edit, outer: Edit): Omit<Span, 'ruling'> => {
  const span = spanOf(applied, outer);
  const near = edit.at - outer.at;
  if (edit.sung.length === 0)
    return { unit: span.unit, start: span.start + Math.min(near, outer.sung.length), length: 0 };
  const offsets = outer.sung
    .map((_, i) => i)
    .filter((i) => same(outer.sung.slice(i, i + edit.sung.length), edit.sung));
  const offset = offsets.toSorted((a, b) => Math.abs(a - near) - Math.abs(b - near))[0] ?? 0;
  return { unit: span.unit, start: span.start + offset, length: edit.sung.length };
};

const spanIn = (applied: readonly Edit[], covered: ReadonlySet<Edit>, edit: Edit): Span => {
  if (covered.has(edit)) {
    const outer = applied.find((one) => inside(edit, one));
    return {
      ruling: edit.ruling,
      ...(outer === undefined ? spanOf(applied, edit) : within(applied, edit, outer)),
    };
  }
  const twin = applied.includes(edit) ? edit : applied.find((one) => sameSite(one, edit));
  return { ruling: edit.ruling, ...spanOf(applied, twin ?? edit) };
};

const Images = Schema.Array(
  Schema.Struct({ file: Schema.String, hymns: Schema.Array(Schema.Int) }),
);

const Inventory = Schema.Struct({
  print: Schema.String,
  scan: Schema.Struct({
    url: Schema.String,
    pages: Schema.Int,
    withheld: Schema.Array(Schema.Int),
    copies: Schema.Array(Schema.Struct({ page: Schema.Int, of: Schema.Int })),
  }),
  sdahimages: Schema.Struct({ repo: Schema.String, commit: Schema.String, dir: Schema.String }),
  scans: Schema.Array(Schema.Struct({ page: Schema.Int, hymns: Schema.Array(Schema.Int) })),
  photos: Images,
  partial: Schema.Array(Schema.Struct({ hymn: Schema.Int, missing: Schema.String })),
  lent: Schema.Array(Schema.Struct({ hymn: Schema.Int, from: Schema.Int, why: Schema.String })),
  engravings: Schema.Array(
    Schema.Struct({
      file: Schema.String,
      hymns: Schema.Array(Schema.Int),
      revised: Schema.optionalKey(Schema.String),
    }),
  ),
});
export type Inventory = typeof Inventory.Type;
export const decodeInventory = Schema.decodeEffect(Schema.fromJsonString(Inventory));

export const scanImage = (page: number) => `p${pad(page)}.jpg`;

export const pageOfImage = (image: string) =>
  path
    .basename(image)
    .replace(/^(p\d{3})-[ab]\.jpg$/, '$1.jpg')
    .replace(/^([\w-]+)\.(?:top|bottom)\.jpg$/, '$1.jpg');

export type Source = 'photo' | 'scan' | 'sdahimages' | 'none';

export const sourceOfImage = (image: string): Exclude<Source, 'none'> =>
  /^p\d{3}\.jpg$/.test(image) ? 'scan' : image.endsWith('.png') ? 'sdahimages' : 'photo';

export interface Deciding {
  readonly source: Source;
  readonly images: readonly string[];
  readonly readable: readonly string[];
}

export const NO_PAGE: Deciding = { source: 'none', images: [], readable: [] };

const decided = new WeakMap<Inventory, ReadonlyMap<number, Deciding>>();

export const decidingOf = (inventory: Inventory): ReadonlyMap<number, Deciding> => {
  const known = decided.get(inventory);
  if (known !== undefined) return known;
  const deciding = decideAll(inventory);
  decided.set(inventory, deciding);
  return deciding;
};

const decideAll = (inventory: Inventory): ReadonlyMap<number, Deciding> => {
  const withheld = new Set([
    ...inventory.scan.withheld,
    ...inventory.scan.copies.map((copy) => copy.page),
  ]);
  const of = (images: ReadonlyArray<{ file: string; hymns: readonly number[] }>, n: number) =>
    images.filter((image) => image.hymns.includes(n)).map((image) => image.file);
  const partial = new Set(inventory.partial.map((part) => part.hymn));
  const unrevised = inventory.engravings.filter((engraving) => engraving.revised === undefined);
  const deciding = new Map<number, Deciding>();
  for (let n = FIRST; n <= LAST; n++) {
    const photos = of(inventory.photos, n);
    const scans = inventory.scans.filter((scan) => scan.hymns.includes(n)).map((s) => s.page);
    const engravings = of(unrevised, n);
    const page: Deciding =
      photos.length > 0 && !partial.has(n)
        ? { source: 'photo', images: photos, readable: photos }
        : scans.length > 0 && scans.every((p) => !withheld.has(p))
          ? {
              source: 'scan',
              images: scans.map(scanImage),
              readable: [
                ...scans.map(scanImage),
                ...inventory.scan.copies
                  .filter((copy) => scans.includes(copy.of))
                  .map((copy) => scanImage(copy.page)),
              ],
            }
          : engravings.length > 0
            ? { source: 'sdahimages', images: engravings, readable: engravings }
            : NO_PAGE;
    deciding.set(
      n,
      page.source === 'photo' || page.source === 'none' || photos.length === 0
        ? page
        : {
            source: page.source,
            images: [...photos, ...page.images],
            readable: [...photos, ...page.readable],
          },
    );
  }
  for (const lent of inventory.lent) {
    const own = deciding.get(lent.hymn);
    const lender = deciding.get(lent.from);
    if (own === undefined || lender === undefined || own.source === 'none') continue;
    deciding.set(lent.hymn, {
      source: own.source,
      images: [...own.images, ...lender.images],
      readable: [...own.readable, ...lender.readable],
    });
  }
  return deciding;
};

export const lentReadings = <R extends Reading>(
  inventory: Inventory,
  deciding: ReadonlyMap<number, Deciding>,
  readings: readonly R[],
): R[] => {
  const lent = inventory.lent.flatMap((one) => {
    const lender = deciding.get(one.from);
    if (lender === undefined) return [];
    const theirs = readings.filter(
      (r) => r.number === one.from && !isRefusal(r) && ofPage(r.images, lender),
    );
    return readings
      .filter((r) => r.number === one.hymn && !isRefusal(r))
      .flatMap((own) =>
        theirs.map((their) => ({
          ...own,
          images: [...own.images, ...their.images],
          stanzas: [...own.stanzas, ...their.stanzas.slice(own.stanzas.length)],
        })),
      );
  });
  const borrowers = new Set(inventory.lent.map((one) => one.hymn));
  return [...readings.filter((r) => !borrowers.has(r.number)), ...lent];
};

export const inventoryProblems = (
  inventory: Inventory,
  photoFiles: ReadonlySet<string>,
): string[] => [
  ...scanListProblems(inventory),
  ...bookOrderProblems(inventory),
  ...imageListProblems(inventory, photoFiles),
];

const scanListProblems = (inventory: Inventory): string[] => {
  const problems: string[] = [];
  const copies = new Set(inventory.scan.copies.map((copy) => copy.page));
  let last = 0;
  for (const scan of inventory.scans) {
    if (scan.page <= last) problems.push(`scan page ${scan.page} out of order`);
    last = scan.page;
    if (scan.hymns.length === 0 && !copies.has(scan.page))
      problems.push(`scan page ${scan.page} holds no hymn`);
  }
  const pages = inventory.scans.map((scan) => scan.page);
  const top = Math.max(...pages);
  for (let p = 1; p <= top; p++) if (!pages.includes(p)) problems.push(`scan page ${p} not listed`);
  for (const p of [...inventory.scan.withheld, ...copies])
    if (p < 1 || p > inventory.scan.pages) problems.push(`unshown page ${p} is no scan page`);
  for (const copy of inventory.scan.copies)
    if (inventory.scan.withheld.includes(copy.page) || inventory.scan.withheld.includes(copy.of))
      problems.push(`copy page ${copy.page} of ${copy.of} names a withheld page`);
  return problems;
};

const bookOrderProblems = (inventory: Inventory): string[] => {
  const problems: string[] = [];
  const copies = new Set(inventory.scan.copies.map((copy) => copy.page));
  const pagesOf = new Map<number, number[]>();
  for (const scan of inventory.scans)
    for (const n of scan.hymns) pagesOf.set(n, [...(pagesOf.get(n) ?? []), scan.page]);
  let [start, end] = [0, 0];
  for (let n = FIRST; n <= LAST; n++) {
    const all = pagesOf.get(n) ?? [];
    if (all.length === 0) {
      problems.push(`${n} is on no scan page`);
      continue;
    }
    const first = all[0] ?? 0;
    const final = all[all.length - 1] ?? 0;
    if (all.some((p, i) => i > 0 && p !== (all[i - 1] ?? 0) + 1))
      problems.push(`${n} scan pages ${all.join(',')} are not consecutive`);
    const skipped = Array.from({ length: Math.max(0, first - end - 1) }, (_, i) => end + 1 + i);
    if (n > FIRST && (first < start || final < end || skipped.some((p) => !copies.has(p))))
      problems.push(`${n} on scan pages ${first}-${final}, but ${n - 1} on ${start}-${end}`);
    [start, end] = [first, final];
  }
  for (const n of pagesOf.keys())
    if (n < FIRST || n > LAST) problems.push(`scan pages name ${n}, no hymn of the book`);
  return problems;
};

const imageListProblems = (inventory: Inventory, photoFiles: ReadonlySet<string>): string[] => {
  const problems: string[] = [];
  for (const photo of inventory.photos) {
    if (!photoFiles.has(photo.file)) problems.push(`photo ${photo.file} is not committed`);
    if (!photo.hymns.includes(Number.parseInt(photo.file, 10)))
      problems.push(`photo ${photo.file} does not show the hymn it is named for`);
  }
  for (const file of photoFiles)
    if (!inventory.photos.some((photo) => photo.file === file))
      problems.push(`photo ${file} is not in the inventory`);
  for (const part of inventory.partial)
    if (!inventory.photos.some((photo) => photo.hymns.includes(part.hymn)))
      problems.push(`partial ${part.hymn} is on no photo`);
  for (const engraving of inventory.engravings)
    if (engraving.hymns.length === 0) problems.push(`engraving ${engraving.file} names no hymn`);
  return problems;
};

export const scanStatusProblems = (inventory: Inventory, fetched: readonly string[]): string[] => {
  const withheld = new Set(inventory.scan.withheld);
  const problems: string[] = [];
  for (let p = 1; p <= inventory.scan.pages; p++) {
    const shown = fetched.includes(`p${pad(p)}.jpg`);
    const held = fetched.includes(`p${pad(p)}.withheld`);
    if (shown === held) problems.push(`scan page ${p} was not fetched`);
    else if (shown && withheld.has(p))
      problems.push(`scan page ${p} is shown, but listed withheld`);
    else if (held && !withheld.has(p))
      problems.push(`scan page ${p} is withheld, but listed shown`);
  }
  return problems;
};

const Witness = Schema.Union([
  Schema.Struct({ hunks: Schema.Int, digest: Schema.String }),
  Schema.Literal('absent'),
]);

const Entry = Schema.Struct({
  number: Schema.Int,
  row: Schema.Literals(['matches', 'fixed', 'unsettled', 'nopage']),
  source: Schema.Literals(['photo', 'scan', 'sdahimages', 'none']),
  pages: Schema.Array(Schema.String),
  readings: Schema.Struct({ reader: Schema.Int, ocr: Schema.Int }),
  rulings: Schema.Struct({ all: Schema.Int, changes: Schema.Int }),
  stanzas: Schema.Int,
  refrain: Schema.Boolean,
  base: Schema.String,
  witness: Witness,
  note: Schema.optionalKey(Schema.String),
});
export type Entry = typeof Entry.Type;

const Repo = Schema.Struct({ repo: Schema.String, commit: Schema.String });

const Census = Schema.Struct({
  print: Schema.String,
  base: Repo,
  witness: Repo,
  hymns: Schema.Array(Entry),
});
export type Census = typeof Census.Type;

export const decodeCensus = Schema.decodeEffect(Schema.fromJsonString(Census));

export const encodeCensus = (census: Census) =>
  `${JSON.stringify(Schema.encodeSync(Census)(census), null, 2)}\n`;

const Line = Schema.Struct({ text: Schema.String, from: Schema.String });
const Fix = Schema.Struct({
  number: Schema.Int,
  stanzas: Schema.Array(Schema.Array(Line)),
  refrain: Schema.optionalKey(
    Schema.Struct({
      lines: Schema.Array(
        Schema.Union([
          Line,
          Schema.Struct({
            varies: Schema.Array(
              Schema.Struct({ after: Schema.Array(Schema.Int), lines: Schema.Array(Line) }),
            ),
          }),
        ]),
      ),
    }),
  ),
  replaces: Schema.optionalKey(
    Schema.Array(Schema.Struct({ id: Schema.Int, text: Schema.String })),
  ),
});
export type Fix = typeof Fix.Type;
export const decodeFix = Schema.decodeEffect(Schema.fromJsonString(Fix));

const fixLines = (fix: Fix) => [
  ...fix.stanzas.flat(),
  ...(fix.refrain?.lines ?? []).flatMap((item) =>
    'varies' in item ? item.varies.flatMap((part) => part.lines) : [item],
  ),
];

export const fixVaries = (fix: Fix) => (fix.refrain?.lines ?? []).some((item) => 'varies' in item);

export const fixUnitLinesOf = (fix: Fix): Array<Array<typeof Line.Type>> =>
  fix.stanzas.map((stanza, i) => [
    ...stanza,
    ...(fix.refrain?.lines ?? []).flatMap((item) =>
      'varies' in item
        ? (item.varies.find((part) => part.after.includes(i + 1))?.lines ?? [])
        : [item],
    ),
  ]);

const OutlineRow = Schema.Struct({
  system: Schema.Int,
  strip: Schema.String,
  words: Schema.Int,
  first: Schema.String,
  mid: Schema.String,
  last: Schema.String,
  capitals: Schema.Array(Schema.Int),
});
type OutlineRow = typeof OutlineRow.Type;

const Outline = Schema.Struct({
  number: Schema.Int,
  reader: Schema.String,
  images: Schema.Array(Schema.String),
  systems: Schema.Int,
  metre: Schema.NullOr(Schema.String),
  stanzas: Schema.Array(
    Schema.Struct({ number: Schema.NullOr(Schema.Int), rows: Schema.Array(OutlineRow) }),
  ),
  refrain: Schema.NullOr(
    Schema.Struct({
      label: Schema.NullOr(Schema.String),
      at: Schema.Literals(['after', 'before', 'inside']),
      order: Order,
      rows: Schema.Array(
        Schema.Struct({ ...OutlineRow.fields, stanzas: Schema.Array(Schema.Int) }),
      ),
    }),
  ),
  extra: Schema.Array(Schema.Struct({ ...OutlineRow.fields, why: Schema.String })),
  odd: Schema.String,
});
export type Outline = typeof Outline.Type;

const OutlineReport = Schema.Struct(Struct.omit(Outline.fields, ['reader']));
type OutlineReport = typeof OutlineReport.Type;
const ReportFile = Schema.Struct({ hymns: Schema.Array(OutlineReport) });

const OutlinesFile = Schema.Struct({ print: Schema.String, hymns: Schema.Array(Outline) });
export const decodeOutlines = Schema.decodeEffect(Schema.fromJsonString(OutlinesFile));

const UNDER_COPYRIGHT: ReadonlySet<number> = new Set([86, 584]);

const trimNote = (text: string, n: number) =>
  text.replace(
    /(?<![\p{L}\p{N}])(['‘"“])([^'’"”]*?)(['’"”])(?![\p{L}\p{N}])/gu,
    (whole, open: string, inner: string, close: string) => {
      const words = inner
        .trim()
        .replace(/\s*-\s*/g, '-')
        .split(/\s+/);
      if (UNDER_COPYRIGHT.has(n)) return `${open}…${close}`;
      return words.length <= 2 ? whole : `${open}${words.slice(0, 2).join(' ')} …${close}`;
    },
  );

export const outlineOfReport = (report: OutlineReport, reader: string): Outline =>
  Schema.decodeSync(Outline)({
    ...report,
    reader,
    odd: trimNote(report.odd, report.number),
    extra: report.extra.map((row) => ({ ...row, why: trimNote(row.why, report.number) })),
  });

export const outlineVaries = (outline: Outline): number[][] => {
  const all = outline.stanzas.length;
  const groups = new Map<string, number[]>();
  for (const row of outline.refrain?.rows ?? []) {
    const after = [...new Set(row.stanzas)].toSorted((a, b) => a - b);
    if (after.length === 0 || after.length >= all) continue;
    groups.set(after.join(','), after);
  }
  return [...groups.values()].toSorted((a, b) => (a[0] ?? 0) - (b[0] ?? 0));
};

export interface PrintedLine {
  readonly words: readonly string[];
  readonly sentences: readonly boolean[];
  readonly indent: boolean;
}

export type RefrainItem =
  | PrintedLine
  | {
      readonly varies: ReadonlyArray<{
        readonly after: readonly number[];
        readonly lines: readonly PrintedLine[];
      }>;
    };

export interface PrintedLayout {
  readonly stanzas: ReadonlyArray<readonly PrintedLine[]>;
  readonly refrain: readonly RefrainItem[] | undefined;
  readonly order: Order | undefined;
}

const SENTENCE_END = /[.!?]["”’)]*$/u;
const QUOTE_OPEN = /^["“‘(]/u;

export const linesOf = (texts: readonly string[]): PrintedLine[] => {
  let open = true;
  return texts.map((text) => {
    const read = lineRead(text, open);
    open = read.open;
    return read.line;
  });
};

const lineReads = new Map<string, { readonly line: PrintedLine; readonly open: boolean }>();

const lineRead = (text: string, opening: boolean) => {
  const key = `${opening ? 1 : 0}${text}`;
  const known = lineReads.get(key);
  if (known !== undefined) return known;
  let open = opening;
  const [words, sentences]: [string[], boolean[]] = [[], []];
  for (const token of text.split(/\s+/u)) {
    if (token === '') continue;
    const these = wordsOf(token);
    for (const [k, word] of these.entries()) {
      words.push(word);
      sentences.push(k === 0 && (open || QUOTE_OPEN.test(token)));
    }
    if (these.length > 0 || SENTENCE_END.test(token)) open = SENTENCE_END.test(token);
  }
  const read = { line: { words, sentences, indent: /^\s/u.test(text) }, open };
  lineReads.set(key, read);
  return read;
};

const midCapital = (token: string, before: string | undefined) =>
  before !== undefined &&
  !/[.!?:;"“]$/u.test(before) &&
  !QUOTE_OPEN.test(token) &&
  /^\p{Lu}/u.test(token.replace(/^['’]/u, ''));

const textLines = (text: string) => text.split('\n').filter((line) => line.trim() !== '');

export type RefrainText =
  | string
  | {
      readonly varies: ReadonlyArray<{
        readonly after: readonly number[];
        readonly lines: readonly string[];
      }>;
    };

export interface PrintedText {
  readonly stanzas: ReadonlyArray<readonly string[]>;
  readonly refrain: readonly RefrainText[] | undefined;
  readonly order: Order | undefined;
}

export const printedTextOf = (
  row: Verses,
  fix: Fix | undefined,
  order: Order | undefined,
): PrintedText => {
  if (fix !== undefined)
    return {
      stanzas: fix.stanzas.map((lines) => lines.map((line) => line.text)),
      refrain:
        fix.refrain === undefined
          ? undefined
          : fix.refrain.lines.map((item) =>
              'varies' in item
                ? {
                    varies: item.varies.map((part) => ({
                      after: part.after,
                      lines: part.lines.map((line) => line.text),
                    })),
                  }
                : item.text,
            ),
      order,
    };
  const refrain = row
    .filter((verse) => verse.id < 0)
    .toSorted((a, b) => b.id - a.id)
    .flatMap((verse) => textLines(verse.text));
  return {
    stanzas: row
      .filter((verse) => verse.id >= 0)
      .toSorted((a, b) => a.id - b.id)
      .map((verse) => textLines(verse.text)),
    refrain: refrain.length > 0 ? refrain : undefined,
    order,
  };
};

const blocks = new WeakMap<readonly string[], readonly PrintedLine[]>();

const blockOf = (texts: readonly string[]): readonly PrintedLine[] => {
  const known = blocks.get(texts);
  if (known !== undefined) return known;
  const lines = linesOf(texts);
  blocks.set(texts, lines);
  return lines;
};

const refrains = new WeakMap<readonly RefrainText[], readonly RefrainItem[]>();

const refrainItemsOf = (items: readonly RefrainText[]): readonly RefrainItem[] => {
  const known = refrains.get(items);
  if (known !== undefined) return known;
  const shared = linesOf(items.flatMap((item) => (Predicate.isString(item) ? [item] : [])));
  let k = 0;
  const read = items.map((item): RefrainItem => {
    if (!Predicate.isString(item))
      return {
        varies: item.varies.map((part) => ({ after: part.after, lines: blockOf(part.lines) })),
      };
    k += 1;
    return shared[k - 1] ?? { words: [], sentences: [], indent: false };
  });
  refrains.set(items, read);
  return read;
};

export const readText = (text: PrintedText): PrintedLayout => ({
  stanzas: text.stanzas.map(blockOf),
  refrain: text.refrain === undefined ? undefined : refrainItemsOf(text.refrain),
  order: text.order,
});

export const layoutOf = (
  row: Verses,
  fix: Fix | undefined,
  order: Order | undefined,
): PrintedLayout => {
  const made = layouts.get(row) ?? [];
  layouts.set(row, made);
  const found = made.find((one) => one.fix === fix && one.order === order);
  if (found !== undefined) return found.layout;
  const layout = readText(printedTextOf(row, fix, order));
  made.push({ fix, order, layout });
  return layout;
};

const layouts = new WeakMap<
  Verses,
  Array<{
    readonly fix: Fix | undefined;
    readonly order: Order | undefined;
    readonly layout: PrintedLayout;
  }>
>();

export const refrainAfter = (layout: PrintedLayout, i: number): readonly PrintedLine[] =>
  (layout.refrain ?? []).flatMap((item) =>
    'varies' in item ? (item.varies.find((part) => part.after.includes(i))?.lines ?? []) : [item],
  );

const variesOf = (layout: PrintedLayout) =>
  (layout.refrain ?? []).flatMap((item) =>
    'varies' in item ? item.varies.map((part) => [...part.after].toSorted((a, b) => a - b)) : [],
  );

const sourceOrderOf = (layout: PrintedLayout): Order | undefined =>
  layout.refrain === undefined ? undefined : (layout.order ?? 'after-each');

const oneEdit = (a: string, b: string) => {
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  if (long.length - short.length > 1) return false;
  let i = 0;
  while (i < short.length && short[i] === long[i]) i++;
  return short.length === long.length
    ? short.slice(i + 1) === long.slice(i + 1)
    : short.slice(i) === long.slice(i + 1);
};

const spellsAt = (text: Text, anchor: Anchor, at: number, near: boolean): number | undefined => {
  const n = anchor.words.length;
  for (const length of [n, n + 1, n - 1])
    if (
      length >= 1 &&
      at >= 0 &&
      at + length <= text.words.length &&
      spellsOver(text, anchor, at, length, near)
    )
      return length;
  return undefined;
};

const spellsOver = (text: Text, anchor: Anchor, at: number, length: number, near: boolean) => {
  const { words, joined, off } = text;
  const want = anchor.joined;
  const [head, tail] = [words[at]?.length ?? 0, words[at + length - 1]?.length ?? 0];
  const spare = (off[at + length] ?? 0) - (off[at] ?? 0) - want.length;
  if (spare < -1 || (spare > 1 && spare >= head && spare >= tail)) return false;
  const [from, to] = [off[at] ?? 0, off[at + length] ?? 0];
  if (spare >= 0 && spellsWhole(joined, want, from, to, spare < head, spare < tail)) return true;
  return near && want.length >= 4 && spare <= 1 && oneEdit(joined.slice(from, to), want);
};

const spellsWhole = (
  joined: string,
  want: string,
  from: number,
  to: number,
  head: boolean,
  tail: boolean,
) =>
  (to - from === want.length && joined.startsWith(want, from)) ||
  (head && joined.startsWith(want, to - want.length)) ||
  (tail && joined.startsWith(want, from));

interface Text {
  readonly words: readonly string[];
  readonly joined: string;
  readonly off: readonly number[];
}

export const textOf = (words: readonly string[]): Text => {
  const off = [0];
  for (const word of words) off.push((off.at(-1) ?? 0) + word.length);
  return { words, joined: words.join(''), off };
};

interface Anchor {
  readonly words: readonly string[];
  readonly joined: string;
}

const anchorOf = (text: string): Anchor => {
  const words = wordsOf(text);
  return { words, joined: words.join('') };
};

const anchors = new WeakMap<OutlineRow, { first: Anchor; mid: Anchor; last: Anchor }>();

const anchorsOf = (row: OutlineRow) => {
  const known = anchors.get(row);
  if (known !== undefined) return known;
  const found = { first: anchorOf(row.first), mid: anchorOf(row.mid), last: anchorOf(row.last) };
  anchors.set(row, found);
  return found;
};

const SLACK = 1;

const placesOf = (text: Text, anchor: Anchor, lo: number, hi: number, end: boolean): number[] => {
  const n = anchor.words.length;
  if (n === 0) return [];
  for (const near of [false, true]) {
    const found: number[] = [];
    for (let at = Math.max(0, end ? lo - n - 1 : lo); at <= hi && at < text.words.length; at++) {
      const length = spellsAt(text, anchor, at, near);
      if (length === undefined) continue;
      const place = end ? at + length : at;
      if (place >= lo && place <= hi && !found.includes(place)) found.push(place);
    }
    if (found.length > 0) return found;
  }
  return [];
};

const NONE = -1;
const TWO = -2;

const oneOf = (places: readonly number[], want: number): number =>
  places.includes(want)
    ? want
    : places.length === 1
      ? (places[0] ?? want)
      : places.length === 0
        ? NONE
        : TWO;

const seek = (
  text: Text,
  anchor: Anchor,
  want: number,
  [lo, hi]: readonly [number, number],
  end: boolean,
  slack = SLACK,
) => {
  const near = oneOf(placesOf(text, anchor, Math.max(lo, want - slack), want + slack, end), want);
  return near === NONE ? oneOf(placesOf(text, anchor, lo, hi, end), want) : near;
};

const anchorLine = (what: string, anchor: Anchor, want: number, place: number, slack = SLACK) =>
  place >= 0 && Math.abs(place - want) <= slack
    ? ''
    : place >= 0
      ? `${what} ${quoted(anchor.words)} at word ${place + 1}, its count gives word ${want + 1}`
      : `${what} ${quoted(anchor.words)} at ${place === TWO ? 'two places' : 'no place'} its count gives`;

interface Placed {
  readonly start: number;
  readonly end: number;
  readonly anchored: boolean;
  readonly sure: boolean;
  readonly held: boolean;
  readonly middle: number;
  readonly middleAt: number;
}

const offsetsOf = (one: Placed, count: number, c: number): readonly number[] => {
  const slip = one.end - one.start - count;
  if (c === 1) return [0];
  const atMiddle = one.middleAt - (one.start + one.middle - 1);
  const known = one.middleAt >= 0 && (atMiddle === 0 || atMiddle === slip);
  if (!known) return [...new Set([0, slip])];
  if (c >= one.middle && c <= one.middle + 1) return [atMiddle];
  return c < one.middle ? [...new Set([0, atMiddle])] : [...new Set([atMiddle, slip])];
};

const wordPlaces = (one: Placed, count: number, c: number): readonly number[] =>
  offsetsOf(one, count, c)
    .map((off) => one.start + c - 1 + off)
    .filter((at) => one.start <= at && at < one.end);

const wordsAt = (one: Placed, count: number, at: number): readonly number[] => {
  const slip = one.end - one.start - count;
  const atMiddle = one.middleAt >= 0 ? one.middleAt - (one.start + one.middle - 1) : 0;
  return [...new Set([0, slip, atMiddle].map((off) => at - one.start + 1 - off))].filter(
    (c) => c >= 1 && c <= count && wordPlaces(one, count, c).includes(at),
  );
};

const placeRow = (text: Text, row: OutlineRow, pos: number, held: boolean) => {
  const count = Math.max(1, row.words);
  const { first, last, mid } = anchorsOf(row);
  const slack = held ? 0 : SLACK;
  const near = seek(text, first, pos, [pos, pos + count], false, slack);
  const start = near >= 0 ? near : pos;
  const opens = anchorLine('opens', first, pos, near, slack);
  const want = start + count;
  const to = seek(text, last, want, [start + 1, want + count], true);
  const end = to >= 0 ? to : want;
  const ends = anchorLine('ends', last, want, to);
  const middle = start + Math.floor(count / 2);
  const holds = oneOf(placesOf(text, mid, middle - SLACK, middle + SLACK, false), middle);
  const centre = holds >= 0 ? '' : anchorLine('holds its middle', mid, middle, holds);
  const anchored = opens === '' && ends === '';
  const placed: Placed = {
    start,
    end,
    anchored,
    sure: anchored && end - start === count,
    held: to >= 0,
    middle: Math.floor(count / 2) + 1,
    middleAt: holds >= 0 ? holds : NONE,
  };
  const reads =
    Math.max(
      pos + count + first.words.length,
      want + count + last.words.length,
      middle + SLACK + mid.words.length,
    ) + 2;
  return { placed, problems: [opens, centre, ends].filter((line) => line !== ''), reads };
};

const placeRows = function* (
  what: string,
  text: Text,
  rows: ReadonlyArray<{ readonly label: string; readonly row: OutlineRow }>,
  kept: readonly RowPlaced[],
): Generator<string, RowPlaced[]> {
  const done: RowPlaced[] = [];
  for (const one of kept) {
    done.push(one);
    yield* one.lines;
  }
  for (let k = done.length; k < rows.length; k++) {
    const { label, row } = rows[k] ?? { label: '', row: undefined };
    if (row === undefined) break;
    const before = done[k - 1];
    const one = placeRow(text, row, before?.placed.end ?? 0, before?.placed.held ?? true);
    const lines = one.problems.map((line) => `${what}: ${label} ${line}`);
    const above = rows[k - 1];
    const [a, b] = [spanOff(before?.placed, above?.row), spanOff(one.placed, row)];
    if (above !== undefined && a !== 0 && b !== 0 && Math.sign(a) !== Math.sign(b))
      lines.push(
        `${what}: ${above.label} and ${label} span ${a > 0 ? '+' : ''}${a} and ${b > 0 ? '+' : ''}${b} words against their counts`,
      );
    done.push({ placed: one.placed, lines, reads: one.reads });
    yield* lines;
  }
  return done;
};

interface RowPlaced {
  readonly placed: Placed;
  readonly lines: readonly string[];
  readonly reads: number;
}

const spanOff = (placed: Placed | undefined, row: OutlineRow | undefined) =>
  placed === undefined || row === undefined
    ? 0
    : placed.end - placed.start - Math.max(1, row.words);

const sungOf = (layout: PrintedLayout, i: number) => {
  const lines = [...(layout.stanzas[i - 1] ?? []), ...refrainAfter(layout, i)];
  const [words, opens, sentences]: [string[], number[], boolean[]] = [[], [], []];
  for (const line of lines) {
    opens.push(words.length);
    words.push(...line.words);
    sentences.push(...line.sentences);
  }
  return { words, opens, sentences, own: layout.stanzas[i - 1]?.length ?? 0 };
};

const refrainRowsFor = (outline: Outline, i: number, apart: boolean, last: number) => {
  const rows = (outline.refrain?.rows ?? []).filter(
    (one) =>
      one.stanzas.length === 0 ||
      one.stanzas.length >= outline.stanzas.length ||
      one.stanzas.includes(i),
  );
  const order = apart ? 'after-each' : (outline.refrain?.order ?? 'after-each');
  const after =
    order === 'after-each' ||
    order === 'first-and-after-each' ||
    (i === last && (order === 'after-last' || order === 'first-and-last'));
  const before =
    order === 'before-each' ||
    (i === 1 && (order === 'first-and-after-each' || order === 'first-and-last'));
  return { before: before ? rows : [], after: after ? rows : [] };
};

export interface StanzaCheck {
  readonly lines: readonly string[];
  readonly count: number;
}

export interface Placement {
  readonly rows: ReadonlyArray<{ readonly label: string; readonly row: OutlineRow }>;
  readonly placed: readonly Placed[];
  readonly lines: readonly string[];
  readonly ownAt: readonly number[];
  readonly words: readonly string[];
  readonly each: readonly RowPlaced[];
}

const sameRows = (a: Placement['rows'], b: Placement['rows']) =>
  a.length === b.length && a.every((one, k) => one.row === b[k]?.row && one.label === b[k]?.label);

const firstDiffering = (a: readonly string[], b: readonly string[]) => {
  const n = Math.min(a.length, b.length);
  for (let k = 0; k < n; k++) if (a[k] !== b[k]) return k;
  return n;
};

export const placementOf = (
  what: string,
  outline: Outline,
  layout: PrintedLayout,
  i: number,
  known?: Placement,
): Placement => {
  const run = placing(what, outline, layout, i, known);
  for (let one = run.next(); ; one = run.next()) if (one.done === true) return one.value;
};

export const placing = function* (
  what: string,
  outline: Outline,
  layout: PrintedLayout,
  i: number,
  known?: Placement,
): Generator<string, Placement> {
  const { words } = sungOf(layout, i);
  const stanzaRows = outline.stanzas[i - 1]?.rows ?? [];
  const refrain = refrainRowsFor(outline, i, layout.refrain !== undefined, layout.stanzas.length);
  const own = stanzaRows.map((row, r) => ({ label: `stanza ${i} row ${r + 1}`, row }));
  const after = refrain.after.map((row, r) => ({
    label: `the refrain after stanza ${i}: row ${r + 1}`,
    row,
  }));
  const inside = outline.refrain?.at === 'inside' && layout.refrain === undefined;
  const rows = [
    ...refrain.before.map((row, r) => ({
      label: `the refrain before stanza ${i}: row ${r + 1}`,
      row,
    })),
    ...(inside
      ? [...own, ...after].toSorted((a, b) => a.row.system - b.row.system)
      : [...own, ...after]),
  ];
  const text = textOf(words);
  const kept = keptOf(known, rows, words);
  const each = yield* placeRows(what, text, rows, kept);
  const lines = each.flatMap((one) => one.lines);
  const end = each.at(-1)?.placed.end ?? 0;
  const tail = words.length - end;
  if (
    tail > 0 &&
    !(
      i === layout.stanzas.length &&
      outline.extra.some((extra) =>
        spansOf(text, extra).some((span) => span.start === end && span.end === words.length),
      )
    )
  ) {
    const line = `${what}: stanza ${i} sings ${tail} words from ${quoted(words.slice(end, end + 2))} on, in no row the page prints`;
    lines.push(line);
    yield line;
  }
  const labels = new Set(own.map((one) => one.label));
  const ownAt = rows.flatMap((one, k) => (labels.has(one.label) ? [k] : []));
  return { rows, placed: each.map((one) => one.placed), lines, ownAt, words, each };
};

const keptOf = (
  known: Placement | undefined,
  rows: Placement['rows'],
  words: readonly string[],
): readonly RowPlaced[] => {
  if (known === undefined || !sameRows(known.rows, rows)) return [];
  const differs = firstDiffering(known.words, words);
  if (differs === words.length && differs === known.words.length) return known.each;
  const stop = known.each.findIndex((one) => one.reads > differs);
  return stop < 0 ? known.each : known.each.slice(0, stop);
};

const NAMED_METRES = new Map<string, readonly number[]>([
  ['CM', [8, 6, 8, 6]],
  ['LM', [8, 8, 8, 8]],
  ['SM', [6, 6, 8, 6]],
]);

export const metreOf = (printed: string | null): readonly number[] | undefined => {
  if (printed === null) return undefined;
  const text = printed
    .replace(/\s+/g, '')
    .replace(/(withRefrain|Refrain|Ref\.?|Alleluias?|Amens?)$/i, '');
  const double = /\.?D\.?$/.test(text);
  const body = (double ? text.replace(/\.?D\.?$/, '') : text).replace(/\.$/, '');
  const named = NAMED_METRES.get(body.replace(/\./g, ''));
  const base = named ?? (/^\d+(\.\d+)*$/.test(body) ? body.split('.').map(Number) : undefined);
  return base === undefined ? undefined : double ? [...base, ...base] : base;
};

const syllableMemo = new Map<string, readonly [number, number]>();

const syllablesOf = (word: string): readonly [number, number] => {
  const known = syllableMemo.get(word);
  if (known !== undefined) return known;
  const all = counts(word);
  const found =
    all.length === 0 ? ([0, 0] as const) : ([Math.min(...all), Math.max(...all)] as const);
  syllableMemo.set(word, found);
  return found;
};

const metreFor = (k: number, metre: readonly number[]): readonly number[] | undefined =>
  k === metre.length
    ? metre
    : k === metre.length * 2
      ? [...metre, ...metre]
      : k * 2 === metre.length
        ? Array.from({ length: k }, (_, j) => (metre[2 * j] ?? 0) + (metre[2 * j + 1] ?? 0))
        : undefined;

const lineSyllables = (line: PrintedLine): readonly [number, number] => {
  let [lo, hi] = [0, 0];
  for (const word of line.words) {
    const [fewest, most] = syllablesOf(word);
    lo += fewest;
    hi += most;
  }
  return [lo, hi];
};

const metreLines = (
  what: string,
  i: number,
  lines: readonly PrintedLine[],
  metre: readonly number[],
) => {
  const want = metreFor(lines.length, metre);
  if (want === undefined) return [];
  const miss = lines.map(lineSyllables).map(([lo, hi], j) => {
    const m = want[j] ?? 0;
    return m < lo ? lo - m : m > hi ? hi - m : 0;
  });
  const found: string[] = [];
  for (let j = 0; j + 1 < lines.length; j++) {
    const [a, b] = [miss[j] ?? 0, miss[j + 1] ?? 0];
    if (a !== 0 && b !== 0 && Math.sign(a) !== Math.sign(b))
      found.push(
        `${what}: stanza ${i} lines ${j + 1} and ${j + 2} sing ${a > 0 ? '+' : ''}${a} and ${b > 0 ? '+' : ''}${b} syllables against the metre the page prints`,
      );
  }
  return found;
};

const metreCountLines = (what: string, outline: Outline, layout: PrintedLayout) => {
  const metre = metreOf(outline.metre);
  if (metre === undefined) return [];
  const fits = layout.stanzas.map((lines) => metreFor(lines.length, metre) !== undefined);
  const fitting = fits.indexOf(true);
  if (fitting < 0) return [];
  return fits.flatMap((fit, k) =>
    fit
      ? []
      : [
          `${what}: stanza ${k + 1} has ${layout.stanzas[k]?.length ?? 0} lines, which the metre the page prints fits in no way, where stanza ${fitting + 1}'s ${layout.stanzas[fitting]?.length ?? 0} fit it`,
        ],
  );
};

export const stanzaCheckOf = (
  what: string,
  outline: Outline,
  layout: PrintedLayout,
  i: number,
  book: ReadonlySet<string>,
  placement: Placement = placementOf(what, outline, layout, i),
): StanzaCheck => {
  const sung = sungOf(layout, i);
  const { opens, own } = sung;
  const { rows, placed } = placement;
  const stanzaRows = outline.stanzas[i - 1]?.rows ?? [];
  const lines = [...placement.lines];
  for (const [k, open] of opens.entries()) {
    const r = placed.findIndex((one) => one.anchored && one.start <= open && open < one.end);
    const [row, one] = [rows[r]?.row, placed[r]];
    if (row === undefined || one === undefined) continue;
    const places = wordsAt(one, Math.max(1, row.words), open);
    if (places.length > 0 && places.every((place) => !row.capitals.includes(place)))
      lines.push(
        `${what}: stanza ${i} line ${k + 1} opens on word ${places[0] ?? 0} of ${rows[r]?.label ?? ''}, which the page prints with no capital`,
      );
  }
  lines.push(...unopenedCapitals(what, i, placement, sung, book));
  const ownRows = placement.ownAt.flatMap((k) => placed[k] ?? []);
  const inside = opens.filter((open) => ownRows.some((one) => one.start <= open && open < one.end));
  if (stanzaRows.length > 0 && stanzaRows.every((row) => row.system === 0)) {
    const starts = new Set(ownRows.map((one) => one.start));
    if (own !== stanzaRows.length || inside.some((open) => !starts.has(open)))
      lines.push(
        `${what}: stanza ${i} is printed as ${stanzaRows.length} lines of text, the printed source writes ${own} other lines`,
      );
  }
  const metre = metreOf(outline.metre);
  if (metre !== undefined) lines.push(...metreLines(what, i, layout.stanzas[i - 1] ?? [], metre));
  return { lines, count: inside.length };
};

const unopenedCapitals = (
  what: string,
  i: number,
  placement: Placement,
  sung: {
    readonly words: readonly string[];
    readonly opens: readonly number[];
    readonly sentences: readonly boolean[];
  },
  book: ReadonlySet<string>,
) => {
  const opens = new Set(sung.opens);
  return placement.placed.flatMap((one, r) => {
    const row = placement.rows[r];
    if (!one.anchored || row === undefined) return [];
    const opened = (at: number) =>
      opens.has(at) || sung.sentences[at] === true || book.has(sung.words[at] ?? '');
    return row.row.capitals.flatMap((c) => {
      const places = wordPlaces(one, Math.max(1, row.row.words), c);
      return places.length === 0 || places.some(opened)
        ? []
        : [
            `${what}: ${row.label} prints word ${c} with a capital inside a line of stanza ${i}, where no line or sentence opens`,
          ];
    });
  });
};

const sameSystemsLines = (what: string, outline: Outline, checks: readonly StanzaCheck[]) => {
  const systemsOf = (k: number) =>
    (outline.stanzas[k]?.rows ?? []).map((row) => row.system).join(',');
  const first = checks[0]?.count ?? 0;
  if (systemsOf(0).split(',').includes('0')) return [];
  return checks.flatMap((check, k) =>
    k > 0 && systemsOf(k) === systemsOf(0) && check.count !== first
      ? [
          `${what}: stanza ${k + 1} has ${check.count} lines, stanza 1 ${first}, under the same systems`,
        ]
      : [],
  );
};

const refrainLines = (what: string, outline: Outline, layout: PrintedLayout) => {
  const lines: string[] = [];
  const order = sourceOrderOf(layout);
  if (outline.refrain === null && order !== undefined)
    lines.push(`${what}: the page prints no refrain, the printed source has one`);
  if (outline.refrain !== null && order !== undefined && outline.refrain.order !== order)
    lines.push(
      `${what}: the page sings its refrain ${outline.refrain.order}, the printed source ${order}`,
    );
  const key = (group: readonly number[]) => group.join(', ');
  const parts = new Set(variesOf(layout).map(key));
  const unvaried = outlineVaries(outline).filter((group) => !parts.has(key(group)));
  if (unvaried.length > 0)
    lines.push(
      `${what}: the page prints refrain rows for stanzas ${unvaried.map((group) => `[${key(group)}]`).join(' and ')} only, and the printed source sings no varies part after them`,
    );
  return lines;
};

const extraLines = (what: string, outline: Outline, layout: PrintedLayout) => {
  const rows = outline.extra.filter((extra) => !isEcho(extra));
  if (rows.length === 0) return [];
  const sung = Array.from({ length: layout.stanzas.length }, (_, k) => sungOf(layout, k + 1).words);
  return rows
    .filter((extra) => !sung.some((words) => spansOf(words, extra).length > 0))
    .map(
      (extra) =>
        `${what}: a row ${quoted(wordsOf(extra.first))} (${extra.why}) is in no part of the printed source`,
    );
};

export const layoutLinesIn = function* (
  ...args: Parameters<typeof layoutLinesRead>
): Generator<string> {
  const [n] = args;
  if (!UNDER_COPYRIGHT.has(n)) return yield* layoutLinesRead(...args);
  for (const line of layoutLinesRead(...args)) yield layoutLineAs(n, line);
};

export const layoutLineAs = (n: number, line: string) =>
  UNDER_COPYRIGHT.has(n) ? line.replace(/"[^"]*"/g, '"…"') : line;

const layoutLinesRead = function* (
  n: number,
  reading: Outline,
  layout: PrintedLayout,
  borrower: boolean,
  book: ReadonlySet<string>,
  known: (i: number) => StanzaCheck | undefined = () => undefined,
): Generator<string> {
  const outline = readAs(reading, layout);
  const what = `${n} shape (${outline.reader})`;
  const [page, source] = [outline.stanzas.length, layout.stanzas.length];
  if (borrower ? page > source : page !== source)
    yield `${what}: the page prints ${page} stanzas, the printed source ${source}`;
  const checks: StanzaCheck[] = [];
  for (let i = 1; i <= Math.min(page, source); i++) {
    const check = known(i) ?? stanzaCheckOf(what, outline, layout, i, book);
    checks.push(check);
    yield* check.lines;
  }
  yield* sameSystemsLines(what, outline, checks);
  yield* metreCountLines(what, outline, layout);
  yield* refrainLines(what, outline, layout);
  yield* extraLines(what, outline, layout);
};

export const layoutLinesOf = (...args: Parameters<typeof layoutLinesIn>): string[] => [
  ...layoutLinesIn(...args),
];

const asRefrain = new WeakMap<Outline, Outline>();

export const readAs = (outline: Outline, layout: PrintedLayout): Outline => {
  if (
    outline.refrain !== null ||
    sourceOrderOf(layout) !== 'first-and-after-each' ||
    outline.stanzas.length !== layout.stanzas.length + 1
  )
    return outline;
  const known = asRefrain.get(outline);
  if (known !== undefined) return known;
  const [first, ...rest] = outline.stanzas;
  const read: Outline = {
    ...outline,
    stanzas: rest,
    refrain: {
      label: null,
      at: 'before',
      order: 'first-and-after-each',
      rows: (first?.rows ?? []).map((row) => ({ ...row, stanzas: [] })),
    },
  };
  asRefrain.set(outline, read);
  return read;
};

export const isEcho = (extra: Outline['extra'][number]) =>
  /echo|descant|parenthes/i.test(extra.why);

export const spansOf = (sung: readonly string[] | Text, row: OutlineRow) => {
  const words = 'joined' in sung ? sung : textOf(sung);
  const count = Math.max(1, row.words);
  const { first, mid, last } = anchorsOf(row);
  const middle = Math.floor(count / 2);
  return placesOf(words, first, 0, words.words.length, false).flatMap((start) => {
    const end = placesOf(words, last, start + count - SLACK, start + count + SLACK, true)[0];
    return end !== undefined &&
      placesOf(words, mid, start + middle - SLACK, start + middle + SLACK, false).length > 0
      ? [{ start, end }]
      : [];
  });
};

const heldLines = new WeakMap<
  Outline,
  WeakMap<
    Verses,
    Array<{
      readonly n: number;
      readonly fix: Fix | undefined;
      readonly borrower: boolean;
      readonly order: Order | undefined;
      readonly book: ReadonlySet<string>;
      readonly lines: readonly string[];
    }>
  >
>();

export const outlineProblems = (
  n: number,
  outline: Outline,
  row: Verses,
  fix: Fix | undefined,
  borrower: boolean,
  order: Order | undefined,
  book: ReadonlySet<string>,
): string[] => {
  const byRow = heldLines.get(outline) ?? new WeakMap();
  heldLines.set(outline, byRow);
  const held = byRow.get(row) ?? [];
  byRow.set(row, held);
  const found = held.find(
    (one) =>
      one.n === n &&
      one.fix === fix &&
      one.borrower === borrower &&
      one.order === order &&
      one.book === book,
  );
  if (found !== undefined) return [...found.lines];
  const lines = layoutLinesOf(n, outline, layoutOf(row, fix, order), borrower, book);
  held.push({ n, fix, borrower, order, book, lines });
  return [...lines];
};

export const formatProblems = (n: number, layout: PrintedLayout): string[] => [
  ...layout.stanzas.flatMap((lines, s) =>
    lines.flatMap((line, k) =>
      line.indent ? [`${n} lines: stanza ${s + 1} line ${k + 1} opens with whitespace`] : [],
    ),
  ),
  ...(layout.refrain ?? []).flatMap((item, k) =>
    ('varies' in item ? item.varies.flatMap((part) => part.lines) : [item]).some(
      (line) => line.indent,
    )
      ? [`${n} lines: refrain item ${k + 1} opens with whitespace`]
      : [],
  ),
];

export const isLayoutLine = (n: number, line: string) =>
  line.startsWith(`${n} shape (`) || line.startsWith(`${n} lines: `);

export interface Sources {
  readonly inventory: Inventory;
  readonly rows: ReadonlyMap<number, Verses>;
  readonly base: ReadonlyMap<number, Verses>;
  readonly fixes: ReadonlyMap<number, Fix>;
  readonly rulings: ReadonlyMap<number, readonly Ruling[]>;
  readonly crops: ReadonlyMap<
    string,
    { readonly width: number; readonly height: number; readonly sha: string }
  >;
  readonly photos: ReadonlyMap<string, Uint8Array>;
  readonly outlines: ReadonlyMap<number, readonly Outline[]>;
  readonly orders: ReadonlyMap<number, Order>;
  readonly baseFixes: readonly number[];
  readonly capitals: ReadonlyMap<number, ReadonlySet<string>>;
}

const tallyLine = (counts: Map<string, [number, number]>, line: string) => {
  let before: string | undefined;
  for (const token of line.split(/\s+/u)) {
    if (token === '') continue;
    const inside = before !== undefined && !/[.!?:;"“]$/u.test(before) && !QUOTE_OPEN.test(token);
    if (inside)
      for (const word of wordsOf(token)) {
        const count = counts.get(word) ?? [0, 0];
        count[midCapital(token, before) ? 0 : 1] += 1;
        counts.set(word, count);
      }
    before = token;
  }
};

export const capitalsOf = (
  rows: ReadonlyMap<number, Verses>,
): ReadonlyMap<number, ReadonlySet<string>> => {
  const tally = (counts: Map<string, [number, number]>, row: Verses) => {
    for (const verse of row) for (const line of verse.text.split('\n')) tallyLine(counts, line);
    return counts;
  };
  const mostly = (counts: Map<string, [number, number]>) =>
    [...counts].flatMap(([word, [capital, lower]]) => (capital >= lower ? [word] : []));
  const book = mostly([...rows.values()].reduce(tally, new Map()));
  return new Map(
    [...rows].map(([n, row]) => [n, new Set([...book, ...mostly(tally(new Map(), row))])]),
  );
};

export const bookOf = (sources: Sources, n: number): ReadonlySet<string> =>
  sources.capitals.get(n) ?? new Set();

export const baseOf = (sources: Sources, n: number): Verses => sources.base.get(n) ?? [];

const orientationsAt = (view: DataView, tiff: number): number[] => {
  const little = view.getUint8(tiff) === 0x49;
  const ifd = tiff + view.getUint32(tiff + 4, little);
  const count = view.getUint16(ifd, little);
  const found: number[] = [];
  for (let k = 0; k < count; k++) {
    const entry = ifd + 2 + k * 12;
    if (view.getUint16(entry, little) === 0x0112) found.push(view.getUint16(entry + 8, little));
  }
  return found;
};

const isFrame = (marker: number) =>
  marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);

export const jpegHeader = (bytes: Uint8Array) => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let frame: { readonly width: number; readonly height: number } | undefined;
  const orientations: number[] = [];
  let at = 2;
  while (at + 4 <= bytes.length && bytes[at] === 0xff) {
    const marker = bytes[at + 1] ?? 0;
    if (marker === 0xd9 || marker === 0xda) break;
    const body = at + 4;
    if (isFrame(marker))
      frame = { height: view.getUint16(body + 1), width: view.getUint16(body + 3) };
    if (marker === 0xe1 && String.fromCharCode(...bytes.subarray(body, body + 4)) === 'Exif')
      orientations.push(...orientationsAt(view, body + 6));
    at = body + view.getUint16(at + 2) - 2;
  }
  return { frame, orientations };
};

export const photoProblem = (bytes: Uint8Array): string | undefined => {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return 'not a JPEG';
  const { frame, orientations } = jpegHeader(bytes);
  if (frame === undefined) return 'no frame';
  if (frame.height <= frame.width) return `stored sideways (${frame.width}x${frame.height})`;
  const turned = orientations.find((o) => o !== 1);
  return turned === undefined ? undefined : `EXIF orientation ${turned}`;
};

const photoProblems = (photos: ReadonlyMap<string, Uint8Array>): string[] =>
  [...photos].flatMap(([name, bytes]) => {
    const frame = jpegHeader(bytes).frame;
    const why =
      photoProblem(bytes) ??
      (frame !== undefined && Math.max(frame.width, frame.height) !== 3024
        ? `long side ${Math.max(frame.width, frame.height)}, not 3024`
        : undefined);
    return why === undefined ? [] : [`photo ${name} ${why}`];
  });

export interface Derived {
  readonly row: Entry['row'];
  readonly words: Entry['row'];
  readonly units: ReadonlyArray<readonly string[]>;
  readonly changes: number;
}

const on1985 = (ruling: Ruling) =>
  ruling.crops.length > 0 &&
  ruling.crops.every((crop) => sourceOfImage(crop.image) !== 'sdahimages');

export const derive = (
  base: ReadonlyArray<readonly string[]>,
  rulings: readonly Ruling[],
): Derived & {
  readonly misplaced: readonly RulingConflict[];
  readonly spans: readonly Span[];
} => {
  const applied = applyRulings(base, rulings);
  const changing = applied.applied.filter(changes);
  const unreadable = rulings.some((ruling) => ruling.kind === 'unreadable');
  const words: Entry['row'] =
    unreadable || changing.some((ruling) => !on1985(ruling))
      ? 'unsettled'
      : changing.length > 0
        ? 'fixed'
        : 'matches';
  return {
    row: rulings.some(awaitsOwner) ? 'unsettled' : words,
    words,
    units: words === 'fixed' ? applied.units : base.map((unit) => [...unit]),
    changes: rulings.filter(changes).length,
    misplaced: applied.misplaced,
    spans: applied.spans,
  };
};

const unitDiff = (
  want: ReadonlyArray<readonly string[]>,
  have: ReadonlyArray<readonly string[]>,
): string | undefined => {
  const run = runsBetween(want, have)[0];
  return run === undefined
    ? undefined
    : `unit ${run.unit} at ${run.at}: wants ${quoted(run.row)}, the row has ${quoted(run.page)}`;
};

const FROM = /\b(p\d{3}\.jpg|[\w-]+\.(?:jpg|png))\b.*\bsystems? \d+.*\b(row|refrain)\b/i;

const IMAGE = /[\w-]+\.(?:jpg|png)\b/g;

const placeOf = (from: string) => ({
  image: /\b(p\d{3}\.jpg|[\w-]+\.(?:jpg|png))\b/.exec(from)?.[1] ?? '',
  system: /\bsystems? (\d+)/i.exec(from)?.[1] ?? '',
});

const cropProblems = (
  what: string,
  n: number,
  deciding: Deciding,
  one: Ruling['crops'][number],
  crops: Sources['crops'],
): string[] => {
  const crop = crops.get(`${pad(n)}/${one.crop}`);
  const [, , width, height] = one.box;
  return [
    ...(deciding.images.includes(one.image)
      ? []
      : [`${what} reads ${one.image}, not the deciding page (${deciding.images.join(', ')})`]),
    ...(crop === undefined
      ? [`${what} crop ${one.crop} is not committed`]
      : [
          ...(crop.width === width && crop.height === height
            ? []
            : [
                `${what} crop ${one.crop} is ${crop.width}x${crop.height}, its box ${width}x${height}`,
              ]),
          ...(crop.sha === one.sha ? [] : [`${what} crop ${one.crop} is not the crop it read`]),
        ]),
  ];
};

const KEEPS_ROW: Partial<Record<Ruling['kind'], string>> = {
  echo: 'an echo',
  layout: 'a layout',
  assumption: 'an assumption',
  disputed: 'a disputed',
};

const kindProblems = (what: string, ruling: Ruling): string[] => {
  const kept = KEEPS_ROW[ruling.kind];
  const settles = (ruling.settles ?? []).length > 0;
  return [
    ...((ruling.kind === 'words' || ruling.kind === 'owner') &&
    !same(wordsOf(ruling.sung), wordsOf(ruling.printed))
      ? [`${what} sings "${ruling.sung}", not the words it prints`]
      : []),
    ...(kept !== undefined && !same(wordsOf(ruling.sung), wordsOf(ruling.row))
      ? [`${what} is ${kept} but changes the row`]
      : []),
    ...(ruling.answer !== undefined && ruling.kind !== 'disputed'
      ? [`${what} answers no dispute`]
      : []),
    ...(keepsPage(ruling) && settles ? [`${what} is answered page but settles a line`] : []),
    ...(ruling.kind === 'disputed' && !keepsPage(ruling) && !settles
      ? [`${what} is disputed but settles no line`]
      : []),
    ...(ruling.kind === 'assumption' && (!settles || ruling.sites.length > 0)
      ? [`${what} is an assumption but settles no line or has a site`]
      : []),
  ];
};

const rulingProblems = (
  n: number,
  deciding: Deciding,
  base: ReadonlyArray<readonly string[]>,
  rulings: readonly Ruling[],
  crops: Sources['crops'],
): string[] =>
  rulings.flatMap((ruling, i) => {
    const what = `${n} ruling ${i + 1}`;
    const named = [...ruling.why.matchAll(IMAGE)].map((match) => match[0]);
    const held = [ruling.settles, ruling.unreachable, ruling.gaps].flatMap((list) => list ?? []);
    return [
      ...(ruling.crops.length === 0 ? [`${what} names no crop`] : []),
      ...ruling.crops.flatMap((one) => cropProblems(what, n, deciding, one, crops)),
      ...(same(wordsOf(ruling.printed), wordsOf(printedOf(ruling.crops)))
        ? []
        : [`${what} prints "${ruling.printed}", not the words its crops show`]),
      ...named
        .filter((image) => !crops.has(`${pad(n)}/${image}`))
        .map((image) => `${what} reads ${image}, which is no committed crop`),
      ...(ruling.sites.length === 0 && held.length === 0 && !keepsPage(ruling)
        ? [`${what} has no site`]
        : []),
      ...(ruling.readings.length === 0 ? [`${what} names no reading`] : []),
      ...(ruling.judge === '' ? [`${what} names no judge`] : []),
      ...kindProblems(what, ruling),
      ...applyRulings(base, [ruling]).misplaced.map((one) => `${what} ${lineOfConflict(one)}`),
    ];
  });

const stateProblems = (
  entry: Entry,
  deciding: Deciding,
  rulings: readonly Ruling[],
  derived: Derived,
): string[] => {
  const n = entry.number;
  const read = entry.readings.reader + entry.readings.ocr;
  const noted = (entry.note ?? '') !== '';
  if (entry.row === 'nopage')
    return [
      ...(rulings.length > 0 ? [`${n} says nopage, but has rulings`] : []),
      ...(read > 0 ? [`${n} says nopage, but counts a reading of its page`] : []),
      ...(noted ? [] : [`${n} says nopage with no note`]),
    ];
  return [
    ...(deciding.source === 'none' ? [`${n} says ${entry.row}, but no page decides it`] : []),
    ...(entry.row === derived.row
      ? []
      : [`${n} says ${entry.row}, its rulings make it ${derived.row}`]),
    ...(read === 0 ? [`${n} says ${entry.row}, but counts no blind reading of its page`] : []),
    ...(entry.row === 'unsettled' && !noted ? [`${n} says unsettled with no note`] : []),
  ];
};

const fixFileProblems = (
  entry: Entry,
  deciding: Deciding,
  fix: Fix | undefined,
  row: Verses,
  words: Entry['row'],
  paged: boolean,
): string[] => {
  const n = entry.number;
  const fixed = entry.row === 'fixed' || (entry.row === 'unsettled' && words === 'fixed');
  if (fix === undefined) return fixed ? [`${n} says ${entry.row} but has no fix file`] : [];
  const sings = unitDiff(
    fixUnitLinesOf(fix).map((lines) => wordsOf(lines.map((line) => line.text).join('\n'))),
    unitsOf(row),
  );
  const own = sings === undefined ? [] : [`${n} fix file and row differ: ${sings}`];
  if (fix.replaces === undefined)
    return PRIOR_FIXES.has(n) ? own : [...own, `${n} fix file carries no replaces`];
  return [
    ...own,
    ...(fixed || (entry.row === 'matches' && (fixVaries(fix) || paged) && sings === undefined)
      ? []
      : [`${n} has a fix file of its own but says ${entry.row}`]),
    ...fixLines(fix)
      .filter((line) => !FROM.test(line.from))
      .map((line) => `${n} fix line "${line.text}" from "${line.from}"`),
    ...fixLines(fix)
      .filter((line) => FROM.test(line.from) && !deciding.images.includes(placeOf(line.from).image))
      .map(
        (line) =>
          `${n} fix line "${line.text}" is read off ${placeOf(line.from).image}, no deciding page`,
      ),
  ];
};

const spanProblems = (n: number, fix: Fix, rulings: readonly Ruling[], spans: readonly Span[]) => {
  const units = fixUnitLinesOf(fix).map((lines) =>
    lines.flatMap((line) => wordsOf(line.text).map(() => line.from)),
  );
  return rulings.flatMap((ruling, i) => {
    if (!changes(ruling)) return [];
    const places = spans
      .filter((span) => span.ruling === ruling)
      .flatMap((span) => {
        const froms = units[span.unit - 1] ?? [];
        const at = span.length > 0 ? span.start : Math.max(0, span.start - 1);
        return froms.slice(at, at + Math.max(1, span.length)).map(placeOf);
      });
    const images = new Set(ruling.crops.map((crop) => crop.image));
    const systems = new Set(places.map((place) => `${place.image} ${place.system}`));
    return [
      ...[...new Set(places.map((place) => place.image))]
        .filter((image) => !images.has(image))
        .map(
          (image) =>
            `${n} ruling ${i + 1} writes a line read off ${image}, which none of its crops shows`,
        ),
      ...(systems.size > ruling.crops.length
        ? [
            `${n} ruling ${i + 1} writes lines of ${systems.size} systems off ${ruling.crops.length} crops`,
          ]
        : []),
    ];
  });
};

const entryProblems = (entry: Entry, deciding: Deciding, sources: Sources): string[] => {
  const n = entry.number;
  const row = sources.rows.get(n);
  if (row === undefined) return [`${n} has no row`];
  const fix = sources.fixes.get(n);
  const rulings = sources.rulings.get(n) ?? [];
  const base = unitsOf(baseOf(sources, n));
  const derived = derive(base, rulings);
  const differs = unitDiff(entry.row === 'nopage' ? base : derived.units, unitsOf(row));
  const stanzas = fix?.stanzas.length ?? row.filter((verse) => verse.id >= 0).length;
  const refrain = row.some((verse) => verse.id < 0) || fix?.refrain !== undefined;
  return [
    ...(entry.source === deciding.source && same(entry.pages, deciding.images)
      ? []
      : [
          `${n} says ${entry.source} ${entry.pages.join(', ')}, the inventory ${deciding.source} ${deciding.images.join(', ')}`,
        ]),
    ...(entry.base === baseDigestOf(base) ? [] : [`${n} base row is not the one the census read`]),
    ...rulingProblems(n, deciding, base, rulings, sources.crops),
    ...derived.misplaced.map((one) => `${n} rulings: ${lineOfConflict(one)}`),
    ...stateProblems(entry, deciding, rulings, derived),
    ...(differs === undefined ? [] : [`${n} row: ${differs}`]),
    ...(entry.rulings.all === rulings.length && entry.rulings.changes === derived.changes
      ? []
      : [
          `${n} counts ${entry.rulings.all} rulings (${entry.rulings.changes} changing), the folder ${rulings.length} (${derived.changes})`,
        ]),
    ...(entry.stanzas === stanzas && entry.refrain === refrain
      ? []
      : [`${n} claims ${entry.stanzas} stanzas, refrain ${entry.refrain}`]),
    ...fixFileProblems(entry, deciding, fix, row, derived.words, rulings.some(keepsPage)),
    ...(fix?.replaces === undefined ? [] : spanProblems(n, fix, rulings, derived.spans)),
    ...outlineEntryProblems(entry, deciding, sources),
  ];
};

const lentRefrain = (their: Outline, i: number) =>
  their.refrain === null || their.refrain.order !== 'after-each'
    ? []
    : their.refrain.rows.filter((row) => row.stanzas.length === 0 || row.stanzas.includes(i));

export interface HeldTo {
  readonly outlines: readonly Outline[];
  readonly borrower: boolean;
}

export const outlinesOf = (sources: Sources, n: number): HeldTo => {
  const byOutlines = heldTo.get(sources.inventory) ?? new WeakMap();
  heldTo.set(sources.inventory, byOutlines);
  const byHymn = byOutlines.get(sources.outlines) ?? new Map<number, HeldTo>();
  byOutlines.set(sources.outlines, byHymn);
  const found = byHymn.get(n) ?? readingsHeld(sources, n);
  byHymn.set(n, found);
  return found;
};

const heldTo = new WeakMap<
  Inventory,
  WeakMap<ReadonlyMap<number, readonly Outline[]>, Map<number, HeldTo>>
>();

const readingsHeld = (sources: Sources, n: number): HeldTo => {
  const own = sources.outlines.get(n) ?? [];
  const lent = sources.inventory.lent.find((one) => one.hymn === n);
  const theirs = lent === undefined ? [] : (sources.outlines.get(lent.from) ?? []);
  if (theirs.length === 0) return { outlines: own, borrower: lent !== undefined };
  return {
    outlines: own.flatMap((outline) =>
      theirs.map((their) => ({
        ...outline,
        images: [...outline.images, ...their.images],
        stanzas: [
          ...outline.stanzas,
          ...their.stanzas.slice(outline.stanzas.length).map((stanza, k) => ({
            ...stanza,
            rows: [...stanza.rows, ...lentRefrain(their, outline.stanzas.length + k + 1)],
          })),
        ],
      })),
    ),
    borrower: false,
  };
};

export const outlineEntryProblems = (
  entry: Entry,
  deciding: Deciding,
  sources: Sources,
): string[] => {
  const n = entry.number;
  const { outlines, borrower } = outlinesOf(sources, n);
  const found = outlines.flatMap((outline) =>
    outlineProblems(
      n,
      outline,
      sources.rows.get(n) ?? [],
      sources.fixes.get(n),
      borrower,
      sources.orders.get(n),
      bookOf(sources, n),
    ),
  );
  const settled = new Set((sources.rulings.get(n) ?? []).flatMap((ruling) => ruling.settles ?? []));
  return [
    ...(entry.row !== 'nopage' && outlines.length === 0
      ? [`${n} says ${entry.row} with no shape reading of its page`]
      : []),
    ...formatProblems(n, layoutOf(sources.rows.get(n) ?? [], sources.fixes.get(n), undefined)),
    ...outlines
      .filter((outline) => !ofPage(outline.images, deciding))
      .map(
        (outline) =>
          `${n} shape (${outline.reader}) reads ${outline.images.join(', ')}, not the deciding page`,
      ),
    ...found.filter((line) => !settled.has(line)),
    ...[...settled]
      .filter((line) => !found.includes(line))
      .map((line) => `${n} a ruling settles a shape difference the census does not find: ${line}`),
  ];
};

const orderProblems = (numbers: readonly number[]): string[] => {
  const want = Array.from({ length: LAST - FIRST + 1 }, (_, i) => FIRST + i);
  const seen = new Set(numbers);
  return [
    ...want.filter((n) => !seen.has(n)).map((n) => `${n} no entry`),
    ...numbers.filter((n) => n < FIRST || n > LAST).map((n) => `${n} is no hymn of the book`),
    ...numbers.flatMap((n, i) =>
      i > 0 && n <= (numbers[i - 1] ?? 0) ? [`${n} entry out of place (position ${i + 1})`] : [],
    ),
  ];
};

export const problemsOf = (census: Census, sources: Sources): string[] => {
  const deciding = decidingOf(sources.inventory);
  return [
    ...inventoryProblems(sources.inventory, new Set(sources.photos.keys())),
    ...orderProblems(census.hymns.map((entry) => entry.number)),
    ...baseProblems(sources),
    ...census.hymns.flatMap((entry) =>
      entryProblems(entry, deciding.get(entry.number) ?? NO_PAGE, sources),
    ),
    ...[...sources.rulings.keys(), ...sources.outlines.keys()]
      .filter((n) => !census.hymns.some((entry) => entry.number === n))
      .map((n) => `${n} has rulings or a shape but no entry`),
    ...[...sources.crops.keys()]
      .filter((key) => {
        const [dir = '', file = ''] = key.split('/');
        return !(sources.rulings.get(Number(dir)) ?? []).some((ruling) =>
          ruling.crops.some((crop) => crop.crop === file),
        );
      })
      .map((key) => `crop ${key} is named by no ruling`),
    ...photoProblems(sources.photos),
  ];
};

export const baseProblems = (sources: Sources): string[] => {
  const problems: string[] = [];
  for (let n = FIRST; n <= LAST; n++) {
    const want = sources.base.get(n);
    if (want === undefined) {
      problems.push(`${n} has no row at the base commit`);
      continue;
    }
    if (sources.baseFixes.includes(n) && !sources.fixes.has(n))
      problems.push(`${n} fix file at the base commit is gone`);
    const replaces = sources.fixes.get(n)?.replaces;
    if (replaces !== undefined && JSON.stringify(want) !== JSON.stringify(replaces))
      problems.push(`${n} fix replaces a row that is not the base commit's`);
  }
  return problems;
};

export const isRefusal = (reading: Reading) => reading.stanzas.length === 0;

const readsVarying = (reading: Reading) =>
  new Set((reading.refrainRows ?? []).map((row) => wordsOf(row).join(' '))).size > 1;

export const unruledOf = (runs: readonly Run[], rulings: readonly Ruling[]) =>
  runs.filter(
    (run) =>
      !rulings.some(
        (ruling) =>
          ruling.row === run.row.join(' ') &&
          ruling.readings.includes(run.page.join(' ')) &&
          ruling.sites.some((site) => site.unit === run.unit && site.at === run.at),
      ),
  );

const ofPage = (images: readonly string[], deciding: Deciding) =>
  images.length > 0 && images.every((image) => deciding.readable.includes(pageOfImage(image)));

export const readingProblems = (
  entry: Entry,
  deciding: Deciding,
  baseRow: Verses,
  rulings: readonly Ruling[],
  readings: readonly Reading[],
  outlines: readonly Outline[] = [],
): string[] => {
  const n = entry.number;
  const read = readings.filter(
    (r) => r.number === n && ofPage(r.images, deciding) && !isRefusal(r),
  );
  const reader = read.filter((r) => (r.by ?? 'reader') === 'reader').length;
  const ocr = read.length - reader;
  const problems: string[] = [];
  if (entry.readings.reader !== reader || entry.readings.ocr !== ocr)
    problems.push(
      `${n} counts ${entry.readings.reader} reader and ${entry.readings.ocr} OCR readings, the folder ${reader} and ${ocr}`,
    );
  if (entry.row === 'nopage') {
    if (read.length > 0) problems.push(`${n} says nopage, but its page was read`);
    return problems;
  }
  if (read.length === 0) return [...problems, `${n} unread on ${deciding.source}`];
  const base = unitsOf(baseRow);
  const runs = read.flatMap((reading) => runsBetween(base, readingUnitsOf(reading)));
  for (const run of unruledOf(runs, rulings))
    problems.push(
      `${n} unruled unit ${run.unit} at ${run.at} row=${quoted(run.row)} page=${quoted(run.page)}`,
    );
  if (read.some(readsVarying) && outlines.length === 0)
    problems.push(
      `${n} readings print a refrain that varies by stanza, and no shape reading of its page says how`,
    );
  if (
    read.some(readsVarying) &&
    outlines.length > 0 &&
    outlines.every((outline) => outlineVaries(outline).length === 0) &&
    !rulings.some((ruling) => ruling.kind === 'repeat' || ruling.kind === 'echo')
  )
    problems.push(
      `${n} a reading prints a refrain that varies by stanza, its shape reading none, and no ruling says why`,
    );
  return problems;
};

export interface WitnessHymn {
  readonly stanzas: readonly string[];
  readonly refrains: readonly string[];
}

export const parseWitness = (
  markdown: string,
): { readonly number: number; readonly hymn: WitnessHymn } | undefined => {
  const head = /^## (\d+)\. /m.exec(markdown);
  const body = /^```txt\n([\s\S]*?)^```/m.exec(markdown);
  if (head === null || body === null) return undefined;
  const stanzas: string[] = [];
  const refrains: string[] = [];
  let into: string[] = stanzas;
  let block: string[] = [];
  const flush = () => {
    if (block.length > 0) into.push(block.join('\n'));
    block = [];
  };
  for (const line of (body[1] ?? '').split('\n').map((one) => one.trim())) {
    if (/^\d+\.$/.test(line)) {
      flush();
      into = stanzas;
    } else if (/^(refrain|chorus):?$/i.test(line)) {
      flush();
      into = refrains;
    } else if (line !== '') block.push(line);
  }
  flush();
  return { number: Number(head[1]), hymn: { stanzas, refrains } };
};

export type Hunk = readonly [unit: number, row: readonly string[], witness: readonly string[]];

export const hunksOf = (row: Verses, witness: WitnessHymn): Hunk[] => {
  const refrain = wordsOf(witness.refrains[0] ?? '');
  const theirs = witness.stanzas.map((stanza) => [...wordsOf(stanza), ...refrain]);
  const own = wordsOf(
    row
      .filter((verse) => verse.id < 0)
      .map((verse) => verse.text)
      .join('\n'),
  );
  return [
    ...runsBetween(unitsOf(row), theirs).map((run) => [run.unit, run.row, run.page] as const),
    ...witness.refrains.slice(1).flatMap((block, k) => {
      const words = wordsOf(block);
      return same(words, refrain)
        ? []
        : runsBetween([own], [words]).map((run) => [-(k + 2), run.row, run.page] as const);
    }),
  ];
};

export const digestOf = (hunks: readonly Hunk[]) =>
  createHash('sha256').update(JSON.stringify(hunks)).digest('hex').slice(0, 16);

const filesUnder = (dir: string, ext: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    if (!(yield* fs.exists(dir))) return [] as string[];
    return (yield* fs.readDirectory(dir, { recursive: true }))
      .filter((file) => file.endsWith(ext))
      .toSorted();
  });

export const shaOf = (bytes: Uint8Array) =>
  createHash('sha256').update(bytes).digest('hex').slice(0, 16);

const rowsOfDb = (bytes: Uint8Array): ReadonlyMap<number, Verses> => {
  const db = Database.deserialize(bytes, true);
  const rows = new Map<number, Verses>();
  for (const { id, verses } of db.query('SELECT id, verses FROM hymns').all() as Array<{
    id: number;
    verses: string;
  }>)
    if (id >= FIRST && id <= LAST) rows.set(id, JSON.parse(verses) as Verses);
  db.close();
  return rows;
};

export const baseRowsAt = (commit: string) =>
  Effect.gen(function* () {
    const shown = Bun.spawnSync(['git', 'show', `${commit}:packages/core/data/hymnal.db`], {
      cwd: DATA,
      stdout: 'pipe',
      stderr: 'pipe',
    });
    if (shown.exitCode !== 0)
      return yield* Effect.die(
        `census: git cannot read hymnal.db at the base commit ${commit}: ${shown.stderr.toString().trim()}`,
      );
    return rowsOfDb(shown.stdout);
  });

export const baseFixesAt = (commit: string) =>
  Effect.gen(function* () {
    const listed = Bun.spawnSync(
      ['git', 'ls-tree', '--full-tree', '--name-only', `${commit}:packages/hymnal/data/fixes`],
      { cwd: DATA, stdout: 'pipe', stderr: 'pipe' },
    );
    if (listed.exitCode !== 0)
      return yield* Effect.die(
        `census: git cannot list the fix files at the base commit ${commit}: ${listed.stderr.toString().trim()}`,
      );
    return listed.stdout
      .toString()
      .split('\n')
      .filter((name) => /^\d{3}\.json$/.test(name))
      .map((name) => Number.parseInt(name, 10));
  });

export const loadSources = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const hymnal = yield* SourceHymnal;
  const inventory = yield* decodeInventory(yield* fs.readFileString(path.join(DATA, 'pages.json')));
  const census = yield* decodeCensus(yield* fs.readFileString(path.join(DATA, 'census.json')));
  const base = yield* baseRowsAt(census.base.commit);
  const rows = new Map<number, Verses>();
  const fixes = new Map<number, Fix>();
  const rulings = new Map<number, readonly Ruling[]>();
  for (let n = FIRST; n <= LAST; n++) {
    rows.set(n, (yield* hymnal.getHymn(HymnId.make(n))).verses);
    const fix = path.join(DATA, 'fixes', `${pad(n)}.json`);
    if (yield* fs.exists(fix)) fixes.set(n, yield* decodeFix(yield* fs.readFileString(fix)));
  }
  const crops = new Map<string, { width: number; height: number; sha: string }>();
  const cropDir = path.join(DATA, 'crops');
  for (const file of yield* filesUnder(cropDir, '.json')) {
    const decoded = yield* decodeRulings(yield* fs.readFileString(path.join(cropDir, file)));
    rulings.set(decoded.number, decoded.rulings);
  }
  for (const file of yield* filesUnder(cropDir, '.jpg')) {
    const bytes = yield* fs.readFile(path.join(cropDir, file));
    const { frame } = jpegHeader(bytes);
    if (frame !== undefined) crops.set(file, { ...frame, sha: shaOf(bytes) });
  }
  const photoDir = path.join(DATA, 'photos/sdah-1985');
  const photos = new Map<string, Uint8Array>();
  for (const name of yield* filesUnder(photoDir, '.jpg'))
    photos.set(name, yield* fs.readFile(path.join(photoDir, name)));
  const outlines = new Map<number, Outline[]>();
  for (const outline of (yield* decodeOutlines(
    yield* fs.readFileString(path.join(DATA, 'shapes.json')),
  )).hymns)
    outlines.set(outline.number, [...(outlines.get(outline.number) ?? []), outline]);
  const baseFixes = yield* baseFixesAt(census.base.commit);
  const orders = yield* decodeOrders(
    yield* fs.readFileString(path.join(DATA, 'fixes/refrains.json')),
  );
  const sources: Sources = {
    inventory,
    rows,
    base,
    fixes,
    rulings,
    crops,
    photos,
    outlines,
    orders,
    baseFixes,
    capitals: capitalsOf(rows),
  };
  return sources;
});

const loadWitness = (dir: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const hymns = new Map<number, WitnessHymn>();
    for (const file of (yield* filesUnder(dir, 'docs.md')).toSorted()) {
      const parsed = parseWitness(yield* fs.readFileString(path.join(dir, file)));
      if (parsed === undefined) continue;
      const known = hymns.get(parsed.number);
      if (known === undefined) hymns.set(parsed.number, parsed.hymn);
      else if (JSON.stringify(known) !== JSON.stringify(parsed.hymn))
        return yield* Effect.die(`witness ${parsed.number}: two files give different words`);
    }
    return hymns;
  });

const ReaderHymn = Schema.Struct({
  number: Schema.Int,
  images: Schema.Array(Schema.String),
  stanzas: Schema.Array(Schema.String),
  refrain: Schema.optionalKey(Schema.NullOr(Schema.String)),
  refrainRows: Schema.optionalKey(Schema.NullOr(Schema.Array(Schema.String))),
  odd: Schema.optionalKey(Schema.NullOr(Schema.String)),
  by: Schema.optionalKey(Schema.Literals(['reader', 'ocr'])),
});
const ReaderRecord = Schema.Struct({ hymns: Schema.Array(ReaderHymn) });

const loadReadings = (root: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const readings: Reading[] = [];
    for (const file of yield* filesUnder(path.join(root, 'read'), '.json')) {
      const record = Schema.decodeUnknownOption(ReaderRecord)(
        JSON.parse(yield* fs.readFileString(path.join(root, 'read', file))),
      );
      if (Option.isNone(record)) return yield* Effect.die(`read/${file} is not a reader's record`);
      readings.push(...record.value.hymns);
    }
    return readings;
  });

const loadOutlineReports = (dir: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const outlines: Outline[] = [];
    for (const file of yield* filesUnder(dir, '.json')) {
      const record = yield* Schema.decodeEffect(Schema.fromJsonString(ReportFile))(
        yield* fs.readFileString(path.join(dir, file)),
      );
      outlines.push(
        ...record.hymns.map((one) => outlineOfReport(one, path.basename(file, '.json'))),
      );
    }
    return outlines;
  });

export const outlineReportProblems = (sources: Sources, reports: readonly Outline[]): string[] => {
  const key = (outline: Outline) => JSON.stringify(outline);
  const given = new Set(reports.map(key));
  const committed = [...sources.outlines.values()].flat();
  const kept = new Set(committed.map(key));
  return [
    ...committed
      .filter((outline) => !given.has(key(outline)))
      .map((outline) => `${outline.number} shape (${outline.reader}) is no shape reader's report`),
    ...reports
      .filter((outline) => !kept.has(key(outline)))
      .map(
        (outline) => `${outline.number} shape (${outline.reader}) is reported but not committed`,
      ),
  ];
};

const readingsRun = (census: Census, sources: Sources, root: string) =>
  Effect.gen(function* () {
    const deciding = decidingOf(sources.inventory);
    const readings = lentReadings(sources.inventory, deciding, yield* loadReadings(root));
    return [
      ...census.hymns.flatMap((entry) =>
        readingProblems(
          entry,
          deciding.get(entry.number) ?? NO_PAGE,
          baseOf(sources, entry.number),
          sources.rulings.get(entry.number) ?? [],
          readings,
          sources.outlines.get(entry.number) ?? [],
        ),
      ),
    ];
  });

export const hunkLine = (n: number, [unit, mine, other]: Hunk) =>
  `hunk ${n} ${unit} row=${wordTag(mine)} witness=${wordTag(other)}`;

const witnessRun = (census: Census, sources: Sources, root: string) =>
  Effect.gen(function* () {
    const witness = yield* loadWitness(root);
    const problems: string[] = [];
    let [hymns, hunks] = [0, 0];
    for (const entry of census.hymns) {
      const theirs = witness.get(entry.number);
      const found =
        theirs === undefined ? undefined : hunksOf(sources.rows.get(entry.number) ?? [], theirs);
      if (found !== undefined) {
        hymns += 1;
        hunks += found.length;
        for (const hunk of found) console.log(hunkLine(entry.number, hunk));
      }
      const fresh =
        found === undefined ? 'absent' : { hunks: found.length, digest: digestOf(found) };
      if (JSON.stringify(entry.witness) !== JSON.stringify(fresh))
        problems.push(`${entry.number} witness stale`);
    }
    console.log(`witness hymns=${hymns} absent=${LAST - FIRST + 1 - hymns} hunks=${hunks}`);
    return problems;
  });

const run = (flags: {
  readonly readings?: string | undefined;
  readonly scans?: string | undefined;
  readonly witness?: string | undefined;
  readonly reports?: string | undefined;
}) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const census = yield* decodeCensus(yield* fs.readFileString(path.join(DATA, 'census.json')));
    const sources = yield* loadSources;
    const problems = problemsOf(census, sources);
    if (flags.scans !== undefined)
      problems.push(
        ...scanStatusProblems(
          sources.inventory,
          yield* fs.readDirectory(path.resolve(flags.scans)),
        ),
      );
    if (flags.readings !== undefined)
      problems.push(...(yield* readingsRun(census, sources, path.resolve(flags.readings))));
    if (flags.reports !== undefined || flags.readings !== undefined)
      problems.push(
        ...outlineReportProblems(
          sources,
          yield* loadOutlineReports(
            path.resolve(flags.reports ?? path.join(flags.readings ?? '', 'shape')),
          ),
        ),
      );
    if (flags.witness !== undefined)
      problems.push(...(yield* witnessRun(census, sources, path.resolve(flags.witness))));
    for (const line of censusLines(census, sources, problems)) console.log(line);
    if (problems.length > 0) process.exitCode = 1;
  });

export const censusLines = (
  census: Census,
  sources: Sources,
  problems: readonly string[],
): string[] => {
  const count = (row: Entry['row']) => census.hymns.filter((entry) => entry.row === row).length;
  const rulings = [...sources.rulings.values()].reduce((sum, all) => sum + all.length, 0);
  return [
    ...problems.map((problem) => `problem ${wordlessLine(problem)}`),
    ...census.hymns
      .filter((entry) => entry.row === 'unsettled' || entry.row === 'nopage')
      .map((entry) => `${entry.row} ${entry.number} ${wordlessLine(entry.note ?? '')}`),
    `census hymns=${LAST - FIRST + 1} entries=${census.hymns.length} problems=${problems.length} matches=${count('matches')} fixed=${count('fixed')} unsettled=${count('unsettled')} nopage=${count('nopage')} rulings=${rulings}`,
  ];
};

export const censusLayer = Layer.merge(
  layerSourceText.pipe(Layer.provide(BunServices.layer)),
  BunServices.layer,
);

export const readCensusOnce = Effect.runSync(
  Effect.cached(
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const census = yield* decodeCensus(yield* fs.readFileString(path.join(DATA, 'census.json')));
      const sources = yield* loadSources;
      return { census, sources };
    }).pipe(Effect.provide(censusLayer)),
  ),
);

if (import.meta.main) {
  const args = process.argv.slice(2);
  const after = (flag: string) => {
    const at = args.indexOf(flag);
    return at < 0 ? undefined : (args[at + 1] ?? '');
  };
  await Effect.runPromise(
    run({
      readings: after('--readings'),
      scans: after('--scans'),
      witness: after('--witness'),
      reports: after('--shapes'),
    }).pipe(Effect.provide(censusLayer)),
  );
}
