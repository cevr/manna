/**
 * Every variable a slow test of the package reads through `Config` reaches
 * it under turbo: turbo's strict env mode hands a task only the variables
 * its `passThroughEnv` names (beside the system's own, `HOME` and `PATH`),
 * so a slow test's `HYMN_RENDER_CACHE` would read as unset under
 * `bun run test:slow` and fall back to the default cache.
 */

import * as BunServices from '@effect/platform-bun/BunServices';
import { Effect, FileSystem, Path, Schema } from 'effect';
import { describe, expect, it } from 'effect-bun-test';

/** The variables turbo hands every task. */
const SYSTEM = new Set(['HOME', 'PATH']);

const Turbo = Schema.fromJsonString(
  Schema.Struct({
    tasks: Schema.Record(
      Schema.String,
      Schema.Struct({ passThroughEnv: Schema.optionalKey(Schema.Array(Schema.String)) }),
    ),
  }),
);

/** The names a source reads with `Config.<kind>('NAME')`. */
const configNames = (text: string) =>
  [...text.matchAll(/Config\.(?:String|Number|Integer|Boolean)\(\s*'([A-Z][A-Z0-9_]*)'/g)].map(
    ([, name]) => name ?? '',
  );

describe('the slow tests’ variables', () => {
  it.effect('reads a Config name, and only a Config name', () =>
    Effect.sync(() => {
      expect(
        configNames("Config.String('HYMN_RENDER_CACHE'); Config.option(Config.Number('N_2')); 'X'"),
      ).toEqual(['HYMN_RENDER_CACHE', 'N_2']);
    }),
  );

  it.effect.layer(BunServices.layer)('each reach test:slow through turbo’s passThroughEnv', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = path.join(import.meta.dir, '..', '..');
      const turbo = yield* Schema.decodeEffect(Turbo)(
        yield* fs.readFileString(path.join(root, 'turbo.json')),
      );
      const files = [...new Bun.Glob('{src,scripts}/**/*.slow.test.ts').scanSync({ cwd: root })];
      const texts = yield* Effect.forEach(files, (file) =>
        fs.readFileString(path.join(root, file)),
      );
      const read = [...new Set(texts.flatMap(configNames))].filter((name) => !SYSTEM.has(name));
      expect(read).toContain('HYMN_RENDER_CACHE');
      const passed = turbo.tasks['test:slow']?.passThroughEnv ?? [];
      expect(read.filter((name) => !passed.includes(name))).toEqual([]);
    }),
  );
});
