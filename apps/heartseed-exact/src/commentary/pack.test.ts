/* oxlint-disable effect/noNullish, effect/noTernary, effect/noGlobals -- Exact's app folder cannot import effect (docs/exact.md): a test over plain records, each corrupt body written with `JSON.stringify` as a server would send it. */

/**
 * The pack's checks and its reader, over generated made-up packs: every
 * good pack passes; each single corruption fails, by the check it breaks;
 * a chapter reads exactly the pack's notes for it, verses ascending. And
 * the shared vector: `sumOf` and `packSum` answer the numbers egw-search's
 * test writes, so the phone and the server sum alike.
 */

import { describe, expect, it } from 'bun:test';

import { sumOf } from '../text/sum';
import { bodyOf, madePack, packOf } from '../test/commentary-packs';
import { seeded, type Random } from '../test/random';
import {
  checkPack,
  countsOf,
  packSum,
  readOf,
  versionOf,
  type CommentaryNote,
  type CommentaryPack,
  type PackFault,
} from './pack';

const PACKS = 120;

const faultOf = (body: string) => {
  const checked = checkPack(body);
  return checked._tag === 'Bad' ? checked.fault : 'good';
};

/** A pack with at least one note and one linked verse. */
const fullPack = (random: Random): CommentaryPack => {
  for (;;) {
    const pack = madePack(random, 30);
    if (pack.count > 0 && Object.keys(pack.verses).length > 0) return pack;
  }
};

describe('the shared vector', () => {
  it("sumOf answers the numbers hs-bc-api's test writes", () => {
    expect(['a', '1BC 24.1\nx', ''].map(sumOf)).toEqual([3826002220, 377222876, 2166136261]);
  });

  it("packSum answers the numbers egw-search's test writes", () => {
    expect([
      packSum([], {}),
      packSum([['1BC 1.1', 'ka lo']], { '1.1': [[0, [0]]] }),
      packSum(
        [
          ['1BC 1.1', 'ka lo'],
          ['2BC 3.4', 'mi'],
        ],
        {
          '1.1': [
            [0, [0]],
            [3, [0, 1]],
          ],
          '19.92': [[16, [1]]],
        },
      ),
    ]).toEqual([2166136261, 1914939250, 4063412732]);
  });

  it("packSum tells apart the two packs egw-search's test writes, which join alike line by line", () => {
    expect([
      packSum(
        [
          ['1BC 1.1', 'ka\nlo'],
          ['2BC 3.4', 'mi'],
        ],
        { '1.1': [[0, [0, 1]]] },
      ),
      packSum(
        [
          ['1BC 1.1', 'ka'],
          ['lo\n2BC 3.4', 'mi'],
        ],
        { '1.1': [[0, [0, 1]]] },
      ),
    ]).toEqual([3892575022, 1686813255]);
  });
});

