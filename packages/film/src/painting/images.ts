import { Context, type Effect, type Option, Schema, type Scope } from 'effect';

/** A painting that cannot be loaded: a PNG that cannot be read or decoded, of another size than its spec, or painted on an edge it declares open. */
export class PaintingUnloadable extends Schema.TaggedError<PaintingUnloadable>()(
  'PaintingUnloadable',
  {
    /** The painting by its spec's key, or the file asked for. */
    painting: Schema.String,
    reason: Schema.String,
  },
) {
  override get message() {
    return `painting ${this.painting} cannot be loaded: ${this.reason}`;
  }
}

/** A plate's PNG as a host reads it: its size, the image a page draws, and the bytes a host that decodes them holds. */
export interface PaintingImage {
  readonly width: number;
  readonly height: number;
  /** What `drawImage` paints: some in a page, none in Bun, where nothing is drawn. */
  readonly image: Option.Option<CanvasImageSource>;
  /** RGBA bytes, row by row from the top: some where the host decodes the file (Bun), for the loader's open-edge check. */
  readonly rgba: Option.Option<Uint8Array>;
}

/** Plate PNGs for the paintings' loader. A failure names the file asked for; the loader names the painting. */
export class PaintingImages extends Context.Service<
  PaintingImages,
  {
    /**
     * A plate PNG, by the URL (a page) or the path (Bun) its module imported.
     * What it holds (a page's bitmap) is the caller's scope's, freed when it
     * closes.
     */
    readonly read: (png: string) => Effect.Effect<PaintingImage, PaintingUnloadable, Scope.Scope>;
  }
>()('@manna/film/painting/PaintingImages') {}
