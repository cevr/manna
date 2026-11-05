/* oxlint-disable effect/noGlobals, effect/noNullish, effect/noTernary -- the generator writes the hsdaily spec's domain out as plain branches over undefined and counts its coverage in plain maps, apart from the plan's Option code. */

/**
 * The daily plan (`planOf`) and Today's counts line (`countsOf`) against the
 * spec's rules written plainly (`test/session-model.ts`, over ts-fsrs and
 * `Intl`). Its seam is the two pure functions: what a session offers, in
 * what order, and what the line reads as items are done.
 *
 * It catches a plan that drops or moves the evening rule (its hours, its
 * morning, its one-recall limit, an old record's unknown hour, the device's
 * offset in place of the record's), offers a second new verse in a day or
 * takes the day in UTC, skips a misfit or the forced first review, forgets
 * the new piece's reserve, takes the whole backlog, orders without mixing or
 * puts the new piece first, keeps a duplicate piece, breaks ties the other
 * way, or estimates otherwise; and a line that rounds its minutes down or
 * counts a done item. It misses where the plan is made and what Today shows
 * (the session's rendered tests).
 */

import { describe, expect, it } from 'bun:test';

import { plantOf, type ReadGarden } from './garden';
import type { Recall } from './sayit';
import { countsOf, MINUTES, planOf, type Item, type Minutes, type Piece } from './session';
import { CHANGES } from './test/day-model';
import { below, pickOf, random, referenceCard } from './test/garden-model';
import {
  countsModel,
  DAY,
  dueModel,
  estimate,
  HOUR,
  isEvening,
  localDay,
  MINUTE,
  morningOf,
  planModel,
  type ModelPiece,
} from './test/session-model';
import { offsetIn, ZONES } from './test/zone';

type Coverage = Map<string, number>;

const bump = (coverage: Coverage, key: string) => {
  coverage.set(key, (coverage.get(key) ?? 0) + 1);
};

const chance = (next: () => number, p: number) => next() < p;

const GRADES: readonly [Recall['grade'], ...Recall['grade'][]] = [1, 2, 3, 3, 3, 4];

const GROUPS = ['Psalm 23', 'John 15', 'Promises · Fear', 'Romans 8', 'Isaiah 41'] as const;

const TRICKY = ['Isaiah 41:10', 'Isaiah 41:1', 'Isaiah 41:10 ', 'Ésaïe 41:10', 'x/y 2:3'] as const;

const recallOf = (
  reference: string,
  startedAt: number,
  grade: Recall['grade'],
  offset: number | undefined,
  peeked = 0,
): Recall => {
  const recall: Recall = {
    reference,
    startedAt,
    grade,
    suggested: grade === 4 ? 3 : grade === 1 ? 1 : 2,
    words: 9,
    missed: peeked,
    peeked,
    extra: 0,
  };
  if (offset === undefined) return recall;
  return { ...recall, offset };
};

/** The instant `zone`'s wall clock reads `clock` ms after midnight on its date at `near`, `back` dates earlier. */
const wallAt = (zone: string, near: number, back: number, clock: number) =>
  wallStamp(zone, near, back, clock).at;

/** `wallAt`'s instant and the offset that reads it there: a gap's skipped hour keeps the offset before it, so the record's clock reads `clock` exactly. */
const wallStamp = (zone: string, near: number, back: number, clock: number) => {
  const now = offsetIn(zone, near);
  const near_ = near + now * MINUTE;
  const wall = near_ - (((near_ % DAY) + DAY) % DAY) - back * DAY + clock;
  const offset = offsetIn(zone, wall - now * MINUTE);
  return { at: wall - offset * MINUTE, offset };
};

/** The instant today's day started in `zone` at `at`: its latest 04:00. */
const dayStartIn = (zone: string, at: number) => {
  const offset = offsetIn(zone, at);
  return localDay(at, offset) * DAY + 4 * HOUR - offset * MINUTE;
};

const ABSENCES = ['minutes', 'hours', 'days', 'month', 'year'] as const;

/** A gap back from now of the kind given. */
const gapOf = (next: () => number, kind: (typeof ABSENCES)[number]) => {
  if (kind === 'minutes') return (1 + below(next, 50)) * MINUTE + below(next, MINUTE);
  if (kind === 'hours') return (1 + below(next, 20)) * HOUR + below(next, HOUR);
  if (kind === 'days') return (1 + below(next, 12)) * DAY + below(next, DAY);
  if (kind === 'month') return (28 + below(next, 40)) * DAY + below(next, DAY);
  return (300 + below(next, 200)) * DAY;
};

const EVENING_CLOCKS = [
  ['18:00:00.000', 18 * HOUR],
  ['03:59:59.999', 4 * HOUR - 1],
  ['evening', 18 * HOUR + 1],
  ['after midnight', 1],
] as const;

