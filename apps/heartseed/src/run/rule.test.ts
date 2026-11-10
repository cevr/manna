/* oxlint-disable effect/noGlobals -- a frame-rule table: it builds happy-dom nodes by hand in the document the rule reads. */

/**
 * The root's frame rule at the end of a run (`rootFaults` in
 * `src/test/root-rule.ts`, R4), with no app. Hosts are built by hand as
 * Today draws the end: the heading `The field is tended` and the back
 * `‹ Your field` in a header, then a scroll view holding `tended` (a hidden
 * sun, the `grew` line, one `grown` image per verse, each named
 * `<reference>, <stage>` over a hidden picture and a hidden reference).
 *
 * - A correct end with 0, 1 and 3 grown is no fault.
 * - Each cell of R4's table is built from the correct end by one change,
 *   and its faults are exactly the table's words (the reading's fault too
 *   where the change alters what a screen reader reads).
 * - Today's action and Today's nodes on the end keep their own faults.
 * - Each node of the end on each other screen of the rule is the fault
 *   `the end's <id> on <screen>`, beside that screen's own faults.
 */

import { describe, expect, it } from 'bun:test';

import { rootFaults } from '../test/root-rule';
import { grewLine } from '../test/run-model';

const END = 'The field is tended';

const SCREENS = [
  'Your field',
  'Today',
  'When I need…',
  'Add a passage',
  'About',
  'Hear it',
  'Say it with help',
  'Say it alone',
  'Planted',
];

const END_NODES = ['tended', 'grew', 'grown'];

const element = (role: string, label: string, words: string) => {
  const node = document.createElement('div');
  node.setAttribute('role', role);
  node.setAttribute('aria-label', label);
  node.textContent = words;
  return node;
};

const tagged = (id: string) => {
  const node = document.createElement('div');
  node.setAttribute('data-testid', id);
  return node;
};

const picture = () => {
  const node = document.createElement('img');
  node.setAttribute('aria-hidden', 'true');
  return node;
};

const hidden = (words: string) => {
  const node = document.createElement('span');
  node.setAttribute('aria-hidden', 'true');
  node.textContent = words;
  return node;
};

/** The back to home as Today draws it: named `Your field`, its text `‹ Your field`. */
const back = () => element('button', 'Your field', '‹ Your field');

/** A grown verse as the end draws it. */
const grownNode = (reference: string, stage: string) => {
  const node = tagged('grown');
  node.setAttribute('role', 'img');
  node.setAttribute('aria-label', `${reference}, ${stage}`);
  node.append(picture(), hidden(reference));
  return node;
};

type Verse = readonly [reference: string, stage: string];

/** A correct end over `verses`, added to the document, with its parts. */
const endFrame = (verses: readonly Verse[]) => {
  const host = document.createElement('div');
  const header = document.createElement('div');
  const scroll = document.createElement('div');
  scroll.setAttribute('style', 'overflow-y: auto');
  const tended = tagged('tended');
  const grew = tagged('grew');
  grew.textContent = grewLine(verses.length);
  const grown = verses.map(([reference, stage]) => grownNode(reference, stage));
  const list = document.createElement('div');
  list.append(...grown);
  tended.append(picture(), grew, list);
  scroll.append(tended);
  const toField = back();
  header.append(element('heading', END, END), toField);
  host.append(header, scroll);
  document.body.append(host);
  return { host, header, scroll, tended, grew, grown, toField };
};

type Frame = ReturnType<typeof endFrame>;

const ONE: readonly Verse[] = [['Isaiah 41:10', 'blade']];

const THREE: readonly Verse[] = [
  ['Isaiah 41:10', 'blade'],
  ['Psalms 23:1', 'ear'],
  ['John 3:16 ', 'full corn'],
];

const READ_ONE = `${END} ‹ Your field 1 grew a stage.`;

interface Cell {
  readonly cell: string;
  readonly verses?: readonly Verse[];
  readonly garden?: 'read' | 'unread';
  readonly change: (frame: Frame) => void;
  readonly wanted: readonly string[];
}

/** One cell: the correct end over its verses, changed once, and its faults beside the wanted. */
const run = ({ cell, verses = ONE, garden = 'read', change, wanted }: Cell) => {
  const frame = endFrame(verses);
  change(frame);
  const faults = rootFaults(frame.host, garden).toSorted();
  frame.host.remove();
  return { cell, faults, wanted: [...wanted].toSorted() };
};

