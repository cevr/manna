import { describe, expect, it } from 'bun:test';
import { Option } from 'effect';

import { parseParagraphContent } from '../egw/ast.js';
import { segmentVerseText } from '../bible-rendering/segments.js';
import * as barrel from './index.js';
import * as testing from './testing.js';
import { PhraseDictionary, PhraseDictionaryEntry, topicSlug } from './model.js';
import { normalizeAlias } from './normalize.js';
import {
  DANIEL_8_9,
  DANIEL_8_SECTION,
  PHRASE_FIXTURE_DICTIONARY,
  PHRASE_FIXTURE_NOTE,
} from './phrase-fixture.js';
import {
  matchNodes,
  matchRun,
  matchSection,
  matchSegments,
  PhraseAutomaton,
  SectionMatchState,
  type NodeSpans,
  type PhraseSpan,
} from './phrase-matcher.js';

const dictionary = (...aliases: readonly string[]): PhraseDictionary =>
  PhraseDictionary.make({
    entries: aliases.map((alias) =>
      PhraseDictionaryEntry.make({
        alias: normalizeAlias(alias),
        display: alias,
        slug: topicSlug(normalizeAlias(alias).replaceAll(' ', '-')),
        canonical: true,
      }),
    ),
    unavailable: Option.none(),
  });

const covered = (
  text: string,
  spans: readonly PhraseSpan[],
): readonly { readonly alias: string; readonly text: string }[] =>
  spans.map((span) => ({ alias: span.alias, text: text.slice(span.start, span.end) }));

describe('overlap resolution (§4.4)', () => {
  it('the longest match wins at the same start', () => {
    const automaton = PhraseAutomaton.make(dictionary('sanctuary', 'heavenly sanctuary'));
    const text = 'Christ ministers in the heavenly sanctuary today.';

    expect(covered(text, matchRun(automaton, text))).toEqual([
      { alias: 'heavenly sanctuary', text: 'heavenly sanctuary' },
    ]);
  });

  it('a span suppressed inside another is eligible at its next clean occurrence', () => {
    const automaton = PhraseAutomaton.make(dictionary('sanctuary', 'heavenly sanctuary'));
    const text = 'The heavenly sanctuary is the true sanctuary of the Lord.';

    expect(covered(text, matchRun(automaton, text))).toEqual([
      { alias: 'heavenly sanctuary', text: 'heavenly sanctuary' },
      { alias: 'sanctuary', text: 'sanctuary' },
    ]);
  });

  it('a phrase overlapping an emitted span from the left is suppressed once', () => {
    const automaton = PhraseAutomaton.make(dictionary('day of atonement', 'atonement'));
    const text = 'The day of atonement, and later the atonement itself.';

    expect(covered(text, matchRun(automaton, text))).toEqual([
      { alias: 'day of atonement', text: 'day of atonement' },
      { alias: 'atonement', text: 'atonement' },
    ]);
  });
});

