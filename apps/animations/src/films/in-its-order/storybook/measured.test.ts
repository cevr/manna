import * as BunServices from '@effect/platform-bun/BunServices';
import { Effect, Option } from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import { pngIn } from './cast-files.ts';
import { MEASURED, measureMiss, PALETTES } from './palettes.ts';
import { SHEETS } from './sheets.ts';

describe('act 1 measured paints, on their own drawings', () => {
  it.effect(
    'every measured paint reads within ΔE 2 in its box on its own drawing, and is a paint its member takes',
    () =>
      Effect.gen(function* () {
        const misses = yield* Effect.forEach(MEASURED, (m) =>
          Effect.map(pngIn(m.member, m.source), (drawing) =>
            Option.toArray(
              Option.map(
                measureMiss(drawing, m),
                (d) => `${m.member} ${m.hex}: ΔE ${d.toFixed(2)}`,
              ),
            ),
          ),
        );
        expect(misses.flat()).toEqual([]);
        const taken = MEASURED.filter((m) => {
          const props = SHEETS.filter((s) => s.member === m.member).flatMap((s) => s.props ?? []);
          return ![...(PALETTES.get(m.member)?.parts ?? []), ...props].some(
            (p) => p.base === m.hex || p.shade === m.hex,
          );
        });
        expect(taken.map((m) => `${m.member} ${m.hex}`)).toEqual([]);
      }).pipe(Effect.provide(BunServices.layer)),
  );
});
