/* oxlint-disable effect/noNodeBuiltinImport, effect/noDynamicImports, effect/noGlobals -- the guard reads the voice's own source files from disk, synchronously, and asks One's native-source contract (resolved from the app, as One's bundler does) for the Swift module's declaration. */

/**
 * The voice makes no sound where no one asked to hear it: on the simulator
 * (whose audio reaches the Mac's speaker) the Swift module never speaks,
 * it renders to buffers it drops and logs the skip, and it takes its word
 * ranges from that render's markers alone, the synthesizer's delegate set
 * only on a device. No file of the voice touches the audio session's
 * category or activation, or names a player, an engine, a system sound or
 * One's audio: the session is the hands-free unit's.
 *
 * Also: the service imports no native code, only `source.ios.ts` names the
 * Swift file, and the committed declaration of the Swift module is the one
 * One's native source writes for it now.
 */

import { describe, expect, it } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, relative } from 'node:path';

const APP = join(import.meta.dir, '..', '..');
const SWIFT = join(APP, 'native', 'voice', 'Voice.swift');

/** The names a voice must never reach the speaker or the session by, written apart so this file does not hold them whole. */
const BANNED = [
  ['set', 'Category'],
  ['set', 'Active'],
  ['AVAudio', 'Player'],
  ['AVAudio', 'Engine'],
  ['AudioServices', 'Play'],
  ['One.', 'Audio'],
].map((parts) => parts.join(''));

/** One's native source writes `.one-native-source.*` (gitignored) beside the Swift; the scan reads tracked files only. */
const generated = (name: string) => name.startsWith('.one-native-source.');

const filesUnder = (dir: string): ReadonlyArray<string> =>
  readdirSync(dir, { withFileTypes: true })
    .filter((entry) => !generated(entry.name))
    .flatMap((entry) => {
      if (entry.isDirectory()) return filesUnder(join(dir, entry.name));
      return [join(dir, entry.name)];
    });

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

describe('the voice on the simulator', () => {
  const lines = branches(readFileSync(SWIFT, 'utf8'));
  const where = (pattern: RegExp) => lines.filter((l) => pattern.test(l.line)).map((l) => l.branch);

  it('speaks only on a device, and renders silently only on the simulator, which logs its skip', () => {
    expect(where(/\.speak\(/).length).toBeGreaterThan(0);
    expect(where(/\.speak\(/).filter((b) => b !== 'device')).toEqual([]);
    expect(where(/\.write\(/).length).toBeGreaterThan(0);
    expect(where(/\.write\(/).filter((b) => b !== 'simulator')).toEqual([]);
    expect(
      lines.some((l) => l.branch === 'simulator' && l.line.includes('skipped=simulator')),
    ).toBe(true);
  });

  it('takes its ranges from the render alone: the delegate is set only on a device', () => {
    expect(where(/\.delegate\s*=/).length).toBeGreaterThan(0);
    expect(where(/\.delegate\s*=/).filter((b) => b !== 'device')).toEqual([]);
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

describe('the voice’s audio path', () => {
  it('names no session category or activation, player, engine, system sound or One audio', () => {
    const files = [
      ...filesUnder(join(APP, 'native', 'voice')),
      ...filesUnder(join(APP, 'src', 'voice')).filter((file) => !file.endsWith('.test.ts')),
      join(APP, 'src', 'voice.ts'),
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

describe('the voice’s seams', () => {
  it('keeps the service free of native code', () => {
    const named = imports(readFileSync(join(APP, 'src', 'voice.ts'), 'utf8'));
    expect(
      named.filter(
        (s) =>
          !(s === 'effect' || s.startsWith('effect/') || s.startsWith('./') || s.startsWith('../')),
      ),
    ).toEqual([]);
    expect(named.filter((s) => s.includes('.swift') || s.includes('source'))).toEqual([]);
  });

  it('imports the Swift file from source.ios.ts alone', () => {
    const importers = [...filesUnder(join(APP, 'src')), ...filesUnder(join(APP, 'app'))]
      .filter((file) => /\.tsx?$/.test(file) && !/\.test\.tsx?$/.test(file))
      .filter((file) => readFileSync(file, 'utf8').includes('Voice.swift'))
      .map((file) => relative(APP, file));
    expect(importers).toEqual(['src/voice/source.ios.ts']);
  });

  it('commits the declaration One’s native source writes for Voice.swift', () => {
    const fromApp = createRequire(join(APP, 'package.json'));
    const fromOne = createRequire(fromApp.resolve('one/package.json'));
    const { nativeSourceContract } = fromOne('vxrn/native-source-contract') as {
      readonly nativeSourceContract: (
        file: string,
        source: string,
      ) => { readonly declaration: string };
    };
    const unformatted = (text: string) => text.replaceAll(/;$/gm, '');
    const expected = nativeSourceContract(SWIFT, readFileSync(SWIFT, 'utf8')).declaration;
    const written = readFileSync(join(APP, 'native', 'voice', 'Voice.d.swift.ts'), 'utf8');
    expect(unformatted(written)).toContain(unformatted(expected));
    for (const method of ['voices', 'speak', 'pause', 'resume', 'stop', 'onEvent'])
      expect(expected).toContain(`${method}(`);
  });
});
