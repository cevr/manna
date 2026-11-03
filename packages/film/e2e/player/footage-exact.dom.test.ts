import { Effect, Option, Schema } from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import { ExportAnswers } from '../../src/core/export-handle.ts';
import { footageHref } from '../../src/core/footage.ts';
import {
  FOOTAGE,
  FOOTAGE_CLIP_FRAMES,
  FOOTAGE_FPS,
  FOOTAGE_SOURCE,
  sourceFrameOf,
} from '../../src/lab/fixtures/footage-film.ts';
import { numberedClip, numbersIn } from '../../src/lab/fixtures/numbered-clip.ts';
import { BITS, CLIP_H, CLIP_W, numberOf } from '../../src/lab/fixtures/numbered-frames.ts';
import { openRender } from '../../src/lab/fixtures/render-harness.ts';

const opened = Effect.gen(function* () {
  const clip = yield* numberedClip({ frames: FOOTAGE_CLIP_FRAMES, fps: FOOTAGE_FPS, keyEvery: 1 });
  return yield* openRender(FOOTAGE, { [footageHref(FOOTAGE_SOURCE, 'mezzanine')]: clip });
});

const BARS = { x: 0, y: CLIP_H / 2 - 4, w: CLIP_W, h: 8, cols: BITS, rows: 1 };

describe('footage is frame-exact', () => {
  it.live(
    'a frame drawn alone shows the source frame its edit names, reached in any order: either side of the seam, back and forth',
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const page = yield* opened;
          const frames = [0, 1, 59, 60, 61, 119, 45, 30, 75, 0, 100];
          const shown = yield* Effect.forEach(frames, (i) =>
            Effect.map(page.call('luma', i, BARS), numberOf),
          );
          expect(shown).toEqual(frames.map(sourceFrameOf));
          expect(page.errors).toEqual([]);
        }),
      ),
    60_000,
  );

  it.live(
    'an export chunk shows each source frame its edit names, from a start between key frames on over the seam',
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const page = yield* opened;
          const choice = yield* page.call('encoder', 1, 'master', [
            { _tag: 'Hardware' },
            { _tag: 'Software' },
          ]);
          if (choice._tag === 'Missing') return yield* Effect.die(choice.reason);
          const [from, to] = [45, 75];
          const chunk = yield* Schema.decodeEffect(ExportAnswers.encode)(
            yield* page.call('encode', from, to, 1, 'master', choice),
          ).pipe(Effect.orDie);
          const shown = yield* numbersIn(Option.getOrThrow(chunk.master));
          expect(shown).toEqual(
            Array.from({ length: to - from }, (_, k) => sourceFrameOf(from + k)),
          );
          expect(page.errors).toEqual([]);
        }),
      ),
    60_000,
  );
});
