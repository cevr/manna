/**
 * The tuner screen's measures, in points, as the current app's `Tuner.tsx`
 * styles them, which `tunerPlaces()` answers `features/tuner.contract`:
 * the screen's sides, gap and insets, the gauge (its radius, the spokes'
 * foot, each tick's size, the needle's two widths and the hub), the hint's
 * capsule, the reading's gap, the headstock (its pegs, posts and face, the
 * strings and the nut, the neck) and a string's circle with its tick
 * badge, and the Denied and Ended messages' action. The gauge's ticks are
 * the current app's `TICKS`, each at its angle on the swing (`SWING`
 * degrees at `NEEDLE_CENTS`). `src/tuner/held.test.ts` reads each from the
 * current app's file.
 */

import { SWING, TICKS } from '@manna/hymnal-app/tuner/screen';
import { NEEDLE_CENTS } from '@manna/hymnal-app/tuner/session';

/** The gauge's radius, from the needle's pivot to the scale's ticks. */
const RADIUS = 130;

export const PLACES = {
  side: 20,
  gap: 12,
  top: 8,
  foot: 16,
  headHigh: 44,
  autoGap: 8,
  areaHigh: 210,
  areaGap: 14,
  gaugeWide: 2 * RADIUS + 20,
  gaugeHigh: RADIUS + 16,
  spoke: RADIUS,
  spokeFoot: 8,
  tickWide: 2,
  tickHigh: 12,
  majorHigh: 18,
  centreWide: 3,
  centreHigh: 26,
  windowHigh: 22,
  needleHigh: RADIUS - 14,
  thin: 2,
  wide: 6,
  hub: 14,
  hubFoot: 2,
  hubLine: 3,
  sideIn: 8,
  hintX: 16,
  hintY: 8,
  hintRound: 18,
  hintHigh: 36,
  readingGap: 2,
  noteHigh: 20,
  stockTop: 8,
  columnY: 10,
  columnGap: 18,
  postWide: 18,
  postHigh: 2,
  pegWide: 22,
  pegHigh: 14,
  pegRound: 5,
  pegLine: 2,
  faceWide: 116,
  faceTop: 40,
  faceFoot: 6,
  faceLine: 1,
  stringsTop: 24,
  line: 1.5,
  litLine: 3,
  nut: 6,
  neckWide: 96,
  neckHigh: 40,
  circle: 48,
  circleLine: 2,
  badge: 20,
  badgeOut: 4,
  badgeLine: 2,
  actionX: 16,
  actionY: 10,
  actionRound: 10,
  messageGap: 16,
  markWide: 10,
  markHigh: 14,
};

/** The gauge's ticks: each one's angle, and whether it edges the in-tune window, is a major tick or the centre. */
export const TICK_MARKS = TICKS.map((cents) => ({
  cents,
  angle: (cents / NEEDLE_CENTS) * SWING,
  window: Math.abs(cents) === 5,
  major: cents % 50 === 0,
  centre: cents === 0,
}));
