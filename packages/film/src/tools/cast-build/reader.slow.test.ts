// The cast reader's Python, run as the build runs it: its pytest cases in
// its uv environment (`uv.lock`'s, under `FILM_READER_HOME`); and, with no
// environment there, a refusal that names the line making one; and the
// committed folder's roles, as its imports derive them; the train config
// against model.py's defaults; the unit tests' own file, which reads no
// real folder; and the import scan against CPython's `ast`. Slow: it starts
// Python and imports torch, and it reads the repo's files.

import * as BunServices from '@effect/platform-bun/BunServices';
import { describe, expect, it } from 'effect-bun-test';
import { ConfigProvider, Effect, Exit, FileSystem, Layer, Schema } from 'effect';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';
import { collect } from '../process.ts';
import { CastReader, importsOf } from './reader.ts';
import { trainStage } from './stages.ts';

const live = CastReader.layer.pipe(Layer.provideMerge(BunServices.layer));

/** The train config's backbone and input, as its JSON names them. */
const decodeTrainConfig = Schema.decodeUnknownSync(
  Schema.fromJsonString(
    Schema.Struct({
      backbone: Schema.String,
      inputSide: Schema.Struct({ width: Schema.Finite, height: Schema.Finite }),
    }),
  ),
);

/**
 * The differential check's programs and CPython's reading of them, as JSON
 * lines (`{src, imports}`): from a fixed seed, four families of fragments
 * (statement forms and one-line suites; quotes in format specs; nested
 * fields, comments in fields and other field forms; spec quotes beside
 * imports) joined at random around one import (at a statement's start,
 * after a `;` or a `:`, indented, parenthesized, relative), each kept only
 * when `ast` parses it, 500 per family. `imports` is every first name an
 * import names, as the scan names them (`from . import a` names `a`).
 */
const ORACLE = String.raw`
import ast, json, random, sys, warnings

warnings.simplefilter("ignore")
COMMON = [
    "'", '"', "'''", '"""', "''''", "f'", 'f"', "f'''", 'f"""', "rb'", 'r"', "b'", "fr'",
    "\\'", '\\"', "\\\\", "{", "}", "{{", "}}", ":", ";", "\n", "\n    ", " ", "+", ",",
    "x = ", "f(", "(", ")", "[", "]", "#", "\\\n", "a", "1", "import", "from", "as h",
]
FAMILIES = [
    COMMON + ["lambda: ", "if x: ", "else: ", "def g(): ", "class C: ", "try: ", "except E: ",
              "pass", "{'k': 1}", "x[1:2]", "%", "{y}", "{x!r}", "{x:'>3}"],
    COMMON + ["f\"{x:'>3}\"", "f'{x:\">3}'", "f\"{x:'''}\"", "f\"{x:'", "f'{x:\"", "{x:'}",
              "}\"", "}'", "%H'%M", "{x:{'>'}3}", "{x:{y:'<'}}"],
    COMMON + ["{x}", "{x!r}", "{x:>3}", "{f'{y}'}", "{ {'a': 1}['a'] }", "{x[1:2]}",
              "{(lambda: 1)()}", "\\N{BULLET}", "{x:{w}}", "{x=}", "{x # it's\n}",
              "{x # '''\n}", "}\"", "}'"],
    ["f\"{x:'>3}\"", "f'{x:\">3}'", "f\"{x:'''}\"", "f\"{x:{'>'}3}\"", "f'''{x:'}'''", "'", '"',
     "; ", "\n", "x = ", " + ", "#", "(", ")"],
]
IMPORTS = ["\nimport helper\n", "; import helper", ": import helper",
           "\nfrom helper import (a,\n b)\n", "\nfrom . import helper\n", "\n    import helper\n"]


def imports(tree):
    names = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            names += [n.name.split(".")[0] for n in node.names]
        elif isinstance(node, ast.ImportFrom):
            if node.module:
                names.append(node.module.split(".")[0])
            else:
                names += [n.name for n in node.names]
    return sorted(set(names))


rng = random.Random(1)
seen = set()
for family in FAMILIES:
    found = tries = 0
    while found < 500 and tries < 10_000_000:
        tries += 1
        parts = [rng.choice(family) for _ in range(rng.randint(2, 14))]
        parts.insert(rng.randint(0, len(parts)), rng.choice(IMPORTS))
        src = "x = " + "".join(parts) + "\n"
        if src in seen:
            continue
        seen.add(src)
        try:
            tree = ast.parse(src)
        except (SyntaxError, ValueError):
            continue
        print(json.dumps({"src": src, "imports": imports(tree)}))
        found += 1
`;

/** One program of the oracle's, and the first names CPython's `ast` reads it to import. */
const decodeProgram = Schema.decodeUnknownSync(
  Schema.fromJsonString(
    Schema.Struct({ src: Schema.String, imports: Schema.Array(Schema.String) }),
  ),
);

