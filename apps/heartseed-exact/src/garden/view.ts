/**
 * What Your verses shows of a call's garden: each list in the order kept,
 * each of its verses as its plant stands (a verse not yet said is a seed,
 * due now), then the single verses in the order planted. A verse is due at
 * its FSRS card's due; its day is the reader's day (`dayOf`, turning at
 * 04:00) of that instant in the zone the call names, counted from the
 * call's own day. While the store could not be read the view claims
 * nothing: no list, no verse, no limit reached.
 */

import { LIMIT_LINE } from '@manna/heartseed/chooser';
import { dayOf } from '@manna/heartseed/day';
import { stageOf, type GardenView, type Plant } from '@manna/heartseed/garden';
import { listsOf } from '@manna/heartseed/lists';
import { MOST_PASSAGES, verseReference } from '@manna/heartseed/passages';
import { Array as Arr, Option } from 'effect';

import type { Held } from './program';

import { MOST_SINGLES, SINGLES_LIMIT_LINE } from './singles';

/** The instant a call reads the garden at, and the zone's offset then, in minutes east of UTC. */
export interface At {
  readonly now: number;
  readonly offset: number;
}

/** One verse as Your verses shows it: `slug` names its nodes, `lastGrade` is its last recall's grade (0 before any). */
export interface GardenVerse {
  reference: string;
  slug: string;
  planted: boolean;
  stage: string;
  recalls: number;
  lastGrade: number;
  due: number;
  dueNow: boolean;
  dueIn: number;
}

/** One list and its verses; `slug` names its nodes. */
export interface GardenList {
  id: string;
  slug: string;
  title: string;
  verses: GardenVerse[];
}

/** Your verses: the lists, the single verses, whether either is at its limit, and the line that says so. */
export interface GardenShown {
  read: boolean;
  lists: GardenList[];
  singles: GardenVerse[];
  listsFull: boolean;
  singlesFull: boolean;
  limitLine: string;
}

/** `text` as a node's name: each run of anything but a letter or a digit one hyphen. */
export const slugOf = (text: string) => text.replaceAll(/[^A-Za-z0-9]+/gu, '-');

/** The plant of `reference` in `garden`; none while unread or not yet said. */
export const plantIn = (garden: GardenView, reference: string) => {
  if (garden._tag === 'Unread') return Option.none<Plant>();
  return Option.fromUndefinedOr(garden.plants.get(reference));
};

/** `reference` as `garden` holds it at `at`. */
export const verseIn = (garden: GardenView, reference: string, at: At): GardenVerse => {
  const today = dayOf({ startedAt: at.now, offset: at.offset });
  const slug = slugOf(reference);
  return Option.match(plantIn(garden, reference), {
    onNone: () => ({
      reference,
      slug,
      planted: false,
      stage: 'seed',
      recalls: 0,
      lastGrade: 0,
      due: at.now,
      dueNow: true,
      dueIn: 0,
    }),
    onSome: (each) => ({
      reference,
      slug,
      planted: true,
      stage: stageOf(each),
      recalls: each.recalls.length,
      lastGrade: Arr.lastNonEmpty(each.recalls).grade,
      due: each.card.due,
      dueNow: each.card.due <= at.now,
      dueIn: dayOf({ startedAt: each.card.due, offset: at.offset }) - today,
    }),
  });
};

/** What Your verses shows while the garden is unread: nothing claimed. */
const NOTHING: GardenShown = {
  read: false,
  lists: [],
  singles: [],
  listsFull: false,
  singlesFull: false,
  limitLine: '',
};

/** The one limit line: the lists' while the most are held, else the single verses' while they are at theirs, else none. */
const limitLineOf = (listsFull: boolean, singlesFull: boolean) => {
  if (listsFull) return LIMIT_LINE;
  if (singlesFull) return SINGLES_LIMIT_LINE;
  return '';
};

/** Your verses over what a call holds, at `at`. */
export const shownOf = (held: Held, at: At): GardenShown => {
  const { garden, passages } = held;
  if (garden._tag === 'Unread' || passages._tag === 'Unread') return NOTHING;
  return Option.match(held.singles, {
    onNone: () => NOTHING,
    onSome: (singles) => {
      const listsFull = passages.passages.length + passages.lists.length >= MOST_PASSAGES;
      const singlesFull = singles.length >= MOST_SINGLES;
      return {
        read: true,
        lists: listsOf([], passages, []).map((list) => ({
          id: list.id,
          slug: slugOf(list.id),
          title: list.title,
          verses: list.verses.map((reference) => verseIn(garden, reference, at)),
        })),
        singles: singles.map((range) =>
          verseIn(garden, verseReference(range.book, range.chapter, range.first), at),
        ),
        listsFull,
        singlesFull,
        limitLine: limitLineOf(listsFull, singlesFull),
      };
    },
  });
};
