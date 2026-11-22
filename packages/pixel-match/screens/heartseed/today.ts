/**
 * Heartseed's Today and the run (`pm-hs-today`). Today opens from home on
 * a verse (a plant's tap) or on the plan (`Start`); a recital is the Debug
 * build's scripted replay of Say it. The port reaches each row from home
 * by the same taps, over the row's fixture written to its store; a recital
 * is the agent's recognizer, granted and told what it hears. Its band runs
 * from the bottom of `today-top` (the top of Today's content, under the
 * navigation bar) to the top of `today-bottom` (the foot of Today's content,
 * over the tab bar: UIKit's tab bar answers `layout tabs` with no box).
 */
import type { Row, Step } from '../../src/model.ts';
import { banded, ROOMY, TODAY_BAND } from './band.ts';
import { HOME } from './home.ts';

const unit = 'pm-hs-today';

/** Home's plant `label`, scrolled to (the largest text sizes push it below the fold) and tapped. */
const plant = (label: string): ReadonlyArray<Step> => [
  HOME,
  { scroll: `label=${label}`, direction: 'down' },
  { tap: `label=${label}` },
];

/** Today on a seed that is due: said under first letters. */
const SEED = plant('Psalms 23:1, seed, ready today');
/** Today on a blade that is due: said under no cue. */
const BLADE = plant('Psalms 23:2, blade, ready today');
/** Today on the verse not yet planted, which the plan holds open: the new verse, whole. */
const NEW = plant('Psalms 23:3, not planted, ready today');
/**
 * A seed due whose verse is longer than ten words: the simulator's replay
 * (`SIMULATOR_PLAN`, `src/sayit/source.ts`) leaves its eleventh word out,
 * so its result shows a miss.
 */
const LONG_SEED = 'Isaiah 41:10, seed, ready today';
/** A recital of the seed, said: its result waits for Next. */
const SAID: ReadonlyArray<Step> = [...SEED, { tap: 'label=Say it' }, { wait: 5000 }];

/** The port's Today band: from the top of Today's content to the tab bar. */
const BAND = { top: 'today-top', bottom: 'today-bottom' };

/** The port's way to home with its data read. */
const PORT_HOME = ['clock data', 'clock settle'];

/** The port's Today on the verse whose home plant is `slug`. */
const portPlant = (slug: string) => [
  ...PORT_HOME,
  `tap plant-${slug}`,
  'clock data',
  'clock settle',
];

/** The microphone and the recognizer granted to the agent's substitute. */
const GRANTED = [
  'prefer permission.microphone granted',
  'prefer permission.speech-recognition granted',
];

/**
 * A recital in the port at `after` ms, its recognizer hearing nothing: no
 * file of the harness holds a verse's words, so the port's recital cannot
 * say One's replay's words, and its marks differ from the reference's.
 */
const portSay = (after: number) => [...GRANTED, 'tap say', 'clock settle', `clock +${after}`];

/** The seed said through, its result shown. */
const PORT_SAID = [...portPlant('Psalms-23-1'), ...portSay(5000), 'tap finish', 'clock settle'];

const exact = (ops: ReadonlyArray<string>) => ({ ops, band: BAND });

const todayRows: ReadonlyArray<Row> = [
  {
    id: 'today.new',
    unit,
    kind: 'match',
    sweep: true,
    departs: ROOMY,
    fixture: 'hs-due',
    one: { steps: NEW },
    exact: exact(portPlant('Psalms-23-3')),
  },
  {
    id: 'today.new-lines',
    unit,
    kind: 'match',
    fixture: 'hs-long',
    one: { steps: [HOME, { tap: 'label=Start' }] },
    exact: exact([...PORT_HOME, 'tap today-action', 'clock data', 'clock settle']),
  },
  {
    id: 'today.letters',
    unit,
    kind: 'match',
    sweep: true,
    departs: ROOMY,
    fixture: 'hs-due',
    one: { steps: SEED },
    exact: exact(portPlant('Psalms-23-1')),
  },
  {
    id: 'today.blank',
    unit,
    kind: 'match',
    fixture: 'hs-due',
    one: { steps: BLADE },
    exact: exact(portPlant('Psalms-23-2')),
  },
  {
    id: 'today.show-all',
    unit,
    kind: 'match',
    fixture: 'hs-due',
    one: { steps: [...BLADE, { tap: 'label=Show all' }] },
    exact: exact([...portPlant('Psalms-23-2'), 'tap show-all', 'clock settle']),
  },
  {
    id: 'today.listening',
    unit,
    kind: 'match',
    fixture: 'hs-due',
    one: { steps: [...SEED, { tap: 'label=Say it' }, { wait: 800 }], reduceMotion: true },
    exact: exact([
      'prefer prefers-reduced-motion reduce',
      ...portPlant('Psalms-23-1'),
      ...portSay(800),
    ]),
  },
  {
    id: 'today.result',
    unit,
    kind: 'match',
    sweep: true,
    departs: ROOMY,
    fixture: 'hs-due',
    one: { steps: SAID },
    exact: exact(PORT_SAID),
  },
  {
    id: 'today.result-missed',
    unit,
    kind: 'match',
    fixture: 'hs-due',
    one: { steps: [...plant(LONG_SEED), { tap: 'label=Say it' }, { wait: 9000 }] },
    exact: exact([...portPlant('Isaiah-41-10'), ...portSay(9000), 'tap finish', 'clock settle']),
  },
  {
    id: 'today.alert',
    unit,
    kind: 'match',
    fixture: 'hs-due',
    one: {
      steps: [],
      notDrawn: {
        ios: 'the scripted replay always hears its recital; no replay ends unheard on the simulator',
      },
    },
  },
  {
    id: 'today.move-back',
    unit,
    kind: 'match',
    fixture: 'hs-due',
    one: { steps: [...BLADE, { tap: 'label=Move back a stage' }] },
    exact: exact(portPlant('Psalms-23-2')),
  },
  {
    id: 'today.done',
    unit,
    kind: 'match',
    fixture: 'hs-tended',
    one: { steps: [HOME, { tap: 'label=Practice anyway' }] },
    exact: exact([...PORT_HOME, 'tap today-action', 'clock data', 'clock settle']),
  },
  {
    id: 'today.end',
    unit,
    kind: 'match',
    sweep: true,
    fixture: 'hs-due',
    one: { steps: [...SAID, { tap: 'label=Next' }] },
    exact: exact([...PORT_SAID, 'tap next', 'clock data', 'clock settle']),
  },
  {
    id: 'today.reading',
    unit: 'ex-hs-natural',
    kind: 'gap',
    fixture: 'hs-due',
    one: { steps: [...NEW, { tap: 'label=Listen' }, { wait: 1500 }], reduceMotion: true },
  },
  {
    id: 'today.unread',
    unit,
    kind: 'match',
    fixture: 'hs-unread',
    one: { steps: [{ open: '/', expect: 'label=Say it' }, { wait: 800 }] },
    exact: exact(['clock data', 'clock settle']),
  },
];

export const rows: ReadonlyArray<Row> = todayRows.map(banded(TODAY_BAND));
