/* oxlint-disable effect/noNullish, effect/noTernary, effect/noThrowStatement, effect/noNewError, effect/noUnknownParameters, effect/noRuntimeTypeof -- a test helper: the port's answer and the oracle's, compared as plain data; an answer is walked whole for the names it must not carry, and an unread case is a defect thrown at once. */

/**
 * Home's equality over one case (spec A1 to A3): the port, `homeOf` and
 * `listPageOf` over the case's garden and the session's wire of its view;
 * the oracle, the current Heartseed's own rules over the same garden and
 * the view itself. What each answers is put side by side as plain data,
 * and the invariants each answer holds are checked on it.
 */

import { LIMIT_LINE, SINGLES_LIMIT_LINE } from '@manna/heartseed/chooser';
import {
  furrowsOf,
  greetingOf,
  minuteOf,
  readyOf,
  singlesOf,
  type HomeIcon,
} from '@manna/heartseed/home';
import { startOf } from '@manna/heartseed/home/start';
import { todayOf } from '@manna/heartseed/home/today';
import { listCaptionOf, listLineOf, listStartOf } from '@manna/heartseed/list';
import { listsOf, singleVersesOf } from '@manna/heartseed/lists';
import { MOST_PASSAGES, MOST_SINGLES, passageReference } from '@manna/heartseed/passages';
import { Option } from 'effect';

import { slugOf } from '../garden/view';
import { homeOf, homeStartOf, type HomeShown } from '../home/home';
import { listPageOf } from '../list/page';
import { sessionWire } from '../today/sources';
import type { HomeCase } from './home-model';

/** The icon names the current home draws, and its stages' drawing names: none may be answered. */
const DRAWN_NAMES: ReadonlySet<string> = new Set<HomeIcon | string>([
  'add',
  'blade',
  'bow',
  'corn',
  'ear',
  'harp',
  'lamp',
  'scroll',
  'seed',
  'sun',
  'moon',
  'gear',
  'full corn',
]);

/** Every string an answer carries, at any depth, and every key. */
const stringsIn = (value: unknown, into: string[] = []): string[] => {
  if (typeof value === 'string') into.push(value);
  else if (Array.isArray(value)) for (const each of value) stringsIn(each, into);
  else if (value !== null && typeof value === 'object')
    for (const [key, each] of Object.entries(value)) {
      into.push(`key:${key}`);
      stringsIn(each, into);
    }
  return into;
};

const itemOfStart = (start: ReturnType<typeof startOf>) =>
  Option.match(start, { onNone: () => null, onSome: (each) => each.item });

/** The port's answers for `each`, and the oracle's, as plain data. */
export const sidesOf = (each: HomeCase) => {
  const wire = sessionWire(each.view);
  const input = { held: each.held, wire, at: each.at };
  const port = homeOf(input);
  const { garden, passages } = each.held;
  if (garden._tag === 'Unread' || passages._tag === 'Unread') throw new TypeError('a read case');
  const lists = listsOf([], passages, []);
  const ready = readyOf(each.view.plan, garden);
  const card = todayOf(each.view, garden, false);
  const furrows = furrowsOf(garden, lists, ready);
  const singles = singlesOf(garden, lists, singleVersesOf([], passages), passages.singles, ready);
  const held = passages.passages.length + passages.lists.length;
  const references = [
    ...furrows.flatMap((furrow) => furrow.plants.map((plant) => plant.reference)),
    ...singles.map((plant) => plant.reference),
  ];
  const oracle = {
    greeting: greetingOf(minuteOf(each.at.now, each.at.offset)).words,
    line: Option.getOrElse(card.headline, () => ''),
    parts: Option.getOrElse(card.parts, () => ''),
    action: card.action._tag,
    practice: card.action._tag === 'PracticeAnyway' ? slugOf(card.action.verse) : '',
    rows: furrows.map((furrow) => ({
      title: furrow.title,
      caption: furrow.caption,
      plants: furrow.plants.map((plant) => [plant.reference, plant.label, plant.ready]),
    })),
    singles: singles.map((plant) => [
      plant.reference,
      plant.label,
      plant.ready,
      Option.isSome(plant.removal),
    ]),
    addsList: held < MOST_PASSAGES,
    limitLine:
      held >= MOST_PASSAGES
        ? LIMIT_LINE
        : passages.singles.length >= MOST_SINGLES
          ? SINGLES_LIMIT_LINE
          : '',
    starts: references.map((reference) => itemOfStart(startOf(each.view, garden, reference))),
    pages: lists.map((list) => {
      const start = listStartOf(each.view, garden, list.verses);
      const furrow = furrows.find((row) => row.id === list.id);
      return {
        caption: listCaptionOf(furrow?.plants ?? []),
        start: start._tag,
        line: Option.getOrElse(listLineOf(start), () => ''),
        removes: list.range === undefined ? '' : passageReference(list.range),
      };
    }),
  };
  const ported = {
    greeting: port.greeting,
    line: port.card.line,
    parts: port.card.parts,
    action:
      { start: 'Start', practice: 'PracticeAnyway', none: 'None' }[port.card.action] ??
      port.card.action,
    practice: port.card.slug,
    rows: port.rows.map((row) => ({
      title: row.title,
      caption: row.caption,
      plants: row.plants.map((plant) => [plant.reference, plant.label, plant.ready]),
    })),
    singles: port.singles.map((plant) => [
      plant.reference,
      plant.label,
      plant.ready,
      plant.removeId !== '',
    ]),
    addsList: port.addsList,
    limitLine: port.limitLine,
    starts: references.map((reference) => itemOfStart(homeStartOf(input, reference))),
    pages: port.rows.map((row) => {
      const page = listPageOf(input, row.slug);
      return {
        caption: page.caption,
        start:
          { open: 'Open', weakest: 'Weakest', learn: 'Learn', none: 'None' }[page.start] ??
          page.start,
        line: page.startLine,
        removes: page.removeName,
      };
    }),
  };
  return { port, oracle, ported };
};

