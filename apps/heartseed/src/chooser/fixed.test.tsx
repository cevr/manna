/* oxlint-disable effect/noAsyncFunction, effect/noNullish, effect/noGlobals -- the test drives the root through React's promise-based `act`, one awaited tap at a time, over a disk planted a day before the host's clock (the one `One.Database` reads as null for a missing key), and reads a control not shown as undefined. */

/**
 * Every screen's fixed controls outside its scroll views (hspassage C13,
 * hsfield's lost tap): the root mounted over a disk with the promise planted
 * yesterday and one passage held, held to `barFaults` on every frame while
 * the reader goes through each screen a control can hide on: Today and a
 * recital (`Say it`, `Listening`, the grades and `Next` in the footer), the
 * field's bar (`‹ Today`, `Add a passage`, the ask and its `Remove` and
 * `Keep`), and the chooser's header (each step's back) and footer
 * (`Up to 20 verses` and `Plant` under Psalms 119's 176 verses).
 *
 * It catches any of those controls, an alert or the limit line moved into a
 * scroll view, as hsfield's `‹ Today` at the foot of the field's scroll was,
 * which the reader could not reach on a phone.
 */

import { expect, it } from 'bun:test';
import passage from 'virtual:heartseed-passage';

import { mountBar } from '../test/bar-rig';
import { record } from '../test/field-rig';
import { recallOf } from '../test/field-model';
import { DAY } from '../test/garden-model';
import { device } from '../test/one';
import { KEY, storedText } from '../test/passages-model';

it('keeps each screen’s fixed controls outside its scroll views in every frame, on Today, the field and the chooser', async () => {
  const disk = new Map<string, string | null>([
    record(recallOf(passage.reference, Date.now() - DAY, 3, 0)),
    [KEY, storedText([{ book: 43, chapter: 15, first: 1, last: 5 }])],
  ]);
  device.launch(disk);
  const rig = await mountBar(0, false);
  const seen: string[] = [];
  const step = async (label: string, then: string) => {
    expect(await rig.tap(label)).toBe(true);
    expect(await rig.until(() => then === '' || rig.control(then) !== undefined)).toBe(true);
    seen.push(label);
  };
  expect(await rig.until(() => rig.control('Say it') !== undefined)).toBe(true);
  await step('Say it', 'Listening');
  await step('Listening', 'Next');
  await step('Next', 'Your field');
  await step('Your field', 'Add a passage');
  await step('Remove John 15:1-5', 'Keep');
  await step('Keep', 'Add a passage');
  await step('Add a passage', 'Psalms');
  await step('Psalms', 'Psalms 119');
  await step('Psalms 119', 'Psalms 119:20');
  await step('Psalms 119:1', 'Plant');
  await step('Psalms 119:20', 'Plant');
  await step('Chapters', 'Psalms 119');
  await step('Books', 'Psalms');
  await step('Your field', 'Today');
  await step('Today', 'Your field');
  await rig.leave();
  expect(seen).toHaveLength(15);
  expect(rig.faults).toEqual([]);
});