/** The correct end left as it is. */
const unchanged = () => {};

const first = (frame: Frame) => frame.grown[0] ?? frame.host;

const CORRECT: readonly Cell[] = [[], ONE, THREE].map((verses) => ({
  cell: `a correct end with ${verses.length} grown`,
  verses,
  change: unchanged,
  wanted: [],
}));

const ROWS: readonly Cell[] = [
  {
    cell: 'Your field missing',
    change: (frame) => frame.toField.remove(),
    wanted: [`no Your field on ${END}`, `the end reads ${END} 1 grew a stage.`],
  },
  {
    cell: 'Your field doubled',
    change: (frame) => frame.header.append(back()),
    wanted: [
      `2 Your field controls on ${END}`,
      `the end reads ${END} ‹ Your field ‹ Your field 1 grew a stage.`,
    ],
  },
  {
    cell: 'Your field in the scroll view',
    change: (frame) => frame.scroll.prepend(frame.toField),
    wanted: [`Your field inside a scroll view on ${END}`],
  },
  {
    cell: 'another control',
    change: (frame) => frame.tended.append(element('button', 'Grade', '')),
    wanted: [`the control Grade on ${END}`],
  },
  {
    cell: 'no tended',
    change: (frame) => frame.tended.removeAttribute('data-testid'),
    wanted: [`0 tended nodes on ${END}`],
  },
  {
    cell: 'two tended',
    change: (frame) => {
      const outer = tagged('tended');
      frame.scroll.append(outer);
      outer.append(frame.tended);
    },
    wanted: [`2 tended nodes on ${END}`],
  },
  {
    cell: 'no grew line',
    change: (frame) => frame.grew.removeAttribute('data-testid'),
    wanted: [`0 grew lines on ${END}`, `the end reads ${READ_ONE}`],
  },
  {
    cell: 'two grew lines',
    change: (frame) => {
      const second = tagged('grew');
      second.setAttribute('aria-hidden', 'true');
      second.textContent = 'Nothing grew this time.';
      frame.tended.append(second);
    },
    wanted: [`2 grew lines on ${END}`],
  },
  {
    cell: 'a line of another form',
    change: (frame) => {
      frame.grew.textContent = 'One grew a stage.';
    },
    wanted: ['the grew line One grew a stage.'],
  },
  {
    cell: 'a count of none in numbers',
    verses: [],
    change: (frame) => {
      frame.grew.textContent = '0 grew a stage.';
    },
    wanted: ['the grew line 0 grew a stage.'],
  },
  {
    cell: 'a count that is not the grown',
    change: (frame) => {
      frame.grew.textContent = '2 grew a stage.';
    },
    wanted: ['1 grown under 2 grew a stage.'],
  },
  {
    cell: 'nothing grew over a grown verse',
    change: (frame) => {
      frame.grew.textContent = 'Nothing grew this time.';
    },
    wanted: ['1 grown under Nothing grew this time.'],
  },
  {
    cell: 'a grown button',
    change: (frame) => first(frame).setAttribute('role', 'button'),
    wanted: [
      'a grown node button:Isaiah 41:10, blade',
      `the control Isaiah 41:10, blade on ${END}`,
    ],
  },
  {
    cell: 'a grown node named without its stage',
    change: (frame) => first(frame).setAttribute('aria-label', 'Isaiah 41:10'),
    wanted: ['a grown node img:Isaiah 41:10'],
  },
  {
    cell: 'a grown node named with no stage of the field',
    change: (frame) => first(frame).setAttribute('aria-label', 'Isaiah 41:10, sprout'),
    wanted: ['a grown node img:Isaiah 41:10, sprout'],
  },
  {
    cell: 'a grown node without its image',
    change: (frame) => first(frame).querySelector('img')?.remove(),
    wanted: ['a grown node without its one image'],
  },
  {
    cell: 'a grown node with two images',
    change: (frame) => first(frame).append(picture()),
    wanted: ['a grown node without its one image'],
  },
  {
    cell: 'a verse grown twice',
    verses: [
      ['Isaiah 41:10', 'blade'],
      ['Isaiah 41:10', 'blade'],
    ],
    change: unchanged,
    wanted: ['a verse grown twice'],
  },
  {
    cell: 'tended outside the scroll view',
    change: (frame) => frame.header.append(frame.tended),
    wanted: [
      "the end's tended outside the scroll view",
      "the end's grew outside the scroll view",
      "the end's grown outside the scroll view",
    ],
  },
  {
    cell: 'grew outside the scroll view',
    change: (frame) => frame.header.append(frame.grew),
    wanted: ["the end's grew outside the scroll view"],
  },
  {
    cell: 'grown outside the scroll view',
    change: (frame) => frame.header.append(first(frame)),
    wanted: ["the end's grown outside the scroll view"],
  },
  {
    cell: 'an alert',
    change: (frame) => frame.tended.append(element('alert', '', '')),
    wanted: [`an alert on ${END}`],
  },
  {
    cell: 'a reference exposed',
    change: (frame) => first(frame).querySelector('span')?.removeAttribute('aria-hidden'),
    wanted: [`the end reads ${READ_ONE} Isaiah 41:10`],
  },
  {
    cell: 'three references exposed, the reading cut at 80',
    verses: THREE,
    change: (frame) => {
      for (const node of frame.grown) node.querySelector('span')?.removeAttribute('aria-hidden');
    },
    wanted: [`the end reads ${END} ‹ Your field 3 grew a stage. Isaiah 41:10 Psalms 23:1 John 3`],
  },
  {
    cell: 'an unread garden',
    garden: 'unread',
    change: unchanged,
    wanted: ['the end on an unread garden', `Your field on an unread garden (${END})`],
  },
];

