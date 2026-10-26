/**
 * The screening site on Cloudflare, declared as an Alchemy stack: the Worker
 * that serves the site (`src/worker/Site.ts`) over a private R2 bucket, and
 * the bucket-scoped key the publisher writes with (`src/worker/bucket.ts`).
 *
 *   bun run plan                 what a prod deploy would change
 *   bun run deploy               prod: films.cvr.im (the owner's call)
 *   bun run keys [--stage s]     the key pair, bucket and URL into the publisher's .env
 *
 * A throwaway stage (`bunx alchemy deploy alchemy.run.ts --stage agent-screening`)
 * gets its own Worker on a `workers.dev` URL, its own bucket and key, all
 * deleted by its `destroy`.
 *
 * State is local (`.alchemy/`, git-ignored): `prod` is deployed from the main
 * checkout, whose state alone records it. The outputs carry the token's value
 * as `Redacted`; the deploy prints it as `<redacted>`, and only
 * `scripts/keys.ts` unwraps it, into `.env`.
 */
import * as Alchemy from 'alchemy';
import * as Cloudflare from 'alchemy/Cloudflare';
import { Effect } from 'effect';

import { PublishKey, Shelf } from './src/worker/bucket.ts';
import Site from './src/worker/Site.ts';

export default Alchemy.Stack(
  'screening',
  { providers: Cloudflare.providers(), state: Alchemy.localState() },
  Effect.gen(function* () {
    const bucket = yield* Shelf;
    const site = yield* Site;
    const { key, accountId } = yield* PublishKey;
    return {
      url: site.url,
      bucket: bucket.bucketName,
      accountId,
      keyId: key.tokenId,
      token: key.value,
    };
  }),
);
