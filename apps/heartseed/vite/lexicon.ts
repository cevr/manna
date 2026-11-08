/* oxlint-disable effect/noNodeBuiltinImport, effect/noGlobals -- a build-time host script, as passage.ts: the bundler plugin runs it under Bun and reads its standard output, and the test preload calls it synchronously, so it reads the app's data files from disk. */

/**
 * The natural voice's pronunciation list as Heartseed carries it, derived
 * when the app is bundled: the KJV words' phonemes (`data/kjv-phonemes.json`)
 * and Kokoro's vocab (`data/kokoro-vocab.json`), each checked for its shape
 * (a phoneme string per word, a whole id per symbol). Read by the
 * `virtual:heartseed-lexicon` plugin (`plugin.ts`) and by the app's tests;
 * the app reads it through `src/natural/lexicon.ts` alone.
 */

import { readFileSync } from 'node:fs';

import { Schema } from 'effect';

/** The list and the vocab as plain records, the module's default export. */
const Lexicon = Schema.Struct({
  words: Schema.Record(Schema.String, Schema.String),
  vocab: Schema.Record(Schema.String, Schema.Int),
});
export interface Lexicon extends Schema.Schema.Type<typeof Lexicon> {}

const decodeLexicon = Schema.decodeUnknownSync(Lexicon);

const DATA = new URL('../data/', import.meta.url);

/** The lexicon from the two files' text; it throws for a word without a phoneme string or a symbol without a whole id. */
export const lexiconOf = (words: string, vocab: string): Lexicon =>
  decodeLexicon({ words: JSON.parse(words), vocab: JSON.parse(vocab) });

/** The app's lexicon, read from its committed data files. */
export const readLexicon = (): Lexicon =>
  lexiconOf(
    readFileSync(new URL('kjv-phonemes.json', DATA), 'utf8'),
    readFileSync(new URL('kokoro-vocab.json', DATA), 'utf8'),
  );

if (import.meta.main) process.stdout.write(JSON.stringify(readLexicon()));
