import * as BunServices from '@effect/platform-bun/BunServices';
import { Effect, FileSystem, Option, Result } from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import { readSkinned, type SkinnedRest } from './glb.ts';

const GLB = `${import.meta.dir}/../../cast/lead-feast/mesh/rigged_character.glb`;

// oxlint-disable-next-line effect/noAsyncFunction -- the shared fixture is built as the file loads, outside every case's time limit
const read: SkinnedRest = await Effect.runPromise(
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    return yield* Effect.fromResult(readSkinned(yield* fs.readFile(GLB)));
  }).pipe(Effect.provide(BunServices.layer)),
);

const rest = Effect.succeed(read);

const named = (r: SkinnedRest, name: string) => r.skeleton.find((j) => j.name === name);

describe('readSkinned', () => {
  it.effect('reads the lead-feast mesh: its vertices, faces and 24 joints', () =>
    Effect.gen(function* () {
      const r = yield* rest;
      expect(r.positions.length / 3).toBe(26725);
      expect(r.indices.length / 3).toBe(30585);
      expect(r.joints.length).toBe(26725 * 4);
      expect(r.weights.length).toBe(26725 * 4);
      expect(r.skeleton.length).toBe(24);
    }),
  );

  it.effect(
    "applies the armature's 0.01 scale: the hips stand near 0.86 and the head above them",
    () =>
      Effect.gen(function* () {
        const r = yield* rest;
        const hips = named(r, 'Hips');
        const head = named(r, 'Head');
        expect(hips?.head[1]).toBeCloseTo(0.863, 2);
        expect(Option.isNone(hips?.parent ?? Option.some(0))).toBe(true);
        expect(head?.head[1] ?? 0).toBeGreaterThan(hips?.head[1] ?? 1);
      }),
  );

  it.effect("each joint's parent is a joint, and the right arm sits at negative x", () =>
    Effect.gen(function* () {
      const r = yield* rest;
      const fore = r.skeleton.findIndex((j) => j.name === 'RightForeArm');
      const parent = Option.getOrElse(r.skeleton[fore]?.parent ?? Option.none(), () => -1);
      expect(r.skeleton[parent]?.name).toBe('RightArm');
      expect(r.skeleton[fore]?.head[0] ?? 0).toBeLessThan(0);
    }),
  );

  it.effect('the rest positions span the figure: soles near 0, head near the top', () =>
    Effect.gen(function* () {
      const r = yield* rest;
      const ys = Array.from(
        { length: r.positions.length / 3 },
        (_, i) => r.positions[i * 3 + 1] ?? 0,
      );
      const min = ys.reduce((a, b) => Math.min(a, b), Infinity);
      const max = ys.reduce((a, b) => Math.max(a, b), -Infinity);
      expect(min).toBeGreaterThan(-0.1);
      expect(max).toBeGreaterThan(1.5);
    }),
  );

  it.effect('each vertex has weights that sum to 1', () =>
    Effect.gen(function* () {
      const r = yield* rest;
      const off = Array.from({ length: r.weights.length / 4 }, (_, i) =>
        Math.abs(
          (r.weights[i * 4] ?? 0) +
            (r.weights[i * 4 + 1] ?? 0) +
            (r.weights[i * 4 + 2] ?? 0) +
            (r.weights[i * 4 + 3] ?? 0) -
            1,
        ),
      ).filter((d) => d > 1e-3);
      expect(off.length).toBe(0);
    }),
  );

  it.effect('a file without the glTF magic is unreadable', () =>
    Effect.sync(() => {
      expect(Result.isFailure(readSkinned(new Uint8Array(32)))).toBe(true);
    }),
  );
});
