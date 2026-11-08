/* oxlint-disable effect/noNodeBuiltinImport, effect/noDynamicImports --the guard reads the natural voice's own source files from disk, synchronously, and asks One's native-source contract (resolved from the app, as One's bundler does) for the Swift module's declaration. */

/**
 * The natural voice makes no sound where no one asked to hear it: on the
 * simulator (whose audio reaches the Mac's speaker) its Swift output never
 * starts or plays an engine, a player or a node, and its play log says it
 * skipped. No file of the natural voice touches the audio session's
 * category or activation: the session is the hands-free unit's.
 *
 * Also: only `source.ios.ts` names the Swift file, the committed
 * declaration of the Swift module is the one One's native source writes
 * for it now, and each vendored FluidAudio file keeps the notice Apache
 * §4(b) asks of a changed file, beside FluidAudio's LICENSE kept byte for
 * byte.
 */

import { describe, expect, it } from 'bun:test';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, relative } from 'node:path';

const APP = join(import.meta.dir, '..', '..');
const NATIVE = join(APP, 'native', 'natural');
const SWIFT = join(NATIVE, 'Natural.swift');
const KOKORO = join(NATIVE, 'kokoro');
const FLUID_COMMIT = 'ee78635d23d52379117554ba72358b65a0612447';
const FLUID_LICENSE_SHA256 = 'c71d239df91726fc519c6eb72d318ec65820627232b2f796219e87dcf35d0ab4';

/** The session calls a voice must never make, written apart so this file does not hold them whole. */
const BANNED = [
  ['set', 'Category'],
  ['set', 'Active'],
].map((parts) => parts.join(''));

/** One writes `.one-native-source.*` beside the Swift and `app/routes.d.ts` (both gitignored); the scan reads tracked files only. */
const generated = (dir: string, name: string) =>
  name.startsWith('.one-native-source.') ||
  relative(APP, join(dir, name)) === join('app', 'routes.d.ts');

const filesUnder = (dir: string): ReadonlyArray<string> =>
  readdirSync(dir, { withFileTypes: true })
    .filter((entry) => !generated(dir, entry.name))
    .flatMap((entry) => {
      if (entry.isDirectory()) return filesUnder(join(dir, entry.name));
      return [join(dir, entry.name)];
    });

/** The package's own Swift files: the vendored chain is FluidAudio's and plays nothing. */
const own = filesUnder(NATIVE).filter(
  (file) => file.endsWith('.swift') && !file.startsWith(KOKORO),
);

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

const STARTS_OR_PLAYS = /\b\w*(engine|player|node)\w*\.(start|play)\(/i;

describe('the natural voice on the simulator', () => {
  const lines = own.flatMap((file) => branches(readFileSync(file, 'utf8')));

  it('starts and plays its engine only on a device', () => {
    const plays = lines.filter((l) => STARTS_OR_PLAYS.test(l.line));
    expect(plays.length).toBeGreaterThan(0);
    expect(plays.filter((l) => l.branch !== 'device').map((l) => l.line)).toEqual([]);
  });

  it('logs its skip on the simulator, in the play line', () => {
    expect(
      lines.some((l) => l.branch === 'simulator' && l.line.includes('skipped=simulator')),
    ).toBe(true);
    expect(lines.filter((l) => l.branch === 'device' && l.line.includes('skipped'))).toEqual([]);
    const swift = readFileSync(SWIFT, 'utf8');
    const play = swift.indexOf('"[natural] play utterance=');
    expect(play).toBeGreaterThan(0);
    const statement = swift.slice(play).split('\n').slice(0, 2).join('\n');
    expect(statement).toMatch(/\+\s*NaturalOutput\.note\)/);
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

describe('the natural voice’s audio path', () => {
  it('names no session category or activation', () => {
    const files = [
      ...filesUnder(NATIVE),
      ...filesUnder(join(APP, 'src', 'natural')).filter((file) => !file.endsWith('.test.ts')),
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

describe('the natural voice’s seams', () => {
  it('imports the Swift file from source.ios.ts alone', () => {
    const importers = [...filesUnder(join(APP, 'src')), ...filesUnder(join(APP, 'app'))]
      .filter((file) => /\.tsx?$/.test(file) && !/\.test\.tsx?$/.test(file))
      .filter((file) => readFileSync(file, 'utf8').includes('Natural.swift'))
      .map((file) => relative(APP, file));
    expect(importers).toEqual(['src/natural/source.ios.ts']);
  });

  it('commits the declaration One’s native source writes for Natural.swift', () => {
    const fromApp = createRequire(join(APP, 'package.json'));
    const fromOne = createRequire(fromApp.resolve('one/package.json'));
    const { nativeSourceContract } = fromOne('vxrn/native-source-contract') as {
      readonly nativeSourceContract: (
        file: string,
        source: string,
      ) => { readonly declaration: string };
    };
    const expected = nativeSourceContract(SWIFT, readFileSync(SWIFT, 'utf8')).declaration;
    expect(readFileSync(join(NATIVE, 'Natural.d.swift.ts'), 'utf8')).toBe(expected);
    for (const method of [
      'status',
      'install',
      'cancelInstall',
      'remove',
      'load',
      'render',
      'play',
      'pause',
      'resume',
      'stop',
      'onEvent',
      'onInstall',
    ])
      expect(expected).toContain(`  ${method}(`);
  });
});

describe('the vendored chain', () => {
  it('keeps FluidAudio’s LICENSE byte for byte', () => {
    const hash = createHash('sha256')
      .update(readFileSync(join(KOKORO, 'LICENSE')))
      .digest('hex');
    expect(hash).toBe(FLUID_LICENSE_SHA256);
  });

  it('keeps each vendored file’s notice: the source, the commit, its upstream path, the licence and what changed', () => {
    const vendored = filesUnder(KOKORO).filter((file) => file.endsWith('.swift'));
    expect(vendored.length).toBe(6);
    const missing = vendored.flatMap((file) => {
      const head = readFileSync(file, 'utf8').split('\n').slice(0, 12).join('\n');
      const upstream = `Sources/FluidAudio/TTS/KokoroAne/${relative(KOKORO, file)}`;
      return [
        'Vendored from FluidAudio',
        FLUID_COMMIT,
        upstream,
        'Licensed under the Apache License, Version 2.0 (see LICENSE).',
        'Changed for Heartseed:',
      ]
        .filter((needle) => !head.includes(needle))
        .map((needle) => `${relative(APP, file)}: ${needle}`);
    });
    expect(missing).toEqual([]);
  });
});
