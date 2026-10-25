/* oxlint-disable effect/noNodeBuiltinImport, effect/noDynamicImports -- the guard reads the Feel's own source files from disk, synchronously, and asks One's native-source contract (resolved from the app, as One's bundler does) for the Swift module's declaration. */

/**
 * The voice never touches the app's audio session: no file of the Feel
 * (`src/feel/`) or of its Swift package (`native/feel/`) names an audio
 * session, a player or One's audio, since each of those sets the session's
 * category, which ignores the silent switch and can duck or stop the
 * hymn's recording. Sounds go through System Sound Services only.
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
const roots = [join(app, 'src', 'feel'), join(app, 'native', 'feel')];

/** The names a sound must never reach the session by, written apart so this file does not hold them whole. */
const BANNED = [
  ['AVAudio', 'Session'],
  ['AVAudio', 'Player'],
  ['AVAudio', 'Engine'],
  ['set', 'Category'],
  ['One.', 'Audio'],
  ['create', 'Player'],
].map((parts) => parts.join(''));

const filesUnder = (dir: string): ReadonlyArray<string> =>
  readdirSync(dir, { withFileTypes: true }).flatMap(
    (entry) =>
      (entry.isDirectory() && filesUnder(join(dir, entry.name))) || [join(dir, entry.name)],
  );

describe('the voice’s audio path', () => {
  it('names no audio session, player or One audio in any Feel or Swift file', () => {
    const files = roots.flatMap(filesUnder);
    expect(files.some((file) => file.endsWith('Voice.swift'))).toBe(true);
    const named = files.flatMap((file) =>
      BANNED.filter((name) => readFileSync(file, 'utf8').includes(name)).map(
        (name) => `${relative(app, file)}: ${name}`,
      ),
    );
    expect(named).toEqual([]);
  });

  it('plays through System Sound Services', () => {
    const swift = readFileSync(join(app, 'native', 'feel', 'Voice.swift'), 'utf8');
    expect(swift).toContain('AudioServicesPlaySystemSound(');
    expect(swift).toContain('AudioServicesCreateSystemSoundID(');
  });
});

describe('the Swift module’s declaration', () => {
  it('is the one One’s native source writes for Voice.swift', () => {
    const file = join(app, 'native', 'feel', 'Voice.swift');
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
    const written = readFileSync(join(app, 'native', 'feel', 'Voice.d.swift.ts'), 'utf8');
    expect(unformatted(written)).toContain(
      unformatted(nativeSourceContract(file, readFileSync(file, 'utf8')).declaration),
    );
  });
});
