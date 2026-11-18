/**
 * Heartseed's home and a list's own page (`pm-hs-home`). The One side
 * opens home (every launch's screen after the first minute) over the row's
 * fixture; the port's side opens on home over the same fixture written to
 * its store (`pixel shot`), and is scored over its band: from the bottom of
 * the navigation bar (`EXACT_BAND.top`) to the top of the tab bar.
 */
import type { Row, Step } from '../../src/model.ts';
import { banded, HOME_BAND, LIST_BAND } from './band.ts';

const unit = 'pm-hs-home';

export const HOME: Step = { open: '/', expect: 'id=today-card' };

/** The Psalms list's header scrolled to: the largest text sizes push it below the fold. */
const OPEN_PSALM: Step = { scroll: 'label=Open Psalms 23:1-5', direction: 'down' };
export const FOOT: Step = { scroll: 'label=How Heartseed works', direction: 'down' };

/** The port's band on home: from `home-band`, the zero-high top of home's content under the navigation bar, to the tab bar, each read with the agent's `layout` at the capture. */
const EXACT_BAND = { top: 'home-band', bottom: 'tabs' };

/** The port's band on a list's page: from `list-band`, the top of the page's content under the bar. */
const LIST_EXACT_BAND = { top: 'list-band', bottom: 'tabs' };

/** The port's home over the fixture, its garden read and the session's plan made. */
const EXACT_HOME: ReadonlyArray<string> = ['clock data', 'clock settle', 'clock data'];

/** The port's home scrolled to its foot. */
const EXACT_FOOT: ReadonlyArray<string> = [...EXACT_HOME, 'tap home-scroll drag 0 -3000'];

/** The ids of the `hs-lists` fixture's two lists as the port names a row (`row-title-<slug>`). */
const PSALM_LIST = 'passage-0-19-23-1-5';
const ROMANS_LIST = 'passage-1-45-8-28-39';

/** The port's page of the list `slug`. */
const exactList = (slug: string): ReadonlyArray<string> => [
  ...EXACT_HOME,
  `tap row-title-${slug}`,
  'clock data',
  'clock settle',
];

/** `ops` on the port, scored over its band. */
const exact = (ops: ReadonlyArray<string>, band = EXACT_BAND) => ({ ops, band });

const homeRows: ReadonlyArray<Row> = [
  {
    id: 'home.fresh',
    unit,
    kind: 'match',
    sweep: true,
    fixture: 'hs-fresh',
    one: { steps: [HOME] },
    exact: exact(EXACT_HOME),
  },
  {
    id: 'home.due',
    unit,
    kind: 'match',
    sweep: true,
    fixture: 'hs-due',
    one: { steps: [HOME] },
    exact: exact(EXACT_HOME),
  },
  {
    id: 'home.tended',
    unit,
    kind: 'match',
    fixture: 'hs-tended',
    one: { steps: [HOME] },
    exact: exact(EXACT_HOME),
  },
  {
    id: 'home.lists',
    unit,
    kind: 'match',
    sweep: true,
    fixture: 'hs-lists',
    one: { steps: [HOME] },
    exact: exact(EXACT_HOME),
  },
  {
    id: 'home.foot',
    unit,
    kind: 'match',
    fixture: 'hs-lists',
    anchor: 'bottom',
    one: { steps: [HOME, FOOT] },
    exact: exact(EXACT_FOOT),
  },
  {
    id: 'home.limit',
    unit,
    kind: 'match',
    fixture: 'hs-limit',
    anchor: 'bottom',
    one: { steps: [HOME, FOOT] },
    exact: exact(EXACT_FOOT),
  },
  {
    id: 'home.single-ask',
    unit,
    kind: 'match',
    fixture: 'hs-lists',
    one: {
      steps: [
        HOME,
        { scroll: 'label=Remove John 11:35', direction: 'down' },
        { tap: 'label=Remove John 11:35' },
      ],
    },
    exact: exact([...EXACT_HOME, 'tap single-remove-John-11-35', 'clock settle']),
  },
  {
    id: 'home.greeting-morning',
    unit,
    kind: 'match',
    fixture: 'hs-fresh',
    clock: '09:41',
    one: { steps: [HOME] },
    exact: exact(EXACT_HOME),
  },
  {
    id: 'home.greeting-evening',
    unit,
    kind: 'match',
    fixture: 'hs-fresh',
    clock: '20:41',
    one: { steps: [HOME] },
    exact: exact(EXACT_HOME),
  },
  {
    id: 'home.plant-pressed',
    unit,
    kind: 'match',
    fixture: 'hs-lists',
    one: { steps: [HOME], hold: 'label=Psalms 23:1, seed, ready today' },
    exact: exact([...EXACT_HOME, 'tap plant-Psalms-23-1 down']),
  },
];

const listRows: ReadonlyArray<Row> = [
  {
    id: 'list.page',
    unit,
    kind: 'match',
    sweep: true,
    fixture: 'hs-lists',
    one: { steps: [HOME, OPEN_PSALM, { tap: 'label=Open Psalms 23:1-5' }] },
    exact: exact(exactList(PSALM_LIST), LIST_EXACT_BAND),
  },
  {
    id: 'list.unplanted',
    unit,
    kind: 'match',
    fixture: 'hs-lists',
    one: { steps: [HOME, { tap: 'label=Open Romans 8:28-39' }] },
    exact: exact(exactList(ROMANS_LIST), LIST_EXACT_BAND),
  },
  {
    id: 'list.remove-ask',
    unit,
    kind: 'match',
    fixture: 'hs-lists',
    anchor: 'bottom',
    one: {
      steps: [
        HOME,
        OPEN_PSALM,
        { tap: 'label=Open Psalms 23:1-5' },
        { scroll: 'label=Remove Psalms 23:1-5', direction: 'down' },
        { tap: 'label=Remove Psalms 23:1-5' },
      ],
    },
    exact: exact(
      [
        ...exactList(PSALM_LIST),
        'tap list-scroll drag 0 -3000',
        'tap list-remove',
        'clock settle',
        'tap list-scroll drag 0 -3000',
      ],
      LIST_EXACT_BAND,
    ),
  },
];

export const rows: ReadonlyArray<Row> = [
  ...homeRows.map(banded(HOME_BAND)),
  ...listRows.map(banded(LIST_BAND)),
];
