/* oxlint-disable effect/noGlobals -- the property compares two cards by their JSON text first, so the 14,400 comparisons that agree cost no matcher call. */

/**
 * The app's FSRS-6 against ts-fsrs 5.4.2, the reference whose FSRS-6 oracle
 * values Selah's swift-fsrs carries: the parameters, Selah's fixed cases,
 * the steps a learning card moves through, elapsed days counted in UTC
 * calendar days, and generated histories over every grade, where each next
 * card must equal the reference's on every field, to the bit.
 */

import { describe, expect, it } from 'bun:test';
import { default_w, generatorParameters } from 'ts-fsrs';

import { elapsedDays, NEW_CARD, PARAMETERS, review, type Card, type Grade } from './fsrs';
import {
  asCard,
  below,
  DAY,
  emptyReference,
  MINUTE,
  random,
  referenceNext,
} from './test/garden-model';

const GRADES: readonly Grade[] = [1, 2, 3, 4];

const START = Date.UTC(2022, 11, 29, 12, 30);

/** A card after `grades`, each given when the card before it fell due. */
const atDue = (grades: readonly Grade[]) =>
  grades.reduce<{ readonly at: number; readonly card: Card; readonly cards: readonly Card[] }>(
    (state, grade) => {
      const card = review(state.card, grade, state.at);
      return { at: card.due, card, cards: [...state.cards, card] };
    },
    { at: START, card: NEW_CARD, cards: [] },
  ).cards;

/** The wait before the next review: at the due time, minutes, hours, days or up to 400 days, from any time of day. */
const gapOf = (next: () => number, card: Card, now: number) => {
  const kind = next();
  if (kind < 0.25) return Math.max(0, card.due - now);
  if (kind < 0.45) return below(next, 30) * MINUTE;
  if (kind < 0.6) return below(next, 20) * 60 * MINUTE;
  if (kind < 0.9) return below(next, 60) * DAY + below(next, DAY);
  return below(next, 400) * DAY;
};

describe('FSRS-6', () => {
  it('takes FSRS-6’s weights as Selah pins them, 90% retention, 36,500 days at most, steps of 1 and 10 minutes and a relearning step of 10, as ts-fsrs’s defaults are', () => {
    expect([...default_w]).toEqual([...PARAMETERS.w]);
    const defaults = generatorParameters({ enable_fuzz: false });
    expect(defaults.request_retention).toBe(PARAMETERS.retention);
    expect(defaults.maximum_interval).toBe(PARAMETERS.maximumInterval);
    expect(PARAMETERS.learningSteps.map((step) => `${step}m`)).toEqual([
      ...defaults.learning_steps,
    ]);
    expect(PARAMETERS.relearningSteps.map((step) => `${step}m`)).toEqual([
      ...defaults.relearning_steps,
    ]);
    expect(defaults.enable_short_term).toBe(true);
  });

  it('gives Selah’s fixed cases: the first review of each grade, an interval history and a memory state', () => {
    const first = GRADES.map((grade) => review(NEW_CARD, grade, START));
    expect(first.map((card) => card.stability)).toEqual([0.212, 1.2931, 2.3065, 8.2956]);
    expect(first.map((card) => card.difficulty)).toEqual([6.4133, 5.11217071, 2.11810397, 1]);
    expect(first.map((card) => card.scheduledDays)).toEqual([0, 0, 0, 8]);
    expect(first.map((card) => card.state)).toEqual(['learning', 'learning', 'learning', 'review']);
    expect(
      atDue([3, 3, 3, 3, 3, 3, 1, 1, 3, 3, 3, 3, 3]).map((card) => card.scheduledDays),
    ).toEqual([0, 2, 11, 46, 163, 498, 0, 0, 2, 4, 7, 12, 21]);
    const gaps = [0, 0, 1, 3, 8, 21];
    const memory = ([1, 3, 3, 3, 3, 3] as const).reduce(
      (state, grade, index) => {
        const at = state.at + (gaps[index] ?? 0) * DAY;
        return { at, card: review(state.card, grade, at) };
      },
      { at: START, card: NEW_CARD },
    ).card;
    expect(memory.stability).toBeCloseTo(53.62691, 4);
    expect(memory.difficulty).toBeCloseTo(6.3574867, 4);
  });

  it('moves a learning card through its steps: Again to 1 minute, Hard to 6 (the mean of 1 and 10), Good to 10, and a lapse to 10 counted once', () => {
    const waits = GRADES.map((grade) => (review(NEW_CARD, grade, START).due - START) / MINUTE);
    expect(waits).toEqual([1, 6, 10, 8 * 1440]);
    const learning = review(NEW_CARD, 3, START);
    expect(learning.learningSteps).toBe(1);
    expect((review(learning, 2, learning.due).due - learning.due) / MINUTE).toBe(6);
    const graduated = review(learning, 3, learning.due);
    expect([graduated.state, graduated.learningSteps]).toEqual(['review', 0]);
    const lapsed = review(graduated, 1, graduated.due);
    expect([lapsed.state, lapsed.lapses, (lapsed.due - graduated.due) / MINUTE]).toEqual([
      'relearning',
      1,
      10,
    ]);
  });

  it('counts elapsed days in UTC calendar days, not 24-hour spans', () => {
    const late = Date.UTC(2026, 0, 1, 23, 50);
    expect(elapsedDays(late, late + 20 * MINUTE)).toBe(1);
    expect(elapsedDays(Date.UTC(2026, 0, 1, 0, 10), Date.UTC(2026, 0, 1, 23, 50))).toBe(0);
    const card = review(review(NEW_CARD, 3, late), 3, late + 10 * MINUTE);
    expect(review(card, 3, late + 20 * MINUTE)).toEqual(
      asCard(
        [late, late + 10 * MINUTE, late + 20 * MINUTE].reduce(
          (reference, at) => referenceNext(reference, 3, at),
          emptyReference(),
        ),
      ),
    );
  });

  it('equals ts-fsrs on every field of every next card, all four grades at each step of 120 generated histories of 30 reviews', () => {
    const states = new Set<string>();
    let compared = 0;
    for (let seed = 1; seed <= 120; seed += 1) {
      const next = random(seed);
      let card = NEW_CARD;
      let referenceCard = emptyReference();
      let now = Date.UTC(2026, 0, 1) + below(next, DAY);
      for (let step = 0; step < 30; step += 1) {
        for (const grade of GRADES) {
          const ours = review(card, grade, now);
          const theirs = asCard(referenceNext(referenceCard, grade, now));
          if (JSON.stringify(ours) !== JSON.stringify(theirs))
            expect({ seed, step, grade, card: ours }).toEqual({ seed, step, grade, card: theirs });
          compared += 1;
        }
        const grade = GRADES[below(next, 4)] ?? 3;
        card = review(card, grade, now);
        referenceCard = referenceNext(referenceCard, grade, now);
        states.add(card.state);
        now += gapOf(next, card, now);
      }
    }
    expect(compared).toBe(120 * 30 * 4);
    expect([...states].toSorted()).toEqual(['learning', 'relearning', 'review']);
  });
});
