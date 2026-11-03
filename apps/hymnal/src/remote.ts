import { keySet, recordingKey, setOf } from '@manna/hymnal/recordings';

export const HYMNS_HOST = 'hymns.cvr.im';

export const HYMNS_ORIGIN = `https://${HYMNS_HOST}`;

export const soundingOffset = (offset: number) => ((((offset + 5) % 12) + 12) % 12) - 5;

export const audioKey = (hymn: number, offset = 0) =>
  `audio/${keySet(setOf(hymn), soundingOffset(offset))}/${recordingKey(hymn)}`;

export const sourcedKey = (hymn: number) => `audio/sdah/${hymn}.mp3`;

export const audioUrl = (hymn: number, offset = 0) => `${HYMNS_ORIGIN}/${audioKey(hymn, offset)}`;
