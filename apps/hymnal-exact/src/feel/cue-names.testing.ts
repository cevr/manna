/**
 * Every plain cue and every dial of the current hymnal's Feel
 * (`feel/cues.ts`), each once: the keys of records typed over One's own
 * unions, so a cue or a dial One adds, or drops, fails the type check
 * until it is named here, and the tests that walk them walk them all.
 */

import type { DialName, PlainCue } from '@manna/hymnal-app/feel/cues';

const plain = {
  wall: true,
  reset: true,
  'chords-on': true,
  'chords-off': true,
  play: true,
  pause: true,
  'switch-on': true,
  'switch-off': true,
  'favourite-on': true,
  'favourite-off': true,
  press: true,
  choose: true,
  tab: true,
  'zoom-out': true,
  'zoom-in': true,
  'sheet-open': true,
  'seek-grab': true,
  'seek-tick': true,
  'seek-release': true,
  'rail-tick': true,
} as const satisfies Record<PlainCue, true>;

const dials = {
  key: true,
  capo: true,
  size: true,
  tempo: true,
  placement: true,
  hundreds: true,
  tens: true,
  ones: true,
} as const satisfies Record<DialName, true>;

/** One's plain cues, every one. */
export const PLAIN: ReadonlyArray<PlainCue> = Object.keys(plain).filter(
  (name): name is PlainCue => name in plain,
);

/** One's dials, every one. */
export const DIALS: ReadonlyArray<DialName> = Object.keys(dials).filter(
  (name): name is DialName => name in dials,
);
