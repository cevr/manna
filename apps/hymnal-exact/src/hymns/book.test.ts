/* oxlint-disable effect/noTernary -- a Bun test in an Exact app's folder imports no effect (docs/exact.md: Exact's type check would stage its declarations), so it reads an Option's tag and branches plainly. */

import { describe, expect, test } from 'bun:test';

import { topicOf } from '@manna/hymnal/hymn';
import { textOf } from '@manna/hymnal-app/hymns/text';
import { readHymns, readTopics } from '@manna/hymnal-app/vite/words';

import { pageAt } from '../hymn/page.ts';
import { rowsOf } from '../list/rows.ts';
import { book } from './book.testing.ts';

const compiled = readHymns();
const topics = readTopics();

/** The name of the topic `topicOf` gives hymn `number` in the compiled topics. */
const topicName = (number: number): string => {
  const topic = topicOf(topics, number);
  return topic._tag === 'Some' ? topic.value.name : '';
};

describe('the shipped book is the current app’s', () => {
  test('the list holds every compiled hymn 1 to 695 once, by number, title and section', () => {
    const rows = rowsOf(book, '').flatMap((section) =>
      section.rows.map((row) => ({ ...row, section: section.name })),
    );
    expect(rows).toEqual(
      compiled.map((hymn) => ({
        number: hymn.number,
        title: hymn.title,
        line: '',
        section: topicName(hymn.number),
      })),
    );
    expect(rows.map((row) => row.number)).toEqual(Array.from({ length: 695 }, (_, i) => i + 1));
  });

  test('each hymn’s page sings its stanzas and refrains in the current app’s order', () => {
    for (const hymn of compiled) {
      const derived = textOf(hymn, topicName(hymn.number));
      const page = pageAt(book, `${hymn.number}`);
      expect({ number: page.number, title: page.title, topic: page.topic }).toEqual({
        number: derived.number,
        title: derived.title,
        topic: derived.topic,
      });
      expect(page.parts.map((part) => part.text)).toEqual(
        derived.sections.map((section) => section.lines.join('\n')),
      );
      expect(page.parts.map((part) => part.label)).toEqual(
        derived.sections.map((section) => (section.kind === 'stanza' ? `${section.n}` : 'Refrain')),
      );
    }
  });
});
