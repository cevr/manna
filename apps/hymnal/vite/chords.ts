/* oxlint-disable effect/noGlobals, effect/noNewError -- a build-time host script: the bundler plugin runs it under Bun and reads its JSON from standard output, and the build fails naming the hymn the encoding cannot carry. */

/**
 * Every compiled hymn's chords as the app carries them: `[number, string]`
 * in number order, each string the hymn's parts and guitar chords in the
 * encoding `src/hymns/chords.ts` decodes. Read by the `virtual:hymnal-chords`
 * plugin (`hymnal.ts`) and by the app's tests; the compiled set is read as
 * `words.ts` reads it, and the build fails on a hymn it cannot encode.
 */

import { Option } from 'effect';
import { readPlayback, readPlacementPatches } from '@manna/hymnal/playback/build';
import type { Hymn } from '@manna/hymnal/hymn';

import { encodeHymn } from '../src/hymns/chords';
import { readHymns } from './words';

let playback = Option.none<readonly Hymn[]>();
let chords = Option.none<ReadonlyArray<readonly [number, string]>>();

/** One checked numeric source for both chord and follow derivations. */
export const readPlaybackHymns = (): readonly Hymn[] => {
  if (Option.isNone(playback)) playback = Option.some(readPlayback(readHymns()));
  return Option.getOrThrow(playback);
};

export const readChords = (): ReadonlyArray<readonly [number, string]> => {
  if (Option.isNone(chords)) {
    const placements = readPlacementPatches(readPlaybackHymns());
    chords = Option.some(
      readPlaybackHymns().map(
        (hymn) =>
          [
            hymn.number,
            Option.getOrThrowWith(
              encodeHymn(hymn, placements.get(hymn.number)),
              () =>
                new Error(
                  `hymnal: hymn ${hymn.number} has a syllable the chord encoding cannot carry`,
                ),
            ),
          ] as const,
      ),
    );
  }
  return Option.getOrThrow(chords);
};

if (import.meta.main) process.stdout.write(JSON.stringify(readChords()));
