import type { Answer, Sources } from './app.contract.d.ts';
import timing from './src/player/timing.gen';
import { sourcesAt } from './src/sources.ts';

/**
 * Where the recordings are served: the bucket, unless a development build
 * names a loopback fixture (`HYMNAL_RECORDINGS`, README "The player"). The
 * player takes no other origin (`originOf`).
 */
const origin = import.meta.env.HYMNAL_RECORDINGS ?? 'https://hymns.cvr.im';

/** The player asks a failed recording's address once, to say why it failed: the bucket's, or the fixture's in a development build. */
export const grants = {
  'https://hymns.cvr.im': 'net.fetch https://hymns.cvr.im',
  'http://127.0.0.1:4797': 'net.fetch http://127.0.0.1:4797',
};

const sources: Sources = sourcesAt(origin, timing);
export const answer: Answer = (source, args, store, storage, native) =>
  sources[source](args, store, storage, native);
