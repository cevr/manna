/* oxlint-disable effect/noNullish, effect/noTernary -- Exact's app folder cannot import effect (docs/exact.md): a test over plain records. */

/**
 * The packs' strings, written then read, over generated made-up chapters:
 * every verse's references, every word's tags and every lexicon entry come
 * back exactly as they went in, with the edges named: a verse with no
 * references, a chapter whose last verses have none, a number with no
 * renderings, an added word, a word with three numbers, a field holding a
 * tab, a newline or a backslash. And the pack's checks: a made-up pack
 * passes, and each single corruption fails.
 */

import { describe, expect, it } from 'bun:test';

import { seeded, type Random } from '../test/random';
import {
  lexiconLineOf,
  lexiconLineText,
  lexiconParts,
  linePlace,
  LEXICON_BLOCK,
  type LexiconLine,
} from './lexicon';
import { studyBodyOf, studyCheckOf, studyPackOf } from './pack';
import { tagsChapterText, tagsOfVerse, tagsVerses, tagsVerseText, type WordTag } from './tags';
import { XREFS_KEPT, xrefsChapterText, xrefsOfVerse, xrefsVerses, type XrefPlace } from './xrefs';

const RUNS = 200;

const place = (random: Random): XrefPlace => {
  const verse = 1 + random.below(170);
  return {
    book: 1 + random.below(66),
    chapter: 1 + random.below(150),
    verse,
    last: random.chance(0.3) ? verse + 1 + random.below(5) : verse,
  };
};

/** A made-up chapter's references: some verses none, often the last ones none. */
const madeXrefs = (random: Random): Array<Array<XrefPlace>> => {
  const verses = Array.from({ length: 1 + random.below(40) }, () =>
    random.chance(0.3) ? [] : Array.from({ length: 1 + random.below(9) }, () => place(random)),
  );
  if (random.chance(0.5))
    for (let at = verses.length - 1 - random.below(3); at < verses.length; at++)
      if (at >= 0) verses[at] = [];
  return verses;
};

const madeTag = (random: Random): WordTag => ({
  added: random.chance(0.15),
  numbers: Array.from({ length: random.pick([0, 0, 1, 1, 1, 2, 3]) }, () => 1 + random.below(8674)),
});

const letters = 'abcdefghijklmnopqrstuvwxyz\t\n\\ ·ἀגּ:,';

const madeField = (random: Random) =>
  Array.from({ length: random.below(30) }, () => letters[random.below(letters.length)]).join('');

const madeLine = (random: Random): LexiconLine => ({
  lemma: madeField(random),
  xlit: madeField(random),
  pron: madeField(random),
  def: madeField(random),
  total: random.below(5000),
  renders: Array.from({ length: random.below(7) }, () => ({
    word: Array.from({ length: 1 + random.below(9) }, () => random.pick([..."abcdefgh'"])).join(''),
    count: 1 + random.below(900),
  })),
});

describe('the cross-references round trip', () => {
  it("each verse's first 6 references come back in order, and a verse with none or past the chapter's string has none", () => {
    const random = seeded(31);
    for (let run = 0; run < RUNS; run++) {
      const verses = madeXrefs(random);
      const read = xrefsVerses(xrefsChapterText(verses));
      verses.forEach((places, at) => {
        expect(xrefsOfVerse(read[at] ?? '')).toEqual(places.slice(0, XREFS_KEPT));
      });
      expect(read.length).toBeLessThanOrEqual(verses.length);
      expect(xrefsOfVerse(read[verses.length + 1] ?? '')).toEqual([]);
    }
  });
});

describe('the tags round trip', () => {
  it('every word comes back with its numbers and its added mark, and a bare verse comes back bare', () => {
    const random = seeded(32);
    for (let run = 0; run < RUNS; run++) {
      const verses = Array.from({ length: 1 + random.below(30) }, () =>
        random.chance(0.1)
          ? undefined
          : Array.from({ length: 1 + random.below(40) }, () => madeTag(random)),
      );
      const read = tagsVerses(tagsChapterText(verses.map(tagsVerseText)));
      expect(read.length).toBe(verses.length);
      verses.forEach((tags, at) => {
        expect(tagsOfVerse(read[at] ?? '')).toEqual(tags);
      });
    }
  });

  it('an added word with no number, and a word with three numbers', () => {
    const tags: Array<WordTag> = [
      { added: true, numbers: [] },
      { added: false, numbers: [3588, 2316, 25] },
      { added: true, numbers: [1] },
    ];
    expect(tagsVerseText(tags)).toBe('~- 3588+2316+25 ~1');
    expect(tagsOfVerse(tagsVerseText(tags))).toEqual(tags);
  });
});

