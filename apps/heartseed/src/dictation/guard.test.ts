/* oxlint-disable effect/noNodeBuiltinImport, effect/noDynamicImports, effect/noTernary, effect/noNullish -- the guard reads dictation's own source files from disk, synchronously, and asks One's native-source contract (resolved from the app, as One's bundler does) for the Swift module's declaration; its Swift reader walks lines with plain branches over regex matches that may be absent. */

/**
 * Dictation opens no microphone where no one is speaking to it: in
 * `native/dictation/Dictation.swift` (comments and string literals
 * blanked) every audio input, permission ask, audio-session change,
 * recognition start and model download lies in the device branch of
 * `#if targetEnvironment(simulator)`, read as Swift reads nested `#if`s,
 * `#elseif` and `#else`. On the simulator a listen only logs its skip and
 * fails `unavailable`. Recognition never leaves the device: the recognizer's
 * request asks for on-device recognition and never for the network, no
 * file is recognized, and nothing plays a sound.
 *
 * Also: the module emits only for the session it holds and lets go of it
 * before it stops it; the service imports no native code; only
 * `source.ios.ts` names the Swift file; nothing of dictation reaches for
 * One's own speech module; and the committed declaration of the Swift
 * module is the one One's native source writes for it now.
 */

import { describe, expect, it } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, relative } from 'node:path';

const APP = join(import.meta.dir, '..', '..');
const SWIFT = join(APP, 'native', 'dictation', 'Dictation.swift');

/** One writes `.one-native-source.*` beside the Swift and `app/routes.d.ts` (both gitignored); the scans read tracked files only. */
const generated = (dir: string, name: string) =>
  name.startsWith('.one-native-source.') ||
  relative(APP, join(dir, name)) === join('app', 'routes.d.ts');

const filesUnder = (dir: string): ReadonlyArray<string> =>
  readdirSync(dir, { withFileTypes: true })
    .filter((entry) => !generated(dir, entry.name) && entry.name !== 'node_modules')
    .flatMap((entry) => {
      if (entry.isDirectory()) return filesUnder(join(dir, entry.name));
      return [join(dir, entry.name)];
    });

/** Names that must lie in the device branch: the microphone, the permission asks, the audio session, every recognition start and the model download. Written apart so this file does not hold them whole. */
const DEVICE_ONLY = [
  ['AVAudio', 'Engine'],
  ['input', 'Node'],
  ['install', 'Tap'],
  ['requestRecord', 'Permission'],
  ['record', 'Permission'],
  ['request', 'Authorization'],
  ['set', 'Category'],
  ['set', 'Active'],
  ['AVAudioSession.shared', 'Instance'],
  ['SFSpeechAudioBuffer', 'RecognitionRequest'],
  ['recognition', 'Task('],
  ['SpeechAnalyzer', '('],
  ['assetInstallation', 'Request'],
  ['downloadAnd', 'Install'],
  ['AVCapture', 'Device'],
  ['CaptureInput', 'SequenceProvider'],
].map((parts) => parts.join(''));

/** Names no file of dictation may hold: a file's recognition, a player, a system sound, a synthesizer, One's audio or One's own speech module. */
const BANNED = [
  ['SFSpeechURL', 'RecognitionRequest'],
  ['AVAudio', 'Player'],
  ['AV', 'Player'],
  ['AudioServices', 'Play'],
  ['AVSpeech', 'Synthesizer'],
  ['One.', 'Audio'],
  ['One.', 'Speech'],
  ['OneSpeech', ''],
].map((parts) => parts.join(''));

type Place = 'simulator' | 'device' | 'other';
type Branch = Place | 'none';

const SIMULATOR = /^targetEnvironment\(\s*simulator\s*\)$/;
const DEVICE = /^!\s*targetEnvironment\(\s*simulator\s*\)$/;

/** A condition that is exactly `targetEnvironment(simulator)` or its negation, if it is one. */
const said = (condition: string): Place | undefined => {
  const plain = condition.trim();
  if (SIMULATOR.test(plain)) return 'simulator';
  if (DEVICE.test(plain)) return 'device';
  return undefined;
};

/**
 * Where a branch of an `#if` group holds: its own plain condition, or the
 * other side of one an earlier branch of the group said plainly (a branch
 * after `#if targetEnvironment(simulator)` runs only off the simulator).
 * Any other condition naming the environment is read as neither.
 */
