/**
 * The hymnal's player bar and sheet (`pm-hy-player`). Sound is off in
 * every fixture, so Play runs the score clock and nothing sounds; a held
 * hymn is paused before any capture. The position text and the thumb are
 * masked: the clock moves them.
 *
 * The port reaches each row from a fresh store at its root: Sounds and
 * haptics turned off at Settings first (`quietOps`, the owner's rule before
 * any Play), then the hymn's row tapped on the list, Play pressed and the
 * hymn paused once it sounds. Its recordings are the checkout's silent
 * fixture (`HYMNAL_RECORDINGS`), never the bucket.
 */
import { quietOps } from '../../../../apps/hymnal-exact/tools/quiet.ts';
import type { MaskSpec, Row, Step } from '../../src/model.ts';
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

/** The port's ops to hymn `n`'s page from its root: the list's row, the push settled. */
const portHymn = (n: number): ReadonlyArray<string> => [
  'clock data',
  `tap hymn-${n}`,
  'clock data',
  'clock settle',
];

/** Sounds and haptics off at Settings, as every Play of the port's is made. */
const QUIET: ReadonlyArray<string> = ['clock data', 'tap gear', 'clock settle', ...quietOps];

/** Hymn `n` played from its page's bar and paused once it sounds, settled. */
const portHeld = (n: number): ReadonlyArray<string> => [
  ...QUIET,
  ...portHymn(n),
  'tap play',
  'clock data',
  'clock +1500 real',
  'clock data',
  'tap bar-toggle',
  'clock data',
  'clock settle',
];

/** The held hymn's full player, at half the screen. */
const PORT_SHEET: ReadonlyArray<string> = [
  ...portHeld(1),
  'tap bar-title',
  'clock data',
  'clock settle',
];

/** The sheet pulled from half the screen to full by its content. */
const PORT_FULL: ReadonlyArray<string> = [
  ...PORT_SHEET,
  'tap player-title drag 0 -420',
  'clock settle',
];

/** The bar's row on an iPhone 17 (402 × 874 pt): 56 pt over the 34 pt home indicator. */
const BAR_TOP = 784;

/** The key button's place at the bar's left (One's `KeyButton`): the dials and tuner are `ex-hy-dials`' and `ex-hy-tuner`'s gap. */
const KEY: MaskSpec = {
  x: 8,
  y: BAR_TOP + 4,
  width: 52,
  height: 48,
  reason: "One's key button (KeyButton): the dials are ex-hy-dials' gap, the port draws none",
};

/** The Sound mark's place, left of the player's button (One's `Sound`): the port has no Sound setting. */
const SOUND: MaskSpec = {
  x: 290,
  y: BAR_TOP + 4,
  width: 52,
  height: 48,
  reason:
    "One's Sound mark: the port has no Sound setting (it plays the recording, Sounds and haptics is a separate switch)",
};

/**
 * The position on the sheet: the thumb and the track it has played (a
 * strip across the bar), and the two times under it, which the clock moves
 * (and the length, which One's score clock and the port's recording count
 * apart). `top` is the bar's centre in points.
 */
const position = (top: number): ReadonlyArray<MaskSpec> => [
  {
    x: 16,
    y: top - 12,
    width: 370,
    height: 24,
    reason: 'the position bar: the clock moves its thumb and its played track',
  },
  {
    x: 16,
    y: top + 18,
    width: 64,
    height: 24,
    reason: 'the time gone: the clock moves it',
  },
  {
    x: 322,
    y: top + 18,
    width: 64,
    height: 24,
    reason: "the length: One's score clock and the port's recording are of other lengths",
  },
];

/** The position bar's centre on the half sheet, and on the full one, read off the references. */
const HALF_POSITION = 571;
const FULL_POSITION = 178;

export const rows: ReadonlyArray<Row> = [
  {
    id: 'bar.page',
    unit,
    kind: 'match',
    sweep: true,
    fixture: 'hy-fresh',
    one: { steps: [hymn(1), { wait: 600 }], masks: [KEY, SOUND] },
    exact: { ops: portHymn(1) },
  },
  {
    id: 'bar.docked',
    unit,
    kind: 'match',
    fixture: 'hy-paused',
    one: {
      steps: [...HELD, { back: true }, HOME, { wait: 800 }],
      notDrawn: { web: NO_DOCK },
      masks: [SOUND],
    },
    exact: { ops: [...portHeld(1), 'back', 'clock settle'] },
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
      masks: [SOUND],
    },
    exact: { ops: [...portHeld(1), 'back', 'clock settle', 'tap bar-toggle down'] },
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
      masks: [KEY, SOUND],
    },
    exact: {
      ops: [
        ...QUIET,
        ...portHymn(13),
        'tap play',
        'clock data',
        'clock +2000 real',
        'clock data',
        'clock settle',
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
  {
    id: 'player.half',
    unit,
    kind: 'match',
    fixture: 'hy-paused',
    one: { steps: SHEET, masks: position(HALF_POSITION) },
    exact: { ops: PORT_SHEET },
  },
  {
    id: 'player.full',
    unit,
    kind: 'match',
    sweep: true,
    fixture: 'hy-paused',
    one: {
      steps: [...SHEET, { pan: 'label=Sheet Grabber', dx: 0, dy: -420 }, { wait: 1200 }],
      notDrawn: { web: NO_DETENTS },
      masks: position(FULL_POSITION),
    },
    exact: { ops: PORT_FULL, touch: 'platform' },
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
      masks: position(FULL_POSITION),
    },
    exact: { ops: [...PORT_FULL, 'tap stanza-2', 'clock data', 'clock settle'], touch: 'platform' },
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
