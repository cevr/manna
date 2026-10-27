// The series lead's turnaround is traced from his part labels (`labels.ts`),
// no seed left in any of its six views, and each table it writes is the one
// kept beside it (`film concept trace --check`, which writes nothing); his
// poses, still picked by seeds, trace to theirs too.

import * as BunServices from '@effect/platform-bun/BunServices';
import { describe, expect, it } from 'effect-bun-test';
import { Effect, Stream } from 'effect';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';
import { TRACE } from './trace.ts';

const APP = `${import.meta.dir}/../../../../..`;

/** `film concept trace <spec> --check` from the app's folder: its exit code and its lines. */
const check = (spec: string) =>
  Effect.scoped(
    Effect.gen(function* () {
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
      const handle = yield* spawner.spawn(
        ChildProcess.make('bun', ['cli.ts', 'concept', 'trace', spec, '--check'], {
          cwd: APP,
          forceKillAfter: '5 seconds',
        }),
      );
      const out = yield* Stream.mkString(Stream.decodeText(handle.stdout));
      return {
        code: Number(yield* handle.exitCode),
        lines: out.split('\n').filter((l) => l !== ''),
      };
    }),
  );

describe("lead-feast's traces", () => {
  it.effect('pick no part of the turnaround by a seed', () =>
    Effect.sync(() => {
      const seeded = Object.entries(TRACE.views).flatMap(([view, v]) =>
        Object.entries(v.parts)
          .filter(([, part]) => (part.seeds ?? []).length > 0)
          .map(([part]) => `${view}.${part}`),
      );
      expect(seeded).toEqual([]);
    }),
  );

  it.effect.layer(BunServices.layer)(
    'trace the turnaround from its labels to its kept tables, and the poses from their seeds to theirs',
    () =>
      Effect.gen(function* () {
        const turnaround = yield* check('src/library/cast/lead-feast/rig/trace.ts');
        expect(turnaround.lines.map((l) => l.split(' ').slice(0, 3).join(' '))).toEqual(
          Object.keys(TRACE.views).map((view) => `same lead-feast ${view}:`),
        );
        expect(turnaround.code).toBe(0);
        const poses = yield* check('src/library/cast/lead-feast/rig/trace-poses.ts');
        expect(poses.lines.filter((l) => l.startsWith('same ')).length).toBe(4);
        expect(poses.code).toBe(0);
      }),
    60_000,
  );
});
