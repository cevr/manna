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

/** What every run reads: Hugging Face and the hashes. */
const Sources = Layer.merge(BunCrypto.layerDigest, FetchHttpClient.layer);

const command = Command.make(
  'models-copy',
  {
    cache: Flag.String('cache').pipe(
      Flag.withDescription('Where the checked files are kept (the natural:serve cache)'),
    ),
    dryRun: Flag.Boolean('dry-run').pipe(
      Flag.withDefault(false),
      Flag.withDescription('Fill and check the cache from Hugging Face; never touch R2'),
    ),
  },
  ({ cache, dryRun: dry }) => {
    if (dry) return Effect.asVoid(dryRun(cache, MIRROR_FILES)).pipe(Effect.provide(Sources));
    return Effect.asVoid(run(cache, MIRROR_FILES)).pipe(
      Effect.provide(Layer.merge(Sources, TargetR2Writes)),
    );
  },
).pipe(
  Command.withDescription(
    'Copy the natural voice’s pinned files from Hugging Face into the R2 bucket heartseed-models',
  ),
);

if (import.meta.main) {
  Command.run(command, { version: '1.0.0' }).pipe(Effect.provide(BunServices.layer), (program) =>
    BunRuntime.runMain(program),
  );
}
