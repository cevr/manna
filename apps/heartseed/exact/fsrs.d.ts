/** One of FSRS's four answers: Again, Hard, Good, Easy. */
export type Grade = 1 | 2 | 3 | 4;

/** Where a card stands in FSRS's states. */
export type CardState = 'new' | 'learning' | 'review' | 'relearning';

/** The scheduler's memory of a verse: `due` and `lastReview` are epoch milliseconds, the rest FSRS's own numbers. */
export interface Card {
  readonly due: number;
  readonly stability: number;
  readonly difficulty: number;
  readonly scheduledDays: number;
  readonly learningSteps: number;
  readonly reps: number;
  readonly lapses: number;
  readonly state: CardState;
  readonly lastReview: number;
}

/** The card after one more review of `card` under `grade` at `at`, pure. */
export declare const review: (card: Card, grade: Grade, at: number) => Card;
