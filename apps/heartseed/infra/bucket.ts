/**
 * The natural voice's model mirror: R2 `heartseed-models`, served publicly at
 * the manifest's mirror host (`src/natural/manifest.ts`, `MIRROR`), never at
 * the rate-limited `r2.dev` host.
 *
 * The bucket outlives any one deploy: the pinned files are copied in once by
 * `bun run models:copy`, not by the stack, so the bucket is adopted when it
 * exists and retained when the stack is destroyed. It has no CORS, because
 * only the native app reads it, and no lifecycle rules: a key is never
 * replaced or expired, and a new revision is a new folder.
 */
import * as Alchemy from 'alchemy';
import * as Cloudflare from '@alchemy.run/cloudflare';

import { MIRROR } from '../src/natural/manifest.ts';

export const Models = Cloudflare.R2.Bucket('Models', {
  name: 'heartseed-models',
  domains: [{ name: new URL(MIRROR).host }],
  publicAccess: false,
}).pipe(Alchemy.AdoptPolicy.adopt(true), Alchemy.RemovalPolicy.retain());
