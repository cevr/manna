/**
 * How the rows of Haskell's *Bible Handbook* (1919) become lists of ranges
 * under his own headings: which entry of the contents a row belongs to
 * (R2), which rows are lines and which of their links are the line's own
 * references (R3), a reference written plainly with no link (R6), and the
 * lists and sections they make (R7). Only a line's lead is read: a
 * reference in Haskell's note after it is never data.
 */

import { Array as Arr, Option } from 'effect';

import { placeRange, readLink, type Range, type Reason } from './reference';
import type { Entry } from './source';

/** A node of a row as the EGW corpus stores it: a `Text`, a `ScriptureRef` (its `title`, its shown text in `children`) or another kind. */
export interface Node {
  readonly _tag: string;
  readonly text?: string;
  readonly title?: string;
  readonly children?: readonly Node[];
}

/** One row of the book: its paragraph number (`978.<para>`), its element type and its nodes. */
export interface Row {
  readonly para: number;
  readonly type: string;
  readonly nodes: readonly Node[];
}

/** A list: one heading's ranges in Haskell's order, its id `bhb-<para>` and his title. */
export interface List {
  readonly id: string;
  readonly title: string;
  readonly ranges: readonly Range[];
}

/** A section: a level-1 heading of the contents and its lists. */
export interface Section {
  readonly id: string;
  readonly title: string;
  readonly lists: readonly List[];
}

/** A reference left out: its paragraph, its text as shown, the link's own title (none for an unlinked one) and why. */
export interface Skip {
  readonly para: string;
  readonly ref: string;
  readonly title?: string;
  readonly reason: Reason;
}

/** The book as lists: its sections, and each reference left out. */
export interface Lists {
  readonly sections: readonly Section[];
  readonly skipped: readonly Skip[];
}

/**
 * The sections left out, by Haskell's titles: the practical ones, which the
 * owner keeps out of the lists (2026-11-09, q2 (b): teaching sections
 * only). A title the contents no longer holds is named by `missingSections`.
 */
export const LEFT_OUT_SECTIONS: readonly string[] = [
  'City Work',
  'Business Principles',
  'School of the Prophets',
  'Health and Temperance',
  'Dress',
  'Organization of Local Churches Officers',
  'Diet and Dress',
  'Bible Etiquette',
];

/** The titles of `leftOut` that name no section of the contents. */
export const missingSections = (
  entries: readonly Entry[],
  leftOut: readonly string[],
): readonly string[] => {
  const sections = new Set(
    entries.filter((entry) => entry.level === 1).map((entry) => entry.title),
  );
  return leftOut.filter((title) => !sections.has(title));
};

const LABEL = /^\s*[A-Z][^\d.:;]{0,40}[.:]\s*$/;
const BETWEEN = /^[\s,;]*(?:and\s*)?$/;
const UNLINKED = /^(?:[1-3] )?[A-Z][a-z]+\.? \d+:\d+(?:-\d+)?/;

/** A node's text with its children's. */
export const textOf = (nodes: readonly Node[]): string =>
  nodes.map((node) => `${node.text ?? ''}${textOf(node.children ?? [])}`).join('');

/** R2: for a row's paragraph number, the entry it belongs to, the one with the greatest para at most its own. */
export const ownerOf = (entries: readonly Entry[]): ((para: number) => Option.Option<Entry>) => {
  const sorted = [...entries].sort((a, b) => a.para - b.para);
  return (para) => Arr.findLast(sorted, (entry) => entry.para <= para);
};

/** What a row gives: nothing, its lead's links (R3), or a reference written plainly with no link (R6). */
export type Line =
  | { readonly _tag: 'None' }
  | { readonly _tag: 'Lead'; readonly links: readonly Node[] }
  | { readonly _tag: 'Unlinked'; readonly ref: string };

/** The links that open a line, after a blank or a label, joined by spaces, commas, semicolons and one `and`. */
const leadOf = (after: string, rest: readonly Node[]): readonly Node[] => {
  if (after.trim() !== '' && !LABEL.test(after)) return [];
  const links: Node[] = [];
  for (const node of rest) {
    if (node._tag === 'ScriptureRef') links.push(node);
    else if (node._tag !== 'Text' || !BETWEEN.test(node.text ?? '')) break;
  }
  return links;
};

/** The bullet line's opening text, when the row is a `p` whose first node is a Text opening with `•`. */
const openingOf = (row: Row): Option.Option<string> =>
  Arr.head(row.nodes).pipe(
    Option.filter((head) => row.type === 'p' && head._tag === 'Text'),
    Option.map((head) => (head.text ?? '').trimStart()),
    Option.filter((opening) => opening.startsWith('•')),
  );

/** R3 and R6: a bullet line's lead's links, or a plain reference when it has none. */
export const lineOf = (row: Row): Line =>
  Option.match(openingOf(row), {
    onNone: (): Line => ({ _tag: 'None' }),
    onSome: (opening): Line => {
      const links = leadOf(opening.slice(1), row.nodes.slice(1));
      if (links.length > 0) return { _tag: 'Lead', links };
      const plain = textOf(row.nodes).trimStart().slice(1).trimStart();
      return Option.match(Option.fromNullishOr(UNLINKED.exec(plain)), {
        onNone: (): Line => ({ _tag: 'None' }),
        onSome: ([ref]): Line => ({ _tag: 'Unlinked', ref }),
      });
    },
  });

