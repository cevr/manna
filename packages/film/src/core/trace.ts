// The tracer: a kept cast sheet's view read into the outlines a rig is
// composed from (`film concept trace`, `trace-cli.ts`). The sheet is flat
// paper cut and inked: its ink is the dark line (`INK_LUMA`), its paper the
// ground the figure stands on, reached from the view's box's edge without
// crossing ink. What lies inside the figure and is not ink falls into
// regions, each a run of paper the sheet inked round; a part of the view is
// the regions its seed points lie in (a sleeve, the hair, a face), cut by a
// polygon where the sheet draws no line between two parts (a sleeve at its
// shoulder), less or plus other parts, and grown into the ink round it, so
// two parts the sheet parts by a line meet under it. A part is written as
// one outline (its largest piece's), as tones (every piece, a shade within
// a part, read by its colour), as a circle (a hand) or as a face's marks
// (each mark the ink nearest its seed). An outline takes a point every
// `STEP` sheet pixels along its edge, smoothed first, so the house's smooth
// path through them makes no spikes of the sheet's wobble (RIVE.md, "Trace a
// sheet at a coarse step"). Colours never go into a table: a tone's colour
// only picks its pixels, and the film's papers paint it. Pure.

import { Result, Schema } from 'effect';
import type { Raster } from './raster.ts';

/** A point in the sheet's pixels. */
export type TracePt = readonly [number, number];

/** A box in the sheet's pixels: left, top, right, bottom. */
type TraceBox = readonly [number, number, number, number];

/** How a part is written. */
type TraceAs = 'outline' | 'tones' | 'circle' | 'marks' | 'none';

/** One part of a view, as the tracer picks it. */
export interface TracePart {
  /** Points inside the part's regions, sheet pixels: each picks the region it lies in (or the nearest, on ink). */
  readonly seeds?: ReadonlyArray<TracePt>;
  /** Every pixel of these colour classes (the hair's every curl), most often clipped. */
  readonly classes?: ReadonlyArray<string>;
  /** The whole figure to the middle of its line, most often clipped (a garment: what lies below the chin). */
  readonly silhouette?: boolean;
  /** Instead of seeds, the pixels of another part (a shade within its garment). */
  readonly within?: string;
  /** Only what also lies in another part, last (the hair cut inside the head). */
  readonly inside?: string;
  /** Only the pixels nearer this colour than each of `far` (a shade read within its part). */
  readonly colour?: { readonly near: string; readonly far: ReadonlyArray<string> };
  /** Only what lies inside this polygon, sheet pixels: a cut where the sheet draws no line. */
  readonly clip?: ReadonlyArray<TracePt>;
  /** Plus these parts' pixels (a head: its face, its hair and its ears). */
  readonly plus?: ReadonlyArray<string>;
  /** Less these parts' pixels (a garment less the sleeves that hang over it). */
  readonly minus?: ReadonlyArray<string>;
  /** How far it grows into the ink round it, pixels (`GROW` unless given; 0 for none). */
  readonly grow?: number;
  /** How it is written (`outline` unless given). */
  readonly as?: TraceAs;
  /** A tone's smallest piece, square pixels (`TONE_MIN` unless given). */
  readonly min?: number;
  /** How many edge pixels each way its edge is averaged over before it is taken every `STEP` (`SMOOTH` unless given): more rounds a curled edge into waves. */
  readonly smooth?: number;
  /** What the table says of it, one line. */
  readonly doc?: string;
}

/** A face's marks, each by a seed on (or beside) its ink: one eye and one brow in profile. */
interface TraceMarkSeeds {
  readonly eyes: readonly [TracePt] | readonly [TracePt, TracePt];
  readonly brows: readonly [TracePt] | readonly [TracePt, TracePt];
  /**
   * The mouth's seed; or, where its ink runs into the silhouette's (a
   * profile's mouth at the face's edge) and no piece of its own reads, its
   * two ends and its line's width as read off the sheet.
   */
  readonly mouth: TracePt | { readonly ends: readonly [TracePt, TracePt]; readonly line: number };
}

/** One view of a sheet, as its spec asks for it. */
interface TraceView {
  /** The view's box in the sheet, as the record keeps it. */
  readonly box: TraceBox;
  /**
   * The sheet's colour classes, by name, each its sample colours (its lit
   * side, its shade): a pixel takes the class of the sample nearest it, and a
   * region is a run of one class. The sheet inks only its silhouette and the
   * face, so its parts are parted by colour.
   */
  readonly classes: Readonly<Record<string, ReadonlyArray<string>>>;
  /** The parts, by name: each written as its `as` says, in this order. */
  readonly parts: Readonly<Record<string, TracePart>>;
  /** The face's marks, by their seeds. */
  readonly marks?: TraceMarkSeeds;
  /** The part whose box's centre is the head's (`PANEL.head`); none for a view with no head traced. */
  readonly head?: string;
  /** The parts whose lowest row is the soles' and whose middle is the feet's (`PANEL.feet`). */
  readonly feet?: ReadonlyArray<string>;
}

