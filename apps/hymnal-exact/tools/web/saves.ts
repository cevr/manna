/** One request a page made, as drive-web records it. */
export interface Asked {
  readonly url: string;
  /** Playwright's resource type: `media` for the audio element's stream. */
  readonly type: string;
  /** Whether the first Play had been pressed when it was made. */
  readonly afterPlay: boolean;
  /** The page rest it falls in, counted from 1: the hymn page shown for the rest's delay, when the URL is that hymn's printed key; 0 when none. */
  readonly rest: number;
  readonly at: number;
}

/** The requests off `origin`, data and blob URLs aside. */
export const foreignOf = (asked: ReadonlyArray<Asked>, origin: string): ReadonlyArray<Asked> =>
  asked.filter((each) => !each.url.startsWith(origin) && !/^(?:data|blob):/u.test(each.url));

/** Whether a request is the audible stream after Play. */
const streams = (asked: Asked): boolean => asked.afterPlay && asked.type === 'media';

/** Whether a request is a candidate save: made in a page rest, for its printed key, not the stream. */
const saving = (asked: Asked): boolean => asked.rest > 0 && !streams(asked);

/** The count of saves in each page rest, by rest. */
export const savesByRest = (asked: ReadonlyArray<Asked>): ReadonlyMap<number, number> => {
  const counts = new Map<number, number>();
  for (const each of asked.filter(saving)) counts.set(each.rest, (counts.get(each.rest) ?? 0) + 1);
  return counts;
};

/**
 * The bucket's requests since a hymn page was rested on are exactly one
 * save, of `printed`, the page's printed key's recording.
 */
export const oneSave = (asked: ReadonlyArray<Asked>, printed: string): boolean =>
  asked.length === 1 && asked.every((each) => saving(each) && each.url === printed);

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
    if (streams(each)) return false;
    if (!saving(each) || seen.has(each.rest)) return true;
    seen.add(each.rest);
    return false;
  });
};
