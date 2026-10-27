/** Generate numeric sidecars without writing lyric-bearing compiled hymns. */
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Effect, Result, Schema } from 'effect';
import { Hymn, sung } from '../src/hymn.js';
import {
  Playback,
  type Placements,
  PlacementData,
  applyMetadata,
  metadataOf,
  placementPatches,
} from '../src/playback.js';

const data = new URL('../data/', import.meta.url).pathname;
const folder = join(data, 'playback');
const pad = (n: number) => String(n).padStart(3, '0');
const loadCompiler = () => import('../src/compile.js');
const loadSources = () => import('./sources.js');
const loadSourceText = () => import('./source-text.js');
const textBytes = () => readFileSync(join(data, 'source-text.json'), 'utf8');
const fixesBytes = () => readFileSync(join(data, 'fixes/refrains.json'), 'utf8');
const Manifest = Schema.Struct({
  version: Schema.Literal(1),
  overrides: Schema.Array(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 695 }))),
  placements: Schema.optionalKey(Schema.Array(Schema.Int)),
});
const decodeManifest = Schema.decodeUnknownSync(Schema.fromJsonString(Manifest));
const decodePlayback = Schema.decodeUnknownEffect(Schema.fromJsonString(Playback));
const decodePlacement = Schema.decodeUnknownOption(Schema.fromJsonString(PlacementData));
const regenerate = 'bun run --cwd packages/hymnal playback';
const mismatch = (reason: string, number?: number): never => {
  throw new Error(
    `playback: metadata mismatch reason=${reason}${number === undefined ? '' : ` hymn=${number}`} regenerate="${regenerate}"`,
  );
};
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
  for (const file of [
    './sources.ts',
    './source-text.ts',
    './playback.ts',
    '../package.json',
    '../../../bun.lock',
  ])
    hash.update(readFileSync(new URL(file, import.meta.url)));
  for (const name of ['syllable', 'cmu-pronouncing-dictionary'])
    hash.update(readFileSync(new URL(import.meta.resolve(name))));
  hash.update(readFileSync(new URL('./problematic.js', import.meta.resolve('syllable'))));
  return hash.digest('hex');
};
const fingerprint = (number: number) => {
  const midi = readFileSync(join(data, `midi/${pad(number)}.mid`));
  return { midi, sourceHash: corpusHash(number) };
};
const corpusHash = (number: number) => {
  const corpus = readFileSync(join(data, `sdah-1985/${pad(number)}.json`));
  return new Bun.CryptoHasher('sha256').update(corpus).digest('hex');
};
const fingerprints = () =>
  new Map(Array.from({ length: 695 }, (_, i) => [i + 1, fingerprint(i + 1)]));
const ownSource = (sources: ReturnType<typeof fingerprints>, number: number) => {
  const source = sources.get(number);
  return source === undefined ? mismatch('source', number) : source;
};

/** Both native and web build derivations use the same checked numeric join. */
export const readPlayback = (hymns: readonly Hymn[]): readonly Hymn[] => {
  const decodedManifest = Result.try(() =>
    decodeManifest(readFileSync(join(folder, 'manifest.json'), 'utf8')),
  );
  if (Result.isFailure(decodedManifest)) return mismatch('manifest');
  const manifest = decodedManifest.success;
  const overrides = new Set(manifest.overrides);
  return hymns.map((hymn) => {
    // The corpus check proves every other sidecar equals the existing numeric
    // projection. Its own digest is checked by the fast package storage guard.
    if (!overrides.has(hymn.number)) return hymn;
    const raw = Result.try(() => ({
      sourceHash: corpusHash(hymn.number),
      text: readFileSync(join(folder, `${pad(hymn.number)}.json`), 'utf8'),
    }));
    if (Result.isFailure(raw)) return mismatch('file', hymn.number);
    const decoded = decodePlayback(raw.success.text).pipe(
      Effect.mapError(() => ({ reason: 'schema' })),
    );
    const joined = decoded.pipe(
      Effect.flatMap((metadata) => applyMetadata(hymn, metadata, raw.success.sourceHash)),
      Effect.result,
    );
    const result = Effect.runSync(joined);
    if (result._tag === 'Failure') return mismatch(result.failure.reason, hymn.number);
    return result.success;
  });
};

