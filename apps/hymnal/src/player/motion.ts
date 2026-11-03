import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

export const useReduceMotion = (): boolean => {
  const atLaunch = useReducedMotion();
  const [reduced, setReduced] = useState(atLaunch);
  useEffect(() => {
    let live = true;
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
