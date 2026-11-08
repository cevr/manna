/**
 * The copy of the mirror's files into the R2 bucket, after the hymnal's
 * `audio:upload`:
 *
 * 1. Fill the cache from Hugging Face (`fillWith` over `fetchPinned`): a
 *    cached file at its size and SHA-256 is kept, any other fetched and
 *    checked, and the first failure fails the run before any R2 call.
 * 2. List the prefix once.
 * 3. Plan each file from its cached bytes' MD5 (`planCopy`): keep, upload,
 *    or conflict, which is never put.
 * 4. Upload, 4 at a time, with the mirror's headers. R2's answer must carry
 *    the file's size and MD5, else the file is failed; a failed file never
 *    stops the others.
 * 5. List the prefix again: a file is verified when R2 holds it at its size
 *    and MD5 (a failed listing verifies none).
 *
 * A run succeeds only when every file is verified and none is in conflict or
 * failed. Keys outside the list are never touched, and nothing is deleted: a
 * rerun fetches only what the cache lacks and puts only what R2 lacks.
 *
 * A dry run fills and checks the cache alone: it asks for no `Target`, so it
 * never reads the profile or calls R2.
 */
import { Console, Effect, FileSystem, Path, Schema } from 'effect';
import { Digest } from 'effect/crypto';

import { fillWith } from '../../scripts/natural-serve.ts';
import type { ModelFile } from '../../src/natural/module.ts';
import type { Cached, MirrorObject } from './plan.ts';
import { CACHE_CONTROL, CONTENT_TYPE, CopyItem, PREFIX, holds, planCopy } from './plan.ts';
import { fetchPinned } from './source.ts';
import { Target } from './stores.ts';

/** The run ended with a file failed, in conflict or not verified. */
export class CopyIncomplete extends Schema.TaggedError<CopyIncomplete>()('CopyIncomplete', {
  fetched: Schema.Finite,
  kept: Schema.Finite,
  uploaded: Schema.Finite,
  conflict: Schema.Finite,
  failed: Schema.Finite,
  verified: Schema.Finite,
  of: Schema.Finite,
}) {
  override get message() {
    return `models copy incomplete: failed=${this.failed} conflict=${this.conflict} verified=${this.verified}/${this.of}; run it again to resume, and for a conflict publish under a new revision`;
  }
}

/** What became of one file in a run. */
type Outcome = 'kept' | 'uploaded' | 'conflict' | 'failed';

const totalOf = (files: ReadonlyArray<ModelFile>) =>
  files.reduce((sum, file) => sum + file.bytes, 0);

/** The cache filled with `files`, every one checked: the paths fetched. */
const fillCache = (cache: string, files: ReadonlyArray<ModelFile>) =>
  fillWith(cache, files, fetchPinned);

/** Each cached file with its bytes' MD5. */
const readCached = (cache: string, files: ReadonlyArray<ModelFile>) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const digest = yield* Digest.Digest;
    return yield* Effect.forEach(files, (file) =>
      Effect.map(
        Effect.flatMap(fs.readFile(path.join(cache, file.path)), (bytes) =>
          digest.digestHex(Digest.md5, bytes),
        ),
        (md5): Cached => ({ file, md5 }),
      ),
    );
  });

const unquote = (etag: string) => etag.replaceAll('"', '');

/** Put one cached file and hold R2's answer to its size and MD5; any failure fails this file alone. */
const upload = (
  cache: string,
  file: ModelFile,
  key: string,
  md5: string,
): Effect.Effect<Outcome, never, FileSystem.FileSystem | Path.Path | Target> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const target = yield* Target;
    const bytes = yield* fs.readFile(path.join(cache, file.path));
    const stored = yield* target.put(key, bytes, {
      contentType: CONTENT_TYPE,
      cacheControl: CACHE_CONTROL,
    });
    if (!holds(stored, file.bytes, md5)) {
      yield* Console.log(
        `failed ${file.path} r2 stored etag ${unquote(stored.etag)} size ${stored.size}, expected md5 ${md5} size ${file.bytes}`,
      );
      return 'failed';
    }
    yield* Console.log(`upload ${file.path} ${file.bytes}`);
    return 'uploaded';
  }).pipe(
    Effect.catch((error) =>
      Console.log(`failed ${file.path} ${error.message.replaceAll('\n', ' ')}`).pipe(
        Effect.as<Outcome>('failed'),
      ),
    ),
  );

const act =
  (cache: string) =>
  (item: CopyItem): Effect.Effect<Outcome, never, FileSystem.FileSystem | Path.Path | Target> =>
    CopyItem.$match(item, {
      Keep: () => Effect.succeed<Outcome>('kept'),
      Upload: ({ file, key, md5 }) => upload(cache, file, key, md5),
      Conflict: ({ file, key, held }) =>
        Console.log(
          `conflict ${file.path} r2 holds ${key} as etag ${unquote(held.etag)} size ${held.size}: never replaced; publish under a new revision`,
        ).pipe(Effect.as<Outcome>('conflict')),
    });

/** The files R2 holds at their size and MD5, by a second listing. */
const verify = (cached: ReadonlyArray<Cached>) =>
  Effect.gen(function* () {
    const target = yield* Target;
    const listed = yield* target
      .list(PREFIX)
      .pipe(
        Effect.catchTag('StoreFailed', (error) =>
          Console.log(`failed verify ${error.message}`).pipe(
            Effect.as(new Map<string, MirrorObject>()),
          ),
        ),
      );
    return planCopy(cached, listed).filter(CopyItem.$is('Keep')).length;
  });

/** Fill and check the cache, R2 never. */
export const dryRun = (cache: string, files: ReadonlyArray<ModelFile>) =>
  Effect.gen(function* () {
    const fetched = (yield* fillCache(cache, files)).length;
    const bytes = totalOf(files);
    yield* Console.log(
      `models-copy dry-run files=${files.length} bytes=${bytes} fetched=${fetched} target=unread`,
    );
    return { fetched, of: files.length, bytes };
  });

/** Fill the cache, upload every file R2 lacks, then check R2 holds them all. */
export const run = (cache: string, files: ReadonlyArray<ModelFile>) =>
  Effect.gen(function* () {
    const fetched = (yield* fillCache(cache, files)).length;
    const target = yield* Target;
    const listed = yield* target.list(PREFIX);
    const cached = yield* readCached(cache, files);
    const outcomes = yield* Effect.forEach(planCopy(cached, listed), act(cache), {
      concurrency: 4,
    });
    const count = (outcome: Outcome) => outcomes.filter((each) => each === outcome).length;
    const verified = yield* verify(cached);
    const counts = {
      fetched,
      kept: count('kept'),
      uploaded: count('uploaded'),
      conflict: count('conflict'),
      failed: count('failed'),
      verified,
      of: files.length,
    };
    yield* Console.log(
      `models-copy run files=${files.length} bytes=${totalOf(files)} fetched=${fetched} target=kept ${counts.kept} uploaded ${counts.uploaded} conflict ${counts.conflict} failed ${counts.failed} verified ${verified}/${files.length}`,
    );
    if (verified !== files.length || counts.conflict + counts.failed > 0)
      return yield* CopyIncomplete.make(counts);
    return counts;
  });
