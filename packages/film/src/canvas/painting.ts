import { Option } from 'effect';
import type { PaintingMark, Probe } from './probe.ts';

/** One edge of a plate's rectangle, in the plate's own frame. */
export type Edge = 'top' | 'right' | 'bottom' | 'left';

/** The four edges in quad order: each runs from its corner to the next. */
export const EDGES: ReadonlyArray<Edge> = ['top', 'right', 'bottom', 'left'];

/** A painted plate a scene declares, as it declares a puppet. */
export interface PaintingSpec {
  /** A stable id, named in load errors and findings. */
  readonly key: string;
  /** The PNG, imported `with { type: 'file' }` beside the spec. */
  readonly png: string;
  /** The PNG's pixel size; a read of another size fails the load. */
  readonly size: readonly [number, number];
  /** Scene px of the plate's top-left at rest. Default [0, 0]. */
  readonly at?: readonly [number, number];
  /** Scene px per plate px. Default 1. */
  readonly scale?: number;
  /** The edges that are clear (alpha 0) and may show inside the frame. */
  readonly open?: ReadonlyArray<Edge>;
}

/** A scene's paintings by the name its drawing calls them. */
export type Paintings = Readonly<Record<string, PaintingSpec>>;

/** A painting loaded for the draw: the image a page draws, none where nothing is drawn (Bun). */
export interface LoadedPainting {
  readonly image: Option.Option<CanvasImageSource>;
}

type Point = readonly [number, number];

/** The four screen corners (tl, tr, br, bl) of a plate's rectangle. */
export type Quad = readonly [Point, Point, Point, Point];

/** `spec`'s rectangle mapped by `m` · translate(at) · scale(scale): the corners `drawImage(image, 0, 0)` lands on. */
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

/** The length of segment p..q strictly inside the open rectangle (0, 0)..(w, h): 0 when it only touches the border (Liang-Barsky). */
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

/** The edges of `quad` with part of their segment strictly inside the frame (0, 0)..(w, h); one exactly on the border does not show. */
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

/**
 * Paint `spec` as a plane under `ctx`'s current transform: translate(at),
 * scale(scale), the image at (0, 0), smoothing fixed at 'high'. With no image
 * (Bun's check) nothing is drawn. Either way, a probe that collects
 * paintings records the plate's screen quad from the same transform the draw
 * uses, so the check sees what the page paints.
 */
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
