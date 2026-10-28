import { expect, it } from 'bun:test';
import { Option } from 'effect';
import bundled from 'virtual:hymnal-timing';
import { estimateMegabytes, secondsOf } from './estimate';

it('every bundled hymn timing yields its recording length for the estimate', () => {
  expect(bundled.length).toBe(695);
  const undecoded = bundled.filter(([, encoded]) => Option.isNone(secondsOf(encoded)));
  expect(undecoded.map(([number]) => number)).toEqual([]);
});

it('the Download all estimate for 695 recordings is at least 2,000 MB', () => {
  // About 2,471 MB at 192 kb/s; at least one minute a hymn is above 1,000 MB.
  const total = estimateMegabytes(bundled);
  expect(total).toBeGreaterThanOrEqual(2000);
  expect(total).toBeLessThan(4000);
});
