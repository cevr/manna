/* oxlint-disable effect/noTernary -- the model and the cases write their expected values as plain branches. */

/**
 * R2, R3, R6 and R7 over generated books, against a plain model: each book
 * is built from its parts (sections with and without sub-headings, empty
 * ones, shared titles, sub-headings listed out of para order, sections left
 * out) and each row from how it was made (a bullet with a blank, a label at
 * or past 40 characters, links joined by `,`, `;` or one `and`, a note
 * after the lead holding links of its own, an unlinked plain reference,
 * headings, quotations, tables, numbered lines, rows before the first
 * entry, duplicate ranges). What the book must give is written down as it
 * is built, never by reading the rows again.
 *
 * It catches a reference taken from a line's note, a 40-character label
 * refused or a 41-character one taken, two lists of one title merged, an
 * empty section or list kept, a row given to the wrong entry, a duplicate
 * range kept, a skipped record lost or repeated, and a left-out section's
 * rows read. Chapters are 30 verses here (`count`); R4 and R5 over their
 * whole domain are `reference.property.test.ts`'s.
 */

import { BIBLE_BOOKS, getBibleBookByName } from '@manna/core/bible';
import { describe, expect, it } from 'bun:test';
import { Option } from 'effect';

import contents from '../../data/handbook-contents.json';
import {
  handbookOf,
  LEFT_OUT_SECTIONS,
  type List,
  type Lists,
  missingSections,
  type Node,
  type Row,
  type Skip,
} from './lists';
import type { Range } from './reference';
import type { Entry } from './source';

const random = (seed: number) => {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
};
const below = (next: () => number, n: number) => Math.floor(next() * n);
const pick = <A>(next: () => number, list: readonly A[]): A => list[below(next, list.length)]!;
const chance = (next: () => number, p: number) => next() < p;

const SIZE = 30;
const CHAPTERS = new Map(BIBLE_BOOKS.map((book) => [Number(book.number), book.chapters]));
const count = (book: number, chapter: number) =>
  chapter >= 1 && chapter <= (CHAPTERS.get(book) ?? 0) ? SIZE : 0;
const bookOf = (name: string) =>
  Option.map(getBibleBookByName(name), (book) => Number(book.number));
const MANY = BIBLE_BOOKS.filter((book) => book.chapters > 2);

const LEFT_OUT = ['Dress', 'City Work'];
const SECTION_TITLES = ['Prophecy', 'Prayer', 'Nature of Man', 'Dress', 'City Work', 'Prophecy'];
const SUB_TITLES = [
  'Second Chapter of Daniel',
  'What Is Death?',
  'Are The Dead Conscious?',
  'Glorious Appearing Of Christ',
  'Effect of Christ’s Coming on the Earth, or the Millennium',
];

/** A book under construction: its rows, its tallies, and what each entry and the skipped list must hold. */
interface Built {
  readonly rows: Row[];
  readonly tally: Map<string, number>;
  readonly ranges: Map<number, Range[]>;
  readonly skipped: Skip[];
}

const add = (built: Built, key: string) => built.tally.set(key, (built.tally.get(key) ?? 0) + 1);
const text = (value: string): Node => ({ _tag: 'Text', text: value });
const sameRange = (a: Range, b: Range) =>
  a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3];
const expectRange = (held: Range[], range: Range) => {
  if (!held.some((each) => sameRange(each, range))) held.push(range);
};
const expectSkip = (built: Built, skip: Skip) => {
  const same = built.skipped.some(
    (each) =>
      each.para === skip.para &&
      each.ref === skip.ref &&
      each.title === skip.title &&
      each.reason === skip.reason,
  );
  if (!same) built.skipped.push(skip);
};

/** One link as it is built: its node, and each range it keeps or the reason it drops. */
interface Link {
  readonly node: Node;
  readonly title: string;
  readonly shown: string;
  readonly outcome: readonly (Range | 'past-chapter' | 'long' | 'unread')[];
}

