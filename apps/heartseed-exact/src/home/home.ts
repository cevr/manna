/**
 * Home's answer for one call: the greeting by the reader's local hour, the
 * Today card, a row per list and the single verses under them, and the
 * foot. Every rule is the current Heartseed's (`@manna/heartseed/home`,
 * `home/today`, `home/start`): this module only reads them over the garden
 * the call read, the session's view (`./session.ts`) and the call's time,
 * and writes what the Contract draws. No icon and no stage's drawing name
 * is answered (owner, hsrows): a plant is its spoken name, whether the plan
 * holds it open, and whether it is sown.
 */

import { readyOf, furrowsOf, greetingOf, minuteOf, singlesOf } from '@manna/heartseed/home';
import { startOf } from '@manna/heartseed/home/start';
import { todayOf, type TodayAction } from '@manna/heartseed/home/today';
import type { FurrowPlant } from '@manna/heartseed/home';
import { listsOf, singleVersesOf } from '@manna/heartseed/lists';
import { verseReference } from '@manna/heartseed/passages';
import type { SessionView } from '@manna/heartseed/session/service';
import type { ReadGarden } from '@manna/heartseed/garden';
import type { List } from '@manna/heartseed/lists';
import { Match, Option } from 'effect';

import type { Held } from '../garden/program';
import { shownOf, slugOf, type At } from '../garden/view';
import type { SessionWire } from '../today/sources';
import { sessionOf } from './session';

/** A plant as home draws it: `id` names its node (`plant-<slug>`, a later copy of a verse another row holds keyed by its row too). */
export interface HomePlant {
  reference: string;
  slug: string;
  id: string;
  label: string;
  ready: boolean;
  sown: boolean;
}

/** One row: a list's title, its caption and its plants in order. */
export interface HomeRow {
  id: string;
  slug: string;
  title: string;
  caption: string;
  plants: HomePlant[];
}

/** A single verse: its plant, the id its Remove takes out (empty when the reader did not plant it alone) and the ask Remove puts under its row. */
export interface HomeSingle {
  reference: string;
  slug: string;
  label: string;
  ready: boolean;
  sown: boolean;
  removeId: string;
  ask: string;
}

/** The ask a single verse's Remove puts under its row, as the current home writes it (`page.test.ts` holds it to that file). */
export const singleAskOf = (reference: string) =>
  `Remove ${reference}? Its plant stays in your field.`;

/** The Today card: its line and parts (empty before a plan), its action (`start`, `practice` or `none`), the action's words, and the verse `practice` starts. */
export interface HomeCard {
  line: string;
  parts: string;
  action: string;
  label: string;
  slug: string;
}

/** Home: whether the garden is read (nothing is claimed before), the greeting, the card, the rows, the single verses, and the foot. */
export interface HomeShown {
  read: boolean;
  greeting: string;
  card: HomeCard;
  rows: HomeRow[];
  singles: HomeSingle[];
  /** Whether the Single verses section is drawn: exactly when there is a single verse. */
  singlesShown: boolean;
  addsList: boolean;
  limitLine: string;
}

/** The card's action as the Contract draws it. */
const actionOf: (action: TodayAction) => Pick<HomeCard, 'action' | 'label' | 'slug'> =
  Match.type<TodayAction>().pipe(
    Match.tagsExhaustive({
      Start: () => ({ action: 'start', label: 'Start', slug: '' }),
      PracticeAnyway: ({ verse }) => ({
        action: 'practice',
        label: 'Practice anyway',
        slug: slugOf(verse),
      }),
      None: () => ({ action: 'none', label: '', slug: '' }),
    }),
  );

const NO_CARD: HomeCard = { line: '', parts: '', action: 'none', label: '', slug: '' };

/** What a call reads: the garden and the lists, the session's view, the instant and the zone. */
export interface HomeIn {
  readonly held: Held;
  readonly wire: SessionWire;
  readonly at: At;
}

/** The parts of a read the rules take: the garden read, the lists and the single verses held; none while either is unread. */
export interface Ground {
  readonly garden: ReadGarden;
  readonly lists: readonly List[];
  readonly singles: readonly string[];
  readonly held: Held;
  readonly view: SessionView;
}

/** The read's ground for the rules; none while the garden or the lists are unread. */
export const groundOf = (input: HomeIn): Option.Option<Ground> => {
  const { garden, passages } = input.held;
  if (garden._tag === 'Unread' || passages._tag === 'Unread') return Option.none();
  return Option.some({
    garden,
    lists: listsOf([], passages, []),
    singles: singleVersesOf([], passages),
    held: input.held,
    view: sessionOf(input.wire),
  });
};

const plantOf = (plant: FurrowPlant) => ({
  reference: plant.reference,
  slug: slugOf(plant.reference),
  label: plant.label,
  ready: plant.ready,
  sown: plant.stage !== 'not planted',
});

/** Each row's plants, a verse's node named by its slug the first time home shows it and by its row's slug and its own after. */
const rowsOf = (ground: Ground, ready: ReadonlySet<string>): HomeRow[] => {
  const seen = new Set<string>();
  return furrowsOf(ground.garden, ground.lists, ready).map((furrow) => {
    const slug = slugOf(furrow.id);
    return {
      id: furrow.id,
      slug,
      title: furrow.title,
      caption: furrow.caption,
      plants: furrow.plants.map((plant) => {
        const drawn = plantOf(plant);
        const again = seen.has(plant.reference);
        seen.add(plant.reference);
        if (again) return { ...drawn, id: `${slug}-${drawn.slug}` };
        return { ...drawn, id: drawn.slug };
      }),
    };
  });
};

const singlesShown = (ground: Ground, ready: ReadonlySet<string>): HomeSingle[] =>
  singlesOf(
    ground.garden,
    ground.lists,
    ground.singles,
    Option.getOrElse(ground.held.singles, () => []),
    ready,
  ).map((plant) => ({
    ...plantOf(plant),
    removeId: Option.match(plant.removal, {
      onNone: () => '',
      onSome: (range) => `single:${verseReference(range.book, range.chapter, range.first)}`,
    }),
    ask: singleAskOf(plant.reference),
  }));

/** The greeting at the call's instant in its zone. */
const greetingAt = (at: At) => greetingOf(minuteOf(at.now, at.offset)).words;

/** Home over what one call read. */
export const homeOf = (input: HomeIn): HomeShown =>
  Option.match(groundOf(input), {
    onNone: (): HomeShown => ({
      read: false,
      greeting: greetingAt(input.at),
      card: NO_CARD,
      rows: [],
      singles: [],
      singlesShown: false,
      addsList: false,
      limitLine: '',
    }),
    onSome: (ground): HomeShown => {
      const ready = readyOf(ground.view.plan, ground.garden);
      const card = todayOf(ground.view, ground.garden, false);
      const shown = shownOf(input.held, input.at);
      const singles = singlesShown(ground, ready);
      return {
        read: true,
        greeting: greetingAt(input.at),
        card: {
          line: Option.getOrElse(card.headline, () => ''),
          parts: Option.getOrElse(card.parts, () => ''),
          ...actionOf(card.action),
        },
        rows: rowsOf(ground, ready),
        singles,
        singlesShown: singles.length > 0,
        addsList: !shown.listsFull,
        limitLine: shown.limitLine,
      };
    },
  });

/** What a tap on the plant of `reference` starts, as the session's `/start/<slug>` starts it: the current app's `startOf` over the same read. */
export const homeStartOf = (input: HomeIn, reference: string) =>
  Option.flatMap(groundOf(input), (ground) => startOf(ground.view, ground.garden, reference));
