/** The hymnal's Settings sheet (`pm-hy-settings`), opened by its route `settings`. */
import type { Row, Step } from '../../src/model.ts';

const unit = 'pm-hy-settings';

export const SETTINGS: Step = { open: 'settings', expect: 'label=Appearance' };

/**
 * The port's way to its Settings sheet at its half height, on the row's
 * fixture: the gear, once the list is in, then Sounds and haptics turned
 * off, as every hymnal fixture keeps it. The hymnal's port keeps these
 * settings as Contract's `persist` state, which `pixel shot` does not seed,
 * so the sheet's own switches set them.
 */
const GEAR = ['clock data', 'tap gear', 'clock settle', 'tap settings-feel', 'clock settle'];

/** `hy-chords`: Chords on too. */
const CHORDS = [...GEAR, 'tap chords-toggle', 'clock settle'];

export const rows: ReadonlyArray<Row> = [
  {
    id: 'settings.sheet',
    unit,
    kind: 'match',
    sweep: true,
    fixture: 'hy-fresh',
    one: { steps: [SETTINGS, { wait: 1000 }] },
    exact: { ops: GEAR },
    departs: {
      'accessibility-extra-extra-extra-large':
        "q161: the port keeps its Done's room beside the sheet's title at every size, so at the accessibility sizes the title wraps short of Done where the current hymnal, which has no Done, wraps it across the sheet; below AX1 the title fits beside Done, as One's does",
    },
  },
  {
    id: 'settings.chords-on',
    unit,
    kind: 'match',
    fixture: 'hy-chords',
    one: { steps: [SETTINGS, { scroll: 'label=Chords', direction: 'down' }, { wait: 800 }] },
    exact: { ops: CHORDS },
  },
  {
    id: 'settings.dark-chosen',
    unit,
    kind: 'match',
    fixture: 'hy-fresh',
    one: { steps: [SETTINGS, { tap: 'label=Dark' }, { wait: 1000 }] },
    exact: { ops: [...GEAR, 'tap appearance-dark', 'clock settle'] },
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
