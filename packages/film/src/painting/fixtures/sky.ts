// The smallest painted plates a film can paint, for tests that load a film's
// paintings without a file or a decoder: each PNG read from memory
// (`PaintingImages`) at the size its spec declares, each PNG asked for
// recorded, and a read's release logged when its scope closes.

import { Array as Arr, Effect, Layer, Option } from 'effect';
import type { PaintingSpec } from '../../canvas/painting.ts';
import { PaintingImages, type PaintingImage } from '../images.ts';

/** A sky plate: a frame wide and a margin taller than the frame, set 100 px above it. */
export const SKY: PaintingSpec = {
  key: 'fixtures/sky',
  png: 'paint/sky.png',
  size: [1920, 1280],
  at: [0, -100],
};

/** A near plate: half size, drawn at twice its pixels, its top clear. */
export const NEAR: PaintingSpec = {
  key: 'fixtures/near',
  png: 'paint/near.png',
  size: [960, 300],
  at: [0, 600],
  scale: 2,
  open: ['top'],
};

/**
 * `specs`' PNGs read from memory at their declared sizes (another png reads
 * 1x1), with `image` and `rgba` as the caller gives them; the PNGs asked for,
 * and each read released, in order.
 */
export const paintingImages = (
  specs: ReadonlyArray<PaintingSpec> = [SKY, NEAR],
  made: (spec: PaintingSpec) => Pick<PaintingImage, 'image' | 'rgba'> = () => ({
    image: Option.none(),
    rgba: Option.none(),
  }),
) => {
  const read: Array<string> = [];
  const released: Array<string> = [];
  const layer = Layer.succeed(
    PaintingImages,
    PaintingImages.of({
      read: (png) =>
        Effect.acquireRelease(
          Effect.sync((): PaintingImage => {
            read.push(png);
            return Option.match(
              Arr.findFirst(specs, (s) => s.png === png),
              {
                onNone: () => ({ width: 1, height: 1, image: Option.none(), rgba: Option.none() }),
                onSome: (spec) => ({ width: spec.size[0], height: spec.size[1], ...made(spec) }),
              },
            );
          }),
          () => Effect.sync(() => released.push(png)),
        ),
    }),
  );
  return { read, released, layer };
};
