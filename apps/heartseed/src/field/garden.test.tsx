/* oxlint-disable effect/noAsyncFunction -- the case plays a generated device through the field's promise-based screen rig. */

/**
 * A generated garden past forty other verses on the field, through the
 * screen rig (`src/test/field-rig.tsx`), which holds every frame to the
 * field's rules: any count of other verses past forty (no ceiling), each
 * any non-empty string (any code unit or code point, combining marks, every
 * space, colons; `test/field-model.ts`), canonically equivalent twins each
 * its own row, references spelled as the screens' own words (`Your field`,
 * `Today`, the counts, the stages) with spaces of any kind, in the order
 * first sown, at every stage, each label the exact reference and stage, each
 * verse number the text after the reference's last colon, one `Your field`
 * heading and no `Today` heading in every field frame, and every readout at
 * AA contrast.
 */

import { describe, expect, it } from 'bun:test';
import passage from 'virtual:heartseed-passage';

import {
  countOf,
  historyOf,
  labelReference,
  othersOf,
  referenceKinds,
  SCREEN_LABELS,
} from '../test/field-model';
import { mount, record, wantField } from '../test/field-rig';
import { DAY, random } from '../test/garden-model';
import { device } from '../test/one';

const FIXED = ['e\u0301:1', '\u00e9:1', 'Other:group:0', 'a::b: 7 ', 'Ψ:🌾:中'] as const;

/** The screens' own words as stored references, each as it is and with spaces around or within it. */
const SPOKEN = [
  'Your field',
  'Today',
  ' Your field',
  'Your field\u00a0',
  'Your\u3000field',
  '\tToday',
  'Today\ufeff',
] as const;

describe('a large garden on the field', () => {
  it('shows a generated garden of any count past forty other verses of any reference, canonical twins apart, references spelled as the screens’ own words, in the order first sown, at every stage, each label the exact reference and stage, each verse number the text after its reference’s last colon, one Your field heading and no Today heading, every readout at AA contrast', async () => {
    const next = random(112);
    const said = random(28);
    const start = Date.UTC(2026, 3, 1) / DAY;
    const others = 41 + countOf(next, 32);
    const generated = othersOf(next, passage.reference, others - FIXED.length);
    const labels = Array.from({ length: 24 }, () => labelReference(said));
    const references = [
      ...new Set([
        passage.reference,
        ...FIXED,
        ...SPOKEN,
        ...labels,
        ...generated.filter((reference) => !(FIXED as readonly string[]).includes(reference)),
      ]),
    ];
    device.launch(
      references
        .flatMap((reference, at) => historyOf(next, reference, start + (at % 9)))
        .map(record),
    );
    const app = await mount(true);
    expect(await app.until(app.home)).toBe(true);
    const field = app.onHome();
    const labelled = field.rows.flatMap((row) => row.plants.map((plant) => plant.label ?? ''));
    const stages = new Set(labelled.map((label) => label.replace(/^.*, /su, '')));
    const kinds = new Set(references.flatMap(referenceKinds));
    const count = (reference: string) =>
      labelled.filter((label) => label.startsWith(`${reference}, `)).length;
    const spoken = new Set(
      references
        .filter((reference) => !(SPOKEN as readonly string[]).includes(reference))
        .map((reference) => reference.replace(/\s+/gu, ' ').trim())
        .filter((title) => (SCREEN_LABELS as readonly string[]).includes(title)),
    );
    expect({
      rows: field.rows.length,
      stages: [...stages].toSorted(),
      field,
      headings: app.headings(),
      kinds: [
        'reference:not NFC',
        'reference:combining mark',
        'reference:astral',
        'reference:space',
        'reference:colons',
      ].filter((kind) => kinds.has(kind)),
      twins: [count('e\u0301:1'), count('\u00e9:1')],
      spoken: SPOKEN.map(count),
      drawn: spoken.size >= 8,
    }).toEqual({
      rows: references.length,
      stages: ['blade', 'ear', 'full corn', 'seed'],
      field: wantField(),
      headings: ['Your field'],
      kinds: [
        'reference:not NFC',
        'reference:combining mark',
        'reference:astral',
        'reference:space',
        'reference:colons',
      ],
      twins: [1, 1],
      spoken: SPOKEN.map(() => 1),
      drawn: true,
    });
    expect(
      field.rows.flatMap((row) => row.plants).find((plant) => plant.label?.startsWith('Other:'))
        ?.shown,
    ).toBe('0');
    const lowest = Math.min(...Object.values(app.readouts()));
    expect([lowest >= 4.5, field.faint, app.faults]).toEqual([true, [], []]);
    expect(await app.leave()).toEqual([]);
  });
});
