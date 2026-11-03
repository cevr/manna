import { Array as Arr, Option, Order, Schema } from 'effect';

const MAIN_VARIANT = 'main';

const BOARD_VARIANT = 'board';

export const CatalogueRender = Schema.Struct({
  address: Schema.Struct({ _tag: Schema.String }),
  variant: Schema.String,
  kind: Schema.String,
  settings: Schema.Struct({ scale: Schema.Finite }),
  span: Schema.OptionFromOptionalKey(Schema.Unknown),
  files: Schema.Struct({ share: Schema.OptionFromOptionalKey(Schema.String) }),
  at: Schema.Finite,
});
export type CatalogueRender = typeof CatalogueRender.Type;

export const Catalogue = Schema.fromJsonString(
  Schema.Struct({ renders: Schema.Array(CatalogueRender) }),
);

const wholeFilmShare = (render: CatalogueRender) =>
  render.address._tag === 'Film' &&
  render.kind === 'video' &&
  Option.isNone(render.span) &&
  Option.isSome(render.files.share);

export const isBoardRender = (render: CatalogueRender) =>
  wholeFilmShare(render) && render.variant === BOARD_VARIANT;

export const isFullRender = (render: CatalogueRender) =>
  wholeFilmShare(render) && render.variant === MAIN_VARIANT && render.settings.scale === 1;

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