const DAY_CLOCKS = [
  ['04:00:00.000', 4 * HOUR],
  ['17:59:59.999', 18 * HOUR - 1],
  ['day', 4 * HOUR + 1],
] as const;

interface Built {
  readonly zone: string;
  readonly at: number;
  readonly minutes: Minutes;
  readonly pieces: readonly ModelPiece[];
  readonly plants: ReadonlyMap<string, readonly Recall[]>;
}

/** Where a history is made: around `now` in the device's `zone`, its records stamped in `stampZone` (another zone for a traveller). */
interface Place {
  readonly reference: string;
  readonly now: number;
  readonly zone: string;
  readonly stampZone: string;
}

/** A wall clock time of the kind named: an exact edge, or any time in its span. */
const clockOf = (next: () => number, name: string, at: number) => {
  if (name === 'evening') return at + below(next, 6 * HOUR - 2);
  if (name === 'after midnight') return at + below(next, 4 * HOUR - 2);
  if (name === 'day') return at + below(next, 14 * HOUR - 2);
  return at;
};

/** A verse planted once (an evening one sometimes said again that night), at an edge or any time of its span, today or days back; an old record keeps no offset. */
const singleOf = (next: () => number, coverage: Coverage, place: Place, kind: string): Recall[] => {
  const { reference, stampZone } = place;
  const clocks = kind === 'day' ? DAY_CLOCKS : EVENING_CLOCKS;
  const [name, at] = clocks[below(next, clocks.length)] ?? clocks[0];
  const back = pickOf(next, [0, 0, 1, 1, 2, 9, 40]);
  const { at: t, offset } = wallStamp(stampZone, place.now, back, clockOf(next, name, at));
  const grade = pickOf(next, GRADES);
  if (kind === 'old') return [recallOf(reference, t, grade, undefined)];
  if (offset !== offsetIn(place.zone, place.now)) bump(coverage, 'evening:travel');
  const planted = recallOf(reference, t, grade, offset);
  if (kind !== 'evening' || chance(next, 0.75)) return [planted];
  const again = t + (1 + below(next, 60)) * MINUTE;
  return [planted, recallOf(reference, again, pickOf(next, GRADES), offsetIn(stampZone, again))];
};

/** A verse first recalled today, once or twice. */
const todayOf = (next: () => number, place: Place): Recall[] => {
  const { reference, zone, now } = place;
  const start = dayStartIn(zone, now);
  const t = start + below(next, Math.max(1, now - start));
  const first = recallOf(reference, t, pickOf(next, GRADES), offsetIn(zone, t));
  if (chance(next, 0.5)) return [first];
  return [first, recallOf(reference, t + 1 + below(next, 30 * MINUTE), 3, offsetIn(zone, t))];
};

const PATTERNS = ['mixed', 'good run', 'again after', 'evening first'] as const;

/** The grade of the `k`th recall from the last of `count`, by the history's pattern. */
const gradeOf = (
  next: () => number,
  pattern: (typeof PATTERNS)[number],
  k: number,
  count: number,
) => {
  if (pattern === 'mixed') return pickOf(next, GRADES);
  if (pattern === 'again after' && k === count - 1) return 1;
  return 3;
};

/** Many recalls ending an absence back (or after `now`: the clock set back), gaps of minutes to a year between them, every grade, peeks, some old records, a run of Good to full corn or an Again after it. */
const manyOf = (next: () => number, place: Place, future: boolean): Recall[] => {
  const { reference, stampZone } = place;
  const count = chance(next, 0.15) ? 15 + below(next, 15) : 2 + below(next, 8);
  const pattern = pickOf(next, PATTERNS);
  let t = future
    ? place.now + 1 + below(next, 3 * DAY)
    : place.now - gapOf(next, pickOf(next, ABSENCES));
  const recalls: Recall[] = [];
  for (let k = count - 1; k >= 0; k -= 1) {
    const startedAt =
      pattern === 'evening first' && k === 0 ? wallAt(stampZone, t, 0, 20 * HOUR) : t;
    const offset = chance(next, 0.1) ? undefined : offsetIn(stampZone, startedAt);
    const peeked = chance(next, 0.2) ? 1 + below(next, 3) : 0;
    recalls.push(recallOf(reference, startedAt, gradeOf(next, pattern, k, count), offset, peeked));
    t -= pickOf(next, [
      MINUTE * (1 + below(next, 30)),
      HOUR * (1 + below(next, 12)),
      DAY * (1 + below(next, 30)),
      DAY * (30 + below(next, 300)),
    ]);
  }
  const unique = new Map(recalls.map((recall) => [recall.startedAt, recall]));
  return [...unique.values()].toSorted((a, b) => a.startedAt - b.startedAt);
};

