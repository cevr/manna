import { describe, expect, test } from 'bun:test';
import { type CastProp, type CastView, castClip, castDrawOrder } from './cast.ts';
import type { RivePropSpec } from './rive.ts';

const rig = (key: string): RivePropSpec => ({
  source: { riv: '/figures.riv', artboard: key, timelines: [] },
  engine: 'canvas',
  key,
  origin: [0, 0],
});

const prop = (name: string, layer?: CastProp['layer']): CastProp =>
  layer === undefined ? { name, draw: () => {} } : { name, draw: () => {}, layer };

/** A drawing's name: its prop's, the figure's rig's, or the rig drawn with it. */
const named = (view: CastView) =>
  castDrawOrder(view).map((d) =>
    d.kind === 'prop' ? d.prop.name : d.kind === 'figure' ? view.rig.key : d.with.rig.key,
  );

describe('a cast view', () => {
  test('draws a held prop over its figure and under the hands drawn with it', () => {
    const view: CastView = {
      box: [0, 0, 10, 10],
      at: [5, 10],
      rig: rig('lead'),
      pose: { timelines: [] },
      with: [
        { rig: rig('handNear'), pose: { timelines: [] }, at: [0, 0] },
        { rig: rig('handFar'), pose: { timelines: [] }, at: [0, 0] },
      ],
      props: [prop('cup'), prop('bottle', 'held'), prop('stool', 'behind')],
    };
    expect(named(view)).toEqual(['stool', 'lead', 'bottle', 'handNear', 'handFar', 'cup']);
  });

  test("two views side by side, each drawing past its box: each one's crop by its box holds its own drawing alone, and a line past its box where no view lies still shows", () => {
    const viewAt = (box: CastView['box']): CastView => ({
      box,
      at: [0, 0],
      rig: rig('lead'),
      pose: { timelines: [] },
    });
    const [left, right] = [viewAt([0, 0, 100, 100]), viewAt([100, 0, 200, 100])];
    const views = [left, right];
    // Whether a view's drawing at `p` is laid on the sheet: inside its clip's box, in none of its cuts.
    const laid = (view: CastView, [x, y]: readonly [number, number]) => {
      const { box, cuts } = castClip(view, views, 12);
      const within = ([x0, y0, x1, y1]: CastView['box']) => x >= x0 && x < x1 && y >= y0 && y < y1;
      return within(box) && !cuts.some(within);
    };
    const each = (x0: number, x1: number, y0: number, y1: number) =>
      Array.from({ length: (x1 - x0) * (y1 - y0) }, (_, i): readonly [number, number] => [
        x0 + (i % (x1 - x0)),
        y0 + Math.floor(i / (x1 - x0)),
      ]);
    // Each draws past its box all round, by 12: the left's ink over the right's box, the right's over the left's.
    const crop = (view: CastView, of: CastView) => {
      const [x0, y0, x1, y1] = view.box;
      return each(x0, x1, y0, y1).filter((p) => laid(of, p)).length;
    };
    expect(crop(right, left)).toBe(0);
    expect(crop(left, right)).toBe(0);
    expect(crop(left, left)).toBe(100 * 100);
    expect(crop(right, right)).toBe(100 * 100);
    // Above both boxes, the left's crown still shows: no view lies there.
    expect(each(0, 112, -12, 0).every((p) => laid(left, p))).toBe(true);
  });
});
