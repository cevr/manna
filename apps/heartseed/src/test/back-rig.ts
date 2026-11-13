/* oxlint-disable effect/noAsyncFunction, effect/noNullish -- a React screen test's helpers: they await the root rig's promise-based taps and read nodes whose absent attributes are null. */

/**
 * What the Move back a stage tests share over the root rig: the passage an
 * ear on the disk, Today's nodes by test id, its stage line, the step back
 * records on the disk, and the tap from home that opens Today on the
 * passage.
 */

import { expect } from 'bun:test';
import passage from 'virtual:heartseed-passage';

import { START } from './clock';
import { DAY, MINUTE } from './garden-model';
import { recordOf, type RootLaunch } from './root-rig';

/** The passage an ear: Good at planting, a day on, and ten minutes after that. */
export const EAR = [
  recordOf(passage.reference, START - 3 * DAY),
  recordOf(passage.reference, START - 2 * DAY),
  recordOf(passage.reference, START - 2 * DAY + 10 * MINUTE),
] as const;

/** The node with test id `id`, or null. */
export const one = (rig: RootLaunch, id: string) => rig.host.querySelector(`[data-testid="${id}"]`);

/** Today's stage line, `Stage: <stage>`, or null. */
export const stage = (rig: RootLaunch) => one(rig, 'stage')?.getAttribute('aria-label') ?? null;

/** The passage's step back records on `disk`. */
export const backs = (disk: Map<string, string>) =>
  [...disk.keys()].filter((key) => key.startsWith(`heartseed/back/${passage.reference}/`));

/** From home, a tap on the passage's plant, named `<reference>, <stage>` (and `, ready today`), lands on Today on it. */
export const openVerse = async (rig: RootLaunch, shown: string) => {
  expect(
    await rig.until(() =>
      rig.names().some((name) => name.startsWith(`${passage.reference}, ${shown}`)),
    ),
  ).toBe(true);
  const label = rig.names().find((name) => name.startsWith(`${passage.reference}, ${shown}`)) ?? '';
  await rig.tap(label);
  expect(await rig.until(() => rig.headings().join('|') === 'Today' && rig.has('Say it'))).toBe(
    true,
  );
};