/** One plant's recalls of `kind`, made around `now` in `zone`, stamped in another zone one time in seven. */
const historyOf = (
  next: () => number,
  coverage: Coverage,
  reference: string,
  now: number,
  zone: string,
  kind: string,
): Recall[] => {
  const stampZone = chance(next, 0.15) ? pickOf(next, ZONES) : zone;
  const place = { reference, now, zone, stampZone };
  if (kind === 'evening' || kind === 'day' || kind === 'old')
    return singleOf(next, coverage, place, kind);
  if (kind === 'today') return todayOf(next, place);
  return manyOf(next, place, kind === 'future');
};

const KINDS = [
  'evening',
  'evening',
  'day',
  'old',
  'many',
  'many',
  'many',
  'today',
  'future',
] as const;

/** A generated case of the plan's whole domain, its coverage counted. */
const caseOf = (next: () => number, coverage: Coverage): Built => {
  const { zone, now } = startOf(next, coverage);
  const pile = chance(next, 0.15);
  const pieces = piecesOf(next, pile);
  const plants = plantsOf(next, coverage, pieces, pile, zone, now);
  const at = edgeOf(next, coverage, zone, now, plants);
  return {
    zone,
    at,
    minutes: pickOf(next, [...MINUTES] as [Minutes, ...Minutes[]]),
    pieces,
    plants,
  };
};

/** A zone and an instant: any in 2025-2027, or one at a daylight-saving change of its zone. */
const startOf = (next: () => number, coverage: Coverage) => {
  if (!chance(next, 0.08))
    return {
      zone: pickOf(next, ZONES) as string,
      now: Date.UTC(2025, 0, 1) + below(next, 3 * 365) * DAY + below(next, DAY),
    };
  const change = pickOf(next, CHANGES);
  bump(coverage, 'at:dst night');
  return {
    zone: change.zone,
    now: change.at + pickOf(next, [-1, 0, 1, -2 * HOUR, 2 * HOUR, 20 * HOUR]),
  };
};

/** None to dozens of pieces (25 to 65 in a pile) in 1 to 5 groups: tricky references, a reference again in another piece, words 1-90 and one in eight 150-400. */
const piecesOf = (next: () => number, pile: boolean) => {
  const count = pile ? 25 + below(next, 41) : pickOf(next, [0, 1, 1, 2, 3, 4, 6, 9, 14, 24, 40]);
  const groups = 1 + below(next, 5);
  const pieces: ModelPiece[] = [];
  for (let k = 0; k < count; k += 1) {
    const words = chance(next, 0.12) ? 150 + below(next, 251) : 1 + below(next, 90);
    pieces.push({
      reference: referenceOf(next, pieces),
      words,
      group: GROUPS[below(next, groups)] ?? GROUPS[0],
    });
  }
  return pieces;
};

const referenceOf = (next: () => number, pieces: readonly ModelPiece[]) => {
  if (chance(next, 0.1) && pieces.length > 0)
    return pickOf(next, pieces as [ModelPiece, ...ModelPiece[]]).reference;
  if (chance(next, 0.15)) return pickOf(next, TRICKY);
  return `Verse ${below(next, 60)}:${below(next, 30)}`;
};

/** The garden: some pieces planted (most of a pile, a month or more away), a twin history now and then (a tie of due instants), and strays no piece names. */
const plantsOf = (
  next: () => number,
  coverage: Coverage,
  pieces: readonly ModelPiece[],
  pile: boolean,
  zone: string,
  now: number,
) => {
  const plants = new Map<string, readonly Recall[]>();
  const histories = new Map<string, Recall[]>();
  for (const piece of pieces) {
    if (plants.has(piece.reference) || !chance(next, pile ? 0.92 : 0.6)) continue;
    const twin = chance(next, 0.08) ? [...histories.values()].at(-1) : undefined;
    const recalls =
      twin !== undefined
        ? twin.map((recall) => ({ ...recall, reference: piece.reference }))
        : pile
          ? historyOf(
              next,
              coverage,
              piece.reference,
              now - (28 + below(next, 300)) * DAY,
              zone,
              'many',
            )
          : historyOf(next, coverage, piece.reference, now, zone, pickOf(next, KINDS));
    if (recalls.length === 0) continue;
    histories.set(piece.reference, recalls);
    plants.set(piece.reference, recalls);
  }
  for (let k = below(next, 4); k > 0; k -= 1) {
    const reference = `Stray ${below(next, 9)}:${below(next, 9)}`;
    if (pieces.some((piece) => piece.reference === reference)) continue;
    const recalls = historyOf(
      next,
      coverage,
      reference,
      now,
      zone,
      chance(next, 0.3) ? 'today' : pickOf(next, KINDS),
    );
    plants.set(reference, recalls);
  }
  return plants;
};

