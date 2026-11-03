import { Option } from 'effect';
import type { PaintingMark, Probe } from './probe.ts';

export type Edge = 'top' | 'right' | 'bottom' | 'left';

export const EDGES: ReadonlyArray<Edge> = ['top', 'right', 'bottom', 'left'];

export interface PaintingSpec {
  readonly key: string;
  readonly png: string;
  readonly size: readonly [number, number];
  readonly at?: readonly [number, number];
  readonly scale?: number;
  readonly open?: ReadonlyArray<Edge>;
}

export type Paintings = Readonly<Record<string, PaintingSpec>>;

export interface LoadedPainting {
  readonly image: Option.Option<CanvasImageSource>;
}

type Point = readonly [number, number];

export type Quad = readonly [Point, Point, Point, Point];

export const paintingQuad = (
  m: Pick<DOMMatrixReadOnly, 'a' | 'b' | 'c' | 'd' | 'e' | 'f'>,
  spec: PaintingSpec,
): Quad => {
  const [x, y] = spec.at ?? [0, 0];
  const s = spec.scale ?? 1;
  const [w, h] = spec.size;
  const at = (u: number, v: number): Point => {
    const px = x + s * u;
    const py = y + s * v;
    return [m.a * px + m.c * py + m.e, m.b * px + m.d * py + m.f];
  };
  return [at(0, 0), at(w, 0), at(w, h), at(0, h)];
};

const inside = (p: Point, q: Point, w: number, h: number): number => {
  const dx = q[0] - p[0];
  const dy = q[1] - p[1];
  let t0 = 0;
  let t1 = 1;
  for (const [pp, qq] of [
    [-dx, p[0]],
    [dx, w - p[0]],
    [-dy, p[1]],
    [dy, h - p[1]],
  ] as const) {
    if (pp === 0) {
      if (qq <= 0) return 0;
      continue;
    }
    const r = qq / pp;
    if (pp < 0) t0 = Math.max(t0, r);
    else t1 = Math.min(t1, r);
    if (t0 >= t1) return 0;
  }
  return (t1 - t0) * Math.hypot(dx, dy);
};

export const shownEdges = (quad: Quad, w: number, h: number): ReadonlyArray<Edge> => {
  const [tl, tr, br, bl] = quad;
  const sides: Readonly<Record<Edge, readonly [Point, Point]>> = {
    top: [tl, tr],
    right: [tr, br],
    bottom: [br, bl],
    left: [bl, tl],
  };
  return EDGES.filter((edge) => inside(...sides[edge], w, h) > 0);
};

export const drawPainting = (
  ctx: CanvasRenderingContext2D,
  spec: PaintingSpec,
  loaded: LoadedPainting,
  probe: Probe | undefined,
): void => {
  const sink = probe?.sink.paintings;
  if (probe !== undefined && sink !== undefined) {
    const mark: PaintingMark = {
      scene: probe.scene,
      key: spec.key,
      quad: paintingQuad(ctx.getTransform(), spec),
      open: spec.open ?? [],
    };
    sink.push(mark);
  }
  if (Option.isNone(loaded.image)) return;
  const [x, y] = spec.at ?? [0, 0];
  const s = spec.scale ?? 1;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(loaded.image.value, 0, 0);
  ctx.restore();
};
