/**
 * Heartseed's Today and the run (`pm-hs-today`). Today opens from home on
 * a verse (a plant's tap) or on the plan (`Start`); a recital is the Debug
 * build's scripted replay of Say it.
 */
import type { Row, Step } from '../../src/model.ts';
import { banded, TODAY_BAND } from './band.ts';
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

const todayRows: ReadonlyArray<Row> = [
  { id: 'today.new', unit, kind: 'match', sweep: true, fixture: 'hs-due', one: { steps: NEW } },
  {
    id: 'today.new-lines',
    unit,
    kind: 'match',
    fixture: 'hs-long',
    one: { steps: [HOME, { tap: 'label=Start' }] },
  },
  {
    id: 'today.letters',
    unit,
    kind: 'match',
    sweep: true,
    fixture: 'hs-due',
    one: { steps: SEED },
  },
  { id: 'today.blank', unit, kind: 'match', fixture: 'hs-due', one: { steps: BLADE } },
  {
    id: 'today.show-all',
    unit,
    kind: 'match',
    fixture: 'hs-due',
    one: { steps: [...BLADE, { tap: 'label=Show all' }] },
  },
  {
    id: 'today.listening',
    unit,
    kind: 'match',
    fixture: 'hs-due',
    one: { steps: [...SEED, { tap: 'label=Say it' }, { wait: 800 }], reduceMotion: true },
  },
  { id: 'today.result', unit, kind: 'match', sweep: true, fixture: 'hs-due', one: { steps: SAID } },
  {
    id: 'today.result-missed',
    unit,
    kind: 'match',
    fixture: 'hs-due',
    one: { steps: [...plant(LONG_SEED), { tap: 'label=Say it' }, { wait: 9000 }] },
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
  },
  {
    id: 'today.done',
    unit,
    kind: 'match',
    fixture: 'hs-tended',
    one: { steps: [HOME, { tap: 'label=Practice anyway' }] },
  },
  {
    id: 'today.end',
    unit,
    kind: 'match',
    sweep: true,
    fixture: 'hs-due',
    one: { steps: [...SAID, { tap: 'label=Next' }] },
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
  },
];

export const rows: ReadonlyArray<Row> = todayRows.map(banded(TODAY_BAND));