/** A view of a sheet as a trace spec names it: how it is traced, the table it writes beside the spec, what the table says it is. */
export interface TraceSheetView extends TraceView {
  readonly out: string;
  readonly about: string;
}

/**
 * A trace spec (`film concept trace <spec.ts>`): the member, its kept sheet
 * (a path from the spec's folder), the sheet's kind, and each view traced.
 */
export interface TraceSheet {
  readonly member: string;
  readonly sheet: string;
  readonly kind: string;
  readonly views: Readonly<Record<string, TraceSheetView>>;
}

/** A sheet traced: the view's parts, each as it was written. */
export interface Traced {
  readonly outlines: Readonly<Record<string, ReadonlyArray<TracePt>>>;
  readonly tones: Readonly<Record<string, ReadonlyArray<ReadonlyArray<TracePt>>>>;
  readonly circles: Readonly<Record<string, { readonly at: TracePt; readonly r: number }>>;
  readonly marks?: TracedMarks;
  /** The head's box's centre, and its top row and its height. */
  readonly head?: { readonly at: TracePt; readonly top: number; readonly height: number };
  /** The feet's middle at the soles' lowest row. */
  readonly feet?: TracePt;
  /** Each region the sheet's ink parts, for a spec's author: its centre, its box, its size and its colour. */
  readonly regions: ReadonlyArray<TraceRegion>;
}

/** A face's marks as `tracedKit` (`@manna/film/style`) takes them, sheet pixels. */
interface TracedMarks {
  readonly eyes: readonly [TracePt, TracePt];
  readonly eye: readonly [number, number];
  readonly brows: readonly [readonly [TracePt, TracePt], readonly [TracePt, TracePt]];
  readonly brow: number;
  readonly mouth: readonly [TracePt, TracePt];
  readonly mouthLine: number;
}

/** A region of the view: its id, its centre, its box, its size in pixels and its median colour. */
interface TraceRegion {
  readonly id: number;
  readonly at: TracePt;
  readonly box: TraceBox;
  readonly size: number;
  readonly colour: string;
}

/** Below this luma (0..255) a pixel is ink: the sheets' line reads 4 to 30, their darkest hair shade 42 and up. */
const INK_LUMA = 40;

/** The ground is paper and its shadow, all lighter than this luma: the line's edge, antialiased, is darker. */
const GROUND_LUMA = 110;

/** Half the sheets' silhouette line, pixels: a part reaches its middle, where the house's own line is drawn. */
const LINE_HALF = 3;

/** How far a part grows into the ink round it, pixels: half the sheets' line, so two parts meet under it. */
const GROW = 4;

/** An outline's points, sheet pixels apart along its edge (RIVE.md: 8 or more). */
const STEP = 9;

/** How far an edge is smoothed each way along it, pixels, before its points are taken. */
const SMOOTH = 3;

/** A tone's smallest piece, square pixels: a speck is no tone. */
const TONE_MIN = 60;

/** A region smaller than this is a speck of antialiasing, never a part's. */
const REGION_MIN = 12;

/** How far a seed on ink looks for the region beside it, pixels. */
const SEED_REACH = 6;

/** A pixel's luma. */
const lumaAt = (r: Raster, i: number) =>
  0.299 * (r.rgba[i * 4] ?? 0) +
  0.587 * (r.rgba[i * 4 + 1] ?? 0) +
  0.114 * (r.rgba[i * 4 + 2] ?? 0);

/** `#rrggbb` as its channels. */
const channels = (hex: string): readonly [number, number, number] => [
  Number.parseInt(hex.slice(1, 3), 16),
  Number.parseInt(hex.slice(3, 5), 16),
  Number.parseInt(hex.slice(5, 7), 16),
];

