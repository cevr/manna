/**
 * FSRS-6, the scheduler Selah uses today: the published default weights,
 * 90% retention, learning steps of 1 and 10 minutes, one relearning step of
 * 10 minutes, short-term stability on, no interval fuzz, intervals of at
 * most 36,500 days. It is ts-fsrs 5.4.2's basic scheduler, the reference
 * whose oracle values Selah's swift-fsrs carries, rounded to 8 places at the
 * same steps, so a card here is that scheduler's card to the bit.
 *
 * `review` takes a card, a grade and the review's time (milliseconds since
 * the epoch) and answers the next card. It is pure: a card is the fold of
 * its reviews in time order. Elapsed days are UTC calendar days between two
 * reviews, as the reference counts them. A grade is one of FSRS's four:
 * Again, Hard, Good and Easy.
 */
export type Grade = 1 | 2 | 3 | 4;

export type CardState = 'new' | 'learning' | 'review' | 'relearning';

/** A verse's memory as FSRS holds it, and when it is next due. */
export interface Card {
  /** When the card is next due, in epoch milliseconds. */
  readonly due: number;
  readonly stability: number;
  readonly difficulty: number;
  readonly scheduledDays: number;
  /** The learning or relearning step the card stands at. */
  readonly learningSteps: number;
  readonly reps: number;
  readonly lapses: number;
  readonly state: CardState;
  /** The last review's time, in epoch milliseconds (0 before the first). */
  readonly lastReview: number;
}

/** FSRS-6's weights as Selah pins them, the retention asked for, the longest interval in days, and the steps in minutes. */
export const PARAMETERS = {
  w: [
    0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 0.001, 1.8722, 0.1666, 0.796, 1.4835,
    0.0614, 0.2629, 1.6483, 0.6014, 1.8729, 0.5425, 0.0912, 0.0658, 0.1542,
  ],
  retention: 0.9,
  maximumInterval: 36500,
  learningSteps: [1, 10],
  relearningSteps: [10],
} as const;

/** A card never reviewed. */
export const NEW_CARD: Card = {
  due: 0,
  stability: 0,
  difficulty: 0,
  scheduledDays: 0,
  learningSteps: 0,
  reps: 0,
  lapses: 0,
  state: 'new',
  lastReview: 0,
};

const MINUTE = 60_000;
const MINUTES_A_DAY = 1440;
const DAY = MINUTES_A_DAY * MINUTE;
const STABILITY_MIN = 0.001;
const STABILITY_MAX = 36500;

/** A weight by its index. */
const weight = (index: number) => PARAMETERS.w[index] ?? 0;

const round8 = (x: number) => Math.round(x * 1e8) / 1e8;

const clamp = (x: number, low: number, high: number) => Math.min(Math.max(x, low), high);

const DECAY = -weight(20);
const FACTOR = round8(Math.exp(Math.pow(DECAY, -1) * Math.log(0.9)) - 1);
const INTERVAL_MODIFIER = round8((Math.pow(PARAMETERS.retention, 1 / DECAY) - 1) / FACTOR);

/** How a recall grade scales a recall's stability gain: Hard's penalty and Easy's bonus. */
const RECALL_FACTOR: Readonly<Record<Grade, number>> = { 1: 1, 2: weight(15), 3: 1, 4: weight(16) };

/** UTC calendar days from one time to another. */
export const elapsedDays = (from: number, to: number) =>
  Math.floor(to / DAY) - Math.floor(from / DAY);

/** The chance of recall `days` after a review at stability `stability`. */
const retrievability = (days: number, stability: number) =>
  round8(Math.pow(1 + (FACTOR * days) / stability, DECAY));

const initialDifficulty = (grade: Grade) =>
  round8(weight(4) - Math.exp((grade - 1) * weight(5)) + 1);

const initialStability = (grade: Grade) => Math.max(weight(grade - 1), 0.1);

const nextDifficulty = (difficulty: number, grade: Grade) => {
  const damped = round8((-weight(6) * (grade - 3) * (10 - difficulty)) / 9);
  const reverted = round8(
    weight(7) * initialDifficulty(4) + (1 - weight(7)) * (difficulty + damped),
  );
  return clamp(reverted, 1, 10);
};

const recallStability = (difficulty: number, stability: number, recall: number, grade: Grade) =>
  round8(
    clamp(
      stability *
        (1 +
          Math.exp(weight(8)) *
            (11 - difficulty) *
            Math.pow(stability, -weight(9)) *
            (Math.exp((1 - recall) * weight(10)) - 1) *
            RECALL_FACTOR[grade]),
      STABILITY_MIN,
      STABILITY_MAX,
    ),
  );

const forgetStability = (difficulty: number, stability: number, recall: number) =>
  round8(
    clamp(
      weight(11) *
        Math.pow(difficulty, -weight(12)) *
        (Math.pow(stability + 1, weight(13)) - 1) *
        Math.exp((1 - recall) * weight(14)),
      STABILITY_MIN,
      STABILITY_MAX,
    ),
  );

/** The stability after a review on the same day as the last: a gain that never falls below 1 for Hard and up. */
const shortTermStability = (stability: number, grade: Grade) => {
  const gain = Math.pow(stability, -weight(19)) * Math.exp(weight(17) * (grade - 3 + weight(18)));
  if (grade === 1) return round8(clamp(stability * gain, STABILITY_MIN, STABILITY_MAX));
  return round8(clamp(stability * Math.max(gain, 1), STABILITY_MIN, STABILITY_MAX));
};

