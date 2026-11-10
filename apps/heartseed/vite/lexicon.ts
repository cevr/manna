/* oxlint-disable effect/noNodeBuiltinImport, effect/noGlobals -- a build-time host script, as passage.ts: the bundler plugin runs it under Bun and reads its standard output, and the test preload calls it synchronously, so it reads the app's data files from disk. */

/**
 * The natural voice's pronunciation lists as Heartseed carries them, derived
 * when the app is bundled: the KJV words' American phonemes
 * (`data/kjv-phonemes.json`, Her's), their British phonemes
 * (`data/kjv-phonemes-gb.json`, Him's) and Kokoro's vocab
 * (`data/kokoro-vocab.json`), each checked for its shape (a phoneme string
 * per word, a whole id per symbol). Read by the `virtual:heartseed-lexicon`
 * plugin (`plugin.ts`) and by the app's tests; the app reads it through
 * `src/natural/lexicon.ts` alone.
 */

import { readFileSync } from 'node:fs';

import { Schema } from 'effect';

/** Both lists and the vocab as plain records, the module's default export. */
const Words = Schema.Record(Schema.String, Schema.String);
const Lexicon = Schema.Struct({
  lists: Schema.Struct({ us: Words, gb: Words }),
  vocab: Schema.Record(Schema.String, Schema.Int),
});
export interface Lexicon extends Schema.Schema.Type<typeof Lexicon> {}

const decodeLexicon = Schema.decodeUnknownSync(Lexicon);

const DATA = new URL('../data/', import.meta.url);

/** The lexicon from the three files' text; it throws for a word of either list without a phoneme string or a symbol without a whole id. */
export const lexiconOf = (us: string, gb: string, vocab: string): Lexicon =>
  decodeLexicon({ lists: { us: JSON.parse(us), gb: JSON.parse(gb) }, vocab: JSON.parse(vocab) });

/** The app's lexicon, read from its committed data files. */
export const readLexicon = (): Lexicon =>
  lexiconOf(
    readFileSync(new URL('kjv-phonemes.json', DATA), 'utf8'),
    readFileSync(new URL('kjv-phonemes-gb.json', DATA), 'utf8'),
    readFileSync(new URL('kokoro-vocab.json', DATA), 'utf8'),
  );

if (import.meta.main) process.stdout.write(JSON.stringify(readLexicon()));
