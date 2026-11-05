/* oxlint-disable effect/noNullish, effect/noGlobals -- the model writes the spec's rules out as plain branches over undefined, apart from the garden's Option code, so the two cannot share a mistake; ts-fsrs takes and answers its times as Dates. */

/**
 * The garden's rules written plainly from the hsgrow spec, over ts-fsrs
 * 5.4.2 (the FSRS-6 reference Selah's swift-fsrs carries the oracle values
 * of), so the app's own scheduler is never its own oracle:
 *
 * - `referenceCard`: ts-fsrs's card after a verse's recalls in time order,
 *   in the app's card shape;
 * - `stageRule` and `growthRule`: the stage and growth rules over that card;
 * - `GardenModel`: the records the device holds (one per recital, the last
 *   write that landed wins), what a launch knows of them (all of them once
 *   its read completed, nothing when it failed), and the chimes it sounds
 *   (once per recital in a launch, at its first landed keep that grows the
 *   verse, and only in a launch that read the store; planting never).
 *
 * It also holds the seeded generator the garden's tests share.
 */

import {
  createEmptyCard,
  fsrs,
  type Card as ReferenceCard,
  type Grade as ReferenceGrade,
} from 'ts-fsrs';

import type { Card, CardState, Grade } from '../fsrs';
import type { Recall } from '../sayit';

/** A seeded generator of numbers in [0, 1). */
export const random = (seed: number) => {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
};

export const below = (next: () => number, n: number) => Math.floor(next() * n);

export const pickOf = <A>(next: () => number, list: readonly [A, ...A[]]): A =>
  list[below(next, list.length)] ?? list[0];

export const MINUTE = 60_000;
export const DAY = 86_400_000;

const STATES: readonly CardState[] = ['new', 'learning', 'review', 'relearning'];

/** ts-fsrs's scheduler as Selah configures FSRS-6: the defaults, no fuzz. */
export const reference = fsrs({ enable_fuzz: false });

/** ts-fsrs's empty card. */
export const emptyReference = (): ReferenceCard => createEmptyCard(new Date(0));

const grades: Readonly<Record<Grade, ReferenceGrade>> = { 1: 1, 2: 2, 3: 3, 4: 4 };

/** ts-fsrs's card after `grade` at `at`. */
export const referenceNext = (card: ReferenceCard, grade: Grade, at: number): ReferenceCard =>
  reference.next(card, new Date(at), grades[grade]).card;

/** A ts-fsrs card in the app's shape, its last review 0 when it has none. */
export const asCard = (card: ReferenceCard): Card => ({
  due: card.due.getTime(),
  stability: card.stability,
  difficulty: card.difficulty,
  scheduledDays: card.scheduled_days,
  learningSteps: card.learning_steps,
  reps: card.reps,
  lapses: card.lapses,
  state: STATES[card.state] ?? 'new',
  lastReview: card.last_review?.getTime() ?? 0,
});

/** A verse's recalls in time order. */
export const inOrder = (recalls: readonly Recall[]) =>
  recalls.toSorted((a, b) => a.startedAt - b.startedAt);

/** ts-fsrs's card after a verse's recalls in time order, each graded at its start. */
export const referenceCard = (recalls: readonly Recall[]): Card =>
  asCard(
    inOrder(recalls).reduce(
      (card, recall) => referenceNext(card, recall.grade, recall.startedAt),
      emptyReference(),
    ),
  );

export type ModelStage = 'seed' | 'blade' | 'ear' | 'full corn';

const RANK: Readonly<Record<ModelStage, number>> = { seed: 0, blade: 1, ear: 2, 'full corn': 3 };

/**
 * The stage rule: full corn at a stability of 21 days or more; else a seed
 * when the verse was just planted or its last recall was Again; else a
 * blade when the last recall was helped by a peek; else an ear.
 */
export const stageRule = (recalls: readonly Recall[], stability: number): ModelStage => {
  const ordered = inOrder(recalls);
  const last = ordered.at(-1);
  if (stability >= 21) return 'full corn';
  if (last === undefined || ordered.length === 1 || last.grade === 1) return 'seed';
  if (last.peeked > 0) return 'blade';
  return 'ear';
};

/** The stage of a verse's recalls by the rule, over ts-fsrs's card. */
export const referenceStage = (recalls: readonly Recall[]) =>
  stageRule(recalls, referenceCard(recalls).stability);

export interface ModelGrowth {
  readonly reference: string;
  readonly startedAt: number;
  readonly from: ModelStage;
  readonly to: ModelStage;
}

/** The recital at `startedAt` grew its verse when there were recalls before it and its stage over the recalls up to it ranks above the stage before. */
export const growthRule = (
  recalls: readonly Recall[],
  startedAt: number,
): ModelGrowth | undefined => {
  const before = recalls.filter((recall) => recall.startedAt < startedAt);
  const upTo = recalls.filter((recall) => recall.startedAt <= startedAt);
  const recital = recalls.find((recall) => recall.startedAt === startedAt);
  if (before.length === 0 || recital === undefined) return undefined;
  const from = referenceStage(before);
  const to = referenceStage(upTo);
  if (RANK[to] <= RANK[from]) return undefined;
  return { reference: recital.reference, startedAt, from, to };
};

export const PREFIX = 'heartseed/recall/';

export const keyOf = (recall: Pick<Recall, 'reference' | 'startedAt'>) =>
  `${PREFIX}${recall.reference}/${recall.startedAt}`;

/** The garden as the spec states it: the records the device holds, whether this launch read them, and the chimes sounded. */
export class GardenModel {
  readonly records = new Map<string, Recall>();
  readonly chimes: ModelGrowth[] = [];
  private sounded = new Set<string>();
  /** Whether this launch's read of the store completed; an unread launch knows no history to grow from. */
  read = true;

  recallsOf(reference: string) {
    return inOrder([...this.records.values()].filter((recall) => recall.reference === reference));
  }

  references() {
    return [...new Set([...this.records.values()].map((recall) => recall.reference))].toSorted();
  }

  /** A keep of `recall`, whose write the device took when `landed`; a write it refused changes nothing. */
  keep(recall: Recall, landed = true) {
    if (!landed) return;
    const key = keyOf(recall);
    this.records.set(key, recall);
    if (!this.read || this.sounded.has(key)) return;
    const growth = growthRule(this.recallsOf(recall.reference), recall.startedAt);
    if (growth === undefined) return;
    this.sounded.add(key);
    this.chimes.push(growth);
  }

  /** A new launch, whose read of the store completed or, when `read` is false, failed. */
  restart(read = true) {
    this.sounded = new Set();
    this.read = read;
  }
}
