import type { Answer, Sources } from './app.contract.d.ts';
import nearest from './src/abouthymn/nearest.gen';
import { chordsFirstUse } from './src/chords/first-use.ts';
import { chordsLoader } from './src/chords/load.ts';
import { book } from './src/hymns/book.ts';
import timing from './src/player/timing.gen';
import { sourcesAt } from './src/sources.ts';
import { mic } from './src/tuner/mic.ts';
import { tunerSources } from './src/tuner/sources.ts';

/**
 * Where the recordings are served: the bucket, unless a development build
 * names a loopback fixture (`HYMNAL_RECORDINGS`, which `bun run exact` sets
 * to the checkout's own fixture for `test`, `verify` and `agent`; README
 * "The player"). The player takes no other origin (`originOf`).
 */
const origin = import.meta.env.HYMNAL_RECORDINGS ?? 'https://hymns.cvr.im';

/**
 * The player asks a failed recording's address once, to say why it failed,
 * and the saved recordings fetch whole recordings: the bucket's, or the
 * fixture's in a development build. Search reads the meaning table the iOS
 * app ships (src/results/table.ts), and the follow each hymn's words' times
 * it ships, at the hymn's first use (src/timing/sources.ts), as the hymn
 * page, the key button and the player sheet each hymn's chords
 * (src/chords/load.ts). The saved recordings live in the app's
 * own files (src/offline/sources.ts). The tuner hears the microphone, its
 * prompt in the current app's words (`tunerPurpose`, strings/en.json).
 */
export const grants = {
  'https://hymns.cvr.im': [
    'net.fetch https://hymns.cvr.im',
    'fs.read bundle:/Resources/meaning',
    'fs.read bundle:/Resources/timing',
    'fs.read bundle:/Resources/chords',
    'fs.read app:/data',
    'fs.write app:/data',
    'device.microphone tunerPurpose',
  ],
  'http://127.0.0.1:4797': [
    'net.fetch http://127.0.0.1:4797',
    'fs.read bundle:/Resources/meaning',
    'fs.read bundle:/Resources/timing',
    'fs.read bundle:/Resources/chords',
    'fs.read app:/data',
    'fs.write app:/data',
    'device.microphone tunerPurpose',
  ],
};

const chords = chordsLoader();
const answered = sourcesAt(origin, timing, chords.kept, nearest);

const sources: Sources = {
  ...answered,
  ...chordsFirstUse(book, chords, answered),
  ...tunerSources(mic),
};
export const answer: Answer = (source, args, store, storage, native) =>
  sources[source](args, store, storage, native);
