import { describe, expect, test } from 'bun:test';
import { Option } from 'effect';

import {
  clean,
  isSound,
  refill,
  repair,
  type LexiconEntry,
  type SourceEntry,
} from './strongs-clean.ts';

/** How many made-up entries each property draws. */
const DRAWS = 300;

/** A source of numbers in [0, 1), the same for the same seed (mulberry32), so a failing draw names its seed. */
const seeded = (seed: number) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};
type Random = ReturnType<typeof seeded>;

const between = (random: Random, low: number, high: number) =>
  low + Math.floor(random() * (high - low + 1));

const word = (random: Random) =>
  Array.from({ length: between(random, 2, 9) }, () =>
    String.fromCharCode(97 + between(random, 0, 25)),
  ).join('');

const words = (random: Random, low: number, high: number) =>
  Array.from({ length: between(random, low, high) }, () => word(random)).join(' ');

/** A made-up Strong's pronunciation as its syllables: the stress mark after one of them. */
const syllables = (random: Random) => {
  const count = between(random, 1, 4);
  const stressed = between(random, 0, count - 1);
  return Array.from({ length: count }, (_, index) =>
    [word(random).slice(0, 4), "'"].slice(0, 1 + Number(index === stressed)).join(''),
  );
};

/** A made-up definition as the sound entries write one: words, a dash, the KJV's renderings. */
const definition = (random: Random) => `${words(random, 3, 12)} — ${words(random, 1, 4)}.`;

