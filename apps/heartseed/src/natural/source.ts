/**
 * The natural voice's module on the web and Android: none. `status` reports
 * nothing installed, and every other call fails, so a reading there ends at
 * once; pause, resume, stop and cancelInstall do nothing.
 */

import { Effect, Layer } from 'effect';

import { NaturalModule, NaturalUnavailable } from './module';

const unavailable = Effect.fail(
  NaturalUnavailable.make({ reason: 'no natural voice on this platform' }),
);

export const naturalModule: Layer.Layer<NaturalModule> = Layer.succeed(
  NaturalModule,
  NaturalModule.of({
    status: (revision) =>
      Effect.succeed({
        revision,
        files: 0,
        bytes: 0,
        excluded: false,
        crashed: false,
        loaded: false,
        installing: false,
        footprint: 0,
        peak: 0,
      }),
    install: () => unavailable,
    cancelInstall: Effect.void,
    remove: unavailable,
    load: () => unavailable,
    render: () => unavailable,
    play: () => unavailable,
    pause: Effect.void,
    resume: Effect.void,
    stop: Effect.void,
    subscribe: () => Effect.void,
    subscribeInstall: () => Effect.void,
  }),
);
