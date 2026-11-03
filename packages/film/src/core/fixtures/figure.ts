import { MutableHashMap, Option } from 'effect';
import type { Raster } from '../raster.ts';

type Rgb = readonly [number, number, number];

const INK: Rgb = [58, 38, 28];
export const PAPER: Rgb = [238, 230, 214];
const SKIN: Rgb = [226, 178, 146];
const HAIR: Rgb = [170, 112, 64];
const HAIR_DARK: Rgb = [80, 62, 60];
const HAIR_SPECK: Rgb = [74, 48, 30];
const ROBE: Rgb = [92, 128, 170];
const SHOE: Rgb = [128, 96, 72];
const WOOD: Rgb = [150, 100, 60];
const SKIN_LIGHT: Rgb = [251, 210, 182];
const LOCKS: Rgb = [112, 66, 40];
const LOCKS_LIT: Rgb = [205, 126, 64];

export interface FigureSpec {
  readonly cx: number;
  readonly cy: number;
  readonly rx: number;
  readonly ry: number;
  readonly line: number;
  readonly hairAbove: number;
  readonly hairInk: boolean;
  readonly darkHair?: boolean;
  readonly eyeW: number;
  readonly eyeH: number;
  readonly eyeGap: number;
  readonly eyeBelow: number;
  readonly robeTop: number;
  readonly robeHem: number;
  readonly robeDepth: number;
  readonly robeShade?: Rgb;
  readonly ear?: { readonly rim: boolean };
  readonly mouth?: { readonly open: boolean; readonly width: number };
  readonly feet?: boolean;
  readonly rail?: boolean;
  readonly wall?: boolean;
  readonly eyeShift?: number;
  readonly longHair?: boolean;
  readonly lockWidth?: number;
  readonly beard?: { readonly parted: boolean };
  readonly litBand?: boolean;
  readonly arm?: 'sleeve' | 'sleeveAtRest' | 'sleeveReach' | 'bare';
  readonly robe?: Rgb;
  readonly roll?: number;
  readonly lit?: 'left' | 'right';
  readonly limb?: {
    readonly hand: readonly [number, number];
    readonly from?: ReadonlyArray<readonly [number, number]>;
    readonly kind: 'free' | 'sleeve' | 'bare';
    readonly cuff?: boolean;
  };
  readonly handless?: boolean;
  readonly bareSkin?: { readonly kind: 'yoke' | 'shoulders' | 'chest'; readonly depth: number };
  readonly oneEye?: boolean;
  readonly headcloth?: Rgb;
}

export const PLAIN: FigureSpec = {
  cx: 200,
  cy: 150,
  rx: 60,
  ry: 66,
  line: 6,
  hairAbove: 30,
  hairInk: false,
  eyeW: 8,
  eyeH: 13,
  eyeGap: 48,
  eyeBelow: 10,
  robeTop: 110,
  robeHem: 240,
  robeDepth: 330,
};

type PixelTest = ((x: number, y: number) => boolean) & { readonly box?: readonly number[] };

const within = (
  box: readonly number[],
  test: (x: number, y: number) => boolean,
): PixelTest & { readonly box: readonly number[] } => Object.assign(test, { box });

const canvasOf = (width: number, height: number) => {
  const rgba = new Uint8Array(width * height * 4);
  const fill = (inside: PixelTest, colour: Rgb) => {
    const [r, g, b] = colour;
    const [x0, y0, x1, y1] = inside.box ?? [0, 0, width, height];
    const [left, right] = [Math.max(0, Math.floor(x0!) - 1), Math.min(width, Math.ceil(x1!) + 1)];
    const [top, bottom] = [Math.max(0, Math.floor(y0!) - 1), Math.min(height, Math.ceil(y1!) + 1)];
    for (let y = top; y < bottom; y++)
      for (let x = left; x < right; x++)
        if (inside(x + 0.5, y + 0.5)) {
          const i = (y * width + x) * 4;
          rgba[i] = r;
          rgba[i + 1] = g;
          rgba[i + 2] = b;
          rgba[i + 3] = 255;
        }
  };
  fill(() => true, PAPER);
  return { fill, raster: (): Raster => ({ width, height, rgba }) };
};

const ellipse = (cx: number, cy: number, rx: number, ry: number) =>
  within(
    [cx - Math.abs(rx), cy - Math.abs(ry), cx + Math.abs(rx), cy + Math.abs(ry)],
    (x, y) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1,
  );

type Canvas = ReturnType<typeof canvasOf>;

