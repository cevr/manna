import * as Alchemy from 'alchemy';
import * as Cloudflare from '@alchemy.run/cloudflare';
import * as Effect from 'effect/Effect';

import { FilmStore } from './infra/store.ts';

export default Alchemy.Stack(
  'film-store',
  { providers: Cloudflare.providers(), state: Alchemy.localState() },
  Effect.gen(function* () {
    const { bucket, key, accountId } = yield* FilmStore;
    return {
      bucket: bucket.bucketName,
      accountId,
      keyId: key.tokenId,
      token: key.value,
    };
  }),
);
