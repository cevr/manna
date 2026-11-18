/**
 * Heartseed's Add a list sheet and the chooser (`pm-hs-add`), from home's
 * `Add a list`. The chooser's rows are gaps: the port chooses a passage in
 * its Read tab instead.
 */
import type { Row, Step } from '../../src/model.ts';
import { HOME } from './home.ts';

const unit = 'pm-hs-add';

const SHEET: ReadonlyArray<Step> = [
  HOME,
  { scroll: 'id=add-list', direction: 'down' },
  { tap: 'id=add-list' },
  { wait: 800 },
];
const BOOKS: ReadonlyArray<Step> = [...SHEET, { tap: 'label=Any passage' }, { wait: 600 }];

/** The port's way to the sheet: home's `Add a list`. */
const EXACT_SHEET: ReadonlyArray<string> = [
  'clock data',
  'clock settle',
  'tap add-list',
  'clock data',
  'clock settle',
];

/**
 * The scroll that puts `Seven Churches` where One's reference has it: its
 * card's top 1951 pt into the shelves, measured on both pictures (One's
 * card edge, the port's `layout` of the shelf at no scroll).
 */
const HANDBOOK_SCROLL = 'tap add-verses drag 0 -1951';

/** The scroll indicator the drag leaves showing at the capture; One's had faded. */
const INDICATOR = {
  x: 394,
  y: 560,
  width: 8,
  height: 280,
  reason: "the scroll indicator the port's drag leaves showing, faded in One's capture",
};

export const rows: ReadonlyArray<Row> = [
  {
    id: 'add.sheet',
    unit,
    kind: 'match',
    sweep: true,
    fixture: 'hs-fresh',
    one: { steps: SHEET },
    exact: { ops: EXACT_SHEET },
  },
  {
    id: 'add.shelf-open',
    unit,
    kind: 'match',
    fixture: 'hs-fresh',
    one: { steps: [...SHEET, { tap: 'label=Psalms' }, { wait: 500 }] },
    exact: { ops: [...EXACT_SHEET, 'tap shelf-psalms', 'clock data', 'clock settle'] },
  },
  {
    id: 'add.handbook',
    unit,
    kind: 'match',
    fixture: 'hs-fresh',
    one: {
      steps: [
        ...SHEET,
        { scroll: 'label=Seven Churches', direction: 'down' },
        { tap: 'label=Seven Churches' },
        { wait: 500 },
      ],
    },
    exact: {
      ops: [
        ...EXACT_SHEET,
        HANDBOOK_SCROLL,
        'clock settle',
        'tap shelf-handbook-bhb-1808',
        'clock data',
        'clock settle',
      ],
      masks: [INDICATOR],
    },
  },
  {
    id: 'add.pending',
    unit,
    kind: 'match',
    fixture: 'hs-fresh',
    one: {
      steps: [],
      notDrawn: {
        ios: 'a plant is pending for the length of one store write, under the two takes a still capture needs',
      },
    },
  },
  { id: 'chooser.books', unit, kind: 'gap', fixture: 'hs-fresh', one: { steps: BOOKS } },
  {
    id: 'chooser.chapters',
    unit,
    kind: 'gap',
    fixture: 'hs-fresh',
    one: { steps: [...BOOKS, { tap: 'label=Psalms' }, { wait: 500 }] },
  },
  {
    id: 'chooser.verses',
    unit,
    kind: 'gap',
    fixture: 'hs-fresh',
    one: { steps: [...BOOKS, { tap: 'label=Psalms' }, { tap: 'label=Psalms 23' }, { wait: 500 }] },
  },
];
