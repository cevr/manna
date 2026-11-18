import { describe, expect, test } from 'bun:test';
import { Option } from 'effect';

import { getBibleBook } from '../bible/canon.js';
import { kjvChapterEnds } from '../bible/chapter-ends.js';
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

  test('a chapter printed bare names that whole chapter, never verse N of chapter N', () => {
    expect(labels(citedVerses('John 9:1', '9'))).toEqual(['43.9:*']);
    expect(labels(citedVerses('John 1:4', 'John 1:4, 5'))).toEqual(['43.1:4', '43.1:5']);
    expect(labels(citedVerses('John 1:1', '1'))).toEqual(['43.1:1']);
    expect(labels(citedVerses('John 9:9', '9'))).toEqual(['43.9:9']);
    expect(labels(citedVerses('Isaiah 55:1', '55-58'))).toEqual([
      '23.55:*',
      '23.56:*',
      '23.57:*',
      '23.58:*',
    ]);
  });

  test("a first segment read in another book than the title's names the title", () => {
    expect(labels(citedVerses('Ezekiel 1:22', 'Ez 1:22'))).toEqual(['26.1:22']);
    expect(labels(citedVerses('Isaiah 53:5', 'Isaiah 53:5; 1 Peter 2:24'))).toEqual([
      '23.53:5',
      '60.2:24',
    ]);
  });

  test('a chapter past its book’s last names nothing', () => {
    expect(labels(citedVerses('Hebrews 11:21', 'Hebrews 11:21, 48:15, 13:2'))).toEqual([
      '58.11:21',
      '58.13:2',
    ]);
    expect(labels(citedVerses('Psalms 150:1', '150, 151'))).toEqual(['19.150:*']);
  });

  test('a chapter list names each chapter', () => {
    expect(labels(citedVerses('Revelation 21:1', 'Revelation 21, 22'))).toEqual([
      '66.21:*',
      '66.22:*',
    ]);
    expect(labels(citedVerses('Revelation 21:1', '21, 22'))).toEqual(['66.21:*', '66.22:*']);
    expect(labels(citedVerses('Daniel 10:1', 'chapters 10, 11, and 12'))).toEqual([
      '27.10:*',
      '27.11:*',
      '27.12:*',
    ]);
    expect(labels(citedVerses('Exodus 3:1', 'Chap. 3, 4'))).toEqual(['2.3:*', '2.4:*']);
    expect(labels(citedVerses('Galatians 3:1', 'Galatians chap. 3, 4'))).toEqual([
      '48.3:*',
      '48.4:*',
    ]);
    expect(labels(citedVerses('Isaiah 56:1', 'chaps. 56, 58'))).toEqual(['23.56:*', '23.58:*']);
    expect(labels(citedVerses('Acts 17:2', 'Chap. 17:2'))).toEqual(['44.17:2']);
    expect(labels(citedVerses('Revelation 1:1', 'Verses 1, 3'))).toEqual(['66.1:1', '66.1:3']);
    expect(labels(citedVerses('Revelation 21:1', 'Revelation 21, 22:1-2'))).toEqual([
      '66.21:*',
      '66.22:1',
      '66.22:2',
    ]);
  });

  test('a bare chapter number, generated, names that chapter whole', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const below = seeded(seed);
      const chapter = below(49) + 2;
      const more = below(3);
      const printed = Array.from({ length: more + 1 }, (_, at) => String(chapter + at)).join(', ');
      expect([seed, labels(citedVerses(`Psalms ${String(chapter)}:1`, printed))]).toEqual([
        seed,
        Array.from({ length: more + 1 }, (_, at) => `19.${String(chapter + at)}:*`),
      ]);
    }
  });

  test('a title that names no verse names nothing', () => {
    expect(citedVerses('made up', 'John 3:16')).toEqual([]);
  });
});

