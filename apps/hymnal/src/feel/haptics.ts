import { One } from 'one';

import type { Haptic } from './body';
import type { HapticsPort } from './feel';

export const hapticsOver = (haptics: () => typeof One.Haptics): HapticsPort => ({
  play: (haptic: Haptic) => {
    if (haptic._tag === 'selection') return haptics().selection();
    if (haptic._tag === 'impact') return haptics().impact(haptic.style);
    return haptics().notification(haptic.type);
  },
});

export const liveHaptics: HapticsPort = hapticsOver(() => One.Haptics);
