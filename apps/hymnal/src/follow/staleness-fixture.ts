/* oxlint-disable node/no-process-env, effect/noNodeBuiltinImport, effect/noGlobals, effect/noNewError, effect/noThrowStatement, effect/noTryCatch, effect/noAsyncFunction -- isolated host preload observes real scratch files; catches suppress lyric-bearing failures. */
import fs, { readFileSync } from 'node:fs';

try {
  const target = process.env['HYMNAL_STALE_INPUT'];
  if (target) {
    const reads = [
      readFileSync(target),
      fs.readFileSync(target),
      await fs.promises.readFile(target),
      await Bun.file(target).arrayBuffer(),
    ];
    if (
      reads.some(
        (bytes) =>
          new Bun.CryptoHasher('sha256').update(bytes).digest('hex') !==
          process.env['HYMNAL_STALE_HASH'],
      )
    )
      throw new Error('scratch byte mismatch');
    console.log('P3 real reads=4');
  }
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
