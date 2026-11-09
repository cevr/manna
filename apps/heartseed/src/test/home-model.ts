/* oxlint-disable effect/noNullish, effect/noTernary, effect/noGlobals -- the model writes the hshomebase spec's rules out as plain branches over undefined, apart from the app's Option code, so the two cannot share a mistake; it reads a local minute from a Date's own calendar fields. */

/**
 * The hshomebase spec's rules written plainly, apart from `src/lists.ts`,
 * `src/home.ts` and the screens, for the tests to judge the app by. Book
 * names and references come from `test/passages-model.ts`, the canon's
 * verses from its corpus, the collections from the committed list, the
 * field's rows from `test/phrase-model.ts`'s fold rule and the local clock
 * from `Intl` (`test/zone.ts`), never from `src/day.ts`.
 *
 * - L1 a verse's place: a verse of the corpus, its reference written as
 *   `verseRef` writes it, and nothing else.
 * - L2-L3 the lists the field holds: each of the app's own rows (`Own`,
 *   id `own:<title>`), then each range held in stored order (`Passage`, id
 *   `passage:<index>:<book>.<chapter>.<first>-<last>`, titled by `spanRef`,
 *   carrying its range; none while unread), then each taught collection
 *   whose id the list has (`Collection`, id `collection:<id>`, its
 *   promises' verses in order, each once).
 * - H1 the furrows: one per row of the field, the lists' first, then each
 *   other verse as a `Loose` list (`verse:<reference>`); each its kind and
 *   icon by its source (a passage's icon by its book), `<k> of <n> ripe`,
 *   and each plant's stage, ready mark and label.
 * - H2 ready: the verse (a phrase's verse for a phrase) of each item whose
 *   plant holds no more recalls than the item's baseline.
 * - H5 the greeting by the local hour and minute: morning 04:00-11:59,
 *   afternoon 12:00-17:59, evening else.
 */

import type { Recall } from '../sayit';
import { COLLECTIONS } from '../promises';
import {
  countOf,
  historyOf,
  othersOf,
  type ModelPassage,
  type ModelPlantStage,
} from './field-model';
import { below, pickOf } from './garden-model';
import { spanRef, verseRef, versesIn, type Corpus, type Held, type Span } from './passages-model';
import { fieldFoldRule, verseOfRule } from './phrase-model';

/** A verse's place as the model holds it. */
export interface ModelPlace {
  readonly book: number;
  readonly chapter: number;
  readonly verse: number;
}

/** Every verse of `corpus`, by its reference, at its place. */
export const placesOf = (corpus: Corpus): ReadonlyMap<string, ModelPlace> => {
  const places = new Map<string, ModelPlace>();
  for (const book of corpus.books) {
    const chapters = corpus.counts.get(book) ?? 0;
    for (let chapter = 1; chapter <= chapters; chapter++) {
      const count = versesIn(corpus, book, chapter).length;
      for (let verse = 1; verse <= count; verse++)
        places.set(verseRef(book, chapter, verse), { book, chapter, verse });
    }
  }
  return places;
};

/** A list's source as the model holds it. */
export type ModelSource =
  | { readonly tag: 'Own' }
  | { readonly tag: 'Passage'; readonly span: Span }
  | { readonly tag: 'Collection'; readonly id: string }
  | { readonly tag: 'Loose' };

/** A list as the model holds it. */
export interface ModelList {
  readonly id: string;
  readonly title: string;
  readonly verses: readonly string[];
  readonly range: Span | undefined;
  readonly source: ModelSource;
}

