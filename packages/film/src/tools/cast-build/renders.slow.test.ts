import { describe, expect, it } from 'effect-bun-test';
import { Effect, Option } from 'effect';
import { puppetFor } from '../../../../../apps/animations/src/library/cast/lead-feast/cutout/puppet.ts';
import { PUPPETS } from '../../../../../apps/animations/src/library/cast/lead-feast/cutout/puppets.ts';
import { type PoseSpec, SAMPLE_SIZE, sample } from '../../core/pose-sample.ts';
import { SAMPLES, shardOf } from './renders.ts';
import { seedsIn } from './testing.ts';

const front = Effect.gen(function* () {
  const puppet = yield* puppetFor('front');
  const paper = yield* Effect.fromOption(Option.fromUndefinedOr(PUPPETS.front.paper));
  return { puppet, paper } satisfies PoseSpec;
});

/** The share of a sample's pixels off its paper by more than 72 (summed over red, green and blue). */
const figureShare = ({ img, truth }: ReturnType<typeof sample>) => {
  let figure = 0;
  for (let p = 0; p < img.width * img.height; p++) {
    const off = [0, 1, 2].reduce((s, c) => s + Math.abs(img.rgba[p * 4 + c]! - truth.paper[c]!), 0);
    if (off > 72) figure++;
  }
  return figure / (img.width * img.height);
};

describe('renders of lead-feast front', () => {
  it.effect(
    'each of his 40 held samples shows his figure on the canvas, every joint of his on it',
    () =>
      Effect.gen(function* () {
        const spec = yield* front;
        const [W, H] = SAMPLE_SIZE;
        const seeds = seedsIn(
          shardOf(spec, 'lead-feast', 'turnaround-front', { train: 0, held: SAMPLES.held }),
        );
        expect(Object.keys(seeds)).toHaveLength(SAMPLES.held);
        for (let i = 0; i < SAMPLES.held; i++) {
          const drawn = sample(spec, seeds[`held/${i}`]!);
          expect([drawn.img.width, drawn.img.height]).toEqual([W, H]);
          expect(figureShare(drawn)).toBeGreaterThan(0.1);
          expect(figureShare(drawn)).toBeLessThan(0.5);
          expect(drawn.truth.masked).toEqual([]);
          for (const [x, y] of Object.values(drawn.truth.joints)) {
            expect(x).toBeGreaterThan(-W / 2);
            expect(x).toBeLessThan(W * 1.5);
            expect(y).toBeGreaterThan(-H / 2);
            expect(y).toBeLessThan(H * 1.5);
          }
        }
      }),
  );

  it.effect('his shard is the same bytes twice', () =>
    Effect.gen(function* () {
      const spec = yield* front;
      const counts = { train: 2, held: 2 };
      const a = shardOf(spec, 'lead-feast', 'turnaround-front', counts);
      const b = shardOf(spec, 'lead-feast', 'turnaround-front', counts);
      expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
    }),
  );
});