/** A file of this folder's, read off disk. */
const fileHere = (name: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    return yield* fs.readFileString(new URL(name, import.meta.url).pathname);
  });

describe('cast reader (Python)', () => {
  it.live(
    "its pytest cases pass in the lock's environment",
    () =>
      Effect.gen(function* () {
        const out = yield* (yield* CastReader).test;
        expect(out).toMatch(/\d+ passed/);
        expect(out).not.toMatch(/failed|error/);
      }).pipe(Effect.provide(live)),
    // oxlint-disable-next-line film/tests-keep-their-strength -- the reader runs pytest in its Python environment, a spawn inside the service the test provides (spawn budget).
    120_000,
  );

  it.effect('with no environment it refuses, naming the uv line that makes one', () =>
    Effect.gen(function* () {
      const failed = yield* Effect.flip((yield* CastReader).test);
      expect(failed._tag).toBe('ReaderMissing');
      expect(failed.message).toContain('/nonexistent/reader-probe-x/venv-');
      expect(failed.message).toContain('uv sync --frozen');
    }).pipe(
      Effect.provide(
        live.pipe(
          Layer.provide(
            ConfigProvider.layer(
              ConfigProvider.fromUnknown({
                FILM_READER_HOME: '/nonexistent/reader-probe-x',
                HOME: '/nonexistent',
              }),
            ),
          ),
        ),
      ),
    ),
  );

  it.effect(
    "names the committed folder's files by role, from their imports: what trains, reads and evals, never the tests",
    () =>
      Effect.gen(function* () {
        const { sources } = yield* CastReader;
        const names = (files: ReadonlyArray<string>) => files.map((s) => s.split('/').at(-1));
        expect(names(sources.train)).toEqual(['modal_app.py', 'model.py', 'train.py']);
        expect(names(sources.read)).toEqual(['model.py', 'pyproject.toml', 'read.py', 'uv.lock']);
        expect(names(sources.eval)).toEqual([
          'eval.py',
          'model.py',
          'pyproject.toml',
          'read.py',
          'uv.lock',
        ]);
      }).pipe(Effect.provide(live)),
  );

  it.effect("the train config's backbone and input, in its key, are model.py's defaults", () =>
    Effect.gen(function* () {
      const model = yield* fileHere('../../../reader/model.py');
      // the config is the train key's (`graph.ts` keys every stage by its config)
      const train = decodeTrainConfig(
        trainStage([], [], '/nonexistent/reader.lock.json').config ?? '',
      );
      expect(train.backbone).toBe('facebook/dinov2-small');
      expect(model).toContain(`BACKBONE = "${train.backbone}"`);
      expect(model).toContain(`IN_W, IN_H = ${train.inputSide.width}, ${train.inputSide.height}`);
    }).pipe(Effect.provide(BunServices.layer)),
  );

  // the unit tests run on an in-memory disk: a real folder's read or write would take the gate's time and the host's files
  it.effect(
    'the cast reader unit tests read no real folder: reader.test.ts takes no Bun platform layer and names no file by its URL, through Bun, or through a Node file or OS module',
    () =>
      Effect.gen(function* () {
        const unit = yield* fileHere('./reader.test.ts');
        expect(unit).not.toMatch(
          /@effect\/platform-bun|node:fs|node:os|import\.meta|\bBun\.(file|write)\b|from ['"](fs|os)['"]/,
        );
      }).pipe(Effect.provide(BunServices.layer)),
  );

  it.effect(
    "the import scan, against CPython's ast over 2000 generated programs: it names every import ast reads, or refuses the file, and never misses one in silence",
    () =>
      Effect.gen(function* () {
        const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
        const ran = yield* collect(
          spawner,
          ChildProcess.make('python3', ['-I', '-c', ORACLE], { forceKillAfter: '5 seconds' }),
        );
        expect(ran.stderr).toBe('');
        const programs = ran.stdout
          .trim()
          .split('\n')
          .map((line) => decodeProgram(line));
        expect(programs.length).toBe(2000);
        const missed: Array<string> = [];
        let read = 0;
        for (const { src, imports } of programs) {
          const scanned = Effect.runSyncExit(importsOf('gen.py', src));
          if (Exit.isFailure(scanned)) continue;
          if (imports.some((name) => !scanned.value.includes(name))) missed.push(src);
          if (imports.length > 0) read++;
        }
        expect(missed).toEqual([]);
        // a scan that refused every file would miss nothing: most programs that import are read
        expect(read).toBeGreaterThan(programs.length / 5);
      }).pipe(Effect.provide(BunServices.layer)),
    // the oracle is one Python process, about 1.5 s, and 2000 scans
    30_000,
  );
});
