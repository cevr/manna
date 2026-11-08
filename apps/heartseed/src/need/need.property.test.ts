/* oxlint-disable effect/noGlobals, effect/noNullish, effect/noTernary -- the property draws its gardens and taught sets as plain branches over maps, and compares cards by their JSON. */

/**
 * When I need…'s rule (`needOf`, hspromise N3-N4) against the rule written
 * plainly (`test/promise-model.ts`). Its seam is the pure derivation the
 * screen draws: which cards show, in what order, each card's known
 * promises and its count still to learn.
 *
 * The gardens span the rule's domain: every subset of the Fear
 * collection's 14 verses with Fear taught; generated gardens over all 188
 * promise verses at shares from 3 % to 97 %, with near misses (a
 * neighbouring verse, the verse with a trailing space, a verse past its
 * chapter, verses of no promise) and a promise of 2-3 verses with one
 * verse alone planted; taught sets of none, Fear, one, several and all
 * fourteen ids, each in any order. Fixed cases follow: every card, none,
 * and the first minute's promise alone.
 *
 * It catches the cards in Selah's order, a promise known on one planted
 * verse, every card shown, a card not taught with no promise known, a count
 * that ignores what is known or shows on a card not taught, and a
 * reference matched loosely. It misses the screen, which draws the cards
 * (`need/screen.test.tsx`).
 */

import { describe, expect, it } from 'bun:test';

import { plantOf, type Plant, type ReadGarden } from '../garden';
import { needOf } from '../need';
import { COLLECTIONS } from '../promises';
import { recallOf } from '../test/field-model';
import { below, random } from '../test/garden-model';
import { cardOrder, needModel, promiseVerses } from '../test/promise-model';

const IDS = COLLECTIONS.map((collection) => collection.id);
const FEAR = COLLECTIONS.find((collection) => collection.id === 'protection');
const FEAR_VERSES = (FEAR?.promises ?? []).flatMap(promiseVerses);
const ALL_VERSES = COLLECTIONS.flatMap((collection) => collection.promises.flatMap(promiseVerses));
const LONG = COLLECTIONS.flatMap((collection) =>
  collection.promises.filter((range) => range.last > range.first),
);
const NEAR_MISSES = [
  'Isaiah 41:1',
  'Isaiah 41:100',
  'Psalms 91:1 ',
  'Psalms 91:3',
  'Psalms 91:17',
  'Genesis 1:1',
  'John 3:17',
];

/** One plant per reference, built once: `needOf` reads only which references are planted. */
const plants = new Map<string, Plant>();
const plantFor = (reference: string): Plant => {
  const held = plants.get(reference);
  if (held !== undefined) return held;
  const plant = plantOf([recallOf(reference, Date.UTC(2026, 3, 1), 3, 0)]);
  plants.set(reference, plant);
  return plant;
};

const gardenOf = (references: Iterable<string>): ReadGarden => ({
  _tag: 'Read',
  plants: new Map([...references].map((reference) => [reference, plantFor(reference)])),
});

const shuffled = <A>(next: () => number, list: readonly A[]): A[] =>
  list
    .map((item) => ({ item, key: next() }))
    .toSorted((a, b) => a.key - b.key)
    .map(({ item }) => item);

/** The cards as plain data, for an equality the two sides share. */
const plain = (
  cards: readonly { id: string; title: string; known: readonly object[]; toLearn: number }[],
) =>
  JSON.stringify(
    cards.map((card) => ({
      id: card.id,
      title: card.title,
      known: card.known.map((range) => JSON.stringify(range, ['book', 'chapter', 'first', 'last'])),
      toLearn: card.toLearn,
    })),
  );

/** Checks `needOf` against the model over `planted` and `taught`, naming the first few that differ, and counts what each case reached. */
const judge = () => {
  const wrong: string[] = [];
  const reached = new Map<string, number>();
  const hit = (name: string) => reached.set(name, (reached.get(name) ?? 0) + 1);
  const check = (planted: readonly string[], taught: readonly string[]) => {
    const want = needModel(new Set(planted), taught);
    const got = needOf(gardenOf(planted), taught);
    if (plain(got) !== plain(want) && wrong.length < 5)
      wrong.push(
        `planted ${planted.length} (${planted.slice(0, 4).join(', ')}…), taught ${JSON.stringify(taught)}: ${plain(got).slice(0, 200)}`,
      );
    for (const card of want) {
      if (!taught.includes(card.id)) hit('card:not-taught');
      if (taught.includes(card.id)) hit(`toLearn:${card.toLearn}`);
    }
    if (want.some((card) => taught.includes(card.id) && card.known.length > 0))
      hit('taught:some-known');
  };
  return { wrong, reached, hit, check };
};

