/** Generate numeric sidecars without writing lyric-bearing compiled hymns. */
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Effect, Schema } from 'effect';
import { Hymn, sung } from '../src/hymn.js';
import { Playback, applyMetadata, metadataOf } from '../src/playback.js';

const data = new URL('../data/', import.meta.url).pathname;
const folder = join(data, 'playback');
const pad = (n: number) => String(n).padStart(3, '0');
const loadCompiler = () => import('../src/compile.js');
const loadSources = () => import('./sources.js');
const loadSourceText = () => import('./source-text.js');
const textBytes = () => readFileSync(join(data, 'source-text.json'), 'utf8');
const fixesBytes = () => readFileSync(join(data, 'fixes/refrains.json'), 'utf8');
const inputsHash = (source: string, fixes: string) => {
  const hash = new Bun.CryptoHasher('sha256').update('playback-v1\0').update(source).update(fixes);
  for (const file of [
    'align',
    'chord',
    'compile',
    'harmony',
    'hymn',
    'midi',
    'placement',
    'playback',
    'score',
    'syllables',
    'timing',
  ]) {
    hash.update(readFileSync(new URL(`../src/${file}.ts`, import.meta.url)));
  }
  hash.update(readFileSync(new URL('./sources.ts', import.meta.url)));
  return hash.digest('hex');
};
const fingerprint = (number: number, inputs: string) => {
  const midi = readFileSync(join(data, `midi/${pad(number)}.mid`));
  const corpus = readFileSync(join(data, `sdah-1985/${pad(number)}.json`));
  const sourceHash = new Bun.CryptoHasher('sha256')
    .update(inputs)
    .update(midi)
    .update(corpus)
    .digest('hex');
  return { midi, sourceHash };
};

/** Both native and web build derivations use the same checked numeric join. */
export const readPlayback = (hymns: readonly Hymn[]): readonly Hymn[] => {
  const source = textBytes(),
    fixes = fixesBytes();
  const inputs = inputsHash(source, fixes);
  return hymns.map((hymn) => {
    const { sourceHash } = fingerprint(hymn.number, inputs);
    const decoded = Schema.decodeEffect(Schema.fromJsonString(Playback))(
      readFileSync(join(folder, `${pad(hymn.number)}.json`), 'utf8'),
    );
    const joined = decoded.pipe(
      Effect.flatMap((metadata) => applyMetadata(hymn, metadata, sourceHash)),
      Effect.result,
    );
    const result = Effect.runSync(joined);
    if (result._tag === 'Failure')
      throw new Error(`playback: metadata mismatch hymn=${hymn.number}`);
    return result.success;
  });
};

/** Fresh compilation is in memory. No source text enters generated files. */
const countsOf = (hymn: Hymn) => {
  const parts = [...hymn.stanzas, ...(hymn.refrain === undefined ? [] : [hymn.refrain.part])];
  const sungParts = parts.filter((part) => part._tag === 'Sung');
  const syllables = sungParts.flatMap((part) => part.lines.flat());
  const occurrenceSyllables = sung(hymn).flatMap((line) =>
    line.part._tag === 'Plain' ? [] : (line.part.lines[line.line] ?? []),
  );
  return {
    sungParts: sungParts.length,
    syllables: syllables.length,
    melismas: syllables.filter((s) => s.notes > 1).length,
    shared: syllables.filter((s) => s.notes === 0).length,
    occurrences: sung(hymn).length,
    occurrenceSyllables: occurrenceSyllables.length,
    occurrenceMelismas: occurrenceSyllables.filter((s) => s.notes > 1).length,
    occurrenceShared: occurrenceSyllables.filter((s) => s.notes === 0).length,
  };
};

export const generatePlayback = async (out = folder) => {
  // Reading sidecars during a build needs no compiler or pronunciation dictionary.
  const [{ compile }, { decodeOrders, sourceOf }, { decodeSourceText }] = await Promise.all([
    loadCompiler(),
    loadSources(),
    loadSourceText(),
  ]);
  const source = textBytes(),
    fixes = fixesBytes();
  const inputs = inputsHash(source, fixes);
  const decoded = Effect.runSync(decodeSourceText(source));
  const orders = Effect.runSync(decodeOrders(fixes));
  mkdirSync(out, { recursive: true });
  let melismas = 0,
    shared = 0,
    syllables = 0,
    sungParts = 0,
    affectedHymns = 0;
  const census = [];
  for (const row of decoded.hymns.filter((row) => row.number <= 695)) {
    const { midi, sourceHash } = fingerprint(row.number, inputs);
    const hymn = Effect.runSync(
      sourceOf({ ...row, name: row.title }, midi, orders).pipe(Effect.flatMap(compile)),
    );
    const metadata = Effect.runSync(metadataOf(hymn, sourceHash));
    writeFileSync(join(out, `${pad(row.number)}.json`), `${JSON.stringify(metadata)}\n`);
    const counts = countsOf(hymn);
    const baseline = Effect.runSync(
      Schema.decodeEffect(Schema.fromJsonString(Hymn))(
        readFileSync(join(data, `sdah-1985/${pad(row.number)}.json`), 'utf8'),
      ),
    );
    const original = Effect.runSync(metadataOf(baseline, sourceHash));
    const changed = JSON.stringify(original) !== JSON.stringify(metadata);
    melismas += counts.melismas;
    shared += counts.shared;
    syllables += counts.syllables;
    sungParts += counts.sungParts;
    if (counts.melismas) affectedHymns++;
    census.push({ number: row.number, ...counts, baseline: countsOf(baseline), changed });
  }
  const summary = {
    version: 1,
    hymns: 695,
    sungParts,
    syllables,
    melismas,
    shared,
    affectedHymns,
    census,
  };
  writeFileSync(join(out, 'census.json'), `${JSON.stringify(summary)}\n`);
  const formatted = Bun.spawnSync(
    [new URL('../../../node_modules/.bin/oxfmt', import.meta.url).pathname, out],
    { stdout: 'ignore', stderr: 'ignore' },
  );
  if (formatted.exitCode !== 0) throw new Error('playback: numeric metadata formatting failed');
  return summary;
};

if (import.meta.main) {
  const flag = process.argv.indexOf('--out');
  const summary = await generatePlayback(flag < 0 ? folder : process.argv[flag + 1]);
  console.log(
    `P3 generated hymns=${summary.hymns} syllables=${summary.syllables} melismas=${summary.melismas} shared=${summary.shared} affected=${summary.affectedHymns}`,
  );
}
