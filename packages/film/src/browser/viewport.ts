import { Context, Effect, Layer, Option, Stream } from 'effect';

interface ViewportOps {
  readonly matches: (query: string) => Effect.Effect<boolean>;
  readonly changes: (query: string) => Stream.Stream<boolean>;
}

const PHONE_WIDTH = 390;

const WIDTH_QUERY = /^\(\s*(max|min)-width\s*:\s*(\d+(?:\.\d+)?)px\s*\)$/;

const PHONE_FEATURES: ReadonlyMap<string, boolean> = new Map([
  ['(pointer: coarse)', true],
  ['(pointer: fine)', false],
  ['(hover: none)', true],
  ['(hover: hover)', false],
]);

const phoneMatches = (query: string): boolean =>
  Option.match(Option.fromNullishOr(WIDTH_QUERY.exec(query.trim())), {
    onSome: ([, side, width]) => {
      if (side === 'max') return PHONE_WIDTH <= Number(width);
      return PHONE_WIDTH >= Number(width);
    },
    onNone: () => PHONE_FEATURES.get(query.trim()) === true,
  });

export class Viewport extends Context.Service<Viewport, ViewportOps>()(
  '@manna/film/browser/Viewport',
) {
  static readonly served = phoneMatches;

  static readonly layerPhone: Layer.Layer<Viewport> = Layer.succeed(
    Viewport,
    Viewport.of({
      matches: (query) => Effect.succeed(phoneMatches(query)),
      changes: (query) => Stream.succeed(phoneMatches(query)),
    }),
  );
}
