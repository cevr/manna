/* oxlint-disable effect/noNodeBuiltinImport, effect/noDynamicImports -- the guard reads the tuner's own source files from disk, synchronously, and asks One's native-source contract (resolved from the app, as One's bundler does) for the Swift module's declaration. */

/**
 * The tuner's ear only listens: its Swift module takes the session for
 * input alone (`.record`, mode `.measurement`, no output, no automatic
 * gain), asks for no permission itself, removes its tap before it stops the
 * engine, and gives the session back so a paused hymn may play again.
 *
 * Also: the committed declaration of the Swift module is the one One's
 * native source writes for it now, so the app's typecheck reads its real
 * contract.
 */

import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const app = join(import.meta.dir, '..', '..');
const swiftFile = join(app, 'native', 'tuner', 'Listen.swift');
const swift = readFileSync(swiftFile, 'utf8');

describe('the ear’s audio session', () => {
  it('takes the session for input only, with the input’s gain and voice processing off', () => {
    expect(swift).toContain('setCategory(.record, mode: .measurement)');
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
