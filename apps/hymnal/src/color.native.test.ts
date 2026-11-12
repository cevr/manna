/* oxlint-disable effect/noGlobals, effect/noNodeBuiltinImport -- the tests run Bun scripts in processes of their own, so React Native's stand-ins never reach the other tests, and read the app's own source files from disk, synchronously, outside any Effect. */

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

import { runScript } from './test/script';

test('the phone colours load on Android, where DynamicColorIOS throws', () => {
  const run = Bun.spawnSync(['bun', Bun.resolveSync('./test/android.ts', import.meta.dir)], {
    stderr: 'pipe',
  });
  expect(run.stderr.toString()).toBe('');
  expect(run.stdout.toString()).toBe(
    'ground ink muted line soft panel edge chord bar pill onPill chosen onChosen alert glass onGlass onGlassMuted glassChosen onGlassChosen',
  );
});

type Colours = Readonly<Record<string, string>>;

/** What `test/phone-appearance.tsx` prints: the colours before any change, then live and fresh after each. */
interface Seen {
  readonly before: Colours;
  readonly changes: Readonly<Record<string, { readonly live: Colours; readonly fresh: Colours }>>;
}

const ROOT = `${import.meta.dir}/..`;
/** The app's tracked sources: One writes the route types (`app/routes.d.ts`, git-ignored). */
const SOURCES = new Bun.Glob('{src,app}/**/*.{ts,tsx}');

describe('a change of scheme with the screens open', () => {
  const run = runScript(Bun.resolveSync('./test/phone-appearance.tsx', import.meta.dir));
  const { before, ...changes } = JSON.parse(run.stdout || '{"before":{}}');
  const seen: Seen = { before, changes };

  test.each(['dark', 'system', 'system dark'])(
    'after %s, the open list and every hook role draw what screens opened after it draw',
    (change) => {
      expect(run.stderr).toBe('');
      expect(seen.changes[change]?.live).toEqual(seen.changes[change]?.fresh ?? {});
    },
  );

  test('the setting to Dark changes every colour the open screens draw', () => {
    const live = seen.changes['dark']?.live ?? {};
    expect(Object.keys(seen.before)).toHaveLength(9);
    expect(Object.keys(seen.before).filter((part) => seen.before[part] === live[part])).toEqual([]);
  });

  test("no screen reads React Native's scheme but through useScheme, which hears the setting", () => {
    const readers = [...SOURCES.scanSync(ROOT)]
      .filter((file) => !/\.test\.|\.d\.ts$|^src\/test\//.test(file))
      .filter((file) => /\buseColorScheme\b/.test(readFileSync(`${ROOT}/${file}`, 'utf8')));
    expect(readers).toEqual([]);
  });
});
