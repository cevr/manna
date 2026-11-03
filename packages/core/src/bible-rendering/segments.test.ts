import { describe, expect, it } from 'vitest';
import {
  applyItalicSegments,
  applyPhraseSegments,
  applyRedLetterSegments,
  applySearchHighlights,
  renderVerseSegments,
  SEGMENT_APPLICATION_ORDER,
  segmentVerseText,
  type SegmentLayer,
  type TextSegment,
} from './segments.js';
import { PhraseAutomaton, matchSegments } from '../wiki/phrase-matcher.js';
import { PHRASE_FIXTURE_DICTIONARY } from '../wiki/phrase-fixture.js';

describe('applyItalicSegments', () => {
  it('splits bracketed words from text into italic segments', () => {
    const input: TextSegment[] = [{ type: 'text', text: 'They [are] entangled' }];
    expect(applyItalicSegments(input)).toEqual([
      { type: 'text', text: 'They ' },
      { type: 'italic', text: 'are' },
      { type: 'text', text: ' entangled' },
    ]);
  });

  it('promotes brackets inside redLetter segments to redLetterItalic', () => {
    const input: TextSegment[] = [{ type: 'redLetter', text: 'Suffer [it to be so] now' }];
    expect(applyItalicSegments(input)).toEqual([
      { type: 'redLetter', text: 'Suffer ' },
      { type: 'redLetterItalic', text: 'it to be so' },
      { type: 'redLetter', text: ' now' },
    ]);
  });

  it('leaves non-text/non-redLetter segments alone', () => {
    const input: TextSegment[] = [{ type: 'margin', noteIndex: 0 }];
    expect(applyItalicSegments(input)).toEqual(input);
  });
});

describe('applyRedLetterSegments', () => {
  it('converts ‹…› to a redLetterQuote / redLetter / redLetterQuote triple', () => {
    const input: TextSegment[] = [{ type: 'text', text: 'He said, ‹Come.›' }];
    expect(applyRedLetterSegments(input)).toEqual([
      { type: 'text', text: 'He said, ' },
      { type: 'redLetterQuote', text: '“' },
      { type: 'redLetter', text: 'Come.' },
      { type: 'redLetterQuote', text: '”' },
    ]);
  });

  it('tracks red-letter state across non-text segments (e.g. margin anchors)', () => {
    const input: TextSegment[] = [
      { type: 'text', text: 'He said, ‹Come' },
      { type: 'margin', noteIndex: 0 },
      { type: 'text', text: ' here.›' },
    ];
    expect(applyRedLetterSegments(input)).toEqual([
      { type: 'text', text: 'He said, ' },
      { type: 'redLetterQuote', text: '“' },
      { type: 'redLetter', text: 'Come' },
      { type: 'margin', noteIndex: 0 },
      { type: 'redLetter', text: ' here.' },
      { type: 'redLetterQuote', text: '”' },
    ]);
  });

  it('handles unclosed quotes by red-lettering to end of input', () => {
    const input: TextSegment[] = [{ type: 'text', text: 'He said, ‹Come' }];
    expect(applyRedLetterSegments(input)).toEqual([
      { type: 'text', text: 'He said, ' },
      { type: 'redLetterQuote', text: '“' },
      { type: 'redLetter', text: 'Come' },
    ]);
  });
});

describe('applySearchHighlights', () => {
  it('splits text segments on case-insensitive matches', () => {
    const input: TextSegment[] = [{ type: 'text', text: 'The LORD is my shepherd' }];
    expect(applySearchHighlights(input, 'lord')).toEqual([
      { type: 'text', text: 'The ' },
      { type: 'highlight', text: 'LORD' },
      { type: 'text', text: ' is my shepherd' },
    ]);
  });

  it('ignores queries shorter than 2 chars', () => {
    const input: TextSegment[] = [{ type: 'text', text: 'a b c' }];
    expect(applySearchHighlights(input, 'a')).toEqual(input);
  });

  it('leaves non-text segments untouched', () => {
    const input: TextSegment[] = [
      { type: 'redLetter', text: 'Come' },
      { type: 'margin', noteIndex: 0 },
    ];
    expect(applySearchHighlights(input, 'come')).toEqual(input);
  });
});

