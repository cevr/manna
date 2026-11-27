/**
 * drive-web's network oracle, pure over the requests a page made. The app
 * saves the hymn page the reader rests on: one request for its printed
 * key's recording per rest (`downloadsRest`, `features/downloads.contract`).
 * After Play the player streams the recording of the hymn the reader is
 * on, in whichever key's set (`keySet`); any other request to the bucket
 * after Play is a background one and is admitted only as a rest's save.
 * Every other request off the local server is unasked.
 */

import { recordingKey } from '@manna/hymnal/recordings';

/** One request a page made, as drive-web records it. */
export interface Asked {
  readonly url: string;
  /** The hymn page last shown when it was made, 0 before any. */
  readonly hymn: number;
  /** Whether the first Play had been pressed when it was made. */
  readonly afterPlay: boolean;
  /** The page rest it falls in, counted from 1: the hymn page shown for the rest's delay, when the URL is that hymn's printed key; 0 when none. */
  readonly rest: number;
  readonly at: number;
}

/** The requests off `origin`, data and blob URLs aside. */
export const foreignOf = (asked: ReadonlyArray<Asked>, origin: string): ReadonlyArray<Asked> =>
  asked.filter((each) => !each.url.startsWith(origin) && !/^(?:data|blob):/u.test(each.url));

/** Whether a request is the audible stream: after Play, a recording of the hymn the reader is on, in any key's set. */
const streams = (asked: Asked, bucket: string): boolean =>
  asked.afterPlay &&
  asked.hymn > 0 &&
  asked.url.startsWith(`${bucket}/audio/`) &&
  asked.url.endsWith(`/${recordingKey(asked.hymn)}`);

/** Whether a request is a candidate save: made in a page rest, for its printed key, not the stream. */
const saving = (asked: Asked, bucket: string): boolean => asked.rest > 0 && !streams(asked, bucket);

/** The count of saves in each page rest, by rest. */
export const savesByRest = (
  asked: ReadonlyArray<Asked>,
  bucket: string,
): ReadonlyMap<number, number> => {
  const counts = new Map<number, number>();
  for (const each of asked.filter((one) => saving(one, bucket)))
    counts.set(each.rest, (counts.get(each.rest) ?? 0) + 1);
  return counts;
};

/**
 * The bucket's requests since a hymn page was rested on are exactly one
 * save, of `printed`, the page's printed key's recording.
 */
export const oneSave = (asked: ReadonlyArray<Asked>, printed: string, bucket: string): boolean =>
  asked.length === 1 && asked.every((each) => saving(each, bucket) && each.url === printed);

/**
 * Each request the page should not have made: off `origin` (data and blob
 * URLs aside), and neither `bucket`'s stream after Play nor the first save
 * of a page rest. A second save of the same rest, a bucket request made
 * after Play that is not the stream nor a rest's save, a save before its
 * rest and another origin's request are each unasked.
 */
export const unaskedOf = (
  asked: ReadonlyArray<Asked>,
  origin: string,
  bucket: string,
): ReadonlyArray<Asked> => {
  const seen = new Set<number>();
  return foreignOf(asked, origin).filter((each) => {
    if (!each.url.startsWith(`${bucket}/`)) return true;
    if (streams(each, bucket)) return false;
    if (!saving(each, bucket) || seen.has(each.rest)) return true;
    seen.add(each.rest);
    return false;
  });
};
