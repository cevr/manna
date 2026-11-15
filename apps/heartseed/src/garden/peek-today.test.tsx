/* oxlint-disable effect/noAsyncFunction, effect/noNullish -- a React screen test: it drives the root rig's promise-based taps one after another and reads nodes whose absent attributes are null. */

/**
 * Peek and Show all as a reader meets them, through the root rig
 * (`src/test/root-rig.tsx`, every frame held to the root's rules): the
 * passage an ear on the disk, a tap on its plant opens Today on it at rest,
 * each word a button to peek at (`peek-<i>`, named `Word <n>` under no cue)
 * whose tap shows the word and names the button by it; `Show all` shows the
 * verse whole, reads it a blade and takes `Show all` and `Move back a stage`
 * away, writing nothing; the try then offers no grade above Hard and
 * writes nothing until `Next`, which keeps the step back and the try at
 * Hard. Left by `Your field` after a peek and `Show all`, nothing is
 * written and the verse opens again an ear, at rest.
 */

import { expect, it } from 'bun:test';
import passage from 'virtual:heartseed-passage';

import { sourceWords } from '../matcher/words';
import { backs, EAR, one, openVerse, stage } from '../test/back-rig';
import { START } from '../test/clock';
import { DAY } from '../test/garden-model';
import { launchRoot, rootDevice, textOf, type RootLaunch } from '../test/root-rig';

const FIRST = sourceWords(passage.text)[0] ?? '';

/** The passage's recall records on `disk`. */
const recalls = (disk: Map<string, string>) =>
  [...disk.keys()].filter((key) => key.startsWith(`heartseed/recall/${passage.reference}/`));

/** Whether the grade radio named `name` is disabled. */
const barred = (rig: RootLaunch, name: string) =>
  rig.host.querySelector(`[role="radio"][aria-label="${name}"]`)?.getAttribute('aria-disabled') ===
  'true';

it('peeks a word and shows all at rest, then keeps the step back and the try at Hard only at Next', async () => {
  const device = rootDevice([...EAR]);
  const rig = await launchRoot(device, { now: START + DAY });
  await openVerse(rig, 'ear');
  const peek = one(rig, 'peek-0');
  expect([peek?.getAttribute('role'), peek?.getAttribute('aria-label')]).toEqual([
    'button',
    'Word 1',
  ]);

  await rig.tap('Word 1');
  expect(await rig.until(() => one(rig, 'peek-0')?.getAttribute('aria-label') === FIRST)).toBe(
    true,
  );
  expect(textOf(one(rig, 'word-0'))).toBe(FIRST);

  await rig.tap('Show all');
  expect(await rig.until(() => stage(rig) === 'Stage: blade')).toBe(true);
  expect([
    one(rig, 'passage') !== null,
    rig.has('Show all'),
    rig.has('Move back a stage'),
    one(rig, 'peek-0'),
    backs(device.disk),
    recalls(device.disk).length,
  ]).toEqual([true, false, false, null, [], 3]);

  await rig.tap('Say it');
  expect(await rig.until(() => rig.has('Listening'))).toBe(true);
  await rig.tap('Listening');
  expect(await rig.until(() => rig.has('Next'))).toBe(true);
  expect([
    barred(rig, 'Again'),
    barred(rig, 'Hard'),
    barred(rig, 'Good'),
    barred(rig, 'Easy'),
    backs(device.disk),
    recalls(device.disk).length,
  ]).toEqual([false, false, true, true, [], 3]);

  await rig.tap('Next');
  expect(await rig.until(() => backs(device.disk).length === 1)).toBe(true);
  expect(await rig.until(() => recalls(device.disk).length === 4)).toBe(true);
  const kept = device.disk.get(recalls(device.disk).sort().at(-1) ?? '') ?? '';
  expect(/"grade":2[,}]/.test(kept)).toBe(true);
  await rig.tap('Your field');
  expect(
    await rig.until(() =>
      rig.names().some((name) => name.startsWith(`${passage.reference}, blade`)),
    ),
  ).toBe(true);
  expect(rig.faults).toEqual([]);
  await rig.leave();
});

it('writes nothing when Today is left after a peek and Show all, and opens the verse again an ear, at rest', async () => {
  const device = rootDevice([...EAR]);
  const before = [...device.disk.entries()];
  const rig = await launchRoot(device, { now: START + DAY });
  await openVerse(rig, 'ear');
  await rig.tap('Word 2');
  await rig.tap('Show all');
  expect(await rig.until(() => stage(rig) === 'Stage: blade')).toBe(true);
  await rig.tap('Say it');
  expect(await rig.until(() => rig.has('Listening'))).toBe(true);
  await rig.tap('Listening');
  expect(await rig.until(() => rig.has('Next'))).toBe(true);
  await rig.tap('Your field');
  await openVerse(rig, 'ear');
  expect([
    [...device.disk.entries()],
    stage(rig),
    rig.has('Show all'),
    one(rig, 'peek-1')?.getAttribute('aria-label'),
  ]).toEqual([before, 'Stage: ear', true, 'Word 2']);
  expect(rig.faults).toEqual([]);
  await rig.leave();
});
