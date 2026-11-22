/**
 * The data module never bundles the hymns' words' times: no module `app.ts`
 * reaches, by any import a bundler keeps, is the current app's timing
 * encoder (`apps/hymnal/vite/timing.ts`, which `tools/timing.ts` runs at
 * build) or the port's writer of the shipped files (`write.ts`); the data
 * module reaches the loader (`load.ts`) and reads each hymn's file at its
 * first use. The walker is tried on the build's own script first, so one
 * that finds nothing cannot pass. The lines-only timing `app.ts` bundles
 * (`src/player/timing.gen.ts`) is a generated module the walker keeps
 * apart.
 */

import { describe, expect, it } from 'bun:test';

import { reachedFrom } from '../test/graph.testing.ts';

const ENCODER = 'apps/hymnal/vite/timing.ts';
const WRITER = 'apps/hymnal-exact/src/timing/write.ts';

describe('the data module ships no words’ times', () => {
  it('finds the encoder and the writer through the build script that runs them', () => {
    const { reached } = reachedFrom('apps/hymnal-exact/tools/timing.ts');
    expect(reached.has(ENCODER)).toBe(true);
    expect(reached.has(WRITER)).toBe(true);
  });

  it('no module app.ts reaches is the encoder or the writer, the loader among them', () => {
    const { reached } = reachedFrom('apps/hymnal-exact/app.ts');
    expect(reached.has('apps/hymnal-exact/src/timing/load.ts')).toBe(true);
    expect(reached.has(ENCODER)).toBe(false);
    expect(reached.has(WRITER)).toBe(false);
    expect([...reached].filter((path) => path.startsWith('apps/hymnal-exact/tools/'))).toEqual([]);
  });
});
