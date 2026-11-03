import { Array as Arr, Effect, Layer, Option } from 'effect';
import type { PaintingSpec } from '../../canvas/painting.ts';
import { PaintingImages, type PaintingImage } from '../images.ts';

export const SKY: PaintingSpec = {
  key: 'fixtures/sky',
  png: 'paint/sky.png',
  size: [1920, 1280],
  at: [0, -100],
};

export const NEAR: PaintingSpec = {
  key: 'fixtures/near',
  png: 'paint/near.png',
  size: [960, 300],
  at: [0, 600],
  scale: 2,
  open: ['top'],
};

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
