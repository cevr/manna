/* oxlint-disable effect/noGlobals -- the check parses the app's package.json with JSON.parse to read its test:slow script. */
/* oxlint-disable effect/noNodeBuiltinImport -- the check reads the app's own source files from disk, synchronously. */

import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (...parts: ReadonlyArray<string>) =>
  readFileSync(join(import.meta.dir, ...parts), 'utf8');

describe('the find bar’s seam, in the source', () => {
  it('has the player layer place the # by findPlace', () => {
    expect(/\bfindPlace\(/.test(read('LivePlayer.tsx'))).toBe(true);
  });

  it('has one height rule for the bar, in bar.ts', () => {
    const playerBar = read('PlayerBar.tsx');
    expect({
      ownTall: /\bconst tall\b/.test(playerBar),
      ownHeightOf: /\b(?:const|function) heightOf\b/.test(playerBar),
      exported: /\bexport (?:const|function) heightOf\b/.test(read('bar.ts')),
    }).toEqual({ ownTall: false, ownHeightOf: false, exported: true });
  });

  it('checks an unknown hymn number in glide.test.ts', () => {
    expect(/\/hymns\/(?:0|696|9999|abc|007)\b/.test(read('glide.test.ts'))).toBe(true);
  });

  it('spaces every && in the app’s test:slow script', () => {
    const scripts: Record<string, string> = JSON.parse(read('..', '..', 'package.json')).scripts;
    expect(/&&\S|\S&&/.test(scripts['test:slow'] ?? '')).toBe(false);
  });
});
