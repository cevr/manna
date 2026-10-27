import { describe, expect, test } from 'bun:test';
import type { Raster } from './raster.ts';
import { Result } from 'effect';
import { traceView } from './trace.ts';
import { VIEW, sheet, type TraceView } from './fixtures/trace/view.ts';

// The tracer's cases that trace the test sheet more than once each: its
// slivers and spikes, its smoothing and a part worn in from its edge.
describe('traceView', () => {
  test('opens a sliver off a part, and refuses an outline that doubles back on itself', () => {
    /** The sheet with ink, then skin, painted where each says, over the head's ring of ink. */
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
    // A sliver of skin out into the ring, a pixel wide inside its antialiased edge: a slip of the edge, opened off.
    const sliver = painted(
      () => false,
      (x, y) => x >= 59 && x <= 61 && y >= 20 && y < 24,
    );
    expect(Result.getOrThrow(traceView(sliver, VIEW)).outlines['head']).toEqual(plain);
    // A spike of skin five pixels wide and twenty long, inked round, out of the top of the head: the outline turns back at its tip.
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
      // How near the outline comes to the body's top-left corner.
      return Math.min(...outline.map(([x, y]) => Math.hypot(x - 32, y - 64)));
    };
    const body = { seeds: [[50, 100]], plus: ['shade'] } as const;
    expect(corners({ ...body, smooth: 12 })).toBeGreaterThan(corners(body) + 2);
  });

  test('wears a part in from its edge as far as it asks, so a part less it keeps a rim under it', () => {
    // How far right the body runs in the shade's rows (the shade fills 61 to 86 across, 141 to 196 down).
    const reach = (shade: TraceView['parts'][string]) => {
      const view: TraceView = {
        ...VIEW,
        parts: { ...VIEW.parts, shade, body: { seeds: [[50, 100]], minus: ['shade'] } },
      };
      const body = Result.getOrThrow(traceView(sheet(), view)).outlines['body'] ?? [];
      return Math.max(...body.filter(([, y]) => y > 155 && y < 185).map(([x]) => x));
    };
    const shade = { classes: ['teal'], as: 'none' } as const;
    // Less the whole shade, the body ends where the shade begins; less the shade worn in 6 px, it runs on into it (4 px past its smoothing).
    expect(reach(shade)).toBeLessThan(63);
    expect(reach({ ...shade, shrink: 6 })).toBeGreaterThanOrEqual(reach(shade) + 3);
  });
});
