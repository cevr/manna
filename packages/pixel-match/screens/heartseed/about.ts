/** Heartseed's About and licences (`pm-tokens`' calibration rows), from the Settings sheet's `About`. */
import type { Row, Step } from '../../src/model.ts';
import { SHEET } from './settings.ts';

const unit = 'pm-tokens';

const ABOUT: ReadonlyArray<Step> = [...SHEET, { tap: 'label=About' }, { wait: 800 }];

export const rows: ReadonlyArray<Row> = [
  {
    id: 'about.page',
    unit,
    kind: 'match',
    sweep: true,
    fixture: 'hs-fresh',
    one: { steps: ABOUT },
  },
  {
    id: 'about.licences',
    unit,
    kind: 'match',
    fixture: 'hs-fresh',
    one: { steps: [...ABOUT, { tap: 'label=Licences' }, { wait: 600 }] },
  },
];