/** The instant the plan is made: the case's now, or an edge of one of its plants or of its day. */
const edgeOf = (
  next: () => number,
  coverage: Coverage,
  zone: string,
  now: number,
  plants: ReadonlyMap<string, readonly Recall[]>,
) => {
  const roll = below(next, 10);
  const all = [...plants.values()];
  if (roll < 2 && all.length > 0) {
    const by = pickOf(next, [-1, 0, 1] as const);
    bump(coverage, `at:due${by === 0 ? '' : by > 0 ? '+1' : '-1'}`);
    return dueModel(pickOf(next, all as [readonly Recall[], ...(readonly Recall[])[]])) + by;
  }
  const evenings = all.filter(
    (recalls) => recalls.length <= 2 && recalls[0] !== undefined && isEvening(recalls[0]),
  );
  if (roll < 5 && evenings.length > 0) {
    const recalls = pickOf(next, evenings as [readonly Recall[], ...(readonly Recall[])[]]);
    const first = recalls[0] as Recall & { offset: number };
    if (recalls.length === 2) {
      bump(coverage, 'at:a night recited twice');
      return Math.max(dueModel(recalls), morningOf(first) - pickOf(next, [1, HOUR, 3 * HOUR]));
    }
    const [name, by] = pickOf<readonly [string, number]>(next, [
      ['morning-1', -1],
      ['morning', 0],
      ['morning+1', 1],
      ['morning-1h', -HOUR],
      ['morning+2h', 2 * HOUR],
    ]);
    bump(coverage, `at:${name}`);
    return morningOf(first) + by;
  }
  if (roll < 6) {
    const by = pickOf(next, [-1, 0] as const);
    bump(coverage, `at:04:00${by === 0 ? '' : '-1'}`);
    return dayStartIn(zone, now) + by;
  }
  return now;
};

const gardenOf = (plants: ReadonlyMap<string, readonly Recall[]>): ReadGarden => ({
  _tag: 'Read',
  plants: new Map(
    [...plants].map(([reference, recalls]) => [
      reference,
      plantOf(recalls as [Recall, ...Recall[]]),
    ]),
  ),
});

const appPieces = (pieces: readonly ModelPiece[]): Piece[] => pieces.map((piece) => ({ ...piece }));

const offeredOf = (items: readonly Pick<Item, 'reference' | 'fresh'>[]) =>
  items.map((item) => `${item.fresh ? '+' : ''}${item.reference}`);

/** Counts what a case reaches of the spec's domain, from the model's plan and the case. */
const covered = (coverage: Coverage, built: Built, plan: ReturnType<typeof planModel>) => {
  const references = new Set(built.pieces.map((piece) => piece.reference));
  coverCase(coverage, built, references);
  for (const [reference, recalls] of built.plants)
    coverPlant(coverage, built.at, references.has(reference), recalls);
  coverAway(coverage, built);
  coverFresh(coverage, built, plan, references);
  coverPlan(coverage, plan);
};

/** A count's size: none, one, dozens (24 or more) or some. */
const sizeOf = (count: number) => {
  if (count === 0) return 'none';
  if (count === 1) return 'one';
  if (count >= 24) return 'dozens';
  return 'some';
};

/** The case's zone, length, sizes, groups, duplicates and tricky references. */
const coverCase = (coverage: Coverage, built: Built, references: ReadonlySet<string>) => {
  bump(coverage, `zone:${built.zone}`);
  bump(coverage, `minutes:${built.minutes}`);
  bump(coverage, `garden:${sizeOf(built.plants.size)}`);
  bump(coverage, `pieces:${sizeOf(built.pieces.length)}`);
  bump(coverage, `groups:${new Set(built.pieces.map((piece) => piece.group)).size}`);
  if (references.size < built.pieces.length) bump(coverage, 'pieces:duplicate');
  if (references.has('Isaiah 41:1') && references.has('Isaiah 41:10'))
    bump(coverage, 'tricky:prefix');
  if (references.has('Isaiah 41:10 ')) bump(coverage, 'tricky:space');
  if (references.has('Ésaïe 41:10')) bump(coverage, 'tricky:non-ascii');
  if (references.has('x/y 2:3')) bump(coverage, 'tricky:slash');
};

/** One plant's history: its grades, peeks, size, stage, a stray's due state, a recall after the instant. */
const coverPlant = (coverage: Coverage, at: number, named: boolean, recalls: readonly Recall[]) => {
  if (!named) bump(coverage, dueModel(recalls) <= at ? 'stray:due' : 'stray:not due');
  if (recalls.length >= 10) bump(coverage, 'recalls:dozen');
  for (const recall of recalls) {
    bump(coverage, `grade:${recall.grade}`);
    if (recall.peeked > 0) bump(coverage, 'peek');
    if (recall.startedAt > at) bump(coverage, 'recall after the instant');
  }
  if (referenceCard(recalls).stability >= 21) bump(coverage, 'full corn');
  if (recalls.length >= 3 && recalls.at(-1)?.grade === 1 && recalls.at(-2)?.grade === 3)
    bump(coverage, 'again after a run');
  coverEvening(coverage, at, recalls);
};