describe('segmentVerseText', () => {
  it('inserts margin anchors after the matched phrase', () => {
    const segments = segmentVerseText('the word of God', [{ noteIndex: 0, phrase: 'word' }]);
    expect(segments).toEqual([
      { type: 'text', text: 'the word' },
      { type: 'margin', noteIndex: 0 },
      { type: 'text', text: ' of God' },
    ]);
  });

  it('runs the full pipeline: margin → red-letter → italic', () => {
    const segments = segmentVerseText('And he said, ‹Suffer [it to be so] now.›');
    expect(segments).toEqual([
      { type: 'text', text: 'And he said, ' },
      { type: 'redLetterQuote', text: '“' },
      { type: 'redLetter', text: 'Suffer ' },
      { type: 'redLetterItalic', text: 'it to be so' },
      { type: 'redLetter', text: ' now.' },
      { type: 'redLetterQuote', text: '”' },
    ]);
  });

  it('returns an empty array for empty input', () => {
    expect(segmentVerseText('')).toEqual([]);
  });

  it('applies search highlighting when a query is supplied', () => {
    const segments = segmentVerseText('the LORD reigns', [], 'lord');
    expect(segments).toEqual([
      { type: 'text', text: 'the ' },
      { type: 'highlight', text: 'LORD' },
      { type: 'text', text: ' reigns' },
    ]);
  });

  it('skips margin notes whose phrase is not present', () => {
    const segments = segmentVerseText('the word of God', [{ noteIndex: 0, phrase: 'missing' }]);
    expect(segments).toEqual([{ type: 'text', text: 'the word of God' }]);
  });

  it('strips a leading pilcrow before tokenizing — callers can pass raw KJV text', () => {
    const segments = segmentVerseText('¶ In the beginning');
    expect(segments).toEqual([{ type: 'text', text: 'In the beginning' }]);
  });
});

describe('segmentVerseText: KJV Matthew 5 snapshot', () => {
  const MATTHEW_5: readonly { readonly verse: number; readonly text: string }[] = [
    {
      verse: 1,
      text: '¶ And seeing the multitudes, he went up into a mountain: and when he was set, his disciples came unto him:',
    },
    { verse: 2, text: 'And he opened his mouth, and taught them, saying,' },
    {
      verse: 3,
      text: '¶ ‹Blessed [are] the poor in spirit: for theirs is the kingdom of heaven.›',
    },
    { verse: 4, text: '‹Blessed [are] they that mourn: for they shall be comforted.›' },
    { verse: 5, text: '‹Blessed [are] the meek: for they shall inherit the earth.›' },
    {
      verse: 6,
      text: '‹Blessed [are] they which do hunger and thirst after righteousness: for they shall be filled.›',
    },
    { verse: 7, text: '‹Blessed [are] the merciful: for they shall obtain mercy.›' },
    { verse: 8, text: '‹Blessed [are] the pure in heart: for they shall see God.›' },
    {
      verse: 9,
      text: '‹Blessed [are] the peacemakers: for they shall be called the children of God.›',
    },
    {
      verse: 10,
      text: "‹Blessed [are] they which are persecuted for righteousness' sake: for theirs is the kingdom of heaven.›",
    },
    {
      verse: 11,
      text: '‹Blessed are ye, when [men] shall revile you, and persecute [you], and shall say all manner of evil against you falsely, for my sake.›',
    },
    {
      verse: 12,
      text: '‹Rejoice, and be exceeding glad: for great [is] your reward in heaven: for so persecuted they the prophets which were before you.›',
    },
    {
      verse: 13,
      text: '¶ ‹Ye are the salt of the earth: but if the salt have lost his savour, wherewith shall it be salted? it is thenceforth good for nothing, but to be cast out, and to be trodden under foot of men.›',
    },
    {
      verse: 14,
      text: '‹Ye are the light of the world. A city that is set on an hill cannot be hid.›',
    },
    {
      verse: 15,
      text: '‹Neither do men light a candle, and put it under a bushel, but on a candlestick; and it giveth light unto all that are in the house.›',
    },
    {
      verse: 16,
      text: '‹Let your light so shine before men, that they may see your good works, and glorify your Father which is in heaven.›',
    },
    {
      verse: 17,
      text: '¶ ‹Think not that I am come to destroy the law, or the prophets: I am not come to destroy, but to fulfil.›',
    },
    {
      verse: 18,
      text: '‹For verily I say unto you, Till heaven and earth pass, one jot or one tittle shall in no wise pass from the law, till all be fulfilled.›',
    },
  ];

  it('matches the snapshot for a representative chapter', () => {
    const rendered = MATTHEW_5.map(({ verse, text }) => ({
      verse,
      segments: segmentVerseText(text),
    }));
    expect(rendered).toMatchSnapshot();
  });
});

