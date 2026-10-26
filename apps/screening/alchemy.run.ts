/**
 * The screening site on Cloudflare, declared as an Alchemy stack: the Worker
 * that serves the site (`src/worker/Site.ts`), read-only, and the desk the
 * publisher writes through (`src/worker/Desk.ts`), both over one private R2
 * bucket, and the desk's secret (`src/worker/bucket.ts`).
 *
 *   bun run plan                 what a prod deploy would change
 *   bun run deploy               prod: films.cvr.im (the owner's call)
 *   bun run keys [--stage s]     the site's and the desk's URLs and the secret into the publisher's .env
 *
 * A throwaway stage (`bunx alchemy deploy alchemy.run.ts --stage agent-screening`)
 * gets its own Workers on `workers.dev` URLs, its own bucket and secret, all
 * deleted by its `destroy`.
 *
 * State is local (`.alchemy/`, git-ignored): `prod` is deployed from the main
 * checkout, whose state alone records it. The outputs carry the secret as
 * `Redacted`; the deploy prints it as `<redacted>`, and only
 * `scripts/keys.ts` unwraps it, into `.env`.
 */
import * as Alchemy from 'alchemy';
import * as Cloudflare from 'alchemy/Cloudflare';
import { Effect } from 'effect';

import { DeskToken } from './src/worker/bucket.ts';
import Desk from './src/worker/Desk.ts';
import Site from './src/worker/Site.ts';

export default Alchemy.Stack(
  'screening',
  { providers: Cloudflare.providers(), state: Alchemy.localState() },
  Effect.gen(function* () {
    const site = yield* Site;
    const desk = yield* Desk;
    const token = yield* DeskToken;
    return { url: site.url, desk: desk.url, token: token.text };
  }),
);
