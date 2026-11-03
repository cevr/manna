import { Option } from 'effect';
import { timelineOf } from '~/follow/timeline';

export const secondsOf = (encoded: string): Option.Option<number> =>
  Option.map(timelineOf(encoded), (t) => t.end / 1000 + 4);

export const estimateMegabytes = (bundled: ReadonlyArray<readonly [number, string]>): number => {
  let seconds = 0;
  for (const [, encoded] of bundled) seconds += Option.getOrElse(secondsOf(encoded), () => 0);
  return Math.ceil((seconds * 24000) / 1_000_000);
};