describe('the checks', () => {
  it('a made-up pack passes, and its version is its count and sum', () => {
    const random = seeded(11);
    for (let run = 0; run < PACKS; run++) {
      const pack = madePack(random);
      expect(faultOf(bodyOf(pack))).toBe('good');
      expect(pack.version).toBe(`${pack.count}-${pack.sum.toString(16).padStart(8, '0')}`);
    }
  });

  it('a body cut short anywhere fails', () => {
    const random = seeded(12);
    for (let run = 0; run < PACKS; run++) {
      const body = bodyOf(fullPack(random));
      expect(faultOf(body.slice(0, random.below(body.length)))).not.toBe('good');
    }
  });

  it('a byte dropped anywhere fails (the sum covers the notes and the verse map)', () => {
    const random = seeded(16);
    for (let run = 0; run < PACKS; run++) {
      const body = bodyOf(fullPack(random));
      const at = random.below(body.length);
      expect(faultOf(body.slice(0, at) + body.slice(at + 1))).not.toBe('good');
    }
  });

  it('any one-field edit of a pack, its sum and version kept, fails its sum', () => {
    type Edit = (pack: CommentaryPack, random: Random) => CommentaryPack | undefined;
    type VerseNotes = readonly [number, ReadonlyArray<number>];
    /** `change` of one verse of one chapter, picked at random; none where it does not apply. */
    const verseEdit =
      (
        change: (entry: VerseNotes, count: number, random: Random) => VerseNotes | undefined,
      ): Edit =>
      (pack, random) => {
        const keys = Object.keys(pack.verses);
        if (keys.length === 0) return undefined;
        const key = random.pick(keys);
        const chapter = pack.verses[key] ?? [];
        const at = random.below(chapter.length);
        const entry = chapter[at];
        const changed = entry === undefined ? undefined : change(entry, pack.count, random);
        return changed === undefined
          ? undefined
          : { ...pack, verses: { ...pack.verses, [key]: chapter.with(at, changed) } };
      };
    /** Two different places of `items`, picked at random; none with fewer than two. */
    const twoOf = (random: Random, length: number): readonly [number, number] | undefined => {
      if (length < 2) return undefined;
      const left = random.below(length);
      return [left, (left + 1 + random.below(length - 1)) % length];
    };
    const edits = {
      'a verse renumbered': verseEdit(([verse, indexes]) => [verse + 100, indexes]),
      'an index dropped': verseEdit(([verse, indexes], _count, random) =>
        indexes.length === 0
          ? undefined
          : [verse, indexes.toSpliced(random.below(indexes.length), 1)],
      ),
      'an index pointed elsewhere': verseEdit(([verse, indexes], count, random) => {
        const at = random.below(indexes.length);
        return count < 2 || indexes.length === 0
          ? undefined
          : [verse, indexes.with(at, ((indexes[at] ?? 0) + 1) % count)];
      }),
      'an index added': verseEdit(([verse, indexes], count) => {
        const added = Array.from({ length: count }, (_, index) => index).find(
          (index) => !indexes.includes(index),
        );
        return added === undefined ? undefined : [verse, [...indexes, added].sort((a, b) => a - b)];
      }),
      'a verse dropped': (pack, random) => {
        const keys = Object.keys(pack.verses);
        if (keys.length === 0) return undefined;
        const key = random.pick(keys);
        const chapter = pack.verses[key] ?? [];
        const at = random.below(chapter.length);
        return { ...pack, verses: { ...pack.verses, [key]: chapter.filter((_, i) => i !== at) } };
      },
      'a chapter moved': (pack, random) => {
        const keys = Object.keys(pack.verses);
        if (keys.length === 0) return undefined;
        const key = random.pick(keys);
        return {
          ...pack,
          verses: Object.fromEntries(
            Object.entries(pack.verses).map(([name, verses]) => [
              name === key ? `${name}0` : name,
              verses,
            ]),
          ),
        };
      },
      "two chapters' verses swapped": (pack, random) => {
        const keys = Object.keys(pack.verses);
        const two = twoOf(random, keys.length);
        if (two === undefined) return undefined;
        const [left, right] = [keys[two[0]] ?? '', keys[two[1]] ?? ''];
        const [leftVerses, rightVerses] = [pack.verses[left] ?? [], pack.verses[right] ?? []];
        if (JSON.stringify(leftVerses) === JSON.stringify(rightVerses)) return undefined;
        return { ...pack, verses: { ...pack.verses, [left]: rightVerses, [right]: leftVerses } };
      },
      'two chapters in the other order': (pack, random) => {
        const entries = Object.entries(pack.verses);
        const two = twoOf(random, entries.length);
        if (two === undefined) return undefined;
        const [left, right] = two;
        const reordered = entries
          .with(left, entries[right] ?? ['', []])
          .with(right, entries[left] ?? ['', []]);
        return { ...pack, verses: Object.fromEntries(reordered) };
      },
      'a reference changed': (pack, random) => {
        const at = random.below(pack.count);
        const [reference, text] = pack.notes[at] ?? ['', ''];
        return { ...pack, notes: pack.notes.with(at, [`${reference}x`, text]) };
      },
      'two notes swapped': (pack, random) => {
        const two = twoOf(random, pack.count);
        if (two === undefined) return undefined;
        const [left, right] = two;
        const blank: CommentaryNote = ['', ''];
        const [leftNote, rightNote] = [pack.notes[left] ?? blank, pack.notes[right] ?? blank];
        if (leftNote.join('\n') === rightNote.join('\n')) return undefined;
        return { ...pack, notes: pack.notes.with(left, rightNote).with(right, leftNote) };
      },
      'two texts swapped': (pack, random) => {
        const two = twoOf(random, pack.count);
        if (two === undefined) return undefined;
        const [left, right] = two;
        const [leftReference, leftText] = pack.notes[left] ?? ['', ''];
        const [rightReference, rightText] = pack.notes[right] ?? ['', ''];
        if (leftText === rightText) return undefined;
        return {
          ...pack,
          notes: pack.notes
            .with(left, [leftReference, rightText])
            .with(right, [rightReference, leftText]),
        };
      },
    } satisfies Record<string, Edit>;
    for (const [name, edit] of Object.entries(edits)) {
      const random = seeded(17);
      let checked = 0;
      for (let run = 0; run < PACKS; run++) {
        const edited = edit(fullPack(random), random);
        if (edited === undefined) continue;
        expect([name, faultOf(bodyOf(edited))]).toEqual([name, 'sum']);
        checked += 1;
      }
      expect([name, checked > PACKS / 2]).toEqual([name, true]);
    }
  });

  it('a line moved across a note boundary, every line the same, fails its sum', () => {
    const random = seeded(18);
    for (let run = 0; run < PACKS; run++) {
      const pack = fullPack(random);
      if (pack.count < 2) continue;
      const at = random.below(pack.count - 1);
      const [reference, text] = pack.notes[at] ?? ['', ''];
      const [nextReference, nextText] = pack.notes[at + 1] ?? ['', ''];
      const before = packOf(
        pack.notes.with(at, [reference, text]).with(at + 1, [nextReference, `${nextText}\nq`]),
        pack.verses,
      );
      const notes = before.notes
        .with(at, [reference, `${text}\n${nextReference}`])
        .with(at + 1, [nextText, 'q']);
      expect(notes.flat().join('\n')).toBe(before.notes.flat().join('\n'));
      expect(faultOf(bodyOf(before))).toBe('good');
      expect(faultOf(bodyOf({ ...before, notes }))).toBe('sum');
    }
  });

  it("one character changed in a note's text fails its sum", () => {
    const random = seeded(13);
    for (let run = 0; run < PACKS; run++) {
      const pack = fullPack(random);
      const index = random.below(pack.count);
      const [reference, text] = pack.notes[index] ?? ['', ''];
      const at = random.below(text.length);
      const swapped = text.slice(0, at) + (text[at] === 'q' ? 'z' : 'q') + text.slice(at + 1);
      const notes = pack.notes.map((note, i) =>
        i === index ? ([reference, swapped] as const) : note,
      );
      expect(faultOf(bodyOf({ ...pack, notes }))).toBe('sum');
    }
  });

  it('each wrong field fails by its own name', () => {
    const random = seeded(14);
    const cases: ReadonlyArray<readonly [PackFault, (pack: CommentaryPack) => unknown]> = [
      ['format', (pack) => ({ ...pack, format: 2 })],
      ['count', (pack) => ({ ...pack, count: pack.count + 1 })],
      ['sum', (pack) => ({ ...pack, sum: (pack.sum + 1) >>> 0 })],
      ['version', (pack) => ({ ...pack, version: versionOf(pack.count, (pack.sum + 1) >>> 0) })],
      [
        'index',
        (pack) => {
          const [key, verses] = Object.entries(pack.verses)[0] ?? ['1.1', []];
          const [verse] = verses[0] ?? [1];
          return {
            ...pack,
            verses: { ...pack.verses, [key]: [[verse, [pack.count]], ...verses.slice(1)] },
          };
        },
      ],
      ['fields', (pack) => ({ ...pack, notes: [...pack.notes, ['ref']] })],
      ['fields', (pack) => ({ ...pack, verses: { 'x.1': [] } })],
      ['fields', ({ format: _format, ...rest }) => rest],
    ];
    for (let run = 0; run < PACKS / 4; run++) {
      const pack = fullPack(random);
      for (const [fault, corrupt] of cases)
        expect(faultOf(JSON.stringify(corrupt(pack)))).toBe(fault);
    }
  });

  it('a body that is not JSON fails as json', () => {
    for (const body of ['', 'not json', '{"format":1', '<html>Bad gateway</html>'])
      expect(faultOf(body)).toBe('json');
  });
});