/** What a run of cases reached, so a generator that stops drawing a kind of case fails its floor. */
export const reachOf = (port: HomeShown, each: HomeCase) => ({
  start: port.card.action === 'start' ? 1 : 0,
  practice: port.card.action === 'practice' ? 1 : 0,
  none: port.card.action === 'none' ? 1 : 0,
  noPlan: Option.isNone(each.view.plan) ? 1 : 0,
  held: Option.isSome(each.view.held) ? 1 : 0,
  visit: each.view.visit.length > 0 ? 1 : 0,
  ready: port.rows.some((row) => row.plants.some((plant) => plant.ready)) ? 1 : 0,
  singles: port.singlesShown ? 1 : 0,
  noSingles: port.singlesShown ? 0 : 1,
  removable: port.singles.some((single) => single.removeId !== '') ? 1 : 0,
  orphan: port.singles.some((single) => single.removeId === '') ? 1 : 0,
  shared: port.rows.some((row) => row.plants.some((plant) => plant.id !== plant.slug)) ? 1 : 0,
  listsFull: port.addsList ? 0 : 1,
  limit: port.limitLine === '' ? 0 : 1,
});

export type Reach = ReturnType<typeof reachOf>;

/** Checks every seed from `first` to `last` with `check`, and answers how often each kind of case came up. */
export const runSeeds = (
  first: number,
  last: number,
  check: (seed: number, sides: ReturnType<typeof sidesOf>) => void,
  caseOf: (seed: number) => HomeCase,
): Reach => {
  const reach: Record<string, number> = {};
  for (let seed = first; seed <= last; seed++) {
    const each = caseOf(seed);
    const sides = sidesOf(each);
    check(seed, sides);
    for (const [key, value] of Object.entries(reachOf(sides.port, each)))
      reach[key] = (reach[key] ?? 0) + value;
  }
  return reach as Reach;
};

/** The invariants every answer holds, each `true` when it holds. */
export const invariantsOf = (port: HomeShown) => {
  const rowVerses = new Set(port.rows.flatMap((row) => row.plants.map((plant) => plant.reference)));
  const marks = new Map<string, string>();
  let oneMark = true;
  for (const plant of port.rows.flatMap((row) => row.plants)) {
    const mark = `${plant.label}|${plant.ready}|${plant.sown}`;
    if ((marks.get(plant.reference) ?? mark) !== mark) oneMark = false;
    marks.set(plant.reference, mark);
  }
  const strings = stringsIn(port);
  const ids = port.rows.flatMap((row) => row.plants.map((plant) => plant.id));
  return {
    singlesSectionExactlyWhenSingles: port.singlesShown === port.singles.length > 0,
    oneStageAndMarkPerVerse: oneMark,
    noIconOrGlyph:
      !strings.some((each) => DRAWN_NAMES.has(each)) &&
      !strings.some((each) => ['key:icon', 'key:kind', 'key:stage', 'key:glyph'].includes(each)),
    singleInNoRow: port.singles.every((single) => !rowVerses.has(single.reference)),
    plantIdsUnique: new Set(ids).size === ids.length,
  };
};
