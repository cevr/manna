/* oxlint-disable effect/noAsyncFunction -- the case plays a generated device through the field's promise-based screen rig. */

/**
 * A generated garden past forty other verses on the field, through the
 * screen rig (`src/test/field-rig.tsx`), which holds every frame to the
 * field's rules: references of any shape (repeated colons, every kind of
 * space, other scripts, the passage's look-alikes) in the order first sown,
 * at every stage, each verse number the text after the reference's last
 * colon, and every readout at WCAG AA contrast.
 */

import { describe, expect, it } from 'bun:test';
import passage from 'virtual:heartseed-passage';

import { historyOf, otherReference } from '../test/field-model';
import { mount, record, wantField } from '../test/field-rig';
import { below, DAY, random } from '../test/garden-model';
import { device } from '../test/one';

describe('a large garden on the field', () => {
  it('shows a generated garden past forty other verses of any reference, in the order first sown, at every stage, each verse number the text after its reference’s last colon, every readout at AA contrast', async () => {
    const next = random(97);
    const start = Date.UTC(2026, 3, 1) / DAY;
    const references = new Set([passage.reference, 'Other:group:0', 'a::b: 7 ', 'Ψ:🌾:中']);
    const others = 41 + below(next, 40);
    while (references.size < others + 1) references.add(otherReference(next, passage.reference));
    device.launch(
      [...references]
        .flatMap((reference, at) => historyOf(next, reference, start + (at % 9)))
        .map(record),
    );
    const app = await mount(true);
    expect(await app.until(() => app.buttons().includes('Your field'))).toBe(true);
    const field = await app.field();
    const labels = field.rows.flatMap((row) => row.plants.map((plant) => plant.label ?? ''));
    const stages = new Set(labels.map((label) => label.replace(/^.*, /, '')));
    const counted = (test: (reference: string) => boolean) => [...references].filter(test).length;
    expect({
      rows: field.rows.length,
      stages: [...stages].toSorted(),
      field,
      colons: counted((reference) => reference.split(':').length > 2) >= 3,
      beyondAscii: counted((reference) => /[^\u0020-\u007e]/u.test(reference)) >= 3,
      spaces: counted((reference) => /\s/u.test(reference)) >= 3,
    }).toEqual({
      rows: others + 1,
      stages: ['blade', 'ear', 'full corn', 'seed'],
      field: wantField(),
      colons: true,
      beyondAscii: true,
      spaces: true,
    });
    expect(
      field.rows.flatMap((row) => row.plants).find((plant) => plant.label?.startsWith('Other:'))
        ?.shown,
    ).toBe('0');
    const lowest = Math.min(...Object.values(app.readouts()));
    expect([lowest >= 4.5, field.faint, app.faults]).toEqual([true, [], []]);
    await app.back();
    expect(await app.leave()).toEqual([]);
  });
});
