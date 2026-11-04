/**
 * Say it's live parts. The tick is One's soft impact, the app's only call of
 * One's haptics: a word lit is felt lightly, never as a commit. The recalls
 * are logged as counts and the reference, never a word, and stored nowhere;
 * the scheduler's store takes their place in `src/app.ts`.
 */

import { Effect, Layer } from 'effect';
import { One } from 'one';

import { Haptics, Recalls } from '../sayit';

export const liveHaptics: Layer.Layer<Haptics> = Layer.succeed(
  Haptics,
  Haptics.of({ tick: Effect.sync(() => One.Haptics.impact('soft')) }),
);

export const loggedRecalls: Layer.Layer<Recalls> = Layer.succeed(
  Recalls,
  Recalls.of({
    keep: (recall) =>
      Effect.logInfo('sayit.recall.kept').pipe(
        Effect.annotateLogs({
          reference: recall.reference,
          startedAt: recall.startedAt,
          grade: recall.grade,
          suggested: recall.suggested,
          words: recall.words,
          missed: recall.missed,
          peeked: recall.peeked,
          extra: recall.extra,
        }),
      ),
  }),
);
