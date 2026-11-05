/* oxlint-disable effect/noAsyncFunction, effect/noGlobals, effect/noNullish -- each case plays a device through the field's promise-based screen rig, writing the device's records as JSON text, one of them a listed key with no value (null). */

/**
 * The field from Today, through the screen rig (`src/test/field-rig.tsx`),
 * which holds every frame to the field's rules: the way there and back
 * through recitals, Again and a relaunch, Today coming back as it was and
 * the device untouched across each open and each way back, and every text
 * at AA contrast in every field frame. It counts words without printing one.
 */

import { describe, expect, it } from 'bun:test';
import passage from 'virtual:heartseed-passage';

import { recallOf } from '../test/field-model';
import { mount, record, SOIL, wantField } from '../test/field-rig';
import { device } from '../test/one';

describe('the field from Today', () => {
  it('opens from Today and comes back as Today was, through recitals, Again and a relaunch: the passage not planted beside other verses, then an ear, then a seed, the UTC days sown and the harvest as the disk holds them, writing nothing', async () => {
    const late = Date.UTC(2026, 9, 1, 23, 59, 59, 999);
    device.launch([
      record(recallOf('Made 1:1', late, 3, 0)),
      record(recallOf('Made 1:1 ', late + 1, 3, 0)),
      [`heartseed/recall/Made 2:2/${late}`, JSON.stringify(recallOf('Made 2:3', late, 3, 0))],
      ['heartseed/recall/Made 2:4/5', null],
      ['heartseed/voice/enabled', 'false'],
    ]);
    const app = await mount(true);
    expect(await app.until(() => app.buttons().includes('Your field'))).toBe(true);

    const first = await app.field();
    expect(first).toEqual(wantField());
    expect([first.sown, first.harvest, first.rows.map((row) => row.title)]).toEqual([
      '2 days sown',
      '0 verses at full corn',
      [passage.reference, 'Made 1:1', 'Made 1:1'],
    ]);
    expect(first.rows[0]?.plants).toEqual([
      { label: `${passage.reference}, not planted`, drawn: [SOIL], shown: '10' },
    ]);
    await app.back();
    expect(app.stage()).toBe('Stage: not planted');

    await app.say();
    await app.say();
    const shown = app.summary();
    const grown = await app.field();
    expect(grown.rows[0]?.plants[0]?.label).toBe(`${passage.reference}, ear`);
    expect(grown).toEqual(wantField());
    await app.back();
    expect([app.stage(), app.summary()]).toEqual(['Stage: ear', shown]);

    await app.tap('Again');
    expect(await app.until(() => app.stage() === 'Stage: seed')).toBe(true);
    const again = await app.field();
    expect([again.rows[0]?.plants[0]?.label, again.sown]).toEqual([
      `${passage.reference}, seed`,
      grown.sown,
    ]);
    expect(again).toEqual(wantField());
    expect([app.frames.listening > 0, app.faults]).toEqual([true, []]);
    expect(await app.leave()).toEqual([]);

    device.launch();
    const next = await mount(true);
    expect(await next.until(() => next.buttons().includes('Your field'))).toBe(true);
    expect(next.headings()).toEqual(['Today']);
    expect(await next.field()).toEqual(again);
    await next.back();
    expect(next.faults).toEqual([]);
    expect(await next.leave()).toEqual([]);
  });
});
