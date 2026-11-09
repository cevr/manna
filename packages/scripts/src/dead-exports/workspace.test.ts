import { describe, expect, it } from 'effect-bun-test';
import { Array as Arr, Effect, FileSystem, Layer, Option, Path, Schema } from 'effect';

import { deadExports } from './graph.ts';
import { readWorkspace } from './workspace.ts';

const ROOT = '/w';

/** A `package.json`'s text from its name and scripts. */
const packageJson = Schema.encodeSync(
  Schema.fromJsonString(
    Schema.Struct({
      name: Schema.optionalKey(Schema.String),
      scripts: Schema.optionalKey(Schema.Record(Schema.String, Schema.String)),
    }),
  ),
);

/** A file system over `files` (path from the root → text) that only reads and lists, touching no disk. */
const memoryFs = (files: Readonly<Record<string, string>>) => {
  const missing = FileSystem.makeNoop({});
  const at = new Map(Object.entries(files).map(([file, text]) => [`${ROOT}/${file}`, text]));
  return FileSystem.layerNoop({
    readFileString: (file) =>
      Option.match(Option.fromUndefinedOr(at.get(file)), {
        onNone: () => missing.readFileString(file),
        onSome: Effect.succeed,
      }),
    readDirectory: (dir, options) => {
      const below = [...at.keys()]
        .filter((file) => file.startsWith(`${dir}/`))
        .map((file) => file.slice(dir.length + 1));
      if (below.length === 0) return missing.readDirectory(dir);
      if (options?.recursive === true) return Effect.succeed(below);
      return Effect.succeed([...new Set(below.map((file) => file.split('/')[0] ?? file))]);
    },
  });
};

/** The workspace `files` makes, read as the check reads one. */
const workspaceOf = (files: Readonly<Record<string, string>>) =>
  readWorkspace(ROOT).pipe(Effect.provide(Layer.merge(memoryFs(files), Path.layer)));

/** A seeded generator of numbers in [0, 1). */
const random = (seed: number) => {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
};

type Next = () => number;

const pick = <A>(next: Next, from: ReadonlyArray<A>, or: A): A =>
  from[Math.floor(next() * from.length)] ?? or;

const below = (next: Next, n: number) => Math.floor(next() * n);

/** `file` as package `dir` names it from the root. */
const inDir = (dir: string, file: string) => {
  if (dir === '.') return file;
  return `${dir}/${file}`;
};

/** A src module's name a script or shell line may give: `src/m3.ts` names a module no package holds. */
const moduleName = (next: Next) => `src/m${below(next, 4)}.ts`;

/** A src module's name, from the root (in one of `dirs`) or from the package. */
const nameOf = (next: Next, dirs: ReadonlyArray<string>, fromTheRoot: boolean) => {
  if (fromTheRoot) return `${pick(next, dirs, 'packages/p0')}/${moduleName(next)}`;
  return moduleName(next);
};

/** A generated workspace, and the `packages/<p>/src` roots its scripts and shell files give it. */
interface Drawn {
  readonly files: Readonly<Record<string, string>>;
  readonly runs: ReadonlySet<string>;
  /** Shell-run files that exist and no script runs directly. */
  readonly byShell: number;
  /** Shell lines naming a file from the root that exists. */
  readonly fromRoot: number;
}

