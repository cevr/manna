import { insidePolygon } from '../core/polygon.ts';
import type { Point } from '../core/schema.ts';
import type {
  FaceMark,
  FootageMark,
  GripShares,
  HandMark,
  InkMark,
  TextBox,
} from '../core/export-handle.ts';
import type { ConceptRef, FigureMark } from '../core/match.ts';
import type { Edge, Quad } from './painting.ts';

export interface ProbeSink {
  readonly texts: TextBox[];
  readonly inks: InkMark[];
  readonly faces?: FaceMark[];
  readonly hands?: HandMark[];
  readonly footage?: FootageMark[];
  readonly figures?: FigureMark[];
  readonly paintings?: PaintingMark[];
}

export interface PaintingMark {
  readonly scene: string;
  readonly key: string;
  readonly quad: Quad;
  readonly open: ReadonlyArray<Edge>;
}

export interface Probe {
  readonly sink: ProbeSink;
  readonly scene: string;
  readonly dx: number;
  readonly alpha: number;
  readonly plate?: number;
  readonly caption?: true;
}

const probes = new WeakMap<CanvasRenderingContext2D, Probe>();

export const probing = (
  ctx: CanvasRenderingContext2D,
  probe: Probe | undefined,
  draw: () => void,
) => {
  if (probe === undefined) return draw();
  probes.set(ctx, probe);
  try {
    draw();
  } finally {
    probes.delete(ctx);
  }
};

export const probeOf = (ctx: CanvasRenderingContext2D): Probe | undefined => probes.get(ctx);

export const unprobed = (ctx: CanvasRenderingContext2D, draw: () => void) => {
  const probe = probes.get(ctx);
  if (probe === undefined) return draw();
  probes.delete(ctx);
  try {
    draw();
  } finally {
    probes.set(ctx, probe);
  }
};

const nextOrder = (sink: ProbeSink) => sink.texts.length + sink.inks.length;

const screen = (ctx: CanvasRenderingContext2D, probe: Probe) => {
  const m = ctx.getTransform();
  return (px: number, py: number): Point => [
    m.a * px + m.c * py + m.e + probe.dx,
    m.b * px + m.d * py + m.f,
  ];
};

const scaleOf = (ctx: CanvasRenderingContext2D) => {
  const m = ctx.getTransform();
  return Math.sqrt(Math.abs(m.a * m.d - m.b * m.c));
};

const tagged = <A extends object>(probe: Probe, record: A): A | (A & { readonly caption: true }) =>
  probe.caption === true ? { ...record, caption: true } : record;

export const recordText = (
  ctx: CanvasRenderingContext2D,
  probe: Probe,
  text: string,
  left: number,
  top: number,
  width: number,
  height: number,
  alpha: number,
  hand?: number,
) => {
  const map = screen(ctx, probe);
  const corners: [Point, Point, Point, Point] = [
    map(left, top),
    map(left + width, top),
    map(left + width, top + height),
    map(left, top + height),
  ];
  const xs = corners.map((c) => c[0]);
  const ys = corners.map((c) => c[1]);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  const box: TextBox = {
    text,
    scene: probe.scene,
    x,
    y,
    w: Math.max(...xs) - x,
    h: Math.max(...ys) - y,
    corners,
    alpha: alpha * probe.alpha,
    order: nextOrder(probe.sink),
    scale: scaleOf(ctx),
  };
  const handed = hand === undefined ? box : { ...box, hand };
  probe.sink.texts.push(
    tagged(probe, probe.plate === undefined ? handed : { ...handed, on: probe.plate }),
  );
};

const INK_STEP = 6;

export const recordInk = (
  ctx: CanvasRenderingContext2D,
  probe: Probe,
  kind: InkMark['kind'],
  path: ReadonlyArray<Point>,
  width: number,
  alpha: number,
  marks?: ReadonlyArray<number>,
) => {
  const first = path[0];
  if (first === undefined) return;
  const map = screen(ctx, probe);
  const kept: Point[] = [map(first[0], first[1])];
  let last = first;
  for (let i = 1; i < path.length; i++) {
    const p = path[i];
    if (p === undefined) continue;
    if (i < path.length - 1 && Math.hypot(p[0] - last[0], p[1] - last[1]) < INK_STEP) continue;
    kept.push(map(p[0], p[1]));
    last = p;
  }
  const xs = kept.map((c) => c[0]);
  const ys = kept.map((c) => c[1]);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  const scale = scaleOf(ctx);
  const mark: InkMark = {
    kind,
    scene: probe.scene,
    points: kept,
    width: width * scale,
    x,
    y,
    w: Math.max(...xs) - x,
    h: Math.max(...ys) - y,
    alpha: alpha * probe.alpha,
    order: nextOrder(probe.sink),
    scale,
  };
  probe.sink.inks.push(tagged(probe, marks === undefined ? mark : { ...mark, marks }));
};

export const probesFaces = (ctx: CanvasRenderingContext2D): boolean =>
  probes.get(ctx)?.sink.faces !== undefined;

