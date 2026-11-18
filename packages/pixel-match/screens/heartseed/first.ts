/**
 * Heartseed's first minute and home's tips: gap rows of `ex-hs-first`. The
 * port draws none of them yet; the references wait for that unit. A fresh
 * store (`hs-new`, no recall) opens the welcome; the recitals of the
 * first minute are the Debug build's scripted replay.
 */
import type { Row, Step } from '../../src/model.ts';
import { FOOT, HOME } from './home.ts';

const unit = 'ex-hs-first';

const WELCOME: Step = { open: '/', expect: 'label=Begin' };
const GROWS: ReadonlyArray<Step> = [WELCOME, { tap: 'label=Begin' }];
const HEAR: ReadonlyArray<Step> = [...GROWS, { tap: 'label=Plant your first verse' }];
const LETTERS: ReadonlyArray<Step> = [...HEAR, { tap: 'label=Next' }];
const ALONE: ReadonlyArray<Step> = [
  ...LETTERS,
  { tap: 'label=Say it' },
  { wait: 4000 },
  { tap: 'label=Say it alone' },
];
const PLANTED: ReadonlyArray<Step> = [
  ...ALONE,
  { tap: 'label=Say it' },
  { wait: 4000 },
  { tap: 'label=Planted' },
];

export const rows: ReadonlyArray<Row> = [
  {
    id: 'first.pending',
    unit,
    kind: 'gap',
    fixture: 'hs-new',
    one: {
      steps: [],
      notDrawn: {
        ios: 'the launch pending frame shows for less than the two takes a still capture needs',
      },
    },
  },
  {
    id: 'first.welcome',
    unit,
    kind: 'gap',
    sweep: true,
    fixture: 'hs-new',
    one: { steps: [WELCOME] },
  },
  { id: 'first.grows', unit, kind: 'gap', sweep: true, fixture: 'hs-new', one: { steps: GROWS } },
  { id: 'first.hear', unit, kind: 'gap', fixture: 'hs-new', one: { steps: HEAR } },
  { id: 'first.letters', unit, kind: 'gap', fixture: 'hs-new', one: { steps: LETTERS } },
  { id: 'first.alone', unit, kind: 'gap', fixture: 'hs-new', one: { steps: ALONE } },
  { id: 'first.planted', unit, kind: 'gap', fixture: 'hs-new', one: { steps: PLANTED } },
  {
    id: 'first.replay-welcome',
    unit,
    kind: 'gap',
    fixture: 'hs-fresh',
    one: { steps: [HOME, FOOT, { tap: 'label=How Heartseed works' }] },
  },
  {
    id: 'home.tips',
    unit,
    kind: 'gap',
    fixture: 'hs-new',
    one: { steps: [...PLANTED, { tap: 'label=Continue' }] },
  },
];
