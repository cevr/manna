import { describe, expect, it } from 'bun:test';
import { Option } from 'effect';
import {
  Paragraph,
  Publication,
  Reference,
  SearchHit,
  paragraphId,
  publicationCode,
  publicationId,
  publicationOrder,
} from '@manna/core/writings';

import { formatLocalSearchResult, SNIPPET_LIMIT } from '../../src/commands/egw/format.js';

const LONG_TEXT =
  'As man came forth from the hand of his Creator, he was of lofty stature and perfect symmetry. ' +
  'His countenance bore the ruddy tint of health and glowed with the light of life and joy. ' +
  'Adam’s height was much greater than that of men who now inhabit the earth.';

const hit = (text: string): SearchHit =>
  SearchHit.make({
    publication: Publication.make({
      id: publicationId(127),
      code: publicationCode('PP'),
      title: 'Patriarchs and Prophets',
      author: 'Ellen G. White',
      paragraphCount: Option.none(),
    }),
    paragraph: Paragraph.make({
      reference: Reference.paragraph(127, paragraphId('PP-1')),
      publicationCode: publicationCode('PP'),
      order: publicationOrder(1),
      page: Option.none(),
      number: Option.none(),
      refcode: Option.some('PP 45.3'),
      nodes: [{ _tag: 'Text', text }],
      elementType: Option.none(),
      elementSubtype: Option.none(),
    }),
  });

describe('egw search result formatting — --full', () => {
  it('cuts at the limit and marks the cut by default', () => {
    expect(LONG_TEXT.length).toBeGreaterThan(SNIPPET_LIMIT);

    const line = formatLocalSearchResult(hit(LONG_TEXT), 0);

    expect(line).toContain(LONG_TEXT.slice(0, SNIPPET_LIMIT));
    expect(line).not.toContain(LONG_TEXT);
    expect(line).toContain('…');
  });

  it('prints the whole paragraph, with no ellipsis, when asked', () => {
    const line = formatLocalSearchResult(hit(LONG_TEXT), 0, true);

    expect(line).toContain(LONG_TEXT);
    expect(line).not.toContain('…');
  });

  it('leaves a paragraph shorter than the limit alone either way', () => {
    const short = 'Eve was not quite as tall as Adam.';
    expect(short.length).toBeLessThan(SNIPPET_LIMIT);

    expect(formatLocalSearchResult(hit(short), 0)).toContain(short);
    expect(formatLocalSearchResult(hit(short), 0, true)).toContain(short);
    expect(formatLocalSearchResult(hit(short), 0)).not.toContain('…');
  });

  it('reports an empty paragraph rather than printing nothing', () => {
    expect(formatLocalSearchResult(hit(''), 0)).toContain('(no content)');
    expect(formatLocalSearchResult(hit(''), 0, true)).toContain('(no content)');
  });
});