const hexOf = (c: readonly [number, number, number]) =>
  `#${c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;

/** The view's pixels: the crop's size, its offset in the sheet, the sheet itself. */
interface Grid {
  readonly r: Raster;
  readonly x0: number;
  readonly y0: number;
  readonly w: number;
  readonly h: number;
}

/** The sheet's index of the view's pixel `k`. */
const sheetIndex = (g: Grid, k: number) =>
  (g.y0 + Math.floor(k / g.w)) * g.r.width + g.x0 + (k % g.w);

/** The four neighbours of `k` inside the grid. */
const neighbours4 = (g: Grid, k: number): number[] => {
  const [x, y] = [k % g.w, Math.floor(k / g.w)];
  const out: number[] = [];
  if (x > 0) out.push(k - 1);
  if (x < g.w - 1) out.push(k + 1);
  if (y > 0) out.push(k - g.w);
  if (y < g.h - 1) out.push(k + g.w);
  return out;
};

/** Every pixel `from` reaches through pixels `through` accepts, four ways. */
const flood = (
  g: Grid,
  from: ReadonlyArray<number>,
  through: (k: number) => boolean,
): Uint8Array => {
  const seen = new Uint8Array(g.w * g.h);
  const stack = from.filter((k) => through(k));
  for (const k of stack) seen[k] = 1;
  while (stack.length > 0) {
    const k = stack.pop() ?? 0;
    for (const n of neighbours4(g, k))
      if (seen[n] === 0 && through(n)) {
        seen[n] = 1;
        stack.push(n);
      }
  }
  return seen;
};

/** The pixels on the grid's edge. */
const edgePixels = (g: Grid): number[] => {
  const out: number[] = [];
  for (let x = 0; x < g.w; x++) out.push(x, (g.h - 1) * g.w + x);
  for (let y = 0; y < g.h; y++) out.push(y * g.w, y * g.w + g.w - 1);
  return out;
};

/** `mask` with every hole in it filled: what its outside does not reach. */
const filled = (g: Grid, mask: Uint8Array): Uint8Array => {
  const outside = flood(g, edgePixels(g), (k) => mask[k] === 0);
  return outside.map((o) => (o === 1 ? 0 : 1));
};

/** Each pixel of the grid within `reach` of `k` either way, `k` too: `visit` called with it. */
const around = (g: Grid, k: number, reach: number, visit: (n: number) => void) => {
  const [x, y] = [k % g.w, Math.floor(k / g.w)];
  const [x0, x1] = [Math.max(0, x - reach), Math.min(g.w - 1, x + reach)];
  const [y0, y1] = [Math.max(0, y - reach), Math.min(g.h - 1, y + reach)];
  for (let ny = y0; ny <= y1; ny++) for (let nx = x0; nx <= x1; nx++) visit(ny * g.w + nx);
};

/** `mask` grown `by` pixels into the pixels `into` accepts, eight ways a step. */
const grown = (g: Grid, mask: Uint8Array, by: number, into: (k: number) => boolean): Uint8Array => {
  let out = mask;
  for (let step = 0; step < by; step++) {
    const next = out.slice();
    const reach = (n: number) => {
      if (next[n] === 0 && into(n)) next[n] = 1;
    };
    for (let k = 0; k < out.length; k++) if (out[k] === 1) around(g, k, 1, reach);
    out = next;
  }
  return out;
};

/** Whether `p` lies inside `poly` (even-odd). */
const insidePolygon = (p: TracePt, poly: ReadonlyArray<TracePt>): boolean => {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i] ?? [0, 0];
    const [xj, yj] = poly[j] ?? [0, 0];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi)
      inside = !inside;
  }
  return inside;
};

/** Each region's label (0 for none: ink or the ground), and the regions. */
interface Labelled {
  readonly label: Int32Array;
  readonly regions: ReadonlyArray<TraceRegion>;
}

/** How far each way the majority of a pixel's neighbours sets its colour's class, pixels: a speck of grain or an antialiased edge takes its neighbours'. */
const MAJORITY = 2;

/**
 * Each pixel's colour class (1 and up, in `classes`' order; 0 for ink and
 * the ground): the class of the sample colour nearest it, then the class
 * most of its neighbours within `MAJORITY` take.
 */
const classesOf = (
  g: Grid,
  classes: Readonly<Record<string, ReadonlyArray<string>>>,
  interior: (k: number) => boolean,
): Int8Array => {
  const samples = Object.values(classes).flatMap((colours, c) =>
    colours.map((hex) => ({ c: c + 1, rgb: channels(hex) })),
  );
  const raw = new Int8Array(g.w * g.h);
  for (let k = 0; k < raw.length; k++) if (interior(k)) raw[k] = nearestClass(g, k, samples);
  const count = new Int32Array(samples.length + 2);
  const out = new Int8Array(raw.length);
  const tally = (n: number) => {
    const c = raw[n] ?? 0;
    if (c !== 0) count[c] = (count[c] ?? 0) + 1;
  };
  for (let k = 0; k < raw.length; k++) {
    if (raw[k] === 0) continue;
    count.fill(0);
    around(g, k, MAJORITY, tally);
    let best = raw[k] ?? 0;
    for (let c = 1; c < count.length; c++) if ((count[c] ?? 0) > (count[best] ?? 0)) best = c;
    out[k] = best;
  }
  return out;
};

/** The class of the sample colour nearest pixel `k`'s. */
const nearestClass = (
  g: Grid,
  k: number,
  samples: ReadonlyArray<{ readonly c: number; readonly rgb: readonly [number, number, number] }>,
): number => {
  const i = sheetIndex(g, k) * 4;
  const [r, gr, b] = [g.r.rgba[i] ?? 0, g.r.rgba[i + 1] ?? 0, g.r.rgba[i + 2] ?? 0];
  let best = 0;
  let bestD = Infinity;
  for (const s of samples) {
    const d = (r - s.rgb[0]) ** 2 + (gr - s.rgb[1]) ** 2 + (b - s.rgb[2]) ** 2;
    if (d < bestD) {
      bestD = d;
      best = s.c;
    }
  }
  return best;
};

/** The regions of one colour class each, four ways, each its own label from 1. */
const regionsOf = (g: Grid, kinds: Int8Array): Labelled => {
  const label = new Int32Array(g.w * g.h);
  const regions: TraceRegion[] = [];
  let next = 1;
  for (let k = 0; k < label.length; k++) {
    if (label[k] !== 0 || kinds[k] === 0) continue;
    const id = next++;
    const kind = kinds[k];
    const stack = [k];
    const members: number[] = [];
    label[k] = id;
    while (stack.length > 0) {
      const p = stack.pop() ?? 0;
      members.push(p);
      for (const n of neighbours4(g, p))
        if (label[n] === 0 && kinds[n] === kind) {
          label[n] = id;
          stack.push(n);
        }
    }
    const xs = members.map((p) => p % g.w);
    const ys = members.map((p) => Math.floor(p / g.w));
    const median = (pick: number) => {
      const vs = members
        .map((p) => g.r.rgba[sheetIndex(g, p) * 4 + pick] ?? 0)
        .sort((a, b) => a - b);
      return vs[Math.floor(vs.length / 2)] ?? 0;
    };
    regions.push({
      id,
      at: [
        g.x0 + Math.round(xs.reduce((a, b) => a + b, 0) / xs.length),
        g.y0 + Math.round(ys.reduce((a, b) => a + b, 0) / ys.length),
      ],
      box: [
        g.x0 + Math.min(...xs),
        g.y0 + Math.min(...ys),
        g.x0 + Math.max(...xs) + 1,
        g.y0 + Math.max(...ys) + 1,
      ],
      size: members.length,
      colour: hexOf([median(0), median(1), median(2)]),
    });
  }
  return { label, regions };
};

/** The view pixel at sheet point `p`, or none outside the view. */
const pixelAt = (g: Grid, [x, y]: TracePt): number | undefined => {
  const [px, py] = [Math.round(x) - g.x0, Math.round(y) - g.y0];
  return px < 0 || py < 0 || px >= g.w || py >= g.h ? undefined : py * g.w + px;
};

/** The region a seed picks: the one it lies in, else the nearest within `SEED_REACH`, else none. */
const regionAt = (g: Grid, label: Int32Array, p: TracePt): number | undefined => {
  for (let reach = 0; reach <= SEED_REACH; reach++)
    for (let dy = -reach; dy <= reach; dy++)
      for (let dx = -reach; dx <= reach; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== reach) continue;
        const k = pixelAt(g, [p[0] + dx, p[1] + dy]);
        const id = k === undefined ? 0 : (label[k] ?? 0);
        if (id !== 0) return id;
      }
  return undefined;
};

/** The pieces of `mask`, eight ways, largest first: each its pixels. */
const piecesOf = (g: Grid, mask: Uint8Array): number[][] => {
  const seen = new Uint8Array(mask.length);
  const pieces: number[][] = [];
  for (let k = 0; k < mask.length; k++) {
    if (mask[k] === 0 || seen[k] === 1) continue;
    const stack = [k];
    const piece: number[] = [];
    seen[k] = 1;
    const join = (n: number) => {
      if (mask[n] === 1 && seen[n] === 0) {
        seen[n] = 1;
        stack.push(n);
      }
    };
    while (stack.length > 0) {
      const p = stack.pop() ?? 0;
      piece.push(p);
      around(g, p, 1, join);
    }
    pieces.push(piece);
  }
  return pieces.sort((a, b) => b.length - a.length);
};

/** A mask of `pixels` alone. */
const maskOf = (g: Grid, pixels: ReadonlyArray<number>): Uint8Array => {
  const m = new Uint8Array(g.w * g.h);
  for (const k of pixels) m[k] = 1;
  return m;
};

/** The eight directions round a pixel, clockwise from east, as steps. */
const DIRS: ReadonlyArray<TracePt> = [
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
  [0, -1],
  [1, -1],
];

/** The outer edge of the one piece `mask` holds, its pixels in order, clockwise on screen (Moore's walk). */
const edgeOf = (g: Grid, mask: Uint8Array): TracePt[] => {
  const on = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < g.w && y < g.h && mask[y * g.w + x] === 1;
  let start = -1;
  for (let k = 0; k < mask.length && start < 0; k++) if (mask[k] === 1) start = k;
  if (start < 0) return [];
  const [sx, sy] = [start % g.w, Math.floor(start / g.w)];
  const out: TracePt[] = [[sx, sy]];
  // Entered from the west: the walk looks round from the pixel before it, clockwise.
  let [x, y, back] = [sx, sy, 4];
  for (let guard = 0; guard < mask.length * 4; guard++) {
    let moved = false;
    for (let i = 1; i <= 8; i++) {
      const d = (back + i) % 8;
      const [dx, dy] = DIRS[d] ?? [0, 0];
      if (on(x + dx, y + dy)) {
        [x, y] = [x + dx, y + dy];
        back = (d + 4) % 8;
        moved = true;
        break;
      }
    }
    if (!moved || (x === sx && y === sy)) break;
    out.push([x, y]);
  }
  return out;
};

/** A closed line smoothed `by` points each way along it. */
const smoothed = (pts: ReadonlyArray<TracePt>, by: number): TracePt[] =>
  pts.map((_, i) => {
    let [sx, sy] = [0, 0];
    for (let d = -by; d <= by; d++) {
      const [x, y] = pts[(i + d + pts.length) % pts.length] ?? [0, 0];
      sx += x;
      sy += y;
    }
    return [sx / (2 * by + 1), sy / (2 * by + 1)];
  });

/** A closed line's points every `step` along it, from its first. */
const resampled = (pts: ReadonlyArray<TracePt>, step: number): TracePt[] => {
  if (pts.length < 3) return [...pts];
  const out: TracePt[] = [pts[0] ?? [0, 0]];
  let carried = 0;
  for (let i = 0; i < pts.length; i++) {
    const [ax, ay] = pts[i] ?? [0, 0];
    const [bx, by] = pts[(i + 1) % pts.length] ?? [0, 0];
    const len = Math.hypot(bx - ax, by - ay);
    let at = step - carried;
    while (at <= len) {
      out.push([ax + ((bx - ax) * at) / len, ay + ((by - ay) * at) / len]);
      at += step;
    }
    carried = len - (at - step);
  }
  // The last point too near the first closes the line on it.
  const [fx, fy] = out[0] ?? [0, 0];
  const [lx, ly] = out[out.length - 1] ?? [0, 0];
  if (out.length > 3 && Math.hypot(lx - fx, ly - fy) < step / 2) out.pop();
  return out;
};

/** A half pixel: how a table writes a point. */
const half = (v: number) => Math.round(v * 2) / 2;

/** The area a closed line encloses, square pixels (the shoelace sum): a piece whose points lie on one line encloses none. */
const areaOf = (pts: ReadonlyArray<TracePt>) => {
  let twice = 0;
  for (let i = 0; i < pts.length; i++) {
    const [ax, ay] = pts[i] ?? [0, 0];
    const [bx, by] = pts[(i + 1) % pts.length] ?? [0, 0];
    twice += ax * by - bx * ay;
  }
  return Math.abs(twice) / 2;
};

/** The outline of `pixels` (one piece) in sheet pixels: its edge smoothed and taken every `STEP`. */
const outlineOf = (g: Grid, pixels: ReadonlyArray<number>, smooth = SMOOTH): TracePt[] =>
  resampled(smoothed(edgeOf(g, filled(g, maskOf(g, pixels))), smooth), STEP).map(
    ([x, y]): TracePt => [half(g.x0 + x + 0.5), half(g.y0 + y + 0.5)],
  );

/** A mark's ink: its pixels' centre, its box, and its two ends (the pair farthest apart). */
const markOf = (g: Grid, pixels: ReadonlyArray<number>) => {
  const pts = pixels.map((k): TracePt => [
    g.x0 + (k % g.w) + 0.5,
    g.y0 + Math.floor(k / g.w) + 0.5,
  ]);
  const xs = pts.map(([x]) => x);
  const ys = pts.map(([, y]) => y);
  const centre: TracePt = [
    xs.reduce((a, b) => a + b, 0) / xs.length,
    ys.reduce((a, b) => a + b, 0) / ys.length,
  ];
  // The ends: the point farthest from the centre, then the one farthest from it.
  const far = (from: TracePt) =>
    pts.reduce((best, p) =>
      Math.hypot(p[0] - from[0], p[1] - from[1]) > Math.hypot(best[0] - from[0], best[1] - from[1])
        ? p
        : best,
    );
  const a = far(centre);
  const b = far(a);
  const [left, right] = a[0] <= b[0] ? [a, b] : [b, a];
  const length = Math.max(1, Math.hypot(b[0] - a[0], b[1] - a[1]));
  return {
    centre,
    size: [Math.max(...xs) - Math.min(...xs) + 1, Math.max(...ys) - Math.min(...ys) + 1] as const,
    ends: [left, right] as const,
    stroke: pixels.length / length,
  };
};

/** The ink piece nearest `p` among `pieces` (each its pixels), by its nearest pixel. */
const nearestPiece = (g: Grid, pieces: ReadonlyArray<ReadonlyArray<number>>, p: TracePt) => {
  const [px, py] = [p[0] - g.x0, p[1] - g.y0];
  let best: ReadonlyArray<number> = [];
  let bestD = Infinity;
  for (const piece of pieces)
    for (const k of piece) {
      const d = Math.hypot((k % g.w) - px, Math.floor(k / g.w) - py);
      if (d < bestD) {
        bestD = d;
        best = piece;
      }
    }
  return best;
};

const rounded = (p: TracePt): TracePt => [half(p[0]), half(p[1])];

/** A trace spec the sheet cannot be read by: a part it does not name, a part made of itself, a seed on nothing, a part left empty. */
class TraceRefused extends Schema.TaggedError<TraceRefused>()('TraceRefused', {
  reason: Schema.String,
}) {
  override get message() {
    return `the trace cannot be read: ${this.reason}`;
  }
}

/** What a view's parts are read from: its grid, its ink, its colour classes, its regions and the figure to the middle of its line. */
interface Read {
  readonly g: Grid;
  readonly n: number;
  readonly ink: Uint8Array;
  readonly kinds: Int8Array;
  readonly label: Int32Array;
  readonly core: (k: number) => boolean;
  readonly classIds: ReadonlyArray<string>;
  /** Why the spec cannot be read, each as it is met. */
  readonly refused: string[];
}

/** Every pixel of `m` set in `mask`. */
const addTo = (mask: Uint8Array, m: Uint8Array) => {
  for (let k = 0; k < mask.length; k++) if (m[k] === 1) mask[k] = 1;
};

/** `mask` with the pixels `drop` accepts cleared. */
const dropFrom = (mask: Uint8Array, drop: (k: number) => boolean) => {
  for (let k = 0; k < mask.length; k++) if (mask[k] === 1 && drop(k)) mask[k] = 0;
};

/** Every pixel of the classes `classes` names set in `mask`. */
const addClasses = (rd: Read, name: string, classes: ReadonlyArray<string>, mask: Uint8Array) => {
  for (const c of classes) {
    const id = rd.classIds.indexOf(c) + 1;
    if (id === 0) rd.refused.push(`the part ${name} names no class ${c}`);
    else for (let k = 0; k < rd.n; k++) if (rd.kinds[k] === id) mask[k] = 1;
  }
};

/** Every pixel of each region a seed picks set in `mask`. */
const addSeeds = (rd: Read, name: string, seeds: ReadonlyArray<TracePt>, mask: Uint8Array) => {
  for (const seed of seeds) {
    const id = regionAt(rd.g, rd.label, seed);
    if (id === undefined)
      rd.refused.push(`the part ${name}'s seed ${seed.join(',')} lies in no region`);
    else for (let k = 0; k < rd.n; k++) if (rd.label[k] === id) mask[k] = 1;
  }
};

