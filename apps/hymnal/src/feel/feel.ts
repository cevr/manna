import { Option } from 'effect';

import { bodyOf, FLOOR, type Haptic, isTick, type SoundName } from './body';
import type { Cue, Tell } from './cue';
import { soundLength } from './voice';

export interface HapticsPort {
  readonly play: (haptic: Haptic) => void;
}

export interface SoundPort {
  readonly play: (sound: SoundName) => void;
  readonly length?: (sound: SoundName) => number;
}

export interface FeelPorts {
  readonly haptics: HapticsPort;
  readonly sound: SoundPort;
  readonly on: () => boolean;
  readonly now: () => number;
}

export const feelOver = (ports: FeelPorts): Tell => {
  const length = ports.sound.length ?? soundLength;
  let lastTick = Number.NEGATIVE_INFINITY;
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
