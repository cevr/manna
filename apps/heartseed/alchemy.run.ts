/**
 * Heartseed's cloud, declared as an Alchemy stack: one R2 bucket that serves
 * the natural voice's pinned model files at the manifest's mirror
 * (`infra/bucket.ts`, `src/natural/manifest.ts`).
 *
 * Only `prod` exists. The bucket's name and domain are fixed, so a second
 * stage would adopt the same bucket and domain; any other stage is refused.
 * `bun run plan` and `bun run deploy` run it from this directory. State lives
 * in the Cloudflare state store, so every machine sees the same resources.
 *
 * The model files are not part of the stack: `bun run models:copy` copies
 * them into the bucket (`infra/models/copy.ts`).
 */
import * as Alchemy from 'alchemy';
import * as Cloudflare from '@alchemy.run/cloudflare';
import { Stage } from 'alchemy/Stage';
import { Effect, Schema } from 'effect';

import { Models } from './infra/bucket.ts';
import { MIRROR } from './src/natural/manifest.ts';

class StageRefused extends Schema.TaggedError<StageRefused>()('StageRefused', {
  stage: Schema.String,
}) {
  override get message() {
    return `the heartseed stack has only the stage prod, not ${this.stage}: its bucket and domain are fixed (--stage prod)`;
  }
}

export default Alchemy.Stack(
  'heartseed',
  { providers: Cloudflare.providers(), state: Cloudflare.state() },
  Effect.gen(function* () {
    const stage = yield* Stage;
    if (stage !== 'prod') return yield* Effect.die(StageRefused.make({ stage }));
    const bucket = yield* Models;
    return { bucket: bucket.bucketName, url: MIRROR };
  }),
);
