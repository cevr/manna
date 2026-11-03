import { Array as Arr, Option, Result, Schema } from 'effect';
import {
  arcOf,
  type Box,
  componentsOf,
  deltaE,
  figuresOf,
  firstLabelIn,
  firstLabelInside,
  hexOf,
  inkByLuma,
  labOf,
  litSideOf,
  lumaOf,
  opaqueOf,
  outsideOf,
  labsOf,
  pairDiffs,
  within2,
  within3,
  papersOf,
  type Region,
  regionsOf,
  type Rgb,
  rgbAt,
  ringShareOf,
  type SheetFigure,
  saturationValueOf,
} from './cast-sheet-pixels.ts';
import {
  type FigureMeasure,
  type FigureRead,
  measureFigure,
  PixelBox,
  readFigure,
} from './figure.ts';
import { compareFigures } from './match.ts';
import { cropRaster, type Raster, type RasterPath, strokeRaster } from './raster.ts';

export const Slot = Schema.Literals(['front', 'left', 'right', 'back', 'free']);
export type Slot = typeof Slot.Type;

export const TURNAROUND_SLOTS: ReadonlyArray<Slot> = [
  'front',
  'left',
  'left',
  'back',
  'right',
  'right',
];

export const SheetKind = Schema.Literals(['turnaround', 'poses', 'heads', 'single']);
export type SheetKind = typeof SheetKind.Type;

export const keptFile = (kind: SheetKind, view: string): string =>
  (kind === 'single' && `kept/${view}.png`) || `kept/${kind}.png`;

export const CANON_HEADS = 3.36;

export interface ViewFigure {
  readonly view: number;
  readonly height: number;
  readonly heads: number;
}

export interface Stature {
  readonly height: number;
  readonly heads: number;
}

export const grownHeadsOf = (options: Pick<SheetOptions, 'heads'>): number =>
  options.heads ?? CANON_HEADS;

export const statureOf = (
  options: Pick<SheetOptions, 'heads' | 'figures'>,
  view: number,
): Stature =>
  Option.getOrElse(
    Arr.findFirst(options.figures ?? [], (f) => f.view === view),
    () => ({ height: 1, heads: grownHeadsOf(options) }),
  );

export interface SheetOptions {
  readonly kind: SheetKind;
  readonly count: number;
  readonly anchor: number;
  readonly slots?: ReadonlyArray<Slot>;
  readonly standing?: ReadonlyArray<number>;
  readonly level?: ReadonlyArray<number>;
  readonly headgear?: boolean;
  readonly heads?: number;
  readonly figures?: ReadonlyArray<ViewFigure>;
  readonly concepts?: ReadonlyArray<SheetConcept>;
}

export interface SheetConcept {
  readonly name: string;
  readonly measure: FigureMeasure;
  readonly view: number;
}

const TOLERANCE = 5;
const SQUASH_MAX = 10;
const FRONT_TURN = 0.06;
const SIDE_TURN = 0.04;
const ROLL_MAX = 5;
const MIRROR_FLOOR = 6;
const SAME_WAY = 0.8;
const PAPER_DE = 12;
const GROUND = 0.02;
const HAIR_FALL = 0.1;
const LINK = 0.5;
const REACH = 0.1;
const SKIN_DE = 14;
const SKIN_YELLOWER = 8;
const SKIN_PAPER = 6;
const HEAD_CORE = 0.95;
const DARK_LUMA = 115;
const PARTING_INK = 44;

export const SheetCheck = Schema.Literals([
  'facing',
  'sameWay',
  'roll',
  'squash',
  'height',
  'head',
  'width',
  'hand',
  'hairFall',
  'papers',
  'grey',
  'lit',
  'mirror',
  'profileWay',
  'ground',
  'sleeveReach',
  'bareArm',
  'hairBeard',
]);
export type SheetCheck = typeof SheetCheck.Type;

const SheetFlag = Schema.Struct({
  check: SheetCheck,
  views: Schema.Array(Schema.Int),
  value: Schema.Finite,
  limit: Schema.Finite,
  note: Schema.String,
});
type SheetFlag = typeof SheetFlag.Type;

const SheetUnmeasured = Schema.Struct({
  check: SheetCheck,
  view: Schema.Int,
  why: Schema.String,
});
type SheetUnmeasured = typeof SheetUnmeasured.Type;

const LitSide = Schema.Literals(['left', 'right', 'even']);
type LitSide = typeof LitSide.Type;

const SheetView = Schema.Struct({
  view: Schema.Int,
  slot: Slot,
  box: PixelBox,
  height: Schema.Finite,
  widthToHeight: Schema.Finite,
  head: Schema.optionalKey(Schema.Finite),
  headWidth: Schema.optionalKey(Schema.Finite),
  eyes: Schema.optionalKey(Schema.Finite),
  headsTall: Schema.optionalKey(Schema.Finite),
  turn: Schema.optionalKey(Schema.Finite),
  roll: Schema.optionalKey(Schema.Finite),
  hand: Schema.optionalKey(Schema.Finite),
  hairFall: Schema.optionalKey(Schema.Finite),
  hairBeard: Schema.optionalKey(Schema.Literals(['parted', 'merged'])),
  chin: Schema.optionalKey(Schema.Literals(['closed', 'open'])),
  lit: LitSide,
  papers: Schema.Array(
    Schema.Struct({
      rgb: Schema.Tuple([Schema.Int, Schema.Int, Schema.Int]),
      share: Schema.Finite,
    }),
  ),
  reach: Schema.optionalKey(Schema.Finite),
  free: Schema.optionalKey(Schema.Int),
  bare: Schema.Int,
});
type SheetView = typeof SheetView.Type;

const SheetPair = Schema.Struct({
  views: Schema.Tuple([Schema.Int, Schema.Int]),
  flipped: Schema.Finite,
  straight: Schema.Finite,
  widths: Schema.Finite,
});

const SheetConceptRows = Schema.Struct({
  name: Schema.String,
  view: Schema.Int,
  rows: Schema.Int,
  flagged: Schema.Array(Schema.String),
});

const SheetSide = Schema.Struct({
  views: Schema.Tuple([Schema.Int, Schema.Int]),
  flipped: Schema.Finite,
  straight: Schema.Finite,
});

export const SheetMeasure = Schema.Struct({
  kind: SheetKind,
  anchor: Schema.Int,
  found: Schema.Int,
  views: Schema.Array(SheetView),
  pairs: Schema.Array(SheetPair),
  sides: Schema.Array(SheetSide),
  canon: Schema.Struct({
    heads: Schema.optionalKey(Schema.Finite),
    against: Schema.optionalKey(Schema.Finite),
    squash: Schema.optionalKey(Schema.Finite),
  }),
  flags: Schema.Array(SheetFlag),
  unmeasured: Schema.Array(SheetUnmeasured),
  concepts: Schema.Array(SheetConceptRows),
});
export type SheetMeasure = typeof SheetMeasure.Type;

class SheetUnread extends Schema.TaggedError<SheetUnread>()('SheetUnread', {
  reason: Schema.String,
}) {
  override get message() {
    return `the sheet does not read: ${this.reason}`;
  }
}

interface ViewRead {
  readonly record: SheetView;
  readonly crop: Raster;
  readonly measure: Option.Option<FigureRead>;
  readonly full: Option.Option<FigureMeasure>;
  readonly unmeasured: ReadonlyArray<SheetUnmeasured>;
}

const PAD = 12;

const ratioOf = (m: FigureRead, ratio: FigureRead['ratios'][number]['ratio']) =>
  Option.map(
    Arr.findFirst(m.ratios, (r) => r.ratio === ratio),
    (r) => r.value,
  );

