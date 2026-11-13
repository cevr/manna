/* oxlint-disable effect/noAsyncFunction, effect/noGlobals, effect/noNullish -- each case plays a device through the field's promise-based screen rig, writing the device's records as JSON text, one of them a listed key with no value (null). */

/**
 * The field from Today, through the screen rig (`src/test/field-rig.tsx`),
 * which holds every frame to the root's and the field's rules: a launch on
 * home, `Start` to Today, and the way to the field by `Your field` and back
 * by `Start` through recitals, Again and a relaunch, the device untouched
 * across each open and each way back, a recital left before `Next` recording
 * nothing (the verse as it was in the field and on Today), and every text at
 * AA contrast in every field frame. It counts words without printing one.
 */

import { describe, expect, it } from 'bun:test';
import passage from 'virtual:heartseed-passage';

import { recallOf } from '../test/field-model';
import { mount, record, wantField } from '../test/field-rig';
import { device } from '../test/one';

describe('the field from Today', () => {
  it('opens from Today and back, through recitals, Again and a relaunch: the passage not planted beside other verses, then a seed still after a recital at its due left before Next, then a seed again after one graded Again and kept by Next, the UTC days sown and the harvest as the disk holds them, writing nothing on the way', async () => {
    const late = Date.UTC(2026, 9, 1, 23, 59, 59, 999);
    device.launch([
      record(recallOf('Made 1:1', late, 3, 0)),
      record(recallOf('Made 1:1 ', late + 1, 3, 0)),
      [`heartseed/recall/Made 2:2/${late}`, JSON.stringify(recallOf('Made 2:3', late, 3, 0))],
      ['heartseed/recall/Made 2:4/5', null],
      ['heartseed/voice/enabled', 'false'],
    ]);
    const time = { now: Date.UTC(2026, 10, 5, 15) };
    const app = await mount(true, undefined, time);
    expect(await app.until(app.home)).toBe(true);
    await app.begin();

    const first = await app.field();
    expect(first).toEqual(wantField());
    expect([first.sown, first.harvest, first.rows.map((row) => row.title)]).toEqual([
      '2 days sown',
      '0 verses at full corn',
      [passage.reference, 'Made 1:1', 'Made 1:1'],
    ]);
    expect(first.rows[0]?.plants).toEqual([
      { label: `${passage.reference}, not planted`, drawn: 'soil', shown: '' },
    ]);
    expect([first.rows.map((row) => row.icon), app.captions()]).toEqual([
      ['bow', 'scroll', 'scroll'],
      ['1 verse · 1 ready today', '1 verse · 1 planted', '1 verse · 1 planted'],
    ]);
    await app.back();
    expect(app.stage()).toBe('Stage: not planted');

    await app.say();
    expect(await app.renew()).toBe(1);
    expect(app.ends).toEqual([
      { grew: ['1 grew a stage.'], grown: [`${passage.reference}, seed`] },
    ]);
    await app.say();
    expect(app.stage()).toBe('Stage: blade');
    const left = await app.field();
    expect(left.rows[0]?.plants[0]?.label).toBe(`${passage.reference}, seed`);
    expect(left).toEqual(wantField());
    await app.back();
    expect(app.stage()).toBe('Stage: seed');

    await app.say();
    expect(await app.until(() => app.stage() === 'Stage: blade')).toBe(true);
    await app.tap('Again');
    expect(await app.until(() => app.stage() === 'Stage: seed')).toBe(true);
    await app.tap('Next');
    expect(await app.until(() => app.frames.end > 0)).toBe(true);
    const again = await app.field();
    expect(again.rows[0]?.plants[0]?.label).toBe(`${passage.reference}, seed`);
    expect(again).toEqual(wantField());
    expect([app.frames.listening > 0, app.frames.end > 0, app.faults]).toEqual([true, true, []]);
    expect(await app.leave()).toEqual([]);

    device.launch();
    const next = await mount(true, undefined, time);
    expect(await next.until(next.home)).toBe(true);
    expect([next.headings(), next.onHome()]).toEqual([['Your field'], again]);
    expect(next.faults).toEqual([]);
    expect(await next.leave()).toEqual([]);
  });
});
