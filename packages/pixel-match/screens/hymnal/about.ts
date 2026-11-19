/**
 * The hymnal's About (`pm-tokens`' calibration row). One draws it as the
 * last group of the Settings sheet, scrolled to its end; the port pushes a page of
 * its own. So the row is scored over a band, like with like: on each side
 * from the top of the group's first line (the recordings' lead, the same
 * words in both) down, to the picture's foot in One and to the foot of the
 * page's scrollport in the port, laid at their tops. The headings above it
 * (One's sheet title and its `About`, the port's bar) are left out.
 */
import type { Row } from '../../src/model.ts';
import { SETTINGS } from './settings.ts';

/** The recordings' lead, the group's first line in both apps (`@manna/hymnal`'s `RECORDING_CREDITS.lead`). */
const LEAD = "label=The recordings are played from the hymnal's own scores.";

export const rows: ReadonlyArray<Row> = [
  {
    id: 'about.page',
    unit: 'pm-tokens',
    kind: 'match',
    sweep: true,
    fixture: 'hy-fresh',
    one: {
      steps: [
        SETTINGS,
        { scroll: 'label=Gemma Terms of Use', direction: 'down' },
        { scroll: 'screen', direction: 'down' },
        { wait: 1000 },
      ],
      web: [
        SETTINGS,
        { scroll: 'label=About', direction: 'down' },
        { tap: 'label=About' },
        { wait: 1000 },
      ],
      band: { targets: [LEAD], edge: 'top' },
    },
    exact: {
      ops: [
        'clock data',
        'tap gear',
        'clock settle',
        'tap about-row',
        'clock data',
        'clock settle',
      ],
      band: { top: 'about-lead', bottom: 'about-list', edge: 'top' },
    },
  },
];
