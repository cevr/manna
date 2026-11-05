import * as BunCrypto from '@effect/platform-bun/BunCrypto';
import * as BunRuntime from '@effect/platform-bun/BunRuntime';
import * as BunServices from '@effect/platform-bun/BunServices';
import { Config, Effect, Layer, Option } from 'effect';
import { filmCast, filmFolder, filmNamed, filmShot } from '../films.ts';
import { loadShot, StorybookFailed } from '../render.ts';
import { shareOf } from '../sheet.ts';
import { hold, type Shot } from '../shot.ts';
import { verifyShot } from './run.ts';

/** The shot id the growth preload stretches the baby's breath in. */
export const BABY_SHOT = 'height-baby';

/**
 * The height acceptance's run of the real milk-row baby held in `sit`
 * (verifier round 1, M1): drawn `HEIGHT_BABY_PX` tall, whole or cut by the
 * frame's left edge (`HEIGHT_BABY_CUT`), through the full verify into
 * `HEIGHT_BABY_OUT`. Run under `height-growth.preload.ts`, whose
 * `HEIGHT_BABY_FACTOR` stretches its breath from 1 s while its key holds.
 * At 300 px it stands 0.4 px below a whole px and the camera moves 0.2 px
 * up at 1 s, the receipts' own phases.
 */
const main = Effect.gen(function* () {
  const target = yield* Config.Finite('HEIGHT_BABY_PX');
  const cut = yield* Config.Literals(['whole', 'left'], 'HEIGHT_BABY_CUT');
  const out = yield* Config.String('HEIGHT_BABY_OUT');
  const film = yield* filmNamed('in-its-order');
  const { shot: original } = yield* filmShot(film, 'milk-row');
  const cast = yield* filmCast(film);
  const loaded = yield* loadShot(original, cast);
  const stored = yield* Effect.fromOption(
    Option.fromUndefinedOr(loaded.figures.find((f) => f.figure.name === 'baby')),
    () => StorybookFailed.make({ reason: 'milk-row draws no baby' }),
  );
  const lines = yield* Effect.fromOption(
    Option.flatten(Option.fromUndefinedOr(stored.lines.get('sit'))),
    () => StorybookFailed.make({ reason: 'the baby has no sit lines' }),
  );
  const height = lines.bottom - lines.crown + 1;
  const share = shareOf(stored.palette, stored.figure.sheet);
  const [phase = 0, moved = 0] = [
    [0, 0],
    [0.4, 0.2],
  ][Number(target === 300)] ?? [0, 0];
  const x = [original.size.width / 2 + 0.5, 0.5][Number(cut === 'left')] ?? 0.5;
  const { width, height: frameHeight } = original.size;
  const shot: Shot = {
    ...original,
    id: BABY_SHOT,
    from: 0,
    fps: 1,
    duration: 2,
    headPx: (target * stored.head) / (height * share),
    camera: [
      { t: 0, x: width / 2, y: frameHeight / 2, zoom: 1 },
      { t: 1, x: width / 2, y: frameHeight / 2 - moved, zoom: 1 },
    ],
    layers: [
      {
        name: 'baby',
        z: 1,
        blur: 0,
        items: [
          {
            ...stored.figure,
            size: 1,
            at: { x, ground: frameHeight * 0.8 + phase },
            worn: [],
            spans: [hold(0, 2, 'sit')],
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
