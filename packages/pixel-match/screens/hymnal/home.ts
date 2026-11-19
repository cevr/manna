/**
 * The hymnal's home and Recent (`pm-hy-home`). Home is the root: the One
 * side opens it, on the web its route `/`. The web's home is One's web
 * file (`Home.tsx`): a title, Settings and the search field over the whole
 * list, with no tab row, so the tabs' rows are not drawn there.
 */
import type { MaskSpec, Row, Step } from '../../src/model.ts';

const unit = 'pm-hy-home';

export const HOME: Step = { open: '/', expect: 'label=Sections' };
export const HOME_WEB: Step = { open: '/', expect: 'label=1, Praise to the Lord' };

/** Why a tab's row has no web cell. */
export const NO_TABS = "One's web home (Home.tsx) draws the list alone, with no tab row";

const tab = (name: string): Row['one'] => ({
  steps: [HOME, { tap: `label=${name}` }, { wait: 600 }],
  notDrawn: { web: NO_TABS },
});

const TO_100: Step = { scroll: 'label=100, Great Is Thy Faithfulness', direction: 'down' };
/**
 * The list scrolled under a sticky section header on iOS: three slow pans of
 * a fixed length land on the same pixel each time, where scrolling until a
 * row shows stops wherever the last fling's momentum leaves it (two takes
 * an hour apart differed by 25 points).
 */
const SLOW_PANS: ReadonlyArray<Step> = Array.from({ length: 3 }, () => ({
  pan: '201,700',
  dx: 0,
  dy: -500,
  ms: 2000,
}));
/**
 * How far the port's list is dragged, in points, to stand where One's three
 * pans leave it: each of One's pans loses its first points to the pan's
 * slop, so the list moves less than the 1,500 points dragged, measured from
 * the rows' places in the two pictures.
 */
const SCROLLED = 1447;
const RECENT: Step = { open: 'recent', expect: 'label=Recent' };

/** Why the rail's numbers are masked: the port has no rail yet (`hymn.rail`'s gap), only its gutter. */
const NO_RAIL = 'the rail is a gap (hymn.rail): the port keeps its gutter, not its numbers';

/**
 * Each of the rail's six numbers on the Sections list at its top, in
 * points, read from the reference's ink (x 1112 to 1166, a label 22 device
 * pixels tall, at 3 px a point), with a point's room round each.
 */
const RAIL_AT_TOP: ReadonlyArray<MaskSpec> = [155, 275, 395, 514, 634, 753].map((y) => ({
  x: 370,
  y,
  width: 20,
  height: 9,
  reason: NO_RAIL,
}));

/** The port's way to a home tab: the home list's tab button. */
const tabOps = (name: string): ReadonlyArray<string> => [
  'clock data',
  `tap tab-${name}`,
  'clock settle',
  'clock data',
  'clock settle',
];

/** The port's way to Recent: its route, opened at the stack's root. */
const RECENT_OPS: ReadonlyArray<string> = [
  'clock data',
  'type root /recent',
  'clock settle',
  'clock data',
  'clock settle',
];

export const rows: ReadonlyArray<Row> = [
  {
    id: 'home.sections',
    unit,
    kind: 'match',
    sweep: true,
    fixture: 'hy-fresh',
    one: { steps: [HOME], web: [HOME_WEB] },
    exact: { ops: ['clock data', 'clock settle'], masks: RAIL_AT_TOP },
  },
  {
    id: 'home.scrolled',
    unit,
    kind: 'match',
    fixture: 'hy-fresh',
    one: { steps: [HOME, ...SLOW_PANS, { wait: 1500 }], web: [HOME_WEB, TO_100, { wait: 800 }] },
    exact: {
      ops: ['clock data', 'clock settle', `tap hymn-list drag 0 -${SCROLLED}`, 'clock settle'],
      masks: RAIL_AT_TOP,
    },
  },
  {
    id: 'home.pinned-tabs',
    unit,
    kind: 'gap',
    fixture: 'hy-fresh',
    one: {
      steps: [HOME, TO_100, { scroll: 'screen', direction: 'up' }, { wait: 800 }],
      notDrawn: { web: NO_TABS },
    },
  },
  {
    id: 'home.lists-empty',
    unit,
    kind: 'match',
    fixture: 'hy-fresh',
    one: tab('Lists'),
    exact: { ops: tabOps('lists') },
  },
  {
    id: 'home.lists',
    unit,
    kind: 'match',
    fixture: 'hy-used',
    one: tab('Lists'),
    exact: { ops: tabOps('lists') },
  },
  {
    id: 'home.topics',
    unit,
    kind: 'match',
    fixture: 'hy-fresh',
    one: tab('Topics'),
    exact: { ops: tabOps('topics') },
  },
  {
    id: 'home.metres',
    unit,
    kind: 'match',
    fixture: 'hy-fresh',
    one: tab('Metres'),
    exact: { ops: tabOps('metres') },
  },
  {
    id: 'home.scripture',
    unit,
    kind: 'match',
    fixture: 'hy-fresh',
    one: tab('Scripture'),
    exact: { ops: tabOps('scripture') },
  },
  { id: 'home.shelf', unit, kind: 'exact-only' },
  {
    id: 'home.row-pressed',
    unit,
    kind: 'match',
    fixture: 'hy-fresh',
    one: { steps: [HOME], web: [HOME_WEB], hold: 'label=1, Praise to the Lord' },
    exact: { ops: ['clock data', 'clock settle', 'tap hymn-1 down'], masks: RAIL_AT_TOP },
  },
  {
    id: 'recent.page',
    unit,
    kind: 'match',
    fixture: 'hy-used',
    one: { steps: [RECENT, { wait: 600 }], web: [{ open: 'recent', expect: '' }] },
    exact: { ops: RECENT_OPS },
  },
  {
    id: 'recent.empty',
    unit,
    kind: 'match',
    fixture: 'hy-fresh',
    one: { steps: [RECENT, { wait: 600 }], web: [{ open: 'recent', expect: '' }] },
    exact: { ops: RECENT_OPS },
  },
];