const validPlacementTargets = (hymn: Hymn, placements: Placements) => {
  const parts = [...hymn.stanzas, ...(hymn.refrain === undefined ? [] : [hymn.refrain.part])];
  for (const changes of [placements.file, placements.simpler]) {
    if (new Set(changes.map(([p, l, k]) => `${p}:${l}:${k}`)).size !== changes.length) return false;
    for (const [p, l, k] of changes) {
      const part = parts[p];
      if (part?._tag !== 'Sung' || part.lines[l]?.[k] === undefined) return false;
    }
  }
  return true;
};

/** Numeric placement alternatives for the shared native/web chord bundle. */
export const readPlacementPatches = (hymns: readonly Hymn[]): ReadonlyMap<number, Placements> => {
  const decodedManifest = Result.try(() =>
    decodeManifest(readFileSync(join(folder, 'manifest.json'), 'utf8')),
  );
  if (Result.isFailure(decodedManifest)) return mismatch('manifest');
  const manifest = decodedManifest.success;
  const rows = new Map<number, Placements>();
  for (const number of manifest.placements ?? []) {
    const hymn = hymns.find((hymn) => hymn.number === number);
    if (hymn === undefined) return mismatch('shape', number);
    const raw = Result.try(() =>
      readFileSync(join(folder, `${pad(number)}.placements.json`), 'utf8'),
    );
    if (Result.isFailure(raw)) return mismatch('file', number);
    const decoded = decodePlacement(raw.success);
    if (decoded._tag === 'None') return mismatch('schema', number);
    if (decoded.value.sourceHash !== corpusHash(number)) return mismatch('source', number);
    const placements = decoded.value.placements;
    if (!validPlacementTargets(hymn, placements)) return mismatch('cuts', number);
    rows.set(number, placements);
  }
  return rows;
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
    levels: parts.map((part) => (part._tag === 'Plain' ? 0 : part.level === 'line' ? 1 : 2)),
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
  // Build reads do not evaluate the compiler or pronunciation dictionary modules.
  const [{ compilePlacements }, { decodeOrders, sourceOf }, { decodeSourceText }] =
    await Promise.all([loadCompiler(), loadSources(), loadSourceText()]);
  const source = textBytes(),
    fixes = fixesBytes();
  const sources = fingerprints();
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
  const placementNumbers: number[] = [];
  for (const row of decoded.hymns.filter((row) => row.number <= 695)) {
    const { midi, sourceHash } = ownSource(sources, row.number);
    const modes = Effect.runSync(
      sourceOf({ ...row, name: row.title }, midi, orders).pipe(Effect.flatMap(compilePlacements)),
    );
    const hymn = modes.beat;
    const metadata = Effect.runSync(metadataOf(hymn, sourceHash));
    const placements = {
      file: placementPatches(hymn, modes.file),
      simpler: placementPatches(hymn, modes.simpler),
    };
    const hasPlacements = placements.file.length > 0 || placements.simpler.length > 0;
    if (hasPlacements) placementNumbers.push(row.number);
    writeFileSync(join(out, `${pad(row.number)}.json`), `${JSON.stringify(metadata)}\n`);
    writeFileSync(
      join(out, `${pad(row.number)}.placements.json`),
      `${JSON.stringify({ sourceHash, placements })}\n`,
    );
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
  writeFileSync(
    join(out, 'manifest.json'),
    `${JSON.stringify({ version: 1, inputsHash: inputs, overrides: census.filter((row) => row.changed).map((row) => row.number), placements: placementNumbers })}\n`,
  );
  return summary;
};

if (import.meta.main) {
  const flag = process.argv.indexOf('--out');
  const summary = await generatePlayback(flag < 0 ? folder : process.argv[flag + 1]);
  console.log(
    `P3 generated hymns=${summary.hymns} syllables=${summary.syllables} melismas=${summary.melismas} shared=${summary.shared} affected=${summary.affectedHymns}`,
  );
}