interface HeadFrame {
  readonly W: number;
  readonly H: number;
  readonly cx: number;
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly chin: number;
  readonly eyeY: number;
  readonly faceX: number;
  readonly mouthY: number;
}

const headFrameOf = (m: FigureRead): HeadFrame => {
  const [x0, y0, x1, y1] = m.head;
  const W = x1 - x0;
  const cy = (y0 + y1) / 2;
  const eyeBelow = Option.getOrElse(ratioOf(m, 'eyeBelowCentre'), () => 0.1);
  const eyeY = cy + eyeBelow * W;
  return {
    W,
    H: y1 - y0,
    cx: (x0 + x1) / 2,
    left: x0,
    right: x1,
    top: y0,
    chin: y1,
    eyeY,
    faceX: (x0 + x1) / 2 + m.facing.turn * W,
    mouthY: Option.getOrElse(
      Option.map(ratioOf(m, 'mouthBelowCentre'), (v) => cy + v * W),
      () => eyeY + 0.22 * W,
    ),
  };
};

const clothedFrame = (f: HeadFrame, box: Box, closed: Uint8Array, width: number): HeadFrame => {
  const y = Math.round(f.eyeY);
  const x = Math.round(f.faceX);
  const on = (at: number) => at >= 0 && at < width && closed[y * width + at] === 1;
  let [l, r] = [x, x];
  while (l > f.left && on(l - 1)) l--;
  while (r < f.right && on(r + 1)) r++;
  const [left, right] = [Math.max(f.left, l), Math.min(f.right, r + 1)];
  const chin = Math.min(f.chin, box[3]);
  return { ...f, W: right - left, H: chin - f.top, cx: (left + right) / 2, left, right, chin };
};

const skinOf = (crop: Raster, inside: Uint8Array, f: HeadFrame): Option.Option<Rgb> => {
  const at: Array<number> = [];
  for (let y = Math.round(f.eyeY); y < f.eyeY + 0.12 * f.W; y++)
    for (let x = Math.round(f.faceX - 0.3 * f.W); x < f.faceX + 0.3 * f.W; x++) {
      const i = y * crop.width + x;
      if (
        x >= 0 &&
        x < crop.width &&
        y >= 0 &&
        y < crop.height &&
        inside[i] === 1 &&
        lumaOf(rgbAt(crop, i)) >= DARK_LUMA
      )
        at.push(i);
    }
  if (at.length < 30) return Option.none();
  const ch = [0, 1, 2].map((k) => {
    const v = at.map((i) => crop.rgba[i * 4 + k] ?? 0).sort((a, b) => a - b);
    return v[Math.floor(v.length / 2)] ?? 0;
  });
  return Option.some([ch[0] ?? 0, ch[1] ?? 0, ch[2] ?? 0]);
};

const hueOf = (lab: Rgb) => (Math.atan2(lab[2], lab[1]) * 180) / Math.PI;

const skinTest = (skin: Rgb) => {
  const hue = hueOf(skin);
  return (c: Rgb) => {
    const lab = labOf(c);
    return deltaE(lab, skin) < SKIN_DE && hueOf(lab) - hue <= SKIN_YELLOWER;
  };
};

const offLine = (c: Rgb, a: Rgb, b: Rgb) => {
  const [dr, dg, db] = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const t = Math.max(
    0,
    Math.min(
      1,
      ((c[0] - a[0]) * dr + (c[1] - a[1]) * dg + (c[2] - a[2]) * db) /
        (dr ** 2 + dg ** 2 + db ** 2 || 1),
    ),
  );
  return Math.hypot(c[0] - a[0] - t * dr, c[1] - a[1] - t * dg, c[2] - a[2] - t * db);
};

const SOFT_EDGE = 24;
const LIGHT_EDGE: Rgb = [255, 248, 230];

type SkinPart =
  | { readonly kind: 'hand'; readonly region: Region; readonly cloth: number }
  | { readonly kind: 'bare'; readonly region: Region }
  | { readonly kind: 'masked'; readonly region: Region };

const skinRegionsOf = (crop: Raster, inside: Uint8Array, skin: Rgb): ReadonlyArray<Region> => {
  const lab = labOf(skin);
  const labAt = labsOf(crop);
  const mask = new Uint8Array(inside.length);
  for (let i = 0; i < inside.length; i++)
    mask[i] = Number(inside[i] === 1 && deltaE(labAt(i), lab) < SKIN_PAPER);
  return regionsOf(crop, mask, 30);
};

const NECK_WIDTH = 0.6;
const NECK_TALL = 0.5;
const HAND_ASPECT: readonly [number, number] = [0.75, 1.33];
const HAND_FILL: readonly [number, number] = [0.8, 1.1];
const HAND_SIZE: readonly [number, number] = [0.4, 1.3];
const CLIPPED_CLOTH = 0.35;

const within = (v: number, [lo, hi]: readonly [number, number]) => v >= lo && v <= hi;

const holdsEyes = (region: Region, f: HeadFrame) => {
  const [x0, y0, x1, y1] = region.box;
  return x0 <= f.faceX && x1 >= f.faceX && y0 <= f.eyeY && y1 >= f.eyeY;
};

const facePart = (region: Region, f: HeadFrame) => {
  const [x0, y0, x1, y1] = region.box;
  const [mx, my] = [(x0 + x1) / 2, (y0 + y1) / 2];
  const onHead =
    mx >= f.left - 0.1 * f.W &&
    mx <= f.right + 0.1 * f.W &&
    my >= f.top &&
    my <= Math.max(f.chin, f.mouthY + 0.3 * f.W);
  return holdsEyes(region, f) || onHead;
};

interface SkinFrame {
  readonly sole: number;
  readonly height: number;
  readonly hand: Option.Option<number>;
  readonly hands: boolean;
  readonly cloth: (region: Region) => number;
}

const isNeck = (region: Region, f: HeadFrame) => {
  const [x0, y0, x1, y1] = region.box;
  return (
    y0 <= f.chin + 0.5 * f.W &&
    Math.abs((x0 + x1) / 2 - f.cx) < 0.35 * f.W &&
    x1 - x0 <= NECK_WIDTH * f.W &&
    y1 - y0 <= NECK_TALL * f.W
  );
};

const roundOf = (region: Region, frame: SkinFrame) => {
  const [x0, y0, x1, y1] = region.box;
  const [bw, bh] = [x1 - x0, y1 - y0];
  const sized = Option.match(frame.hand, {
    onNone: () => true,
    onSome: (d) => within(Math.max(bw, bh) / d, HAND_SIZE),
  });
  const round =
    within(bw / bh, HAND_ASPECT) &&
    within(region.area / ((Math.PI * bw * bh) / 4), HAND_FILL) &&
    sized;
  return { sized, round };
};

const maskedBy = (region: Region, f: HeadFrame, neck: boolean) => {
  const [x0, y0, x1, y1] = region.box;
  const pastHead = x0 < f.left || x1 > f.right || y1 > f.chin;
  return (
    !holdsEyes(region, f) &&
    ((neck && (y0 + y1) / 2 >= f.chin) || (facePart(region, f) && pastHead))
  );
};

const skinPartsOf = (
  regions: ReadonlyArray<Region>,
  f: HeadFrame,
  frame: SkinFrame,
): ReadonlyArray<SkinPart> =>
  regions.flatMap((region): ReadonlyArray<SkinPart> => {
    const neck = isNeck(region, f);
    const feet = region.box[3] >= frame.sole - 0.06 * frame.height;
    const { sized, round } = roundOf(region, frame);
    const masked = frame.hands && round && maskedBy(region, f, neck);
    if (masked) return [{ kind: 'masked', region }];
    if (facePart(region, f) || neck || feet) return [];
    const bare: ReadonlyArray<SkinPart> =
      (region.area >= 0.02 * f.W * f.W && [{ kind: 'bare', region }]) || [];
    if (!frame.hands) return bare;
    const cloth = frame.cloth(region);
    const clipped = Option.isSome(frame.hand) && sized && cloth < CLIPPED_CLOTH;
    return ((round || clipped) && [{ kind: 'hand', region, cloth }]) || bare;
  });

