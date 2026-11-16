/**
 * The Read tab's place over generated kept texts and gardens: it is always
 * a chapter of the canon; a kept pair that names one is answered as kept;
 * any other text falls to the first planted verse's chapter, opening on
 * that verse, and with none to John 1; the verse to open on is inside the
 * chapter or 0. A followed reference's route reads by the same rule.
 */

import { expect, it } from 'bun:test';
import { BIBLE_BOOKS } from '@manna/core/bible';
import { versesOf } from '@manna/heartseed/kjv';
import { verseReference } from '@manna/heartseed/passages';

import { seeded, type Random } from '../test/random';
import { READ_FIRST, readAtOf, readPlaceOf, type ReadPlace } from './place';

const SEEDS = 400;

/** A chapter of the canon, drawn at random. */
const chapterOf = (random: Random) => {
  const book = random.pick(BIBLE_BOOKS);
  return { book: book.number, chapter: 1 + random.below(book.chapters), name: book.name };
};

/** A kept pair of texts, and whether it names a chapter of the canon. */
interface Kept {
  readonly book: string;
  readonly chapter: string;
  readonly names: boolean;
}

/** The first verse of a field as handed to the place: its text, and the verse it names (0 for none). */
interface First {
  readonly text: string;
  readonly verse: number;
  readonly book: number;
  readonly chapter: number;
}

/** A kept text: a chapter's own, or one of the shapes a store can hold that names none. */
const keptOf = (random: Random): Kept => {
  const place = chapterOf(random);
  const roll = random.below(8);
  if (roll <= 2) return { book: `${place.book}`, chapter: `${place.chapter}`, names: true };
  const strays = [
    ['', ''],
    [`${place.book}`, ''],
    ['', `${place.chapter}`],
    [`${place.book}`, `${200 + random.below(700)}`],
    [`${67 + random.below(900)}`, '1'],
    ['0', '1'],
    [`0${place.book}`, `${place.chapter}`],
    [`${place.book}.5`, `${place.chapter}`],
    ['John', '3'],
    [`${place.book}`, `-${place.chapter}`],
  ] as const;
  const [book, chapter] = random.pick(strays);
  return { book, chapter, names: false };
};

/** The first verse of a field: a planted verse's reference, or a text that names none. */
const firstOf = (random: Random): First => {
  const place = chapterOf(random);
  const count = versesOf(place.book, place.chapter).length;
  const verse = 1 + random.below(count);
  const roll = random.below(4);
  if (roll <= 1)
    return {
      text: verseReference(place.book, place.chapter, verse),
      verse,
      book: place.book,
      chapter: place.chapter,
    };
  const strays = ['', 'John 3', `${place.name} ${place.chapter}:${count + 1}`, 'Hezekiah 1:1'];
  return { text: random.pick(strays), verse: 0, book: 0, chapter: 0 };
};

const inCanon = (place: ReadPlace) => versesOf(place.book, place.chapter).length > 0;

const nameOf = (book: number, chapter: number) =>
  `${BIBLE_BOOKS.find((each) => each.number === book)?.name} ${chapter}`;

it('answers a chapter of the canon, the kept one first, then the first planted verse, then John 1', () => {
  const seen = { kept: 0, first: 0, john: 0 };
  for (let seed = 1; seed <= SEEDS; seed++) {
    const random = seeded(seed);
    const kept = keptOf(random);
    const first = firstOf(random);
    const place = readPlaceOf(kept.book, kept.chapter, first.text);
    expect({ seed, canon: inCanon(place) }).toEqual({ seed, canon: true });
    expect({ seed, name: place.name }).toEqual({ seed, name: nameOf(place.book, place.chapter) });
    const count = versesOf(place.book, place.chapter).length;
    expect({
      seed,
      inside: place.verse === 0 || (place.verse >= 1 && place.verse <= count),
    }).toEqual({ seed, inside: true });
    if (kept.names) {
      seen.kept++;
      expect({ seed, place }).toEqual({
        seed,
        place: {
          id: 0,
          book: Number(kept.book),
          chapter: Number(kept.chapter),
          verse: 0,
          name: place.name,
        },
      });
    } else if (first.verse > 0) {
      seen.first++;
      expect({ seed, place }).toEqual({
        seed,
        place: {
          id: 0,
          book: first.book,
          chapter: first.chapter,
          verse: first.verse,
          name: place.name,
        },
      });
    } else {
      seen.john++;
      expect({ seed, place }).toEqual({
        seed,
        place: { id: 0, ...READ_FIRST, verse: 0, name: 'John 1' },
      });
    }
  }
  expect(Object.values(seen).every((count) => count >= 40)).toBe(true);
});

/** The verse a route opens on: the one asked when the chapter holds it, else the top. */
const openedOn = (inside: boolean, asked: number) => {
  if (inside) return asked;
  return 0;
};

it("reads a followed reference's route as its chapter, opening inside it or at its top", () => {
  for (let seed = 1; seed <= SEEDS; seed++) {
    const random = seeded(seed);
    const kept = keptOf(random);
    const asked = random.below(200) - 20;
    const at = readAtOf(seed, kept.book, kept.chapter, `${asked}`);
    expect({ seed, canon: inCanon(at), id: at.id }).toEqual({ seed, canon: true, id: seed });
    const count = versesOf(at.book, at.chapter).length;
    const inside = kept.names && asked >= 1 && asked <= count;
    expect({ seed, verse: at.verse }).toEqual({ seed, verse: openedOn(inside, asked) });
    if (!kept.names) expect({ seed, at: [at.book, at.chapter] }).toEqual({ seed, at: [43, 1] });
    else
      expect({ seed, at: [at.book, at.chapter] }).toEqual({
        seed,
        at: [Number(kept.book), Number(kept.chapter)],
      });
  }
});
