// A member's library reference: its kept sheets in one order when any is
// kept, else the references its record names; and the prompt's line for it,
// numbered among the call's references, saying the library wins.

import { describe, expect, test } from 'bun:test';
import type { CastSheetRecord } from './cast-record.ts';
import { castLock, castLockNote } from './cast-lock.ts';
import { Segment } from './segment.ts';

const kept = { try: 2, why: 'the owner kept it', views: [] };
const record: CastSheetRecord = {
  member: Segment.make('christ'),
  scope: 'library',
  who: 'Him',
  refs: [
    { file: 'rig-christ-front.png', why: 'the rig as it stands' },
    { file: 'christ-court-12.png', why: 'a kept concept' },
  ],
  sheets: {},
};

describe("a member's library reference", () => {
  test('is its kept sheets, the turnaround first, then the heads, then the poses', () => {
    const lock = castLock(
      { ...record, kept: { poses: kept, turnaround: kept, heads: kept } },
      '/c',
    );
    expect(lock.files).toEqual([
      '/c/kept/turnaround.png',
      '/c/kept/heads.png',
      '/c/kept/poses.png',
    ]);
    expect(lock.kept).toEqual(['turnaround', 'heads', 'poses']);
  });
  test('is the references its record names while nothing is kept', () => {
    const lock = castLock(record, '/c/');
    expect(lock.files).toEqual(['/c/rig-christ-front.png', '/c/christ-court-12.png']);
    expect(lock.kept).toEqual([]);
  });
  test('says its images by their numbers among the call, and that they win', () => {
    const note = castLockNote(castLock(record, '/c'), 3);
    expect(note).toContain("Reference images 3–4 are Christ's record in the cast library");
    expect(note).toContain('draw Christ exactly as they draw Him');
    expect(note).toContain('draws Him otherwise, these win');
    const one = castLockNote(castLock({ ...record, kept: { turnaround: kept } }, '/c'), 2);
    expect(one).toContain(
      "Reference image 2 is Christ's record in the cast library (its kept cast sheet: turnaround)",
    );
    expect(one).toContain('this one wins');
  });
});