/** The evening rule's edges a plant reaches. */
const coverEvening = (coverage: Coverage, at: number, recalls: readonly Recall[]) => {
  const first = recalls[0] as Recall;
  if (recalls.length === 1 && first.offset === undefined && isEvening({ ...first, offset: 0 }))
    bump(coverage, 'evening:old record');
  if (recalls.length === 2 && isEvening(first)) bump(coverage, 'evening:two recalls');
  if (recalls.length === 2 && isEvening(first) && dueModel(recalls) <= at && at < morningOf(first))
    bump(coverage, 'evening:two recalls due before the morning');
  if (recalls.length !== 1 || first.offset === undefined) return;
  const local = (((first.startedAt + first.offset * MINUTE) % DAY) + DAY) % DAY;
  const edge = EDGES.get(local);
  if (edge !== undefined) bump(coverage, edge);
  if (local < 4 * HOUR) bump(coverage, 'evening:after midnight');
  if (isEvening(first) && referenceCard(recalls).due > morningOf(first))
    bump(coverage, 'evening:fsrs after the morning');
};

const EDGES = new Map([
  [18 * HOUR, 'evening:18:00:00.000'],
  [18 * HOUR - 1, 'day:17:59:59.999'],
  [4 * HOUR - 1, 'evening:03:59:59.999'],
  [4 * HOUR, 'day:04:00:00.000'],
]);

/** How long the reader was away: from the latest recall before the instant. */
const coverAway = (coverage: Coverage, built: Built) => {
  const starts = [...built.plants.values()]
    .flat()
    .map((recall) => recall.startedAt)
    .filter((t) => t <= built.at);
  if (starts.length === 0) return;
  const away = built.at - Math.max(...starts);
  const kind = [
    [HOUR, 'minutes'],
    [DAY, 'hours'],
    [28 * DAY, 'days'],
    [200 * DAY, 'month'],
  ].find(([bound]) => away < (bound as number))?.[1];
  bump(coverage, `away:${kind ?? 'year'}`);
};

/** The new piece: offered, held back (by a piece or a stray), every piece planted, not the first piece. */
const coverFresh = (
  coverage: Coverage,
  built: Built,
  plan: ReturnType<typeof planModel>,
  references: ReadonlySet<string>,
) => {
  bump(coverage, `fresh:${plan.fresh}`);
  const today = localDay(built.at, offsetIn(built.zone, built.at));
  if (plan.fresh === 'planted today') {
    const strayToday = [...built.plants].some(
      ([reference, recalls]) =>
        !references.has(reference) &&
        localDay((recalls[0] as Recall).startedAt, (recalls[0] as Recall).offset) === today,
    );
    bump(coverage, strayToday ? 'fresh:held by a stray' : 'fresh:held by a piece');
  }
  const fresh = plan.items.find((item) => item.fresh);
  if (fresh === undefined) return;
  if (built.pieces[0]?.reference !== fresh.reference) bump(coverage, 'fresh:not the first piece');
  if (plan.taken > 0) bump(coverage, 'fresh:last after reviews');
};

/** The cap and the order: binding, a pile, one review over, a misfit before a shorter one, ties, one group, mixing, a tail in due order. */
const coverPlan = (coverage: Coverage, plan: ReturnType<typeof planModel>) => {
  if (plan.due.length > plan.taken) bump(coverage, 'cap:binding');
  if (plan.due.length >= 20) bump(coverage, 'pile');
  const total = plan.items.reduce((sum, item) => sum + item.seconds, 0);
  if (total > plan.budget && plan.taken === 1) bump(coverage, 'overflow:one review');
  if (plan.shorterAfterMisfit) bump(coverage, 'misfit then a shorter');
  if (plan.items.some((item) => item.seconds >= 85)) bump(coverage, 'words:long in plan');
  const due = plan.due.slice(0, plan.taken);
  if (due.some((each, index) => index > 0 && due[index - 1]?.due === each.due))
    bump(coverage, 'tie');
  const reviews = plan.items.filter((item) => !item.fresh);
  const groupsTaken = new Set(reviews.map((item) => item.group)).size;
  if (reviews.length >= 2 && groupsTaken === 1) bump(coverage, 'mixed:one group');
  if (reviews.some((item, index) => item.reference !== due[index]?.reference))
    bump(coverage, 'mixed:reordered');
  if (groupsTaken >= 2 && reviews.length >= 3 && reviews.at(-1)?.group === reviews.at(-2)?.group)
    bump(coverage, 'mixed:tail in due order');
};

