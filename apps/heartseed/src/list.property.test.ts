/* oxlint-disable effect/noGlobals, effect/noNullish, effect/noTernary -- the property tallies its cases in a plain map, writes the model's want as plain branches over null apart from the app's Option code, and names a wrong case by its seed and references as JSON text. */

/**
 * A list's `Practice this list` (hslist L1) at its pure seam, against the
 * model of `test/list-model.ts` written apart from the app: generated
 * devices from `test/home-model.ts`'s plan cases (pieces of made-up text
 * over canon references, phrased or whole, with histories of none, some
 * phrases, every phrase ripe or the verse whole, and the plan `planModel`
 * makes over them), a run over the plan (each item left or kept), two
 * planted canon verses outside the pieces whose last recalls are equal in
 * some, the view drawn as the plan made, no plan over passages read, or
 * no plan over passages unread, and lists of those verses, other canon
 * verses and a made-up reference in any order. Then the real lists the
 * field shows (`fieldPassagesOf`, the Fear collection taught, held
 * passages over it) over generated gardens and the app's own plan.
 *
 * Each case holds `listStartOf`, `listLineOf` and `listCaptionOf` to the
 * model whole, and to the spec's claims on their own: `Open` exactly when
 * `readyOf` holds one of the list's verses; `Open`'s visit the plan's own
 * items, in plan order; `Weakest` and `Learn` what `startOf` starts on
 * their verse; no line or caption reading `1 verses`.
 */

import { describe, expect, it } from 'bun:test';
import { Array as Arr, Option } from 'effect';
import passage from 'virtual:heartseed-passage';

import { plantOf, STAGES, type Plant, type ReadGarden } from './garden';
import { readyOf, verseOf } from './home';
import { startOf } from './home/start';
import { listCaptionOf, listLineOf, listStartOf, type ListStart } from './list';
import { collectionPieces, piecesOf, type PassagesView } from './passages';
import { collectionsOf, fieldPassagesOf } from './promises/taught';
import type { Recall } from './sayit';
import { planOf, type Item, type TextPiece } from './session';
import type { SessionView } from './session/service';
import { recallOf } from './test/field-model';
import { below, pickOf, random } from './test/garden-model';
import { placesOf, plannedOf, type ModelPlanItem } from './test/home-model';
import { listCaptionModel, listLineModel, listStartModel } from './test/list-model';
import { CORPUS } from './test/passages-rig';
import { pieceRule, verseOfRule } from './test/phrase-model';
import { DAY, MINUTE } from './test/session-model';

const CASES = 400;

const CANON: ReadonlySet<string> = new Set(placesOf(CORPUS).keys());

/** Two canon verses outside every generated piece (whose chapters run 1-4), planted whole. */
const APART = ['Psalms 50:1', 'Psalms 50:2'] as const;

const MADE = 'Made 1:1';

type Tally = Map<string, number>;

const bump = (tally: Tally, kind: string) => tally.set(kind, (tally.get(kind) ?? 0) + 1);

const json = <A>(value: A) => JSON.stringify(value);

const gardenOf = (records: readonly Recall[]): ReadGarden => {
  const byReference = new Map<string, Recall[]>();
  for (const recall of records)
    byReference.set(recall.reference, [...(byReference.get(recall.reference) ?? []), recall]);
  const plants = new Map<string, Plant>();
  for (const [reference, recalls] of byReference)
    if (Arr.isReadonlyArrayNonEmpty(recalls)) plants.set(reference, plantOf(recalls));
  return { _tag: 'Read', plants };
};

const plantsOf = (records: readonly Recall[]) => {
  const plants = new Map<string, Recall[]>();
  for (const recall of records)
    plants.set(recall.reference, [...(plants.get(recall.reference) ?? []), recall]);
  return plants;
};

/** The app's start as plain data: its tag, its verse, and each visit verse's item and piece reference. */
const startText = (start: ListStart) => ({
  tag: start._tag,
  verse: 'verse' in start ? start.verse : null,
  visit:
    start._tag === 'None'
      ? []
      : start.visit.map((each) => ({
          reference: each.item.reference,
          fresh: each.item.fresh,
          recalls: each.item.recalls,
          piece: each.piece.reference,
        })),
});

