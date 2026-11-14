import * as BunServices from '@effect/platform-bun/BunServices';
import { Effect, FileSystem, Path } from 'effect';
import { describe, expect, it } from 'effect-bun-test';

import { SHARED_LINE_LIMIT, noCopies } from './no-copy.ts';

/** A source file of a current app, ten meaningful lines long. */
const SOURCE = Array.from(
  { length: 10 },
  (_, i) => `export const step${i} = (value: number) => value * ${i + 2} + offsetFor(${i});`,
).join('\n');

/** An app folder with `files`, and a source file of SOURCE beside it. */
const fixture = (files: Readonly<Record<string, string>>) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const root = yield* fs.makeTempDirectoryScoped();
    const app = path.join(root, 'app');
    const source = path.join(root, 'source.ts');
    yield* fs.writeFileString(source, SOURCE);
    for (const [name, text] of Object.entries(files)) {
      yield* fs.makeDirectory(path.dirname(path.join(app, name)), { recursive: true });
      yield* fs.writeFileString(path.join(app, name), text);
    }
    return { app, source };
  });

const copied = (lines: number) => SOURCE.split('\n').slice(0, lines).join('\n');

describe('noCopies', () => {
  it.effect('fails on a file that copies a source file, naming both', () =>
    Effect.gen(function* () {
      const { app, source } = yield* fixture({
        'src/today/logic.ts': copied(10),
        'app.ts': 'export const grants = "";',
      });
      const result = yield* Effect.result(noCopies(app, [source]));
      expect(result._tag).toBe('Failure');
      if (result._tag !== 'Failure' || result.failure._tag !== 'CopiesFound') return;
      expect(result.failure.copies).toEqual([
        { file: `${app}/src/today/logic.ts`, source, shared: 10 },
      ]);
      expect(result.failure.message).toContain('logic.ts shares 10 lines with');
    }).pipe(Effect.scoped, Effect.provide(BunServices.layer)),
  );

  it.effect('passes a file sharing up to the limit, and skips installs and Exact scratch', () =>
    Effect.gen(function* () {
      const { app, source } = yield* fixture({
        'src/a.ts': copied(SHARED_LINE_LIMIT),
        'node_modules/x/index.ts': copied(10),
        '.exact/plan.json': copied(10),
      });
      const result = yield* Effect.result(noCopies(app, [source]));
      expect(result._tag).toBe('Success');
    }).pipe(Effect.scoped, Effect.provide(BunServices.layer)),
  );

  it.effect('counts a line once, and ignores imports and short lines', () =>
    Effect.gen(function* () {
      const line = SOURCE.split('\n')[0] ?? '';
      const padding = Array.from({ length: 20 }, () => line).join('\n');
      const { app, source } = yield* fixture({
        'src/b.ts': `${padding}\nimport { x } from './x';\n});\n`,
      });
      const result = yield* Effect.result(noCopies(app, [source]));
      expect(result._tag).toBe('Success');
    }).pipe(Effect.scoped, Effect.provide(BunServices.layer)),
  );
});
