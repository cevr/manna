import { describe, expect, test } from 'bun:test';
import { Option } from 'effect';

import { citationVerses, readerFor, type VersesReader, volumeVerses } from './commentary-links.js';

type VolumeParagraph = Parameters<VersesReader>[0][number];
type CitedVerse = ReturnType<VersesReader>[number][number];
type Node = VolumeParagraph['nodes'][number];

const label = (verse: CitedVerse): string =>
  `${String(verse.bibleBook)}.${String(verse.bibleChapter)}:${Option.match(verse.bibleVerse, {
    onNone: () => '*',
    onSome: String,
  })}`;

const labels = (verses: readonly CitedVerse[]): string[] => verses.map(label);

const cite = (title: string, printed: string): Node => ({
  _tag: 'ScriptureRef',
  title,
  dataLink: '1965.1',
  children: [{ _tag: 'Text', text: printed }],
});
const text = (value: string): Node => ({ _tag: 'Text', text: value });
const strong = (...children: Node[]): Node => ({
  _tag: 'Unknown',
  tag: 'strong',
  className: '',
  children,
});

/** The verses one citation names, read as a paragraph holding it alone. */
const citedVerses = (title: string, printed: string): readonly CitedVerse[] =>
  citationVerses([{ nodes: [cite(title, printed)] }])[0] ?? [];

const plain = (...nodes: Node[]): VolumeParagraph => ({ nodes: [text('made up '), ...nodes] });
const heading = (title: string, printed: string): VolumeParagraph => ({
  nodes: [strong(cite(title, printed)), text(' made up')],
  element_type: 'p',
});
const sectionTitle = (...nodes: Node[]): VolumeParagraph => ({ nodes, element_type: 'h3' });

describe('a citation', () => {
  test('names every verse its printed text names, read in its title', () => {
    expect(labels(citedVerses('John 1:1', 'John 1:1-3, 14'))).toEqual([
      '43.1:1',
      '43.1:2',
      '43.1:3',
      '43.1:14',
    ]);
    expect(labels(citedVerses('John 1:14', '14'))).toEqual(['43.1:14']);
    expect(labels(citedVerses('Hebrews 2:14', '2:14-16'))).toEqual([
      '58.2:14',
      '58.2:15',
      '58.2:16',
    ]);
    expect(labels(citedVerses('Colossians 1:26', 'Colossians 1:26, 27'))).toEqual([
      '51.1:26',
      '51.1:27',
    ]);
    expect(labels(citedVerses('Isaiah 53:5', 'Isaiah 53:5; 1 Peter 2:24'))).toEqual([
      '23.53:5',
      '60.2:24',
    ]);
    expect(labels(citedVerses('Genesis 39:9', 'ch. 39:9'))).toEqual(['1.39:9']);
  });

  test('a chapter heading names the whole chapter', () => {
    expect(labels(citedVerses('Genesis 2:1', 'Chapter 2'))).toEqual(['1.2:*']);
  });

  test('a first segment it cannot place names the title, never less', () => {
    expect(labels(citedVerses('Jude 1:14', 'Jude 14, 15'))).toEqual(['65.1:14', '65.1:15']);
    expect(labels(citedVerses('Romans 8:1', 'made up'))).toEqual(['45.8:1']);
    expect(labels(citedVerses('Romans 8:1', ''))).toEqual(['45.8:1']);
  });

  test('a title that names no verse names nothing', () => {
    expect(citedVerses('made up', 'John 3:16')).toEqual([]);
  });
});

describe("a volume's paragraphs", () => {
  test('each paragraph under a verse heading comments on that verse, up to the next heading', () => {
    const verses = volumeVerses([
      sectionTitle(cite('John 1:1', 'Chapter 1')),
      heading('John 1:12', '12'),
      heading('John 1:14', '14'),
      plain(),
      { nodes: [strong(text('A made-up subheading'))] },
      { nodes: [strong(text('('), cite('Philippians 2:6', 'Philippians 2:6')), text(')')] },
      plain(cite('Hebrews 2:14', 'Hebrews 2:14')),
      heading('John 1:16', '16'),
      sectionTitle(text('A made-up title')),
      plain(),
    ]);
    expect(verses.map(labels)).toEqual([
      [],
      ['43.1:12'],
      ['43.1:14'],
      ['43.1:14'],
      ['43.1:14'],
      ['43.1:14', '50.2:6'],
      ['43.1:14', '58.2:14'],
      ['43.1:16'],
      [],
      [],
    ]);
  });

  test('a paragraph names each verse once', () => {
    const verses = volumeVerses([heading('John 1:1', '1'), plain(cite('John 1:1', 'John 1:1, 1'))]);
    expect(verses.map(labels)).toEqual([['43.1:1'], ['43.1:1']]);
  });
});

