// Which catalogued render a screening version publishes, over a catalogue as
// `film render` writes one: the full render among the Board renders, look
// wedges and proofs rendered after it.

import { describe, expect, it } from 'effect-bun-test';
import { Effect, Option, Schema } from 'effect';
import { CatalogueRender, isBoardRender, isFullRender, newestOf } from './screening-renders.ts';

/** What a row's test may change, in the catalogue's JSON form. */
interface RowChange {
  readonly kind?: string;
  readonly address?: { readonly _tag: string; readonly scene?: string };
  readonly settings?: { readonly scale: number; readonly captions: boolean };
  readonly span?: { readonly from: number; readonly to: number };
  readonly files?: { readonly share?: string; readonly images: ReadonlyArray<string> };
}

/** A catalogue row of a whole-film video with a share copy, rendered at `at`; `extra` changes it. */
const row = (variant: string, at: number, extra: RowChange = {}) => ({
  address: { _tag: 'Film' },
  variant,
  kind: 'video',
  settings: { scale: 1, captions: true },
  files: { share: `share/${variant}-${at}.mp4`, images: [] },
  at,
  ...extra,
});

/** The rows as the publisher reads them from `catalogue.json`. */
const catalogue = (rows: ReadonlyArray<ReturnType<typeof row>>) =>
  Effect.map(Schema.decodeEffect(Schema.Array(CatalogueRender))(rows), (renders) => ({
    renders,
  }));

const shareOf = (
  found: Option.Option<{ readonly files: { readonly share: Option.Option<string> } }>,
) => Option.flatMap(found, (render) => render.files.share);

describe('the render a screening version publishes', () => {
  it.effect(
    'a render is the full render of the film, not a wedge, Board copy or proof after it',
    () =>
      Effect.gen(function* () {
        const { renders } = yield* catalogue([
          row('main', 1),
          row('board', 2),
          row('board-review', 3),
          row('proof', 4),
          row('style-look-1', 5),
          row('main', 6, { settings: { scale: 0.5, captions: true } }),
          row('main', 7, { span: { from: 0, to: 30 } }),
          row('main', 8, { files: { images: [] } }),
          row('main', 9, { kind: 'stills' }),
          row('main', 10, { address: { _tag: 'Scene', scene: 'a' } }),
        ]);
        expect(shareOf(newestOf(renders, isFullRender))).toEqual(Option.some('share/main-1.mp4'));
      }),
  );

  it.effect('the newest full render wins', () =>
    Effect.gen(function* () {
      const { renders } = yield* catalogue([row('main', 3), row('main', 9), row('main', 5)]);
      expect(shareOf(newestOf(renders, isFullRender))).toEqual(Option.some('share/main-9.mp4'));
    }),
  );

  it.effect('a film rendered only as wedges and Boards has no render to publish', () =>
    Effect.gen(function* () {
      const { renders } = yield* catalogue([row('board', 1), row('style-look-1', 2)]);
      expect(newestOf(renders, isFullRender)).toEqual(Option.none());
    }),
  );

  it.effect('a board is the Board render, not its review copy', () =>
    Effect.gen(function* () {
      const { renders } = yield* catalogue([
        row('board', 1),
        row('board-review', 2),
        row('main', 3),
      ]);
      expect(shareOf(newestOf(renders, isBoardRender))).toEqual(Option.some('share/board-1.mp4'));
    }),
  );
});