const linkOf = (next: () => number, earlier: readonly Link[]): Link => {
  const kind = below(next, 9);
  if (kind === 8 && earlier.length > 0) return pick(next, earlier);
  const book = pick(next, MANY);
  const number = Number(book.number);
  const chapter = 1 + below(next, book.chapters - 1);
  const verse = 1 + below(next, 25);
  const named = (shown: string) => (chance(next, 0.5) ? `${book.name} ${shown}` : shown);
  const title = `${book.name} ${chapter}:${verse}`;
  const make = (shown: string, outcome: Link['outcome']): Link => {
    const full = named(shown);
    return {
      node: { _tag: 'ScriptureRef', title, children: [text(full)] },
      title,
      shown: full,
      outcome,
    };
  };
  if (kind === 0) return make(`${chapter}:${verse}`, [[number, chapter, verse, verse]]);
  if (kind === 1)
    return make(`${chapter}:${verse}-${verse + 4}`, [[number, chapter, verse, verse + 4]]);
  if (kind === 2)
    return make(`${chapter}:${verse}, ${verse + 2}`, [
      [number, chapter, verse, verse],
      [number, chapter, verse + 2, verse + 2],
    ]);
  if (kind === 3)
    return make(`${chapter}:${verse}, ${SIZE + 1}`, [
      [number, chapter, verse, verse],
      'past-chapter',
    ]);
  if (kind === 4) return make(`${chapter}:1-21`, ['long']);
  if (kind === 5) return make(`${chapter + 1}:${verse}`, ['unread']);
  if (kind === 6) return make(`${chapter}`, ['long']);
  return make(`${chapter}:${verse}-${verse + 5}`, [[number, chapter, verse, verse + 5]]);
};

/** Letters and spaces after the label's capital and `a `: never a word followed by a number, so no label reads as a plain reference. */
const LETTERS = 'abcdefghij klmnopqrstuvwxyz ';
const wordsOf = (next: () => number, length: number) =>
  Array.from({ length }, (_, index) => {
    if (index === 0) return 'a';
    if (index === 1) return ' ';
    return LETTERS[below(next, LETTERS.length)]!;
  }).join('');

/** A line's opening after its `•`: blank, or a label at or past 40 characters, and whether its links are a lead. */
const openingOf = (next: () => number, built: Built): readonly [string, boolean] => {
  const kind = below(next, 8);
  if (kind <= 2) return [pick(next, ['', ' ', '  ']), true];
  if (kind === 3) {
    add(built, 'label 40');
    return [` S${wordsOf(next, 40)}${pick(next, ['.', ':'])} `, true];
  }
  if (kind === 4) {
    add(built, 'label 41');
    return [` S${wordsOf(next, 41)}. `, false];
  }
  if (kind === 5) {
    add(built, 'label short');
    return [` ${pick(next, ['Sinner', 'Rain', 'The Saint', 'Q'])}${pick(next, ['.', ':'])} `, true];
  }
  if (kind === 6) {
    add(built, 'label with digit');
    return [` Psalm ${1 + below(next, 9)}. `, false];
  }
  add(built, 'label with semicolon');
  return [` Sin; death. `, false];
};

const JOINS = [', ', '; ', ' and ', ', and ', ',', ' ', ';'];
const BREAKS: readonly Node[] = [
  text(' to '),
  text(' and and '),
  text(' compare '),
  { _tag: 'Emphasis', children: [text('see')] },
];

/** A bullet line of paragraph `para` in entry `owner`, its lead and its note, with what it must give. */
const bulletOf = (
  next: () => number,
  built: Built,
  para: number,
  owner: number,
  counted: boolean,
) => {
  const [opening, lead] = openingOf(next, built);
  const earlier: Link[] = [];
  const links = Array.from({ length: 1 + below(next, 3) }, () => {
    const link = linkOf(next, earlier);
    earlier.push(link);
    return link;
  });
  const nodes: Node[] = [text(`${pick(next, ['', ' ', '\n'])}•${opening}`)];
  for (const [index, link] of links.entries()) {
    if (index > 0) nodes.push(text(pick(next, JOINS)));
    nodes.push(link.node);
  }
  if (chance(next, 0.6)) {
    add(built, 'note with link');
    nodes.push(pick(next, BREAKS), linkOf(next, []).node, text(' a note.'));
  }
  built.rows.push({ para, type: 'p', nodes });
  if (!lead || !counted) return;
  add(built, 'lead');
  if (links.length > 1) add(built, 'joined links');
  const held = built.ranges.get(owner) ?? [];
  built.ranges.set(owner, held);
  for (const link of links)
    for (const each of link.outcome) {
      if (Array.isArray(each)) expectRange(held, each as Range);
      else
        expectSkip(built, {
          para: `978.${para}`,
          ref: link.shown,
          title: link.title,
          reason: each as Skip['reason'],
        });
    }
};

