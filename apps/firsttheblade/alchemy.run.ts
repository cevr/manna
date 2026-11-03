import * as Alchemy from 'alchemy';
import * as Cloudflare from '@alchemy.run/cloudflare';
import { Effect } from 'effect';

import { prodGate } from './kit/shippable.ts';
import { prodStateGate } from './scripts/prod-state.ts';
import { MailDomain } from './src/worker/domain.ts';
import Site from './src/worker/Site.ts';

export default Alchemy.Stack(
  'firsttheblade',
  {
    providers: Cloudflare.providers(),
    state: Alchemy.localState(),
  },
  Effect.gen(function* () {
    yield* prodStateGate().pipe(Effect.orDie);
    yield* prodGate(import.meta.dir).pipe(Effect.orDie);
    const mail = yield* MailDomain;
    const site = yield* Site;
    return { url: site.url, urls: site.urls, sending: mail.sending };
  }),
);