const frameOf = (spec: FigureSpec) => {
  const chin = spec.cy + spec.ry;
  const hem = chin + spec.robeDepth;
  const halfAt = (y: number) =>
    spec.robeTop / 2 + ((spec.robeHem - spec.robeTop) / 2) * ((y - chin) / spec.robeDepth);
  const robe = (pad: number) => {
    const half = Math.max(halfAt(chin), halfAt(hem + pad)) + pad;
    return within(
      [spec.cx - half, chin - spec.ry / 2 - pad, spec.cx + half, hem + pad],
      (x, y) =>
        y >= chin - spec.ry / 2 - pad &&
        y <= hem + pad &&
        Math.abs(x - spec.cx) <= halfAt(Math.max(chin, y)) + pad,
    );
  };
  const out = spec.arm === 'sleeveReach' || spec.arm === 'bare';
  const hand = out
    ? { x: spec.cx + spec.robeHem / 2 + 40, y: chin + 0.4 * spec.robeDepth, r: 22 }
    : { x: spec.cx + spec.robeHem / 2 + 30, y: chin + 0.6 * spec.robeDepth, r: 22 };
  return { chin, hem, halfAt, robe, hand };
};
type Frame = ReturnType<typeof frameOf>;

const drawRobeFill = (c: Canvas, spec: FigureSpec, f: Frame) => {
  c.fill(f.robe(0), spec.robe ?? ROBE);
  const shade = spec.robeShade;
  const right = spec.lit !== 'right';
  const shaded = (x: number) => (right && x > spec.cx + 6) || (!right && x < spec.cx - 6);
  const robe = f.robe(0);
  if (shade !== undefined)
    c.fill(
      within(robe.box, (x, y) => robe(x, y) && shaded(x)),
      shade,
    );
};

const drawArm = (c: Canvas, spec: FigureSpec, f: Frame) => {
  const { cx, line } = spec;
  const { hand } = f;
  if (spec.arm === 'sleeveAtRest') {
    const band = (pad: number): PixelTest => {
      const [from, to] = [
        f.chin + 0.1 * spec.robeDepth - pad,
        f.chin + 0.55 * spec.robeDepth + pad,
      ];
      return within(
        [cx, from, cx + Math.max(f.halfAt(from), f.halfAt(to)) + 8 + pad, to],
        (x, y) =>
          y >= f.chin + 0.1 * spec.robeDepth - pad &&
          y <= f.chin + 0.55 * spec.robeDepth + pad &&
          x >= cx &&
          x <= cx + f.halfAt(y) + 8 + pad,
      );
    };
    c.fill(band(line), INK);
    c.fill(band(0), spec.robe ?? ROBE);
  }
  const reach = (pad: number): PixelTest =>
    within(
      [cx, hand.y - 16 - pad, hand.x, hand.y + 16 + pad],
      (x, y) => Math.abs(y - hand.y) <= 16 + pad && x >= cx && x <= hand.x,
    );
  if (spec.arm === 'sleeveReach') {
    c.fill(reach(line), INK);
    c.fill(reach(0), spec.robe ?? ROBE);
  }
  if (spec.arm === 'bare') c.fill(reach(line), INK);
  if (spec.limb !== undefined || spec.handless === true) return;
  if (spec.arm === 'sleeve') {
    const top = f.chin + 0.15 * spec.robeDepth;
    const [from, to] = [[cx + f.halfAt(top), top] as const, [hand.x, hand.y] as const];
    const along = (w: number) =>
      within([from[0] - w, from[1] - w, to[0] + w, to[1] + w], segment(from, to, w));
    c.fill(along(14 + line), INK);
    c.fill(along(14), spec.robeShade ?? spec.robe ?? ROBE);
    c.fill(ellipse(hand.x, hand.y, hand.r + line, hand.r + line), INK);
    c.fill(ellipse(hand.x, hand.y, hand.r, hand.r), SKIN);
    drawRobeFill(c, spec, f);
    return;
  }
  c.fill(ellipse(hand.x, hand.y, hand.r + line, hand.r + line), INK);
  if (spec.arm === 'bare') c.fill(reach(0), SKIN);
  c.fill(ellipse(hand.x, hand.y, hand.r, hand.r), SKIN);
  if (spec.arm !== undefined) drawRobeFill(c, spec, f);
};

const segment =
  (a: readonly [number, number], b: readonly [number, number], w: number) =>
  (x: number, y: number) => {
    const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy)));
    return Math.hypot(x - (a[0] + t * dx), y - (a[1] + t * dy)) <= w;
  };