/** A generated device: its records, plan items (none with no plan), pieces, and two or three lists. */
const deviceOf = (seed: number, tally: Tally) => {
  const next = random(seed);
  const { at, records, items, pieces } = plannedOf(next);
  const after = [...records];
  const share = pickOf(next, [0, 0.5, 1] as const);
  items.forEach((item, index) => {
    if (next() >= share) return;
    after.push(recallOf(item.reference, at + (index + 1) * MINUTE, pickOf(next, [1, 3, 4]), 0));
  });
  const apart = pickOf(next, ['none', 'one', 'tie', 'apart'] as const);
  if (apart !== 'none') {
    const [a, b] = APART;
    after.push(recallOf(a, at - 3 * DAY, 3, 0));
    if (apart === 'tie') after.push(recallOf(b, at - 3 * DAY, 3, 0));
    if (apart === 'apart') after.push(recallOf(b, at - 4 * DAY - below(next, 3) * DAY, 3, 0));
  }
  const kind = pickOf(next, ['plan', 'plan', 'plan', 'read', 'unread'] as const);
  bump(tally, `view:${kind}`);
  const pool = [...new Set(pieces.map((piece) => piece.reference)), ...APART, 'Psalms 60:3', MADE];
  const lists = Array.from({ length: 2 + below(next, 2) }, () => {
    const shuffled = [...pool].sort(() => next() - 0.5);
    return shuffled.slice(0, 1 + below(next, 5));
  });
  return {
    records: after,
    items: kind === 'plan' ? items : null,
    pieces: pieces as readonly TextPiece[],
    lists,
    tie: apart === 'tie',
  };
};

const viewOf = (
  items: readonly ModelPlanItem[] | null,
  pieces: readonly TextPiece[],
): SessionView => ({
  minutes: 5,
  plan: items === null ? Option.none() : Option.some({ items }),
  pieces,
  held: Option.none(),
  heldPiece: Option.none(),
  visit: [],
});

/** The model's start as the same plain data as `startText`. */
const wantText = (
  items: readonly ModelPlanItem[] | null,
  records: readonly Recall[],
  pieces: readonly TextPiece[],
  verses: readonly string[],
) => {
  const plants = plantsOf(records);
  const want = listStartModel(items, verses, plants, CANON, verseOfRule);
  const line = listLineModel(want, verseOfRule);
  const visit =
    want.tag === 'Open'
      ? want.items
          .filter((item) => pieceRule(pieces, item.reference) !== undefined)
          .map((item) => ({ ...item, piece: item.reference }))
      : want.tag === 'None'
        ? []
        : [want.start.item].map((item) => ({ ...item, piece: item.reference }));
  return {
    tag: want.tag,
    verse: want.tag === 'Weakest' || want.tag === 'Learn' ? want.verse : null,
    visit: visit.map(({ reference, fresh, recalls, piece }) => ({
      reference,
      fresh,
      recalls,
      piece,
    })),
    line,
  };
};

/** The spec's claims on their own, over one start: the faults found. */
const claimFaults = (
  view: SessionView,
  garden: ReadGarden,
  verses: readonly string[],
  start: ListStart,
) => {
  const out: string[] = [];
  const ready = readyOf(view.plan, garden);
  const open = verses.some((verse) => ready.has(verse));
  if (open !== (start._tag === 'Open')) out.push(`${start._tag} with ready ${open}`);
  if (start._tag === 'Open') {
    const items: readonly Item[] = Option.match(view.plan, {
      onNone: () => [],
      onSome: (plan) => plan.items,
    });
    let at = 0;
    for (const each of start.visit) {
      at = items.indexOf(each.item, at);
      if (at < 0) out.push(`${each.item.reference} not the plan's own item in order`);
      at += 1;
    }
  }
  if ('verse' in start) {
    const want = startOf(view, garden, start.verse);
    if (json(Option.getOrNull(want)) !== json(start.visit[0]))
      out.push(`${start._tag} ${start.verse} not startOf's`);
  }
  const line = Option.getOrElse(listLineOf(start), () => '');
  if (line.includes('1 verses')) out.push(`the line ${line}`);
  return out;
};

/** Tallies a start's kind and the cases the floors ask for: phrases folded, one verse open, a learn of a verse begun in pieces, the tie settled by reference. */
const tallyStart = (tally: Tally, start: ListStart, tie: boolean, garden: ReadGarden) => {
  bump(tally, start._tag);
  const references = startText(start).visit.map((each) => each.reference);
  if (start._tag === 'Open' && new Set(references.map(verseOf)).size < references.length)
    bump(tally, 'open:folded');
  if (start._tag === 'Open' && references.length === 1) bump(tally, 'open:one');
  if (
    start._tag === 'Learn' &&
    [...garden.plants.keys()].some((key) => key !== start.verse && verseOf(key) === start.verse)
  )
    bump(tally, 'learn:begun in pieces');
  if (start._tag === 'Weakest' && tie && start.verse === APART[0]) bump(tally, 'weakest:tie');
};

