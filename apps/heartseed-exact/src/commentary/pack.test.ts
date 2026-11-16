/* oxlint-disable effect/noNullish, effect/noTernary, effect/noGlobals -- Exact's app folder cannot import effect (docs/exact.md): a test over plain records, each corrupt body written with `JSON.stringify` as a server would send it. */

/**
 * The pack's checks and its reader, over generated made-up packs: every
 * good pack passes; each single corruption fails, by the check it breaks;
 * a chapter reads exactly the pack's notes for it, verses ascending. And
 * the shared vector: `sumOf` answers the numbers `hs-bc-api`'s test writes,
 * so the phone and the server sum alike.
 */

import { describe, expect, it } from 'bun:test';

import { sumOf } from '../text/sum';
import { bodyOf, madePack, packOf } from '../test/commentary-packs';
import { seeded, type Random } from '../test/random';
import {
  checkPack,
  countsOf,
  readOf,
  versionOf,
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

  it('a byte dropped anywhere before the verses fails (the sum covers the notes, not the index)', () => {
    const random = seeded(16);
    for (let run = 0; run < PACKS; run++) {
      const body = bodyOf(fullPack(random));
      const at = random.below(body.indexOf('"verses"'));
      expect(faultOf(body.slice(0, at) + body.slice(at + 1))).not.toBe('good');
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
