/**
 * Which of a film's catalogued renders a screening version publishes
 * (`./screening.ts`), read off `out/<film>/catalogue.json`:
 *
 * - `board`: the newest whole-film video of the `board` variant
 *   (`film render <film> --board --share-only`, or any `--board` render
 *   with its share copy);
 * - `render`, and a `final` with no `--from`: the newest full render of the
 *   film, the `main` variant at full scale. A look wedge (a `--level`
 *   render, its own variant), a Board render under any variant name, a
 *   review render and a scaled-down proof are never it: `--from` names any
 *   of those for a `final` that wants one.
 *
 * Each needs a share copy, the file the site serves.
 */
import { Array as Arr, Option, Order, Schema } from 'effect';

/** The variant a whole render of the film is catalogued as (`@manna/film`'s `MAIN_VARIANT`). */
const MAIN_VARIANT = 'main';

/** The variant `film render --board` catalogues its render as (`--review` makes it `board-review`). */
const BOARD_VARIANT = 'board';

/** What the catalogue says of a render, as far as publishing reads it (`@manna/film`'s `catalogue.json`). */
export const CatalogueRender = Schema.Struct({
  address: Schema.Struct({ _tag: Schema.String }),
  variant: Schema.String,
  kind: Schema.String,
  settings: Schema.Struct({ scale: Schema.Finite }),
  /** Set for a stretch of the film (an act, scenes); a whole-film render has none. */
  span: Schema.OptionFromOptionalKey(Schema.Unknown),
  files: Schema.Struct({ share: Schema.OptionFromOptionalKey(Schema.String) }),
  at: Schema.Finite,
});
export type CatalogueRender = typeof CatalogueRender.Type;

export const Catalogue = Schema.fromJsonString(
  Schema.Struct({ renders: Schema.Array(CatalogueRender) }),
);

/** A video of the whole film, with a share copy. */
const wholeFilmShare = (render: CatalogueRender) =>
  render.address._tag === 'Film' &&
  render.kind === 'video' &&
  Option.isNone(render.span) &&
  Option.isSome(render.files.share);

/** The render a `board` version is the share copy of. */
export const isBoardRender = (render: CatalogueRender) =>
  wholeFilmShare(render) && render.variant === BOARD_VARIANT;

/** A full render of the film: what a `render` version, and a `final` with no `--from`, publishes. */
export const isFullRender = (render: CatalogueRender) =>
  wholeFilmShare(render) && render.variant === MAIN_VARIANT && render.settings.scale === 1;

/** The newest of `renders` that `wanted` admits. */
export const newestOf = (
  renders: ReadonlyArray<CatalogueRender>,
  wanted: (render: CatalogueRender) => boolean,
): Option.Option<CatalogueRender> =>
  Arr.head(
    Arr.sort(
      renders.filter(wanted),
      Order.flip(Order.mapInput(Order.Number, (render: CatalogueRender) => render.at)),
    ),
  );