/** `mask` held to the pixels nearer `colour.near` than each of `colour.far`. */
const holdToColour = (rd: Read, mask: Uint8Array, colour: NonNullable<TracePart['colour']>) => {
  const { g } = rd;
  const near = channels(colour.near);
  const far = colour.far.map(channels);
  const dist = (k: number, c: readonly [number, number, number]) => {
    const i = sheetIndex(g, k) * 4;
    return Math.hypot(
      (g.r.rgba[i] ?? 0) - c[0],
      (g.r.rgba[i + 1] ?? 0) - c[1],
      (g.r.rgba[i + 2] ?? 0) - c[2],
    );
  };
  dropFrom(mask, (k) => far.some((c) => dist(k, c) < dist(k, near)));
};

/** The pixels a part picks: another part's, the silhouette's, its classes', its seeds' regions, held to its colour, plus other parts'. */
const pickedOf = (rd: Read, name: string, part: TracePart, of: (name: string) => Uint8Array) => {
  const mask = part.within === undefined ? new Uint8Array(rd.n) : of(part.within).slice();
  if (part.silhouette === true) for (let k = 0; k < rd.n; k++) if (rd.core(k)) mask[k] = 1;
  addClasses(rd, name, part.classes ?? [], mask);
  addSeeds(rd, name, part.seeds ?? [], mask);
  if (part.colour !== undefined) holdToColour(rd, mask, part.colour);
  for (const other of part.plus ?? []) addTo(mask, of(other));
  return mask;
};