const TODAYS: readonly Cell[] = [
  ...['Next', 'Say it'].map((name) => ({
    cell: `Today's action ${name}`,
    change: (frame: Frame) => frame.scroll.append(element('button', name, name)),
    wanted: [
      `${name} on ${END}`,
      `the control ${name} on ${END}`,
      `the end reads ${READ_ONE} ${name}`,
    ],
  })),
  {
    cell: "Today's action Listening",
    change: (frame) => frame.scroll.append(element('button', 'Listening', 'Listening')),
    wanted: [
      `Listening on ${END}`,
      `the control Listening on ${END}`,
      `the end reads ${READ_ONE} Listening`,
      'Your field in reach while listening',
    ],
  },
  ...['session', 'summary', 'stage'].map((id) => ({
    cell: `Today's ${id}`,
    change: (frame: Frame) => frame.scroll.append(tagged(id)),
    wanted: [`Today's ${id} on ${END}`],
  })),
];

/** The faults of `screen`'s frame by its one heading with `nodes` under its host, sorted. */
const faultsWith = (screen: string, nodes: readonly Element[]) => {
  const host = document.createElement('div');
  host.append(element('heading', screen, screen), ...nodes);
  document.body.append(host);
  const faults = rootFaults(host, 'read').toSorted();
  host.remove();
  return faults;
};

const mismatched = (cells: readonly { faults: string[]; wanted: string[] }[]) =>
  cells.filter((each) => JSON.stringify(each.faults) !== JSON.stringify(each.wanted));

describe("the root's rule at the end of a run", () => {
  it('holds a correct end with 0, 1 and 3 grown to no fault', () => {
    const cells = CORRECT.map(run);
    expect(mismatched(cells)).toEqual([]);
    expect(cells.length).toBe(3);
  });

  it("faults each cell of the end's table with exactly its words", () => {
    const cells = ROWS.map(run);
    expect(mismatched(cells)).toEqual([]);
    expect(cells.length).toBe(25);
  });

  it("keeps Today's action and Today's nodes faults on the end", () => {
    const cells = TODAYS.map(run);
    expect(mismatched(cells)).toEqual([]);
    expect(cells.length).toBe(6);
  });

  it("faults each node of the end on every other screen, beside the screen's own faults", () => {
    const cells = SCREENS.flatMap((screen) =>
      END_NODES.map((id) => ({
        cell: `${id} on ${screen}`,
        faults: faultsWith(screen, [tagged(id)]),
        wanted: [...faultsWith(screen, []), `the end's ${id} on ${screen}`].toSorted(),
      })),
    );
    expect(mismatched(cells)).toEqual([]);
    expect(cells.length).toBe(27);
  });
});
