/**
 * Where the hymn recordings are served: the R2 bucket `cvr-hymns` behind its
 * custom domain (`infra/bucket.ts`). The app builds each recording's URL from
 * here, and the stack reads its domain from here, so the address is declared
 * once. It imports only `@manna/hymnal/recordings`, which imports nothing, so
 * Metro, Vite and the infra read it unchanged.
 *
 * Key layout in the bucket:
 * - `audio/<set>/sdah/<n>.mp3`: a rendered set's recording of hymn `n` of
 *   the 1985 SDA Hymnal, the number unpadded. Printed key uses
 *   `RECORDING_SET` (`warm-1`), signed offsets its up1..6/down1..5 sets;
 *   a set is never replaced, only joined by the
 *   next (`packages/hymnal/scripts/render/`, uploaded by `infra/audio/upload.ts`).
 * - `audio/sdah/<n>.mp3`: the recordings first copied from the S3 bucket
 *   (`infra/audio/copy.ts`), kept beside the sets.
 * - `data/`: reserved for the compiled hymn data.
 */

import { RECORDING_SET, recordingKey } from '@manna/hymnal/recordings';

export const HYMNS_HOST = 'hymns.cvr.im';

export const HYMNS_ORIGIN = `https://${HYMNS_HOST}`;

/** Octave-equivalent sounding keys share one signed offset in -5..6. */
export const soundingOffset = (offset: number) => ((((offset + 5) % 12) + 12) % 12) - 5;

/** The recording's identity is its hymn number and sounding offset, independent of capo. */
export const audioKey = (hymn: number, offset = 0) => {
  const signed = soundingOffset(offset);
  let suffix = '';
  if (signed > 0) suffix = `-up${signed}`;
  if (signed < 0) suffix = `-down${-signed}`;
  return `audio/${RECORDING_SET}${suffix}/${recordingKey(hymn)}`;
};

/** The bucket key of a recording copied from the S3 bucket. */
export const sourcedKey = (hymn: number) => `audio/sdah/${hymn}.mp3`;

/** The public URL of the recording the app plays for a 1985 SDA Hymnal number. */
export const audioUrl = (hymn: number, offset = 0) => `${HYMNS_ORIGIN}/${audioKey(hymn, offset)}`;
