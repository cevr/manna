/* oxlint-disable effect/noGlobals, effect/noNullish, effect/noTernary -- the property tallies its cases in a plain map, writes the card's rule as plain branches over undefined apart from the app's Option code, and names a wrong case by its seed and references as JSON text. */

/**
 * The Today card (hsstart T1) at its pure seam, against a model written
 * here apart from the app: generated devices from `test/home-model.ts`'s
 * plan cases (whole verses of made-up text over canon references, with
 * histories of none, some old pieces stored, every old piece ripe or the
 * verse joined, and the plan `planModel` makes over them), then a run over
 * the plan (each item left or kept), and the view drawn as: the plan made,
 * no plan over passages read, or no plan over passages unread; a hold of
 * a done item in some.
 *
 * Each case holds the card to the model whole, and to the spec's claims
 * on their own: `Start` exactly when `beginsOf` holds over `shownOf`; a
 * garden with a planted canon verse and a plan never yields no button;
 * `parts` never counts more verses than the headline; a count of one
 * reads `1 verse`, never `1 verses`. It catches the strongest verse taken
 * for the weakest, the later recall on a tie of stage, pieces counted for
 * verses, a hold's item left out of an
 * empty count, and `Start` offered with nothing open.
 */

import { describe, expect, it } from 'bun:test';
import { Array as Arr, Option } from 'effect';

import { plantOf, type Plant, type ReadGarden } from '../garden';
import type { Recall } from '../sayit';
import type { TextPiece } from '../session';
import { shownOf } from '../session/run';
import type { SessionView } from '../session/service';
import { recallOf } from '../test/field-model';
import { below, inOrder, pickOf, random, referenceStage } from '../test/garden-model';
import { placesOf, plannedOf, type ModelPlanItem } from '../test/home-model';
import { CORPUS } from '../test/passages-rig';
import { pieceRule, verseOfRule } from '../test/phrase-model';
import { MINUTE } from '../test/session-model';
import { beginsOf, todayOf } from './today';

const CASES = 400;

const CANON: ReadonlySet<string> = new Set(placesOf(CORPUS).keys());

const RANK = { seed: 0, blade: 1, ear: 2, 'full corn': 3 } as const;

type Tally = Map<string, number>;

const bump = (tally: Tally, kind: string) => tally.set(kind, (tally.get(kind) ?? 0) + 1);

const gardenOf = (records: readonly Recall[]): ReadGarden => {
  const byReference = new Map<string, Recall[]>();
  for (const recall of records)
    byReference.set(recall.reference, [...(byReference.get(recall.reference) ?? []), recall]);
  const plants = new Map<string, Plant>();
  for (const [reference, recalls] of byReference)
    if (Arr.isReadonlyArrayNonEmpty(recalls)) plants.set(reference, plantOf(recalls));
  return { _tag: 'Read', plants };
};

/** A generated device: its records, plan items (undefined with no plan), pieces, held item and whether the passages are unread. */
interface Device {
  readonly records: readonly Recall[];
  readonly items: readonly ModelPlanItem[] | undefined;
  readonly pieces: readonly TextPiece[];
  readonly held: ModelPlanItem | undefined;
  readonly unread: boolean;
}

const deviceOf = (seed: number): Device => {
  const next = random(seed);
  const { at, records, items, pieces } = plannedOf(next);
  const after = [...records];
  const kept: ModelPlanItem[] = [];
  const share = pickOf(next, [0, 0.5, 1] as const);
  items.forEach((item, index) => {
    if (next() >= share) return;
    after.push(recallOf(item.reference, at + (index + 1) * MINUTE, pickOf(next, [1, 3, 4]), 0));
    kept.push(item);
  });
  const kind = pickOf(next, ['plan', 'plan', 'plan', 'read', 'unread'] as const);
  const held = kind === 'plan' && below(next, 4) === 0 ? kept[below(next, kept.length)] : undefined;
  return {
    records: after,
    items: kind === 'plan' ? items : undefined,
    pieces,
    held,
    unread: kind === 'unread',
  };
};

const viewOf = (device: Device): SessionView => ({
  minutes: 5,
  plan: device.items === undefined ? Option.none() : Option.some({ items: device.items }),
  pieces: device.pieces,
  held: Option.fromUndefinedOr(device.held),
  heldPiece: Option.none(),
  visit: [],
});

const plural = (n: number) => (n === 1 ? '1 verse' : `${n} verses`);

