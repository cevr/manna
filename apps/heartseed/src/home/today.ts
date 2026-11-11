/**
 * The Today card at home's top, pure: the day's line over the plan made in
 * this launch and the garden now, and the one action it offers. `Start`
 * opens Today while the run shows an item, or, with the reader's passages
 * unread (so no plan is made), while it shows a verse (`beginsOf`). Else
 * `Practice anyway` on the weakest verse a tap could start (`weakestOf`),
 * else nothing. It reads the session's view and the garden read; nothing
 * is stored.
 */

import { Array as Arr, Option, Order } from 'effect';

import { STAGES, stageOf, type ReadGarden } from '../garden';
import { verseOf } from '../home';
import { isDone, type Item } from '../session';
import { shownOf, type Shown } from '../session/run';
import type { SessionView } from '../session/service';
import { startOf } from './start';

/** What the card's one button does: open Today, start a verse before its turn, or nothing. */
export type TodayAction =
  | { readonly _tag: 'Start' }
  | { readonly _tag: 'PracticeAnyway'; readonly verse: string }
  | { readonly _tag: 'None' };

/** The Today card: its headline and parts (none before a plan), and its action. */
export interface TodayCard {
  readonly headline: Option.Option<string>;
  readonly parts: Option.Option<string>;
  readonly action: TodayAction;
}

/** Whether home offers `Start`: while the run shows an item, or, with the passages unread, while it shows a verse. */
export const beginsOf = (shown: Shown, unread: boolean) =>
  shown._tag === 'Item' || (unread && shown._tag === 'Unplanned' && Option.isSome(shown.piece));

interface Candidate {
  readonly verse: string;
  readonly rank: number;
  readonly last: number;
}

const weakest = Order.combineAll<Candidate>([
  Order.mapInput(Order.Number, (each: Candidate) => each.rank),
  Order.mapInput(Order.Number, (each: Candidate) => each.last),
  Order.mapInput(Order.String, (each: Candidate) => each.verse),
]);

/** The weakest planted verse a tap could start: the lowest stage, then the earlier last recall, then the reference; none when no plant starts. */
export const weakestOf = (view: SessionView, garden: ReadGarden): Option.Option<string> =>
  Option.map(
    Arr.head(
      Arr.sort(
        [...garden.plants]
          .filter(([verse]) => Option.isSome(startOf(view, garden, verse)))
          .map(([verse, plant]): Candidate => ({
            verse,
            rank: STAGES.indexOf(stageOf(plant)),
            last: Arr.lastNonEmpty(plant.recalls).startedAt,
          })),
        weakest,
      ),
    ),
    (each) => each.verse,
  );

const versesText = (n: number) => {
  if (n === 1) return '1 verse';
  return `${n} verses`;
};

/** The items the card counts: the plan's not done, else the item the run shows, else none. */
const countedOf = (items: readonly Item[], garden: ReadGarden, shown: Shown): readonly Item[] => {
  const open = items.filter((item) => !isDone(garden, item));
  if (Arr.isReadonlyArrayNonEmpty(open)) return open;
  if (shown._tag === 'Item') return [shown.item];
  return [];
};

/** The headline and the parts over the counted items: their verses and minutes, then the reviews and the new piece. */
const linesOf = (counted: readonly Item[]) => {
  if (!Arr.isReadonlyArrayNonEmpty(counted))
    return { headline: 'All tended for today', parts: 'Nothing is due right now.' };
  const verses = new Set(counted.map((item) => verseOf(item.reference)));
  const reviews = new Set(
    counted.filter((item) => !item.fresh).map((item) => verseOf(item.reference)),
  );
  const seconds = counted.reduce((sum, item) => sum + item.seconds, 0);
  return {
    headline: `${versesText(verses.size)} · about ${Math.ceil(seconds / 60)} min`,
    parts: [
      ...Arr.filter([`${reviews.size} to review`], () => reviews.size > 0),
      ...Arr.filter(['1 new'], () => counted.some((item) => item.fresh)),
    ].join(' · '),
  };
};

/** The action over the run shown: `Start` when it begins, else `Practice anyway` on the weakest verse, else none. */
const actionOf = (
  view: SessionView,
  garden: ReadGarden,
  shown: Shown,
  unread: boolean,
): TodayAction => {
  if (beginsOf(shown, unread)) return { _tag: 'Start' };
  return Option.match(weakestOf(view, garden), {
    onNone: (): TodayAction => ({ _tag: 'None' }),
    onSome: (verse): TodayAction => ({ _tag: 'PracticeAnyway', verse }),
  });
};

/** The Today card over the session's view, the garden read and whether the reader's passages are unread. */
export const todayOf = (view: SessionView, garden: ReadGarden, unread: boolean): TodayCard => {
  const shown = shownOf(view, Option.some(garden));
  const action = actionOf(view, garden, shown, unread);
  return Option.match(view.plan, {
    onNone: (): TodayCard => ({ headline: Option.none(), parts: Option.none(), action }),
    onSome: (plan): TodayCard => {
      const lines = linesOf(countedOf(plan.items, garden, shown));
      return { headline: Option.some(lines.headline), parts: Option.some(lines.parts), action };
    },
  });
};
