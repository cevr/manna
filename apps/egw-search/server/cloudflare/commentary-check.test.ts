import { describe, expect, test } from 'bun:test';

import { differingVerses, judge, noteVerses, verseCounts } from './commentary-check.ts';

describe('the commentary check', () => {
  test("reads each verse's note count, a whole chapter under verse 0", () => {
    expect([
      ...verseCounts({
        verses: {
          '43.1': [
            [0, [2]],
            [14, [0, 1, 3]],
          ],
          '1.1': [[1, [4]]],
        },
      }),
    ]).toEqual([
      ['43.1:0', 1],
      ['43.1:14', 3],
      ['1.1:1', 1],
    ]);
  });

  test('names each verse whose count differs, either side missing it as 0', () => {
    const local = new Map([
      ['43.1:14', 35],
      ['43.1:1', 31],
      ['1.1:1', 1],
    ]);
    const live = new Map([
      ['43.1:14', 1],
      ['43.1:1', 31],
      ['2.1:1', 2],
    ]);
    expect(differingVerses(local, live)).toEqual(['1.1:1 1/0', '2.1:1 0/2', '43.1:14 35/1']);
    expect(differingVerses(local, local)).toEqual([]);
  });

  test("reads each note's verses by reference, a repeated reference numbered", () => {
    const pack = {
      notes: [
        ['7BC 913.1', 'a'],
        ['', 'b'],
        ['', 'c'],
      ] as const,
      verses: {
        '43.1': [
          [1, [0]],
          [14, [0, 2]],
        ],
      } as const,
    };
    expect([...noteVerses(pack)].map(([key, verses]) => [key, [...verses]])).toEqual([
      ['7BC 913.1', ['43.1:1', '43.1:14']],
      ['', []],
      ['#2', ['43.1:14']],
    ]);
  });
});

/** A pack of `size` notes `N <n>`, each linked to John 1:<n> and, the first
 *  twelve, to John 1:14 as well, with `edit` applied to each note's verses. */
const packOf = (
  size: number,
  edit: (note: number, verses: readonly number[]) => readonly number[] = (_, verses) => verses,
  prefix = 'N',
) => {
  const notes = Array.from(
    { length: size },
    (_, note) => [`${prefix} ${String(note)}`, ''] as const,
  );
  const byVerse = new Map<number, number[]>();
  notes.forEach((_, note) => {
    for (const verse of edit(note, [note + 20, ...[14].filter(() => note < 12)]))
      byVerse.set(verse, [...(byVerse.get(verse) ?? []), note]);
  });
  return {
    notes,
    verses: { '43.1': [...byVerse].sort(([a], [b]) => a - b) },
  };
};

describe('judging the live pack by the local one', () => {
  test('passes on drift: a few relinked notes and a few notes on one side alone', () => {
    const local = packOf(200);
    const live = packOf(204, (note, verses) =>
      verses.filter((verse) => note !== 3 || verse !== 14),
    );
    const judgement = judge(local, live);
    expect(judgement).toEqual({
      shared: 200,
      relinked: ['N 3 2/1'],
      localOnly: 0,
      liveOnly: 4,
      failures: [],
    });
  });

  test('fails when citations are read by their title alone: the notes relink', () => {
    const local = packOf(200, (note, verses) => [...verses, note + 400]);
    const live = packOf(200);
    expect(judge(local, live).failures).toEqual(['200 of 200 shared notes link other verses live']);
  });

  test('fails at more than one shared note in a hundred relinked', () => {
    const relinking = (count: number) =>
      judge(
        packOf(200),
        packOf(200, (note, verses) => verses.filter(() => note < 100 || note >= 100 + count)),
      ).failures;
    expect(relinking(2)).toEqual([]);
    expect(relinking(3)).toEqual(['3 of 200 shared notes link other verses live']);
  });

  test('fails when either side holds more than one note in twenty alone', () => {
    expect(judge(packOf(200), packOf(190)).failures).toEqual([]);
    expect(judge(packOf(200), packOf(189)).failures).toEqual([
      '11 of 200 local notes are not live',
    ]);
    expect(judge(packOf(200), packOf(211)).failures).toEqual([
      '11 of 211 live notes are not local',
    ]);
  });

  test('fails when no reference is shared, as a renamed volume would', () => {
    expect(
      judge(
        packOf(20),
        packOf(20, (_, verses) => verses, 'M'),
      ).failures,
    ).toEqual(['20 of 20 local notes are not live', '20 of 20 live notes are not local']);
  });

  test('fails when John 1:14 has fewer than ten notes live', () => {
    const fewer = packOf(200, (note, verses) => verses.filter((verse) => note < 3 || verse !== 14));
    expect(judge(fewer, fewer).failures).toEqual(['John 1:14 has 3 notes live, under 10']);
  });
});
