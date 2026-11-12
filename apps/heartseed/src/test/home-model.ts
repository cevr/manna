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
 *   carrying its range; none while unread), then each Handbook list held
 *   in stored order (`Handbook`, id its own, titled and holding its verses
 *   by `handbook-model.ts`; none while unread), then each taught collection
 *   whose id the list has (`Collection`, id `collection:<id>`, its
 *   promises' verses in order, each once).
 * - H1 the furrows: one per row of the field, the lists' first, then each
 *   other verse as a `Loose` list (`verse:<reference>`); each its kind and
 *   icon by its source (a passage's icon by its book), its caption
 *   (`captionModel`), and each plant's stage, ready mark and label.
 * - H2 ready: the verse of each item whose
 *   plant holds no more recalls than the item's baseline.
 * - H5 the greeting by the local hour and minute: morning 04:00-11:59,
 *   afternoon 12:00-17:59, evening else.
 * - H9 what grew: in plan order, the verse
 *   of each done item whose stage over all its recalls ranks above its
 *   stage over its first `recalls` recalls (none ranking below a seed),
 *   each verse once, with the verse's stage on the field now.
 * - H8 the shelves: any passage through the chooser, the picks of the
 *   Psalms, the Proverbs and John, then each collection the list holds
 *   that the session does not teach, every pick and promise a passage list
 *   (`pick:<shelf>:<book>.<chapter>.<first>-<last>`); and what a row offers:
 *   `unread`, `in field` when every verse of the range is on the field,
 *   `full` at 3 held, else `plant`.
 *
 * It also holds the generators the home's tests share: plans `planModel`
 * makes over pieces of made-up text with histories.
 */

import type { Recall } from '../sayit';
import { COLLECTIONS, TAUGHT } from '../promises';
import {
  countOf,
  historyOf,
  othersOf,
  recallOf,
  type ModelPassage,
  type ModelPlantStage,
} from './field-model';
import { below, inOrder, pickOf, referenceStage, type ModelStage } from './garden-model';
import { HANDBOOK_MODEL, HANDBOOK_NOTE, HANDBOOK_SECTIONS, heldLists } from './handbook-model';
import {
  spanRef,
  verseRef,
  verseCountIn,
  type Corpus,
  type Held,
  type ModelTextPiece,
  type Span,
} from './passages-model';
import { fieldFoldRule, oldPiecesRule, verseOfRule } from './phrase-model';
import { DAY, planModel } from './session-model';

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
      const count = verseCountIn(corpus, book, chapter);
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
  | { readonly tag: 'Handbook'; readonly id: string }
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
  if (held.tag === 'Read')
    for (const id of heldLists(held.lists ?? [])) {
      const list = HANDBOOK_MODEL.get(id);
      if (list === undefined) continue;
      out.push({
        id,
        title: list.title,
        verses: [...list.verses],
        range: undefined,
        source: { tag: 'Handbook', id },
      });
    }
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
  if (source.tag === 'Passage' || source.tag === 'Handbook') return 'held';
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
  readonly caption: string;
  readonly plants: readonly {
    readonly reference: string;
    readonly stage: ModelPlantStage;
    readonly ready: boolean;
    readonly label: string;
  }[];
}

/** hsstart T3: a furrow's caption over its plants, written out: `<n> verse(s) · <r> ready today` for r > 0 ready, else `<n> verse(s) · <p> planted` for p > 0 planted, else `<n> verse(s) to learn`. */
export const captionModel = (plants: readonly { stage: string; ready: boolean }[]) => {
  const n = plants.length === 1 ? '1 verse' : `${plants.length} verses`;
  let ready = 0;
  let planted = 0;
  for (const plant of plants) {
    if (plant.ready) ready += 1;
    if (plant.stage !== 'not planted') planted += 1;
  }
  if (ready > 0) return `${n} · ${ready} ready today`;
  if (planted > 0) return `${n} · ${planted} planted`;
  return `${n} to learn`;
};

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
    const plants = row.plants.map((plant) => {
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
      caption: captionModel(plants),
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

/** A made-up verse text of `count` words, a comma, a stop or nothing after each. */
const textOf = (next: () => number, count: number) =>
  Array.from(
    { length: count },
    (_, n) => `w${n + 1}${pickOf(next, ['', '', '', ',', '.'] as const)}`,
  ).join(' ');

/** A verse of made-up text, whole, two in three long enough that main kept it in pieces. */
const pieceOf = (next: () => number, k: number): ModelTextPiece => {
  const words = below(next, 3) > 0 ? 13 + below(next, 30) : 1 + below(next, 12);
  return {
    reference: `Psalms ${k}:${1 + below(next, 9)}`,
    text: textOf(next, words),
    words,
    group: pickOf(next, ['a', 'b', 'c'] as const),
  };
};

/** A garden's records being sown before `at`, each start its own. */
const sowerOf = (at: number) => {
  const records: Recall[] = [];
  let tick = 0;
  const sow = (reference: string, when: number, grade: Recall['grade']) => {
    tick += 1;
    records.push(recallOf(reference, Math.min(when, at - 1) - tick, grade, 0));
  };
  return { records, sow };
};

/** Sows `piece`'s history before `at`: none, some of the old pieces main kept of it, every old piece ripe, those and the verse whole, or the verse whole (a short verse is whole or none). */
const sowPiece = (
  next: () => number,
  sow: ReturnType<typeof sowerOf>['sow'],
  at: number,
  piece: ModelTextPiece,
) => {
  const old = oldPiecesRule(piece.reference, piece.words);
  const history = pickOf(next, ['none', 'pieces', 'ripe', 'joined', 'whole'] as const);
  if (history === 'none') return;
  if (history === 'pieces' && old.length > 0)
    for (const each of old.slice(0, 1 + below(next, old.length)))
      sow(each, at - (1 + below(next, 20)) * DAY, pickOf(next, [1, 3, 3] as const));
  if ((history === 'ripe' || history === 'joined') && old.length > 0)
    for (const each of old) for (const back of [30, 26, 21]) sow(each, at - back * DAY, 3);
  if (history === 'whole' || history === 'joined' || old.length === 0)
    for (let n = 1 + below(next, 3); n > 0; n--)
      sow(piece.reference, at - n * 3 * DAY, pickOf(next, [1, 3, 3, 4] as const));
};

/** An item of a plan as the home's rules read it. */
export interface ModelPlanItem {
  readonly reference: string;
  readonly fresh: boolean;
  readonly recalls: number;
  readonly seconds: number;
}

/**
 * A plan case before any recital: one to four verses of made-up text,
 * whole, each with a history (none, some old pieces main kept of it, every
 * old piece ripe, those and the verse, the verse alone) sown before `at`,
 * and the plan `planModel` makes over them at `at` (reviews and the new
 * piece, never an old piece).
 */
export const plannedOf = (next: () => number) => {
  const at = Date.UTC(2026, below(next, 12), 1 + below(next, 28), below(next, 24));
  const { records, sow } = sowerOf(at);
  const pieces: ModelTextPiece[] = [];
  for (let k = 1 + below(next, 4); k > 0; k--) {
    const piece = pieceOf(next, k);
    pieces.push(piece);
    sowPiece(next, sow, at, piece);
  }
  const plants = new Map<string, Recall[]>();
  for (const recall of records)
    plants.set(recall.reference, [...(plants.get(recall.reference) ?? []), recall]);
  const plan = planModel({
    plants,
    pieces,
    at,
    offset: 0,
    minutes: pickOf(next, [2, 5, 10, 20] as const),
  });
  const items: ModelPlanItem[] = plan.items.map(({ reference, fresh, recalls, seconds }) => ({
    reference,
    fresh,
    recalls,
    seconds,
  }));
  return { at, records, items, pieces };
};

const RANK: Readonly<Record<ModelStage, number>> = { seed: 0, blade: 1, ear: 2, 'full corn': 3 };

/** H9: what grew over `records` (one per recital) for a plan of `items`. */
export const grownModel = (
  items: readonly ModelPlanItem[],
  records: readonly Recall[],
): { reference: string; stage: ModelStage }[] => {
  const out: { reference: string; stage: ModelStage }[] = [];
  for (const item of items) {
    const recalls = inOrder(records.filter((recall) => recall.reference === item.reference));
    if (recalls.length <= item.recalls) continue;
    const before = recalls.slice(0, item.recalls);
    const was = before.length === 0 ? -1 : RANK[referenceStage(before)];
    if (RANK[referenceStage(recalls)] <= was) continue;
    const verse = verseOfRule(item.reference);
    if (out.some((grown) => grown.reference === verse)) continue;
    const own = records.filter((recall) => recall.reference === verse);
    out.push({ reference: verse, stage: own.length === 0 ? 'seed' : referenceStage(own) });
  }
  return out;
};

/**
 * hsstart T1: the Today card's lines as a reader reads them, `<headline> |
 * <parts>`, over the plan's `items` (null before a plan: no lines, the
 * empty text), each reference's recall count now and the item the run
 * shows (null in the done state). The counted items are the plan's not
 * done, else the item shown; with some, the headline is `<n> verse(s) ·
 * about <k> min` (n distinct verses, k the ceiling of their seconds over
 * 60) and the parts `<r> to review` (distinct verses of items not new) and
 * `1 new`, a zero part left out; with none, `All tended for today |
 * Nothing is due right now.`
 */
export const cardLineModel = (
  items: readonly ModelPlanItem[] | null,
  recallsNow: (reference: string) => number,
  shown: ModelPlanItem | null = null,
): string => {
  if (items === null) return '';
  const open = items.filter((item) => recallsNow(item.reference) <= item.recalls);
  const counted = open.length > 0 ? open : shown === null ? [] : [shown];
  if (counted.length === 0) return 'All tended for today | Nothing is due right now.';
  const verses = new Set(counted.map((item) => verseOfRule(item.reference)));
  const reviews = new Set(
    counted.filter((item) => !item.fresh).map((item) => verseOfRule(item.reference)),
  );
  let seconds = 0;
  for (const item of counted) seconds += item.seconds;
  const parts: string[] = [];
  if (reviews.size > 0) parts.push(`${reviews.size} to review`);
  if (counted.some((item) => item.fresh)) parts.push('1 new');
  const n = verses.size === 1 ? '1 verse' : `${verses.size} verses`;
  return `${n} · about ${Math.ceil(seconds / 60)} min | ${parts.join(' · ')}`;
};

/** hsstart T1: the planted reference `Practice anyway` offers among `plants` (each reference's recalls) for which `starts` holds: the lowest stage (seed, blade, ear, full corn), then the earlier last recall, then the reference; null when none starts. */
export const weakestModel = (
  plants: ReadonlyMap<string, readonly Recall[]>,
  starts: (reference: string) => boolean,
): string | null => {
  const ranks: readonly ModelStage[] = ['seed', 'blade', 'ear', 'full corn'];
  let best: { reference: string; rank: number; last: number } | null = null;
  for (const [reference, recalls] of plants) {
    if (recalls.length === 0 || !starts(reference)) continue;
    const rank = ranks.indexOf(referenceStage(recalls));
    const last = Math.max(...recalls.map((recall) => recall.startedAt));
    const weaker =
      best === null ||
      rank < best.rank ||
      (rank === best.rank && last < best.last) ||
      (rank === best.rank && last === best.last && reference < best.reference);
    if (weaker) best = { reference, rank, last };
  }
  return best?.reference ?? null;
};

/** A shelf as the model holds it: its lists, or `chooser` for the whole Bible. */
export interface ModelShelf {
  readonly id: string;
  readonly title: string;
  readonly icon: string;
  readonly note: string;
  readonly lists: readonly ModelList[] | 'chooser';
}

/** H8: a pick or a promise on shelf `shelf` as a passage list. */
const pickList = (shelf: string, span: Span): ModelList => {
  const verses: string[] = [];
  for (let verse = span.first; verse <= span.last; verse++)
    verses.push(verseRef(span.book, span.chapter, verse));
  return {
    id: `pick:${shelf}:${span.book}.${span.chapter}.${span.first}-${span.last}`,
    title: spanRef(span),
    verses,
    range: span,
    source: { tag: 'Passage', span },
  };
};

/** H8: the picks the spec names, each `[book, chapter, first, last]`. */
const PICKS: readonly (readonly [string, string, string, string, readonly number[][]])[] = [
  [
    'psalms',
    'Psalms',
    'harp',
    'Songs to carry through the day',
    [
      [19, 1, 1, 3],
      [19, 46, 1, 3],
      [19, 91, 1, 4],
      [19, 103, 1, 5],
      [19, 121, 1, 8],
      [19, 139, 1, 6],
    ],
  ],
  [
    'proverbs',
    'Proverbs',
    'lamp',
    'A lamp for the path',
    [
      [20, 4, 23, 23],
      [20, 15, 1, 1],
      [20, 16, 3, 3],
      [20, 18, 10, 10],
      [20, 22, 6, 6],
    ],
  ],
  [
    'john',
    'The Gospel of John',
    'scroll',
    'The words of Christ',
    [
      [43, 1, 1, 5],
      [43, 3, 16, 17],
      [43, 14, 1, 3],
      [43, 14, 27, 27],
      [43, 15, 1, 3],
    ],
  ],
];

/** H8: the shelves, in order. */
export const shelvesModel = (): ModelShelf[] => {
  const out: ModelShelf[] = [
    {
      id: 'any',
      title: 'Any passage',
      icon: 'add',
      note: 'Every book, chapter and verse',
      lists: 'chooser',
    },
  ];
  for (const [id, title, icon, note, picks] of PICKS)
    out.push({
      id,
      title,
      icon,
      note,
      lists: picks.map(([book = 0, chapter = 0, first = 0, last = 0]) =>
        pickList(id, { book, chapter, first, last }),
      ),
    });
  for (const collection of COLLECTIONS) {
    if (TAUGHT.includes(collection.id)) continue;
    out.push({
      id: collection.id,
      title: collection.title,
      icon: 'bow',
      note: `${collection.promises.length} promises`,
      lists: collection.promises.map((range) => pickList(collection.id, range)),
    });
  }
  for (const section of HANDBOOK_SECTIONS)
    out.push({
      id: `handbook:${section.id}`,
      title: section.title,
      icon: 'scroll',
      note: HANDBOOK_NOTE,
      lists: section.ids.flatMap((id) => {
        const list = HANDBOOK_MODEL.get(id);
        if (list === undefined) return [];
        return [
          {
            id,
            title: list.title,
            verses: [...list.verses],
            range: undefined,
            source: { tag: 'Handbook', id },
          },
        ];
      }),
    });
  return out;
};

/** How many shelves come before the Handbook's: the 17 of hsshelves. */
export const BASE_SHELVES = 17;

/** H8, R9: what a shelf's row offers for the list of `verses`, over the passages and lists `held` and a field whose rows hold the references `rows`. */
export const offerModel = (
  verses: readonly string[],
  held: Held,
  rows: readonly (readonly string[])[],
): 'unread' | 'in field' | 'full' | 'plant' => {
  if (held.tag === 'Unread') return 'unread';
  let every = true;
  for (const reference of verses) if (!rows.some((row) => row.includes(reference))) every = false;
  if (every) return 'in field';
  if (held.passages.length + (held.lists ?? []).length >= 3) return 'full';
  return 'plant';
};