const FLOORS = {
  'garden:none': 10,
  'garden:one': 20,
  'garden:dozens': 20,
  'recalls:dozen': 20,
  'grade:1': 50,
  'grade:2': 50,
  'grade:4': 50,
  peek: 50,
  'full corn': 20,
  'again after a run': 10,
  'stray:due': 20,
  'stray:not due': 20,
  'recall after the instant': 20,
  'pieces:none': 10,
  'pieces:one': 20,
  'pieces:dozens': 40,
  'groups:1': 40,
  'groups:5': 30,
  'pieces:duplicate': 40,
  'tricky:prefix': 10,
  'tricky:space': 20,
  'tricky:non-ascii': 20,
  'tricky:slash': 20,
  'words:long in plan': 20,
  'overflow:one review': 5,
  'fresh:offered': 60,
  'fresh:planted today': 30,
  'fresh:all planted': 30,
  'fresh:held by a stray': 5,
  'fresh:held by a piece': 10,
  'fresh:not the first piece': 30,
  'fresh:last after reviews': 30,
  'evening:18:00:00.000': 5,
  'day:17:59:59.999': 5,
  'evening:03:59:59.999': 5,
  'day:04:00:00.000': 5,
  'evening:after midnight': 10,
  'evening:fsrs after the morning': 5,
  'evening:two recalls': 10,
  'evening:two recalls due before the morning': 5,
  'at:a night recited twice': 5,
  'evening:old record': 5,
  'evening:travel': 10,
  'at:morning-1': 5,
  'at:morning': 5,
  'at:morning+1': 5,
  'at:morning-1h': 5,
  'at:morning+2h': 5,
  'at:due-1': 5,
  'at:due': 5,
  'at:due+1': 5,
  'at:04:00-1': 5,
  'at:04:00': 5,
  'at:dst night': 10,
  'away:minutes': 10,
  'away:hours': 10,
  'away:days': 10,
  'away:month': 10,
  'away:year': 5,
  pile: 30,
  'minutes:2': 40,
  'minutes:5': 40,
  'minutes:10': 40,
  'minutes:20': 40,
  'cap:binding': 40,
  'misfit then a shorter': 20,
  tie: 10,
  'mixed:one group': 10,
  'mixed:reordered': 20,
  'mixed:tail in due order': 5,
  ...Object.fromEntries(ZONES.map((zone) => [`zone:${zone}`, 5])),
} satisfies Record<string, number>;

const CASES = 500;

