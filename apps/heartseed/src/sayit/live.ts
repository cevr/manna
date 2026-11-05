/**
 * Say it's live tick: One's soft impact, the app's only call of One's
 * haptics. A word lit is felt lightly, never as a commit. The recalls go to
 * the garden (`src/garden.ts`), which `src/app.ts` provides.
 */

import { Effect, Layer } from 'effect';
import { One } from 'one';

import { Haptics } from '../sayit';

export const liveHaptics: Layer.Layer<Haptics> = Layer.succeed(
  Haptics,
  Haptics.of({ tick: Effect.sync(() => One.Haptics.impact('soft')) }),
);
