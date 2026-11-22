/* oxlint-disable effect/noNodeBuiltinImport -- the test reads the app's own source files, by path under Bun. */

/**
 * The app's sources type check in a tree where Exact has not run
 * (docs/exact.md): no file under `src/` names the generated, ignored
 * `app.contract.d.ts`, by a type import or any other; only `app.ts`, at
 * the app's root, types the sources against it. `.oxlintrc.json` refuses
 * the same import in every Exact app's `src/`.
 */

import { describe, expect, test } from 'bun:test';
import { readFileSync, readdirSync } from 'node:fs';

const GENERATED = /['"][^'"\n]*\.contract\.d(?:\.ts)?['"]/u;
const SELF = 'no-generated-types.test.ts';

const src = new URL('./', import.meta.url);
const files = readdirSync(src, { recursive: true, encoding: 'utf8' }).filter((path) =>
  path.endsWith('.ts'),
);

describe('the sources and the generated declarations', () => {
  test('no file under src/ imports the generated contract declarations', () => {
    expect(files.length).toBeGreaterThan(50);
    const importers = files.filter(
      (path) => path !== SELF && GENERATED.test(readFileSync(new URL(path, src), 'utf8')),
    );
    expect(importers).toEqual([]);
  });
});
