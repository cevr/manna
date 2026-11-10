/* oxlint-disable effect/noAsyncFunction, effect/noNullish, effect/noGlobals -- the test drives the root through React's promise-based `act`, one awaited tap at a time, over a disk planted a day before the run's frozen instant (the one `One.Database` reads as null for a missing key), and reads a control not shown as undefined. */

/**
 * Every screen's fixed controls outside its scroll views (hspassage C13,
 * hsfield's lost tap): the root mounted over a disk with the promise planted
 * a day before `NIGHT`, the clock frozen there, and one passage held, held to `rootFaults` and `barFaults` on
 * every frame while the reader goes from home through each screen a control
 * can hide on: Today by `Begin` and a recital (`Say it`, `Listening`, the
 * grades and `Next` in the footer), the run's end that `Next` shows
 * (`The field is tended`, `1 grew a stage.` and the promise grown to a blade,
 * read exactly, its header `Your field` the way on), home's bar
 * (`When I need…`, `Add verses`, the ask and its `Remove` and `Keep`), the
 * Add verses sheet's `Done`, the chooser's header (each step's back, the
 * first `‹ Add verses` back to the sheet) and footer (`Up to 20 verses` and
 * `Plant` under Psalms 119's 176 verses), and When I need…'s `Your field`.
 *
 * It catches any of those controls, an alert or the limit line moved into a
 * scroll view, as hsfield's `‹ Today` at the foot of the field's scroll was,
 * which the reader could not reach on a phone.
 */

import { expect, it } from 'bun:test';
import passage from 'virtual:heartseed-passage';

import { mountBar } from '../test/bar-rig';
import { record, scrolled } from '../test/field-rig';
import { recallOf } from '../test/field-model';
import { DAY } from '../test/garden-model';
import { device } from '../test/one';
import { KEY, storedText } from '../test/passages-model';
import { END, endShown } from '../test/root-rule';
import { sheetControl } from '../test/settings-rig';
import { activateSheet, tapSheet } from '../test/shelves-rig';

/**
 * The run's instant: 02:00 in the tests' zone, an hour before 04:00 at
 * which the plan offers no new piece of the held passage, so the promise is
 * the run's one item and its `Next` gives the end whatever the host's hour.
 */
const NIGHT = Date.UTC(2026, 10, 9, 2);

it('keeps each screen’s fixed controls outside its scroll views in every frame, on Today, the field and the chooser', async () => {
  const time = { now: NIGHT };
  const disk = new Map<string, string | null>([
    record(recallOf(passage.reference, time.now - DAY, 3, 0)),
    [KEY, storedText([{ book: 43, chapter: 15, first: 1, last: 5 }])],
  ]);
  device.launch(disk);
  const rig = await mountBar(0, false, null, time);
  const seen: string[] = [];
  const step = async (label: string, then: string) => {
    expect(await rig.tap(label)).toBe(true);
    expect(await rig.until(() => then === '' || rig.control(then) !== undefined)).toBe(true);
    seen.push(label);
  };
  expect(await rig.until(() => rig.control('Begin') !== undefined)).toBe(true);
  await step('Begin', 'Say it');
  await step('Say it', 'Listening');
  await step('Listening', 'Next');
  await step('Next', 'Your field');
  expect(await rig.until(() => endShown(rig.host).headings.includes(END))).toBe(true);
  expect(endShown(rig.host)).toEqual({
    headings: [END],
    counts: [],
    grew: ['1 grew a stage.'],
    grown: [`${passage.reference}, blade`],
  });
  await step('Your field', 'Add verses');
  await step('Remove John 15:1-5', 'Keep');
  await step('Keep', 'Add verses');
  expect(await rig.tapId('add-verses')).toBe(true);
  expect(await activateSheet(rig.until)).toBe(true);
  seen.push('Add verses');
  const done = sheetControl('Done');
  expect(done !== undefined && !scrolled(done)).toBe(true);
  expect(await tapSheet('Any passage')).toBe(true);
  expect(await rig.until(() => rig.control('Psalms') !== undefined)).toBe(true);
  seen.push('Any passage');
  await step('Psalms', 'Psalms 119');
  await step('Psalms 119', 'Psalms 119:20');
  await step('Psalms 119:1', 'Plant');
  await step('Psalms 119:20', 'Plant');
  await step('Chapters', 'Psalms 119');
  await step('Books', 'Psalms');
  expect(await rig.tap('Add verses')).toBe(true);
  expect(await activateSheet(rig.until)).toBe(true);
  seen.push('Add verses back');
  expect(await tapSheet('Done')).toBe(true);
  expect(await rig.until(() => rig.control('When I need…') !== undefined)).toBe(true);
  seen.push('Done');
  await step('When I need…', 'Your field');
  await step('Your field', 'When I need…');
  await rig.leave();
  expect(seen).toHaveLength(19);
  expect(rig.faults).toEqual([]);
});
