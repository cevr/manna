/**
 * Whether the reader has Reduce Motion on, read live: the system's setting
 * at launch (Reanimated reads it once, as the app starts), then each change
 * the system tells (`AccessibilityInfo`'s `reduceMotionChanged`), so the bar
 * and the dials follow a change made while they are on screen.
 */

import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

export const useReduceMotion = (): boolean => {
  const atLaunch = useReducedMotion();
  const [reduced, setReduced] = useState(atLaunch);
  useEffect(() => {
    let live = true;
    // A change made before the listener is added is read once it is.
    void AccessibilityInfo.isReduceMotionEnabled().then((now) => {
      if (live) setReduced(now);
    });
    const told = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => {
      live = false;
      told?.remove();
    };
  }, []);
  return reduced;
};
