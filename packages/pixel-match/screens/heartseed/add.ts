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

export const rows: ReadonlyArray<Row> = [
  { id: 'add.sheet', unit, kind: 'match', sweep: true, fixture: 'hs-fresh', one: { steps: SHEET } },
  {
    id: 'add.shelf-open',
    unit,
    kind: 'match',
    fixture: 'hs-fresh',
    one: { steps: [...SHEET, { tap: 'label=Psalms' }, { wait: 500 }] },
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
    one: { steps: [...BOOKS, { tap: 'label=Psalms' }, { tap: 'label=23' }, { wait: 500 }] },
  },
];