describe('the lexicon round trip', () => {
  it('every entry comes back field for field, a missing number missing, a number with no renderings with none', () => {
    const random = seeded(33);
    for (let run = 0; run < 8; run++) {
      const side = () =>
        Array.from({ length: 1 + random.below(1600) }, () =>
          random.chance(0.1) ? undefined : madeLine(random),
        );
      const hebrew = side();
      const greek = side();
      const parts = lexiconParts(hebrew, greek);
      const read = (letter: 'H' | 'G', n: number) => {
        const at = linePlace(parts, { letter, n });
        if (at === undefined) return undefined;
        return lexiconLineOf((parts[at[0]] ?? '').split('\n')[at[1]] ?? '');
      };
      hebrew.forEach((line, index) => expect(read('H', index + 1)).toEqual(line));
      greek.forEach((line, index) => expect(read('G', index + 1)).toEqual(line));
      expect(read('H', Math.ceil(hebrew.length / LEXICON_BLOCK) * LEXICON_BLOCK + 1)).toBe(
        undefined,
      );
      expect(read('G', greek.length + LEXICON_BLOCK * 3)).toBe(undefined);
    }
  });

  it('a line holding a tab, a newline and a backslash in its fields reads back whole', () => {
    const line: LexiconLine = {
      lemma: 'a\tb',
      xlit: 'c\nd',
      pron: 'e\\f',
      def: '\\n\\t',
      total: 0,
      renders: [],
    };
    expect(lexiconLineText(line).includes('\n')).toBe(false);
    expect(lexiconLineOf(lexiconLineText(line))).toEqual(line);
  });
});

describe("the pack's checks", () => {
  const madePack = (random: Random) =>
    studyPackOf(
      Array.from({ length: 1 + random.below(20) }, () => xrefsChapterText(madeXrefs(random))),
    );
  const faultOf = (body: string, parts?: number) => {
    const checked = studyCheckOf(parts)(body);
    return checked._tag === 'Bad' ? checked.fault : 'good';
  };

  it('a made-up pack passes, its version in its head, and its parts come back', () => {
    const random = seeded(34);
    for (let run = 0; run < 50; run++) {
      const pack = madePack(random);
      const body = studyBodyOf(pack);
      expect(faultOf(body)).toBe('good');
      expect(faultOf(body, pack.count)).toBe('good');
      expect(body.slice(0, 256)).toContain(`"version":"${pack.version}"`);
      const checked = studyCheckOf()(body);
      expect(checked._tag === 'Good' ? checked.pack.parts : []).toEqual(pack.parts);
    }
  });

  it('a body cut short, a changed part, a wrong count, a wrong version or another format fails', () => {
    const random = seeded(35);
    for (let run = 0; run < 50; run++) {
      const pack = madePack(random);
      const body = studyBodyOf(pack);
      expect(faultOf(body.slice(0, random.below(body.length)))).not.toBe('good');
      expect(faultOf(studyBodyOf({ ...pack, parts: [...pack.parts, ''] }))).toBe('count');
      expect(faultOf(body, pack.count + 1)).toBe('parts');
      expect(faultOf(studyBodyOf({ ...pack, parts: pack.parts.map((part) => `${part}x`) }))).toBe(
        'sum',
      );
      expect(faultOf(studyBodyOf({ ...pack, version: `${pack.count}-00000000` }))).toBe(
        pack.version === `${pack.count}-00000000` ? 'good' : 'version',
      );
      expect(faultOf(studyBodyOf({ ...pack, format: 2 }))).toBe('format');
      expect(faultOf('{"format":1}')).toBe('fields');
    }
  });
});
