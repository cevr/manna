import {
  matchSection,
  PhraseAutomaton,
  PhraseDictionary,
  PhraseDictionaryEntry,
  normalizeAlias,
  normalizeScan,
  topicSlug,
} from '@manna/core/wiki';
import { Effect, Option } from 'effect';
import { describe, expect, it } from 'effect-bun-test';

const transitions = (automaton: PhraseAutomaton, texts: readonly string[]) =>
  texts.reduce((n, text) => n + automaton.transitions(normalizeScan(text)), 0);

const WORDS = [
  'sanctuary',
  'judgment',
  'covenant',
  'atonement',
  'prophecy',
  'remnant',
  'kingdom',
  'temple',
  'witness',
  'testimony',
];

const phrase = (index: number): string =>
  `${WORDS[index % WORDS.length] ?? 'sanctuary'} of the ${String(index)}`;

const dictionary = (count: number): PhraseDictionary =>
  PhraseDictionary.make({
    entries: Array.from({ length: count }, (_, index) =>
      PhraseDictionaryEntry.make({
        alias: normalizeAlias(phrase(index)),
        display: phrase(index),
        slug: topicSlug(`topic-${String(index)}`),
        canonical: false,
      }),
    ),
    unavailable: Option.none(),
  });

const PARAGRAPH =
  `The ${phrase(3)} stood in the wilderness, and the ${phrase(7)} was set. ` +
  `And the ${phrase(11)} was confirmed, while the ${phrase(19)} remained sealed ` +
  `until the time of the end, when the ${phrase(23)} should understand the vision and ` +
  `the ${phrase(29)} should be borne to every nation, kindred, tongue, and people.`;

const SCREENFUL: readonly string[] = Array.from({ length: 30 }, () => PARAGRAPH);

const SCREENFUL_CHARS = SCREENFUL.reduce((n, text) => n + text.length, 0);

describe('phrase matcher performance (§4.1)', () => {
  it.live('builds the automaton over 1,000 phrases, one trie edge per new character', () =>
    Effect.gen(function* () {
      const entries = dictionary(1000);
      const automaton = PhraseAutomaton.make(entries);
      const aliasChars = entries.entries.reduce((n, entry) => n + entry.alias.length, 0);
      yield* Effect.logInfo(
        `perf.phraseAutomaton.build edges=${automaton.edges} aliasChars=${aliasChars}`,
      );

      expect(automaton.edges).toBeLessThanOrEqual(aliasChars);
      expect(matchSection(automaton, [PARAGRAPH])[0]?.length).toBeGreaterThan(0);
    }),
  );

  it.live('matches a 30-paragraph screenful in about one transition per character', () =>
    Effect.gen(function* () {
      const automaton = PhraseAutomaton.make(dictionary(1000));
      const spans = matchSection(automaton, SCREENFUL);
      const steps = transitions(automaton, SCREENFUL);
      yield* Effect.logInfo(
        `perf.phraseMatcher.screenful steps=${steps} chars=${SCREENFUL_CHARS} runs=${String(spans.length)}`,
      );

      expect(steps).toBeGreaterThanOrEqual(SCREENFUL_CHARS);
      expect(steps).toBeLessThan(2 * SCREENFUL_CHARS);
      expect(spans.length).toBe(30);
      expect(spans[0]?.length).toBe(6);
      expect(spans.slice(1).every((run) => run.length === 0)).toBe(true);
    }),
  );

  it.live('stays flat as the dictionary grows', () =>
    Effect.gen(function* () {
      const smallSteps = transitions(PhraseAutomaton.make(dictionary(100)), SCREENFUL);
      const largeSteps = transitions(PhraseAutomaton.make(dictionary(2000)), SCREENFUL);
      yield* Effect.logInfo(
        `perf.phraseMatcher.scaling smallSteps=${smallSteps} largeSteps=${largeSteps}`,
      );

      expect(largeSteps).toBeLessThanOrEqual(smallSteps * 1.25);
    }),
  );
});