describe("a citation past its chapter's last verse", () => {
  test('a range stops at the last verse', () => {
    expect(labels(citedVerses('John 21:24', 'John 21:24-26'))).toEqual(['43.21:24', '43.21:25']);
    expect(labels(citedVerses('John 21:24', '21:24, 25'))).toEqual(['43.21:24', '43.21:25']);
    expect(labels(citedVerses('Psalms 1:1', '1:1-20'))).toEqual(
      Array.from({ length: 6 }, (_, at) => `19.1:${String(at + 1)}`),
    );
  });

  test('a range whose end prints the next chapter and its verse runs into that chapter', () => {
    expect(labels(citedVerses('Mark 8:27', 'Mark 8:27-91'))).toEqual([
      ...Array.from({ length: 12 }, (_, at) => `41.8:${String(at + 27)}`),
      '41.9:1',
    ]);
    expect(labels(citedVerses('Hebrews 5:12', '5:12-61, 3'))).toEqual([
      '58.5:12',
      '58.5:13',
      '58.5:14',
      '58.6:1',
      '58.6:3',
    ]);
    expect(labels(citedVerses('Hebrews 5:12', 'Hebrews 5:12-60'))).toEqual([
      '58.5:12',
      '58.5:13',
      '58.5:14',
    ]);
  });

  test('a verse past the end, or a range starting there, names nothing', () => {
    expect(labels(citedVerses('Matthew 13:54', 'Matthew 13:54-58, 101'))).toEqual([
      '40.13:54',
      '40.13:55',
      '40.13:56',
      '40.13:57',
      '40.13:58',
    ]);
    expect(labels(citedVerses('Daniel 12:8', '12:8-10, 15-17'))).toEqual([
      '27.12:8',
      '27.12:9',
      '27.12:10',
    ]);
    expect(labels(citedVerses('Numbers 23:24', 'Numbers 23:24, 249'))).toEqual(['4.23:24']);
  });

  test('the verse counts are passed in', () => {
    const tens = (book: number, chapter: number) =>
      Option.filter(Option.some(10), () => book === 43 && chapter <= 3);
    const paragraphs = [plain(cite('John 1:9', 'John 1:9-12')), plain(cite('John 3:9', '3:9-41'))];
    expect(readerFor('GC', tens)(paragraphs).map(labels)).toEqual([
      ['43.1:9', '43.1:10'],
      ['43.3:9', '43.3:10'],
    ]);
    expect(readerFor('GC')(paragraphs).map(labels)).toEqual([
      ['43.1:9', '43.1:10', '43.1:11', '43.1:12'],
      [...Array.from({ length: 28 }, (_, at) => `43.3:${String(at + 9)}`), '43.4:1'],
    ]);
  });

  test("no stored link, generated, names a verse past its chapter's last", () => {
    for (let seed = 1; seed <= 300; seed++) {
      const below = seeded(seed);
      const paragraphs = Array.from({ length: below(4) + 1 }, () => {
        const book = below(66) + 1;
        const name = Option.getOrThrow(getBibleBook(book)).name;
        const chapters = Option.getOrThrow(getBibleBook(book)).chapters;
        const chapter = below(chapters) + 1;
        const last = Option.getOrThrow(kjvChapterEnds(book, chapter));
        const from = below(last + 5) + 1;
        const to = from + below(90);
        const lostColon = `${String(chapter + 1)}${String(below(30) + 1)}`;
        const printings = [
          `${name} ${String(chapter)}:${String(from)}-${String(to)}`,
          `${String(chapter)}:${String(from)}-${String(to)}`,
          `${String(chapter)}:${String(from)}-${lostColon}, ${String(below(40) + 1)}`,
          `${String(from)}-${String(to)}, ${String(to + 1)}`,
          `${String(from)}, ${String(to)}`,
          `${name} ${String(chapter)}:${String(to)}`,
        ];
        return plain(
          cite(
            `${name} ${String(chapter)}:${String(from)}`,
            printings[below(printings.length)] ?? '',
          ),
        );
      });
      const code = ['5BC', 'GC'][below(2)] ?? 'GC';
      const rows = readerFor(code)(paragraphs).flat();
      const past = rows.filter((row) =>
        Option.exists(row.bibleVerse, (number) =>
          Option.match(kjvChapterEnds(row.bibleBook, row.bibleChapter), {
            onNone: () => true,
            onSome: (last) => number < 1 || number > last,
          }),
        ),
      );
      expect([seed, past.map(label)]).toEqual([seed, []]);
    }
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
