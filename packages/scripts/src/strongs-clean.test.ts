import { describe, expect, test } from 'bun:test';
import { Option } from 'effect';

import { repair, type SourceEntry } from './strongs-clean/rules.ts';

type Stored = Readonly<Record<string, string>>;
type Source = typeof SourceEntry.Type;

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

/** A made-up Strong's pronunciation as its syllables, the stress mark after one of them. */
const syllables = (random: Random) => {
  const count = between(random, 1, 4);
  const stressed = between(random, 0, count - 1);
  return Array.from({ length: count }, (_, index) =>
    [word(random).slice(0, 4), "'"].slice(0, 1 + Number(index === stressed)).join(''),
  );
};

/** A made-up definition as the sound entries write one: words, a dash, the KJV's renderings. */
const definition = (random: Random) => `${words(random, 3, 12)} — ${words(random, 1, 4)}.`;

/** A made-up definition with every defect a `null`-led one shows: `null`, a transliteration with letters dropped, a comma, the pronunciation split after its stressed syllable, two spaces, then the text written twice. */
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

/** One entry through the repair, as number `number`, with the source entry given or none. */
const repaired = (number: string, entry: Stored, source: Option.Option<Source>) => {
  const result = repair(
    { [number]: entry },
    Option.map(source, (found) => ({ [number]: found })),
  );
  return { entry: result.lexicon[number], ...result };
};

const stage1 = (entry: Stored) => repaired('G1', entry, Option.none()).entry;

describe('stage 1, by rule', () => {
  test('a sound entry comes back as stored, though it holds the word null or a phrase twice', () => {
    for (const [index, entry] of draw(1, (random) => {
      const phrase = words(random, 1, 2);
      const def = `${phrase} null ${words(random, 2, 6)}, ${phrase} — ${words(random, 1, 3)}.`;
      return { lemma: word(random), xlit: word(random), def };
    }).entries())
      expect(stage1(entry), `draw ${index}`).toBe(entry);
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
      const result = repaired('G7', made.entry, Option.none());
      expect(result.entry, `draw ${index}`).toEqual({
        ...made.entry,
        def: made.body,
        pron: made.said.join('-'),
      });
      expect(Object.keys({ ...result.entry }), `draw ${index}`).toEqual([
        'lemma',
        'xlit',
        'def',
        'pron',
      ]);
      expect(result.defective, `draw ${index}`).toEqual([]);
    }
  });

  test('a null-led Hebrew entry keeps the pron it has and loses the copy of it in its definition', () => {
    for (const [index, made] of draw(3, (random) => {
      const said = syllables(random);
      const body = definition(random);
      const entry = {
        lemma: '',
        xlit: word(random),
        def: nullLed(random, said, body),
        pron: said.join('-'),
        kjvDef: `${words(random, 1, 3)}.`,
      };
      return { body, entry };
    }).entries())
      expect(repaired('H7', made.entry, Option.none()).entry, `draw ${index}`).toEqual({
        ...made.entry,
        def: made.body,
      });
  });

  test('runs of spaces close and the ends are trimmed', () => {
    expect(stage1({ lemma: 'x', def: '  first   second    — third.' })).toEqual({
      lemma: 'x',
      def: 'first second — third.',
    });
  });

  test('an entry with no letter is left as it is, and still defective', () => {
    const entry = { lemma: 'x', xlit: 'y', def: '.' };
    const result = repaired('G3', entry, Option.none());
    expect(result.entry).toBe(entry);
    expect(result.defective).toEqual(['G3']);
  });

  test('is idempotent over sound and defective entries alike', () => {
    for (const [index, entry] of draw(4, (random) => {
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
    }).entries()) {
      const once = repair({ G1: entry }, Option.none());
      const twice = repair(once.lexicon, Option.none());
      expect(twice.lexicon, `draw ${index}`).toEqual(once.lexicon);
      expect([...twice.cleaned, ...twice.refilled], `draw ${index}`).toEqual([]);
    }
  });
});

