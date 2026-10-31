/* oxlint-disable effect/noNodeBuiltinImport, effect/noDynamicImports -- the guard reads the tuner's own source files from disk, synchronously, and asks One's native-source contract (resolved from the app, as One's bundler does) for the Swift module's declaration. */

/**
 * The tuner's ear only listens: its Swift module takes the session for
 * input alone (`.record`, mode `.measurement`, no automatic gain), names no
 * player or output API in any of its files, asks for no permission itself,
 * removes its tap before it stops the engine, and gives the session back on
 * every path so a paused hymn may play again.
 *
 * Also: the committed declaration of the Swift module is the one One's
 * native source writes for it now, so the app's typecheck reads its real
 * contract.
 */

import { describe, expect, it } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, relative } from 'node:path';

const app = join(import.meta.dir, '..', '..');
const swiftFile = join(app, 'native', 'tuner', 'Listen.swift');
const swift = readFileSync(swiftFile, 'utf8');

/** The ear's own files: its Swift package and the two bindings of it. */
const earFiles = [
  ...readdirSync(join(app, 'native', 'tuner'))
    .filter((name) => name.endsWith('.swift'))
    .map((name) => join(app, 'native', 'tuner', name)),
  ...readdirSync(import.meta.dir)
    .filter((name) => /^native(\.[a-z]+)?\.ts$/.test(name))
    .map((name) => join(import.meta.dir, name)),
];

/** The names a sound would leave the phone by: players, the engine's output side, playing categories, One's audio. */
const OUTPUT = [
  'AVAudioPlayer',
  'AVPlayer',
  'AVQueuePlayer',
  'AVAudioUnitSampler',
  'AVSpeechSynthesizer',
  'AudioServicesPlay',
  'outputNode',
  'mainMixerNode',
  'scheduleBuffer',
  'scheduleFile',
  '.playback',
  '.playAndRecord',
  '.ambient',
  '.soloAmbient',
  'One.Audio',
  'createPlayer',
];

/** Whether the block open at the start of `text` closes within it. */
const closesBefore = (text: string): boolean => {
  let depth = 0;
  for (const char of text) {
    if (char === '{') depth += 1;
    if (char === '}') depth -= 1;
    if (depth < 0) return true;
  }
  return false;
};

describe('the ear’s audio session', () => {
  it('takes the session for input only, with the input’s gain and voice processing off', () => {
    expect(swift).toContain('setCategory(.record, mode: .measurement)');
  });

  it('names no player, output node, playing category or One audio in any of its files', () => {
    expect(earFiles.map((file) => relative(app, file)).toSorted()).toEqual([
      'native/tuner/Listen.swift',
      'native/tuner/Package.swift',
      'src/tuner/native.ios.ts',
      'src/tuner/native.ts',
    ]);
    const named = earFiles.flatMap((file) =>
      OUTPUT.filter((name) => readFileSync(file, 'utf8').includes(name)).map(
        (name) => `${relative(app, file)}: ${name}`,
      ),
    );
    expect(named).toEqual([]);
    // Its one tap is on the input node.
    expect(swift.split('installTap(').length).toBe(2);
    expect(swift).toContain('input.installTap(onBus: 0');
    expect(swift).toContain('let input = engine.inputNode');
  });

  it('asks for no permission itself, and starts only when it is granted', () => {
    expect(swift).not.toContain('requestRecordPermission');
    expect(swift).toContain('recordPermission == .granted');
  });

  it('removes its tap before it stops the engine, then gives the session back to the others', () => {
    const tap = swift.indexOf('engine.inputNode.removeTap(onBus: 0)');
    const engine = swift.indexOf('engine.stop()');
    expect(tap).toBeGreaterThan(-1);
    expect(engine).toBeGreaterThan(tap);
    expect(swift).toContain('setActive(false, options: .notifyOthersOnDeactivation)');
  });

  it('gives the session back in the category, mode and options it found, unless another owner took it', () => {
    // One's resume() only calls the player's play(): a paused hymn sounds again only when the
    // tuner puts back the category it found, since `.record` silences playback.
    const start = swift.slice(swift.indexOf('func start()'), swift.indexOf('func stop()'));
    const saved = start.indexOf('before = Before(of: session)');
    expect(saved).toBeGreaterThan(-1);
    expect(start.indexOf('setCategory(.record, mode: .measurement)')).toBeGreaterThan(saved);
    // Each failure after the save (the session, the input, the engine) gives it back too: the
    // branch that logs the failure, from its opening brace, releases.
    for (const status of ['session', 'input', 'engine']) {
      const logged = start.indexOf(`listen.failed status=${status}`);
      expect(logged).toBeGreaterThan(saved);
      const head = start.slice(0, logged);
      expect(`${status}: ${head.slice(head.lastIndexOf('{'))}`).toContain('release(session)');
    }

    const kept = swift.slice(swift.indexOf('private struct Before'));
    for (const field of ['session.category', 'session.mode', 'session.categoryOptions'])
      expect(kept.slice(0, kept.indexOf('\n  }\n'))).toContain(field);

    const from = swift.indexOf('private func release(');
    const release = swift.slice(from, swift.indexOf('\n  }\n', from));
    const owned = release.indexOf('guard session.category == .record else { return }');
    const deactivated = release.indexOf('setActive(false, options: .notifyOthersOnDeactivation)');
    const restored = release.indexOf(
      'setCategory(before.category, mode: before.mode, options: before.options)',
    );
    expect(owned).toBeGreaterThan(-1);
    expect(deactivated).toBeGreaterThan(owned);
    expect(restored).toBeGreaterThan(deactivated);
    // The restore runs whether or not the deactivation threw: the deactivation's `catch` closes
    // before it, so it never sits inside that catch.
    const caught = release.indexOf('} catch {', deactivated);
    expect(caught).toBeGreaterThan(deactivated);
    expect(closesBefore(release.slice(caught + '} catch {'.length, restored))).toBe(true);
  });

  it('cuts frames of 2048 samples, hop 2048', () => {
    expect(swift).toContain('static let size = 2048');
    expect(swift).toContain('bufferSize: AVAudioFrameCount(Framer.size)');
  });
});

describe('the Swift module’s declaration', () => {
  it('is the one One’s native source writes for Listen.swift', () => {
    const fromApp = createRequire(join(app, 'package.json'));
    const fromOne = createRequire(fromApp.resolve('one/package.json'));
    const { nativeSourceContract } = fromOne('vxrn/native-source-contract') as {
      readonly nativeSourceContract: (
        file: string,
        source: string,
      ) => { readonly declaration: string };
    };
    // Pre-commit's oxfmt ends each member with a semicolon that One's typegen leaves out.
    const unformatted = (text: string) => text.replaceAll(/;$/gm, '');
    const written = readFileSync(join(app, 'native', 'tuner', 'Listen.d.swift.ts'), 'utf8');
    expect(unformatted(written)).toContain(
      unformatted(nativeSourceContract(swiftFile, swift).declaration),
    );
  });
});
