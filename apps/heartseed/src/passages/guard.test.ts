/* oxlint-disable effect/noGlobals, effect/noNodeBuiltinImport -- the test reads the app's own source files from disk, synchronously, outside any Effect. */

/**
 * The corpus reaches the app through one module (hskjv K3): `src/kjv.ts`
 * is the one product file that names `virtual:heartseed-kjv`, so a chapter
 * is read only when `versesOf` asks for it, and no product file names the
 * source file `kjv.json`, so the 7.8 MB corpus never enters the bundle
 * itself. A product file is any TypeScript under `src` and `app` that is
 * not a test, not under `src/test` and not the module declarations.
 *
 * It catches a second importer, a re-export or a require of the module,
 * and any name of the source file in product code. It misses a module
 * that reaches the corpus by a name built at run time.
 */

import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';

const APP = `${import.meta.dir}/../..`;
const SOURCES = new Bun.Glob('{src,app}/**/*.{ts,tsx}');
const MODULE = 'virtual:heartseed-kjv';
const DECLARATIONS = 'src/virtual.d.ts';

const product = [...SOURCES.scanSync(APP)]
  .filter(
    (file) =>
      !/\.test\.tsx?$/u.test(file) &&
      !file.startsWith('src/test/') &&
      file !== DECLARATIONS &&
      file !== 'app/routes.d.ts',
  )
  .map((file) => ({ file, source: readFileSync(`${APP}/${file}`, 'utf8') }));

describe('the corpus’s one way into the app', () => {
  it('is src/kjv.ts, which imports the module statically, and no other product file names it', () => {
    expect(product.map((each) => each.file)).toEqual(
      expect.arrayContaining(['src/kjv.ts', 'src/app.ts', 'app/index.tsx']),
    );
    expect(product.filter((each) => each.source.includes(MODULE)).map((each) => each.file)).toEqual(
      ['src/kjv.ts'],
    );
    const kjv = product.find((each) => each.file === 'src/kjv.ts')?.source ?? '';
    expect(kjv).toMatch(new RegExp(`^import \\w+ from '${MODULE}';$`, 'mu'));
  });

  it('never names the source corpus file in product code', () => {
    expect(
      product.filter((each) => /kjv\.json/u.test(each.source)).map((each) => each.file),
    ).toEqual([]);
  });
});
