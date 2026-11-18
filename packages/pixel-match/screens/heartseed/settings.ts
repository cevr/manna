/**
 * Heartseed's Settings sheet (`pm-hs-settings`), from the `Settings` row
 * at home's foot. The port's Sounds and haptics row is Exact-only.
 */
import type { Row, Step } from '../../src/model.ts';
import { FOOT, HOME } from './home.ts';

const unit = 'pm-hs-settings';

export const SHEET: ReadonlyArray<Step> = [HOME, FOOT, { tap: 'label=Settings' }, { wait: 800 }];

export const rows: ReadonlyArray<Row> = [
  {
    id: 'settings.sheet',
    unit,
    kind: 'match',
    sweep: true,
    fixture: 'hs-fresh',
    one: { steps: SHEET },
  },
  {
    id: 'settings.chosen',
    unit,
    kind: 'match',
    fixture: 'hs-fresh',
    one: {
      steps: [
        ...SHEET,
        { tap: 'label=20 min' },
        { tap: 'label=Voice' },
        { tap: 'label=Voice' },
        { tap: 'label=Dark' },
        { wait: 600 },
      ],
    },
  },
  {
    id: 'settings.natural',
    unit: 'ex-hs-natural',
    kind: 'gap',
    fixture: 'hs-fresh',
    one: {
      steps: [],
      notDrawn: {
        ios: "the natural voice's status lines need its model server and a download, which a reference capture does not start",
      },
    },
  },
  { id: 'x.settings.feel', unit, kind: 'exact-only' },
];
