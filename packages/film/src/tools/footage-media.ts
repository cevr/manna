// The footage library's media work (`footage.ts`): an original probed in
// place, its copies made, and a take's voice decoded. Its live layer
// (`footage-media-live.ts`, which says how) loads with mediabunny only when
// `FootageMedia.layer` is built, so a module that names the service, or a
// test that doubles it, loads none of it.

import { Context, Effect, Layer } from 'effect';
import type { Pcm } from '../core/audio.ts';
import type { FootageCopy, FootagePicture, FootageProbe } from '../core/footage.ts';
import type { MediaFailed } from '../core/refusals.ts';

/** What the probe found: what the lock records, and whether the picture is HDR (which import refuses). */
export interface FootageProbed {
  readonly probe: FootageProbe;
  readonly hdr: boolean;
}

interface FootageMediaService {
  /** The original at `file`, read in place: its container, picture and sound. */
  readonly probe: (file: string) => Effect.Effect<FootageProbed, MediaFailed>;
  /** The original at `file`'s `copy`, made by its recipe (`FOOTAGE_RECIPES`) and written whole to `out`. */
  readonly copy: (
    file: string,
    picture: FootagePicture,
    copy: FootageCopy,
    out: string,
  ) => Effect.Effect<void, MediaFailed>;
  /** The original at `file`'s sound as one channel at `rate`, on its picture's clock (above). */
  readonly voice: (
    file: string,
    picture: FootagePicture,
    rate: number,
  ) => Effect.Effect<Pcm, MediaFailed>;
}

export class FootageMedia extends Context.Service<FootageMedia, FootageMediaService>()(
  '@bible/film/tools/FootageMedia',
) {
  /** Over the media service's coders, and the files on disk, its module loaded when the layer is built. */
  static readonly layer = Layer.unwrap(
    Effect.promise(() => import('./footage-media-live.ts')).pipe(Effect.map((live) => live.layer)),
  );
}
