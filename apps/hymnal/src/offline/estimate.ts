/** The Download all size estimate, from each hymn's timed length at the set's 192 kb/s. */
import { Option } from 'effect';
import { timelineOf } from '~/follow/timeline';

/** Each hymn's recording seconds (its timeline's end plus a short tail), or none when its timing does not decode. */
export const secondsOf = (encoded: string): Option.Option<number> =>
  Option.map(timelineOf(encoded), (t) => t.end / 1000 + 4);

/** Megabytes for every printed-key recording in the bundle. */
export const estimateMegabytes = (bundled: ReadonlyArray<readonly [number, string]>): number => {
  let seconds = 0;
  for (const [, encoded] of bundled) seconds += Option.getOrElse(secondsOf(encoded), () => 0);
  return Math.ceil((seconds * 24000) / 1_000_000);
};
