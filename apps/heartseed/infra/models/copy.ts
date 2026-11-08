/**
 * `bun run models:copy -- --cache <dir> [--dry-run]`: the mirror's 39 files
 * (`MIRROR_FILES`) from Hugging Face into the R2 bucket `heartseed-models`
 * (`./job.ts`), through the cache `--cache`.
 *
 * A dry run fills and checks the cache alone and builds no Cloudflare layer,
 * so it needs no credential. A real run writes with the owner's Alchemy
 * Cloudflare profile (`TargetR2Writes`), which must allow R2 object writes.
 */
import { BunCrypto, BunRuntime, BunServices } from '@effect/platform-bun';
import { Effect, Layer } from 'effect';
import { Command, Flag } from 'effect/cli';
import { FetchHttpClient } from 'effect/http';

import { dryRun, run } from './job.ts';
import { MIRROR_FILES } from './plan.ts';
import { TargetR2Writes } from './r2.ts';
import type { Target } from './stores.ts';

/** What every run reads: Hugging Face and the hashes. */
const Sources = Layer.merge(BunCrypto.layerDigest, FetchHttpClient.layer);

/** The command's arguments, without its handler. */
export const modelsCopyCommand = Command.make('models-copy', {
  cache: Flag.String('cache').pipe(
    Flag.withDescription('Where the checked files are kept (the natural:serve cache)'),
  ),
  dryRun: Flag.Boolean('dry-run').pipe(
    Flag.withDefault(false),
    Flag.withDescription('Fill and check the cache from Hugging Face; never touch R2'),
  ),
}).pipe(
  Command.withDescription(
    'Copy the natural voice’s pinned files from Hugging Face into the R2 bucket heartseed-models',
  ),
);

/** What the command's runner provides: Bun's file system, paths and processes. */
type Host = Layer.Success<typeof BunServices.layer>;

/** What a run is made of: the two jobs over a cache, and the R2 writes a real run adds. */
export interface CopyParts<E, EW> {
  readonly writes: Layer.Layer<Target, EW, Host>;
  readonly dryRun: (
    cache: string,
  ) => Effect.Effect<unknown, E, Host | Layer.Success<typeof Sources>>;
  readonly run: (
    cache: string,
  ) => Effect.Effect<unknown, E, Host | Layer.Success<typeof Sources> | Target>;
}

/**
 * The command whole: `--dry-run` runs `dryRun` over the sources alone, so it
 * never builds `writes`; without it, `run` over the sources and `writes`.
 */
export const modelsCopy = <E, EW>(parts: CopyParts<E, EW>) =>
  modelsCopyCommand.pipe(
    Command.withHandler(({ cache, dryRun: dry }) => {
      if (dry) return Effect.asVoid(parts.dryRun(cache)).pipe(Effect.provide(Sources));
      return Effect.asVoid(parts.run(cache)).pipe(
        Effect.provide(Layer.merge(Sources, parts.writes)),
      );
    }),
  );

if (import.meta.main) {
  Command.run(
    modelsCopy({
      writes: TargetR2Writes,
      dryRun: (cache) => dryRun(cache, MIRROR_FILES),
      run: (cache) => run(cache, MIRROR_FILES),
    }),
    { version: '1.0.0' },
  ).pipe(Effect.provide(BunServices.layer), (program) => BunRuntime.runMain(program));
}
