import { describe, expect, test } from 'bun:test';
import {
  type CastModule,
  type CastProp,
  type CastView,
  castDrawOrder,
  clipCast,
  defaultFigure,
  isCastModule,
} from './cast.ts';
import type { RivePropSpec } from './rive.ts';

/** A rectangle as a path takes it: its corner, its width and its height. */
type Rect = readonly [number, number, number, number];

/** Each clip `clipCast` lays on a context for `view`: its path's rectangles and its fill rule. */
const recordedClips = (view: CastView, views: ReadonlyArray<CastView>) => {
  const clips: Array<{ readonly rects: ReadonlyArray<Rect>; readonly rule: CanvasFillRule }> = [];
  let path: Rect[] = [];
  const ctx: Parameters<typeof clipCast>[0] = {
    beginPath: () => {
      path = [];
    },
    rect: (x, y, w, h) => {
      path.push([x, y, w, h]);
    },
    clip: (rule?: CanvasFillRule | Path2D) => {
      clips.push({ rects: path, rule: rule === 'evenodd' ? 'evenodd' : 'nonzero' });
    },
  };
  clipCast(ctx, view, views, 12);
  return clips;
};

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
    // Whether a view's drawing at `p` is laid on the sheet, as the clips the player lays on its context (`clipCast`) let it through: inside each clip's path by its fill rule.
    const laid = (view: CastView, [x, y]: readonly [number, number]) => {
      const clips = recordedClips(view, views);
      const within = ([x0, y0, w, h]: Rect) => x >= x0 && x < x0 + w && y >= y0 && y < y0 + h;
      return clips.every(({ rects, rule }) => {
        const count = rects.filter(within).length;
        return rule === 'evenodd' ? count % 2 === 1 : count > 0;
      });
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

describe("a film's cast module", () => {
  const sheets = {
    SHEETS: { lead: {}, sower: {} },
    PAPER: { base: '#fff', tone: '#eee', seed: 1 },
  };
  const cutOnly: CastModule = { ...sheets, CUTOUT: { sower: { turnaround: {} } } };
  const both: CastModule = {
    ...sheets,
    CAST: { lead: { turnaround: {} } },
    CUTOUT: { lead: { turnaround: {} }, sower: { turnaround: {} } },
  };

  test('reads with a cut-out table and no rigs, and not with neither table', () => {
    expect(isCastModule(cutOnly)).toBe(true);
    expect(isCastModule(both)).toBe(true);
    expect(isCastModule(sheets)).toBe(false);
    expect(isCastModule({ ...cutOnly, PAPER: undefined })).toBe(false);
  });

  test('draws a member by his rig when the film has one of him, else by his cut-out', () => {
    expect(defaultFigure(cutOnly, 'sower')).toBe('cutout');
    expect(defaultFigure(both, 'lead')).toBe('rig');
    expect(defaultFigure(both, 'sower')).toBe('cutout');
    expect(defaultFigure(both, 'nobody')).toBe('rig');
  });
});
