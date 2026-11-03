import { Effect, Layer, Queue, Stream } from 'effect';
import { Viewport } from './viewport.ts';

const listFor = (query: string): MediaQueryList =>
  // oxlint-disable-next-line effect/noGlobals -- Viewport's live adapter: the window's media queries
  matchMedia(query);

export const viewportLayer: Layer.Layer<Viewport> = Layer.succeed(
  Viewport,
  Viewport.of({
    matches: (query) => Effect.sync(() => listFor(query).matches),
    changes: (query) =>
      Stream.callback<boolean>((queue) =>
        Effect.acquireRelease(
          Effect.sync(() => {
            const list = listFor(query);
            const changed = () => {
              Queue.offerUnsafe(queue, list.matches);
            };
            list.addEventListener('change', changed);
            changed();
            return { list, changed };
          }),
          ({ list, changed }) => Effect.sync(() => list.removeEventListener('change', changed)),
        ),
      ),
  }),
);
