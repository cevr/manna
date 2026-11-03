import { Context, type Effect, Schema } from 'effect';
import type { Raster } from '../core/raster.ts';

/** A puppet that cannot be loaded: a part PNG that cannot be read or decoded, or a skeleton that does not fit its parts. */
export class PuppetUnloadable extends Schema.TaggedError<PuppetUnloadable>()('PuppetUnloadable', {
  /** The puppet by its declared key, or the file asked for. */
  puppet: Schema.String,
  reason: Schema.String,
}) {
  override get message() {
    return `puppet ${this.puppet} cannot be loaded: ${this.reason}`;
  }
}

/** Part PNGs for the puppets' loader. A failure names the file asked for; the loader names the puppet. */
export class PuppetImages extends Context.Service<
  PuppetImages,
  {
    /** A part PNG's pixels, decoded, by the URL (a page) or the path (Bun) its module imported. */
    readonly read: (png: string) => Effect.Effect<Raster, PuppetUnloadable>;
    /** Whether puppets are drawn (a page), or only posed and their figures declared (Bun). */
    readonly paints: boolean;
  }
>()('@manna/film/puppet/PuppetImages') {}