/** A garden's references: the promise verses at a share of 3-97 %, near misses, and sometimes one verse alone of a promise of 2-3. */
const plantedFrom = (next: () => number, hit: (name: string) => void): Set<string> => {
  const share = [0.03, 0.3, 0.7, 0.97][below(next, 4)] ?? 0.3;
  const planted = new Set(ALL_VERSES.filter(() => next() < share));
  for (const miss of NEAR_MISSES)
    if (next() < 0.3) {
      planted.add(miss);
      hit('near-miss');
    }
  if (next() < 0.3) {
    const range = LONG[below(next, LONG.length)];
    const verses = range === undefined ? [] : promiseVerses(range);
    const alone = verses[below(next, verses.length)];
    for (const verse of verses) planted.delete(verse);
    if (alone !== undefined) planted.add(alone);
    hit('one-verse-of-many');
  }
  return planted;
};

/** A taught set: none, Fear, one id, several or all fourteen, in any order. */
const taughtFrom = (next: () => number, hit: (name: string) => void): readonly string[] => {
  const kind = below(next, 5);
  hit(`taught:${['none', 'fear', 'one', 'several', 'all'][kind]}`);
  if (kind === 0) return [];
  if (kind === 1) return ['protection'];
  if (kind === 2) return shuffled(next, IDS).slice(0, 1);
  if (kind === 3) return shuffled(next, IDS).slice(0, 2 + below(next, 11));
  return shuffled(next, IDS);
};

describe('When I need…’s cards', () => {
  it('follow the rule over every subset of the Fear collection’s verses, Fear taught', () => {
    const { wrong, reached, check } = judge();
    for (let mask = 0; mask < 1 << FEAR_VERSES.length; mask++)
      check(
        FEAR_VERSES.filter((_, index) => (mask >> index) & 1),
        ['protection'],
      );
    expect({ wrong, verses: FEAR_VERSES.length }).toEqual({ wrong: [], verses: 14 });
    expect({
      none: reached.get('toLearn:12') ?? 0,
      one: reached.get('toLearn:1') ?? 0,
      all: reached.get('toLearn:0') ?? 0,
    }).toEqual({ none: 9, one: 16, all: 1 });
  });

  it('follow the rule over generated gardens of every promise verse, near misses and taught sets', () => {
    const { wrong, reached, hit, check } = judge();
    const next = random(11);
    for (let n = 0; n < 3000; n++) {
      const planted = plantedFrom(next, hit);
      check(shuffled(next, [...planted]), taughtFrom(next, hit));
    }
    const floors = {
      'near-miss': 1500,
      'one-verse-of-many': 600,
      'taught:none': 400,
      'taught:fear': 400,
      'taught:one': 400,
      'taught:several': 400,
      'taught:all': 400,
      'card:not-taught': 5000,
      'taught:some-known': 1500,
      'toLearn:0': 100,
    };
    const short = Object.entries(floors).filter(
      ([name, floor]) => (reached.get(name) ?? 0) < floor,
    );
    expect({ wrong, short }).toEqual({ wrong: [], short: [] });
  });

  it('show every card in the situations’ order when every promise is known', () => {
    const cards = needOf(gardenOf(ALL_VERSES), []);
    expect(cards.map((card) => card.id)).toEqual([...cardOrder()]);
    expect(cards.map((card) => card.id)).toEqual([
      'protection',
      'victory',
      'peace',
      'healing',
      'forgiveness',
      'guidance',
      'provision',
      'comfort',
      'strength',
      'spirit',
      'salvation',
      'return',
      'prayer',
      'rest',
    ]);
    expect(cards.every((card) => card.toLearn === 0)).toBe(true);
  });

  it('show the taught card alone over an empty garden, 12 still to learn, and none untaught', () => {
    expect(plain(needOf(gardenOf([]), ['protection']))).toBe(
      plain([{ id: 'protection', title: 'Protection & Fear', known: [], toLearn: 12 }]),
    );
    expect(needOf(gardenOf([]), [])).toEqual([]);
  });

  it('show the first minute’s promise under Strength, beside Fear', () => {
    const cards = needOf(gardenOf(['Isaiah 41:10']), ['protection']);
    expect(cards.map((card) => [card.title, card.known.length, card.toLearn] as const)).toEqual([
      ['Protection & Fear', 0, 12],
      ['Strength', 1, 0],
    ]);
  });
});