describe('stage 2, from the source', () => {
  const greek: Source = {
    lemma: 'λέξις',
    translit: 'léxis',
    derivation: 'from G1 (α) and (to say;',
    strongs_def: ' to speak out); {a} word, i.e. a  saying',
    kjv_def: 'word, saying',
  };

  test('an entry with no letter takes the source definition in the sound style, its spilled derivation set aside', () => {
    const result = repaired('G9', { lemma: 'λέξις', xlit: 'lexis', def: '.' }, Option.some(greek));
    expect(result.entry).toEqual({
      lemma: 'λέξις',
      xlit: 'lexis',
      def: 'a word, i.e. a saying — word, saying.',
    });
    expect(result).toMatchObject({ cleaned: [], refilled: ['G9'], defective: [] });
  });

  test('a null-led Greek entry keeps the pronunciation stage 1 found', () => {
    expect(
      repaired(
        'G9',
        { lemma: 'λέξις', xlit: 'lexis', def: "nulll xis,lex' -is  from        to speak" },
        Option.some(greek),
      ).entry,
    ).toEqual({
      lemma: 'λέξις',
      xlit: 'lexis',
      def: 'a word, i.e. a saying — word, saying.',
      pron: "lex'-is",
    });
  });

  test('a Hebrew entry takes the source lemma where it had none, and the source renderings', () => {
    const hebrew: Source = {
      lemma: 'דָּבָר',
      xlit: 'dâbâr',
      pron: "daw-baw'",
      derivation: 'from H1696 (דָּבַר);',
      strongs_def: 'a word; by implication, a matter',
      kjv_def: 'act, advice, word.',
    };
    expect(
      repaired(
        'H1697',
        {
          lemma: '',
          xlit: 'dāḇār',
          def: "nulldaw-baw'  a word  matter",
          pron: "daw-baw'",
          kjvDef: 'act',
        },
        Option.some(hebrew),
      ).entry,
    ).toEqual({
      lemma: 'דָּבָר',
      xlit: 'dāḇār',
      def: 'a word; by implication, a matter — act, advice, word.',
      pron: "daw-baw'",
      kjvDef: 'act, advice, word.',
    });
  });

  test('never replaces a sound entry that has a lemma', () => {
    for (const [index, entry] of draw(5, (random) => ({
      lemma: word(random),
      xlit: word(random),
      def: definition(random),
    })).entries())
      expect(repaired('H1', entry, Option.some(greek)).entry, `draw ${index}`).toBe(entry);
  });

  test('keeps sound entries as stored, field order and all, and refills only the defective', () => {
    const stored = {
      H1: { lemma: '', xlit: 'a', pron: 'aw', def: 'sound text — here.', kjvDef: 'here.' },
      H2: { lemma: '', xlit: 'b', def: '.', pron: 'bee', kjvDef: 'there.' },
      H3: { lemma: '', xlit: 'c', def: 'cut   off — text.', pron: 'see', kjvDef: 'text.' },
    };
    const result = repair(
      stored,
      Option.some({ H2: { lemma: 'ב', strongs_def: 'whole text', kjv_def: 'there.' } }),
    );
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

  test('gives a sound entry with no lemma the source lemma, in place, every other field as stored', () => {
    const stored = {
      H4: { lemma: '', xlit: 'd', pron: 'dee', def: 'sound text — here.', kjvDef: 'here.' },
      H5: { lemma: 'ה', xlit: 'e', def: 'sound text — there.' },
      H6: { lemma: '', xlit: 'f', def: 'sound text — elsewhere.' },
    };
    const result = repair(
      stored,
      Option.some({ H4: { lemma: 'ד', strongs_def: 'other' }, H5: { lemma: 'ו' }, H6: {} }),
    );
    expect(Object.entries({ ...result.lexicon['H4'] })).toEqual([
      ['lemma', 'ד'],
      ['xlit', 'd'],
      ['pron', 'dee'],
      ['def', 'sound text — here.'],
      ['kjvDef', 'here.'],
    ]);
    expect(result.lexicon['H5']).toBe(stored.H5);
    expect(result.lexicon['H6']).toBe(stored.H6);
    expect(result).toMatchObject({ lemmas: ['H4'], cleaned: [], refilled: [] });
    expect(repair(stored, Option.none()).lexicon['H4']).toBe(stored.H4);
  });
});

describe('stage 3, the numbers only the source has', () => {
  const greek = (lemma: string, def: string): Source => ({
    lemma,
    translit: `${lemma}-x`,
    derivation: 'from G1 (α);',
    strongs_def: ` ${def}`,
    kjv_def: def,
  });

  test('adds each in its numeric place in the sound style, every stored entry kept as stored', () => {
    for (const [index, made] of draw(6, (random) => {
      const numbers = [
        ...new Set(Array.from({ length: between(random, 2, 12) }, () => between(random, 1, 60))),
      ].toSorted((a, b) => a - b);
      const stored = Object.fromEntries(
        numbers
          .filter((_, at) => at % 2 === 0)
          .map((n) => [`G${n}`, { lemma: word(random), def: definition(random) }]),
      );
      const sources = Object.fromEntries(
        numbers.map((n) => [`G${n}`, greek(word(random), words(random, 1, 4))]),
      );
      return { stored, sources };
    }).entries()) {
      const result = repair(made.stored, Option.some(made.sources));
      const lacked = Object.keys(made.sources).filter((n) => !Object.hasOwn(made.stored, n));
      const order = (n: string) => Number(n.slice(1));
      expect(result.added, `draw ${index}`).toEqual(lacked.toSorted((a, b) => order(a) - order(b)));
      expect(Object.keys(result.lexicon), `draw ${index}`).toEqual(
        Object.keys(made.sources).toSorted((a, b) => order(a) - order(b)),
      );
      for (const [number, entry] of Object.entries(made.stored))
        expect(result.lexicon[number], `draw ${index} ${number}`).toBe(entry);
      for (const number of lacked) {
        const source: Source = made.sources[number] ?? {};
        expect(result.lexicon[number], `draw ${index} ${number}`).toStrictEqual({
          lemma: source.lemma ?? 'none',
          xlit: source.translit ?? 'none',
          def: `${source.kjv_def} — ${source.kjv_def}.`,
        });
      }
      expect(result.defective, `draw ${index}`).toEqual([]);
      const again = repair(result.lexicon, Option.some(made.sources));
      expect(again.lexicon, `draw ${index}`).toEqual(result.lexicon);
      expect(again.added, `draw ${index}`).toEqual([]);
    }
  });

  test('a Hebrew number takes its pronunciation and renderings, after the Greek, before a later Hebrew one', () => {
    const result = repair(
      { G2: { lemma: 'β', def: 'two — two.' }, H9: { lemma: 'ט', def: 'nine — nine.' } },
      Option.some({
        H3: {
          lemma: 'ג',
          xlit: 'gimel',
          pron: "ghee'-mel",
          strongs_def: 'a camel',
          kjv_def: 'camel.',
        },
      }),
    );
    expect(Object.keys(result.lexicon)).toEqual(['G2', 'H3', 'H9']);
    expect(result.lexicon['H3']).toEqual({
      lemma: 'ג',
      xlit: 'gimel',
      def: 'a camel — camel.',
      pron: "ghee'-mel",
      kjvDef: 'camel.',
    });
  });

  test('adds nothing without a source, nor a source entry with no definition or a number not shaped as a key', () => {
    const stored = { G1: { lemma: 'α', def: 'one — one.' } };
    expect(repair(stored, Option.none()).added).toEqual([]);
    const result = repair(
      stored,
      Option.some({ G2: { lemma: 'β' }, G03: greek('γ', 'three'), G4a: greek('δ', 'four') }),
    );
    expect(result.added).toEqual([]);
    expect(Object.keys(result.lexicon)).toEqual(['G1']);
  });
});
