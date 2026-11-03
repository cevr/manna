import { Context, type Effect, type Option, Schema, type Scope } from 'effect';

export class PaintingUnloadable extends Schema.TaggedError<PaintingUnloadable>()(
  'PaintingUnloadable',
  {
    painting: Schema.String,
    reason: Schema.String,
  },
) {
  override get message() {
    return `painting ${this.painting} cannot be loaded: ${this.reason}`;
  }
}

export interface PaintingImage {
  readonly width: number;
  readonly height: number;
  readonly image: Option.Option<CanvasImageSource>;
  readonly rgba: Option.Option<Uint8Array>;
}

export class PaintingImages extends Context.Service<
  PaintingImages,
  {
    readonly read: (png: string) => Effect.Effect<PaintingImage, PaintingUnloadable, Scope.Scope>;
  }
>()('@manna/film/painting/PaintingImages') {}