describe('first-occurrence rule (§4.5) — the Daniel 8 fixture', () => {
  it('gives each distinct phrase of the chapter its own first occurrence', () => {
    const automaton = PhraseAutomaton.make(PHRASE_FIXTURE_DICTIONARY);
    const spans = matchSection(automaton, DANIEL_8_SECTION);

    expect(spans.map((run, index) => covered(DANIEL_8_SECTION[index] ?? '', run))).toEqual([
      [{ alias: 'little horn', text: 'little horn' }],
      [
        { alias: 'the daily', text: 'the daily' },
        { alias: 'sanctuary', text: 'sanctuary' },
      ],
      [],
    ]);
  });

  it('records why pleasant land is not hot in Daniel 8:9', () => {
    const automaton = PhraseAutomaton.make(PHRASE_FIXTURE_DICTIONARY);

    const raw = matchRun(automaton, DANIEL_8_9).map((span) => span.alias);
    const rendered = matchSegments(automaton, segmentVerseText(DANIEL_8_9))
      .flat()
      .map((span) => span.alias);

    expect(raw).toEqual(['little horn']);
    expect(rendered).toEqual(raw);
    expect(PHRASE_FIXTURE_NOTE).toContain('§4.6');
  });

  it('only the first occurrence of a phrase is hot within one run', () => {
    const automaton = PhraseAutomaton.make(dictionary('little horn'));
    const text = 'The little horn of Daniel 7 and the little horn of Daniel 8.';

    expect(covered(text, matchRun(automaton, text))).toEqual([
      { alias: 'little horn', text: 'little horn' },
    ]);
  });

  it('the section, not the run, is the first-occurrence scope', () => {
    const automaton = PhraseAutomaton.make(dictionary('little horn', 'pleasant land'));
    const verses = ['A little horn came forth.', 'The little horn took the pleasant land.'];

    const spans = matchSection(automaton, verses);
    expect(covered(verses[0] ?? '', spans[0] ?? [])).toEqual([
      { alias: 'little horn', text: 'little horn' },
    ]);
    expect(covered(verses[1] ?? '', spans[1] ?? [])).toEqual([
      { alias: 'pleasant land', text: 'pleasant land' },
    ]);
  });

  it('a new section starts every phrase cold again', () => {
    const automaton = PhraseAutomaton.make(dictionary('little horn'));
    const text = 'The little horn.';

    expect(matchSection(automaton, [text], new SectionMatchState())[0]?.length).toBe(1);
    expect(matchSection(automaton, [text], new SectionMatchState())[0]?.length).toBe(1);
  });
});

describe('boundary rules (§4.6)', () => {
  it('no span crosses a TextSegment boundary', () => {
    const automaton = PhraseAutomaton.make(dictionary('the daily', 'vision shall be'));
    const segments = segmentVerseText('the daily service; the vision [shall be] sealed.');

    expect(segments.map((segment) => segment.type)).toEqual(['text', 'italic', 'text']);
    expect(matchSegments(automaton, segments).map((run) => run.map((span) => span.alias))).toEqual([
      ['the daily'],
      [],
      [],
    ]);
  });

  it('non-text segments are kept in place and never matched', () => {
    const automaton = PhraseAutomaton.make(dictionary('sanctuary'));
    const segments = segmentVerseText('The [sanctuary] shall be cleansed.');

    expect(segments.map((segment) => segment.type)).toEqual(['text', 'italic', 'text']);
    expect(matchSegments(automaton, segments).map((run) => run.length)).toEqual([0, 0, 0]);
  });

  it('no span enters a ScriptureRef or a BookRef node', () => {
    const automaton = PhraseAutomaton.make(dictionary('sanctuary', 'great controversy'));
    const nodes = parseParagraphContent(
      'The sanctuary is described in ' +
        '<span class="egwlink egwlink_bible" title="Daniel 8:14" data-link="1965.119">' +
        'the sanctuary passage</span> and in ' +
        '<span class="egwlink egwlink_book" title="GC" data-link="132.1">' +
        'The Great Controversy</span>.',
    );

    const matched = matchNodes(automaton, nodes);
    expect(matched.flatMap((entry) => entry.spans.map((span) => span.alias))).toEqual([
      'sanctuary',
    ]);
  });

  it('emphasis and comment wrappers are descended, link nodes are not', () => {
    const automaton = PhraseAutomaton.make(dictionary('sanctuary'));
    const nodes = parseParagraphContent('The <em>sanctuary</em> stands.');

    const matched = matchNodes(automaton, nodes);
    expect(matched.flatMap((entry) => entry.spans.map((span) => span.start))).toEqual([0]);
  });

  it('each Text node is its own run, so no span crosses a line break', () => {
    const automaton = PhraseAutomaton.make(dictionary('little horn'));
    const nodes = parseParagraphContent('a little<br />horn came');

    expect(matchNodes(automaton, nodes).flatMap((entry) => entry.spans)).toEqual([]);
  });

  it('NodeSpans carries the Text node it matched, so a renderer needs no narrowing', () => {
    const render = (entry: NodeSpans): readonly string[] =>
      entry.spans.map((span) => entry.node.text.slice(span.start, span.end));

    const automaton = PhraseAutomaton.make(dictionary('sanctuary'));
    const nodes = parseParagraphContent('The <em>heavenly sanctuary</em> stands.');

    expect(matchNodes(automaton, nodes).flatMap(render)).toEqual(['sanctuary']);
  });
});

