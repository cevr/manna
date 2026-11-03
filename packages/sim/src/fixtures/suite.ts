/**
 * The App property's tests over `cases` (`property.ts`): `sim` parses each
 * app's ports, readiness target and platforms and refuses an app outside
 * `App`'s domain before any step; the live Drive asks each tool for the
 * commands the app's fields make, in one process, app after app; every file
 * it touches lies in the place; `clean` refuses an escape before it
 * deletes; and every kind of value is covered at least once.
 */
import * as BunServices from '@effect/platform-bun/BunServices';
import { describe, expect, it } from 'effect-bun-test';
import { Console, Effect, FileSystem, Path, Schema } from 'effect';

import { type Case, checkParsing, checkSteps, coverage } from './property.ts';

const encodeJson = Schema.encodeSync(Schema.fromJsonString(Schema.toType(Schema.Unknown)));

/** An app folder whose react-native resolves a `hermes-compiler`, so an iOS boot parses. */
const hermesApp = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const app = yield* fs.makeTempDirectoryScoped();
  const native = path.join(app, 'node_modules', 'react-native');
  const compiler = path.join(native, 'node_modules', 'hermes-compiler');
  yield* fs.makeDirectory(path.join(compiler, 'hermesc', 'osx-bin'), { recursive: true });
  yield* fs.writeFileString(path.join(native, 'package.json'), '{"name":"react-native"}');
  yield* fs.writeFileString(path.join(compiler, 'package.json'), '{"name":"hermes-compiler"}');
  yield* fs.writeFileString(path.join(compiler, 'hermesc', 'osx-bin', 'hermesc'), '');
  return app;
}).pipe(Effect.provide(BunServices.layer));

/** The property's coverage test: `cases` hold every kind of value at least once. */
export const appCoverage = (title: string, cases: ReadonlyArray<Case>) =>
  describe(title, () => {
    it.effect('covers every field, platform set, port edge, escaped string and escape', () =>
      Effect.gen(function* () {
        const counts = coverage(cases);
        yield* Console.log(`App property: ${cases.length} apps, coverage ${encodeJson(counts)}`);
        expect(Object.entries(counts).filter(([, count]) => count === 0)).toEqual([]);
      }),
    );
  });

/** The property's parsing and driving tests over `cases`, under `title`. */
export const appProperty = (title: string, cases: ReadonlyArray<Case>) =>
  describe(title, () => {
    it.scoped('parses each app by its own values and refuses one outside the domain', () =>
      Effect.gen(function* () {
        const { problems, ports } = yield* checkParsing(cases, yield* hermesApp);
        expect(problems.slice(0, 5)).toEqual([]);
        expect(ports).toBeGreaterThan(cases.length * 2);
      }),
    );

    it.live('drives each app with its own values through one Drive, app after app', () =>
      Effect.gen(function* () {
        const { problems, ran } = yield* checkSteps(cases);
        expect(problems.slice(0, 5)).toEqual([]);
        expect(ran).toBeGreaterThan(cases.length * 10);
      }),
    );
  });
