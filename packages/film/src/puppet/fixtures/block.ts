import { Effect, Layer } from 'effect';
import type { PuppetSpec } from '../../canvas/puppet.ts';
import { PuppetImages } from '../images.ts';

export const BLOCK: PuppetSpec = {
  key: 'fixtures/block',
  size: [16, 16],
  parts: [{ name: 'body', png: 'block/body.png' }],
  skeleton: { bones: [{ name: 'spine', pivot: [8, 12], tip: [8, 4] }], skin: { body: ['spine'] } },
  origin: [8, 12],
};

export const blockImages = () => {
  const rgba = new Uint8Array(16 * 16 * 4);
  for (let y = 4; y < 12; y++)
    for (let x = 4; x < 12; x++) rgba.set([120, 80, 60, 255], (y * 16 + x) * 4);
  const read: Array<string> = [];
  const layer = Layer.succeed(
    PuppetImages,
    PuppetImages.of({
      read: (png) => Effect.sync(() => (read.push(png), { width: 16, height: 16, rgba })),
      paints: false,
    }),
  );
  return { read, layer };
};