const drawLimb = (c: Canvas, spec: FigureSpec, f: Frame) => {
  const limb = spec.limb;
  if (limb === undefined) return;
  const { line } = spec;
  const [hx, hy] = limb.hand;
  const head = ellipse(spec.cx, spec.cy, spec.rx + line, spec.ry + line);
  const robe = f.robe(0);
  const off = (p: ReturnType<typeof within>): PixelTest =>
    within(p.box, (x, y) => p(x, y) && !robe(x, y) && !head(x, y));
  const points = [...(limb.from ?? []), limb.hand];
  const [xs, ys] = [points.map((q) => q[0]), points.map((q) => q[1])];
  const along = (w: number) =>
    within(
      [Math.min(...xs) - w, Math.min(...ys) - w, Math.max(...xs) + w, Math.max(...ys) + w],
      (x, y) =>
        limb.kind !== 'free' && points.slice(1).some((b, k) => segment(points[k]!, b, w)(x, y)),
    );
  const fill = limb.kind === 'bare' ? SKIN : (spec.robeShade ?? spec.robe ?? ROBE);
  c.fill(off(along(16 + line)), INK);
  c.fill(ellipse(hx, hy, 22 + line, 22 + line), INK);
  c.fill(off(along(16)), fill);
  if (limb.cuff === true) c.fill(ellipse(hx, hy, 22 + line, 22 + line), INK);
  c.fill(ellipse(hx, hy, 22, 22), SKIN);
};

const drawBareSkin = (c: Canvas, spec: FigureSpec, f: Frame) => {
  const bare = spec.bareSkin;
  if (bare === undefined) return;
  const head = ellipse(spec.cx, spec.cy, spec.rx + spec.line, spec.ry + spec.line);
  const top = bare.kind === 'chest' ? f.chin + 80 : f.chin - 4;
  const across = (x: number) =>
    bare.kind === 'yoke' ||
    (bare.kind === 'shoulders' && Math.abs(x - spec.cx) > 30) ||
    (bare.kind === 'chest' && Math.abs(x - spec.cx) <= 20);
  const robe = f.robe(0);
  c.fill(
    within(
      robe.box,
      (x, y) => robe(x, y) && y >= top && y <= top + bare.depth && across(x) && !head(x, y),
    ),
    SKIN,
  );
};

const drawHair = (c: Canvas, spec: FigureSpec) => {
  const { cx, cy, rx, ry, line } = spec;
  const head = ellipse(cx, cy, rx, ry);
  const hairLine = cy - spec.hairAbove;
  const box = head.box;
  const cap = within(box, (x, y) => head(x, y) && y < hairLine);
  const short = (spec.darkHair === true && HAIR_DARK) || HAIR;
  c.fill(cap, (spec.longHair === true && LOCKS) || short);
  const lock = spec.lockWidth ?? 14;
  const inLock = within(box, (x, y) => head(x, y) && y >= hairLine && Math.abs(x - cx) > rx - lock);
  if (spec.longHair === true) c.fill(inLock, LOCKS);
  if (spec.beard !== undefined) {
    const beardTop = cy + spec.eyeBelow + 16;
    c.fill(
      within(box, (x, y) => head(x, y) && y >= beardTop && !inLock(x, y)),
      LOCKS,
    );
    const seam = within(
      box,
      (x, y) =>
        head(x, y) &&
        y >= beardTop &&
        Math.abs(x - cx) > rx - lock - line &&
        Math.abs(x - cx) <= rx - lock,
    );
    if (spec.beard.parted) c.fill(seam, INK);
  }
  if (spec.litBand === true) {
    const [inner, past] = [
      ellipse(cx, cy, rx - 3, ry - 3),
      ellipse(cx + 10, cy + 10, rx - 3, ry - 3),
    ];
    c.fill(
      within(box, (x, y) => y < hairLine - 8 && x < cx && inner(x, y) && !past(x, y)),
      LOCKS_LIT,
    );
  }
  if (spec.darkHair === true)
    c.fill(
      within(box, (x, y) => cap(x, y) && (Math.floor(x) + 2 * Math.floor(y)) % 5 === 0),
      HAIR_SPECK,
    );
  if (spec.hairInk)
    c.fill(
      within(box, (x, y) => head(x, y) && y >= hairLine - line / 2 && y < hairLine + line / 2),
      INK,
    );
};

const drawEar = (c: Canvas, spec: FigureSpec) => {
  if (spec.ear === undefined) return;
  const ear = { x: spec.cx + 38, y: spec.cy + 8, rx: 10, ry: 18 };
  c.fill(ellipse(ear.x, ear.y, ear.rx + spec.line, ear.ry + spec.line), INK);
  c.fill(ellipse(ear.x, ear.y, ear.rx, ear.ry), SKIN);
  const [outer, inner] = [
    ellipse(ear.x, ear.y, ear.rx, ear.ry),
    ellipse(ear.x, ear.y, ear.rx - 5, ear.ry - 5),
  ];
  const rim = within(outer.box, (x, y) => outer(x, y) && !inner(x, y));
  if (spec.ear.rim) c.fill(rim, SKIN_LIGHT);
};

