/**
 * The hymnal's player bar and sheet (`pm-hy-player`). Sound is off in
 * every fixture, so Play runs the score clock and nothing sounds; a held
 * hymn is paused before any capture. The position text and the thumb are
 * masked: the clock moves them.
 */
import type { Row, Step } from '../../src/model.ts';
import { HOME } from './home.ts';
import { hymn } from './hymn.ts';

const unit = 'pm-hy-player';

/** Hymn 1 played and paused at once: held, paused. */
const HELD: ReadonlyArray<Step> = [
  hymn(1),
  { tap: 'label=Play hymn 1' },
  { tap: 'label=Pause hymn 1' },
  { wait: 600 },
];
const SHEET: ReadonlyArray<Step> = [...HELD, { tap: 'label=Open player' }, { wait: 1200 }];

export const rows: ReadonlyArray<Row> = [
  {
    id: 'bar.page',
    unit,
    kind: 'match',
    sweep: true,
    fixture: 'hy-fresh',
    one: { steps: [hymn(1), { wait: 600 }] },
  },
  {
    id: 'bar.docked',
    unit,
    kind: 'match',
    fixture: 'hy-paused',
    one: { steps: [...HELD, { back: true }, HOME, { wait: 800 }] },
  },
  {
    id: 'bar.pressed',
    unit,
    kind: 'match',
    fixture: 'hy-paused',
    one: { steps: [...HELD, { back: true }, HOME], hold: 'label=Play hymn 1' },
  },
  {
    id: 'bar.no-recording',
    unit,
    kind: 'match',
    fixture: 'hy-fresh',
    one: { steps: [hymn(13), { tap: 'label=Play hymn 13' }, { wait: 2000 }] },
  },
  {
    id: 'bar.dials',
    unit: 'ex-hy-dials',
    kind: 'gap',
    fixture: 'hy-chords',
    one: {
      steps: [
        { open: 'hymns/1', expect: 'id=key-button' },
        { tap: 'id=key-button' },
        { wait: 1000 },
      ],
    },
  },
  { id: 'player.half', unit, kind: 'match', fixture: 'hy-paused', one: { steps: SHEET } },
  {
    id: 'player.full',
    unit,
    kind: 'match',
    sweep: true,
    fixture: 'hy-paused',
    one: { steps: [...SHEET, { pan: 'label=Sheet Grabber', dx: 0, dy: -500 }, { wait: 1200 }] },
  },
  {
    id: 'player.chips-chosen',
    unit,
    kind: 'match',
    fixture: 'hy-paused',
    one: {
      steps: [
        ...SHEET,
        { pan: 'label=Sheet Grabber', dx: 0, dy: -500 },
        { scroll: 'id=stanza-2', direction: 'down' },
        { tap: 'id=stanza-2' },
        { wait: 800 },
      ],
    },
  },
  {
    id: 'player.reading',
    unit: 'ex-hy-follow',
    kind: 'gap',
    fixture: 'hy-paused',
    one: {
      steps: [
        ...SHEET,
        { pan: 'label=Sheet Grabber', dx: 0, dy: -500 },
        { scroll: 'label=Keep screen on', direction: 'down' },
        { wait: 800 },
      ],
    },
  },
];