const placeOf = (condition: string, plain: ReadonlyArray<Place>): Place => {
  const own = said(condition);
  if (own !== undefined) return own;
  if (/targetEnvironment/.test(condition)) return 'other';
  if (plain.includes('simulator')) return 'device';
  if (plain.includes('device')) return 'simulator';
  return 'other';
};

/** Each line of a Swift file with the simulator branch it lies in, as Swift reads `#if`, `#elseif`, `#else` and `#endif`, nested: device or simulator when an enclosing branch says so and none says the other. */
export const branches = (
  swift: string,
): ReadonlyArray<{ readonly line: string; readonly branch: Branch }> => {
  const stack: Array<{ plain: Place[]; now: Place }> = [];
  return swift.split('\n').map((raw) => {
    const line = raw.trim();
    const directive = /^#(if|elseif|else|endif)\b(.*)$/.exec(line);
    const condition = directive?.[2] ?? '';
    if (directive?.[1] === 'if') {
      const own = said(condition);
      stack.push({ plain: own === undefined ? [] : [own], now: placeOf(condition, []) });
    } else if (directive?.[1] === 'elseif' || directive?.[1] === 'else') {
      const group = stack.at(-1);
      if (group !== undefined) {
        group.now = placeOf(directive[1] === 'else' ? '' : condition, group.plain);
        const own = said(condition);
        if (directive[1] === 'elseif' && own !== undefined) group.plain.push(own);
      }
    } else if (directive?.[1] === 'endif') stack.pop();
    const places = stack.map((group) => group.now);
    const device = places.includes('device');
    const simulator = places.includes('simulator');
    const branch: Branch =
      device && !simulator ? 'device' : simulator && !device ? 'simulator' : 'none';
    return { line, branch };
  });
};

/** Swift with each line comment and each one-line block comment removed and each string literal blanked to `""`, so a name in a doc comment or a log line is not code. */
export const code = (swift: string): string =>
  swift
    .split('\n')
    .map((line) => {
      let out = '';
      let inString = false;
      for (let i = 0; i < line.length; i++) {
        const char = line[i] ?? '';
        if (inString) {
          if (char === '\\') i++;
          else if (char === '"') {
            inString = false;
            out += '"';
          }
          continue;
        }
        if (char === '/' && line[i + 1] === '/') break;
        if (char === '/' && line[i + 1] === '*') {
          const end = line.indexOf('*/', i + 2);
          if (end < 0) break;
          i = end + 1;
          continue;
        }
        if (char === '"') inString = true;
        out += char;
      }
      return out;
    })
    .join('\n');

const imports = (text: string) =>
  Array.from(text.matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g), (m) => m[1] ?? '');

/** The trimmed lines of the body of the first `func name(`, its signature excluded: from the brace that ends the signature to the brace at the function's own indent. */
const body = (swift: string, name: string): ReadonlyArray<string> => {
  const start = swift.indexOf(`func ${name}(`);
  const lineStart = swift.lastIndexOf('\n', start) + 1;
  const indent = /^ */.exec(swift.slice(lineStart))?.[0] ?? '';
  const open = swift.indexOf('{\n', start);
  const end = swift.indexOf(`\n${indent}}\n`, open);
  if (start < 0 || open < 0 || end < 0) return [];
  return swift
    .slice(open + 2, end)
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
};