describe('applyPhraseSegments', () => {
  it('splits a text segment into surrounding text and the phrase link', () => {
    const input: TextSegment[] = [{ type: 'text', text: 'the sanctuary shall be cleansed' }];
    expect(
      applyPhraseSegments(input, [[{ start: 4, end: 13, slug: 'sanctuary', alias: 'sanctuary' }]]),
    ).toEqual([
      { type: 'text', text: 'the ' },
      { type: 'phrase', text: 'sanctuary', slug: 'sanctuary', alias: 'sanctuary' },
      { type: 'text', text: ' shall be cleansed' },
    ]);
  });

  it('carries the surface text, not the normalized alias', () => {
    const input: TextSegment[] = [{ type: 'text', text: 'The Sanctuary, cleansed' }];
    const [phrase] = applyPhraseSegments(input, [
      [{ start: 0, end: 13, slug: 'sanctuary', alias: 'sanctuary' }],
    ]);
    expect(phrase).toEqual({
      type: 'phrase',
      text: 'The Sanctuary',
      slug: 'sanctuary',
      alias: 'sanctuary',
    });
  });

  it('never enters italic, red-letter or margin segments (§4.6)', () => {
    const input: TextSegment[] = [
      { type: 'italic', text: 'sanctuary' },
      { type: 'redLetter', text: 'sanctuary' },
      { type: 'margin', noteIndex: 0 },
      { type: 'text', text: 'sanctuary' },
    ];
    const claim = [{ start: 0, end: 9, slug: 'sanctuary', alias: 'sanctuary' }];
    expect(applyPhraseSegments(input, [claim, claim, claim, claim])).toEqual([
      { type: 'italic', text: 'sanctuary' },
      { type: 'redLetter', text: 'sanctuary' },
      { type: 'margin', noteIndex: 0 },
      { type: 'phrase', text: 'sanctuary', slug: 'sanctuary', alias: 'sanctuary' },
    ]);
  });

  it('leaves a segment whole when its span list is absent or empty', () => {
    const input: TextSegment[] = [
      { type: 'text', text: 'first' },
      { type: 'text', text: 'second' },
    ];
    expect(applyPhraseSegments(input, [[]])).toEqual(input);
  });

  it('drops a span that would overlap one already emitted', () => {
    const input: TextSegment[] = [{ type: 'text', text: 'heavenly sanctuary here' }];
    expect(
      applyPhraseSegments(input, [
        [
          { start: 0, end: 18, slug: 'heavenly-sanctuary', alias: 'heavenly sanctuary' },
          { start: 9, end: 18, slug: 'sanctuary', alias: 'sanctuary' },
        ],
      ]),
    ).toEqual([
      {
        type: 'phrase',
        text: 'heavenly sanctuary',
        slug: 'heavenly-sanctuary',
        alias: 'heavenly sanctuary',
      },
      { type: 'text', text: ' here' },
    ]);
  });
});

