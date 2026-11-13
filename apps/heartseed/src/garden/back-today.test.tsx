/* oxlint-disable effect/noAsyncFunction, effect/noNullish -- a React screen test: it drives the root rig's promise-based taps one after another and reads nodes whose absent attributes are null. */

/**
 * Move back a stage as a reader meets it, through the root rig
 * (`src/test/root-rig.tsx`, every frame held to the root's rules): the
 * passage an ear on the disk, a tap on its plant on home opens Today on it
 * with `Move back a stage` in the footer, outside the scroll view; the ask
 * names the verse and the stage below, `Keep` drops it, `Move back` writes
 * one step back and the stage line, the moved line and home's plant say the
 * lower stage, and a relaunch reads it back. A refused write leaves the
 * alert and the stage; a seed offers no control; the plan's own item
 * (Today by `Start`) offers none; two taps of the ask's `Move back` in one
 * turn move the verse once, with no alert.
 */

import { expect, it } from 'bun:test';
import { act } from 'react';
import passage from 'virtual:heartseed-passage';

import { START } from '../test/clock';
import { DAY, MINUTE } from '../test/garden-model';
import { launchRoot, recordOf, rootDevice, textOf, type RootLaunch } from '../test/root-rig';

/** The passage an ear: Good at planting, a day on, and ten minutes after that. */
const EAR = [
  recordOf(passage.reference, START - 3 * DAY),
  recordOf(passage.reference, START - 2 * DAY),
  recordOf(passage.reference, START - 2 * DAY + 10 * MINUTE),
] as const;

const one = (rig: RootLaunch, id: string) => rig.host.querySelector(`[data-testid="${id}"]`);

const stage = (rig: RootLaunch) => one(rig, 'stage')?.getAttribute('aria-label') ?? null;

/** Whether `node` lies inside a scroll view. */
const scrolled = (node: Element | null | undefined) => {
  for (let at = node?.parentElement; at !== null && at !== undefined; at = at.parentElement)
    if (/auto|scroll/.test(`${getComputedStyle(at).overflowY} ${getComputedStyle(at).overflow}`))
      return true;
  return false;
};

const backs = (disk: Map<string, string>) =>
  [...disk.keys()].filter((key) => key.startsWith(`heartseed/back/${passage.reference}/`));

/** From home, a tap on the passage's plant, named `<reference>, <stage>` (and `, ready today`), lands on Today on it. */
const openVerse = async (rig: RootLaunch, shown: string) => {
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

it('moves a tapped ear back to a blade after the ask, kept through a relaunch, then to a seed, which offers no control', async () => {
  const device = rootDevice([...EAR]);
  const rig = await launchRoot(device, { now: START + DAY });
  await openVerse(rig, 'ear');
  expect([stage(rig), rig.has('Move back a stage')]).toEqual(['Stage: ear', true]);
  const control = rig.host.querySelector('[aria-label="Move back a stage"]');
  expect(scrolled(control)).toBe(false);

  await rig.tap('Move back a stage');
  expect(await rig.until(() => one(rig, 'back-ask') !== null)).toBe(true);
  expect([
    textOf(one(rig, 'back-ask')),
    rig.has('Move back'),
    rig.has('Keep'),
    rig.has('Move back a stage'),
  ]).toEqual([
    `Move ${passage.reference} back to a blade? It comes due again soon.`,
    true,
    true,
    false,
  ]);
  await rig.tap('Keep');
  expect(await rig.until(() => rig.has('Move back a stage'))).toBe(true);
  expect([one(rig, 'back-ask'), backs(device.disk), stage(rig)]).toEqual([null, [], 'Stage: ear']);

  await rig.tap('Move back a stage');
  await rig.tap('Move back');
  expect(await rig.until(() => stage(rig) === 'Stage: blade')).toBe(true);
  expect(await rig.until(() => one(rig, 'moved') !== null)).toBe(true);
  expect([
    textOf(one(rig, 'moved')),
    rig.has('Move back a stage'),
    backs(device.disk).length,
  ]).toEqual(['Moved back to a blade.', true, 1]);

  await rig.tap('Your field');
  expect(
    await rig.until(() =>
      rig.names().some((name) => name.startsWith(`${passage.reference}, blade`)),
    ),
  ).toBe(true);
  expect(rig.faults).toEqual([]);
  await rig.leave();

  const again = await launchRoot(device, { now: START + DAY + MINUTE });
  await openVerse(again, 'blade');
  expect(stage(again)).toBe('Stage: blade');
  await again.tap('Move back a stage');
  await again.tap('Move back');
  expect(await again.until(() => stage(again) === 'Stage: seed')).toBe(true);
  expect(await again.until(() => one(again, 'moved') !== null)).toBe(true);
  expect([
    textOf(one(again, 'moved')),
    again.has('Move back a stage'),
    backs(device.disk).length,
  ]).toEqual(['Moved back to a seed.', false, 2]);
  expect(again.faults).toEqual([]);
  await again.leave();
});

it('leaves the alert and the stage when the write is refused, and offers nothing on the plan’s own item', async () => {
  const device = rootDevice([...EAR]);
  const rig = await launchRoot(device, { now: START + DAY });
  await openVerse(rig, 'ear');
  device.refuse = 1;
  await rig.tap('Move back a stage');
  await rig.tap('Move back');
  expect(await rig.until(() => one(rig, 'back-alert') !== null)).toBe(true);
  expect([
    textOf(one(rig, 'back-alert')),
    stage(rig),
    backs(device.disk),
    rig.has('Move back a stage'),
  ]).toEqual([`${passage.reference} was not moved back. Try again.`, 'Stage: ear', [], true]);
  expect(rig.faults).toEqual([]);
  await rig.leave();

  const due = await launchRoot(rootDevice([...EAR]), { now: START + 30 * DAY });
  expect(await due.until(() => due.has('Start'))).toBe(true);
  await due.tap('Start');
  expect(await due.until(() => due.headings().join('|') === 'Today' && due.has('Say it'))).toBe(
    true,
  );
  expect([due.references(), due.has('Move back a stage')]).toEqual([[passage.reference], false]);
  expect(due.faults).toEqual([]);
  await due.leave();
});

it('moves the verse once for two taps of the ask’s Move back in one turn, with no alert', async () => {
  const device = rootDevice([...EAR]);
  const rig = await launchRoot(device, { now: START + DAY });
  await openVerse(rig, 'ear');
  await rig.tap('Move back a stage');
  const confirm = rig.host.querySelector('[aria-label="Move back"]');
  await act(async () => {
    for (const _ of [1, 2])
      confirm?.dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }),
      );
  });
  expect(await rig.until(() => one(rig, 'moved') !== null)).toBe(true);
  expect(await rig.until(() => false, 50)).toBe(false);
  expect([
    stage(rig),
    textOf(one(rig, 'moved')),
    one(rig, 'back-alert'),
    backs(device.disk).length,
  ]).toEqual(['Stage: blade', 'Moved back to a blade.', null, 1]);
  expect(rig.faults).toEqual([]);
  await rig.leave();
});
