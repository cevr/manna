/* oxlint-disable node/no-process-env, effect/noNodeBuiltinImport, effect/noGlobals, effect/noNewError, effect/noThrowStatement, effect/noTryCatch, effect/noModuleMocks, effect/noAsyncFunction -- isolated Bun preload replaces the synchronous host filesystem, not an Effect application service; catches suppress lyric-bearing failures. */
import * as fs from 'node:fs';
import { resolve } from 'node:path';
import { mock } from 'bun:test';

const root = resolve(import.meta.dir, '../../../..');
const target = process.env['HYMNAL_STALE_INPUT'];
const suffix = process.env['HYMNAL_STALE_SUFFIX'] ?? '\n';
const readActual = fs.readFileSync;

if (target) {
  const file = resolve(root, target);
  const before = readActual(file);
  let after = Buffer.concat([before, Buffer.from(suffix)]);
  if (target === 'packages/hymnal/data/playback/manifest.json')
    after = Buffer.from(JSON.stringify({ ...JSON.parse(before.toString()), inputsHash: 'stale' }));
  if (before.equals(after)) throw new Error('staleness fixture must change bytes');
  // Mock file bytes, not the join or its encoders. No source or installed module is written.
  const read = (path: fs.PathOrFileDescriptor, options?: BufferEncoding) => {
    let name = String(path);
    if (path instanceof URL) name = path.pathname;
    if (name === file) {
      if (options) return after.toString(options);
      return Buffer.from(after);
    }
    if (options) return readActual(path, options);
    return readActual(path);
  };
  mock.module('node:fs', () => ({ ...fs, readFileSync: read }));
}

try {
  const { readPlayback } = await import('@manna/hymnal/playback/build');
  const { readHymns } = await import('../../vite/words');
  const { readChords } = await import('../../vite/chords');
  const { readTiming } = await import('../../vite/timing');
  const hashes = [readPlayback(readHymns()), readChords(), readTiming()].map((value) =>
    new Bun.CryptoHasher('sha256').update(JSON.stringify(value)).digest('hex'),
  );
  console.log(`P3 witness hashes=${hashes.join(',')}`);
} catch {
  // These objects can carry words. Keep failures numeric and never print the caught value.
  console.log('P3 witness refused');
  process.exitCode = 1;
}