/** A part's pixels shaped: grown into the ink round it (never past the line's middle), clipped, less other parts, inside another, inside the figure. */
const formedOf = (
  rd: Read,
  part: TracePart,
  picked: Uint8Array,
  of: (name: string) => Uint8Array,
) => {
  const { g } = rd;
  const seeded = (part.seeds ?? []).length > 0 || (part.classes ?? []).length > 0;
  const by = part.grow ?? (seeded ? GROW : 0);
  const mask =
    by > 0
      ? grown(
          g,
          picked,
          by,
          (k) => rd.core(k) && (rd.ink[k] === 1 || lumaAt(g.r, sheetIndex(g, k)) < GROUND_LUMA),
        )
      : picked;
  const clip = part.clip;
  if (clip !== undefined)
    dropFrom(
      mask,
      (k) => !insidePolygon([g.x0 + (k % g.w) + 0.5, g.y0 + Math.floor(k / g.w) + 0.5], clip),
    );
  for (const other of part.minus ?? []) {
    const m = of(other);
    dropFrom(mask, (k) => m[k] === 1);
  }
  if (part.inside !== undefined) {
    const m = of(part.inside);
    dropFrom(mask, (k) => m[k] === 0);
  }
  dropFrom(mask, (k) => !rd.core(k));
  return mask;
};