describe('the daily plan', () => {
  it(`offers what the rule offers, in its order, over ${CASES} generated gardens, pieces, zones, instants and lengths`, () => {
    const next = random(0x5e55);
    const coverage: Coverage = new Map();
    const misses: string[] = [];
    for (let index = 0; index < CASES; index += 1) {
      const built = caseOf(next, coverage);
      const offset = offsetIn(built.zone, built.at);
      const garden = gardenOf(built.plants);
      const plan = planOf({
        garden,
        pieces: appPieces(built.pieces),
        at: built.at,
        offset,
        minutes: built.minutes,
      });
      const model = planModel({ ...built, offset });
      covered(coverage, built, model);
      if (JSON.stringify(offeredOf(plan.items)) !== JSON.stringify(offeredOf(model.items)))
        misses.push(
          `case ${index} (${built.zone}, ${new Date(built.at).toISOString()}, ${built.minutes} min): ${JSON.stringify(offeredOf(plan.items))} where the rule offers ${JSON.stringify(offeredOf(model.items))}`,
        );
      const total = plan.items.reduce((sum, item) => sum + item.seconds, 0);
      const reviews = plan.items.filter((item) => !item.fresh);
      if (total > built.minutes * 60 && reviews.length > 1)
        misses.push(`case ${index}: ${reviews.length} reviews over the budget`);
      for (const item of plan.items) {
        const recalls = built.plants.get(item.reference)?.length ?? 0;
        const piece = built.pieces.find((each) => each.reference === item.reference);
        if (item.recalls !== recalls || item.seconds !== estimate(piece?.words ?? -20))
          misses.push(
            `case ${index}: ${item.reference} carries ${item.recalls} recalls and ${item.seconds} s`,
          );
      }
    }
    for (const [key, floor] of Object.entries(FLOORS))
      if ((coverage.get(key) ?? 0) < floor)
        misses.push(`coverage ${key}: ${coverage.get(key) ?? 0} < ${floor}`);
    expect(misses.slice(0, 8)).toEqual([]);
  });

  it('never grows past the minutes after an absence: each next plan takes the oldest of the rest once the first are reviewed, over 60 piles', () => {
    const next = random(0x9113);
    const misses: string[] = [];
    let drained = 0;
    for (let index = 0; index < 60; index += 1) {
      const zone = pickOf(next, ZONES);
      const at = Date.UTC(2026, 0, 1) + below(next, 365) * DAY + below(next, DAY);
      const offset = offsetIn(zone, at);
      const pieces: ModelPiece[] = Array.from({ length: 25 + below(next, 41) }, (_, k) => ({
        reference: `Pile ${k}:1`,
        words: 1 + below(next, 90),
        group: GROUPS[below(next, 5)] ?? GROUPS[0],
      }));
      let plants = new Map<string, readonly Recall[]>(
        pieces.map((piece) => [
          piece.reference,
          historyOf(
            next,
            new Map(),
            piece.reference,
            at - (30 + below(next, 400)) * DAY,
            zone,
            'many',
          ),
        ]),
      );
      const minutes = pickOf(next, [...MINUTES] as [Minutes, ...Minutes[]]);
      const first = planModel({ plants, pieces, at, offset, minutes });
      let leftover = first.due.map((item) => item.reference);
      for (let round = 0, now = at; round < 4 && leftover.length > 0; round += 1) {
        const plan = planOf({
          garden: gardenOf(plants),
          pieces,
          at: now,
          offset: offsetIn(zone, now),
          minutes,
        });
        const taken = plan.items.filter((item) => !item.fresh).map((item) => item.reference);
        const total = plan.items.reduce((sum, item) => sum + item.seconds, 0);
        if (taken.length === 0 || (total > minutes * 60 && taken.length > 1))
          misses.push(
            `pile ${index} round ${round}: ${taken.length} reviews, ${total} s of ${minutes * 60}`,
          );
        if (
          JSON.stringify(taken.toSorted()) !==
          JSON.stringify(leftover.slice(0, taken.length).toSorted())
        )
          misses.push(
            `pile ${index} round ${round}: took ${JSON.stringify(taken)} before the oldest ${JSON.stringify(leftover.slice(0, taken.length))}`,
          );
        plants = new Map(plants);
        for (const reference of taken)
          plants.set(reference, [
            ...(plants.get(reference) ?? []),
            recallOf(reference, now, 3, offsetIn(zone, now)),
          ]);
        leftover = leftover.filter((reference) => !taken.includes(reference));
        now += 1;
        if (round > 0) drained += 1;
      }
    }
    expect(misses.slice(0, 8)).toEqual([]);
    expect(drained).toBeGreaterThan(30);
  });

  it('holds an evening planting to the 04:00 that ends its day, by its own offset: 21:00 and 02:00 in New York, 18:00 in Kolkata, 14:00 in Tokyo', () => {
    const pieces: Piece[] = [{ reference: 'A 1:1', words: 37, group: 'A' }];
    const planAt = (recall: Recall, at: number, zone: string) =>
      offeredOf(
        planOf({
          garden: gardenOf(new Map([[recall.reference, [recall]]])),
          pieces,
          at,
          offset: offsetIn(zone, at),
          minutes: 5,
        }).items,
      );
    const nineNY = Date.UTC(2026, 0, 15, 2);
    const ny = recallOf('A 1:1', nineNY, 3, -300);
    expect(planAt(ny, Date.UTC(2026, 0, 15, 8, 59, 59, 999), 'America/New_York')).toEqual([]);
    expect(planAt(ny, Date.UTC(2026, 0, 15, 9), 'America/New_York')).toEqual(['A 1:1']);
    expect(planAt(ny, Date.UTC(2026, 0, 15, 9), 'Asia/Tokyo')).toEqual(['A 1:1']);
    const twoNY = recallOf('A 1:1', Date.UTC(2026, 0, 15, 7), 3, -300);
    expect(planAt(twoNY, Date.UTC(2026, 0, 15, 8, 59, 59, 999), 'America/New_York')).toEqual([]);
    expect(planAt(twoNY, Date.UTC(2026, 0, 15, 9), 'America/New_York')).toEqual(['A 1:1']);
    const sixKolkata = recallOf('A 1:1', Date.UTC(2026, 0, 15, 12, 30), 3, 330);
    expect(planAt(sixKolkata, Date.UTC(2026, 0, 15, 22, 29, 59, 999), 'Asia/Kolkata')).toEqual([]);
    expect(planAt(sixKolkata, Date.UTC(2026, 0, 15, 22, 30), 'Asia/Kolkata')).toEqual(['A 1:1']);
    const twoTokyo = recallOf('A 1:1', Date.UTC(2026, 0, 15, 5), 3, 540);
    expect(planAt(twoTokyo, Date.UTC(2026, 0, 15, 5, 30), 'Asia/Tokyo')).toEqual(['A 1:1']);
    const oldEvening = recallOf('A 1:1', Date.UTC(2026, 0, 15, 22), 3, undefined);
    expect(planAt(oldEvening, Date.UTC(2026, 0, 15, 22, 30), 'UTC')).toEqual(['A 1:1']);
  });

  it('stops at the first review that does not fit, takes the first though it does not, reserves the new piece and puts it last', () => {
    const at = Date.UTC(2026, 5, 1, 12);
    const plants = new Map<string, readonly Recall[]>([
      ['B 1:1', [recallOf('B 1:1', at - 9 * DAY, 3, 0)]],
      ['B 1:2', [recallOf('B 1:2', at - 8 * DAY, 3, 0)]],
      ['B 1:3', [recallOf('B 1:3', at - 7 * DAY, 3, 0)]],
    ]);
    const planFor = (pieces: Piece[], minutes: Minutes) =>
      offeredOf(planOf({ garden: gardenOf(plants), pieces, at, offset: 0, minutes }).items);
    expect(
      planFor(
        [
          { reference: 'B 1:1', words: 100, group: 'B' },
          { reference: 'B 1:2', words: 120, group: 'B' },
          { reference: 'B 1:3', words: 2, group: 'B' },
        ],
        2,
      ),
    ).toEqual(['B 1:1']);
    expect(
      planFor(
        [
          { reference: 'B 1:1', words: 400, group: 'B' },
          { reference: 'B 1:2', words: 2, group: 'B' },
        ],
        2,
      ),
    ).toEqual(['B 1:1']);
    expect(
      planFor(
        [
          { reference: 'N 1:1', words: 180, group: 'N' },
          { reference: 'B 1:1', words: 20, group: 'B' },
          { reference: 'B 1:2', words: 20, group: 'B' },
        ],
        2,
      ),
    ).toEqual(['B 1:1', '+N 1:1']);
    expect(
      planFor(
        [
          { reference: 'B 1:1', words: 2, group: 'B' },
          { reference: 'B 1:2', words: 2, group: 'B' },
          { reference: 'B 1:3', words: 2, group: 'C' },
        ],
        5,
      ),
    ).toEqual(['B 1:1', 'B 1:3', 'B 1:2']);
  });
});

