/**
 * The Feel: the one `Tell` the app's controls tell their cues to. It gives
 * each cue its body (`body.ts`) through two ports, the haptics and the
 * sound (the voice), while the reader's `Sounds and haptics` switch is on,
 * and nothing at all while it is off. The switch is read as each cue comes,
 * so a change of it redraws nothing.
 *
 * Ticks (a dial's detent, the seeker's five seconds) are felt and heard no
 * closer than `FLOOR` apart, as a fast fling would otherwise blur them into
 * a buzz; every other cue always plays. The cue stream itself is whole: the
 * floor only drops a tick's body.
 */

import { type Body, bodyOf, FLOOR, type Haptic, isTick, type SoundName } from './body';
import type { Cue, Tell } from './cue';

/** What a cue is felt by. */
export interface HapticsPort {
  readonly play: (haptic: Haptic) => void;
}

/** What a cue is heard by: fire and forget, never awaited in a gesture. */
export interface SoundPort {
  readonly play: (sound: SoundName) => void;
}

export interface FeelPorts {
  readonly haptics: HapticsPort;
  readonly sound: SoundPort;
  /** Whether `Sounds and haptics` is on, read as each cue comes. */
  readonly on: () => boolean;
  /** The time, in milliseconds. */
  readonly now: () => number;
}

/** The Tell over `ports`. */
export const feelOver = (ports: FeelPorts): Tell => {
  let lastTick = Number.NEGATIVE_INFINITY;
  const play = (body: Body) => {
    ports.haptics.play(body.haptic);
    ports.sound.play(body.sound);
  };
  return (cue: Cue) => {
    if (!ports.on()) return;
    if (!isTick(cue)) return play(bodyOf(cue));
    const now = ports.now();
    if (now - lastTick < FLOOR) return;
    lastTick = now;
    play(bodyOf(cue));
  };
};
