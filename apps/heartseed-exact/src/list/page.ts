/**
 * A list's page (`/lists/:id`, opened by its row's title on home): its
 * title, its caption (`listCaptionOf`), `Practice this list` and the line
 * under it (`listStartOf`, `listLineOf`), each verse with its stage in
 * words, when it is due, and a Move back on a plant past a seed, and
 * `Remove this list` for a list the reader holds. The rules are the
 * current Heartseed's; the words the current list page writes in its
 * React file (`STAGE_WORDS`, the asks) are written here, and
 * `page.test.ts` holds each to that file's text.
 *
 * Remove names the list's own range (or a Handbook list's id), never its
 * place among the lists: the id the page answers is the one `listsOf` gives
 * now, which the garden's remove finds again and removes by its range.
 */

import { backOf, stageOf, type Stage } from '@manna/heartseed/garden';
import { furrowsOf, readyOf, type Furrow } from '@manna/heartseed/home';
import { listCaptionOf, listLineOf, listStartOf, type ListStart } from '@manna/heartseed/list';
import { passageReference } from '@manna/heartseed/passages';
import { Match, Option } from 'effect';

import { startOf } from '@manna/heartseed/home/start';

import { plantIn, slugOf, verseIn, type At, type GardenVerse } from '../garden/view';
import { groundOf, type Ground, type HomeIn } from '../home/home';

/** Each stage as the current list page says it. */
export const STAGE_WORDS: Readonly<Record<Stage | 'not planted', string>> = {
  seed: 'A seed',
  blade: 'A blade',
  ear: 'An ear',
  'full corn': 'Full corn',
  'not planted': 'Not planted yet',
};

/** The icon each stage is drawn with on a list's page, as the current list page draws it (its `DRAWN`): full corn as `corn`. */
export const DRAWN: Readonly<Record<Stage, string>> = {
  seed: 'seed',
  blade: 'blade',
  ear: 'ear',
  'full corn': 'corn',
};

/** A row's stage in words, then ` · ready today` when the plan holds its verse open, as the current list page writes it. */
export const stageLineOf = (stage: string, ready: boolean) => {
  if (ready) return `${stage} · ready today`;
  return stage;
};

/** One verse of the page: its spoken name, its stage and due in words, its stage's icon (empty before it is planted), whether a tap starts it, and the stage Move back takes it to (empty when it cannot move back). */
export interface ListVerse {
  reference: string;
  slug: string;
  label: string;
  ready: boolean;
  sown: boolean;
  stage: string;
  stageLine: string;
  drawn: string;
  starts: boolean;
  due: string;
  backTo: string;
  backAsk: string;
}

/** The page: whether the garden is read and the list found, the list, `Practice this list` (`start` is `open`, `weakest`, `learn` or `none`), and `Remove this list`. */
export interface ListShown {
  read: boolean;
  found: boolean;
  id: string;
  slug: string;
  title: string;
  /** The list's icon beside its title, as the current list page draws it (the current app's `iconOf`). */
  icon: string;
  caption: string;
  verses: ListVerse[];
  start: string;
  startLine: string;
  startSlug: string;
  removeId: string;
  removeName: string;
  removeAsk: string;
}

const NONE: ListShown = {
  read: false,
  found: false,
  id: '',
  slug: '',
  title: '',
  icon: '',
  caption: '',
  verses: [],
  start: 'none',
  startLine: '',
  startSlug: '',
  removeId: '',
  removeName: '',
  removeAsk: '',
};

/** When a verse is due, as Your verses says it. */
export const dueText = (verse: GardenVerse) => {
  if (verse.dueNow) return 'Due now';
  if (verse.dueIn <= 0) return 'Due later today';
  if (verse.dueIn === 1) return 'Due tomorrow';
  return `Due in ${verse.dueIn} days`;
};

