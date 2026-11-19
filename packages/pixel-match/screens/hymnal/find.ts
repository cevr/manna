/**
 * The hymnal's finding (`pm-hy-find`): the find bar grown into the search
 * box, its results, the number drums and All at once. The keyboard is the
 * system's, the same in both apps, and its suggestions move: a row with it
 * up is scored over the band above it (`keyboard`), read from each side at
 * capture, not masked. On the web One draws a plain search field over the
 * list (`Home.tsx`: `Browse` and `Results`), with no find bar, drums or
 * tiles.
 *
 * The port reaches each row from home through the bar's own controls
 * (`features/find.contract`): Search, the box, the `#`, and All at once's
 * own control, which stands for the pinch the agent cannot make.
 */
import type { MaskSpec, Row, Step } from '../../src/model.ts';
import { HOME, HOME_WEB } from './home.ts';

const unit = 'pm-hy-find';

/**
 * The port's All at once control on home's folded bar, a disk of glass
 * before the capsule (the docked bar's foot 40 points over the window's,
 * the capsule two controls wide, 12 points apart): One has no such control,
 * a pinch opens its tiles.
 */
const TILES_CONTROL: MaskSpec = {
  x: 242,
  y: 790,
  width: 44,
  height: 44,
  reason: "the port's All at once control: One opens its tiles by a pinch alone",
};

const FIELD = 'label=Number, title or first line';
const NO_BAR = "One's web pages draw a plain search field, with no find bar, drums or tiles";

const OPEN: ReadonlyArray<Step> = [HOME, { tap: 'id=find-search' }, { wait: 800 }];
const OPEN_OPS: ReadonlyArray<string> = ['clock data', 'tap find-search', 'clock settle'];

const query = (text: string): Pick<Row, 'one' | 'exact' | 'keyboard'> => ({
  keyboard: true,
  one: {
    steps: [...OPEN, { fill: 'id=find-box', value: text }, { wait: 1000 }],
    web: [HOME_WEB, { fill: FIELD, value: text }, { wait: 1000 }],
  },
  exact: { ops: [...OPEN_OPS, `type search ${text}`, 'clock data', 'clock settle'] },
});

/**
 * All at once from the Sections list at its top: a tap on its first group's
 * row opens the tiles at that group, as a pinch in on the list does
 * (`Home.native.tsx`). The driver's pinch reaches no gesture handler, so the
 * tap stands for it.
 */
const TILES: ReadonlyArray<Step> = [HOME, { tap: 'label=Adoration and Praise' }, { wait: 800 }];

export const rows: ReadonlyArray<Row> = [
  {
    id: 'find.search-open',
    unit,
    kind: 'match',
    fixture: 'hy-fresh',
    keyboard: true,
    one: { steps: OPEN, web: [HOME_WEB, { tap: FIELD }, { wait: 600 }] },
    exact: { ops: OPEN_OPS },
  },
  {
    id: 'find.results-title',
    unit,
    kind: 'match',
    sweep: true,
    fixture: 'hy-fresh',
    ...query('faith'),
  },
  { id: 'find.results-line', unit, kind: 'match', fixture: 'hy-fresh', ...query('morning') },
  { id: 'find.none', unit, kind: 'match', fixture: 'hy-fresh', ...query('zzqx') },
  {
    id: 'find.drums',
    unit,
    kind: 'match',
    fixture: 'hy-fresh',
    one: {
      steps: [HOME, { tap: 'label=Find a hymn by number' }, { wait: 800 }],
      notDrawn: { web: NO_BAR },
    },
    exact: {
      ops: ['clock data', 'tap find-number', 'clock data', 'clock settle'],
      masks: [TILES_CONTROL],
    },
  },
  {
    id: 'find.tiles',
    unit,
    kind: 'match',
    fixture: 'hy-fresh',
    one: { steps: TILES, notDrawn: { web: NO_BAR } },
    exact: { ops: ['clock data', 'tap tiles-show', 'clock data', 'clock settle'] },
  },
  {
    id: 'find.on-hymn',
    unit,
    kind: 'match',
    fixture: 'hy-fresh',
    one: {
      steps: [{ open: 'hymns/1', expect: 'label=Stanza 1' }, { wait: 600 }],
      notDrawn: { web: NO_BAR },
    },
    exact: { ops: ['clock data', 'tap hymn-1', 'clock data', 'clock settle'] },
  },
];
