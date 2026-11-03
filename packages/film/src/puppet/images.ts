import { Context, type Effect, Schema } from 'effect';
import type { Raster } from '../core/raster.ts';

export class PuppetUnloadable extends Schema.TaggedError<PuppetUnloadable>()('PuppetUnloadable', {
  puppet: Schema.String,
  reason: Schema.String,
}) {
  override get message() {
    return `puppet ${this.puppet} cannot be loaded: ${this.reason}`;
  }
}

export class PuppetImages extends Context.Service<
  PuppetImages,
  {
    readonly read: (png: string) => Effect.Effect<Raster, PuppetUnloadable>;
    readonly paints: boolean;
  }
>()('@manna/film/puppet/PuppetImages') {}