/** A made-up entry with every defect a `null`-led one shows: `null`, a transliteration with letters dropped, a comma, the pronunciation split at a stressed syllable, two spaces, then the text written twice. */
const nullLed = (random: Random, said: ReadonlyArray<string>, body: string) => {
  const xlit = `${word(random)} ${word(random).slice(0, 2)}`;
  const written = said.join(' -').replace(/([^'])( -)/gu, '$1-');
  const once = `${xlit},${written}  ${body}`;
  return `null${once}${' '.repeat(between(random, 0, 1))}${once}`;
};

const draw = <T>(seed: number, make: (random: Random) => T) => {
  const random = seeded(seed);
  return Array.from({ length: DRAWS }, () => make(random));
};

describe('clean', () => {
  test('a sound entry comes back unchanged, though it holds the word null or a phrase twice', () => {
    for (const [index, entry] of draw(1, (random) => {
      const phrase = words(random, 1, 2);
      const def = `${phrase} null ${words(random, 2, 6)}, ${phrase} — ${words(random, 1, 3)}.`;
      return { lemma: word(random), xlit: word(random), def };
    }).entries()) {
      expect(isSound(entry), `draw ${index}`).toBe(true);
      expect(clean(entry), `draw ${index}`).toBe(entry);
    }
  });

  test('a null-led Greek entry written twice comes back as its one definition, its pronunciation in pron', () => {
    for (const [index, made] of draw(2, (random) => {
      const said = syllables(random);
      const body = definition(random);
      return {
        said,
        body,
        entry: { lemma: word(random), xlit: word(random), def: nullLed(random, said, body) },
      };
    }).entries()) {
      const cleaned = clean(made.entry);
      expect(cleaned.def, `draw ${index}`).toBe(made.body);
      expect(cleaned.pron, `draw ${index}`).toBe(made.said.join('-'));
      expect(Object.keys(cleaned), `draw ${index}`).toEqual(['lemma', 'xlit', 'def', 'pron']);
      expect(isSound(cleaned), `draw ${index}`).toBe(true);
    }
  });

  test('a null-led Hebrew entry keeps the pron it has and loses the copy of it in its definition', () => {
    for (const [index, made] of draw(3, (random) => {
      const said = syllables(random);
      const body = definition(random);
      const entry: LexiconEntry = {
        lemma: '',
        xlit: word(random),
        def: nullLed(random, said, body),
        pron: said.join('-'),
        kjvDef: `${words(random, 1, 3)}.`,
      };
      return { body, entry };
    }).entries()) {
      const cleaned = clean(made.entry);
      expect(cleaned, `draw ${index}`).toEqual({ ...made.entry, def: made.body });
    }
  });

  test('runs of spaces close and the ends are trimmed', () => {
    expect(clean({ lemma: 'x', def: '  first   second    — third.' })).toEqual({
      lemma: 'x',
      def: 'first second — third.',
    });
  });

  test('an entry with no letter is left for the source', () => {
    const entry = { lemma: 'x', xlit: 'y', def: '.' };
    expect(clean(entry)).toBe(entry);
    expect(isSound(entry)).toBe(false);
  });

  test('is idempotent over sound and defective entries alike', () => {
    for (const [index, entry] of draw(4, (random): LexiconEntry => {
      const said = syllables(random);
      const body = definition(random);
      const defs = [
        body,
        nullLed(random, said, body),
        `${words(random, 1, 3)}     ${body}`,
        '.',
        `null${said.join('-')}  ${body}`,
      ];
      const pick = between(random, 0, defs.length - 1);
      return { lemma: word(random), def: defs.slice(pick, pick + 1).join('') };
    }).entries())
      expect(clean(clean(entry)), `draw ${index}`).toEqual(clean(entry));
  });
});

describe('refill', () => {
  const source: SourceEntry = {
    lemma: 'λέξις',
    translit: 'léxis',
    derivation: 'from G1 (α) and (to say;',
    strongs_def: ' to speak out); {a} word, i.e. a  saying',
    kjv_def: 'word, saying',
  };

  test('an entry with no letter takes the source definition in the sound style, its spilled derivation set aside', () => {
    expect(refill('G9', { lemma: 'λέξις', xlit: 'lexis', def: '.' }, Option.some(source))).toEqual({
      lemma: 'λέξις',
      xlit: 'lexis',
      def: 'a word, i.e. a saying — word, saying.',
    });
  });

  test('a Hebrew entry takes the source lemma where it had none, and the source renderings', () => {
    const hebrew: SourceEntry = {
      lemma: 'דָּבָר',
      xlit: 'dâbâr',
      pron: "daw-baw'",
      derivation: 'from H1696 (דָּבַר);',
      strongs_def: 'a word; by implication, a matter',
      kjv_def: 'act, advice, word.',
    };
    expect(
      refill(
        'H1697',
        {
          lemma: '',
          xlit: 'dāḇār',
          def: "nulldaw-baw'  a word  matter",
          pron: "daw-baw'",
          kjvDef: 'act',
        },
        Option.some(hebrew),
      ),
    ).toEqual({
      lemma: 'דָּבָר',
      xlit: 'dāḇār',
      def: 'a word; by implication, a matter — act, advice, word.',
      pron: "daw-baw'",
      kjvDef: 'act, advice, word.',
    });
  });

  test('a null-led Greek entry keeps the pronunciation stage 1 found', () => {
    expect(
      refill(
        'G9',
        { lemma: 'λέξις', xlit: 'lexis', def: "nulll xis,lex' -is  from        to speak" },
        Option.some(source),
      ),
    ).toEqual({
      lemma: 'λέξις',
      xlit: 'lexis',
      def: 'a word, i.e. a saying — word, saying.',
      pron: "lex'-is",
    });
  });

  test('never replaces a sound entry, and with no source leaves what stage 1 made', () => {
    for (const [index, entry] of draw(5, (random) => ({
      lemma: '',
      xlit: word(random),
      def: definition(random),
    })).entries())
      expect(refill('H1', entry, Option.some(source)), `draw ${index}`).toBe(entry);
    const spaced = { lemma: 'x', def: 'one   two — three.' };
    expect(refill('G1', spaced, Option.none())).toEqual({ lemma: 'x', def: 'one two — three.' });
    const blank = { lemma: 'x', def: '.' };
    expect(refill('G1', blank, Option.none())).toBe(blank);
  });
});

describe('repair', () => {
  test('keeps a sound entry as stored, field order and all, and refills only the defective', () => {
    const stored = {
      H1: { lemma: '', xlit: 'a', pron: 'aw', def: 'sound text — here.', kjvDef: 'here.' },
      H2: { lemma: '', xlit: 'b', def: '.', pron: 'bee', kjvDef: 'there.' },
      H3: { lemma: '', xlit: 'c', def: 'cut   off — text.', pron: 'see', kjvDef: 'text.' },
    };
    const sources = {
      H2: { lemma: 'ב', strongs_def: 'whole text', kjv_def: 'there.' },
    };
    const result = repair(stored, Option.some(sources));
    expect(result.lexicon['H1']).toBe(stored.H1);
    expect(Object.keys({ ...result.lexicon['H1'] })).toEqual([
      'lemma',
      'xlit',
      'pron',
      'def',
      'kjvDef',
    ]);
    expect(result.lexicon['H2']).toEqual({
      lemma: 'ב',
      xlit: 'b',
      def: 'whole text — there.',
      pron: 'bee',
      kjvDef: 'there.',
    });
    expect(result.lexicon['H3']).toEqual({
      lemma: '',
      xlit: 'c',
      def: 'cut off — text.',
      pron: 'see',
      kjvDef: 'text.',
    });
    expect(result).toMatchObject({ cleaned: ['H3'], refilled: ['H2'], defective: [] });
  });
});
