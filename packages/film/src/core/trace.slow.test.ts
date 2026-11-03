import { describe, expect, test } from 'bun:test';
import type { Raster } from './raster.ts';
import { Result } from 'effect';
import { traceView } from './trace.ts';
import { VIEW, sheet, type TraceView } from './fixtures/trace/view.ts';

describe('traceView', () => {
  test('opens a sliver off a part, and refuses an outline that doubles back on itself', () => {
    const painted = (
      ink: (x: number, y: number) => boolean,
      skin: (x: number, y: number) => boolean,
    ): Raster => {
      const base = sheet();
      const rgba = new Uint8Array(base.rgba);
      for (let y = 0; y < base.height; y++)
        for (let x = 0; x < base.width; x++) {
          if (ink(x, y)) rgba.set([20, 16, 14], (y * base.width + x) * 4);
          if (skin(x, y)) rgba.set([253, 175, 112], (y * base.width + x) * 4);
        }
      return { ...base, rgba };
    };
    const plain = Result.getOrThrow(traceView(sheet(), VIEW)).outlines['head'] ?? [];
    const sliver = painted(
      () => false,
      (x, y) => x >= 59 && x <= 61 && y >= 20 && y < 24,
    );
    expect(Result.getOrThrow(traceView(sliver, VIEW)).outlines['head']).toEqual(plain);
    const spike = painted(
      (x, y) => x >= 56 && x <= 64 && y < 22,
      (x, y) => x >= 58 && x <= 62 && y >= 2 && y < 24,
    );
    const refused = traceView(spike, VIEW);
    expect(Result.isFailure(refused) && refused.failure.reason).toContain(
      'the part head doubles back on itself',
    );
  });

  test("smooths a part's edge as far each way as the part asks", () => {
    const corners = (body: TraceView['parts'][string]) => {
      const view: TraceView = { ...VIEW, parts: { ...VIEW.parts, body } };
      const outline = Result.getOrThrow(traceView(sheet(), view)).outlines['body'] ?? [];
      return Math.min(...outline.map(([x, y]) => Math.hypot(x - 32, y - 64)));
    };
    const body = { seeds: [[50, 100]], plus: ['shade'] } as const;
    expect(corners({ ...body, smooth: 12 })).toBeGreaterThan(corners(body) + 2);
  });

  test('wears a part in from its edge as far as it asks, so a part less it keeps a rim under it', () => {
    const reach = (shade: TraceView['parts'][string]) => {
      const view: TraceView = {
        ...VIEW,
        parts: { ...VIEW.parts, shade, body: { seeds: [[50, 100]], minus: ['shade'] } },
      };
      const body = Result.getOrThrow(traceView(sheet(), view)).outlines['body'] ?? [];
      return Math.max(...body.filter(([, y]) => y > 155 && y < 185).map(([x]) => x));
    };
    const shade = { classes: ['teal'], as: 'none' } as const;
    expect(reach(shade)).toBeLessThan(63);
    expect(reach({ ...shade, shrink: 6 })).toBeGreaterThanOrEqual(reach(shade) + 3);
  });
});
