/* oxlint-disable effect/noAsyncFunction, effect/noGlobals, effect/noNullish -- each case plays a device through the field's promise-based screen rig, writing the device's records as JSON text, one of them a listed key with no value (null). */

/**
 * The field from Today, through the screen rig (`src/test/field-rig.tsx`),
 * which holds every frame to the field's rules: the way there and back
 * through recitals, Again and a relaunch, Today coming back as it was and
 * the field writing nothing; and a garden of forty other verses at every
 * stage. It counts words without printing one.
 */

import { describe, expect, it } from 'bun:test';
import passage from 'virtual:heartseed-passage';

import { historyOf, recallOf } from '../test/field-model';
import { mount, record, SOIL, wantField } from '../test/field-rig';
import { DAY, random } from '../test/garden-model';
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
    await app.leave();

    device.launch();
    const next = await mount(true);
    expect(await next.until(() => next.buttons().includes('Your field'))).toBe(true);
    expect(next.headings()).toEqual(['Today']);
    expect(await next.field()).toEqual(again);
    expect(next.faults).toEqual([]);
    await next.leave();
  });

  it('shows forty other verses in the order first sown, a harvest and every stage, each plant drawn and labelled as the rule has it', async () => {
    const next = random(41);
    const start = Date.UTC(2026, 3, 1) / DAY;
    const references = [
      passage.reference,
      ...Array.from({ length: 40 }, (_, at) => `Made ${at % 7}:${at}`),
    ];
    device.launch(
      references
        .flatMap((reference, at) => historyOf(next, reference, start + (at % 9)))
        .map(record),
    );
    const app = await mount(true);
    expect(await app.until(() => app.buttons().includes('Your field'))).toBe(true);
    const field = await app.field();
    const stages = new Set(
      field.rows.flatMap((row) => row.plants.map((plant) => plant.label?.replace(/^.*, /, ''))),
    );
    expect([field.rows.length, [...stages].toSorted(), field.harvest]).toEqual([
      41,
      ['blade', 'ear', 'full corn', 'seed'],
      wantField().harvest,
    ]);
    expect([field.harvest === '0 verses at full corn', app.faults]).toEqual([false, []]);
    await app.leave();
  });
});