describe('renderVerseSegments: the fixed application order', () => {
  const automaton = PhraseAutomaton.make(PHRASE_FIXTURE_DICTIONARY);

  it('declares the §10 Milestone 6 order', () => {
    expect(SEGMENT_APPLICATION_ORDER).toEqual(['italic', 'redLetter', 'margin', 'phrase']);
  });

  it('with no phrase layer it is exactly segmentVerseText', () => {
    const raw = '¶ And he said, ‹Suffer [it to be so] now.›';
    expect(renderVerseSegments({ text: raw })).toEqual(segmentVerseText(raw));
  });

  const FOUR_LAYER_VERSE = '¶ He said, ‹the daily [sacrifice] is taken›, and the sanctuary fell.';

  const rendered = (): TextSegment[] =>
    renderVerseSegments({
      text: FOUR_LAYER_VERSE,
      marginNotes: [{ noteIndex: 3, phrase: 'He said' }],
      phrases: (segments) => matchSegments(automaton, segments),
    });

  const layers = (segments: readonly TextSegment[]): readonly SegmentLayer[] => {
    const seen: SegmentLayer[] = [];
    for (const segment of segments) {
      if (segment.type === 'italic' || segment.type === 'redLetterItalic') seen.push('italic');
      else if (segment.type === 'redLetter' || segment.type === 'redLetterQuote') {
        seen.push('redLetter');
      } else if (segment.type === 'margin') seen.push('margin');
      else if (segment.type === 'phrase') seen.push('phrase');
    }
    return seen;
  };

  it('produces every layer, each exactly where its rank puts it', () => {
    expect(rendered()).toEqual([
      { type: 'text', text: 'He said' },
      { type: 'margin', noteIndex: 3 },
      { type: 'text', text: ', ' },
      { type: 'redLetterQuote', text: '“' },
      { type: 'redLetter', text: 'the daily ' },
      { type: 'redLetterItalic', text: 'sacrifice' },
      { type: 'redLetter', text: ' is taken' },
      { type: 'redLetterQuote', text: '”' },
      { type: 'text', text: ', and the ' },
      { type: 'phrase', text: 'sanctuary', slug: 'sanctuary', alias: 'sanctuary' },
      { type: 'text', text: ' fell.' },
    ]);
  });

  it('italic over red letter: a bracket inside Christ’s words is redLetterItalic', () => {
    expect(renderVerseSegments({ text: '‹Blessed [are] the meek.›' })).toEqual([
      { type: 'redLetterQuote', text: '“' },
      { type: 'redLetter', text: 'Blessed ' },
      { type: 'redLetterItalic', text: 'are' },
      { type: 'redLetter', text: ' the meek.' },
      { type: 'redLetterQuote', text: '”' },
    ]);
    expect(renderVerseSegments({ text: 'a [b ‹c] d' })).toEqual([
      { type: 'text', text: 'a ' },
      { type: 'italic', text: 'b ‹c' },
      { type: 'text', text: ' d' },
    ]);
  });

  it('red letter over margin: an anchor mid-quote does not end the quote', () => {
    expect(
      renderVerseSegments({
        text: '‹Come here now.›',
        marginNotes: [{ noteIndex: 0, phrase: 'here' }],
      }),
    ).toEqual([
      { type: 'redLetterQuote', text: '“' },
      { type: 'redLetter', text: 'Come here' },
      { type: 'margin', noteIndex: 0 },
      { type: 'redLetter', text: ' now.' },
      { type: 'redLetterQuote', text: '”' },
    ]);

    expect(
      renderVerseSegments({
        text: 'He said ‹Come.›',
        marginNotes: [{ noteIndex: 0, phrase: 'said ‹Come' }],
      }),
    ).toEqual([
      { type: 'text', text: 'He said ' },
      { type: 'redLetterQuote', text: '“' },
      { type: 'redLetter', text: 'Come.' },
      { type: 'redLetterQuote', text: '”' },
    ]);
  });

  it('margin over phrase: a phrase cannot bridge an anchor', () => {
    const segments = renderVerseSegments({
      text: 'the heavenly sanctuary stands',
      marginNotes: [{ noteIndex: 1, phrase: 'the heavenly' }],
      phrases: (input) => matchSegments(automaton, input),
    });
    expect(segments).toContainEqual({ type: 'margin', noteIndex: 1 });
    expect(
      segments.some(
        (segment) => segment.type === 'phrase' && segment.alias === 'heavenly sanctuary',
      ),
    ).toBe(false);
  });

  it('phrase is last and outranks nothing', () => {
    const segments = rendered();
    expect(segments.filter((segment) => segment.type === 'phrase')).toEqual([
      { type: 'phrase', text: 'sanctuary', slug: 'sanctuary', alias: 'sanctuary' },
    ]);
  });

  it('the constant is what the pipeline walks', () => {
    expect(SEGMENT_APPLICATION_ORDER).toEqual(['italic', 'redLetter', 'margin', 'phrase']);
    expect(new Set(layers(rendered()))).toEqual(new Set(SEGMENT_APPLICATION_ORDER));
  });

  it('every layer named in the order really appears', () => {
    expect(new Set(layers(rendered()))).toEqual(new Set(SEGMENT_APPLICATION_ORDER));
  });

  it('a phrase never crosses into a margin anchor', () => {
    const segments = renderVerseSegments({
      text: 'the heavenly sanctuary stands',
      marginNotes: [{ noteIndex: 1, phrase: 'the heavenly' }],
      phrases: (input) => matchSegments(automaton, input),
    });
    expect(
      segments.some(
        (segment) => segment.type === 'phrase' && segment.alias === 'heavenly sanctuary',
      ),
    ).toBe(false);
    expect(segments).toContainEqual({
      type: 'phrase',
      text: 'sanctuary',
      slug: 'sanctuary',
      alias: 'sanctuary',
    });
  });
});