describe('normalization (§4.3)', () => {
  it('matches only on word boundaries', () => {
    const automaton = PhraseAutomaton.make(dictionary('sanctuary', 'horn'));

    expect(matchRun(automaton, 'the sanctuaries were unsanctuary and hornet')).toEqual([]);
    expect(matchRun(automaton, 'the sanctuary; the horn').map((span) => span.alias)).toEqual([
      'sanctuary',
      'horn',
    ]);
  });

  it('digits are word characters, so 300 days does not match inside 2300 days', () => {
    const automaton = PhraseAutomaton.make(dictionary('300 days'));

    expect(matchRun(automaton, 'the 2300 days of Daniel 8:14')).toEqual([]);
    expect(matchRun(automaton, 'the 300 days').length).toBe(1);
  });

  it('soft punctuation inside a phrase is transparent', () => {
    const automaton = PhraseAutomaton.make(dictionary('faith hope love'));
    const text = 'He had faith, hope; love in the end.';

    expect(covered(text, matchRun(automaton, text))).toEqual([
      { alias: 'faith hope love', text: 'faith, hope; love' },
    ]);
  });

  it('collapsed whitespace is transparent and the span keeps the source extent', () => {
    const automaton = PhraseAutomaton.make(dictionary('little horn'));
    const text = 'a little \n  horn appeared';

    expect(covered(text, matchRun(automaton, text))).toEqual([
      { alias: 'little horn', text: 'little \n  horn' },
    ]);
  });

  it('case is folded on both sides', () => {
    const automaton = PhraseAutomaton.make(dictionary('The Sanctuary'));
    const text = 'THE SANCTUARY of God';

    expect(covered(text, matchRun(automaton, text))).toEqual([
      { alias: 'the sanctuary', text: 'THE SANCTUARY' },
    ]);
  });

  it('the matcher normalizes exactly what the compiler stored', () => {
    expect(normalizeAlias('  The   Daily,  ')).toBe('the daily');
    expect(normalizeAlias("the Lord's Day")).toBe("the lord's day");
    expect(normalizeAlias('Faith, Hope; Love')).toBe('faith hope love');
  });
});