/** Each part's mask, by name, made once, each from the parts it names. */
const partsOf = (rd: Read, parts: TraceView['parts']) => {
  const made = new Map<string, Uint8Array>();
  const making = new Set<string>();
  const of = (name: string): Uint8Array => {
    const have = made.get(name);
    if (have !== undefined) return have;
    const part = parts[name];
    if (part === undefined || making.has(name)) {
      rd.refused.push(
        part === undefined
          ? `the trace names no part ${name}`
          : `the part ${name} is made of itself`,
      );
      return new Uint8Array(rd.n);
    }
    making.add(name);
    const mask = formedOf(rd, part, pickedOf(rd, name, part, of), of);
    making.delete(name);
    made.set(name, mask);
    return mask;
  };
  return of;
};

/** The circle a part's largest piece fills: its centre, and the radius of a disc its size. */
const circleOf = (g: Grid, piece: ReadonlyArray<number>) => {
  const largest = filled(g, maskOf(g, piece));
  const ks = [...largest.keys()].filter((k) => largest[k] === 1);
  const cx = ks.reduce((a, k) => a + (k % g.w), 0) / Math.max(1, ks.length);
  const cy = ks.reduce((a, k) => a + Math.floor(k / g.w), 0) / Math.max(1, ks.length);
  return {
    at: rounded([g.x0 + cx + 0.5, g.y0 + cy + 0.5]),
    r: half(Math.sqrt(ks.length / Math.PI)),
  };
};

