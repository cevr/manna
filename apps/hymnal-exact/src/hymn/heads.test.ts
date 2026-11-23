/**
 * The head line a hymn page draws from the table built at prepare
 * (`heads.ts`) is, for every hymn, the one the current app's page words
 * (`HymnPage.tsx`'s `AboutLine`: `headLine` over its own bundled
 * `referencesOf`), and the page reads it with no indexes at hand.
 */

import { describe, expect, it } from 'bun:test';

import { hymns } from '@manna/hymnal-app/hymns/hymns';
import { referencesOf } from '@manna/hymnal-app/hymns/indexes';
import { headLine } from '@manna/hymnal-app/reader/head-line';

import { encoded } from '../chords/shipped.testing.ts';
import { sourcesAt } from '../sources.ts';

const none = sourcesAt('https://hymns.cvr.im', [], encoded);

describe("a hymn page's head line", () => {
  it("is the current app's for every hymn, read with no indexes", () => {
    expect(hymns.length).toBe(695);
    const passages = hymns.filter((hymn) => referencesOf(hymn.number).length > 0);
    expect(passages.length).toBeGreaterThan(300);
    for (const hymn of hymns) {
      const head = none.hymnPage([`${hymn.number}`]).head;
      expect({ number: hymn.number, head }).toEqual({
        number: hymn.number,
        head: headLine(hymn.topic, referencesOf(hymn.number)),
      });
    }
  });

  it("holds a section and passages, never the hymn's words", () => {
    for (const hymn of hymns.slice(0, 50)) {
      const head = none.hymnPage([`${hymn.number}`]).head;
      expect(head.startsWith(hymn.topic)).toBe(true);
      expect(head).not.toContain(hymn.title);
    }
  });
});