describe('the microphone on the simulator', () => {
  const swift = readFileSync(SWIFT, 'utf8');
  const lines = branches(code(swift));

  it('reads branches as Swift does, nested, with #elseif and #else', () => {
    const sample = [
      '#if targetEnvironment(simulator)',
      'a',
      '#else',
      'b',
      '#if os(iOS)',
      'c',
      '#endif',
      '#endif',
      '#if !targetEnvironment(simulator)',
      'd',
      '#elseif os(iOS)',
      'e',
      '#else',
      'f',
      '#endif',
      '#if os(macOS)',
      'g',
      '#elseif targetEnvironment(simulator)',
      'h',
      '#else',
      'i',
      '#endif',
      '#if targetEnvironment(simulator) || os(macOS)',
      'j',
      '#endif',
      'k',
    ].join('\n');
    expect(branches(sample).map((l) => l.branch)).toEqual([
      'simulator',
      'simulator',
      'device',
      'device',
      'device',
      'device',
      'device',
      'none',
      'device',
      'device',
      'simulator',
      'simulator',
      'simulator',
      'simulator',
      'none',
      'none',
      'none',
      'simulator',
      'simulator',
      'device',
      'device',
      'none',
      'none',
      'none',
      'none',
      'none',
    ]);
    expect(code('let a = "set" + "Category" // setCategory\n/* AVAudioEngine */ b')).toBe(
      'let a = "" + "" \n b',
    );
  });

  it('opens the microphone, asks for a permission, takes the session and starts recognition only on a device', () => {
    const outside = lines.filter(
      (l) => l.branch !== 'device' && DEVICE_ONLY.some((name) => l.line.includes(name)),
    );
    expect(outside.map((l) => l.line)).toEqual([]);
    for (const name of [
      ['AVAudio', 'Engine'],
      ['install', 'Tap'],
      ['SpeechAnalyzer', '('],
      ['SFSpeechAudioBuffer', 'RecognitionRequest('],
      ['set', 'Category'],
    ].map((p) => p.join('')))
      expect({
        name,
        device: lines.some((l) => l.branch === 'device' && l.line.includes(name)),
      }).toEqual({ name, device: true });
    for (const name of ['SpeechTranscriber(', 'DictationTranscriber(', 'SFSpeechRecognizer('])
      expect({ name, present: code(swift).includes(name) }).toEqual({ name, present: true });
  });

  it('on the simulator, a listen only logs its skip and fails unavailable', () => {
    const listen = branches(body(swift, 'listen').join('\n'));
    expect(listen.slice(0, 3).map((l) => l.line)).toEqual([
      'halt()',
      'let next = Held(session: session)',
      'held = next',
    ]);
    expect(listen.filter((l) => l.branch === 'simulator').map((l) => l.line)).toEqual([
      '#if targetEnvironment(simulator)',
      'NSLog("%@", "[dictation] listen session=\\(session) skipped=simulator")',
      'emit(next, .fail, reason: "unavailable")',
    ]);
  });

  it('recognizes on the device only: on-device recognition asked for and never turned off, no file recognized, no sound', () => {
    const plain = code(swift);
    expect(plain).toMatch(/\.requiresOnDeviceRecognition\s*=\s*true\b/);
    expect(
      Array.from(plain.matchAll(/requiresOnDeviceRecognition\s*=\s*(\S+)/g), (m) => m[1]),
    ).toEqual(['true']);
    const files = [
      ...filesUnder(join(APP, 'native', 'dictation')),
      ...filesUnder(join(APP, 'src', 'dictation')).filter((file) => !file.endsWith('.test.ts')),
      join(APP, 'src', 'dictation.ts'),
    ];
    expect(files).toContain(SWIFT);
    const named = files.flatMap((file) =>
      BANNED.filter((name) => readFileSync(file, 'utf8').includes(name)).map(
        (name) => `${relative(APP, file)}: ${name}`,
      ),
    );
    expect(named).toEqual([]);
  });

  it('emits only for the session it holds, and lets go of it before it stops it', () => {
    expect(body(swift, 'emit')[0]).toBe('guard let now = held, now === from else { return }');
    expect(body(swift, 'halt').slice(0, 3)).toEqual([
      'let now = held',
      'held = nil',
      'now?.stop()',
    ]);
    expect(body(swift, 'replay')[0]).toBe('halt()');
    expect(body(swift, 'cancel')).toEqual(['halt()']);
  });
});

describe('dictation’s seams', () => {
  it('keeps the service free of native code', () => {
    const named = imports(readFileSync(join(APP, 'src', 'dictation.ts'), 'utf8'));
    expect(
      named.filter((s) => !(s === 'effect' || s.startsWith('effect/') || s.startsWith('./'))),
    ).toEqual([]);
    expect(named.filter((s) => s.includes('.swift') || s.includes('source'))).toEqual([]);
  });

  it('imports the Swift file from source.ios.ts alone', () => {
    const importers = [...filesUnder(join(APP, 'src')), ...filesUnder(join(APP, 'app'))]
      .filter((file) => /\.tsx?$/.test(file) && !/\.test\.tsx?$/.test(file))
      .filter((file) => readFileSync(file, 'utf8').includes('Dictation.swift'))
      .map((file) => relative(APP, file));
    expect(importers).toEqual(['src/dictation/source.ios.ts']);
  });

  it('commits the declaration One’s native source writes for Dictation.swift', () => {
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
    const written = readFileSync(join(APP, 'native', 'dictation', 'Dictation.d.swift.ts'), 'utf8');
    expect(unformatted(written)).toContain(unformatted(expected));
    for (const method of ['engines', 'listen', 'replay', 'finish', 'cancel', 'onEvent'])
      expect(expected).toContain(`${method}(`);
  });
});
