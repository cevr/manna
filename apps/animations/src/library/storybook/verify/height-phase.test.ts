import { Result } from 'effect';
import { describe, expect, test } from 'effect-bun-test';
import { coveredOn, slantedFigure, spreadOf } from './height.testing.ts';
import { type FrameRead, LEAST_HEIGHT, observeHeight, readFigure } from './measures.ts';

describe('observeHeight at every sampling phase', () => {
  test('reads a figure with a slanted crown and round soles, its edges covered part way as a resampling page covers them, to a fraction of a px at every sampling phase: steady from the least height it reads up, 3 % taller or shorter past the bar, and unread under it (verifier round 1, M1)', () => {
    const phases = [0, 0.17, 0.33, 0.5, 0.67, 0.83];
    const read = (height: number, growth: number, phase: number, frame: number): FrameRead => {
      const raster = coveredOn(slantedFigure, height, growth, 200 + phase * 0.7, 400 + phase);
      return {
        frame,
        name: 'f',
        cell: 'a',
        zoom: 1,
        squashed: false,
        read: readFigure(raster, []),
        height: observeHeight(raster),
      };
    };
    const misses = [LEAST_HEIGHT * 1.1, 150, 240].flatMap((height) => {
      const steady = phases.map((p) => read(height, 1, p, 0));
      const changed = [1.03, 0.97].flatMap((g) => phases.map((p) => read(height, g, p, 1)));
      return [
        ...[spreadOf(steady)]
          .filter((s) => !(s >= 0 && s <= 0.006))
          .map((s) => `${height} steady ${s}`),
        ...changed.flatMap((c) =>
          steady
            .map((a) => spreadOf([a, c]))
            .filter((s) => !(s > 0.02))
            .map((s) => `${height} changed ${s}`),
        ),
      ];
    });
    expect(misses).toEqual([]);
    expect(Result.isFailure(read(LEAST_HEIGHT * 0.9, 1, 0.33, 0).height)).toBe(true);
  });
});
