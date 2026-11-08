/**
 * Where the model files come from, for both tools that fill a cache with
 * them: the development server (`scripts/natural-serve.ts`) and the copy to
 * the mirror (`./job.ts`). Hugging Face, at the pinned revision, with no
 * retry (a rerun resumes from the cache).
 *
 * The download's files are FluidInference's `ANE/<path>`. FluidInference
 * ships no `am_michael.bin`, so that one is converted on this machine from
 * the same revision's `voices/am_michael.json` (`./voice-pack.ts`); a JSON
 * that does not convert is refused as `FileMismatch`, as a file whose bytes
 * differ is. The fill (`fillWith`) then checks every answer's size and
 * SHA-256 against its pin, converted or not.
 */
import { Effect, Schema } from 'effect';
import { HttpClient } from 'effect/http';

import { AM_MICHAEL, SOURCE_REVISION } from '../../src/natural/manifest.ts';
import type { ModelFile } from '../../src/natural/module.ts';
import { voicePackOf } from './voice-pack.ts';

/** Where Hugging Face keeps a pinned file. */
export const sourceOf = (path: string): string =>
  `https://huggingface.co/FluidInference/kokoro-82m-coreml/resolve/${SOURCE_REVISION}/ANE/${path}`;

/** The second voice's rows at the pinned revision, from which its pack is converted. */
export const VOICE_ROWS = `https://huggingface.co/FluidInference/kokoro-82m-coreml/resolve/${SOURCE_REVISION}/voices/am_michael.json`;

/** A fetched file was not the pinned one: its size or SHA-256 differs, or its rows do not convert. */
export class FileMismatch extends Schema.TaggedError<FileMismatch>()('FileMismatch', {
  path: Schema.String,
}) {}

/** The body of a GET of `url`, any status but 2xx a failure. */
const get = (url: string) =>
  Effect.gen(function* () {
    const client = HttpClient.filterStatusOk(yield* HttpClient.HttpClient);
    const response = yield* client.get(url);
    return new Uint8Array(yield* response.arrayBuffer);
  });

/** A file's bytes as the pinned revision gives them, `am_michael.bin` converted from its rows. */
export const fetchPinned = (file: ModelFile) =>
  Effect.gen(function* () {
    if (file.path !== AM_MICHAEL.path) return yield* get(sourceOf(file.path));
    const rows = yield* get(VOICE_ROWS);
    return yield* Effect.fromOption(voicePackOf(rows)).pipe(
      Effect.mapError(() => FileMismatch.make({ path: file.path })),
    );
  });
