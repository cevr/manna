/** Heartseed's About and licences (`pm-tokens`' calibration rows), from the Settings sheet's `About`. */
import type { Row, Step } from '../../src/model.ts';
import { SHEET } from './settings.ts';

const unit = 'pm-tokens';

const ABOUT: ReadonlyArray<Step> = [
  ...SHEET,
  { scroll: 'label=About', direction: 'down' },
  { tap: 'label=About' },
  { wait: 800 },
];

/** The port's way to About: the gear's sheet, then its `About` row. */
const EXACT_ABOUT: ReadonlyArray<string> = [
  'clock data',
  'tap gear',
  'clock settle',
  'tap about-row',
  'clock data',
  'clock settle',
];

export const rows: ReadonlyArray<Row> = [
  {
    id: 'about.page',
    unit,
    kind: 'match',
    sweep: true,
    fixture: 'hs-fresh',
    one: { steps: ABOUT },
    exact: { ops: EXACT_ABOUT },
  },
  {
    id: 'about.licences',
    unit,
    kind: 'match',
    fixture: 'hs-fresh',
    one: { steps: [...ABOUT, { tap: 'label=Licences' }, { wait: 600 }] },
    exact: { ops: [...EXACT_ABOUT, 'tap licences-row', 'clock data', 'clock settle'] },
  },
];