/** The card by the model: the item the run shows, the counted items, the lines and the action. */
const cardModel = (device: Device) => {
  const recallsOf = (reference: string) =>
    device.records.filter((recall) => recall.reference === reference);
  const open = (device.items ?? []).filter(
    (item) => recallsOf(item.reference).length <= item.recalls,
  );
  const shown =
    device.items === undefined
      ? undefined
      : (device.held ??
        open.find((item) => pieceRule(device.pieces, item.reference) !== undefined));
  const begins =
    device.items === undefined ? device.unread && device.pieces.length > 0 : shown !== undefined;
  const planted = [...new Set(device.records.map((recall) => recall.reference))];
  const candidates =
    device.items === undefined
      ? []
      : planted
          .filter((reference) => CANON.has(reference))
          .map((reference) => {
            const recalls = inOrder(recallsOf(reference));
            return {
              reference,
              rank: RANK[referenceStage(recalls)],
              last: recalls[recalls.length - 1]?.startedAt ?? 0,
            };
          })
          .sort(
            (a, b) => a.rank - b.rank || a.last - b.last || (a.reference < b.reference ? -1 : 1),
          );
  const action = begins
    ? { _tag: 'Start' }
    : candidates[0] === undefined
      ? { _tag: 'None' }
      : { _tag: 'PracticeAnyway', verse: candidates[0].reference };
  if (device.items === undefined) return { headline: null, parts: null, action };
  const counted = open.length > 0 ? open : shown === undefined ? [] : [shown];
  if (counted.length === 0)
    return { headline: 'All tended for today', parts: 'Nothing is due right now.', action };
  const verses = new Set(counted.map((item) => verseOfRule(item.reference)));
  const reviews = new Set(
    counted.filter((item) => !item.fresh).map((item) => verseOfRule(item.reference)),
  );
  let seconds = 0;
  for (const item of counted) seconds += item.seconds;
  const parts: string[] = [];
  if (reviews.size > 0) parts.push(`${reviews.size} to review`);
  if (counted.some((item) => item.fresh)) parts.push('1 new');
  return {
    headline: `${plural(verses.size)} · about ${Math.ceil(seconds / 60)} min`,
    parts: parts.join(' · '),
    action,
  };
};

const cardSeen = (device: Device) => {
  const card = todayOf(viewOf(device), gardenOf(device.records), device.unread);
  return {
    headline: Option.getOrNull(card.headline),
    parts: Option.getOrNull(card.parts),
    action: { ...card.action },
  };
};

const countIn = (line: string | null, pattern: RegExp) =>
  Number(pattern.exec(line ?? '')?.[1] ?? 0);

type Seen = ReturnType<typeof cardSeen>;

/** What the card breaks of the spec's claims on their own: Start off `beginsOf`, no button over a planted canon verse with a plan, parts past the headline, a wrong singular. */
const claimsOf = (device: Device, seen: Seen): string[] => {
  const out: string[] = [];
  const garden = gardenOf(device.records);
  const begins = beginsOf(shownOf(viewOf(device), Option.some(garden)), device.unread);
  if (begins !== (seen.action._tag === 'Start'))
    out.push(`Start ${seen.action._tag}, begins ${begins}`);
  const plantedCanon = [...garden.plants.keys()].some((key) => CANON.has(key));
  if (device.items !== undefined && plantedCanon && seen.action._tag === 'None')
    out.push('no button over a planted canon verse');
  if (countIn(seen.parts, /(\d+) to review/) > countIn(seen.headline, /^(\d+) verses?/))
    out.push('parts past the headline');
  if (/^1 verses |^(?!1 )\d+ verse /.test(seen.headline ?? '')) out.push('a singular');
  return out;
};

/** Counts the kinds of case a device reaches. */
const tallyOf = (tally: Tally, device: Device, seen: Seen) => {
  bump(tally, seen.action._tag);
  if (seen.parts?.includes('1 new') === true) bump(tally, 'new');
  if (seen.headline === 'All tended for today') bump(tally, 'tended');
  else if (device.held !== undefined) bump(tally, 'held');
  if (seen.headline?.startsWith('1 verse ·') === true) bump(tally, 'one verse');
  if (device.unread) bump(tally, 'unread');
  const begun = new Set(
    device.records
      .filter((recall) => verseOfRule(recall.reference) !== recall.reference)
      .map((recall) => verseOfRule(recall.reference)),
  );
  if ((device.items ?? []).some((item) => begun.has(item.reference)))
    bump(tally, 'plan over old pieces');
};

const FLOORS = [
  'Start',
  'PracticeAnyway',
  'None',
  'new',
  'tended',
  'one verse',
  'held',
  'unread',
  'plan over old pieces',
];

describe('the Today card', () => {
  it('holds the card to the model and to its claims over generated devices', () => {
    const tally: Tally = new Map();
    const wrong: unknown[] = [];
    for (let seed = 1; seed <= CASES && wrong.length === 0; seed++) {
      const device = deviceOf(seed * 7907);
      const seen = cardSeen(device);
      const want = cardModel(device);
      if (JSON.stringify(seen) !== JSON.stringify(want)) wrong.push({ seed, seen, want });
      const claims = claimsOf(device, seen);
      if (claims.length > 0) wrong.push({ seed, claims, seen });
      tallyOf(tally, device, seen);
    }
    expect(wrong.slice(0, 1)).toEqual([]);
    const short = FLOORS.filter((kind) => (tally.get(kind) ?? 0) < 15);
    expect(short.map((kind) => `${kind} ${tally.get(kind) ?? 0}`)).toEqual([]);
  });
});
