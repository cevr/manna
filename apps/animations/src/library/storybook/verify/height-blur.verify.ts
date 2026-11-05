import * as BunCrypto from '@effect/platform-bun/BunCrypto';
import * as BunRuntime from '@effect/platform-bun/BunRuntime';
import * as BunServices from '@effect/platform-bun/BunServices';
import { Config, Effect, Layer, Option } from 'effect';
import { filmCast, filmFolder, filmNamed, filmShot } from '../films.ts';
import { loadShot, StorybookFailed } from '../render.ts';
import { shareOf } from '../sheet.ts';
import { hold, type Shot } from '../shot.ts';
import { verifyShot } from './run.ts';

/** The shot id the growth preload stretches the blurred lead's breath in. */
export const BLUR_SHOT = 'height-blur';

/**
 * The height acceptance's run of the real milk-row lead held in `front`
 * on a layer blurred `HEIGHT_BLUR` px (verifier round 2, M1): drawn 120 px
 * tall at zoom 1, while the camera pushes from zoom 0.856 to 1.512, whole
 * or cut by the frame's left edge (`HEIGHT_BLUR_CUT`), through the full
 * verify into `HEIGHT_BLUR_OUT`. Run under `height-growth.preload.ts`,
 * whose `HEIGHT_BREATH_FACTOR` stretches its breath from 1 s while its key
 * holds. The camera's phases are the receipts' own.
 */
const main = Effect.gen(function* () {
  const blur = yield* Config.Finite('HEIGHT_BLUR');
  const cut = yield* Config.Literals(['whole', 'left'], 'HEIGHT_BLUR_CUT');
  const out = yield* Config.String('HEIGHT_BLUR_OUT');
  const film = yield* filmNamed('in-its-order');
  const { shot: original } = yield* filmShot(film, 'milk-row');
  const cast = yield* filmCast(film);
  const loaded = yield* loadShot(original, cast);
  const stored = yield* Effect.fromOption(
    Option.fromUndefinedOr(loaded.figures.find((f) => f.figure.name === 'lead')),
    () => StorybookFailed.make({ reason: 'milk-row draws no lead' }),
  );
  const lines = yield* Effect.fromOption(
    Option.flatten(Option.fromUndefinedOr(stored.lines.get('front'))),
    () => StorybookFailed.make({ reason: 'the lead has no front lines' }),
  );
  const target = 120;
  const { width, height } = original.size;
  const world = { x: width / 2, y: height * 0.8 };
  const camera = [0.07, 0.89].map((phase, t) => {
    const zoom = 0.8 + phase * 0.8;
    const px = [width / 2 + 0.19 + phase * 0.73, -0.31 + phase * 0.73][Number(cut === 'left')] ?? 0;
    const py = height * 0.8 + phase * 0.91;
    return {
      t,
      x: world.x + (width / 2 - px) / zoom,
      y: world.y + (height / 2 - py) / zoom,
      zoom,
    };
  });
  const shot: Shot = {
    ...original,
    id: BLUR_SHOT,
    from: 0,
    fps: 1,
    duration: 2,
    headPx:
      (target * stored.head) /
      ((lines.bottom - lines.crown + 1) * shareOf(stored.palette, stored.figure.sheet)),
    camera,
    layers: [
      {
        name: 'lead',
        z: 1,
        blur,
        items: [
          {
            ...stored.figure,
            size: 1,
            at: { x: world.x, ground: world.y },
            worn: [],
            spans: [hold(0, 2, 'front')],
          },
        ],
      },
    ],
  };
  yield* verifyShot(shot, out, 1, cast);
});

if (import.meta.main)
  main.pipe(
    Effect.provide(
      Layer.mergeAll(
        filmFolder.pipe(Layer.provide(BunServices.layer)),
        BunServices.layer,
        BunCrypto.layerDigest,
      ),
    ),
    BunRuntime.runMain,
  );
