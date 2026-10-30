// A member's single drawings: a `single` sheet holds any number of drawings,
// each kept as its own file (`kept/single-<n>.png`) and its own view
// (`single-<n>`), and keeping one leaves every other kind, and the lock a
// prompt sends, as it was.

import { describe, expect, test } from 'bun:test';
import { Schema } from 'effect';
import { CastSheetJson, keptOf, replacedSince, viewName, withCastKept } from './cast-record.ts';
import type { CastKept, CastSheetRecord } from './cast-record.ts';
import { castLock } from './cast-lock.ts';
import { keptFile } from './cast-sheet.ts';

const single = (n: number): CastKept => ({
  try: n,
  why: 'the owner kept it',
  ask: 'a93a4b6e7a8',
  views: [{ view: 1, name: `single-${n}`, box: [0, 0, 512, 1024] }],
});

const drawn = (n: number) => ({
  n,
  file: `single-${n}.png`,
  prompt: 'one standing figure on the paper ground',
  refs: [],
  underlay: false,
  flags: [],
  at: '2026-10-30T00:00:00.000Z',
});

const json = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown))({
  member: 'lead-feast',
  scope: 'film',
  who: 'Him',
  refs: [],
  sheets: {
    single: {
      anchor: 1,
      layout: 'one standing figure',
      slots: ['front'],
      standing: [1],
      level: [1],
      tries: [drawn(1), drawn(2)],
    },
  },
  kept: {
    turnaround: { try: 3, why: 'kept', views: [] },
    single: [single(1), single(2)],
  },
});

const record: CastSheetRecord = Schema.decodeSync(CastSheetJson)(json);

describe("a member's single drawings", () => {
  test('a record with two kept single drawings decodes, each drawing its own keep', () => {
    expect(keptOf(record, 'single').map((k) => k.views.map((v) => v.name))).toEqual([
      ['single-1'],
      ['single-2'],
    ]);
  });

  test('are named single-1 and single-2 as views', () => {
    expect([viewName('single', 1), viewName('single', 2)]).toEqual(['single-1', 'single-2']);
  });

  test('are each kept as its own file, while a sheet kind keeps one file by its kind', () => {
    expect(keptFile('single', 'single-1')).toBe('kept/single-1.png');
    expect(keptFile('single', 'single-2')).toBe('kept/single-2.png');
    expect(keptFile('turnaround', 'front')).toBe('kept/turnaround.png');
    expect(keptFile('poses', 'poses-3')).toBe('kept/poses.png');
  });

  test("stay out of the member's lock, which sends his kept sheets as it did before", () => {
    const lock = castLock(record, '/c');
    expect(lock.kept).toEqual(['turnaround']);
    expect(lock.files).toEqual(['/c/kept/turnaround.png']);
  });

  test('a third keep is added beside the others, and a keep of a drawing already kept replaces it alone', () => {
    const third = withCastKept(record, 'single', single(3));
    expect(keptOf(third, 'single').map((k) => k.try)).toEqual([1, 2, 3]);
    const again = withCastKept(third, 'single', { ...single(2), try: 7 });
    expect(keptOf(again, 'single').map((k) => k.try)).toEqual([1, 7, 3]);
    expect(again.kept?.turnaround).toEqual(record.kept?.turnaround);
  });

  test('a replaced drawing changes its own file only', () => {
    const replaced: CastSheetRecord = {
      ...record,
      replaced: [
        {
          kind: 'single',
          kept: single(2),
          by: 4,
          folder: 'old',
          ask: 'a',
          why: 'w',
          at: '2026-10-30T00:00:00Z',
        },
      ],
    };
    expect(replacedSince(replaced, 'kept/single-2.png', '2026-10-29T00:00:00Z')).toBe(true);
    expect(replacedSince(replaced, 'kept/single-1.png', '2026-10-29T00:00:00Z')).toBe(false);
    expect(replacedSince(replaced, 'kept/turnaround.png', '2026-10-29T00:00:00Z')).toBe(false);
  });
});