const sameRange = (a: Range, b: Range) => a.every((value, index) => value === b[index]);

const sameSkip = (a: Skip, b: Skip) =>
  a.para === b.para && a.ref === b.ref && a.title === b.title && a.reason === b.reason;

/** Each entry's section title, by contents order: the last level-1 entry at or before it. */
const sectionTitles = (entries: readonly Entry[]): ReadonlyMap<number, string> => {
  const titles = new Map<number, string>();
  let section = Option.none<string>();
  for (const entry of entries) {
    if (entry.level === 1) section = Option.some(entry.title);
    if (Option.isSome(section)) titles.set(entry.para, section.value);
  }
  return titles;
};

/**
 * Each entry's home, by para: the first entry of its section, in contents
 * order, that has its title. Lists of one title in one section are one list
 * under the first (owner, 2026-11-09, q60 (b)): one plant per verse, and no
 * two controls of a shelf share a name.
 */
const homesOf = (entries: readonly Entry[]): ReadonlyMap<number, number> => {
  const homes = new Map<number, number>();
  let firsts = new Map<string, number>();
  for (const entry of entries) {
    if (entry.level === 1) firsts = new Map();
    const home = firsts.get(entry.title) ?? entry.para;
    firsts.set(entry.title, home);
    homes.set(entry.para, home);
  }
  return homes;
};

/** The ranges each entry's lines give, by its home's para, and each reference left out, in book order. */
interface Read {
  readonly ranges: Map<number, Range[]>;
  readonly skipped: Skip[];
}

/** Each of a lead's links read into `list`, the ranges dropped or unread recorded as skipped. */
const readLead = (
  read: Read,
  para: string,
  links: readonly Node[],
  list: Range[],
  bookOf: (name: string) => Option.Option<number>,
  count: (book: number, chapter: number) => number,
) => {
  const skip = (entry: Skip) => {
    if (!read.skipped.some((each) => sameSkip(each, entry))) read.skipped.push(entry);
  };
  for (const link of links) {
    const ref = textOf(link.children ?? []);
    const title = link.title ?? '';
    const reading = readLink(title, ref, bookOf, count);
    if (reading._tag === 'Unread') skip({ para, ref, title, reason: 'unread' });
    else
      for (const range of reading.ranges) {
        const placed = placeRange(range, count);
        if (placed._tag === 'Dropped') skip({ para, ref, title, reason: placed.reason });
        else if (!list.some((held) => sameRange(held, placed.range))) list.push(placed.range);
      }
  }
};

/** The rows' lines read in para order, each into its owner's ranges, the rows of a left-out section skipped whole. */
const readRows = (
  rows: readonly Row[],
  entries: readonly Entry[],
  bookOf: (name: string) => Option.Option<number>,
  count: (book: number, chapter: number) => number,
  leftOut: readonly string[],
): Read => {
  const sectionOf = sectionTitles(entries);
  const dropped = new Set(leftOut);
  const owner = ownerOf(entries);
  const homes = homesOf(entries);
  const read: Read = { ranges: new Map(), skipped: [] };
  for (const row of [...rows].sort((a, b) => a.para - b.para)) {
    const kept = owner(row.para).pipe(
      Option.filter((entry) => !dropped.has(sectionOf.get(entry.para) ?? '')),
    );
    if (Option.isNone(kept)) continue;
    const para = `978.${row.para}`;
    const line = lineOf(row);
    if (line._tag === 'Unlinked') {
      const entry: Skip = { para, ref: line.ref, reason: 'unlinked' };
      if (!read.skipped.some((each) => sameSkip(each, entry))) read.skipped.push(entry);
    }
    if (line._tag !== 'Lead') continue;
    const home = homes.get(kept.value.para) ?? kept.value.para;
    const list = read.ranges.get(home) ?? [];
    read.ranges.set(home, list);
    readLead(read, para, line.links, list, bookOf, count);
  }
  return read;
};

/** R7: each level-1 entry with its own list, then its sub-headings' in contents order; a title's later lists in a section held by its first, empty lists and sections left out. */
const sectionsOf = (
  entries: readonly Entry[],
  ranges: ReadonlyMap<number, readonly Range[]>,
): readonly Section[] => {
  const sections: { id: string; title: string; lists: List[] }[] = [];
  for (const entry of entries) {
    if (entry.level === 1)
      sections.push({ id: `bhb-${entry.para}`, title: entry.title, lists: [] });
    const held = ranges.get(entry.para) ?? [];
    const current = Arr.last(sections);
    if (Option.isSome(current) && held.length > 0)
      current.value.lists.push({ id: `bhb-${entry.para}`, title: entry.title, ranges: held });
  }
  return sections.filter((section) => section.lists.length > 0);
};

/**
 * R2-R7: the book's sections and lists and each reference left out, from
 * its rows and its contents; the sections titled in `leftOut` and their
 * rows give nothing.
 */
export const handbookOf = (
  rows: readonly Row[],
  entries: readonly Entry[],
  bookOf: (name: string) => Option.Option<number>,
  count: (book: number, chapter: number) => number,
  leftOut: readonly string[],
): Lists => {
  const read = readRows(rows, entries, bookOf, count, leftOut);
  return { sections: sectionsOf(entries, read.ranges), skipped: read.skipped };
};
