/** The hymnal's About (`pm-tokens`' calibration row), in the Settings sheet. */
import type { Row } from '../../src/model.ts';
import { SETTINGS } from './settings.ts';

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
        { scroll: 'label=About', direction: 'down' },
        { tap: 'label=About' },
        { wait: 1000 },
      ],
    },
  },
];