const drawWorkspace = (next: Next): Drawn => {
  const dirs = Array.from(
    { length: 1 + below(next, 3) },
    (_, i) => `${pick(next, ['packages', 'apps'], 'packages')}/p${i}`,
  );
  const files: Record<string, string> = {};
  for (const dir of dirs)
    for (let k = 0; k < 1 + below(next, 3); k++)
      files[`${dir}/src/m${k}.ts`] = `export const v${k} = ${k};\n`;
  const direct = new Set<string>();
  const shellRun = new Set<string>();
  let fromRoot = 0;
  for (const dir of [...dirs, '.']) {
    const scripts: Record<string, string> = {};
    for (let s = 0; s < below(next, 5); s++) {
      const named = nameOf(next, dirs, dir === '.');
      switch (below(next, 5)) {
        case 0:
          direct.add(inDir(dir, named));
          scripts[`s${s}`] = `bun ${pick(next, ['', '--smol ', 'run '], '')}${named}`;
          break;
        case 1:
        case 2: {
          const shell = `tools/s${s}.sh`;
          scripts[`s${s}`] =
            `${pick(next, ['sh', 'bash'], 'sh')} ${shell}${pick(next, ['', ' && echo done', ' > out.log'], '')}`;
          if (next() < 0.2) break;
          const lines = Array.from({ length: 1 + below(next, 5) }, () => {
            const target = nameOf(next, dirs, next() < 0.5);
            switch (below(next, 4)) {
              case 0:
                return `# bun ${target}`;
              case 1:
                return `echo "running ${target}"`;
              default: {
                for (const found of Option.toArray(
                  Arr.findFirst([target, inDir(dir, target)], (each) => each in files),
                )) {
                  shellRun.add(found);
                  if (found === target) fromRoot++;
                }
                return `  bun ${pick(next, ['', '--no-env-file '], '')}${target}${pick(next, ['', ' &'], '')}`;
              }
            }
          });
          files[inDir(dir, shell)] = ['#!/bin/sh', 'cd "$(dirname "$0")"', ...lines].join('\n');
          break;
        }
        case 3:
          scripts[`s${s}`] = 'tsc --noEmit && bun test src';
          break;
        default:
          scripts[`s${s}`] = 'echo sh bash bun';
      }
    }
    files[inDir(dir, 'package.json')] = packageJson({ name: `@t/${dir}`, scripts });
  }
  return {
    files,
    runs: new Set([...direct, ...shellRun]),
    byShell: [...shellRun].filter((file) => !direct.has(file)).length,
    fromRoot,
  };
};

const PACKAGE_SRC = /^packages\/[^/]+\/src\//;

const srcRoots = (roots: ReadonlySet<string>) =>
  [...roots].filter((file) => PACKAGE_SRC.test(file)).toSorted();

describe('the workspace the dead-export check reads', () => {
  it.effect(
    'over 200 generated workspaces, the src roots are exactly the files a script runs, those a script-run shell file runs (from the root, else the package, kept when present), and the hand list',
    () =>
      Effect.gen(function* () {
        const handList = (yield* workspaceOf({})).roots;
        let byShell = 0;
        let fromRoot = 0;
        for (let seed = 1; seed <= 200; seed++) {
          const drawn = drawWorkspace(random(seed));
          byShell += drawn.byShell;
          fromRoot += drawn.fromRoot;
          const workspace = yield* workspaceOf(drawn.files);
          expect({ seed, roots: srcRoots(workspace.roots) }).toEqual({
            seed,
            roots: srcRoots(new Set([...drawn.runs, ...handList])),
          });
        }
        expect({ byShell: byShell >= 50, fromRoot: fromRoot >= 50 }).toEqual({
          byShell: true,
          fromRoot: true,
        });
      }),
  );

  it.effect(
    'a module only a fixture gate.sh runs is a root: the export it takes lives, and the one nothing takes is dead',
    () =>
      Effect.gen(function* () {
        const workspace = yield* workspaceOf({
          'package.json': packageJson({ scripts: { gate: 'sh tools/gate.sh' } }),
          'tools/gate.sh': '#!/bin/sh\ncd "$(dirname "$0")/.."\nbun packages/p/src/entry.ts\n',
          'packages/p/package.json': packageJson({ name: '@t/p' }),
          'packages/p/src/entry.ts': "import { x } from './used.ts';\nconsole.log(x);\n",
          'packages/p/src/used.ts': 'export const x = 1;\nexport const y = 2;\n',
        });
        expect(deadExports(workspace)).toEqual(['packages/p/src/used.ts y']);
      }),
  );

  it.effect(
    "a lint plugin's import keeps an export alive, and the import of a lint rule's test does not",
    () =>
      Effect.gen(function* () {
        const workspace = yield* workspaceOf({
          'packages/p/package.json': packageJson({ name: '@t/p' }),
          'packages/p/src/env.ts': 'export const z = 1;\nexport const w = 2;\n',
          'packages/p/lint/plugin.ts':
            "import { z } from '../src/env.ts';\nexport default { z };\n",
          'packages/p/lint/rule.test.ts': "import { w } from '../src/env.ts';\nconsole.log(w);\n",
        });
        expect(deadExports(workspace)).toEqual(['packages/p/src/env.ts w']);
      }),
  );
});
