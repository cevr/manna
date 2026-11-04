/**
 * Which source Say it hears: the microphone, or the native module's replay
 * of a scripted recital. The simulator can never listen (the module refuses
 * there), so a development build on the simulator has one useful source,
 * the replay; every other build, a release build and a development build on
 * a phone alike, hears the microphone. The rule takes its two facts as
 * arguments and reads neither itself: `src/app.ts` gives it `__DEV__` and
 * One's device info.
 */

import type { RecitePlan } from '../dictation/script';

export type SourceKind = 'microphone' | 'replay';

/** The recital the simulator plays: the passage less its 11th word, finalized every 5 words, 150 ms a word (the probe's). */
export const SIMULATOR_PLAN: RecitePlan = { skip: [10], every: 5, pace: 150 };

/** The replay only in a development build on the simulator; the microphone everywhere else. */
export const sourceKind = (build: {
  readonly dev: boolean;
  readonly simulator: boolean;
}): SourceKind => {
  if (build.dev && build.simulator) return 'replay';
  return 'microphone';
};