/** L2-L3: the lists the field holds over the app's `own` rows, the passages `held` and the collections `taught`. */
export const listsModel = (
  own: readonly ModelPassage[],
  held: Held,
  taught: readonly string[],
): ModelList[] => {
  const out: ModelList[] = [];
  for (const row of own)
    out.push({
      id: `own:${row.title}`,
      title: row.title,
      verses: [...row.verses],
      range: undefined,
      source: { tag: 'Own' },
    });
  if (held.tag === 'Read')
    held.passages.forEach((span, index) => {
      const verses: string[] = [];
      for (let verse = span.first; verse <= span.last; verse++)
        verses.push(verseRef(span.book, span.chapter, verse));
      out.push({
        id: `passage:${index}:${span.book}.${span.chapter}.${span.first}-${span.last}`,
        title: spanRef(span),
        verses,
        range: span,
        source: { tag: 'Passage', span },
      });
    });
  for (const id of taught) {
    const collection = COLLECTIONS.find((each) => each.id === id);
    if (collection === undefined) continue;
    const verses: string[] = [];
    for (const range of collection.promises)
      for (let verse = range.first; verse <= range.last; verse++) {
        const reference = verseRef(range.book, range.chapter, verse);
        if (!verses.includes(reference)) verses.push(reference);
      }
    out.push({
      id: `collection:${id}`,
      title: collection.title,
      verses,
      range: undefined,
      source: { tag: 'Collection', id },
    });
  }
  return out;
};

const IDS = COLLECTIONS.map((collection) => collection.id);

/** Taught ids from `next`: none, one, several in any order, or with an id no collection has, and which of these it is. */
export const taughtOf = (next: () => number): readonly [string, string[]] => {
  const roll = below(next, 8);
  if (roll === 0) return ['none', []];
  if (roll <= 2) return ['one', [pickOf(next, IDS as [string, ...string[]])]];
  const several = [...IDS].sort(() => next() - 0.5).slice(0, 2 + below(next, 4));
  if (roll <= 5) return ['several', several];
  return ['unknown', [...several.slice(0, 1), 'no-such-collection', ...several.slice(1)]];
};

/** Held passages from `next`: unread, or 0 to 5 ranges, each a repeat of one held before or a fresh one from `choosable`. */
export const heldOf = (
  next: () => number,
  choosable: (next: () => number, held: readonly Span[]) => Span,
): Held => {
  if (below(next, 8) === 0) return { tag: 'Unread' };
  const passages: Span[] = [];
  for (let n = below(next, 6); n > 0; n--) {
    const kept = passages[below(next, Math.max(1, passages.length))];
    if (kept !== undefined && below(next, 3) === 0) passages.push({ ...kept });
    else passages.push(choosable(next, passages));
  }
  return { tag: 'Read', passages };
};

/**
 * The recalls of a garden over `lists`, from `next`: about a third of the
 * lists' verses planted, phrase plants of some of them and of verses no
 * list names, and any count of other references of any text
 * (`othersOf`, near `near`), each with a history from `historyOf`.
 */
export const recordsOf = (
  next: () => number,
  lists: readonly ModelList[],
  near: string,
): Recall[] => {
  const listed = [...new Set(lists.flatMap((list) => list.verses))];
  const references = new Set<string>();
  for (const verse of listed) if (below(next, 3) === 0) references.add(verse);
  const others = othersOf(next, near, countOf(next, 3));
  const phrased = [...listed, ...others, near];
  if (below(next, 3) > 0)
    for (let n = 1 + below(next, 3); n > 0; n--) {
      const verse = phrased[below(next, phrased.length)] ?? near;
      const first = 1 + below(next, 9);
      references.add(`${verse} [${first}-${first + 3 + below(next, 6)}]`);
    }
  for (const other of others) if (below(next, 2) === 0) references.add(other);
  const day = 20_500 + below(next, 400);
  return [...references].flatMap((reference) => historyOf(next, reference, day + below(next, 30)));
};

/** A furrow's kind as the model holds it. */
export type ModelKind = 'own' | 'held' | 'taught' | 'other';

/** H1: the kind of a list by its source. */
export const kindRule = (source: ModelSource): ModelKind => {
  if (source.tag === 'Own') return 'own';
  if (source.tag === 'Passage') return 'held';
  if (source.tag === 'Collection') return 'taught';
  return 'other';
};

