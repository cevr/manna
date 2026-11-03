import * as BunServices from '@effect/platform-bun/BunServices';
import { PuppetImagesBun, puppetFrom } from '@manna/film/tools';
import { rasterOf } from '@manna/film/core';
import { Effect, Layer, Option } from 'effect';
import { expect, it } from 'effect-bun-test';
import { measuredHand, shoulderInk } from './limb-check.ts';
import { cutViews } from './views.ts';

const layer = Layer.mergeAll(
  BunServices.layer,
  PuppetImagesBun.pipe(Layer.provide(BunServices.layer)),
);

// Fixed cap pixels from the review's shoulder crops. The single ink pixel
// is unchanged while the real forearm and hand move. A moving exclusion
// cannot hide it, even when that pose's silhouette crosses the fixed cap.
for (const [key, part, elbow, wrist, x, y] of [
  ['villager-child/cutout/poses-5', 'armRight', 90, 0, 77, 185],
  ['lead-feast/cutout/single-9', 'armRight', 45, -38, 211, 500],
  ['idea-villagers/cutout/poses-3', 'armLeft', 60, -51, 214, 170],
] as const)
  it.effect.layer(layer)(`${key}: moving alpha cannot exempt unchanged shoulder ink`, () =>
    Effect.gen(function* () {
      const views = yield* cutViews;
      const spec = Option.getOrThrow(Option.fromUndefinedOr(views.find((v) => v.key === key)));
      const puppet = yield* puppetFrom(spec);
      const measured = measuredHand(puppet, part);
      const rgba = new Uint8Array(puppet.width * puppet.height * 4);
      for (let i = 0; i < rgba.length; i += 4) rgba.set([240, 220, 180, 255], i);
      const painted = { width: puppet.width, height: puppet.height, rgba };
      const ink = rgba.slice();
      ink.set([20, 10, 3, 255], (y * puppet.width + x) * 4);
      const engine = { ...painted, rgba: ink };
      const pose = (e: number, w: number) => ({
        numbers: { [measured.limb.bones[1]]: e, [measured.limb.bones[2]]: w },
        root: puppet.root,
        scale: 1,
      });
      const traced = rasterOf(puppet, pose(elbow, wrist), [puppet.width, puppet.height], part);
      const moving = Option.getOrThrow(Option.fromUndefinedOr(traced.moving));
      expect(
        Buffer.compare(
          Buffer.from(traced.rgba),
          Buffer.from(rasterOf(puppet, pose(elbow, wrist)).rgba),
        ),
      ).toBe(0);
      expect(moving.every((alpha, i) => alpha <= traced.rgba[i * 4 + 3]!)).toBe(true);
      const fixedMoving = Option.getOrThrow(
        Option.fromUndefinedOr(
          rasterOf(puppet, pose(25, -21), [puppet.width, puppet.height], part).moving,
        ),
      );
      expect(
        shoulderInk(engine, painted, measured, elbow, [0, 0], wrist, engine, moving, fixedMoving),
      ).toBe(1);
    }),
  );
