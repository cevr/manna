import { Context, Effect, Layer } from 'effect';
import type { CodeRange } from '../core/schema.ts';

export type HighlightName =
  | 'lab-live'
  | 'lab-picked'
  | 'code-live'
  | 'code-held'
  | 'code-dim'
  | 'lab-noted'
  | 'lab-struck';

interface HighlightsOps {
  readonly paint: (
    name: HighlightName,
    root: Node,
    ranges: ReadonlyArray<CodeRange>,
  ) => Effect.Effect<void>;
  readonly clear: (name: HighlightName) => Effect.Effect<void>;
}

export class Highlights extends Context.Service<Highlights, HighlightsOps>()(
  '@manna/film/browser/Highlights',
) {
  static readonly none: Layer.Layer<Highlights> = Layer.succeed(
    Highlights,
    Highlights.of({ paint: () => Effect.void, clear: () => Effect.void }),
  );
}