const beardOf = (
  labels: Int32Array,
  ink: Uint8Array,
  width: number,
  f: HeadFrame,
  fills: ReadonlyArray<{ readonly id: number; readonly box: Box }>,
): Option.Option<{ readonly id: number; readonly merged: boolean }> =>
  Option.flatMap(
    Option.liftPredicate(
      firstLabelInside(
        labels,
        ink,
        width,
        { from: f.mouthY + 0.04 * f.W, to: f.chin + 0.35 * f.W, cx: f.faceX, half: 0.15 * f.W },
        (id) => fills.some((c) => c.id === id),
      ),
      (b) => b >= 0,
    ),
    (id) =>
      Option.map(
        Arr.findFirst(fills, (c) => c.id === id),
        (c) => ({ id, merged: c.box[1] < f.eyeY - 0.05 * f.W }),
      ),
  );

const hairOf = (
  crop: Raster,
  m: FigureRead,
  f: HeadFrame,
): Option.Option<{
  readonly crown: number;
  readonly beard: Option.Option<{ readonly id: number; readonly merged: boolean }>;
  readonly lowest: number;
}> => {
  const dark = new Uint8Array(crop.width * crop.height);
  const inkLike = new Uint8Array(crop.width * crop.height);
  const ink: Rgb = [m.ink[0], m.ink[1], m.ink[2]];
  for (let i = 0; i < dark.length; i++) {
    const c = rgbAt(crop, i);
    const near = within3(c[0] - ink[0], c[1] - ink[1], c[2] - ink[2], PARTING_INK);
    if (lumaOf(c) < DARK_LUMA) {
      dark[i] = Number(!near);
      inkLike[i] = Number(near);
    }
  }
  const { components, labels } = componentsOf(dark, crop.width, crop.height, false);
  const inHead = new Set<number>();
  const [cy, rx, ry] = [(f.top + f.chin) / 2, (HEAD_CORE * f.W) / 2, (HEAD_CORE * f.H) / 2];
  for (let i = 0; i < labels.length; i++) {
    const [x, y] = [i % crop.width, Math.floor(i / crop.width)];
    const id = labels[i] ?? -1;
    if (id >= 0 && ((x - f.cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1) inHead.add(id);
  }
  const big = components.filter((c) => c.area >= 0.01 * f.W * f.W);
  const fills = big.filter((c) => inHead.has(c.id));
  const head = new Set(fills.map((c) => c.id));
  const admit = (id: number) => head.has(id);
  const crown = firstLabelIn(
    labels,
    crop.width,
    { from: Math.max(0, f.top), to: f.eyeY - 0.2 * f.W, cx: f.cx, half: 0.25 * f.W },
    admit,
  );
  if (crown < 0) return Option.none();
  const beard = beardOf(labels, inkLike, crop.width, f, big);
  const onHead = fills.filter((c) => !Option.exists(beard, (b) => b.id === c.id && b.id !== crown));
  return Option.some({ crown, beard, lowest: Math.max(f.top, ...onHead.map((c) => c.box[3])) });
};

interface SideRow {
  readonly y: number;
  readonly left: number;
  readonly right: number;
}

interface HandDisc {
  readonly x: number;
  readonly y: number;
  readonly r: number;
  readonly clear: number;
}

const discsOf = (
  hands: ReadonlyArray<Region>,
  line: number,
  hand: Option.Option<number>,
): ReadonlyArray<HandDisc> =>
  hands.map((h) => {
    const [x0, y0, x1, y1] = h.box;
    const r = Math.max(
      Math.max(x1 - x0, y1 - y0) / 2,
      Option.getOrElse(
        Option.map(hand, (d) => d / 2 - line),
        () => 0,
      ),
    );
    return { x: (x0 + x1) / 2, y: (y0 + y1) / 2, r, clear: r + 1.5 * line };
  });

interface BodyColumns {
  readonly from: Int32Array;
  readonly to: Int32Array;
}

const bodyColumnsOf = (crop: Raster, body: PixelBox): BodyColumns => {
  const { width: w, height: h } = crop;
  const { components, labels } = componentsOf(inkByLuma(crop), w, h, true);
  const ring = Arr.findFirst(components, (c) => c.box.every((v, k) => v === body[k]));
  const from = new Int32Array(h).fill(Math.max(0, Math.floor(body[0])));
  const to = new Int32Array(h).fill(Math.min(w, body[2]));
  if (Option.isNone(ring)) return { from, to };
  const id = ring.value.id;
  for (let y = 0; y < h; y++) {
    let [l, r] = [w, -1];
    for (let x = from[y] ?? 0; x < (to[y] ?? 0); x++)
      if (labels[y * w + x] === id) [l, r] = [Math.min(l, x), x];
    if (r >= l) [from[y], to[y]] = [l, r + 1];
  }
  return { from, to };
};

const sideRowsOf = (
  crop: Raster,
  closed: Uint8Array,
  discs: ReadonlyArray<HandDisc>,
  rows: { readonly from: number; readonly to: number },
  columns: BodyColumns,
): ReadonlyArray<SideRow> => {
  const out: Array<SideRow> = [];
  for (let y = Math.max(0, Math.round(rows.from)); y < rows.to && y < crop.height; y++) {
    let [left, right] = [crop.width, -1];
    for (let x = columns.from[y] ?? 0; x < (columns.to[y] ?? 0); x++)
      if (
        closed[y * crop.width + x] === 1 &&
        !discs.some((d) => within2(x - d.x, y - d.y, d.clear, true))
      ) {
        left = Math.min(left, x);
        right = Math.max(right, x);
      }
    if (right >= left) out.push({ y, left, right });
  }
  return out;
};

const sideOf = (row: SideRow, toward: number) => (toward > 0 && row.right) || row.left;

interface ReachFrame {
  readonly labels: Int32Array;
  readonly body: number;
  readonly width: number;
  readonly rows: ReadonlyArray<SideRow>;
  readonly discs: ReadonlyArray<HandDisc>;
  readonly middle: number;
  readonly line: number;
  readonly head: HeadFrame;
}

type HandReach =
  | { readonly read: true; readonly joined: true; readonly reach: number }
  | { readonly read: true; readonly joined: false }
  | { readonly read: false; readonly why: string };

const linked = (frame: ReachFrame, d: HandDisc) =>
  arcOf(frame.labels, frame.width, { x: d.x, y: d.y, radius: d.clear + 1 }, frame.body) >=
  LINK * d.r;

const handReachOf = (frame: ReachFrame, d: HandDisc): HandReach => {
  if (!linked(frame, d)) return { read: true, joined: false };
  const toward = Math.sign(d.x - frame.middle) || 1;
  const under = frame.rows
    .filter((row) => row.y > d.y + d.r + 2 * frame.line && row.y <= d.y + 3 * d.r)
    .map((row) => sideOf(row, toward));
  const raised = d.y + d.r < frame.head.chin + 0.25 * frame.head.W;
  if (!raised && under.length < 3)
    return { read: false, why: "the body's side under a hand does not read" };
  const side =
    (raised && frame.head.cx + toward * (frame.head.W / 2)) ||
    (under.sort((a, b) => a - b)[Math.floor(under.length / 2)] ?? d.x);
  const out = toward * (d.x - side);
  const gap = out - d.r - frame.line;
  if (out <= d.r || gap <= REACH * 2 * d.r)
    return {
      read: false,
      why:
        (raised && 'a hand in front of the head: a sleeve to it is not told from a touch') ||
        'a hand at rest against the body: a sleeve to it is not told from a touch',
    };
  return { read: true, joined: true, reach: gap / (2 * d.r) };
};

const garmentRowsOf = (
  crop: Raster,
  inside: Uint8Array,
  span: { readonly top: number; readonly height: number },
  skin: Option.Option<Rgb>,
): ReadonlyArray<ReadonlyArray<number>> => {
  const isSkin = Option.map(skin, (s) => skinTest(labOf(s)));
  const rows: Array<Array<number>> = [];
  for (
    let y = Math.round(span.top + 0.55 * span.height);
    y < span.top + 0.85 * span.height && y < crop.height;
    y++
  ) {
    const row: Array<number> = [];
    for (let x = 0; x < crop.width; x++) {
      const i = y * crop.width + x;
      const c = rgbAt(crop, i);
      if (
        inside[i] === 1 &&
        !Option.exists(isSkin, (test) => test(c)) &&
        lumaOf(c) >= DARK_LUMA * 0.6
      )
        row.push(i);
    }
    rows.push(row);
  }
  return rows;
};

const litOf = (votes: { readonly left: number; readonly right: number }): LitSide => {
  if (votes.left >= 3 && votes.left > 1.5 * votes.right) return 'left';
  if (votes.right >= 3 && votes.right > 1.5 * votes.left) return 'right';
  return 'even';
};

interface Closed {
  readonly inside: Uint8Array;
  readonly closed: Uint8Array;
}

const closedOf = (crop: Raster): Closed => {
  const lumaInk = inkByLuma(crop);
  const outside = outsideOf(crop, lumaInk);
  const [inside, closed] = [new Uint8Array(outside.length), new Uint8Array(outside.length)];
  for (let i = 0; i < outside.length; i++) {
    closed[i] = Number(outside[i] === 0);
    inside[i] = Number(outside[i] === 0 && lumaInk[i] === 0);
  }
  return { inside, closed };
};

const reachesOf = (
  crop: Raster,
  closed: Uint8Array,
  frame: Omit<ReachFrame, 'labels' | 'body' | 'width'>,
) => {
  const cut = new Uint8Array(closed.length);
  for (let i = 0; i < closed.length; i++) {
    const [x, y] = [i % crop.width, Math.floor(i / crop.width)];
    cut[i] = Number(
      closed[i] === 1 && !frame.discs.some((d) => within2(x - d.x, y - d.y, d.clear, true)),
    );
  }
  const { components, labels } = componentsOf(cut, crop.width, crop.height, false);
  const body = [...components].sort((a, b) => b.area - a.area)[0]?.id ?? -1;
  const full = { ...frame, labels, body, width: crop.width };
  return frame.discs.map((d) => handReachOf(full, d));
};

const readMeasured = (
  crop: Raster,
  m: FigureRead,
  { inside, closed }: Closed,
  ctx: {
    readonly view: number;
    readonly kind: SheetKind;
    readonly headgear: boolean;
    readonly top: number;
    readonly height: number;
    readonly middle: number;
    readonly columns: BodyColumns;
  },
) => {
  const f = headFrameOf(m);
  const skin = skinOf(crop, inside, f);
  const line = Option.getOrElse(ratioOf(m, 'outline'), () => 0.05) * f.W;
  const hands = ctx.kind !== 'heads';
  const regions = Option.match(skin, {
    onNone: () => [],
    onSome: (s) => skinRegionsOf(crop, inside, s),
  });
  const faceOpening = Arr.findFirst(
    regions,
    (r) =>
      r.box[0] <= f.faceX &&
      r.box[2] > f.faceX &&
      r.box[1] <= f.eyeY &&
      r.box[3] > f.eyeY &&
      r.box[3] <= m.head[3] + 0.1 * f.H,
  );
  const at = Option.getOrElse(
    Option.filter(
      Option.map(faceOpening, (r) => clothedFrame(f, r.box, closed, crop.width)),
      () => ctx.headgear,
    ),
    () => f,
  );
  const sole = ctx.top + ctx.height;
  const ink: Rgb = [m.ink[0], m.ink[1], m.ink[2]];
  const handSize = Option.map(ratioOf(m, 'hand'), (d) => d * f.W);
  const parts = Option.match(skin, {
    onNone: () => [],
    onSome: (s) => {
      const near = skinTest(labOf(s));
      const cloth = (i: number) => {
        const c = rgbAt(crop, i);
        return (
          inside[i] === 1 &&
          !near(c) &&
          offLine(c, s, ink) > SOFT_EDGE &&
          offLine(c, s, LIGHT_EDGE) > SOFT_EDGE
        );
      };
      return skinPartsOf(regions, at, {
        sole,
        height: ctx.height,
        hand: handSize,
        hands,
        cloth: (region) =>
          ringShareOf(crop, region, { near: 2, depth: Math.max(3, Math.round(0.8 * line)) }, cloth),
      });
    },
  });
  const handParts = parts.flatMap((p) => (p.kind === 'hand' && [p]) || []);
  const masked = parts.some((p) => p.kind === 'masked');
  const unmeasured: Array<SheetUnmeasured> = [];
  if (masked)
    unmeasured.push(
      ...(['sleeveReach', 'bareArm'] as const).map((check) => ({
        check,
        view: ctx.view,
        why: 'a hand in front of the head or the neck: no sleeve or arm to it is read',
      })),
    );
  if (Option.isNone(skin))
    unmeasured.push(
      ...(['sleeveReach', 'bareArm'] as const).map((check) => ({
        check,
        view: ctx.view,
        why: 'no skin reads under the eyes',
      })),
    );
  const head =
    (ctx.headgear && Option.map(faceOpening, (r) => r.box[3] - r.box[1])) ||
    Option.some(m.head[3] - m.head[1]);
  const hair = Option.filter(hairOf(crop, m, f), () => !ctx.headgear);
  if (ctx.headgear)
    unmeasured.push({
      check: 'hairBeard',
      view: ctx.view,
      why: 'headgear: the cloth hides the hair, so no parting is read',
    });
  if (Option.isNone(hair) && !ctx.headgear)
    unmeasured.push({ check: 'hairBeard', view: ctx.view, why: 'no dark hair reads at the crown' });
  if (Option.exists(hair, (h) => Option.isNone(h.beard)))
    unmeasured.push({ check: 'hairBeard', view: ctx.view, why: 'no beard reads under the mouth' });
  const fallen = Option.getOrElse(
    Option.map(hair, (h) => h.lowest + line),
    () => at.chin,
  );
  const discs = discsOf(
    handParts.map((p) => p.region),
    line,
    handSize,
  );
  const rows = sideRowsOf(
    crop,
    closed,
    discs,
    { from: Math.max(at.chin + 0.05 * ctx.height, fallen), to: sole - 0.08 * ctx.height },
    ctx.columns,
  );
  const reaches =
    (hands && reachesOf(crop, closed, { rows, discs, middle: ctx.middle, line, head: at })) || [];
  const read = reaches.flatMap((r) => (r.read && r.joined && [r.reach]) || []);
  const free = reaches.filter((r) => r.read && !r.joined).length;
  const whys = [...new Set(reaches.flatMap((r) => (!r.read && [r.why]) || []))];
  unmeasured.push(
    ...whys.map((why) => ({ check: 'sleeveReach' as const, view: ctx.view, why })),
    ...((hands &&
      Option.isSome(skin) &&
      handParts.length === 0 && [
        {
          check: 'sleeveReach' as const,
          view: ctx.view,
          why: 'no round hand reads, so no sleeve is read to one',
        },
      ]) ||
      []),
  );
  return {
    f,
    skin,
    parts,
    head,
    hair,
    discs,
    reach: Option.liftPredicate(Math.max(0, ...read), () => read.length > 0),
    free: Option.liftPredicate(free, () => reaches.some((r) => r.read)),
    unmeasured,
  };
};

const FACELESS: ReadonlyArray<SheetCheck> = ['facing', 'hairBeard', 'sleeveReach', 'bareArm'];

const BODY_BAND: readonly [number, number] = [0.76, 0.9];

const bodyWidthOf = (
  crop: Raster,
  closed: Uint8Array,
  discs: ReadonlyArray<HandDisc>,
  span: { readonly top: number; readonly height: number },
  columns: BodyColumns,
) => {
  const widths = sideRowsOf(
    crop,
    closed,
    discs,
    { from: span.top + BODY_BAND[0] * span.height, to: span.top + BODY_BAND[1] * span.height },
    columns,
  )
    .map((row) => row.right - row.left + 1)
    .sort((a, b) => a - b);
  return (widths[Math.floor(widths.length / 2)] ?? 0) / span.height;
};

const readView = (
  sheet: Raster,
  figure: SheetFigure,
  view: number,
  slot: Slot,
  options: SheetOptions,
): ViewRead => {
  const [x0, y0, x1, y1] = figure.box;
  const [ox, oy] = [Math.max(0, x0 - PAD), Math.max(0, y0 - PAD)];
  const crop = cropRaster(sheet, [x0 - PAD, y0 - PAD, x1 + PAD, y1 + PAD]);
  const height = y1 - y0;
  const heldToConcept = (options.concepts || []).some((c) => c.view === view);
  const full = Option.flatMap(
    Option.liftPredicate(crop, () => heldToConcept),
    (c) => Result.getSuccess(measureFigure(c)),
  );
  const lean = Option.match(full, {
    onNone: () => readFigure(crop),
    onSome: (m) => Result.succeed<FigureRead>(m),
  });
  const measure = Result.getSuccess(lean);
  const span = { top: y0 - oy, height };
  const middle = (figure.body[0] + figure.body[2]) / 2 - ox;
  const closed = closedOf(crop);
  const columns = bodyColumnsOf(crop, [
    figure.body[0] - ox,
    figure.body[1] - oy,
    figure.body[2] - ox,
    figure.body[3] - oy,
  ]);
  const read = Option.map(measure, (m) =>
    readMeasured(crop, m, closed, {
      view,
      kind: options.kind,
      headgear: options.headgear === true,
      top: span.top,
      height,
      middle,
      columns,
    }),
  );
  const skin = Option.flatMap(read, (r) => r.skin);
  const garment = garmentRowsOf(crop, closed.inside, span, skin);
  const papers = (options.kind !== 'heads' && papersOf(crop, garment.flat())) || [];
  const lit: LitSide = (options.kind !== 'heads' && litOf(litSideOf(crop, garment))) || 'even';
  const discs = Option.match(read, { onNone: () => [], onSome: (r) => r.discs });
  const record: SheetView = {
    view,
    slot,
    box: figure.box,
    height,
    widthToHeight: bodyWidthOf(crop, closed.closed, discs, span, columns),
    lit,
    papers: papers.map((p) => ({ rgb: p.rgb, share: p.share })),
    bare: Option.match(read, {
      onNone: () => 0,
      onSome: (r) => r.parts.filter((p) => p.kind === 'bare').length,
    }),
    ...Option.match(Option.all([read, measure]), {
      onNone: () => ({}),
      onSome: ([r, m]) => measuredFields(r, height, m, options),
    }),
    ...Option.match(measure, { onNone: () => ({}), onSome: (m) => facingFields(m) }),
  };
  const faceless = Result.match(lean, { onFailure: (e) => e.reason, onSuccess: () => '' });
  const unmeasured = Option.match(read, {
    onNone: () =>
      FACELESS.map((check) => ({
        check,
        view,
        why: `no face reads, so no head, skin or hair to read from: ${faceless}`,
      })),
    onSome: (r) => r.unmeasured,
  });
  return { record, crop, measure, full, unmeasured };
};

const facingFields = (m: FigureRead) => ({
  turn: m.facing.turn,
  roll: m.facing.roll,
  eyes: m.facing.eyes,
});

const partingOf = (merged: boolean): 'parted' | 'merged' => (merged && 'merged') || 'parted';

const measuredFields = (
  r: ReturnType<typeof readMeasured>,
  height: number,
  m: FigureRead,
  options: SheetOptions,
) => {
  const head = Option.match(r.head, {
    onNone: () => ({}),
    onSome: (h) => ({ head: h, headWidth: r.f.W, headsTall: height / h }),
  });
  const hand = Option.match(
    Option.filter(Option.all([ratioOf(m, 'hand'), r.head]), () => options.kind !== 'heads'),
    {
      onNone: () => ({}),
      onSome: ([d, h]) => ({ hand: (d * r.f.W) / h }),
    },
  );
  const hair = Option.match(r.hair, {
    onNone: () => ({}),
    onSome: (h) => {
      const merged = Option.exists(h.beard, (b) => b.merged || b.id === h.crown);
      const beard = Option.match(h.beard, {
        onNone: () => ({}),
        onSome: () => ({ hairBeard: partingOf(merged) }),
      });
      const fall = ((merged || options.headgear === true) && {}) || {
        hairFall: (h.lowest - r.f.chin) / r.f.H,
      };
      return { ...beard, ...fall };
    },
  });
  const reach = Option.match(r.reach, { onNone: () => ({}), onSome: (v) => ({ reach: v }) });
  const free = Option.match(r.free, { onNone: () => ({}), onSome: (v) => ({ free: v }) });
  const chin = Option.getOrElse(Option.fromUndefinedOr(m.chin), () => 'closed' as const);
  return { ...head, ...hand, ...hair, ...reach, ...free, chin };
};

const pct = (a: number, b: number) => (100 * (a - b)) / b;

const flag = (
  check: SheetCheck,
  views: ReadonlyArray<number>,
  value: number,
  limit: number,
  note: string,
): SheetFlag => ({
  check,
  views: [...views],
  value,
  limit,
  note,
});

const facingFlags = (views: ReadonlyArray<SheetView>): ReadonlyArray<SheetFlag> =>
  views.flatMap((v) =>
    Option.match(Option.fromUndefinedOr(v.turn), {
      onNone: () => [],
      onSome: (turn): ReadonlyArray<SheetFlag> => {
        if (v.slot === 'back')
          return [flag('facing', [v.view], turn, 0, 'a face reads on the back view')];
        if (v.slot === 'free') return [];
        if (v.slot === 'front')
          return (
            (Math.abs(turn) > FRONT_TURN && [
              flag(
                'facing',
                [v.view],
                turn,
                FRONT_TURN,
                'the front view turns to a side: a redraw',
              ),
            ]) ||
            []
          );
        const right = v.slot === 'right';
        const ok = (right && turn > SIDE_TURN) || (!right && turn < -SIDE_TURN);
        return (
          (!ok && [
            flag(
              'facing',
              [v.view],
              turn,
              SIDE_TURN,
              `the view's slot faces the viewer's ${v.slot}, its head does not: a redraw, never a rename`,
            ),
          ]) ||
          []
        );
      },
    }),
  );

const rollFlags = (views: ReadonlyArray<SheetView>, kind: SheetKind): ReadonlyArray<SheetFlag> =>
  views.flatMap((v) =>
    Option.match(
      Option.filter(
        Option.fromUndefinedOr(v.roll),
        (roll) => kind === 'turnaround' && Math.abs(roll) > ROLL_MAX,
      ),
      {
        onNone: () => [],
        onSome: (roll) => [
          flag('roll', [v.view], roll, ROLL_MAX, 'a turnaround head tipped: a redraw'),
        ],
      },
    ),
  );

const HEADS_LEAST = 2;

const headless = (v: SheetView): SheetView => {
  const {
    head: _head,
    headWidth: _width,
    headsTall: _tall,
    hand: _hand,
    hairFall: _fall,
    ...rest
  } = v;
  return rest;
};

interface Canon {
  readonly heads?: number;
  readonly against?: number;
  readonly squash?: number;
}

const canonOf = (anchor: SheetView, headgear: boolean, against: number): Canon =>
  (headgear && {}) ||
  Option.match(Option.fromUndefinedOr(anchor.headsTall), {
    onNone: () => ({ against }),
    onSome: (heads) => ({ heads, against, squash: 100 * (1 - (against - 1) / (heads - 1)) }),
  });

const squashFlags = (canon: Canon, anchor: number): ReadonlyArray<SheetFlag> =>
  Option.match(
    Option.filter(Option.fromUndefinedOr(canon.squash), (squash) => Math.abs(squash) > SQUASH_MAX),
    {
      onNone: () => [],
      onSome: (squash) => {
        const what = (squash > 0 && 'squash') || 'stretch';
        return [
          flag(
            'squash',
            [anchor],
            squash,
            SQUASH_MAX,
            `a trace to its ${canon.against ?? CANON_HEADS} heads would ${what} the body ${Math.abs(squash).toFixed(0)} %: a redraw`,
          ),
        ];
      },
    },
  );

const heldTo = (
  views: ReadonlyArray<SheetView>,
  anchor: SheetView,
  check: SheetCheck,
  read: (v: SheetView) => Option.Option<number>,
  within: (
    value: number,
    against: number,
  ) => Option.Option<{ readonly value: number; readonly limit: number; readonly note: string }>,
): ReadonlyArray<SheetFlag> =>
  views.flatMap((v) => {
    const off = Option.flatMap(Option.all([read(v), read(anchor)]), ([value, against]) =>
      Option.filter(within(value, against), () => v.view !== anchor.view),
    );
    return Option.match(off, {
      onNone: () => [],
      onSome: (d) => [flag(check, [v.view, anchor.view], d.value, d.limit, d.note)],
    });
  });

const percentOff =
  (what: string, whose = "the anchor's") =>
  (value: number, against: number) => {
    const d = pct(value, against);
    return Option.liftPredicate(
      { value: d, limit: TOLERANCE, note: `${what} ${d.toFixed(1)} % off ${whose}` },
      () => Math.abs(d) > TOLERANCE,
    );
  };

const headsFlags = (
  views: ReadonlyArray<SheetView>,
  anchor: SheetView,
  level: ReadonlyArray<number>,
): ReadonlyArray<SheetFlag> => [
  ...heldTo(
    views.filter((v) => level.includes(v.view)),
    anchor,
    'head',
    (v) => Option.filter(Option.fromUndefinedOr(v.head), () => level.includes(anchor.view)),
    percentOff('the head'),
  ),
  ...[...new Set(views.map((v) => v.slot))].flatMap((slot) => {
    const turn = views.filter((v) => v.slot === slot);
    const first = Option.orElse(
      Option.liftPredicate(anchor, (a) => a.slot === slot),
      () =>
        Option.orElse(
          Arr.findFirst(turn, (v) => level.includes(v.view)),
          () => Arr.head(turn),
        ),
    );
    return Option.match(first, {
      onNone: () => [],
      onSome: (to) =>
        heldTo(
          turn,
          to,
          'head',
          (v) => Option.fromUndefinedOr(v.eyes),
          percentOff(
            "the eyes' spacing",
            (to.view === anchor.view && "the anchor's") || `view ${to.view}'s, its turn's first`,
          ),
        ),
    });
  }),
];

const anchorFlags = (
  views: ReadonlyArray<SheetView>,
  anchor: SheetView,
  held: {
    readonly standing: ReadonlyArray<number>;
    readonly level: ReadonlyArray<number>;
    readonly heads: boolean;
    readonly stature: (view: number) => Stature;
  },
): ReadonlyArray<SheetFlag> => [
  ...heldTo(
    views,
    anchor,
    'height',
    (v) =>
      Option.liftPredicate(
        v.height / held.stature(v.view).height,
        () => held.standing.includes(v.view) && held.standing.includes(anchor.view),
      ),
    percentOff('the height'),
  ),
  ...((held.heads && headsFlags(views, anchor, held.level)) ||
    heldTo(
      views,
      anchor,
      'head',
      (v) => {
        const { height, heads } = held.stature(v.view);
        return Option.map(Option.fromUndefinedOr(v.head), (head) => (head * heads) / height);
      },
      percentOff('the head'),
    )),
  ...heldTo(views, anchor, 'hand', (v) => Option.fromUndefinedOr(v.hand), percentOff('the hand')),
  ...heldTo(
    views,
    anchor,
    'hairFall',
    (v) =>
      Option.filter(
        Option.fromUndefinedOr(v.hairFall),
        () => held.level.includes(v.view) && held.level.includes(anchor.view),
      ),
    (value, against) =>
      Option.liftPredicate(
        {
          value: value - against,
          limit: HAIR_FALL,
          note: `the hair falls ${(value - against).toFixed(2)} head off the anchor's`,
        },
        () => Math.abs(value - against) > HAIR_FALL,
      ),
  ),
  ...views.flatMap((v) => {
    const sole = v.box[3];
    const off = Math.abs(sole - anchor.box[3]) / anchor.height;
    return (
      (off > GROUND && [
        flag(
          'ground',
          [v.view],
          100 * off,
          100 * GROUND,
          "the soles are off the sheet's ground line",
        ),
      ]) ||
      []
    );
  }),
];

const paperFlags = (views: ReadonlyArray<SheetView>, anchor: SheetView): ReadonlyArray<SheetFlag> =>
  views.flatMap((v) => {
    const greys = v.papers.filter((p) => {
      const sv = saturationValueOf(p.rgb);
      return sv.saturation < 0.05 && sv.value < 0.75;
    });
    const grey = greys.map((p) =>
      flag(
        'grey',
        [v.view],
        100 * p.share,
        0,
        `a grey paper (${p.rgb.join(',')}): shade with a hue, never grey (CRAFT 12)`,
      ),
    );
    if (v.view === anchor.view || anchor.papers.length === 0 || v.papers.length === 0) return grey;
    const drift = Math.max(
      ...anchor.papers
        .slice(0, 3)
        .map((a) => Math.min(...v.papers.map((p) => deltaE(labOf(a.rgb), labOf(p.rgb))))),
    );
    return [
      ...grey,
      ...((drift > PAPER_DE && [
        flag(
          'papers',
          [v.view, anchor.view],
          drift,
          PAPER_DE,
          "a paper of another colour than the anchor's",
        ),
      ]) ||
        []),
    ];
  });

const reachFlags = (v: SheetView): ReadonlyArray<SheetFlag> =>
  Option.match(
    Option.filter(Option.fromUndefinedOr(v.free), (n) => n > 0),
    {
      onNone: () => [],
      onSome: (n) => [
        flag(
          'sleeveReach',
          [v.view],
          n,
          0,
          'a hand floats free of the body: every hand is a circle at the end of an arm in its sleeve',
        ),
      ],
    },
  );

const lookFlags = (views: ReadonlyArray<SheetView>): ReadonlyArray<SheetFlag> =>
  views.flatMap((v) => [
    ...((v.lit === 'right' && [
      flag(
        'lit',
        [v.view],
        1,
        0,
        'lit on its right: the key light is upper left, so a view lit right was flipped',
      ),
    ]) ||
      []),
    ...((v.bare > 0 && [
      flag(
        'bareArm',
        [v.view],
        v.bare,
        0,
        'skin below the neck that is not a round hand: never a bare arm',
      ),
    ]) ||
      []),
    ...reachFlags(v),
    ...((v.hairBeard === 'merged' && [
      flag(
        'hairBeard',
        [v.view],
        1,
        0,
        'the beard runs into the hair: part them as the kept concept does',
      ),
    ]) ||
      []),
  ]);

const PARTNERS: ReadonlyArray<readonly [number, number]> = [
  [1, 4],
  [2, 6],
  [3, 5],
];

const pairsOf = (reads: ReadonlyArray<ViewRead>, kind: SheetKind) =>
  (kind === 'turnaround' &&
    PARTNERS.flatMap(([a, b]) =>
      Option.match(Option.all([Arr.get(reads, a - 1), Arr.get(reads, b - 1)]), {
        onNone: () => [],
        onSome: ([ra, rb]) => [
          {
            views: [a, b] as const,
            ...pairDiffs(ra.crop, rb.crop),
            widths: pct(ra.record.widthToHeight, rb.record.widthToHeight),
          },
        ],
      }),
    )) ||
  [];

const SIDES: ReadonlyArray<readonly [number, number]> = [
  [2, 3],
  [6, 5],
];

const HEAD_BAND = 0.3;

const headBandOf = (r: ViewRead) =>
  cropRaster(r.crop, [0, 0, r.crop.width, PAD + HEAD_BAND * (r.crop.height - 2 * PAD)]);

const sidesOf = (reads: ReadonlyArray<ViewRead>, kind: SheetKind) =>
  (kind === 'turnaround' &&
    SIDES.flatMap(([a, b]) =>
      Option.match(Option.all([Arr.get(reads, a - 1), Arr.get(reads, b - 1)]), {
        onNone: () => [],
        onSome: ([ra, rb]) => {
          const [ha, hb] = [headBandOf(ra), headBandOf(rb)];
          return [
            {
              views: [a, b] as const,
              ...pairDiffs(ha, hb),
            },
          ];
        },
      }),
    )) ||
  [];

const PROFILE_WAY = 1;

const sideFlags = (sides: ReadonlyArray<typeof SheetSide.Type>): ReadonlyArray<SheetFlag> =>
  sides.flatMap(
    (p) =>
      (p.flipped < PROFILE_WAY * p.straight && [
        flag(
          'profileWay',
          p.views,
          p.flipped / p.straight,
          PROFILE_WAY,
          'the profile faces away from the three-quarter on its side: one of them is a redraw',
        ),
      ]) ||
      [],
  );

const pairFlags = (pairs: ReadonlyArray<typeof SheetPair.Type>): ReadonlyArray<SheetFlag> =>
  pairs.flatMap((p) => [
    ...((p.flipped < MIRROR_FLOOR && [
      flag(
        'mirror',
        p.views,
        p.flipped,
        MIRROR_FLOOR,
        'one view is the other flipped: each turn is its own drawing',
      ),
    ]) ||
      []),
    ...((p.views[0] !== 1 &&
      p.straight < SAME_WAY * p.flipped && [
        flag(
          'sameWay',
          p.views,
          p.straight / p.flipped,
          SAME_WAY,
          'the two views face one way: one of them is a redraw',
        ),
      ]) ||
      []),
    ...((Math.abs(p.widths) > TOLERANCE && [
      flag('width', p.views, p.widths, TOLERANCE, "the partners' widths differ"),
    ]) ||
      []),
  ]);

const conceptRows = (reads: ReadonlyArray<ViewRead>, concepts: ReadonlyArray<SheetConcept>) =>
  concepts.map((c) =>
    Option.match(
      Option.flatMap(Option.fromUndefinedOr(reads[c.view - 1]), (r) => r.full),
      {
        onNone: () => ({
          name: c.name,
          view: c.view,
          rows: 0,
          flagged: ['the view does not read'],
        }),
        onSome: (m) => {
          const rows = compareFigures(c.measure, m);
          return {
            name: c.name,
            view: c.view,
            rows: rows.length,
            flagged: rows.filter((r) => r.flagged).map((r) => r.name),
          };
        },
      },
    ),
  );

export const measureSheet = (
  given: Raster,
  options: SheetOptions,
): Result.Result<SheetMeasure, SheetUnread> => {
  const sheet = opaqueOf(given);
  const { figures, found } = figuresOf(sheet, options.count);
  const slots =
    options.slots ??
    ((options.kind === 'turnaround' && TURNAROUND_SLOTS) || figures.map(() => 'free' as const));
  if (figures.length < options.count)
    return Result.fail(
      SheetUnread.make({
        reason: `${figures.length} figures found, the sheet names ${options.count}`,
      }),
    );
  if (slots.length !== options.count)
    return Result.fail(
      SheetUnread.make({ reason: `${slots.length} slots for ${options.count} figures` }),
    );
  if (options.anchor < 1 || options.anchor > options.count)
    return Result.fail(
      SheetUnread.make({
        reason: `the anchor ${options.anchor} is not one of the ${options.count} views`,
      }),
    );
  const reads = figures.map((f, k) => readView(sheet, f, k + 1, slots[k] ?? 'free', options));
  const views = reads.map((r) => r.record);
  return Option.match(Arr.get(views, options.anchor - 1), {
    onNone: () => Result.fail(SheetUnread.make({ reason: 'the anchor does not read' })),
    onSome: (anchor) => Result.succeed(checked(reads, views, anchor, { ...options, found })),
  });
};

export const standingOf = (
  options: SheetOptions,
  views: ReadonlyArray<{ readonly view: number }>,
): ReadonlyArray<number> =>
  options.standing ?? ((options.kind === 'turnaround' && views.map((v) => v.view)) || []);

const checked = (
  reads: ReadonlyArray<ViewRead>,
  views: ReadonlyArray<SheetView>,
  anchor: SheetView,
  options: SheetOptions & { readonly found: number },
): SheetMeasure => {
  const headgear = options.headgear === true;
  const heads = options.kind === 'heads';
  const stands = (v: SheetView) =>
    Option.match(Option.fromUndefinedOr(options.standing), {
      onNone: () => true,
      onSome: (named) => named.includes(v.view),
    });
  const misreadOf = (v: SheetView): Option.Option<number> =>
    Option.filter(
      Option.fromUndefinedOr(v.headsTall),
      (tall) => !heads && stands(v) && tall < HEADS_LEAST,
    );
  const misread = misreadOf(anchor);
  const viewsHeld = views.map((v) =>
    Option.match(misreadOf(v), { onNone: () => v, onSome: () => headless(v) }),
  );
  const held = Option.match(misread, { onNone: () => anchor, onSome: () => headless(anchor) });
  const headsUnread: ReadonlyArray<SheetUnmeasured> = views.flatMap(
    (v) =>
      (v.view !== anchor.view &&
        Option.match(misreadOf(v), {
          onNone: () => [],
          onSome: (tall) => [
            {
              check: 'head' as const,
              view: v.view,
              why: `its head reads ${tall.toFixed(2)} heads tall, over half its figure: not a head, so it is not held to the anchor's`,
            },
          ],
        })) ||
      [],
  );
  const stature = (view: number) => statureOf(options, view);
  const canon = (heads && {}) || canonOf(held, headgear, stature(anchor.view).heads);
  const standing = standingOf(options, views);
  const pairs = pairsOf(reads, options.kind);
  const sides = sidesOf(reads, options.kind);
  const sheetUnmeasured: ReadonlyArray<SheetUnmeasured> =
    (heads && [
      { check: 'squash', view: 0, why: 'a heads sheet draws no body to hold to the canon' },
      { check: 'hand', view: 0, why: 'a heads sheet draws no hands' },
      { check: 'sleeveReach', view: 0, why: 'a heads sheet draws no hands' },
    ]) ||
    (headgear && [
      {
        check: 'squash',
        view: 0,
        why: 'headgear: the head reads the cloth, so the canon is read on the lock; the views hold to the face opening',
      },
    ]) ||
    (Option.isNone(Option.fromUndefinedOr(canon.heads)) &&
      Option.match(misread, {
        onNone: () => [
          { check: 'squash' as const, view: 0, why: "the anchor's head does not read" },
        ],
        onSome: (tall) => {
          const why = `the anchor's head reads ${tall.toFixed(2)} heads tall, over half its figure: not a head, so the canon is not read and no view is held to its head`;
          return [
            { check: 'squash' as const, view: 0, why },
            { check: 'head' as const, view: anchor.view, why },
          ];
        },
      })) ||
    [];
  const bodies = !heads;
  const level = options.level ?? views.map((v) => v.view);
  return {
    kind: options.kind,
    anchor: options.anchor,
    found: options.found,
    views: viewsHeld,
    pairs,
    sides,
    canon,
    flags: [
      ...facingFlags(views),
      ...rollFlags(views, options.kind),
      ...pairFlags(pairs),
      ...sideFlags(sides),
      ...squashFlags(canon, anchor.view),
      ...anchorFlags(viewsHeld, held, { standing, level, heads, stature }).filter(
        (f) => bodies || (f.check !== 'ground' && f.check !== 'height'),
      ),
      ...((bodies && paperFlags(views, anchor)) || []),
      ...lookFlags(views),
    ],
    unmeasured: [...sheetUnmeasured, ...headsUnread, ...reads.flatMap((r) => r.unmeasured)],
    concepts: conceptRows(reads, options.concepts ?? []),
  };
};

const fixed = (v: Option.Option<number>, places: number) =>
  Option.getOrElse(
    Option.map(v, (n) => n.toFixed(places)),
    () => '–',
  );
const some = Option.fromUndefinedOr;

const openChins = (m: SheetMeasure): ReadonlyArray<number> =>
  m.views.filter((v) => v.chin === 'open').map((v) => v.view);

const OPEN_CHIN =
  'the face runs into the neck with no line at the chin: read down to where the neck narrows, said, never a fault';

export const sheetTable = (name: string, m: SheetMeasure): string => {
  const canon = Option.match(some(m.canon.heads), {
    onNone: () => `Canon: not measured (view ${m.anchor} is the anchor).`,
    onSome: (heads) =>
      `Canon: the anchor (view ${m.anchor}) stands ${heads.toFixed(2)} heads against ${m.canon.against ?? CANON_HEADS}; a trace with the head held scales the body by ${(100 - (m.canon.squash ?? 0)).toFixed(0)} %.`,
  });
  return [
    `### ${name}`,
    '',
    ...((m.found > m.views.length && [
      `${m.found} figures found, the sheet names ${m.views.length}: the ${m.views.length} largest are read.`,
      '',
    ]) ||
      []),
    `${m.kind}, ${m.views.length} views. ${canon} Held within ${TOLERANCE} %; papers within ΔE ${PAPER_DE}; a mirror under ${MIRROR_FLOOR}; a pair under ${SAME_WAY} of its flipped difference faces one way; every hand at the end of a sleeve or an arm, never free.`,
    '',
    '| View | Slot | Turn | Roll | Height | Head | Heads tall | W/H | Hand | Hair fall | Hair/beard | Chin | Lit | Reach | Free | Bare | Papers |',
    '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|',
    ...m.views.map(
      (v) =>
        `| ${v.view} | ${v.slot} | ${fixed(some(v.turn), 2)} | ${fixed(some(v.roll), 0)} | ${v.height} | ${fixed(some(v.head), 0)} | ${fixed(some(v.headsTall), 2)} | ${v.widthToHeight.toFixed(3)} | ${fixed(some(v.hand), 3)} | ${fixed(some(v.hairFall), 2)} | ${v.hairBeard ?? '–'} | ${v.chin ?? '–'} | ${v.lit} | ${fixed(some(v.reach), 2)} | ${v.free ?? '–'} | ${v.bare} | ${v.papers.map((p) => `${hexOf(p.rgb)} ${(100 * p.share).toFixed(0)}%`).join(' ')} |`,
    ),
    '',
    ...m.pairs.map(
      (p) =>
        `Pair ${p.views.join('↔')}: flipped ${p.flipped.toFixed(1)}, straight ${p.straight.toFixed(1)}, widths ${p.widths.toFixed(1)} %.`,
    ),
    ...m.sides.map(
      (p) =>
        `Side ${p.views.join('↔')}: flipped ${p.flipped.toFixed(1)}, straight ${p.straight.toFixed(1)}.`,
    ),
    '',
    ...((m.flags.length === 0 && ['No flags.']) ||
      m.flags.map(
        (f) =>
          `- **${f.check}** (view ${f.views.join(', ')}): ${f.note} (${f.value.toFixed(2)}, limit ${f.limit.toFixed(2)})`,
      )),
    '',
    ...m.unmeasured.map((u) => `- not measured: ${u.check} (view ${u.view}): ${u.why}`),
    ...((openChins(m).length > 0 && [
      `- said: an open chin (view ${openChins(m).join(', ')}): ${OPEN_CHIN}`,
    ]) ||
      []),
    ...m.concepts.map(
      (c) =>
        `- against ${c.name} (view ${c.view}): ${c.flagged.length} of ${c.rows} rows flagged${(c.flagged.length > 0 && `: ${c.flagged.join('; ')}`) || ''}`,
    ),
    '',
  ].join('\n');
};

export const sheetLines = (name: string, m: SheetMeasure): ReadonlyArray<string> => [
  `sheet ${name} kind=${m.kind} views=${m.views.length}${(m.found > m.views.length && ` found=${m.found}`) || ''} anchor=${m.anchor} flags=${m.flags.length} heads=${fixed(some(m.canon.heads), 2)} squash=${fixed(some(m.canon.squash), 0)}`,
  ...m.flags.map(
    (f) =>
      `${f.check} view=${f.views.join(',')} value=${f.value.toFixed(2)} limit=${f.limit.toFixed(2)} ${f.note}`,
  ),
  ...((openChins(m).length > 0 && [`said chin=open view=${openChins(m).join(',')} ${OPEN_CHIN}`]) ||
    []),
];

const MAGENTA = [232, 0, 140] as const;
const BLUE = [0, 150, 200] as const;
const GREEN = [0, 170, 90] as const;

export const sheetOverlay = (sheet: Raster, m: SheetMeasure): Raster => {
  const across = (y: number): RasterPath => ({
    points: [
      [0, y],
      [sheet.width, y],
    ],
    closed: false,
  });
  const anchor = Arr.get(m.views, m.anchor - 1);
  const boxes = m.views.map((v): RasterPath => {
    const [x0, y0, x1, y1]: Box = v.box;
    return {
      points: [
        [x0, y0],
        [x1, y0],
        [x1, y1],
        [x0, y1],
      ],
      closed: true,
    };
  });
  const lined = Option.match(anchor, {
    onNone: () => sheet,
    onSome: (a) => strokeRaster(sheet, [across(a.box[1]), across(a.box[3])], MAGENTA, 2),
  });
  const band = Option.flatMap(anchor, (a) =>
    Option.map(
      Option.fromUndefinedOr(a.head),
      (head) => a.box[3] - (m.canon.against ?? CANON_HEADS) * head,
    ),
  );
  const banded = Option.match(band, {
    onNone: () => lined,
    onSome: (y) => strokeRaster(lined, [across(y)], GREEN, 3),
  });
  return strokeRaster(banded, boxes, BLUE, 1);
};