/** The stability a reviewed card takes after `days`, by its grade. */
const nextStability = (card: Card, days: number, grade: Grade) => {
  if (days === 0) return shortTermStability(card.stability, grade);
  const recall = retrievability(days, card.stability);
  if (grade === 1) {
    const floor = round8(card.stability / Math.exp(weight(17) * weight(18)));
    return clamp(floor, STABILITY_MIN, forgetStability(card.difficulty, card.stability, recall));
  }
  return recallStability(card.difficulty, card.stability, recall, grade);
};

/** The difficulty and stability after `grade`, `days` after the last review. */
const memoryAfter = (card: Card, days: number, grade: Grade) => {
  if (card.difficulty === 0 && card.stability === 0)
    return {
      difficulty: clamp(initialDifficulty(grade), 1, 10),
      stability: initialStability(grade),
    };
  return {
    difficulty: nextDifficulty(card.difficulty, grade),
    stability: nextStability(card, days, grade),
  };
};

/** The interval, in days, a stability schedules. */
const intervalOf = (stability: number) =>
  Math.min(Math.max(1, Math.round(stability * INTERVAL_MODIFIER)), PARAMETERS.maximumInterval);

/** A learning step's wait in minutes (0 when the grade leaves the steps) and the step it moves to. */
interface Step {
  readonly minutes: number;
  readonly next: number;
}

const NO_STEP: Step = { minutes: 0, next: 0 };

/** Hard's wait: half again the first step, or the mean of the first two. */
const hardMinutes = (steps: readonly number[]) => {
  const first = steps[0] ?? 0;
  if (steps.length === 1) return Math.round(first * 1.5);
  return Math.round((first + (steps[1] ?? 0)) / 2);
};

/** The steps a state's card moves through: a review or relearning card the relearning steps, any other the learning steps. */
const stepsOf = (state: CardState): readonly number[] => {
  if (state === 'relearning' || state === 'review') return PARAMETERS.relearningSteps;
  return PARAMETERS.learningSteps;
};

/** The step `grade` takes a card at `step` of its state's steps to: a review uses the relearning steps, and only Again enters them. */
const stepOf = (state: CardState, step: number, grade: Grade): Step => {
  const steps = stepsOf(state);
  if (steps.length === 0 || step >= steps.length) return NO_STEP;
  if (state === 'review') {
    if (grade !== 1) return NO_STEP;
    return { minutes: steps[Math.max(0, step)] ?? 0, next: 0 };
  }
  if (grade === 1) return { minutes: steps[0] ?? 0, next: 0 };
  if (grade === 2) return { minutes: hardMinutes(steps), next: step };
  const after = steps[step + 1] ?? 0;
  if (grade === 3 && after > 0) return { minutes: Math.round(after), next: step + 1 };
  return NO_STEP;
};

/** Schedules `next` by the steps of the card it came from: a wait of minutes keeps it in `state`, a wait of a day or more, or none, makes it a review. */
const scheduled = (card: Card, next: Card, grade: Grade, state: CardState, at: number): Card => {
  const step = stepOf(card.state, card.learningSteps, grade);
  const minutes = Math.max(0, step.minutes);
  const nextStep = Math.max(0, step.next);
  if (minutes > 0 && minutes < MINUTES_A_DAY)
    return {
      ...next,
      learningSteps: nextStep,
      scheduledDays: 0,
      state,
      due: at + Math.round(minutes) * MINUTE,
    };
  if (minutes >= MINUTES_A_DAY)
    return {
      ...next,
      state: 'review',
      learningSteps: nextStep,
      due: at + Math.round(minutes) * MINUTE,
      scheduledDays: Math.floor(minutes / MINUTES_A_DAY),
    };
  const days = intervalOf(next.stability);
  return { ...next, state: 'review', learningSteps: 0, scheduledDays: days, due: at + days * DAY };
};

/** A review card's Hard, Good and Easy intervals: Hard never past Good, Easy always past it. */
const reviewIntervals = (hard: Card, good: Card, easy: Card): Readonly<Record<Grade, number>> => {
  const goodRaw = intervalOf(good.stability);
  const hardDays = Math.min(intervalOf(hard.stability), goodRaw);
  const goodDays = Math.max(goodRaw, hardDays + 1);
  const easyDays = Math.max(intervalOf(easy.stability), goodDays + 1);
  return { 1: 0, 2: hardDays, 3: goodDays, 4: easyDays };
};

/** The UTC days from a card's last review to `at`: none for a new card. */
const daysSince = (card: Card, at: number) => {
  if (card.state === 'new') return 0;
  return elapsedDays(card.lastReview, at);
};

/** The card after `grade`, given at `at` (epoch milliseconds). */
export const review = (card: Card, grade: Grade, at: number): Card => {
  const days = daysSince(card, at);
  const reviewed: Card = { ...card, lastReview: at, reps: card.reps + 1 };
  const after = (g: Grade): Card => ({ ...reviewed, ...memoryAfter(card, days, g) });
  switch (card.state) {
    case 'new':
      return scheduled(card, after(grade), grade, 'learning', at);
    case 'learning':
    case 'relearning':
      return scheduled(card, after(grade), grade, card.state, at);
    case 'review': {
      if (grade === 1) {
        const lapsed = scheduled(card, after(1), 1, 'relearning', at);
        return { ...lapsed, lapses: lapsed.lapses + 1 };
      }
      const intervals = reviewIntervals(after(2), after(3), after(4));
      const scheduledDays = intervals[grade];
      return {
        ...after(grade),
        state: 'review',
        learningSteps: 0,
        scheduledDays,
        due: at + scheduledDays * DAY,
      };
    }
  }
};