/** Whether a mouth is given by its ends, as read off the sheet, rather than by a seed. */
const isReadMouth = (
  m: TraceMarkSeeds['mouth'],
): m is { readonly ends: readonly [TracePt, TracePt]; readonly line: number } => 'ends' in m;

/** The face's marks, each the ink piece nearest its seed (a mouth given by its ends as given): none when the view names none. */
const marksOf = (
  rd: Read,
  figure: (k: number) => boolean,
  seeds: TraceMarkSeeds,
): TracedMarks | undefined => {
  const { g } = rd;
  const inkPieces = piecesOf(
    g,
    rd.ink.map((v, k) => (v === 1 && figure(k) ? 1 : 0)),
  );
  const near = inkPieces.filter((p) => p.length < (g.w * g.h) / 50);
  const mark = (p: TracePt) => markOf(g, nearestPiece(g, near, p));
  const eyes = seeds.eyes.map(mark);
  const brows = seeds.brows.map(mark);
  const mouth = isReadMouth(seeds.mouth)
    ? { ends: seeds.mouth.ends, stroke: seeds.mouth.line }
    : mark(seeds.mouth);
  const [e0, e1] = [eyes[0], eyes[1] ?? eyes[0]];
  const [b0, b1] = [brows[0], brows[1] ?? brows[0]];
  if (e0 === undefined || e1 === undefined || b0 === undefined || b1 === undefined)
    return undefined;
  return {
    eyes: [rounded(e0.centre), rounded(e1.centre)],
    eye: [half((e0.size[0] + e1.size[0]) / 2), half((e0.size[1] + e1.size[1]) / 2)],
    brows: [
      [rounded(b0.ends[0]), rounded(b0.ends[1])],
      [rounded(b1.ends[0]), rounded(b1.ends[1])],
    ],
    brow: half((b0.stroke + b1.stroke) / 2),
    mouth: [rounded(mouth.ends[0]), rounded(mouth.ends[1])],
    mouthLine: half(mouth.stroke),
  };
};

/** The box round `mask`'s pixels, sheet pixels. */
const boxOfMask = (g: Grid, mask: Uint8Array): TraceBox => {
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (let k = 0; k < mask.length; k++)
    if (mask[k] === 1) {
      const [x, y] = [k % g.w, Math.floor(k / g.w)];
      [x0, y0, x1, y1] = [
        Math.min(x0, x),
        Math.min(y0, y),
        Math.max(x1, x + 1),
        Math.max(y1, y + 1),
      ];
    }
  return [g.x0 + x0, g.y0 + y0, g.x0 + x1, g.y0 + y1];
};

/** The view's grid and what it reads from the sheet: its ink, its ground, its classes, its regions and its core. */
const readOf = (sheet: Raster, view: TraceView) => {
  const [bx0, by0, bx1, by1] = view.box;
  const g: Grid = { r: sheet, x0: bx0, y0: by0, w: bx1 - bx0, h: by1 - by0 };
  const n = g.w * g.h;
  const ink = new Uint8Array(n);
  for (let k = 0; k < n; k++) ink[k] = lumaAt(sheet, sheetIndex(g, k)) < INK_LUMA ? 1 : 0;
  // The ground stops at the line's dark edge, wider than its ink, so no gap in the ink lets it in.
  const ground = flood(g, edgePixels(g), (k) => lumaAt(sheet, sheetIndex(g, k)) >= GROUND_LUMA);
  const figure = (k: number) => ground[k] === 0;
  const kinds = classesOf(g, view.classes, (k) => figure(k) && ink[k] === 0);
  const { label, regions } = regionsOf(g, kinds);
  // The figure as far as the middle of its line: what its own line is drawn round.
  const rim = grown(g, ground, LINE_HALF, () => true);
  const rd: Read = {
    g,
    n,
    ink,
    kinds,
    label,
    core: (k) => rim[k] === 0,
    classIds: Object.keys(view.classes),
    refused: [],
  };
  return { rd, figure, regions: regions.filter((r) => r.size >= REGION_MIN) };
};

/**
 * A view of `sheet` traced as `view` asks: its parts, each as it is
 * written; its face's marks; its head's centre and its feet; and every
 * region the sheet's ink parts in it, for the spec's author. Refused, saying
 * why, for a spec the sheet cannot be read by.
 */
