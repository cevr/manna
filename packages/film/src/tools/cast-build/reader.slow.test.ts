// The cast reader's Python, run as the build runs it: its pytest cases in
// its uv environment (`uv.lock`'s, under `FILM_READER_HOME`); and, with no
// environment there, a refusal that names the line making one; the
// committed folder's roles, as its imports derive them; the train config
// against model.py's defaults; the unit tests' own file, which reads no
// real folder; and the import scan (`scanOf`), CPython's `ast` in one
// `python3` spawn, over every import form and every fault it refuses.
// Slow: it starts Python and imports torch, and it reads the repo's files.

import * as BunServices from '@effect/platform-bun/BunServices';
import { describe, expect, it } from 'effect-bun-test';
import { ConfigProvider, Effect, FileSystem, Layer, Schema } from 'effect';
import { CastReader, rolesOf, scanOf } from './reader.ts';
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

/** A file of this folder's, read off disk. */
const fileHere = (name: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    return yield* fs.readFileString(new URL(name, import.meta.url).pathname);
  });

/**
 * Each source the scan reads and the first names it imports, sorted:
 * every import form, wherever a statement starts; strings and comments
 * that read as imports; strings and formatted strings that a hand
 * tokenizer lost its place in (a docstring holding an open `from … (`, a
 * comment ending in a backslash, a quote in a format spec, a backslash
 * before a formatted string's `{`).
 */
const FORMS: ReadonlyArray<readonly [string, ReadonlyArray<string>]> = [
  ['import a, b as c', ['a', 'b']],
  ['import x as y', ['x']],
  ['import pkg.sub', ['pkg']],
  ['def f():\n    from inner import thing', ['inner']],
  ['from multi import (\n    one,\n    two,\n)', ['multi']],
  ['from pkg.sub import x', ['pkg']],
  ['from star import *', ['star']],
  ['import first, \\\n    second', ['first', 'second']],
  ['x = 1; import semi', ['semi']],
  ['if True: import suite', ['suite']],
  ['def load(): from helper import VALUE', ['helper']],
  ['try: import a\nexcept ImportError: import b', ['a', 'b']],
  ['if n := len(xs): import walrus', ['walrus']],
  ['class A:\n    import in_class', ['in_class']],
  ['# import commented', []],
  ['print("import nothing")', []],
  ['print("importlib, __import__ and runpy, named in a string")', []],
  ["s = 'it\\'s'; import escaped", ['escaped']],
  ['s = r"\\\\"; import raw', ['raw']],
  ['s = f"{d["k"]:>{w}} {{import x}}"; import nested', ['nested']],
  ['"""\nimport in_a_docstring\n"""\nimport after', ['after']],
  ['x = [\n    1,  # a comment\n]\nimport later', ['later']],
  ['s = f"{x:{\'>\'}3}"; import spec_field', ['spec_field']],
  ["s = f\"{ {'k': 1}['k']:>3} {d[1:2]!r:^{w}}\"; import brackets", ['brackets']],
  ['s = f"""{x # a comment\'s quote\n}"""; import field_comment', ['field_comment']],
  // a docstring that reads as an open import, and a comment that ends in a backslash
  ['"""\nfrom example import (\n"""\nimport helper\n', ['helper']],
  [
    'from model import decode\n# a comment ending in a backslash \\\nimport helper\n',
    ['helper', 'model'],
  ],
  ['from model import decode\n"""\nimport helper\n"""\n# import other\n', ['model']],
  ['from model import Reader\nif True: import helper\n', ['helper', 'model']],
  ['from model import Reader\ndef load(): from helper import VALUE\n', ['helper', 'model']],
  // a quote in a formatted string's format spec is a character of the spec
  ['s = f"{x:\'>10}"\nimport helper\n', ['helper']],
  ['a = f"{x:\'>3}"; import helper; b = f"{y:\'<3}"\n', ['helper']],
  ["import model\nx = f\"{x:'''}\"\nimport helper\nf\"{x:'''}\"\n", ['helper', 'model']],
  ['import model\ns = f"{x:{y:\'<\'}}"\nimport helper\nf"{y:{z:\'>\'}}"\n', ['helper', 'model']],
  // a backslash before a formatted string's `{` escapes nothing: the `{` opens a field, or `{{` is a brace
  ["a = rf'\\{{'; import helper; b = '}'", ['helper']],
  ["a = f'\\{{'; import helper; b = '}'", ['helper']],
  ['a = rf\'\\{"\'"}\'; import helper  # "', ['helper']],
  ['a = rf\'\\{"""\'"""}\'\nimport helper\nb = 1  # """', ['helper']],
];

