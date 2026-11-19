/**
 * Heartseed's About and licences (`pm-tokens`' calibration rows), from the
 * Settings sheet's `About`. One draws each page in its page sheet under its
 * own back row and heading; the port pushes it inside the Settings sheet
 * under the sheet's navigation bar. So each row is scored over a band, like
 * with like: from the top of the page's first text under its heading (the
 * app's name on About, the first licence text on Licences) on each side,
 * to the picture's foot in One and the foot of the page's scrollport in the
 * port, laid at their tops. The sheet's frame and the dimmed ground above
 * it lie outside the band.
 */
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
    one: { steps: ABOUT, band: { targets: ['id=about-name'], edge: 'top' } },
    exact: {
      ops: EXACT_ABOUT,
      band: { top: 'about-name', bottom: 'about-scroll', edge: 'top' },
    },
  },
  {
    id: 'about.licences',
    unit,
    kind: 'match',
    fixture: 'hs-fresh',
    one: {
      steps: [...ABOUT, { tap: 'label=Licences' }, { wait: 600 }],
      band: { targets: ['id=about-credits'], edge: 'top' },
    },
    exact: {
      ops: [...EXACT_ABOUT, 'tap licences-row', 'clock data', 'clock settle'],
      band: { top: 'licence-name-0', bottom: 'licences-scroll', edge: 'top' },
    },
  },
];