export const traceView = (sheet: Raster, view: TraceView): Result.Result<Traced, TraceRefused> => {
  const { rd, figure, regions } = readOf(sheet, view);
  const { g } = rd;
  const of = partsOf(rd, view.parts);
  const outlines: Record<string, ReadonlyArray<TracePt>> = {};
  const tones: Record<string, ReadonlyArray<ReadonlyArray<TracePt>>> = {};
  const circles: Record<string, { at: TracePt; r: number }> = {};
  for (const [name, part] of Object.entries(view.parts)) {
    const as = part.as ?? 'outline';
    if (as === 'none' || as === 'marks') continue;
    const pieces = piecesOf(g, of(name));
    const largest = pieces[0] ?? [];
    if (as !== 'tones' && largest.length === 0) rd.refused.push(`the part ${name} is empty`);
    else if (as === 'outline') outlines[name] = outlineOf(g, largest, part.smooth);
    else if (as === 'circle') circles[name] = circleOf(g, largest);
    else
      tones[name] = pieces
        .filter((p) => p.length >= (part.min ?? TONE_MIN))
        .map((p) => outlineOf(g, p, part.smooth))
        .filter((pts) => pts.length >= 3 && areaOf(pts) > 0);
  }
  let traced: Traced = { outlines, tones, circles, regions };
  const marks = view.marks === undefined ? undefined : marksOf(rd, figure, view.marks);
  if (marks !== undefined) traced = { ...traced, marks };
  if (view.head !== undefined) {
    const [x0, y0, x1, y1] = boxOfMask(g, of(view.head));
    traced = {
      ...traced,
      head: { at: rounded([(x0 + x1) / 2, (y0 + y1) / 2]), top: y0, height: y1 - y0 },
    };
  }
  if (view.feet !== undefined && view.feet.length > 0) {
    const all = new Uint8Array(rd.n);
    for (const part of view.feet) addTo(all, of(part));
    const [x0, , x1, y1] = boxOfMask(g, all);
    traced = { ...traced, feet: rounded([(x0 + x1) / 2, y1]) };
  }
  if (rd.refused.length > 0)
    return Result.fail(TraceRefused.make({ reason: rd.refused.join('; ') }));
  return Result.succeed(traced);
};

/** A name as a table's constant: `armNear` as `ARM_NEAR`. */
const constName = (name: string) => name.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toUpperCase();

const pts = (p: ReadonlyArray<TracePt>, indent: string) =>
  `[\n${p.map(([x, y]) => `${indent}  [${x}, ${y}],`).join('\n')}\n${indent}]`;

/**
 * A traced view as a table's source: a header naming what it was traced
 * from and the command that wrote it, then each part as a constant (in
 * sheet pixels), its face's marks, its head's centre and its feet. `doc`
 * gives each part its line.
 */
export const tracedModule = (header: ReadonlyArray<string>, view: TraceView, t: Traced): string => {
  const doc = (name: string, fallback: string) => `/** ${view.parts[name]?.doc ?? fallback} */`;
  const lines = [
    ...header.map((l) => `// ${l}`.trimEnd()),
    '',
    "import type { Pt } from '@manna/film/style';",
    '',
    `/** The view's box in the sheet, as its record keeps it. */`,
    `export const BOX = [${view.box.join(', ')}] as const;`,
  ];
  if (t.head !== undefined)
    lines.push(
      '',
      "/** The head's centre (its box's), its top row and its height, sheet pixels. */",
      `export const HEAD_AT = { at: [${t.head.at.join(', ')}], top: ${t.head.top}, height: ${t.head.height} } as const satisfies { readonly at: Pt; readonly top: number; readonly height: number };`,
    );
  if (t.feet !== undefined)
    lines.push(
      '',
      "/** The feet's middle at the soles' lowest row, sheet pixels. */",
      `export const FEET: Pt = [${t.feet.join(', ')}];`,
    );
  for (const [name, outline] of Object.entries(t.outlines))
    lines.push('', doc(name, name), `export const ${constName(name)}: Pt[] = ${pts(outline, '')};`);
  for (const [name, list] of Object.entries(t.tones))
    lines.push(
      '',
      doc(name, name),
      `export const ${constName(name)}: Pt[][] = [\n${list.map((p) => `  ${pts(p, '  ')},`).join('\n')}\n];`,
    );
  for (const [name, c] of Object.entries(t.circles))
    lines.push(
      '',
      doc(name, name),
      `export const ${constName(name)} = { at: [${c.at.join(', ')}], r: ${c.r} } as const satisfies { readonly at: Pt; readonly r: number };`,
    );
  if (t.marks !== undefined) {
    const m = t.marks;
    const pair = (p: readonly [TracePt, TracePt]) => `[[${p[0].join(', ')}], [${p[1].join(', ')}]]`;
    lines.push(
      '',
      "/** The face's marks as the sheet draws them: the eyes' centres and their size, the brows' ends and their stroke, the mouth's corners and its line. */",
      'export const MARKS = {',
      `  eyes: ${pair(m.eyes)},`,
      `  eye: [${m.eye.join(', ')}],`,
      `  brows: [${pair(m.brows[0])}, ${pair(m.brows[1])}],`,
      `  brow: ${m.brow},`,
      `  mouth: ${pair(m.mouth)},`,
      `  mouthLine: ${m.mouthLine},`,
      '} as const;',
    );
  }
  return `${lines.join('\n')}\n`;
};
