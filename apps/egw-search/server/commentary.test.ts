import { describe, expect, test } from 'bun:test';
import { Option } from 'effect';

import {
  builtPack,
  COMMENTARY_BOOKS,
  type CommentaryLink,
  packOf,
  packSum,
  sumOf,
  versionOf,
} from './commentary.js';

/** A seeded generator, so a failure names the seed that made it. */
const seeded = (seed: number) => {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d_2b_79_f5) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), state | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4_294_967_296;
  };
  const below = (n: number) => Math.floor(next() * n);
  const pick = <A>(items: readonly A[]): A => items[below(items.length)] as A;
  const shuffled = <A>(items: readonly A[]): A[] => {
    const out = [...items];
    for (let at = out.length - 1; at > 0; at--) {
      const other = below(at + 1);
      [out[at], out[other]] = [out[other] as A, out[at] as A];
    }
    return out;
  };
  return { below, pick, shuffled };
};

const BOOKS = [...COMMENTARY_BOOKS, '7ABC', 'GC', 'DA'];
const LETTERS = 'abcdefghij ';

/** Generated link rows: made-up paragraphs in the commentary's volumes and in
 *  other books, linked to verses and to whole chapters, one paragraph under
 *  several verses and chapters, the rows shuffled. */
const generate = (seed: number): CommentaryLink[] => {
  const random = seeded(seed);
  const links: CommentaryLink[] = [];
  const paragraphs = random.below(40);
  const orders = new Map<string, number[]>();
  for (let at = 0; at < paragraphs; at++) {
    const bookCode = random.pick(BOOKS);
    const taken = orders.get(bookCode) ?? [];
    const puborder = taken.length * 3 + random.below(3) + 1;
    taken.push(puborder);
    orders.set(bookCode, taken);
    const reference = `${bookCode} ${String(random.below(1200))}.${String(puborder)}`;
    const text = Array.from({ length: random.below(30) }, () => random.pick([...LETTERS])).join('');
    const linkCount = random.below(5);
    for (let link = 0; link < linkCount; link++) {
      const chapterWide = random.below(4) === 0;
      const verse = Option.filter(Option.some(random.below(30) + 1), () => !chapterWide);
      links.push({
        bookCode,
        puborder,
        reference,
        text,
        bibleBook: random.below(66) + 1,
        bibleChapter: random.below(6) + 1,
        bibleVerse: verse,
      });
    }
  }
  return random.shuffled(links);
};

const isCommentary = (link: CommentaryLink) => COMMENTARY_BOOKS.includes(link.bookCode);
const noteOf = (link: CommentaryLink) => `${link.reference}\n${link.text}`;

const SEEDS = Array.from({ length: 200 }, (_, at) => at + 1);