/** A line with no link whose text opens with a reference written plainly. */
const unlinkedOf = (next: () => number, built: Built, para: number, counted: boolean) => {
  const name = pick(next, ['Act', 'Rom.', '1 Cor.', 'Matt', '2 Pet.']);
  const ref = `${name} ${1 + below(next, 20)}:${1 + below(next, 20)}${pick(next, ['', `-${21 + below(next, 9)}`])}`;
  const nodes = chance(next, 0.5)
    ? [text(`• ${ref} — a note.`)]
    : [text('• '), text(`${ref}, a note.`), linkOf(next, []).node];
  built.rows.push({ para, type: 'p', nodes });
  if (!counted) return;
  add(built, 'unlinked');
  expectSkip(built, { para: `978.${para}`, ref, reason: 'unlinked' });
};

/** A row that gives nothing: a heading, prose or a quotation with links, a table, a numbered line, a bullet of another type. */
const quietOf = (next: () => number, built: Built, para: number) => {
  const link = linkOf(next, []).node;
  const kind = below(next, 6);
  add(built, 'quiet');
  if (kind === 0) built.rows.push({ para, type: 'h3', nodes: [text('A Heading')] });
  else if (kind === 1) built.rows.push({ para, type: 'p', nodes: [text('Prose naming '), link] });
  else if (kind === 2) built.rows.push({ para, type: 'p', nodes: [text('“A quotation” '), link] });
  else if (kind === 3) built.rows.push({ para, type: 'table', nodes: [text('• '), link] });
  else if (kind === 4) built.rows.push({ para, type: 'p', nodes: [text('1. '), link] });
  else built.rows.push({ para, type: 'p', nodes: [text('A line • '), link] });
};

/** The rows of entry `owner`, from its own para (a heading the corpus lost) or after it; none of them counts when `counted` is false. */
const rowsOf = (
  next: () => number,
  built: Built,
  from: number,
  owner: number,
  counted: boolean,
) => {
  const length = below(next, 5);
  const start = chance(next, 0.3) ? 0 : 1;
  if (start === 0 && length > 0) add(built, 'line at its entry’s para');
  for (let index = start; index < start + length; index += 1) {
    const para = from + index;
    const kind = below(next, 10);
    if (kind <= 5) bulletOf(next, built, para, owner, counted);
    else if (kind === 6) unlinkedOf(next, built, para, counted);
    else quietOf(next, built, para);
  }
  return from + length + 1;
};

/** A generated book: its contents in contents order, its rows shuffled, and what it must give. */
const bookCase = (seed: number) => {
  const next = random(seed);
  const built: Built = { rows: [], tally: new Map(), ranges: new Map(), skipped: [] };
  const entries: Entry[] = [];
  const first = 3 + below(next, 4);
  for (let para = 1; para < first; para += 1)
    if (chance(next, 0.5)) bulletOf(next, built, para, 0, false);
    else unlinkedOf(next, built, para, false);
  let para = first;
  for (let section = 0; section < 1 + below(next, 5); section += 1) {
    const title = pick(next, SECTION_TITLES);
    const counted = !LEFT_OUT.includes(title);
    if (!counted) add(built, 'left out');
    const head: Entry = { para, level: 1, title };
    entries.push(head);
    para = rowsOf(next, built, para, head.para, counted);
    const subs: Entry[] = [];
    const shared = chance(next, 0.3);
    for (let sub = 0; sub < below(next, 4); sub += 1) {
      const entry: Entry = {
        para,
        level: 2,
        title: shared ? SUB_TITLES[0]! : pick(next, SUB_TITLES),
      };
      subs.push(entry);
      para = rowsOf(next, built, para, entry.para, counted);
    }
    if (subs.length > 1 && chance(next, 0.4)) {
      add(built, 'out of para order');
      const [a, b] = [subs[0]!, subs[1]!];
      subs.splice(0, 2, b, a);
    }
    entries.push(...subs);
  }
  const rows = [...built.rows].sort(() => next() - 0.5);
  return { entries, rows, built };
};

