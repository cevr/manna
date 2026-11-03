/**
 * Builds the meaning table the app ships (`table.ts` says the format): the
 * pinned EmbeddingGemma run on every word of the table alone, and on every
 * hymn's title and words, cut to 4 and 8 bits.
 *
 *   bun scripts/meaning/build.ts --out <file> [--cache <dir>]
 *
 * The model, the word list and the runtime go into the cache (by default
 * `<tmpdir>/manna-meaning`), never the repository: a cache inside the
 * repository, or under `~/.bible`, is refused. Each file is checked against
 * its pinned SHA-256 (`pins.ts`). The runtime runs on a fixed number of
 * threads with fixed batches, so two builds write the same bytes.
 */

import { readdirSync, readFileSync, realpathSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';

import { Schema } from 'effect';

import { Hymn, sung } from '../../src/hymn.js';
import { fetchSource } from './fetch';
import {
  BATCH,
  DIMS,
  documentPrompt,
  MODEL,
  queryPrompt,
  RUNTIME,
  THREADS,
  VOCABULARY,
} from './pins';
import { meaningFileOf, textOf, vocabularyOf, wordsOf } from './table';

const argument = (name: string): string | undefined => {
  const at = process.argv.indexOf(name);
  return at < 0 ? undefined : process.argv[at + 1];
};

const repository = resolve(import.meta.dir, '../../../..');
const sdah = join(import.meta.dir, '../../data/sdah-1985');

/** The cache, made and checked: outside the repository and outside `~/.bible`. */
const cacheOf = (path: string): string => {
  mkdirSync(path, { recursive: true });
  const real = realpathSync(path);
  const root = realpathSync(repository);
  if (real === root || real.startsWith(`${root}${sep}`))
    throw new Error(`meaning: the cache ${real} lies in the repository`);
  if (real.split(sep).includes('.bible'))
    throw new Error(`meaning: the cache ${real} lies in ~/.bible`);
  return real;
};

/** Every compiled hymn: its number, and its title and words (each line once, in sung order). */
const readHymns = () =>
  readdirSync(sdah)
    .filter((name) => /^\d{3}\.json$/.test(name))
    .toSorted()
    .map((name) => {
      const hymn = Schema.decodeSync(Schema.fromJsonString(Hymn))(
        readFileSync(join(sdah, name), 'utf8'),
      );
      const text = [...new Set(sung(hymn).map((line) => line.text))].join('\n');
      return { number: hymn.number, title: hymn.title, text };
    });

/** The pinned runtime in `<cache>/runtime`, installed with a home of its own; the path transformers.js loads from. */
const installRuntime = (cache: string): string => {
  const folder = join(cache, 'runtime');
  mkdirSync(join(cache, 'home'), { recursive: true });
  mkdirSync(folder, { recursive: true });
  writeFileSync(
    join(folder, 'package.json'),
    `${JSON.stringify({ name: 'manna-meaning-runtime', private: true, ...RUNTIME }, null, 2)}\n`,
  );
  const install = Bun.spawnSync(['bun', 'install'], {
    cwd: folder,
    env: { ...process.env, HOME: join(cache, 'home') },
    stdout: 'inherit',
    stderr: 'inherit',
  });
  if (install.exitCode !== 0)
    throw new Error(`meaning: the runtime install exited ${install.exitCode}`);
  const pinned = [
    ['@huggingface/transformers', RUNTIME.dependencies['@huggingface/transformers']],
    ...Object.entries(RUNTIME.overrides),
  ];
  for (const [name, version] of pinned) {
    const installed = JSON.parse(
      readFileSync(join(folder, 'node_modules', name ?? '', 'package.json'), 'utf8'),
    ).version;
    if (installed !== version)
      throw new Error(`meaning: ${name} ${installed} installed, ${version} pinned`);
  }
  return Bun.resolveSync('@huggingface/transformers', folder);
};

const out = argument('--out');
if (out === undefined) throw new Error('meaning: --out <file> names the file to write');
const cache = cacheOf(resolve(argument('--cache') ?? join(tmpdir(), 'manna-meaning')));

const hymns = readHymns();
const counts = new Map<string, number>();
for (const hymn of hymns)
  for (const word of wordsOf(`${hymn.title} ${hymn.text}`))
    counts.set(word, (counts.get(word) ?? 0) + 1);

await fetchSource(cache, MODEL);
const list = readFileSync(join(await fetchSource(cache, VOCABULARY), 'vocab.txt'), 'utf8')
  .split('\n')
  .map((line) => line.trim());
const vocabulary = vocabularyOf(list, counts.keys());

const transformers = await import(installRuntime(cache));
transformers.env.localModelPath = `${cache}${sep}`;
transformers.env.allowRemoteModels = false;
transformers.env.allowLocalModels = true;
const tokenizer = await transformers.AutoTokenizer.from_pretrained(MODEL.repo, {
  local_files_only: true,
});
const model = await transformers.AutoModel.from_pretrained(MODEL.repo, {
  dtype: 'fp32',
  local_files_only: true,
  session_options: { intraOpNumThreads: THREADS, interOpNumThreads: 1 },
});

/** The model's unit vectors for `texts`, `batch` at a time, in one array. */
const embed = async (what: string, texts: ReadonlyArray<string>, batch: number) => {
  const rows = new Float32Array(texts.length * DIMS);
  const started = performance.now();
  for (let i = 0; i < texts.length; i += batch) {
    const inputs = tokenizer(texts.slice(i, i + batch), {
      padding: true,
      truncation: true,
      max_length: 512,
    });
    const { sentence_embedding } = await model(inputs);
    rows.set(sentence_embedding.data as Float32Array, i * DIMS);
    if ((i / batch) % 50 === 0)
      console.error(
        `[meaning] embed ${what} done=${i} of=${texts.length} s=${Math.round((performance.now() - started) / 1000)}`,
      );
  }
  return rows;
};

const wordRows = await embed('words', vocabulary.map(queryPrompt), BATCH);
const hymnRows = await embed(
  'hymns',
  hymns.map((hymn) => documentPrompt(hymn.title, hymn.text)),
  8,
);
const text = textOf(
  meaningFileOf({
    source: `${MODEL.repo}@${MODEL.revision} fp32; words: ${VOCABULARY.repo}@${VOCABULARY.revision} and the hymnal words`,
    dims: DIMS,
    vocabulary,
    counts,
    wordRows,
    numbers: hymns.map((hymn) => hymn.number),
    hymnRows,
  }),
);
mkdirSync(dirname(resolve(out)), { recursive: true });
writeFileSync(resolve(out), text);
const sha256 = new Bun.CryptoHasher('sha256').update(text).digest('hex');
console.log(
  `[meaning] wrote file=${out} words=${vocabulary.length} hymns=${hymns.length} bytes=${text.length} sha256=${sha256}`,
);
