/* oxlint-disable effect/noNodeBuiltinImport -- the guard reads the app's product sources from disk, synchronously. */

/**
 * The return to the foreground is read in one host adapter (R8d, hsdaily r1
 * M3: lifecycle sync lives in a named adapter, not in a component). One
 * product module of `src` and `app` names React Native's `AppState`:
 * `src/foreground/source.ts`, a `.ts` module that imports neither React nor
 * the atoms' React bindings, so no component subscribes from an effect.
 * Today's route holds no lifecycle effect and never names `AppState`.
 */

import { describe, expect, it } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const APP = join(import.meta.dir, '..', '..');

/** Every product source under `folder`: `.ts` and `.tsx`, no test and no test helper. */
const productUnder = (folder: string): readonly string[] =>
  readdirSync(join(APP, folder), { withFileTypes: true }).flatMap((entry) => {
    const path = `${folder}/${entry.name}`;
    if (entry.isDirectory()) {
      if (path === 'src/test') return [];
      return productUnder(path);
    }
    if (!/\.tsx?$/.test(entry.name) || /\.(test|d)\.tsx?$/.test(entry.name)) return [];
    return [path];
  });

const sourceOf = (file: string) => readFileSync(join(APP, file), 'utf8');

describe('the foreground adapter', () => {
  it('is the one product module that names AppState, a .ts module that imports no React', () => {
    const naming = [...productUnder('src'), ...productUnder('app')].filter((file) =>
      /\bAppState\b/.test(sourceOf(file)),
    );
    expect(naming).toEqual(['src/foreground/source.ts']);
    expect(sourceOf('src/foreground/source.ts')).not.toMatch(
      /from ['"](react|@effect\/atom-react)['"]/,
    );
  });

  it('leaves Today with no lifecycle effect and no AppState', () => {
    expect(sourceOf('app/index.tsx')).not.toMatch(/\buse(Layout)?Effect\b|AppState/);
  });
});
