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

/**
 * Why the docked bar has no web cell: in headless Chromium One's web home
 * is never reached with a hymn held. A hymn pushed from home's list does
 * not start (Play stays Play), and from a hymn loaded at its route the
 * stack's back link does not leave the page; a fresh load of `/` drops the
 * held hymn.
 */
const NO_DOCK =
  "One's web home is not reached with a hymn held in headless Chromium: a pushed hymn's Play does not start, and a hymn loaded at its route has no way back to home that keeps it";

/** Why `player.full` has no web cell. */
const NO_DETENTS =
  "One's web player is one page with no sheet detents: player.half is its whole picture";

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
    one: { steps: [...HELD, { back: true }, HOME, { wait: 800 }], notDrawn: { web: NO_DOCK } },
  },
  {
    id: 'bar.pressed',
    unit,
    kind: 'match',
    fixture: 'hy-paused',
    one: {
      steps: [...HELD, { back: true }, HOME],
      hold: 'label=Play hymn 1',
      notDrawn: { web: NO_DOCK },
    },
  },
  {
    id: 'bar.no-recording',
    unit,
    kind: 'match',
    fixture: 'hy-fresh',
    one: {
      steps: [
        hymn(13),
        { tap: 'label=Play hymn 13' },
        { wait: 2000 },
        { tap: 'label=Pause hymn 13' },
        { wait: 800 },
      ],
    },
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
    one: {
      steps: [...SHEET, { pan: 'label=Sheet Grabber', dx: 0, dy: -420 }, { wait: 1200 }],
      notDrawn: { web: NO_DETENTS },
    },
  },
  {
    id: 'player.chips-chosen',
    unit,
    kind: 'match',
    fixture: 'hy-paused',
    one: {
      steps: [
        ...SHEET,
        { pan: 'label=Sheet Grabber', dx: 0, dy: -420 },
        { scroll: 'id=stanza-2', direction: 'down' },
        { tap: 'id=stanza-2' },
        { wait: 800 },
      ],
      web: [
        ...SHEET,
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
        { pan: 'label=Sheet Grabber', dx: 0, dy: -420 },
        { scroll: 'label=Keep screen on', direction: 'down' },
        { wait: 800 },
      ],
      web: [...SHEET, { scroll: 'label=Keep screen on', direction: 'down' }, { wait: 800 }],
    },
  },
];