describe('the reader', () => {
  it("answers exactly the pack's notes for a chapter, verses ascending, verse 0 kept", () => {
    const random = seeded(15);
    for (let run = 0; run < PACKS; run++) {
      const pack = madePack(random);
      for (const key of [...Object.keys(pack.verses), '43.3']) {
        const [book, chapter] = key.split('.').map(Number) as [number, number];
        const read = readOf(pack, book, chapter);
        const counts = countsOf(pack, book, chapter);
        const expected = (pack.verses[key] ?? []).map(([verse, indexes]) => ({
          verse,
          notes: indexes.map((index) => {
            const [ref, text] = pack.notes[index] ?? ['', ''];
            return { ref, text };
          }),
        }));
        expect(read).toEqual({ have: true, verses: expected });
        expect(counts).toEqual({
          have: true,
          verses: expected.map(({ verse, notes }) => ({ verse, notes: notes.length })),
        });
        const verses = read.verses.map(({ verse }) => verse);
        expect(verses).toEqual([...verses].sort((a, b) => a - b));
      }
    }
  });

  it('a chapter with no notes answers no verses, and no pack answers have false', () => {
    const pack = packOf([['1BC 1.1', 'ka lo']], { '1.1': [[0, [0]]] });
    expect(readOf(pack, 1, 1).verses[0]?.verse).toBe(0);
    expect(readOf(pack, 1, 2)).toEqual({ have: true, verses: [] });
    expect(readOf(undefined, 1, 1)).toEqual({ have: false, verses: [] });
    expect(countsOf(undefined, 1, 1)).toEqual({ have: false, verses: [] });
  });
});
