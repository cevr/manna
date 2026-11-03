import * as Alchemy from 'alchemy';
import * as Cloudflare from '@alchemy.run/cloudflare';
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
