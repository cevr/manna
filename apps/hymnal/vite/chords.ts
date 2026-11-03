/* oxlint-disable effect/noGlobals, effect/noNewError -- a build-time host script: the bundler plugin runs it under Bun and reads its JSON from standard output, and the build fails naming the hymn the encoding cannot carry. */

import { Option } from 'effect';
import { readPlayback, readPlacementPatches } from '@manna/hymnal/playback/build';
import type { Hymn } from '@manna/hymnal/hymn';

import { encodeHymn } from '../src/hymns/chords';
import { readHymns } from './words';

let playback = Option.none<readonly Hymn[]>();
let chords = Option.none<ReadonlyArray<readonly [number, string]>>();

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
