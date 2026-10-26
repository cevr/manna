/**
 * The Feel: the one `Tell` the app's controls tell their cues to. It gives
 * each cue its body (`body.ts`) through two ports, the haptics and the
 * sound (the voice), while the reader's `Sounds and haptics` switch is on,
 * and nothing at all while it is off. The switch is read as each cue comes,
 * so a change of it redraws nothing.
 *
 * A fast fling tells a detent every few milliseconds, and the two ports
 * take it each by its own rule:
 * - a tick's haptic (a dial's detent, the seeker's five seconds) is felt no
 *   closer than `FLOOR` after the last tick's, so the finger still feels a
 *   ratchet; every other cue's haptic always plays;
 * - a sound starts only once the last one has ended: the native side plays
 *   each file to its end and cannot stop it, so a sound that would start
 *   over it is dropped, and no two ever ring at once.
 *
 * The cue stream itself is whole: the rules only drop a body's parts.
 */

import { Option } from 'effect';

import { bodyOf, FLOOR, type Haptic, isTick, type SoundName } from './body';
import type { Cue, Tell } from './cue';
import { soundLength } from './voice';

/** What a cue is felt by. */
export interface HapticsPort {
  readonly play: (haptic: Haptic) => void;
}

/** What a cue is heard by: fire and forget, never awaited in a gesture. */
export interface SoundPort {
  readonly play: (sound: SoundName) => void;
  /** How long `sound` plays, in milliseconds: the voice's own (`soundLength`) when absent. */
  readonly length?: (sound: SoundName) => number;
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
  const length = ports.sound.length ?? soundLength;
  let lastTick = Number.NEGATIVE_INFINITY;
  // When the last sound's file ends.
  let quietAt = Number.NEGATIVE_INFINITY;
  const feel = (cue: Cue, haptic: Haptic, now: number) => {
    if (!isTick(cue)) return ports.haptics.play(haptic);
    if (now - lastTick < FLOOR) return;
    lastTick = now;
    ports.haptics.play(haptic);
  };
  const hear = (sound: SoundName, now: number) => {
    if (now < quietAt) return;
    quietAt = now + length(sound);
    ports.sound.play(sound);
  };
  return (cue: Cue) => {
    if (!ports.on()) return;
    const body = bodyOf(cue);
    const now = ports.now();
    feel(cue, body.haptic, now);
    if (Option.isSome(body.sound)) hear(body.sound.value, now);
  };
};
