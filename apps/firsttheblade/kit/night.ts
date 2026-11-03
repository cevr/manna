import { BunRuntime, BunServices } from '@effect/platform-bun';
import { Data, Effect, FileSystem } from 'effect';
import sharp from 'sharp';

import { reportAgainstRecord } from './approval.ts';
import { QUALITY, withNightSky } from './night-paint.ts';

const KIT = import.meta.dir;
const ART = `${KIT}/../src/art`;
export const SOURCE = `${KIT}/art/night.webp`;

export const WIDTHS = [768, 1536] as const;

class ImageError extends Data.TaggedError('ImageError')<{
  readonly step: string;
  readonly cause: unknown;
}> {}

const image = <A>(step: string, run: () => PromiseLike<A>) =>
  Effect.tryPromise({ try: () => run(), catch: (cause) => new ImageError({ step, cause }) });

export const nightStills = Effect.fn('Kit.nightStills')(function* (source: Uint8Array) {
  const { data, info } = yield* image('decode', () =>
    sharp(source).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
  );
  const painted = withNightSky({
    width: info.width,
    height: info.height,
    data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength),
  });
  const raw = { width: painted.width, height: painted.height, channels: 4 } as const;
  return yield* Effect.forEach(WIDTHS, (width) =>
    image('encode', () =>
      sharp(painted.data, { raw })
        .resize({ width, kernel: 'lanczos3' })
        .webp({ quality: QUALITY })
        .toBuffer(),
    ).pipe(Effect.map((bytes) => ({ width, bytes: new Uint8Array(bytes) }))),
  );
});

const night = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const stills = yield* nightStills(yield* fs.readFile(SOURCE));
  yield* Effect.forEach(stills, ({ width, bytes }) =>
    fs
      .writeFile(`${ART}/night-${width}.webp`, bytes)
      .pipe(
        Effect.andThen(
          Effect.logInfo('kit.night.wrote').pipe(
            Effect.annotateLogs({ file: `src/art/night-${width}.webp`, bytes: bytes.length }),
          ),
        ),
      ),
  );
  yield* reportAgainstRecord(`${KIT}/..`);
});

if (import.meta.main) {
  night.pipe(Effect.provide(BunServices.layer), BunRuntime.runMain);
}
