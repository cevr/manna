import { Effect, Layer } from 'effect';
import { PageLoad } from './page-load.ts';

export const pageLoadLayer: Layer.Layer<PageLoad> = Layer.succeed(
  PageLoad,
  PageLoad.of({
    // oxlint-disable-next-line effect/noGlobals -- PageLoad's live adapter: a load of the page anew
    reload: Effect.sync(() => location.reload()),
    open: (href) =>
      Effect.sync(() => {
        // oxlint-disable-next-line effect/noGlobals -- PageLoad's live adapter: a load of another page
        location.assign(href);
      }),
  }),
);
