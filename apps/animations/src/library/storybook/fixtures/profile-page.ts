import * as BunRuntime from '@effect/platform-bun/BunRuntime';
import * as BunServices from '@effect/platform-bun/BunServices';
import { encodePng } from '@manna/film/tools';
import { Config, Console, Effect, Match } from 'effect';
import { Base64 } from 'effect/encoding';
import { leadFeast } from '../../toon3d/lead-feast.ts';
import { toon3dPage, viewRequest } from '../../toon3d/render.ts';
import { storybookPage } from '../render.ts';

/** A 4 × 4 plate of one warm colour, as the scene's one picture. */
const PLATE = `data:image/png;base64,${Base64.encode(
  encodePng({ width: 4, height: 4, rgba: new Uint8Array(4 * 4 * 4).fill(200) }),
)}`;

/** The storybook page of a one-plate scene, one frame of it rendered (a window under Chrome's smallest decodes no picture). */
const storybook = Effect.gen(function* () {
  const render = yield* storybookPage({
    width: 640,
    height: 480,
    paper: '#fdf7e5',
    layers: [
      {
        name: 'set',
        z: 0,
        blur: 0,
        items: [{ _tag: 'Plate', image: PLATE, place: { x: 0, y: 0, width: 640, height: 480 } }],
      },
    ],
  });
  return yield* render({ camera: { x: 320, y: 240, zoom: 1 }, figures: [], output: 'colour' });
});

/** The toon3d page of the lead, its front view rendered. */
const toon3d = Effect.gen(function* () {
  const render = yield* toon3dPage({ width: 400, height: 700 }, leadFeast);
  return yield* render(viewRequest('front', { width: 400, height: 700, ox: 200, oy: 650 }));
});

Effect.gen(function* () {
  const page = yield* Config.Literals(['storybook', 'toon3d'], 'PROFILE_PAGE');
  const end = yield* Config.Literals(['exit', 'hold'], 'PROFILE_END');
  const png = yield* Match.value(page).pipe(
    Match.when('storybook', () => storybook),
    Match.orElse(() => toon3d),
  );
  yield* Console.log(`rendered ${png.length} bytes`);
  if (end === 'hold') return yield* Effect.never;
}).pipe(Effect.scoped, Effect.provide(BunServices.layer), BunRuntime.runMain);
