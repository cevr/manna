/** The Bun composition of §9's hybrid search, and the seam a test substitutes.
 *
 *  Its own module rather than the bottom of `search.ts`, because the parity test
 *  in `packages/cli/test/commands/egw-search.test.ts` substitutes the seam and
 *  nothing else; importing `search.ts` to reach it would drag in the printer and
 *  every flag with it.
 *
 *  The pattern is `WikiLayer` / `LookupLayer` / `StudyLayer` (M5-M7): a
 *  `Context.Reference` whose default opens the installed corpora under
 *  `~/.bible`, so a test provides its own layer without the command knowing.
 */

import { EGWParagraphDatabase } from '@manna/core/egw-db';
import * as EGWDbBun from '@manna/core/egw-db/bun';
import {
  layerFileVectorIndexBytes,
  loadVectorIndex,
  ResolvedVectorIndex,
  SearchCorpusSources,
  SearchService,
  VectorIndexBytes,
} from '@manna/core/search';
import { layerBunEmbedder } from '@manna/core/search/bun';
import { BunServices } from '@effect/platform-bun';
import { Config, Context, Effect, Layer, Option, Path } from 'effect';

import { ensureOnnxDylibs } from '../../lib/onnx-dylibs.js';
import {
  CLIENT_FINGERPRINT,
  probeSearchDaemon,
  searchDaemonClientLayer,
  shutdownSearchDaemon,
  spawnSearchDaemon,
} from './search-daemon-client.js';
import { searchDaemonSocketPath } from './search-daemon-protocol.js';

/** Read the gate's decision from the supplied byte source. The source layer is
 *  provided here, at this operation's own boundary. */
const resolveVectorIndex = (source: Layer.Layer<VectorIndexBytes>) =>
  loadVectorIndex.pipe(Effect.provide(source));

export const verifiedVectorIndex = (
  filename: string,
  /** The byte source to gate. Defaults to the real file reader over Bun's
   *  platform services; the F8 counting test substitutes one that records how
   *  many times the artifact is read, which is the only observable that tells a
   *  single startup read apart from two. */
  source: Layer.Layer<VectorIndexBytes> = layerFileVectorIndexBytes(filename).pipe(
    Layer.provide(BunServices.layer),
  ),
): Layer.Layer<ResolvedVectorIndex | VectorIndexBytes> =>
  Layer.unwrap(
    Effect.gen(function* () {
      const loaded = yield* resolveVectorIndex(source);
      if (loaded._tag !== 'index') {
        yield* Effect.logInfo('search.vectorIndex.refused').pipe(
          Effect.annotateLogs({ filename, reason: loaded.absence.reason }),
        );
      }
      return Layer.merge(ResolvedVectorIndex.layerOf(loaded), VectorIndexBytes.None);
    }),
  );

/** The corpus §9 reads, plus the optional index, resolved against `~/.bible`.
 *
 *  One `Layer.unwrap` for both because they share the same two facts — the path
 *  service and `HOME` — and resolving them once is what keeps the file
 *  locations spelled in a single place. */
export const installedSearchLayer: Layer.Layer<SearchService> = Layer.unwrap(
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const home = yield* Config.String('HOME');
    yield* ensureOnnxDylibs;
    const at = (file: string): string => path.join(home, '.bible', file);

    const sources = Layer.effect(
      SearchCorpusSources,
      Effect.gen(function* () {
        return SearchCorpusSources.of({
          _tag: 'wired',
          sources: {
            paragraphs: yield* EGWParagraphDatabase,
          },
        });
      }),
    ).pipe(Layer.provide(EGWDbBun.layerBun(at('egw-paragraphs.db'))), Layer.orDie);

    return SearchService.Live.pipe(
      Layer.provide(sources),
      Layer.provide(verifiedVectorIndex(at('vectors.bvi'))),
      Layer.provide(layerBunEmbedder),
    );
  }).pipe(Effect.provide(BunServices.layer), Effect.orDie),
).pipe(Layer.provide(BunServices.layer));

/** Daemon-first: the same `SearchService`, answered warm when a daemon holds
 *  the loaded model and index, and in-process otherwise.
 *
 *  The decision is one probe against the daemon socket, and every branch of it
 *  lands on a working search:
 *
 *  - a live daemon with **this build's** fingerprint answers the query;
 *  - a live daemon with a different fingerprint is a survivor of an upgrade —
 *    it is retired, a fresh one is spawned for next time, and *this* query
 *    runs in-process (§9.4's fingerprint gate, applied to a process);
 *  - no daemon: one is spawned detached so the *next* invocation is warm, and
 *    this one runs in-process — the first call pays the cold cost it would
 *    have paid anyway, never a spawn-and-wait on top of it.
 *
 *  `BIBLE_SEARCH_DAEMON=off` opts out entirely; the spawn failing (missing
 *  spawner, sandbox) degrades to in-process rather than surfacing. */
const daemonPreferredSearchLayer: Layer.Layer<SearchService> = Layer.unwrap(
  Effect.gen(function* () {
    const setting = yield* Config.option(Config.String('BIBLE_SEARCH_DAEMON'));
    if (Option.exists(setting, (value) => value === 'off')) return installedSearchLayer;
    const home = yield* Config.String('HOME');
    const socketPath = searchDaemonSocketPath(home);
    const resident = yield* probeSearchDaemon(socketPath);
    const matching = Option.filter(resident, (status) => status.fingerprint === CLIENT_FINGERPRINT);
    if (Option.isSome(matching)) return searchDaemonClientLayer(socketPath);
    if (Option.isSome(resident)) yield* shutdownSearchDaemon(socketPath);
    yield* spawnSearchDaemon.pipe(Effect.ignore);
    return installedSearchLayer;
  }).pipe(Effect.provide(BunServices.layer), Effect.orDie),
);

/** The substitution point (§10's host-parity seam).
 *
 *  A `Context.Reference` rather than a plain constant so `runCli` can hand the
 *  command a fixture corpus without the command taking a layer parameter it
 *  would otherwise never vary. */
export class SearchLayer extends Context.Reference<Layer.Layer<SearchService>>(
  '@manna/cli/egw/SearchLayer',
  { defaultValue: () => daemonPreferredSearchLayer },
) {}

/** Runs an effect against whichever `SearchService` is in scope. */
export const searchService = <A, E>(use: Effect.Effect<A, E, SearchService>): Effect.Effect<A, E> =>
  Effect.flatMap(SearchLayer, (layer) => use.pipe(Effect.provide(layer)));
