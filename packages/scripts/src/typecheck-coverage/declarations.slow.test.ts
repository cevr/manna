import { describe, expect, it } from 'bun:test';
import { BunServices } from '@effect/platform-bun';
import { Effect, FileSystem, Option, Schema, Stream } from 'effect';
import * as ChildProcess from 'effect/process/ChildProcess';
import { ChildProcessSpawner } from 'effect/process/ChildProcessSpawner';

import { declarations } from './coverage.js';
import { tscScript } from './tsc.js';

const random = (seed: number) => {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
};

const dirs = ['', 'src/', 'src/deep/er/', 'src/.hidden/', 'dir.d.css/', '.dot/', 'D.D/'];
const leads = ['', '.'];
const stems = ['a', 'd', 'A', 'style', 'a.json', 'x.y', ''];
const middles = [
  '',
  '.d',
  '.D',
  '.dd',
  '.d.',
  '.d.css',
  '.D.css',
  '.d.ts',
  '.d.mts',
  '.data',
  '.d.x.y',
  '..d',
];
const extensions = ['.ts', '.tsx', '.mts', '.cts'];

const pick = <A>(next: () => number, from: ReadonlyArray<A>): A =>
  from[Math.floor(next() * from.length)] as A;

const generated = (count: number, seed: number) => {
  const next = random(seed);
  const names = new Set([
    'src/style.d.css.ts',
    'a.d.ts',
    'a.d.mts',
    'a.d.cts',
    'a.d.json.ts',
    'a.dd.ts',
    'a.data.ts',
    'dir.d.css/ordinary.ts',
    '.d.ts',
  ]);
  while (names.size < count) {
    const base = `${pick(next, leads)}${pick(next, stems)}${pick(next, middles)}${pick(next, extensions)}`;
    if (base === '.' || base.startsWith('..')) continue;
    names.add(`${pick(next, dirs)}${base}`);
  }
  return [...names];
};

const text = <E>(stream: Stream.Stream<Uint8Array, E>) =>
  Stream.mkString(Stream.decodeText(stream));

const encodeTsconfig = Schema.encodeEffect(
  Schema.fromJsonString(
    Schema.Struct({
      compilerOptions: Schema.Struct({
        noEmit: Schema.Boolean,
        skipLibCheck: Schema.Boolean,
        types: Schema.Array(Schema.String),
      }),
      files: Schema.Array(Schema.String),
    }),
  ),
);

const typescriptDeclarations = (names: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const spawner = yield* ChildProcessSpawner;
    const root = yield* fs.makeTempDirectoryScoped();
    const files = names.map((name, index) => `f${String(index)}/${name}`);
    for (const file of files) {
      yield* fs.makeDirectory(`${root}/${file.slice(0, file.lastIndexOf('/'))}`, {
        recursive: true,
      });
      yield* fs.writeFileString(`${root}/${file}`, 'export declare const x: NotAType;\n');
    }
    const tsconfig = {
      compilerOptions: { noEmit: true, skipLibCheck: true, types: [] },
      files,
    };
    yield* fs.writeFileString(`${root}/tsconfig.json`, yield* encodeTsconfig(tsconfig));
    const child = yield* spawner.spawn(
      ChildProcess.make(process.execPath, [yield* tscScript, '-p', '.', '--pretty', 'false'], {
        cwd: root,
        forceKillAfter: '5 seconds',
      }),
    );
    const [stdout, stderr] = yield* Effect.all(
      [text(child.stdout), text(child.stderr), child.exitCode],
      { concurrency: 3 },
    );
    expect(stderr).toBe('');
    const reported = new Set(
      stdout
        .split('\n')
        .flatMap((line) =>
          Option.toArray(Option.fromNullishOr(/^(.*)\(\d+,\d+\): error TS2304/.exec(line)?.[1])),
        ),
    );
    const unknown = stdout.split('\n').filter((line) => /error TS(?!2304)/.test(line));
    expect(unknown).toEqual([]);
    return names.filter((_, index) => !reported.has(files[index] as string));
  }).pipe(Effect.scoped);

describe('a declaration file, as TypeScript decides it', () => {
  it("the check's rule, on the name tsc judges, holds exactly for TypeScript's declaration files", () =>
    Effect.gen(function* () {
      const names = generated(400, 0x5eed);
      const theirs = yield* typescriptDeclarations(names);
      const asWritten = names.map((name) => ({ spelled: name, disk: name }));
      expect(declarations(asWritten)).toEqual(theirs.toSorted());
    }).pipe(Effect.provide(BunServices.layer), Effect.runPromise));
});