describe('the commentary pack', () => {
  test('holds each linked commentary paragraph once, in book then publication order', () => {
    for (const seed of SEEDS) {
      const links = generate(seed);
      const pack = packOf(links);
      const expected = new Map<string, CommentaryLink>();
      for (const link of links.filter(isCommentary)) {
        expected.set(`${link.bookCode} ${String(link.puborder)}`, link);
      }
      const ordered = [...expected.values()].sort(
        (left, right) =>
          left.bookCode.localeCompare(right.bookCode) || left.puborder - right.puborder,
      );
      expect([seed, pack.notes.map(([reference, text]) => `${reference}\n${text}`)]).toEqual([
        seed,
        ordered.map(noteOf),
      ]);
    }
  });

  test('puts every link under its chapter and verse, indexes in range, ascending, once', () => {
    for (const seed of SEEDS) {
      const links = generate(seed);
      const pack = packOf(links);
      const notes = pack.notes.map(([reference, text]) => `${reference}\n${text}`);
      for (const link of links.filter(isCommentary)) {
        const chapter = pack.verses[`${String(link.bibleBook)}.${String(link.bibleChapter)}`] ?? [];
        const verse = Option.getOrElse(link.bibleVerse, () => 0);
        const indexes = chapter.find(([number]) => number === verse)?.[1] ?? [];
        expect([seed, indexes.map((index) => notes[index])]).toEqual([
          seed,
          expect.arrayContaining([noteOf(link)]),
        ]);
      }
      const keys = Object.keys(pack.verses).map((key) => key.split('.').map(Number));
      const sortedKeys = [...keys].sort(
        ([leftBook = 0, leftChapter = 0], [rightBook = 0, rightChapter = 0]) =>
          leftBook - rightBook || leftChapter - rightChapter,
      );
      expect(keys).toEqual(sortedKeys);
      for (const chapter of Object.values(pack.verses)) {
        const verseNumbers = chapter.map(([number]) => number);
        expect(verseNumbers).toEqual([...new Set(verseNumbers)].sort((a, b) => a - b));
        for (const [, indexes] of chapter) {
          expect(indexes).toEqual([...new Set(indexes)].sort((a, b) => a - b));
          for (const index of indexes) expect(index).toBeLessThan(pack.count);
        }
      }
    }
  });

  test('every note is linked, so no paragraph of another book or without a link is in it', () => {
    for (const seed of SEEDS) {
      const pack = packOf(generate(seed));
      const linked = new Set(
        Object.values(pack.verses).flatMap((chapter) => chapter.flatMap(([, indexes]) => indexes)),
      );
      expect(linked.size).toBe(pack.count);
      for (const [reference] of pack.notes) {
        expect(COMMENTARY_BOOKS).toContain(reference.split(' ')[0] ?? '');
      }
    }
  });

  test('count, sum and version hold', () => {
    for (const seed of SEEDS) {
      const pack = packOf(generate(seed));
      expect(pack.format).toBe(1);
      expect(pack.count).toBe(pack.notes.length);
      expect(pack.sum).toBe(packSum(pack.notes, pack.verses));
      expect(pack.version).toBe(`${String(pack.count)}-${pack.sum.toString(16).padStart(8, '0')}`);
      expect(pack.version).toMatch(/^\d+-[0-9a-f]{8}$/);
    }
  });

  test('the same rows in any order give the same bytes', () => {
    for (const seed of SEEDS) {
      const links = generate(seed);
      const reordered = seeded(seed + 1000).shuffled(links);
      expect(builtPack(reordered)).toEqual(builtPack(links));
    }
  });

  test('one changed character in one note changes the version', () => {
    let checked = 0;
    for (const seed of SEEDS) {
      const links = generate(seed);
      const found = links.find((link) => isCommentary(link) && link.text.length > 0);
      for (const first of Option.toArray(Option.fromUndefinedOr(found))) {
        const same = (link: CommentaryLink) =>
          link.bookCode === first.bookCode && link.puborder === first.puborder;
        const changed = [
          ...links.filter((link) => !same(link)),
          ...links.filter(same).map((link) => ({ ...link, text: `${link.text.slice(0, -1)}z` })),
        ];
        expect(builtPack(changed).version).not.toBe(builtPack(links).version);
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(100);
  });

  test('one link moved to another verse, the notes unchanged, changes the version', () => {
    let checked = 0;
    for (const seed of SEEDS) {
      const links = generate(seed);
      const at = links.findIndex(isCommentary);
      for (const moved of Option.toArray(Option.fromUndefinedOr(links[at]))) {
        const changed = links.with(at, { ...moved, bibleVerse: Option.some(99) });
        const before = packOf(links);
        const after = packOf(changed);
        expect(after.notes).toEqual(before.notes);
        expect([seed, after.version]).not.toEqual([seed, before.version]);
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(100);
  });

  test('any one-field edit of a pack changes its sum', () => {
    type Pack = ReturnType<typeof packOf>;
    type Edit = (pack: Pack, random: ReturnType<typeof seeded>) => Option.Option<Pack>;
    const versesText = (verses: Pack['verses'][string]) =>
      verses.map(([verse, indexes]) => `${String(verse)}:${indexes.join(',')}`).join(' ');
    const verseEdit =
      (
        change: (
          entry: readonly [number, readonly number[]],
          count: number,
        ) => Option.Option<readonly [number, readonly number[]]>,
      ): Edit =>
      (pack, random) => {
        const keys = Object.keys(pack.verses);
        if (keys.length === 0) return Option.none();
        const key = random.pick(keys);
        const chapter = pack.verses[key] ?? [];
        const at = random.below(chapter.length);
        return Option.map(change(chapter[at] ?? [0, []], pack.count), (entry) => ({
          ...pack,
          verses: { ...pack.verses, [key]: chapter.with(at, entry) },
        }));
      };
    const noteEdit =
      (change: (note: readonly [string, string]) => readonly [string, string]): Edit =>
      (pack, random) => {
        if (pack.notes.length === 0) return Option.none();
        const at = random.below(pack.notes.length);
        return Option.some({
          ...pack,
          notes: pack.notes.with(at, change(pack.notes[at] ?? ['', ''])),
        });
      };
    const edits = {
      'a verse renumbered': verseEdit(([verse, indexes]) => Option.some([verse + 100, indexes])),
      'an index dropped': verseEdit(([verse, indexes]) =>
        Option.some([verse, indexes.slice(1)] as const),
      ),
      'an index pointed elsewhere': (pack, random) =>
        verseEdit(([verse, indexes], count) => {
          const at = random.below(indexes.length);
          return Option.filter(
            Option.some([verse, indexes.with(at, ((indexes[at] ?? 0) + 1) % count)] as const),
            () => count > 1,
          );
        })(pack, random),
      'an index added': verseEdit(([verse, indexes], count) =>
        Option.map(
          Option.fromUndefinedOr(
            Array.from({ length: count }, (_, index) => index).find(
              (index) => !indexes.includes(index),
            ),
          ),
          (index) => [verse, [...indexes, index].sort((a, b) => a - b)] as const,
        ),
      ),
      'a verse dropped': (pack, random) => {
        const keys = Object.keys(pack.verses);
        if (keys.length === 0) return Option.none();
        const key = random.pick(keys);
        const chapter = pack.verses[key] ?? [];
        const at = random.below(chapter.length);
        return Option.some({
          ...pack,
          verses: { ...pack.verses, [key]: chapter.filter((_, index) => index !== at) },
        });
      },
      "two chapters' verses swapped": (pack, random) => {
        const keys = Object.keys(pack.verses);
        const [left = '', right = ''] = random.shuffled(keys);
        const leftVerses = pack.verses[left] ?? [];
        const rightVerses = pack.verses[right] ?? [];
        return Option.filter(
          Option.some({
            ...pack,
            verses: { ...pack.verses, [left]: rightVerses, [right]: leftVerses },
          }),
          () => keys.length > 1 && versesText(leftVerses) !== versesText(rightVerses),
        );
      },
      'the chapters in another order': (pack, random) => {
        const entries = Object.entries(pack.verses);
        const reordered = random.shuffled(entries);
        return Option.filter(
          Option.some({ ...pack, verses: Object.fromEntries(reordered) }),
          () => reordered.map(([key]) => key).join(' ') !== entries.map(([key]) => key).join(' '),
        );
      },
      'two notes swapped': (pack, random) => {
        if (pack.notes.length < 2) return Option.none();
        const [left = 0, right = 0] = random.shuffled(pack.notes.map((_, index) => index));
        const leftNote = pack.notes[left] ?? ['', ''];
        const rightNote = pack.notes[right] ?? ['', ''];
        return Option.filter(
          Option.some({
            ...pack,
            notes: pack.notes.with(left, rightNote).with(right, leftNote),
          }),
          () => leftNote.join('\n') !== rightNote.join('\n'),
        );
      },
      'two texts swapped': (pack, random) => {
        if (pack.notes.length < 2) return Option.none();
        const [left = 0, right = 0] = random.shuffled(pack.notes.map((_, index) => index));
        const [leftReference = '', leftText = ''] = pack.notes[left] ?? [];
        const [rightReference = '', rightText = ''] = pack.notes[right] ?? [];
        return Option.filter(
          Option.some({
            ...pack,
            notes: pack.notes
              .with(left, [leftReference, rightText] as const)
              .with(right, [rightReference, leftText] as const),
          }),
          () => leftText !== rightText,
        );
      },

      'a chapter moved': (pack, random) => {
        const keys = Object.keys(pack.verses);
        if (keys.length === 0) return Option.none();
        const key = random.pick(keys);
        const { [key]: moved = [], ...rest } = pack.verses;
        return Option.some({ ...pack, verses: { ...rest, [`${key}0`]: moved } });
      },
      'a reference changed': noteEdit(([reference, text]) => [`${reference}x`, text]),
      'a text changed': noteEdit(([reference, text]) => [reference, `${text}x`]),
    } satisfies Record<string, Edit>;
    for (const [name, edit] of Object.entries(edits)) {
      let checked = 0;
      for (const seed of SEEDS) {
        const pack = packOf(generate(seed));
        for (const edited of Option.toArray(edit(pack, seeded(seed + 2000)))) {
          expect([name, seed, packSum(edited.notes, edited.verses)]).not.toEqual([
            name,
            seed,
            pack.sum,
          ]);
          checked += 1;
        }
      }
      expect([name, checked > 100]).toEqual([name, true]);
    }
  });

  test('a line moved across a note boundary, every line the same, changes the sum', () => {
    const lines = (notes: readonly (readonly [string, string])[]) => notes.flat().join('\n');
    let checked = 0;
    for (const seed of SEEDS) {
      const pack = packOf(generate(seed));
      const at = seeded(seed + 3000).below(pack.notes.length);
      const [reference = '', text = ''] = pack.notes[at] ?? [];
      const [nextReference = '', nextText = ''] = pack.notes[at + 1] ?? [];
      if (at + 1 >= pack.notes.length) continue;
      const before = pack.notes
        .with(at, [reference, text] as const)
        .with(at + 1, [nextReference, `${nextText}\nq`] as const);
      const after = pack.notes
        .with(at, [reference, `${text}\n${nextReference}`] as const)
        .with(at + 1, [nextText, 'q'] as const);
      expect(lines(after)).toBe(lines(before));
      expect([seed, packSum(after, pack.verses)]).not.toEqual([seed, packSum(before, pack.verses)]);
      checked += 1;
    }
    expect(checked).toBeGreaterThan(100);
  });

  test('links to no Bible book are left out', () => {
    const link: CommentaryLink = {
      bookCode: '1BC',
      puborder: 1,
      reference: '1BC 1.1',
      text: 'made up',
      bibleBook: 67,
      bibleChapter: 1,
      bibleVerse: Option.some(1),
    };
    expect(packOf([link]).count).toBe(0);
  });

  test('no links make an empty pack', () => {
    expect(packOf([])).toEqual({
      format: 1,
      version: versionOf(0, sumOf('')),
      count: 0,
      sum: sumOf(''),
      notes: [],
      verses: {},
    });
  });
});

describe('the shared vector', () => {
  test("sumOf answers the numbers Heartseed's test writes", () => {
    expect(['a', '1BC 24.1\nx', ''].map(sumOf)).toEqual([
      3_826_002_220, 377_222_876, 2_166_136_261,
    ]);
  });

  test("packSum answers the numbers Heartseed's test writes", () => {
    expect([
      packSum([], {}),
      packSum([['1BC 1.1', 'ka lo']], { '1.1': [[0, [0]]] }),
      packSum(
        [
          ['1BC 1.1', 'ka lo'],
          ['2BC 3.4', 'mi'],
        ],
        {
          '1.1': [
            [0, [0]],
            [3, [0, 1]],
          ],
          '19.92': [[16, [1]]],
        },
      ),
    ]).toEqual([2_166_136_261, 1_914_939_250, 4_063_412_732]);
  });

  test("packSum tells apart the two packs Heartseed's test writes, which join alike line by line", () => {
    expect([
      packSum(
        [
          ['1BC 1.1', 'ka\nlo'],
          ['2BC 3.4', 'mi'],
        ],
        { '1.1': [[0, [0, 1]]] },
      ),
      packSum(
        [
          ['1BC 1.1', 'ka'],
          ['lo\n2BC 3.4', 'mi'],
        ],
        { '1.1': [[0, [0, 1]]] },
      ),
    ]).toEqual([3_892_575_022, 1_686_813_255]);
  });
});
