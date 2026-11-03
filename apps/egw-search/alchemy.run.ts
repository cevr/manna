import * as Alchemy from 'alchemy';
import * as Cloudflare from '@alchemy.run/cloudflare';
import { Effect } from 'effect';

import Search from './server/cloudflare/Search.ts';
import Sync from './server/cloudflare/Sync.ts';
import { VectorFilters } from './server/cloudflare/resources.ts';

export const providers = Cloudflare.providers();

export default Alchemy.Stack(
  'egw-search',
  { providers, state: Cloudflare.state() },
  Effect.gen(function* () {
    yield* VectorFilters;
    const search = yield* Search;
    const sync = yield* Sync;
    return { url: search.url, syncWorker: sync.workerName };
  }),
);
