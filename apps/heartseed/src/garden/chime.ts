/**
 * The growth chime on the web and Android: none. A growth there is logged
 * and not heard; only iOS (`chime.ios.ts`) has a sound the Silent switch
 * mutes.
 */

import { Effect, Layer } from 'effect';

import { Chime } from '../garden';

export const liveChime: Layer.Layer<Chime> = Layer.succeed(
  Chime,
  Chime.of({
    grow: (growth) =>
      Effect.logInfo('garden.chime').pipe(
        Effect.annotateLogs({ reference: growth.reference, to: growth.to, skipped: 'platform' }),
      ),
  }),
);
