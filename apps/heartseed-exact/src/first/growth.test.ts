/* oxlint-disable effect/noNodeBuiltinImport, effect/noNullish, effect/noAsyncFunction, effect/noGlobals -- a Bun test reading a tracked Contract file, as src/read/read.test.ts does; a regex group that did not match is undefined. */

/**
 * The welcome's growing seed in `features/first.contract` draws what the
 * current welcome draws (`@manna/heartseed/first/growth`): each of the four
 * stages' keyframes, read as CSS reads them (a straight line between
 * points, `linear` timing), gives at every instant of a cycle the opacity
 * `growthAt` gives the current loop, which starts at `GROWTH_START`, and
 * the Contract's cycle is `GROWTH.cycle`.
 */

import { describe, expect, it } from 'bun:test';
import { join } from 'node:path';
import { GROWTH, GROWTH_START, growthAt } from '@manna/heartseed/first/growth';

const STAGES = ['seed', 'blade', 'ear', 'corn'] as const;
const SAMPLES = 690;

const contract = await Bun.file(join(import.meta.dir, '../../features/first.contract')).text();

/** The points of keyframes `name`: each share of the cycle in [0, 1] and its opacity. */
const pointsOf = (name: string): ReadonlyArray<readonly [number, number]> => {
  const block = new RegExp(`^keyframes ${name}\\n((?: {2}.*\\n)+)`, 'mu').exec(contract)?.[1] ?? '';
  return [...block.matchAll(/^ {2}([\d.]+)% opacity=([\d.]+)$/gmu)].map(
    (match) => [Number(match[1]) / 100, Number(match[2])] as const,
  );
};

/** The opacity the points give at `share` of the cycle. */
const opacityAt = (points: ReadonlyArray<readonly [number, number]>, share: number) => {
  const next = points.findIndex(([at]) => at > share);
  if (next <= 0) return points.at(-1)?.[1] ?? Number.NaN;
  const [from, low] = points[next - 1] ?? [0, 0];
  const [to, high] = points[next] ?? [from, low];
  return low + ((share - from) / (to - from)) * (high - low);
};

describe("the growing seed's keyframes, beside the current welcome's loop", () => {
  it('the Contract loops on the current cycle', () => {
    expect(contract).toContain('duration.grow');
    expect(
      STAGES.every((stage) =>
        contract.includes(`"hs-grow-${stage} duration.grow linear infinite"`),
      ),
    ).toBe(true);
  });

  for (const [index, stage] of STAGES.entries())
    it(`${stage} shows as growthAt has it at each of ${SAMPLES} instants`, () => {
      const points = pointsOf(`hs-grow-${stage}`);
      expect(points.length).toBeGreaterThanOrEqual(3);
      expect([points[0]?.[0], points.at(-1)?.[0]]).toEqual([0, 1]);
      for (let at = 0; at < SAMPLES; at++) {
        const ms = (at / SAMPLES) * GROWTH.cycle;
        expect({ ms, opacity: opacityAt(points, at / SAMPLES) }).toEqual({
          ms,
          opacity: expect.closeTo(growthAt(GROWTH_START + ms)[index] ?? Number.NaN, 2),
        });
      }
    });
});
