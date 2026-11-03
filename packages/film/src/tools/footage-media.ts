import { Context, Effect, Layer } from 'effect';
import type { Pcm } from '../core/audio.ts';
import type { FootageCopy, FootagePicture, FootageProbe } from '../core/footage.ts';
import type { MediaFailed } from '../core/refusals.ts';

export interface FootageProbed {
  readonly probe: FootageProbe;
  readonly hdr: boolean;
}

interface FootageMediaService {
  readonly probe: (file: string) => Effect.Effect<FootageProbed, MediaFailed>;
  readonly copy: (
    file: string,
    picture: FootagePicture,
    copy: FootageCopy,
    out: string,
  ) => Effect.Effect<void, MediaFailed>;
  readonly voice: (
    file: string,
    picture: FootagePicture,
    rate: number,
  ) => Effect.Effect<Pcm, MediaFailed>;
}

export class FootageMedia extends Context.Service<FootageMedia, FootageMediaService>()(
  '@manna/film/tools/FootageMedia',
) {
  static readonly layer = Layer.unwrap(
    Effect.promise(() => import('./footage-media-bun.ts')).pipe(Effect.map((live) => live.layer)),
  );
}