describe('a book outside the commentary', () => {
  test('is read for its citations alone: an opening citation is no heading', () => {
    const paragraphs = [heading('John 1:14', '14'), plain(), sectionTitle(cite('John 1:1', '1'))];
    expect(readerFor('GC')(paragraphs).map(labels)).toEqual([['43.1:14'], [], ['43.1:1']]);
    expect(readerFor('5BC')(paragraphs).map(labels)).toEqual([['43.1:14'], ['43.1:14'], []]);
  });
});

/** A seeded generator, so a failure names the seed that made it. */
const seeded = (seed: number) => {
  let state = seed >>> 0;
  return (n: number): number => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state % n;
  };
};

type Made =
  | { readonly kind: 'title' }
  | { readonly kind: 'heading'; readonly verse: number }
  | { readonly kind: 'plain'; readonly cites: readonly number[] };

const madeParagraph = (made: Made): VolumeParagraph => {
  switch (made.kind) {
    case 'title':
      return sectionTitle(text('A made-up title'));
    case 'heading':
      return heading(`John 3:${String(made.verse)}`, String(made.verse));
    case 'plain':
      return plain(
        ...made.cites.map((verse) => cite(`Mark 2:${String(verse)}`, `Mark 2:${String(verse)}`)),
      );
  }
};

const madeVolume = (below: (n: number) => number): Made[] =>
  Array.from({ length: below(30) }, (): Made => {
    const kind = below(6);
    if (kind === 0) return { kind: 'title' };
    if (kind === 1) return { kind: 'heading', verse: below(20) + 1 };
    return { kind: 'plain', cites: Array.from({ length: below(3) }, () => below(5) + 1) };
  });

describe('a volume, generated', () => {
  test("each paragraph's verses are its heading's and its own citations', once each", () => {
    for (let seed = 1; seed <= 200; seed++) {
      const made = madeVolume(seeded(seed));
      let under: string[] = [];
      const expected = made.map((paragraph) => {
        if (paragraph.kind === 'title') {
          under = [];
          return [];
        }
        if (paragraph.kind === 'heading') {
          under = [`43.3:${String(paragraph.verse)}`];
          return under;
        }
        return [...new Set([...under, ...paragraph.cites.map((verse) => `41.2:${String(verse)}`)])];
      });
      expect([seed, volumeVerses(made.map(madeParagraph)).map(labels)]).toEqual([seed, expected]);
    }
  });

  test('read in parts, a volume gives what it gives read whole', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const below = seeded(seed);
      const paragraphs = madeVolume(below).map(madeParagraph);
      const read = readerFor('5BC');
      const parts: (readonly CitedVerse[])[] = [];
      for (let from = 0; from < paragraphs.length;) {
        const to = from + below(5) + 1;
        parts.push(...read(paragraphs.slice(from, to)));
        from = to;
      }
      expect([seed, parts.map(labels)]).toEqual([seed, volumeVerses(paragraphs).map(labels)]);
    }
  });

  test("a book's citations are each paragraph's own, whatever stands before it", () => {
    for (let seed = 1; seed <= 200; seed++) {
      const made = madeVolume(seeded(seed));
      const expected = made.map((paragraph) => {
        if (paragraph.kind === 'title') return [];
        if (paragraph.kind === 'heading') return [`43.3:${String(paragraph.verse)}`];
        return [...new Set(paragraph.cites.map((verse) => `41.2:${String(verse)}`))];
      });
      expect([seed, citationVerses(made.map(madeParagraph)).map(labels)]).toEqual([seed, expected]);
    }
  });
});