describe('Unicode normalization (§4.3)', () => {
  it('Greek final sigma folds to the same key on both sides', () => {
    expect(normalizeAlias('ΟΣ')).toBe(normalizeAlias('ος'));
    expect(normalizeAlias('ΟΣ')).toBe(normalizeAlias('Ος'));

    const upper = PhraseAutomaton.make(dictionary('ΟΣ'));
    expect(covered('λόγος ΟΣ τέλος', matchRun(upper, 'λόγος ΟΣ τέλος'))).toEqual([
      { alias: normalizeAlias('ΟΣ'), text: 'ΟΣ' },
    ]);

    const lower = PhraseAutomaton.make(dictionary('ος'));
    expect(covered('πρὸ ΟΣ μετά', matchRun(lower, 'πρὸ ΟΣ μετά'))).toEqual([
      { alias: normalizeAlias('ος'), text: 'ΟΣ' },
    ]);
  });

  it('a one-to-many lowercase expansion keeps the span over the whole source token', () => {
    const automaton = PhraseAutomaton.make(dictionary('İstanbul'));
    const text = 'He sailed to İSTANBUL in the spring.';

    expect(covered(text, matchRun(automaton, text))).toEqual([
      { alias: normalizeAlias('İstanbul'), text: 'İSTANBUL' },
    ]);

    const [span] = matchRun(automaton, text);
    expect(span?.start).toBe(13);
    expect(span?.end).toBe(21);
  });

  it('a dotless i is not the dotted one — the expansion is folded, not stripped', () => {
    const automaton = PhraseAutomaton.make(dictionary('istanbul', 'i'));

    expect(matchRun(automaton, 'He sailed to İstanbul.')).toEqual([]);
  });

  it('an astral-plane alias matches itself with offsets over the whole surrogate pair', () => {
    const word = '\u{10330}\u{10331}\u{10332}';
    const automaton = PhraseAutomaton.make(dictionary(word));
    const text = `a ${word} b`;

    expect(covered(text, matchRun(automaton, text))).toEqual([
      { alias: normalizeAlias(word), text: word },
    ]);
    const [span] = matchRun(automaton, text);
    expect(span?.end).toBe((span?.start ?? 0) + word.length);
  });

  it('an astral letter is a word character, so a boundary is not found inside one', () => {
    const word = '\u{10330}\u{10331}';
    const automaton = PhraseAutomaton.make(dictionary(word));

    expect(matchRun(automaton, `x ${word}\u{10332} y`)).toEqual([]);
  });

  it('composed and decomposed accents are distinct keys — NFC is out of §4.3 scope', () => {
    const precomposed = 'café';
    const decomposed = 'café';

    expect(normalizeAlias(precomposed)).not.toBe(normalizeAlias(decomposed));

    const automaton = PhraseAutomaton.make(dictionary(precomposed));
    expect(matchRun(automaton, `a ${decomposed} b`)).toEqual([]);
    expect(matchRun(automaton, `a ${precomposed} b`).length).toBe(1);
  });

  it('whitespace is ECMAScript whitespace, not a hand-kept ASCII set', () => {
    const separators = [
      '\u00A0',
      '\u1680',
      '\u2000',
      '\u2003',
      '\u2009',
      '\u2028',
      '\u2029',
      '\u202F',
      '\u205F',
      '\u3000',
      '\uFEFF',
    ];
    for (const separator of separators) {
      expect(normalizeAlias(`little${separator}horn`)).toBe('little horn');
    }

    const automaton = PhraseAutomaton.make(dictionary('little horn'));
    const text = 'a little\u2009\u00A0horn b';
    expect(covered(text, matchRun(automaton, text))).toEqual([
      { alias: 'little horn', text: 'little\u2009\u00A0horn' },
    ]);
  });
});

describe('the dictionary (§4.8, §3.5)', () => {
  it('a noise-flagged alias is absent from the dictionary and therefore never matches', () => {
    const automaton = PhraseAutomaton.make(dictionary('investigative judgment'));
    const text = 'The judgment is set, and the investigative judgment began in 1844.';

    expect(covered(text, matchRun(automaton, text))).toEqual([
      { alias: 'investigative judgment', text: 'investigative judgment' },
    ]);
  });

  it('the Daniel 8 fixture is reachable from the testing subpath, not the production barrel', () => {
    expect(Object.keys(barrel)).not.toContain('PHRASE_FIXTURE_DICTIONARY');
    expect(Object.keys(barrel)).not.toContain('DANIEL_8_9');
    expect(Object.keys(testing)).toContain('PHRASE_FIXTURE_DICTIONARY');
    expect(Object.keys(testing)).toContain('DANIEL_8_9');

    expect(testing.PHRASE_FIXTURE_DICTIONARY).toBe(PHRASE_FIXTURE_DICTIONARY);
    expect(testing.DANIEL_8_9).toBe(DANIEL_8_9);

    expect(Object.keys(barrel)).toContain('PhraseAutomaton');
  });

  it('an empty dictionary matches nothing rather than failing', () => {
    const automaton = PhraseAutomaton.make(
      PhraseDictionary.make({ entries: [], unavailable: Option.some('artifact-not-installed') }),
    );
    expect(matchRun(automaton, DANIEL_8_9)).toEqual([]);
  });

  it('one automaton serves many runs without carrying state between them', () => {
    const automaton = PhraseAutomaton.make(dictionary('little horn'));
    expect(matchRun(automaton, DANIEL_8_9)).toEqual(matchRun(automaton, DANIEL_8_9));
  });
});
