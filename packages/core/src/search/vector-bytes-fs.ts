/** Reading the installed vector index through Effect's `FileSystem` (§9.6).
 *
 *  Portable core, despite being the filesystem path: `FileSystem` is an Effect
 *  interface, so a host shares one reader rather than writing a `readFile` that
 *  could disagree about what an absent file means — which is the whole risk
 *  here, since "not installed" is this artifact's *normal* state.
 */

import { Effect, FileSystem, Layer, Option } from 'effect';

import { VectorIndexBytes } from './vector-artifact.js';

/** The bytes of one view, in a buffer of exactly that length. */
const copyToBuffer = (bytes: Uint8Array): ArrayBuffer => {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
};

/** Stat first, then read — the same discipline `layerArtifactOrAbsent` applies
 *  to `topics.db`, and for a sharper reason.
 *
 *  `exists` before `readFile` is not belt-and-braces here. An absent optional
 *  artifact is the common case, and distinguishing it from a *failed read* is
 *  what keeps a 246 MB file that exists-but-cannot-be-read from being reported
 *  as if it were simply not downloaded — the operator-visible difference between
 *  "install it" and "your disk is failing". The result the reader sees is the
 *  same `None` either way (§9.6 gives search one degradation), so the
 *  distinction lives in the log, which is the only place it can act.
 *
 *  Neither branch fails or dies. This artifact's absence is a supported state,
 *  and taking a host down over a stat that only search needed would be the
 *  degradation posture inverted.
 */
export const layerFileVectorIndexBytes = (
  filename: string,
): Layer.Layer<VectorIndexBytes, never, FileSystem.FileSystem> =>
  Layer.effect(
    VectorIndexBytes,
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      return VectorIndexBytes.of({
        read: Effect.gen(function* () {
          const found = yield* fs
            .exists(filename)
            .pipe(
              Effect.catchTag('PlatformError', (cause) =>
                Effect.logWarning('search.vectorIndex.statFailed').pipe(
                  Effect.annotateLogs({ filename, cause: cause.message }),
                  Effect.as(false),
                ),
              ),
            );
          if (!found) return Option.none<ArrayBuffer>();
          return yield* fs.readFile(filename).pipe(
            Effect.map((bytes) => Option.some(copyToBuffer(bytes))),
            Effect.catchTag('PlatformError', (cause) =>
              Effect.logWarning('search.vectorIndex.readFailed').pipe(
                Effect.annotateLogs({ filename, cause: cause.message }),
                Effect.as(Option.none<ArrayBuffer>()),
              ),
            ),
          );
        }),
      });
    }),
  );
