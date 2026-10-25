/**
 * The haptics port over One's `Haptics`: sync calls into the platform's
 * feedback generators (Apple's names). On the web One's haptics do nothing,
 * so a web cue has no body.
 */

import { One } from 'one';

import type { Haptic } from './body';
import type { HapticsPort } from './feel';

/** The port over `haptics`, read as each cue comes. */
export const hapticsOver = (haptics: () => typeof One.Haptics): HapticsPort => ({
  play: (haptic: Haptic) => {
    if (haptic._tag === 'selection') return haptics().selection();
    if (haptic._tag === 'impact') return haptics().impact(haptic.style);
    return haptics().notification(haptic.type);
  },
});

/** The app's haptics. */
export const liveHaptics: HapticsPort = hapticsOver(() => One.Haptics);
