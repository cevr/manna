/** The hymnal's Settings sheet (`pm-hy-settings`), opened by its route `settings`. */
import type { Row, Step } from '../../src/model.ts';

const unit = 'pm-hy-settings';

export const SETTINGS: Step = { open: 'settings', expect: 'label=Appearance' };

export const rows: ReadonlyArray<Row> = [
  {
    id: 'settings.sheet',
    unit,
    kind: 'match',
    sweep: true,
    fixture: 'hy-fresh',
    one: { steps: [SETTINGS, { wait: 1000 }] },
  },
  {
    id: 'settings.chords-on',
    unit,
    kind: 'match',
    fixture: 'hy-chords',
    one: { steps: [SETTINGS, { scroll: 'label=Chords', direction: 'down' }, { wait: 800 }] },
  },
  {
    id: 'settings.dark-chosen',
    unit,
    kind: 'match',
    fixture: 'hy-fresh',
    one: { steps: [SETTINGS, { tap: 'label=Dark' }, { wait: 1000 }] },
  },
  {
    id: 'settings.downloads',
    unit: 'ex-hy-offline',
    kind: 'gap',
    fixture: 'hy-fresh',
    one: {
      steps: [SETTINGS, { scroll: 'label=DOWNLOADS', direction: 'down' }, { wait: 800 }],
      web: [SETTINGS, { scroll: 'label=Downloads', direction: 'down' }, { wait: 800 }],
    },
  },
  {
    id: 'settings.tuner',
    unit: 'ex-hy-tuner',
    kind: 'gap',
    fixture: 'hy-chords',
    one: {
      steps: [{ open: 'tuner', expect: 'label=Auto' }, { wait: 1000 }],
      web: [{ open: 'tuner', expect: 'id=tuner-screen' }, { wait: 1000 }],
    },
  },
];
