/**
 * The hymnal's finding (`pm-hy-find`): the find bar grown into the search
 * box, its results, the number drums and All at once. The keyboard is
 * masked: its keys are the system's, the same in both apps, and its
 * suggestions move.
 */
import type { MaskSpec, Row, Step } from '../../src/model.ts';
import { HOME } from './home.ts';

const unit = 'pm-hy-find';

/** The software keyboard of an iPhone 17 in points: the bottom 336 of 874. */
const KEYBOARD: MaskSpec = {
  x: 0,
  y: 538,
  width: 402,
  height: 336,
  reason: 'the software keyboard: the system draws it in both apps',
};

const OPEN: ReadonlyArray<Step> = [HOME, { tap: 'id=find-search' }, { wait: 800 }];
const query = (text: string): ReadonlyArray<Step> => [
  ...OPEN,
  { fill: 'id=find-box', value: text },
  { wait: 1000 },
];

export const rows: ReadonlyArray<Row> = [
  {
    id: 'find.search-open',
    unit,
    kind: 'match',
    fixture: 'hy-fresh',
    one: { steps: OPEN, masks: [KEYBOARD] },
  },
  {
    id: 'find.results-title',
    unit,
    kind: 'match',
    sweep: true,
    fixture: 'hy-fresh',
    one: { steps: query('faith'), masks: [KEYBOARD] },
  },
  {
    id: 'find.results-line',
    unit,
    kind: 'match',
    fixture: 'hy-fresh',
    one: { steps: query('morning'), masks: [KEYBOARD] },
  },
  {
    id: 'find.none',
    unit,
    kind: 'match',
    fixture: 'hy-fresh',
    one: { steps: query('zzqx'), masks: [KEYBOARD] },
  },
  {
    id: 'find.drums',
    unit,
    kind: 'match',
    fixture: 'hy-fresh',
    one: { steps: [HOME, { tap: 'label=Find a hymn by number' }, { wait: 800 }] },
  },
  {
    id: 'find.tiles',
    unit,
    kind: 'match',
    fixture: 'hy-fresh',
    one: { steps: [HOME, { pinch: 'label=Sections', scale: 0.5 }, { wait: 800 }] },
  },
  {
    id: 'find.on-hymn',
    unit,
    kind: 'match',
    fixture: 'hy-fresh',
    one: { steps: [{ open: 'hymns/1', expect: 'label=Stanza 1' }, { wait: 600 }] },
  },
];
