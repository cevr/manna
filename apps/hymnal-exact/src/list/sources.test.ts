/**
 * The list's answer shows the hymns about a query only under that query's
 * matches, as the current app's `aboutShown` does: an answer asked for an
 * older query adds nothing, and one asked for this query adds its hymns
 * under "Hymns about this", in its order, through `rowsOf`.
 */

import { describe, expect, test } from 'bun:test';

import { book } from '../hymns/book.testing.ts';
import { rowsOf } from './rows.ts';
import { aboutShownOf, listSources } from './sources.ts';

const { hymnRows } = listSources(book);

describe('the list’s answer with the hymns about a query', () => {
  test('adds none asked for another query, or with none asked', () => {
    expect(hymnRows(['river', { query: 'rive', numbers: [1, 2, 3] }])).toEqual(
      rowsOf(book, 'river'),
    );
    expect(hymnRows(['river'])).toEqual(rowsOf(book, 'river'));
  });

  test('adds those asked for this query, in their order', () => {
    const about = { query: 'river', numbers: [650, 22, 400] };
    expect(aboutShownOf(book, 'river', about).map((hymn) => hymn.number)).toEqual([650, 22, 400]);
    const sections = hymnRows(['river', about]);
    expect(sections).toEqual(rowsOf(book, 'river', aboutShownOf(book, 'river', about)));
    expect(sections.map((section) => section.name)).toContain('Hymns about this');
  });
});
