/**
 * Where the hymn recordings are served: the R2 bucket `cvr-hymns` behind its
 * custom domain (`infra/bucket.ts`). The app builds each recording's URL from
 * here, and the stack reads its domain from here, so the address is declared
 * once. It imports only `@manna/hymnal/recordings`, which imports nothing, so
 * Metro, Vite and the infra read it unchanged.
 *
 * Key layout in the bucket:
 * - `audio/<set>/sdah/<n>.mp3`: a rendered set's recording of hymn `n` of
 *   the 1985 SDA Hymnal, the number unpadded. A hymn plays from its set
 *   (`setOf`: `warm-1` for every hymn but 663, which plays from `warm-2`),
 *   the printed key from the set itself, signed offsets from its
 *   up1..6/down1..5 sets; a set is never replaced, only joined by a later
 *   one that holds the hymns rendered again (`packages/hymnal/scripts/render/`,
 *   uploaded by `infra/audio/upload.ts` and `infra/audio/stream.ts`).
 * - `audio/sdah/<n>.mp3`: the recordings first copied from the S3 bucket
 *   (`infra/audio/copy.ts`), kept beside the sets.
 * - `data/`: reserved for the compiled hymn data.
 */

import { keySet, recordingKey, setOf } from '@manna/hymnal/recordings';

export const HYMNS_HOST = 'hymns.cvr.im';

export const HYMNS_ORIGIN = `https://${HYMNS_HOST}`;

/** Octave-equivalent sounding keys share one signed offset in -5..6. */
export const soundingOffset = (offset: number) => ((((offset + 5) % 12) + 12) % 12) - 5;

/** The recording's identity is its hymn number and sounding offset, independent of capo. */
export const audioKey = (hymn: number, offset = 0) =>
  `audio/${keySet(setOf(hymn), soundingOffset(offset))}/${recordingKey(hymn)}`;

/** The bucket key of a recording copied from the S3 bucket. */
export const sourcedKey = (hymn: number) => `audio/sdah/${hymn}.mp3`;

/** The public URL of the recording the app plays for a 1985 SDA Hymnal number. */
export const audioUrl = (hymn: number, offset = 0) => `${HYMNS_ORIGIN}/${audioKey(hymn, offset)}`;