/** H1: the icon of a list by its kind, a held passage's by its book (19 the Psalms, 20 the Proverbs). */
export const iconRule = (source: ModelSource): string => {
  const kind = kindRule(source);
  if (kind === 'own' || kind === 'taught') return 'bow';
  if (kind === 'other' || source.tag !== 'Passage') return 'scroll';
  if (source.span.book === 19) return 'harp';
  if (source.span.book === 20) return 'lamp';
  return 'scroll';
};

/** A furrow as the model holds it. */
export interface ModelFurrow {
  readonly id: string;
  readonly title: string;
  readonly range: Span | undefined;
  readonly source: ModelSource;
  readonly kind: ModelKind;
  readonly icon: string;
  readonly ripe: string;
  readonly plants: readonly {
    readonly reference: string;
    readonly stage: ModelPlantStage;
    readonly ready: boolean;
    readonly label: string;
  }[];
}

/** H1: the furrows over `records` (one per recital) and `lists`, a plant ready when its verse is in `ready`. */
export const furrowsModel = (
  records: readonly Recall[],
  lists: readonly ModelList[],
  ready: ReadonlySet<string>,
): ModelFurrow[] =>
  fieldFoldRule(records, lists).rows.map((row, index) => {
    const list: ModelList = lists[index] ?? {
      id: `verse:${row.title}`,
      title: row.title,
      verses: [row.title],
      range: undefined,
      source: { tag: 'Loose' },
    };
    let full = 0;
    const plants = row.plants.map((plant) => {
      if (plant.stage === 'full corn') full += 1;
      const marked = ready.has(plant.reference);
      return {
        reference: plant.reference,
        stage: plant.stage,
        ready: marked,
        label: `${plant.reference}, ${plant.stage}${marked ? ', ready today' : ''}`,
      };
    });
    return {
      id: list.id,
      title: list.title,
      range: list.range,
      source: list.source,
      kind: kindRule(list.source),
      icon: iconRule(list.source),
      ripe: `${full} of ${plants.length} ripe`,
      plants,
    };
  });

/** An item of a plan as H2 reads it. */
export interface ModelReadyItem {
  readonly reference: string;
  readonly recalls: number;
}

/** H2: the verses of `items` not done over `records`: an item is done once its reference holds more recalls than its baseline; no plan, no verse. */
export const readyModel = (
  items: readonly ModelReadyItem[] | undefined,
  records: readonly Recall[],
): Set<string> => {
  const ready = new Set<string>();
  if (items === undefined) return ready;
  for (const item of items) {
    let now = 0;
    for (const recall of records) if (recall.reference === item.reference) now += 1;
    if (now <= item.recalls) ready.add(verseOfRule(item.reference));
  }
  return ready;
};

/** H5: the greeting at a local `hour` (0-23), as `<words> <icon>`; each part of the day starts on the hour. */
export const greetingRule = (hour: number) => {
  if (hour >= 4 && hour < 12) return 'Good morning sun';
  if (hour >= 12 && hour < 18) return 'Good afternoon sun';
  return 'Good evening moon';
};

const clocks = new Map<string, Intl.DateTimeFormat>();

/** The wall clock's hour and minute at `at` in `zone`, by `Intl`. */
export const clockIn = (zone: string, at: number) => {
  const format =
    clocks.get(zone) ??
    new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      hourCycle: 'h23',
      hour: 'numeric',
      minute: 'numeric',
    });
  clocks.set(zone, format);
  let hour = 0;
  let minute = 0;
  for (const part of format.formatToParts(at)) {
    if (part.type === 'hour') hour = Number(part.value);
    if (part.type === 'minute') minute = Number(part.value);
  }
  return { hour, minute };
};

/** H5: the greeting at `at` in `zone`, by its wall clock there. */
export const greetingModel = (zone: string, at: number) => greetingRule(clockIn(zone, at).hour);

/** H5: the local minute of the day at `at`, `offset` minutes east of UTC, by the calendar's own hour and minute fields. */
export const minuteModel = (at: number, offset: number) => {
  const wall = new Date(at + offset * 60_000);
  return wall.getUTCHours() * 60 + wall.getUTCMinutes();
};
