import { BunRuntime, BunServices } from '@effect/platform-bun';
import { chromium, type Page } from '@playwright/test';
import { Data, Effect, FileSystem } from 'effect';

import { reportAgainstRecord } from './approval.ts';
import {
  type Pixels,
  QUALITY,
  skyMask,
  windMap,
  withSunLight,
  withoutHillStreaks,
  withoutRays,
} from './field-paint.ts';

const KIT = import.meta.dir;
const ART = `${KIT}/../src/art`;

const WIDTHS = [768, 1536, 3072] as const;
const WIND_WIDTH = 768;

class BrowserError extends Data.TaggedError('BrowserError')<{
  readonly step: string;
  readonly cause: unknown;
}> {}

const step = <A>(name: string, run: () => PromiseLike<A>) =>
  Effect.tryPromise({
    try: () => run(),
    catch: (cause) => new BrowserError({ step: name, cause }),
  });

interface Carried {
  readonly width: number;
  readonly height: number;
  readonly base64: string;
}

const decodeIn = (src: string) => {
  const image = new Image();
  image.src = src;
  return image.decode().then(() => {
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d');
    if (!context) return { width: 0, height: 0, base64: '' };
    context.drawImage(image, 0, 0);
    const bytes = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let text = '';
    for (let at = 0; at < bytes.length; at += 0x8000)
      text += String.fromCharCode(...bytes.subarray(at, at + 0x8000));
    // oxlint-disable-next-line effect/noGlobals -- run in the page, which has no Effect loaded.
    return { width: canvas.width, height: canvas.height, base64: btoa(text) };
  });
};

const encodeIn = ([carried, widths, type, quality]: readonly [
  Carried,
  ReadonlyArray<number>,
  string,
  number,
]) => {
  // oxlint-disable-next-line effect/noGlobals -- run in the page, which has no Effect loaded.
  const text = atob(carried.base64);
  const bytes = new Uint8ClampedArray(text.length);
  for (let at = 0; at < text.length; at++) bytes[at] = text.charCodeAt(at);
  const full = document.createElement('canvas');
  full.width = carried.width;
  full.height = carried.height;
  full.getContext('2d')?.putImageData(new ImageData(bytes, carried.width, carried.height), 0, 0);
  return widths.map((width) => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = Math.round((carried.height * width) / carried.width);
    const context = canvas.getContext('2d');
    if (context) {
      context.imageSmoothingQuality = 'high';
      context.drawImage(full, 0, 0, canvas.width, canvas.height);
    }
    return canvas.toDataURL(type, quality).replace(/^data:[^,]*,/, '');
  });
};

const pixelsOf = (carried: Carried): Pixels => ({
  width: carried.width,
  height: carried.height,
  data: new Uint8ClampedArray(Buffer.from(carried.base64, 'base64')),
});

const carriedOf = (pixels: Pixels): Carried => ({
  width: pixels.width,
  height: pixels.height,
  base64: Buffer.from(pixels.data.buffer, pixels.data.byteOffset, pixels.data.byteLength).toString(
    'base64',
  ),
});

const written = Effect.fn('Kit.fieldWritten')(function* (
  page: Page,
  pixels: Pixels,
  widths: ReadonlyArray<number>,
  type: string,
  file: (width: number) => string,
) {
  const fs = yield* FileSystem.FileSystem;
  const files = yield* step('encode', () =>
    page.evaluate(encodeIn, [carriedOf(pixels), widths, type, QUALITY] as const),
  );
  yield* Effect.forEach(files, (base64, n) => {
    const width = widths[n] ?? 0;
    const bytes = Buffer.from(base64, 'base64');
    return fs
      .writeFile(file(width), bytes)
      .pipe(
        Effect.andThen(
          Effect.logInfo('kit.field.wrote').pipe(
            Effect.annotateLogs({ file: file(width), bytes: bytes.length }),
          ),
        ),
      );
  });
});

const field = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const master = yield* fs.readFile(`${KIT}/art/field.webp`);
  const browser = yield* Effect.acquireRelease(
    step('launch', () => chromium.launch()),
    (opened) => Effect.promise(() => opened.close()),
  );
  const page = yield* step('page', () => browser.newPage());
  const src = `data:image/webp;base64,${Buffer.from(master).toString('base64')}`;
  const painted = pixelsOf(yield* step('decode', () => page.evaluate(decodeIn, src)));
  const sky = skyMask(painted);
  const still = withSunLight(withoutRays(withoutHillStreaks(painted, sky), sky), sky);
  yield* written(page, still, WIDTHS, 'image/webp', (width) => `${ART}/field-${width}.webp`);
  yield* written(
    page,
    windMap(painted, sky),
    [WIND_WIDTH],
    'image/png',
    () => `${ART}/field-wind.png`,
  );
  yield* reportAgainstRecord(`${KIT}/..`);
}).pipe(Effect.scoped);

if (import.meta.main) {
  field.pipe(Effect.provide(BunServices.layer), BunRuntime.runMain);
}
