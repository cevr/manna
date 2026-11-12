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

/** The colours after one change: the shown screen's, the paused one's, the paused one's once shown again, and a fresh one's. */
interface After {
  readonly shown: Colours;
  readonly paused: Colours;
  readonly back: Colours;
  readonly fresh: Colours;
}

/** What `test/phone-appearance.tsx` prints: the colours before any change, then after each. */
interface Seen {
  readonly before: Colours;
  readonly changes: Readonly<Record<string, After>>;
}

const ROOT = `${import.meta.dir}/..`;
/** The app's tracked sources: One writes the route types (`app/routes.d.ts`, git-ignored). */
const SOURCES = new Bun.Glob('{src,app}/**/*.{ts,tsx}');

describe('a change of scheme with the screens open', () => {
  const run = runScript(Bun.resolveSync('./test/phone-appearance.tsx', import.meta.dir));
  const { before, ...changes } = JSON.parse(run.stdout || '{"before":{}}');
  const seen: Seen = { before, changes };

  test.each(['dark', 'system', 'system dark'])(
    'after %s, the shown and the paused screens draw what a screen opened after it draws',
    (change) => {
      expect(run.stderr).toBe('');
      const after = seen.changes[change];
      expect(after?.shown).toEqual(after?.fresh ?? {});
      expect(after?.paused).toEqual(after?.fresh ?? {});
      expect(after?.back).toEqual(after?.fresh ?? {});
    },
  );

  test('the setting to Dark changes every colour the shown and the paused screens draw', () => {
    const after = seen.changes['dark'];
    const kept = (drawn: Colours) =>
      Object.keys(seen.before).filter((part) => seen.before[part] === drawn[part]);
    expect(Object.keys(seen.before)).toHaveLength(9);
    expect([kept(after?.shown ?? {}), kept(after?.paused ?? {})]).toEqual([[], []]);
  });

  test("no screen reads React Native's scheme hook, which misses the setting", () => {
    const readers = [...SOURCES.scanSync(ROOT)]
      .filter((file) => !/\.test\.|\.d\.ts$|^src\/test\//.test(file))
      .filter((file) => /\buseColorScheme\b/.test(readFileSync(`${ROOT}/${file}`, 'utf8')));
    expect(readers).toEqual([]);
  });

  test("the phone's root layout hands the scheme to every screen", () => {
    const layout = readFileSync(`${ROOT}/app/_layout.tsx`, 'utf8');
    const phone = layout.slice(layout.lastIndexOf('return ('));
    expect(phone).toMatch(/<SchemeProvider>[\s\S]*<Slot \/>[\s\S]*<\/SchemeProvider>/);
  });
});
