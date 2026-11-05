/* oxlint-disable effect/noAsyncFunction -- the case plays a generated device through the field's promise-based screen rig. */

/**
 * A generated garden past forty other verses on the field, through the
 * screen rig (`src/test/field-rig.tsx`), which holds every frame to the
 * field's rules: any count of other verses past forty (no ceiling), each
 * any non-empty string (any code unit or code point, combining marks, every
 * space, colons; `test/field-model.ts`), canonically equivalent twins each
 * its own row, in the order first sown, at every stage, each label the exact
 * reference and stage, each verse number the text after the reference's
 * last colon, and every readout at WCAG AA contrast.
 */

import { describe, expect, it } from 'bun:test';
import passage from 'virtual:heartseed-passage';

import { countOf, historyOf, othersOf, referenceKinds } from '../test/field-model';
import { mount, record, wantField } from '../test/field-rig';
import { DAY, random } from '../test/garden-model';
import { device } from '../test/one';

const FIXED = ['e\u0301:1', '\u00e9:1', 'Other:group:0', 'a::b: 7 ', 'Ψ:🌾:中'] as const;

describe('a large garden on the field', () => {
  it('shows a generated garden of any count past forty other verses of any reference, canonical twins apart, in the order first sown, at every stage, each label the exact reference and stage, each verse number the text after its reference’s last colon, every readout at AA contrast', async () => {
    const next = random(112);
    const start = Date.UTC(2026, 3, 1) / DAY;
    const others = 41 + countOf(next, 32);
    const references = [
      passage.reference,
      ...FIXED,
      ...othersOf(next, passage.reference, others - FIXED.length).filter(
        (reference) => !(FIXED as readonly string[]).includes(reference),
      ),
    ];
    device.launch(
      references
        .flatMap((reference, at) => historyOf(next, reference, start + (at % 9)))
        .map(record),
    );
    const app = await mount(true);
    expect(await app.until(() => app.buttons().includes('Your field'))).toBe(true);
    const field = await app.field();
    const labels = field.rows.flatMap((row) => row.plants.map((plant) => plant.label ?? ''));
    const stages = new Set(labels.map((label) => label.replace(/^.*, /su, '')));
    const kinds = new Set(references.flatMap(referenceKinds));
    const labelled = (reference: string) =>
      labels.filter((label) => label.startsWith(`${reference}, `)).length;
    expect({
      rows: field.rows.length,
      stages: [...stages].toSorted(),
      field,
      kinds: [
        'reference:not NFC',
        'reference:combining mark',
        'reference:astral',
        'reference:space',
        'reference:colons',
      ].filter((kind) => kinds.has(kind)),
      twins: [labelled('e\u0301:1'), labelled('\u00e9:1')],
    }).toEqual({
      rows: references.length,
      stages: ['blade', 'ear', 'full corn', 'seed'],
      field: wantField(),
      kinds: [
        'reference:not NFC',
        'reference:combining mark',
        'reference:astral',
        'reference:space',
        'reference:colons',
      ],
      twins: [1, 1],
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