/** Each source the scan refuses, the folders it is scanned with, and the start of its reason. */
const FAULTS: ReadonlyArray<readonly [string, ReadonlyArray<string>, string]> = [
  ['import model\nx = 1 import helper\n', [], 'line 2: CPython cannot parse it'],
  ['import model\nfrom helper import a,\n', [], 'line 2: CPython cannot parse it'],
  ["import model\n'it ends nowhere\nimport helper\n", [], 'line 2: CPython cannot parse it'],
  ['    from inner import thing', [], 'line 1: CPython cannot parse it'],
  ['from .rel import x', [], 'line 1: a relative import'],
  ['from.rel import x', [], 'line 1: a relative import'],
  ['from . import (\n    left,\n    right as r,\n)', [], 'line 1: a relative import'],
  ['import model\nfrom . import *\n', [], 'line 2: a relative import'],
  ['importlib.import_module("x")', [], 'line 1: it names importlib, a dynamic import'],
  ['__import__("x")', [], 'line 1: it names __import__, a dynamic import'],
  ['runpy.run_path("x")', [], 'line 1: it names runpy, a dynamic import'],
  ['import builtins\nbuiltins.__import__("x")', [], 'line 2: it names __import__'],
  ['import model\nfrom importlib import import_module\n', [], 'line 2: it imports importlib'],
  ['import runpy as r', [], 'line 1: it imports runpy'],
  ['x = 1\nimport runpy\nfrom . import a\n', [], 'line 2: it imports runpy'],
  ['from lib import decode\n', ['lib'], "line 1: it imports lib, a folder of the reader's"],
  ['import model\nimport tests.helpers\n', ['tests'], 'line 2: it imports tests, a folder'],
];

/** `py` scanned by the real scan, with `folders`. */
const scanned = (py: ReadonlyMap<string, string>, folders: ReadonlyArray<string> = []) =>
  scanOf(py, new Set(folders)).pipe(Effect.provide(BunServices.layer));

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
    'the scan reads every import form wherever it stands, and no string, comment or formatted string hides one',
    () =>
      Effect.gen(function* () {
        const py = new Map(FORMS.map(([source], i) => [`form${i}.py`, source]));
        const imports = yield* scanned(py);
        for (const [i, [source, names]] of FORMS.entries())
          expect([source, imports.get(`form${i}.py`)]).toEqual([source, names]);
      }),
  );

  it.effect(
    'the scan fails closed, naming the file and the line: a file CPython cannot parse, a relative import, a dynamic import, an import of a folder of its own',
    () =>
      Effect.gen(function* () {
        for (const [source, folders, reason] of FAULTS) {
          const py = new Map([
            ['clean.py', 'import os\n'],
            ['read.py', source],
          ]);
          const failed = yield* Effect.flip(scanned(py, folders));
          expect([source, failed._tag, failed.file, failed.reason]).toEqual([
            source,
            'ReaderScanFailed',
            'read.py',
            expect.stringContaining(reason),
          ]);
        }
      }),
  );

  it.effect(
    'a helper train.py imports past a backslash before a formatted string’s brace is in the train closure',
    () =>
      Effect.gen(function* () {
        const py = new Map([
          ['eval.py', 'from model import BONES\n'],
          ['helper.py', 'VALUE = 1\n'],
          ['modal_app.py', 'def fit():\n    from train import train\n'],
          ['model.py', 'import torch\n'],
          ['read.py', 'from model import decode\n'],
          ['train.py', "from model import Reader\nPAD = rf'\\{{'; import helper; END = '}'\n"],
        ]);
        const roles = yield* rolesOf(yield* scanned(py, ['tests']));
        expect(roles.train).toEqual(['helper.py', 'modal_app.py', 'model.py', 'train.py']);
      }),
  );
});
