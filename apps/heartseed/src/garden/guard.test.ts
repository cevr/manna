/* oxlint-disable effect/noNodeBuiltinImport, effect/noDynamicImports, effect/noGlobals -- the guard reads the growth sound's own source files and the app's package.json from disk, synchronously, parses the manifest plainly, and asks One's native-source contract (resolved from the app, as One's bundler does) for the Swift module's declaration. */

/**
 * The growth sound respects Silent mode and makes no sound where no one
 * asked to hear it. The Swift module plays only through System Sound
 * Services (`AudioServicesPlaySystemSound`, which the ring/silent switch
 * mutes and which leaves the audio session alone), once in the source, and
 * only on a device: on the simulator (whose audio reaches the Mac's
 * speaker) a play logs `[growth] play … skipped=simulator` and returns. No
 * file of the sound touches the audio session's category or activation, or
 * names a player, an engine, an alert sound, a completion play or One's
 * audio: the session is Dictation's while it listens.
 *
 * Also: only `chime.ios.ts` names the Swift file (One's bundler refuses a
 * `.swift` import in an Android or web build), the garden and the other
 * platforms' chime import no native code, ts-fsrs is the tests' reference
 * alone, and the committed declaration of the Swift module is the one One's
 * native source writes for it now.
 */

import { describe, expect, it } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, relative } from 'node:path';

const APP = join(import.meta.dir, '..', '..');
const NATIVE = join(APP, 'native', 'growth');
const SWIFT = join(NATIVE, 'Growth.swift');

/** The names a growth must never reach the speaker or the session by, written apart so this file does not hold them whole. */
const BANNED = [
  ['AVAudio', 'Session'],
  ['set', 'Category'],
  ['set', 'Active'],
  ['AVAudio', 'Player'],
  ['AVAudio', 'Engine'],
  ['AV', 'Player'],
  ['AudioServicesPlay', 'AlertSound'],
  ['With', 'Completion'],
  ['One.', 'Audio'],
].map((parts) => parts.join(''));

/** One writes `.one-native-source.*` beside the Swift (gitignored); the scan reads tracked files only. */
const filesUnder = (dir: string): ReadonlyArray<string> =>
  readdirSync(dir, { withFileTypes: true })
    .filter((entry) => !entry.name.startsWith('.one-native-source.'))
    .flatMap((entry) => {
      if (entry.isDirectory()) return filesUnder(join(dir, entry.name));
      return [join(dir, entry.name)];
    });

const sources = (dir: string) =>
  filesUnder(dir).filter((file) => /\.tsx?$/.test(file) && !/\.test\.tsx?$/.test(file));

type Branch = 'simulator' | 'device' | 'other' | 'none';

/** Each line of a Swift file with the `targetEnvironment(simulator)` branch it lies in: `#if !…` and the `#else` of `#if …` are the device's. */
const branches = (
  swift: string,
): ReadonlyArray<{ readonly line: string; readonly branch: Branch }> => {
  const stack: Branch[] = [];
  return swift.split('\n').map((raw) => {
    const line = raw.trim();
    const simulator = /targetEnvironment\(\s*simulator\s*\)/.test(line);
    if (line.startsWith('#if')) {
      if (!simulator) stack.push('other');
      else if (/#if\s*!/.test(line)) stack.push('device');
      else stack.push('simulator');
    } else if (line.startsWith('#else')) {
      const open = stack.pop();
      if (open === 'simulator') stack.push('device');
      else if (open === 'device') stack.push('simulator');
      else stack.push('other');
    } else if (line.startsWith('#endif')) stack.pop();
    const branch = (['simulator', 'device'] as const).find((b) => stack.includes(b)) ?? 'none';
    return { line, branch };
  });
};

const imports = (text: string) =>
  Array.from(text.matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g), (m) => m[1] ?? '');

