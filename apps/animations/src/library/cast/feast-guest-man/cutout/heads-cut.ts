// Cuts the man's head keys (`heads.ts`) from his kept seated sheet: his turn
// (poses-2) and his smile (poses-3), each laid on his poses-1 part sheet's
// frame (`frames.ts`) where its neck lies on the neutral's, and cut by his
// poses-1 cut (`cut.ts`). That cut's head is every row above his chin, the
// headcloth's top and band with it, as the feast mother's poses-1 cut keeps
// her veil's top with her head: the drape below the chin stays on his neutral
// torso. Each key is written to `sheets/poses-1/head-<key>.png`, the view's
// bytes where the head owns a pixel and alpha 0 elsewhere, as the parts CLI
// writes his head part. Run it from the repo root with
// `bun apps/animations/src/library/cast/feast-guest-man/cutout/heads-cut.ts`.

import * as BunRuntime from '@effect/platform-bun/BunRuntime';
import * as BunServices from '@effect/platform-bun/BunServices';
import { type Raster, cutParts, decodePng, encodePng } from '@manna/film/tools';
import { Array as Arr, Console, Effect, FileSystem, Option, Record } from 'effect';
import { CUTS, cutOptionsFor } from './cut.ts';
import { boxOf } from './frames.ts';

const here = import.meta.dir;
const KEPT = `${here}/../cast-sheet/kept/poses.png`;

/**
 * Each key's view on his kept sheet: poses-1's part sheet frame moved by
 * `at`, sheet px. Each shift is the one, within 10 px across and 6 down of
 * the body's best (`[491, 0]` and `[984, 0]`), whose rows below the chin
 * (view rows 267-300, columns 110-300: his neck and collar between the
 * drape's inner edges) best match the neutral's: 12.4 % and 12.7 % of those
 * px step over 30 in a channel, against 16.9 % and 16.7 % at the body's best
 * (measured), so each key's neck runs on into his neutral torso's.
 */
const KEYS = {
  // poses-2: turned to the lead, his mouth open
  turn: [490, -1],
  // poses-3: smiling at the lead, turned as the turn is
  smile: [983, -1],
} as const;

/** The `[x0, y0, x1, y1]` box of `sheet`, its far edges exclusive. */
const cropOf = (
  sheet: Raster,
  [x0, y0, x1, y1]: readonly [number, number, number, number],
): Raster => {
  const [w, h] = [x1 - x0, y1 - y0];
  const rgba = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++)
    rgba.set(
      sheet.rgba.subarray(((y0 + y) * sheet.width + x0) * 4, ((y0 + y) * sheet.width + x1) * 4),
      y * w * 4,
    );
  return { width: w, height: h, rgba };
};

const cut = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const sheet = yield* Effect.fromResult(decodePng(yield* fs.readFile(KEPT)));
  const [x0, y0, x1, y1] = boxOf('poses-1');
  yield* Effect.forEach(Record.toEntries(KEYS), ([name, [dx, dy]]) =>
    Effect.gen(function* () {
      const view = cropOf(sheet, [x0 + dx, y0 + dy, x1 + dx, y1 + dy]);
      const parts = yield* Effect.fromResult(
        cutParts(view, CUTS['poses-1'], cutOptionsFor('poses-1', view)),
      );
      const head = yield* Option.match(
        Arr.findFirst(parts.parts, (p) => p.name === 'head'),
        {
          onNone: () => Effect.die(new Error('his poses-1 cut has no head part')),
          onSome: Effect.succeed,
        },
      );
      yield* fs.writeFile(`${here}/sheets/poses-1/head-${name}.png`, encodePng(head.pixels));
      yield* Console.log(`head-${name}.png: ${head.kept} px, at [${dx}, ${dy}]`);
    }),
  );
});

if (import.meta.main) cut.pipe(Effect.provide(BunServices.layer), BunRuntime.runMain);
