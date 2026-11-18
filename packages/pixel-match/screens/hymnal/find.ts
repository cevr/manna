/**
 * The hymnal's finding (`pm-hy-find`): the find bar grown into the search
 * box, its results, the number drums and All at once. The keyboard is
 * masked: its keys are the system's, the same in both apps, and its
 * suggestions move. On the web One draws a plain search field over the list
 * (`Home.tsx`: `Browse` and `Results`), with no find bar, drums or tiles.
 */
import type { MaskSpec, Row, Step } from '../../src/model.ts';
import { HOME, HOME_WEB } from './home.ts';

const unit = 'pm-hy-find';

/** The software keyboard of an iPhone 17 in points: the bottom 336 of 874. */
const KEYBOARD: MaskSpec = {
  x: 0,
  y: 538,
  width: 402,
  height: 336,
  reason: 'the software keyboard: the system draws it in both apps',
};

const FIELD = 'label=Number, title or first line';
const NO_BAR = "One's web pages draw a plain search field, with no find bar, drums or tiles";

const OPEN: ReadonlyArray<Step> = [HOME, { tap: 'id=find-search' }, { wait: 800 }];
const query = (text: string): Pick<NonNullable<Row['one']>, 'steps' | 'web' | 'masks'> => ({
  steps: [...OPEN, { fill: 'id=find-box', value: text }, { wait: 1000 }],
  web: [HOME_WEB, { fill: FIELD, value: text }, { wait: 1000 }],
  masks: [KEYBOARD],
});

export const rows: ReadonlyArray<Row> = [
  {
    id: 'find.search-open',
    unit,
    kind: 'match',
    fixture: 'hy-fresh',
    one: { steps: OPEN, web: [HOME_WEB, { tap: FIELD }, { wait: 600 }], masks: [KEYBOARD] },
  },
  {
    id: 'find.results-title',
    unit,
    kind: 'match',
    sweep: true,
    fixture: 'hy-fresh',
    one: query('faith'),
  },
  { id: 'find.results-line', unit, kind: 'match', fixture: 'hy-fresh', one: query('morning') },
  { id: 'find.none', unit, kind: 'match', fixture: 'hy-fresh', one: query('zzqx') },
  {
    id: 'find.drums',
    unit,
    kind: 'match',
    fixture: 'hy-fresh',
    one: {
      steps: [HOME, { tap: 'label=Find a hymn by number' }, { wait: 800 }],
      notDrawn: { web: NO_BAR },
    },
  },
  {
    id: 'find.tiles',
    unit,
    kind: 'match',
    fixture: 'hy-fresh',
    one: {
      steps: [HOME, { pinch: 'label=Sections', scale: 0.5 }, { wait: 800 }],
      notDrawn: { web: NO_BAR },
    },
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
  },
];