const drawFace = (c: Canvas, spec: FigureSpec) => {
  const { cy } = spec;
  const eyeX = spec.cx + (spec.eyeShift ?? 0);
  const tip = spec.roll ?? 0;
  const sides = spec.oneEye === true ? [Math.sign(spec.eyeShift ?? 0) || 1] : [-1, 1];
  for (const side of sides)
    c.fill(
      ellipse(
        eyeX + (side * spec.eyeGap) / 2,
        cy + spec.eyeBelow + (side * tip) / 2,
        spec.eyeW / 2,
        spec.eyeH / 2,
      ),
      INK,
    );
  if (spec.mouth === undefined) return;
  const { open, width } = spec.mouth;
  const y = cy + spec.eyeBelow + 25;
  c.fill(
    (open && ellipse(eyeX, y, width / 2, width / 4)) ||
      within(
        [eyeX - width / 2, y - 1.5, eyeX + width / 2, y + 1.5],
        (x, yy) => Math.abs(x - eyeX) <= width / 2 && Math.abs(yy - y) <= 1.5,
      ),
    INK,
  );
};

const drawn = MutableHashMap.empty<FigureSpec, Raster>();

export const drawFigure = (spec: FigureSpec = PLAIN): Raster => {
  const r = Option.getOrElse(MutableHashMap.get(drawn, spec), () => drawnFresh(spec));
  MutableHashMap.set(drawn, spec, r);
  return { ...r, rgba: r.rgba.slice() };
};

const drawnFresh = (spec: FigureSpec): Raster => {
  const c = canvasOf(400, 640);
  const { cx, cy, rx, ry, line } = spec;
  const f = frameOf(spec);
  for (const k of (spec.wall === true && Array.from({ length: 8 }, (_, i) => i)) || [])
    c.fill(
      within([0, 260 + 32 * k, 400, 263 + 32 * k], (_, y) => y >= 260 + 32 * k && y < 263 + 32 * k),
      INK,
    );
  for (const dx of (spec.feet === false && []) || [-40, 40]) {
    c.fill(ellipse(cx + dx, f.hem + 12, 24 + line, 10 + line), INK);
    c.fill(ellipse(cx + dx, f.hem + 12, 24, 10), SHOE);
  }
  c.fill(f.robe(line), INK);
  drawRobeFill(c, spec, f);
  drawArm(c, spec, f);
  drawBareSkin(c, spec, f);
  drawLimb(c, spec, f);
  c.fill(ellipse(cx, cy, rx + line, ry + line), INK);
  c.fill(ellipse(cx, cy, rx, ry), SKIN);
  drawHair(c, spec);
  if (spec.headcloth !== undefined) {
    const opening = ellipse(cx + (spec.eyeShift ?? 0), cy + spec.eyeBelow + 8, rx - 16, ry - 20);
    const cloth = ellipse(cx, cy, rx, ry);
    c.fill(
      within(cloth.box, (x, y) => cloth(x, y) && !opening(x, y)),
      spec.headcloth,
    );
  }
  drawEar(c, spec);
  if (spec.rail === true) {
    const bar = (pad: number): PixelTest =>
      within(
        [40 - pad, f.hem - 30 - pad, 360 + pad, f.hem + 40 + pad],
        (x, y) => x >= 40 - pad && x <= 360 + pad && y >= f.hem - 30 - pad && y <= f.hem + 40 + pad,
      );
    c.fill(bar(line), INK);
    c.fill(bar(0), WOOD);
  }
  drawFace(c, spec);
  return c.raster();
};

export const flipRaster = (r: Raster): Raster => {
  const rgba = new Uint8Array(r.rgba.length);
  for (let y = 0; y < r.height; y++)
    for (let x = 0; x < r.width; x++)
      rgba.set(
        r.rgba.subarray((y * r.width + x) * 4, (y * r.width + x) * 4 + 4),
        (y * r.width + (r.width - 1 - x)) * 4,
      );
  return { width: r.width, height: r.height, rgba };
};

export const drawSheet = (views: ReadonlyArray<Raster>): Raster => {
  const height = Math.max(...views.map((v) => v.height));
  const width = views.reduce((s, v) => s + v.width, 0);
  const rgba = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    rgba[i * 4] = PAPER[0];
    rgba[i * 4 + 1] = PAPER[1];
    rgba[i * 4 + 2] = PAPER[2];
    rgba[i * 4 + 3] = 255;
  }
  let left = 0;
  for (const v of views) {
    for (let y = 0; y < v.height; y++)
      rgba.set(v.rgba.subarray(y * v.width * 4, (y + 1) * v.width * 4), (y * width + left) * 4);
    left += v.width;
  }
  return { width, height, rgba };
};

export const headWidth = (spec: FigureSpec = PLAIN): number => 2 * (spec.rx + spec.line);