describe('the growth sound on the simulator', () => {
  const lines = branches(readFileSync(SWIFT, 'utf8'));
  const where = (pattern: RegExp) => lines.filter((l) => pattern.test(l.line)).map((l) => l.branch);

  it('plays a system sound once in the source, only on a device, and on the simulator logs the play it skips', () => {
    expect(where(/AudioServicesPlaySystemSound\(/)).toEqual(['device']);
    const simulator = lines.filter((l) => l.branch === 'simulator').map((l) => l.line);
    expect(
      simulator.some(
        (line) => line.includes('[growth] play') && line.includes('skipped=simulator'),
      ),
    ).toBe(true);
    expect(simulator.filter((line) => /AudioServices/.test(line))).toEqual([]);
  });

  it('reads branches as Swift does', () => {
    const sample = [
      '#if targetEnvironment(simulator)',
      'a',
      '#else',
      'b',
      '#endif',
      '#if !targetEnvironment(simulator)',
      'c',
      '#endif',
      'd',
    ].join('\n');
    expect(branches(sample).map((l) => l.branch)).toEqual([
      'simulator',
      'simulator',
      'device',
      'device',
      'none',
      'device',
      'device',
      'none',
      'none',
    ]);
  });
});

describe('the growth sound’s audio path', () => {
  it('names no session, category or activation, player, engine, alert sound, completion play or One audio', () => {
    const files = [
      ...filesUnder(NATIVE),
      ...sources(join(APP, 'src', 'garden')),
      join(APP, 'src', 'garden.ts'),
    ];
    expect(files).toContain(SWIFT);
    const named = files.flatMap((file) =>
      BANNED.filter((name) => readFileSync(file, 'utf8').includes(name)).map(
        (name) => `${relative(APP, file)}: ${name}`,
      ),
    );
    expect(named).toEqual([]);
  });
});

describe('the growth sound’s seams', () => {
  it('keeps the garden and the other platforms’ chime free of native code', () => {
    for (const file of ['src/garden.ts', 'src/garden/chime.ts', 'src/garden/sound.ts'])
      expect({
        file,
        native: imports(readFileSync(join(APP, file), 'utf8')).filter(
          (s) => s.includes('native') || s.includes('.swift') || s === 'one',
        ),
      }).toEqual({ file, native: [] });
  });

  it('imports the Swift file from chime.ios.ts alone', () => {
    const importers = [...sources(join(APP, 'src')), ...sources(join(APP, 'app'))]
      .filter((file) => readFileSync(file, 'utf8').includes('Growth.swift'))
      .map((file) => relative(APP, file));
    expect(importers).toEqual(['src/garden/chime.ios.ts']);
  });

  it('takes ts-fsrs 5.4.2 as the tests’ reference alone: a devDependency no app source imports', () => {
    const manifest: {
      readonly dependencies: Record<string, string>;
      readonly devDependencies: Record<string, string>;
    } = JSON.parse(readFileSync(join(APP, 'package.json'), 'utf8'));
    expect(manifest.devDependencies['ts-fsrs']).toBe('5.4.2');
    expect(Object.hasOwn(manifest.dependencies, 'ts-fsrs')).toBe(false);
    const importers = [...sources(join(APP, 'src')), ...sources(join(APP, 'app'))]
      .filter((file) => !file.includes(`${join('src', 'test')}/`))
      .filter((file) => imports(readFileSync(file, 'utf8')).includes('ts-fsrs'))
      .map((file) => relative(APP, file));
    expect(importers).toEqual([]);
  });

  it('commits the declaration One’s native source writes for Growth.swift, in the package named growth', () => {
    const fromApp = createRequire(join(APP, 'package.json'));
    const fromOne = createRequire(fromApp.resolve('one/package.json'));
    const { nativeSourceContract } = fromOne('vxrn/native-source-contract') as {
      readonly nativeSourceContract: (
        file: string,
        source: string,
      ) => { readonly declaration: string };
    };
    const expected = nativeSourceContract(SWIFT, readFileSync(SWIFT, 'utf8')).declaration;
    expect(readFileSync(join(NATIVE, 'Growth.d.swift.ts'), 'utf8')).toBe(expected);
    for (const method of ['load(', 'play(']) expect(expected).toContain(method);
    expect(readFileSync(join(NATIVE, 'Package.swift'), 'utf8')).toContain('name: "growth"');
  });
});
