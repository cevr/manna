// A member's library reference: its kept sheets in one order when any is
// kept, else the references its record names; and the prompt's line for it,
// numbered among the call's references, saying the record wins on the person
// and leaving what the member wears and does to the brief.

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
  test('is its own figures, cut from a kept sheet that draws other members too', () => {
    // The villagers' poses sheet draws six figures; the child keeps only the fifth.
    const box = [0, 0, 10, 10] as const;
    const lock = castLock(
      {
        ...record,
        sheets: {
          poses: {
            anchor: 5,
            layout: 'six villagers in a row',
            slots: ['left', 'front', 'right', 'front', 'right', 'front'],
            tries: [],
          },
        },
        kept: {
          turnaround: kept,
          poses: { ...kept, views: [{ view: 5, name: 'poses-5', box }] },
        },
      },
      '/c',
    );
    expect(lock.files).toEqual(['/c/kept/turnaround.png', '/c/views/poses-5.png']);
    expect(castLockNote(lock, 2)).toContain(
      'its kept cast sheet: turnaround, poses (its own figures, cut from a sheet that draws others too)',
    );
  });
  test('is the references its record names while nothing is kept', () => {
    const lock = castLock(record, '/c/');
    expect(lock.files).toEqual(['/c/rig-christ-front.png', '/c/christ-court-12.png']);
    expect(lock.kept).toEqual([]);
  });
  test('says its images by their numbers among the call, and that they win on the person', () => {
    const note = castLockNote(castLock(record, '/c'), 3);
    expect(note).toContain("Reference images 3–4 are Christ's record in the cast library");
    expect(note).toContain(
      'draw Christ as they draw Him: face, hair, skin, build and height in heads',
    );
    expect(note).toContain('Where any other reference image draws Him otherwise, these win.');
    const one = castLockNote(castLock({ ...record, kept: { turnaround: kept } }, '/c'), 2);
    expect(one).toContain(
      "Reference image 2 is Christ's record in the cast library (its kept cast sheet: turnaround)",
    );
    expect(one).toContain('this one wins');
  });
  test("leaves what the member wears and does to the brief, so a beat's own dress is drawn", () => {
    // `name` and `thesis` dress Christ in the linen coat and mantle (OQ5),
    // while His record's references draw the court robe.
    const note = castLockNote(castLock(record, '/c'), 5);
    expect(note).not.toContain('dress and colours');
    expect(note).not.toContain('or the brief draws Him otherwise');
    expect(note).toContain(
      "What Christ wears and does is the brief's: where the brief names a garment or an act, draw that",
    );
  });
  test("claims for a sheet of heads alone only the face and hair, the rest the brief's", () => {
    const note = castLockNote(castLock({ ...record, kept: { heads: kept } }, '/c'), 2);
    expect(note).toContain("draw Christ's face and hair as it draws them");
    expect(note).not.toContain('height in heads');
    expect(note).toContain("It shows no body: Christ's build, dress and act are the brief's.");
  });
  test("names a film's own role as this film's cast, its name's possessive as written", () => {
    const note = castLockNote(
      castLock(
        { ...record, member: Segment.make('idea-villagers'), scope: 'film', who: 'them' },
        '/c',
      ),
      2,
    );
    expect(note).toContain("Reference images 2–3 are Idea villagers' record in this film's cast");
  });
});
