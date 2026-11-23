/* oxlint-disable effect/noAsyncFunction, effect/noNullish, effect/noThrowStatement, effect/noNewError -- Exact's data module cannot import effect (docs/exact.md): the package answers Promises, and a stream with no track is the device's refusal, which the session reads as a refused start. */

/**
 * The tuner's microphone through Exact's `@exact/media-capture`, which
 * `app.ts` hands the tuner's sources: its permission as a fact
 * (`microphoneStatus`), a track opened (`getUserMedia`, which asks while
 * the permission is a prompt) and closed (`stopTrack`). The host's audio
 * session owner takes a capture's claim (`.playAndRecord`, in Apple's
 * `measurement` mode, which turns off the input's gain control and voice
 * processing, as the current app's `.measurement` does) and gives the
 * app's own `playback` back when the last track closes, so the session is
 * never left recording after the tuner. The samples are the app module's
 * (`modules/apple/TunerEar.swift`), which holds the track's capture.
 */

import { getUserMedia, microphoneStatus, stopTrack } from '@exact/media-capture';

import type { Mic } from './sources.ts';

export const mic: Mic = {
  status: async () => (await microphoneStatus()).state,
  open: async () => {
    const stream = await getUserMedia({ audio: true, apple: { mode: 'measurement' } });
    const track = stream.tracks[0];
    if (track === undefined) throw new Error('no microphone track');
    return track.id;
  },
  close: async (track) => {
    await stopTrack({ track });
  },
};
