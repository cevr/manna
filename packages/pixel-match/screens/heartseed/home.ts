/**
 * Heartseed's home and a list's own page (`pm-hs-home`). The One side
 * opens home (every launch's screen after the first minute) over the row's
 * fixture; the port's side is the unit's to write.
 */
import type { Row, Step } from '../../src/model.ts';

const unit = 'pm-hs-home';

export const HOME: Step = { open: '/', expect: 'id=today-card' };

/** The Psalms list's header scrolled to: the largest text sizes push it below the fold. */
const OPEN_PSALM: Step = { scroll: 'label=Open Psalms 23:1-5', direction: 'down' };
export const FOOT: Step = { scroll: 'label=How Heartseed works', direction: 'down' };

export const rows: ReadonlyArray<Row> = [
  {
    id: 'home.fresh',
    unit,
    kind: 'match',
    sweep: true,
    fixture: 'hs-fresh',
    one: { steps: [HOME] },
  },
  { id: 'home.due', unit, kind: 'match', sweep: true, fixture: 'hs-due', one: { steps: [HOME] } },
  { id: 'home.tended', unit, kind: 'match', fixture: 'hs-tended', one: { steps: [HOME] } },
  {
    id: 'home.lists',
    unit,
    kind: 'match',
    sweep: true,
    fixture: 'hs-lists',
    one: { steps: [HOME] },
  },
  { id: 'home.foot', unit, kind: 'match', fixture: 'hs-lists', one: { steps: [HOME, FOOT] } },
  { id: 'home.limit', unit, kind: 'match', fixture: 'hs-limit', one: { steps: [HOME, FOOT] } },
  {
    id: 'home.single-ask',
    unit,
    kind: 'match',
    fixture: 'hs-lists',
    one: {
      steps: [
        HOME,
        { scroll: 'label=Remove John 11:35', direction: 'down' },
        { tap: 'label=Remove John 11:35' },
      ],
    },
  },
  {
    id: 'home.greeting-morning',
    unit,
    kind: 'match',
    fixture: 'hs-fresh',
    clock: '09:41',
    one: { steps: [HOME] },
  },
  {
    id: 'home.greeting-evening',
    unit,
    kind: 'match',
    fixture: 'hs-fresh',
    clock: '20:41',
    one: { steps: [HOME] },
  },
  {
    id: 'home.plant-pressed',
    unit,
    kind: 'match',
    fixture: 'hs-lists',
    one: { steps: [HOME], hold: 'label=Psalms 23:1, seed, ready today' },
  },
  {
    id: 'list.page',
    unit,
    kind: 'match',
    sweep: true,
    fixture: 'hs-lists',
    one: { steps: [HOME, OPEN_PSALM, { tap: 'label=Open Psalms 23:1-5' }] },
  },
  {
    id: 'list.unplanted',
    unit,
    kind: 'match',
    fixture: 'hs-lists',
    one: { steps: [HOME, { tap: 'label=Open Romans 8:28-39' }] },
  },
  {
    id: 'list.remove-ask',
    unit,
    kind: 'match',
    fixture: 'hs-lists',
    one: {
      steps: [
        HOME,
        OPEN_PSALM,
        { tap: 'label=Open Psalms 23:1-5' },
        { scroll: 'label=Remove Psalms 23:1-5', direction: 'down' },
        { tap: 'label=Remove Psalms 23:1-5' },
      ],
    },
  },
];
