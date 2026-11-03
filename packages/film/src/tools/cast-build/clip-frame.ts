import { type Puppet, rasterOf } from '../../core/puppet.ts';
import type { Raster } from '../../core/raster.ts';
import { SAMPLE_SIZE } from '../../core/pose-sample.ts';

type Pt = readonly [number, number];
type Rgb = readonly [number, number, number];

/** How many times the canvas a given frame is drawn at. */
export const FRAME_ZOOM = 2;

/** A kept view to draw: its puppet and its sheet's paper. */
interface FrameView {
  readonly puppet: Puppet;
  readonly paper: Rgb;
}

/** A drawn frame: its pixels and where the figure stands on the canvas (canvas px, before the zoom). */
interface ClipFrame {
  readonly img: Raster;
  readonly root: Pt;
  readonly scale: number;
  readonly feet: number;
}

/** `placed` at 0.5: the scale and the root that centre the sheet, its bottom halfway down the room under it. */
const middleOf = (p: Puppet) => {
  const [W, H] = SAMPLE_SIZE;
  const s0 = Math.min(H / p.height, (W - 13) / p.width);
  const scale = +(s0 * 0.91).toFixed(5);
  const cx = W / 2;
  const bottom = H - (H - p.height * scale) * 0.5;
  const root: Pt = [
    +(cx + scale * (p.root[0] - p.width / 2)).toFixed(3),
    +(bottom + scale * (p.root[1] - p.height)).toFixed(3),
  ];
  return { scale, root };
};

/** A raster's bytes, read without a hole: every index a loop below reads lies inside it. */
const bytesOf = (r: Raster) => new DataView(r.rgba.buffer, r.rgba.byteOffset, r.rgba.byteLength);

/** The figure at rest at `root` and `scale` (canvas px), drawn at the zoom. */
const drawn = (p: Puppet, root: Pt, scale: number) =>
  rasterOf(
    p,
    { numbers: {}, root: [root[0] * FRAME_ZOOM, root[1] * FRAME_ZOOM], scale: scale * FRAME_ZOOM },
    [SAMPLE_SIZE[0] * FRAME_ZOOM, SAMPLE_SIZE[1] * FRAME_ZOOM],
  );

/** The lowest row (canvas px, at the zoom) the figure covers past half alpha; -1 when it covers none. */
const feetOf = (r: Raster) => {
  const bytes = bytesOf(r);
  for (let y = r.height - 1; y >= 0; y--)
    for (let x = 0; x < r.width; x++)
      if (bytes.getUint8((y * r.width + x) * 4 + 3) >= 128) return y;
  return -1;
};

/** The raster laid over `paper`, opaque. */
const onPaper = (r: Raster, paper: Rgb): Raster => {
  const bytes = bytesOf(r);
  const out = new Uint8Array(r.width * r.height * 4);
  for (let i = 0; i < r.width * r.height; i++) {
    const k = bytes.getUint8(i * 4 + 3) / 255;
    paper.forEach((p, c) => {
      out[i * 4 + c] = Math.round(bytes.getUint8(i * 4 + c) * k + p * (1 - k));
    });
    out[i * 4 + 3] = 255;
  }
  return { width: r.width, height: r.height, rgba: out };
};

const frameAt = (v: FrameView, root: Pt, scale: number): ClipFrame => {
  const r = drawn(v.puppet, root, scale);
  return { img: onPaper(r, v.paper), root, scale, feet: feetOf(r) };
};

/** A clip's first frame: the view at rest at the middle place. */
export const firstFrameOf = (v: FrameView): ClipFrame => {
  const { scale, root } = middleOf(v.puppet);
  return frameAt(v, root, scale);
};

/** A clip's last frame after `first`: the view at rest at `first`'s scale and root x, moved up or down to stand on `first`'s feet line. */
export const lastFrameOf = (first: ClipFrame, v: FrameView): ClipFrame => {
  const placed = middleOf(v.puppet);
  const at: Pt = [first.root[0], placed.root[1]];
  const shift = (first.feet - feetOf(drawn(v.puppet, at, first.scale))) / FRAME_ZOOM;
  return frameAt(v, [at[0], +(at[1] + shift).toFixed(3)], first.scale);
};