/** What `Practice this list` starts, as the page draws it: its kind and the verse a tap opens first. */
const startShown: (start: ListStart) => { start: string; startSlug: string } =
  Match.type<ListStart>().pipe(
    Match.tagsExhaustive({
      Open: ({ visit }) => ({ start: 'open', startSlug: slugOf(visit[0].item.reference) }),
      Weakest: ({ verse }) => ({ start: 'weakest', startSlug: slugOf(verse) }),
      Learn: ({ verse }) => ({ start: 'learn', startSlug: slugOf(verse) }),
      None: () => ({ start: 'none', startSlug: '' }),
    }),
  );

/** The name `Remove this list` says: a passage's reference, a Handbook list's title; none for any other list. */
export const removalName = (furrow: Furrow): Option.Option<string> =>
  Match.value(furrow.source).pipe(
    Match.tagsExhaustive({
      Own: () => Option.none<string>(),
      Passage: ({ range }) => Option.some(passageReference(range)),
      Collection: () => Option.none<string>(),
      Handbook: () => Option.some(furrow.title),
    }),
  );

/** The ask `Remove this list` puts in its place. */
export const removeAskOf = (name: string) => `Remove ${name}? Its plants stay in your field.`;

/** The ask a verse's Move back puts under its row. */
export const backAskOf = (reference: string, to: Stage) =>
  `Move ${reference} back to ${STAGE_WORDS[to].toLowerCase()}?`;

const verseOf = (
  ground: Ground,
  reference: string,
  at: At,
  ready: ReadonlySet<string>,
  label: string,
): ListVerse => {
  const { garden } = ground.held;
  const shown = verseIn(garden, reference, at);
  const stage = Option.map(plantIn(garden, reference), stageOf);
  const to = Option.flatMap(stage, backOf);
  const words = STAGE_WORDS[Option.getOrElse(stage, (): Stage | 'not planted' => 'not planted')];
  return {
    reference,
    slug: shown.slug,
    label,
    ready: ready.has(reference),
    sown: Option.isSome(stage),
    stage: words,
    stageLine: stageLineOf(words, ready.has(reference)),
    drawn: Option.match(stage, { onNone: () => '', onSome: (each) => DRAWN[each] }),
    starts: Option.isSome(startOf(ground.view, ground.garden, reference)),
    due: dueText(shown),
    backTo: Option.match(to, { onNone: () => '', onSome: (each) => STAGE_WORDS[each] }),
    backAsk: Option.match(to, { onNone: () => '', onSome: (each) => backAskOf(reference, each) }),
  };
};

/** The page of the list whose id's slug is `slug`, over what one call read. */
export const listPageOf = (input: HomeIn, slug: string): ListShown =>
  Option.match(groundOf(input), {
    onNone: () => NONE,
    onSome: (ground) => {
      const ready = readyOf(ground.view.plan, ground.garden);
      const furrows = furrowsOf(ground.garden, ground.lists, ready);
      return Option.match(
        Option.fromUndefinedOr(furrows.find((furrow) => slugOf(furrow.id) === slug)),
        {
          onNone: () => ({ ...NONE, read: true }),
          onSome: (furrow): ListShown => {
            const verses = ground.lists.find((list) => list.id === furrow.id)?.verses ?? [];
            const start = listStartOf(ground.view, ground.garden, verses);
            const name = removalName(furrow);
            return {
              read: true,
              found: true,
              id: furrow.id,
              slug,
              title: furrow.title,
              icon: furrow.icon,
              caption: listCaptionOf(furrow.plants),
              verses: furrow.plants.map((plant) =>
                verseOf(ground, plant.reference, input.at, ready, plant.label),
              ),
              ...startShown(start),
              startLine: Option.getOrElse(listLineOf(start), () => ''),
              removeId: Option.match(name, { onNone: () => '', onSome: () => furrow.id }),
              removeName: Option.getOrElse(name, () => ''),
              removeAsk: Option.match(name, { onNone: () => '', onSome: removeAskOf }),
            };
          },
        },
      );
    },
  });
