import * as Alchemy from 'alchemy';
import * as Cloudflare from '@alchemy.run/cloudflare';
import { Stage } from 'alchemy/Stage';
import { Effect, Schema } from 'effect';

import { Hymns } from './infra/bucket.ts';
import { HYMNS_ORIGIN } from './src/remote.ts';

class StageRefused extends Schema.TaggedError<StageRefused>()('StageRefused', {
  stage: Schema.String,
}) {
  override get message() {
    return `the hymnal stack has only the stage prod, not ${this.stage}: its bucket and domain are fixed (--stage prod)`;
  }
}

export default Alchemy.Stack(
  'hymnal',
  { providers: Cloudflare.providers(), state: Cloudflare.state() },
  Effect.gen(function* () {
    const stage = yield* Stage;
    if (stage !== 'prod') return yield* Effect.die(StageRefused.make({ stage }));
    const bucket = yield* Hymns;
    return { bucket: bucket.bucketName, url: HYMNS_ORIGIN };
  }),
);