export const probeFace = (ctx: CanvasRenderingContext2D, x: number, y: number, height: number) => {
  const probe = probes.get(ctx);
  const faces = probe?.sink.faces;
  if (probe === undefined || faces === undefined) return;
  const [sx, sy] = screen(ctx, probe)(x, y);
  faces.push({
    scene: probe.scene,
    x: sx,
    y: sy,
    size: height * scaleOf(ctx),
    alpha: ctx.globalAlpha * probe.alpha,
    order: nextOrder(probe.sink),
  });
};

export const probesHands = (ctx: CanvasRenderingContext2D): boolean =>
  probes.get(ctx)?.sink.hands !== undefined;

interface HandSeen {
  readonly side: 'far' | 'near';
  readonly shoulder: Point;
  readonly at: Point;
  readonly to: Point;
  readonly size: number;
  readonly radius: number;
  readonly reach: number;
  readonly grip: GripShares;
  readonly formed: number;
  readonly over: boolean;
  readonly body: () => ReadonlyArray<ReadonlyArray<Point>>;
}

export const probeHand = (ctx: CanvasRenderingContext2D, hand: HandSeen) => {
  const probe = probes.get(ctx);
  const hands = probe?.sink.hands;
  if (probe === undefined || hands === undefined) return;
  const map = screen(ctx, probe);
  const scale = scaleOf(ctx);
  const [x, y] = map(hand.at[0], hand.at[1]);
  const [sx, sy] = map(hand.shoulder[0], hand.shoulder[1]);
  const [tx, ty] = map(hand.to[0], hand.to[1]);
  hands.push({
    scene: probe.scene,
    side: hand.side,
    x,
    y,
    sx,
    sy,
    tx,
    ty,
    size: hand.size * scale,
    radius: hand.radius * scale,
    reach: Math.min(1, Math.max(0, hand.reach)),
    grip: hand.grip,
    formed: hand.formed,
    inside: hand.body().some((shape) => insidePolygon(shape, hand.at)),
    over: hand.over,
    alpha: ctx.globalAlpha * probe.alpha,
  });
};

export const probesFigures = (ctx: CanvasRenderingContext2D): boolean =>
  probes.get(ctx)?.sink.figures !== undefined;

export const probeFigure = (
  ctx: CanvasRenderingContext2D,
  figure: {
    readonly key: string;
    readonly left: number;
    readonly top: number;
    readonly right: number;
    readonly bottom: number;
    readonly face: boolean;
    readonly concept?: ConceptRef;
  },
) => {
  const probe = probes.get(ctx);
  const figures = probe?.sink.figures;
  if (probe === undefined || figures === undefined) return;
  const map = screen(ctx, probe);
  const corners = [
    map(figure.left, figure.top),
    map(figure.right, figure.top),
    map(figure.right, figure.bottom),
    map(figure.left, figure.bottom),
  ];
  const xs = corners.map((c) => c[0]);
  const ys = corners.map((c) => c[1]);
  figures.push({
    scene: probe.scene,
    key: figure.key,
    box: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)],
    face: figure.face,
    concept: figure.concept,
  });
};

export const textExtent = (ctx: CanvasRenderingContext2D, text: string) => {
  const m = ctx.measureText(text);
  return { ascent: m.actualBoundingBoxAscent, descent: m.actualBoundingBoxDescent };
};

const boundsOf = (shape: ReadonlyArray<Point>) => {
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const [x, y] of shape) {
    left = Math.min(left, x);
    top = Math.min(top, y);
    right = Math.max(right, x);
    bottom = Math.max(bottom, y);
  }
  return { left, top, width: right - left, height: bottom - top };
};

export const probePlate = (
  ctx: CanvasRenderingContext2D,
  shape: ReadonlyArray<Point>,
  draw: () => void,
) => {
  const probe = probeOf(ctx);
  if (probe === undefined) return draw();
  const alpha = ctx.globalAlpha;
  recordInk(ctx, probe, 'plate', shape, 0, alpha);
  const at = probe.sink.texts.length;
  const box = boundsOf(shape);
  recordText(ctx, probe, '', box.left, box.top, box.width, box.height, alpha);
  const recorded = probe.sink.texts[at];
  if (recorded === undefined) return draw();
  probes.set(ctx, { ...probe, plate: recorded.order });
  try {
    draw();
  } finally {
    probes.set(ctx, probe);
  }
  const words = probe.sink.texts.filter((t) => t.on === recorded.order).map((t) => t.text);
  probe.sink.texts[at] = {
    ...recorded,
    text: words.length > 0 ? words.join(' / ') : '(empty plate)',
  };
};

export const recordPlate = (
  ctx: CanvasRenderingContext2D,
  probe: Probe,
  left: number,
  top: number,
  width: number,
  height: number,
  alpha: number,
) =>
  recordInk(
    ctx,
    probe,
    'plate',
    [
      [left, top],
      [left + width, top],
      [left + width, top + height],
      [left, top + height],
    ],
    0,
    alpha,
  );