describe('Practice this list over generated devices', () => {
  it('starts what the model starts, with its line, and holds the spec’s claims', () => {
    const tally: Tally = new Map();
    const failures: string[] = [];
    for (let seed = 1; seed <= CASES && failures.length === 0; seed++) {
      const device = deviceOf(seed * 7919, tally);
      const garden = gardenOf(device.records);
      const view = viewOf(device.items, device.pieces);
      for (const verses of device.lists) {
        const start = listStartOf(view, garden, verses);
        const got = { ...startText(start), line: Option.getOrNull(listLineOf(start)) };
        const want = wantText(device.items, device.records, device.pieces, verses);
        if (json(got) !== json(want))
          failures.push(
            `seed ${seed} ${json(verses)}: ${json(got)} where the model has ${json(want)}`,
          );
        for (const fault of claimFaults(view, garden, verses, start))
          failures.push(`seed ${seed} ${json(verses)}: ${fault}`);
        tallyStart(tally, start, device.tie, garden);
      }
    }
    expect(failures.slice(0, 2)).toEqual([]);
    const floors: ReadonlyArray<readonly [string, number]> = [
      ['Open', 100],
      ['Weakest', 60],
      ['Learn', 60],
      ['None', 30],
      ['open:folded', 10],
      ['open:one', 20],
      ['learn:begun in pieces', 5],
      ['weakest:tie', 5],
      ['view:unread', 30],
    ];
    expect(
      floors
        .filter(([kind, floor]) => (tally.get(kind) ?? 0) < floor)
        .map(([kind]) => `${kind}=${tally.get(kind) ?? 0}`),
    ).toEqual([]);
  });

  it('writes the caption the model writes over every stage list, never `1 verses`', () => {
    const stages = ['not planted', ...STAGES] as const;
    for (let seed = 1; seed <= 300; seed++) {
      const next = random(seed * 31);
      const plants = Array.from({ length: 1 + below(next, 20) }, () => ({
        stage: pickOf(next, [...stages]),
      }));
      const caption = listCaptionOf(plants);
      expect([seed, caption]).toEqual([seed, listCaptionModel(plants.map((plant) => plant.stage))]);
      expect(caption.startsWith('1 verses')).toBe(false);
    }
  });
});

/** The app's own piece, the promise alone, as the session holds it. */
const OWN: readonly TextPiece[] = [
  { reference: passage.reference, text: passage.text, words: 20, group: passage.reference },
];

const FEAR = collectionsOf(['protection']);

/** Passages over the Fear collection's verses and over the promise. */
const HELD = [
  { book: 19, chapter: 91, first: 1, last: 16 },
  { book: 23, chapter: 41, first: 10, last: 13 },
  { book: 19, chapter: 121, first: 1, last: 8 },
] as const;

describe('Practice this list over the field’s real lists', () => {
  it('holds the spec’s claims on the own row, held passages and Protection & Fear', () => {
    const tally: Tally = new Map();
    const failures: string[] = [];
    const fearVerses = fieldPassagesOf([], { _tag: 'Read', passages: [], lists: [] }, FEAR).flatMap(
      (list) => list.verses,
    );
    for (let seed = 1; seed <= 60 && failures.length === 0; seed++) {
      const next = random(seed * 104_729);
      const at = Date.UTC(2026, below(next, 12), 1 + below(next, 28), 12);
      const passages: PassagesView = {
        _tag: 'Read',
        passages: HELD.slice(0, below(next, 3)),
        lists: [],
      };
      const records: Recall[] = [];
      const share = pickOf(next, [0, 0.3, 0.7, 1] as const);
      for (const verse of [passage.reference, ...fearVerses])
        if (next() < share)
          for (let n = 1 + below(next, 3); n > 0; n--)
            records.push(
              recallOf(
                verse,
                at - n * (1 + below(next, 9)) * DAY - below(next, 99),
                pickOf(next, [1, 3, 4]),
                0,
              ),
            );
      const garden = gardenOf(records);
      const pieces = piecesOf(OWN, passages, collectionPieces(FEAR));
      const plan = planOf({
        garden,
        pieces,
        at,
        offset: 0,
        minutes: pickOf(next, [2, 5, 10, 20] as const),
      });
      const view: SessionView = { ...viewOf(null, pieces), plan: Option.some(plan) };
      const lists = fieldPassagesOf(
        [{ title: passage.reference, verses: [passage.reference] }],
        passages,
        FEAR,
      );
      for (const list of lists) {
        const start = listStartOf(view, garden, list.verses);
        for (const fault of claimFaults(view, garden, list.verses, start))
          failures.push(`seed ${seed} ${list.title}: ${fault}`);
        bump(tally, `${list.source._tag}:${start._tag}`);
      }
    }
    expect(failures.slice(0, 2)).toEqual([]);
    const reached = ['Collection:Open', 'Collection:Learn', 'Passage:Open', 'Own:Open'].filter(
      (kind) => (tally.get(kind) ?? 0) < 3,
    );
    expect(reached).toEqual([]);
  });
});