/** What the model says a book gives: each section in contents order with its own list first, then its sub-headings'. */
const expectedOf = (entries: readonly Entry[], built: Built): Lists => {
  const sections: { id: string; title: string; lists: List[] }[] = [];
  for (const entry of entries) {
    if (entry.level === 1)
      sections.push({ id: `bhb-${entry.para}`, title: entry.title, lists: [] });
    const ranges = built.ranges.get(entry.para) ?? [];
    if (ranges.length > 0)
      sections.at(-1)!.lists.push({ id: `bhb-${entry.para}`, title: entry.title, ranges });
  }
  return { sections: sections.filter((each) => each.lists.length > 0), skipped: built.skipped };
};

const CASES = Array.from({ length: 600 }, (_, index) => bookCase(31337 + index * 7919));

describe('the rows read as lists under their headings (R2, R3, R6, R7)', () => {
  it('gives every generated book’s sections, lists, ids and skipped records as the model does', () => {
    const wrong = CASES.filter(
      ({ entries, rows, built }) =>
        !Bun.deepEquals(
          handbookOf(rows, entries, bookOf, count, LEFT_OUT),
          expectedOf(entries, built),
        ),
    );
    for (const first of wrong.slice(0, 1))
      expect(handbookOf(first.rows, first.entries, bookOf, count, LEFT_OUT)).toEqual(
        expectedOf(first.entries, first.built),
      );
    expect(wrong.length).toBe(0);
  });

  it('meets each class’s floor', () => {
    const tally = new Map<string, number>();
    for (const { built, entries } of CASES) {
      for (const [key, value] of built.tally) tally.set(key, (tally.get(key) ?? 0) + value);
      const expected = expectedOf(entries, built);
      const titles = expected.sections.flatMap((section) =>
        section.lists.map((list) => list.title),
      );
      if (titles.length > new Set(titles).size)
        tally.set('shared titles', (tally.get('shared titles') ?? 0) + 1);
      if (
        entries.some(
          (entry) =>
            entry.level === 1 && !expected.sections.some((each) => each.id === `bhb-${entry.para}`),
        )
      )
        tally.set('empty section', (tally.get('empty section') ?? 0) + 1);
    }
    const floors = {
      lead: 1500,
      'joined links': 800,
      'note with link': 1000,
      'label 40': 150,
      'label 41': 150,
      'label short': 150,
      'label with digit': 150,
      'label with semicolon': 150,
      unlinked: 300,
      quiet: 500,
      'left out': 100,
      'out of para order': 50,
      'line at its entry’s para': 300,
      'shared titles': 50,
      'empty section': 50,
    };
    const short = Object.entries(floors).filter(([key, floor]) => (tally.get(key) ?? 0) < floor);
    expect(short.map(([key]) => `${key} ${tally.get(key) ?? 0}`)).toEqual([]);
  });

  it('names each left-out title the contents does not hold as a section', () => {
    const entries = contents.entries as readonly Entry[];
    expect(missingSections(entries, LEFT_OUT_SECTIONS)).toEqual([]);
    expect(LEFT_OUT_SECTIONS).toHaveLength(8);
    expect(
      missingSections(entries, [
        ...LEFT_OUT_SECTIONS,
        'Bible Etiquettes',
        'Second Chapter of Daniel',
      ]),
    ).toEqual(['Bible Etiquettes', 'Second Chapter of Daniel']);
  });
});
