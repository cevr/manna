/**
 * What a list's own page offers (hslist L1), pure: `Practice this list`
 * starts the plan's open items on the list's verses, in plan order and
 * exactly as planned, so a verse said
 * through it is done in the plan too; with none open, the list's weakest
 * planted verse by the order Today card uses (`weakestAmong`); with none
 * planted that starts, its first verse to learn in the list's order; else
 * nothing. Each single start is what `startOf` starts on that verse. It
 * reads the session's view and the garden read; nothing is stored.
 */

import { Array as Arr, Match, Option } from 'effect';

import type { ReadGarden } from './garden';
import { verseOf, type FurrowPlant } from './home';
import { startOf } from './home/start';
import { weakestAmong } from './home/today';
import { isDone, pieceAt } from './session';
import type { SessionView, VisitVerse } from './session/service';

/** What `Practice this list` starts: the plan's open items on the list, its weakest planted verse, its first verse to learn, or nothing. */
export type ListStart =
  | { readonly _tag: 'Open'; readonly visit: Arr.NonEmptyReadonlyArray<VisitVerse> }
  | { readonly _tag: 'Weakest'; readonly verse: string; readonly visit: readonly [VisitVerse] }
  | { readonly _tag: 'Learn'; readonly verse: string; readonly visit: readonly [VisitVerse] }
  | { readonly _tag: 'None' };

const NONE: ListStart = { _tag: 'None' };

/** The plan's items not done on `verses`, in plan order, each with its piece; an item with no piece is left out. */
const openOn = (
  view: SessionView,
  garden: ReadGarden,
  verses: ReadonlySet<string>,
): readonly VisitVerse[] =>
  Option.match(view.plan, {
    onNone: () => [],
    onSome: (plan) =>
      plan.items
        .filter((item) => !isDone(garden, item) && verses.has(verseOf(item.reference)))
        .flatMap((item) =>
          Option.toArray(
            Option.map(pieceAt(view.pieces, item.reference), (piece) => ({ item, piece })),
          ),
        ),
  });

/** What `Practice this list` starts on `verses`, over the session's view and the garden read. */
export const listStartOf = (
  view: SessionView,
  garden: ReadGarden,
  verses: readonly string[],
): ListStart => {
  if (Option.isNone(view.plan)) return NONE;
  const open = openOn(view, garden, new Set(verses));
  if (Arr.isReadonlyArrayNonEmpty(open)) return { _tag: 'Open', visit: open };
  const started = (verse: string) => startOf(view, garden, verse);
  const weakest = Option.flatMap(weakestAmong(view, garden, verses), (verse) =>
    Option.map(started(verse), (start): ListStart => ({ _tag: 'Weakest', verse, visit: [start] })),
  );
  if (Option.isSome(weakest)) return weakest.value;
  const learn = Arr.findFirst(verses, (verse) =>
    Option.map(
      Option.filter(started(verse), () => !garden.plants.has(verse)),
      (start): ListStart => ({ _tag: 'Learn', verse, visit: [start] }),
    ),
  );
  return Option.getOrElse(learn, () => NONE);
};

/** `<n> verse` or `<n> verses`. */
const versesText = (n: number) => {
  if (n === 1) return '1 verse';
  return `${n} verses`;
};

/** The line under `Practice this list`: what it starts, in words; none when it starts nothing. */
export const listLineOf: (start: ListStart) => Option.Option<string> = Match.type<ListStart>().pipe(
  Match.tagsExhaustive({
    Open: ({ visit }) => {
      const verses = new Set(visit.map((each) => verseOf(each.item.reference)));
      const seconds = visit.reduce((sum, each) => sum + each.item.seconds, 0);
      return Option.some(`${verses.size} ready today · about ${Math.ceil(seconds / 60)} min`);
    },
    Weakest: ({ verse }) => Option.some(`Starts with ${verse}, nothing is due`),
    Learn: ({ verse }) => Option.some(`Starts with ${verse}, new today`),
    None: () => Option.none<string>(),
  }),
);

/** The list view's caption over its plants: `<n> verse(s) · none planted yet`, else `<n> verse(s) · <p> planted`, then ` · <k> at full corn` when any are. */
export const listCaptionOf = (plants: readonly Pick<FurrowPlant, 'stage'>[]) => {
  const verses = versesText(plants.length);
  const planted = plants.filter((plant) => plant.stage !== 'not planted').length;
  if (planted === 0) return `${verses} · none planted yet`;
  const corn = plants.filter((plant) => plant.stage === 'full corn').length;
  if (corn === 0) return `${verses} · ${planted} planted`;
  return `${verses} · ${planted} planted · ${corn} at full corn`;
};
