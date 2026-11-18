/**
 * Today's stage line (`stageShown`): an unread garden claims no stage, a
 * verse with no plant reads not planted, a planted one its stage by the
 * current Heartseed's `stageOf`, and Show all's step back is laid over it,
 * as the current Today's `Growing` draws it over `pendingIn`.
 */

import { describe, expect, it } from 'bun:test';
import { review, type Card } from '@manna/heartseed/fsrs';
import { stageOf, type Plant, type ReadGarden } from '@manna/heartseed/garden';
import { Option } from 'effect';

import { stageShown } from './sources';

const DAY = 86_400_000;
const START = Date.UTC(2026, 9, 1, 9);
const NEW_CARD: Card = {
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

/** A plant of `reference` said Good on each of `days` (days after `START`). */
const plantOf = (reference: string, days: readonly [number, ...number[]]): Plant => {
  const said = (day: number) => ({
    reference,
    startedAt: START + day * DAY,
    offset: 0,
    grade: 3 as const,
    suggested: 3 as const,
    words: 12,
    missed: 0,
    peeked: 0,
    extra: 0,
  });
  const [first, ...rest] = days;
  const recalls = [said(first), ...rest.map(said)] as const;
  return {
    reference,
    recalls,
    backs: [],
    card: recalls.reduce((card, recall) => review(card, recall.grade, recall.startedAt), NEW_CARD),
  };
};

const SEED = plantOf('Psalms 23:1', [0]);
const GROWN = plantOf('Psalms 23:2', [0, 6]);
const garden: ReadGarden = {
  _tag: 'Read',
  plants: new Map([
    [SEED.reference, SEED],
    [GROWN.reference, GROWN],
  ]),
};

const LINES = { seed: 'A seed', blade: 'A blade', ear: 'An ear', 'full corn': 'Full corn' };

describe('the stage line', () => {
  it('claims nothing while the garden is unread', () => {
    expect(stageShown(Option.none(), SEED.reference, Option.none())).toEqual({
      stage: '',
      stageLine: '',
    });
  });

  it('reads not planted for a verse with no plant', () => {
    expect(stageShown(Option.some(garden), 'Psalms 23:3', Option.none())).toEqual({
      stage: 'not planted',
      stageLine: 'Not planted yet',
    });
  });

  it('reads each plant at the current app’s stage', () => {
    for (const plant of [SEED, GROWN]) {
      const stage = stageOf(plant);
      expect(stageShown(Option.some(garden), plant.reference, Option.none())).toEqual({
        stage,
        stageLine: LINES[stage],
      });
    }
    expect(stageOf(GROWN)).not.toBe(stageOf(SEED));
  });

  it('lays Show all’s step back over the verse it was taken on, and no other', () => {
    const help = {
      reference: GROWN.reference,
      peeked: [],
      shownAt: START + 7 * DAY,
      cap: 2 as const,
    };
    expect(stageShown(Option.some(garden), GROWN.reference, Option.some(help)).stage).toBe(
      stageOf(SEED),
    );
    expect(stageShown(Option.some(garden), SEED.reference, Option.some(help)).stage).toBe(
      stageOf(SEED),
    );
  });
});