describe('the counts line', () => {
  it('reads the items not done as the rule words them, minutes rounded up, over 400 generated plans', () => {
    const next = random(0xc0de);
    const misses: string[] = [];
    const seen = new Set<string>();
    for (let index = 0; index < 400; index += 1) {
      const items: Item[] = [];
      const now = new Map<string, number>();
      for (let k = below(next, 12); k > 0; k -= 1) {
        const reference = `C ${index}:${k}`;
        const recalls = 1 + below(next, 6);
        const words = chance(next, 0.15) ? 150 + below(next, 251) : 1 + below(next, 90);
        items.push({ reference, fresh: false, recalls, seconds: estimate(words) });
        now.set(reference, recalls + (chance(next, 0.3) ? 1 + below(next, 2) : 0));
      }
      if (chance(next, 0.5)) {
        const reference = `N ${index}:1`;
        items.push({ reference, fresh: true, recalls: 0, seconds: estimate(1 + below(next, 400)) });
        if (chance(next, 0.3)) now.set(reference, 1);
      }
      const plants = new Map<string, readonly Recall[]>();
      for (const [reference, count] of now)
        plants.set(
          reference,
          Array.from({ length: count }, (_, k) =>
            recallOf(reference, Date.UTC(2026, 0, 1) + k * DAY, 3, 0),
          ),
        );
      const line = countsOf({ items }, gardenOf(plants));
      const want = countsModel(items, (reference) => now.get(reference) ?? 0);
      seen.add(want.replace(/\d+(?! new)/g, 'n'));
      if (line !== want) misses.push(`plan ${index}: "${line}" where the rule reads "${want}"`);
    }
    expect(misses.slice(0, 8)).toEqual([]);
    expect([...seen].toSorted()).toEqual([
      '1 new · about n min',
      'Nothing to tend now',
      'n to tend · 1 new · about n min',
      'n to tend · about n min',
    ]);
  });

  it('rounds a part minute up: 61 s is about 2 min, 60 s about 1, and a done item leaves the line', () => {
    const items: Item[] = [
      { reference: 'D 1:1', fresh: false, recalls: 1, seconds: 30.5 },
      { reference: 'D 1:2', fresh: false, recalls: 2, seconds: 30.5 },
      { reference: 'N 1:1', fresh: true, recalls: 0, seconds: 29.5 },
    ];
    const garden = (counts: Record<string, number>) =>
      gardenOf(
        new Map(
          Object.entries(counts).map(([reference, count]) => [
            reference,
            Array.from({ length: count }, (_, k) =>
              recallOf(reference, Date.UTC(2026, 0, 1) + k * DAY, 3, 0),
            ),
          ]),
        ),
      );
    expect(countsOf({ items }, garden({ 'D 1:1': 1, 'D 1:2': 2 }))).toBe(
      '2 to tend · 1 new · about 2 min',
    );
    expect(countsOf({ items: items.slice(0, 2) }, garden({ 'D 1:1': 1, 'D 1:2': 2 }))).toBe(
      '2 to tend · about 2 min',
    );
    expect(countsOf({ items: items.slice(1) }, garden({ 'D 1:2': 2 }))).toBe(
      '1 to tend · 1 new · about 1 min',
    );
    expect(countsOf({ items }, garden({ 'D 1:1': 2, 'D 1:2': 2 }))).toBe(
      '1 to tend · 1 new · about 1 min',
    );
    expect(countsOf({ items }, garden({ 'D 1:1': 2, 'D 1:2': 3 }))).toBe('1 new · about 1 min');
    expect(countsOf({ items }, garden({ 'D 1:1': 2, 'D 1:2': 3, 'N 1:1': 1 }))).toBe(
      'Nothing to tend now',
    );
  });
});
