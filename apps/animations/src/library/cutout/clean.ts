import { SheetCleanRefused, labOf } from '@manna/film/core';
import type { PartSheet, Raster, SheetClean } from '@manna/film/tools';
import { Array as Arr, Option, Result } from 'effect';

/** A colour, RGB or Lab. */
type Rgb = readonly [number, number, number];

/** ΔE76 between two Lab colours. */
const deltaE = (a: Rgb, b: Rgb): number => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** The eight neighbours of a pixel, as steps. */
const AROUND = [
  [-1, -1],
  [0, -1],
  [1, -1],
  [-1, 0],
  [1, 0],
  [-1, 1],
  [0, 1],
  [1, 1],
] as const;

/** A picture's size, for walking its pixels by index. */
interface Size {
  readonly width: number;
  readonly height: number;
}

/** The indices of pixel `i`'s 8 neighbours that lie inside a picture of `size`. */
const aroundOf = ({ width, height }: Size, i: number): ReadonlyArray<number> => {
  const x = i % width;
  const y = (i - x) / width;
  return AROUND.filter(
    ([dx, dy]) => x + dx >= 0 && y + dy >= 0 && x + dx < width && y + dy < height,
  ).map(([dx, dy]) => (y + dy) * width + x + dx);
};

/** An empty part's pixels, for a part a sheet lacks. */
const NO_PIXELS: Raster = { width: 0, height: 0, rgba: new Uint8Array(0) };

/** The index of the part named `name` in `sheet`, or the refusal that names it as one the sheet lacks. */
const indexOf = (sheet: PartSheet, name: string): Result.Result<number, SheetCleanRefused> =>
  Result.fromOption(
    Option.liftPredicate(
      sheet.parts.findIndex((p) => p.name === name),
      (k) => k >= 0,
    ),
    () =>
      SheetCleanRefused.make({
        reason: `the sheet has no part ${name} (its parts: ${sheet.parts.map((p) => p.name).join(', ')})`,
      }),
  );

/** The index of each part `names` names in `sheet`, or the refusal for the first the sheet lacks. */
const indicesOf = (
  sheet: PartSheet,
  names: ReadonlyArray<string>,
): Result.Result<ReadonlyArray<number>, SheetCleanRefused> =>
  Result.all(names.map((name) => indexOf(sheet, name)));

/** `sheet` with each part's pixels as `pixelsOf` gives them, by index. */
const withPixels = (
  sheet: PartSheet,
  pixelsOf: (k: number) => Option.Option<Uint8Array>,
): PartSheet => ({
  ...sheet,
  parts: sheet.parts.map((p, k) =>
    Option.match(pixelsOf(k), {
      onNone: () => p,
      onSome: (rgba) => ({ ...p, pixels: { ...p.pixels, rgba } }),
    }),
  ),
});

/** The 8-connected region of `raster`'s opaque pixels that holds `start`, marking each in `seen`. */
const regionFrom = (raster: Raster, seen: Uint8Array, start: number): ReadonlyArray<number> => {
  const opaque = (j: number) => (raster.rgba[j * 4 + 3] ?? 0) > 0;
  const region: Array<number> = [];
  const stack = [start];
  seen[start] = 1;
  while (stack.length > 0) {
    const i = stack.pop() ?? 0;
    region.push(i);
    for (const j of aroundOf(raster, i)) {
      if (seen[j] === 1 || !opaque(j)) continue;
      seen[j] = 1;
      stack.push(j);
    }
  }
  return region;
};

/** Each 8-connected region of `raster`'s pixels with alpha above 0, in scan order: its pixels' indices. */
export const regionsOf = (raster: Raster): ReadonlyArray<ReadonlyArray<number>> => {
  const seen = new Uint8Array(raster.width * raster.height);
  const regions: Array<ReadonlyArray<number>> = [];
  for (let start = 0; start < seen.length; start++)
    if (seen[start] === 0 && (raster.rgba[start * 4 + 3] ?? 0) > 0)
      regions.push(regionFrom(raster, seen, start));
  return regions;
};

/** The regions of `regions` that are not the largest: the pieces a part holds loose of its body. */
const looseOf = (
  regions: ReadonlyArray<ReadonlyArray<number>>,
): ReadonlyArray<ReadonlyArray<number>> => {
  const largest = regions.reduce((a, r) => Math.max(a, r.length), 0);
  return regions.filter((r) => r.length < largest);
};

/**
 * Clears the specks a part's paint leaves loose: every 8-connected region of
 * part `name`'s pixels (alpha above 0) of `most` pixels or fewer, but its
 * largest region, becomes alpha 0, and each such pixel the part owned becomes
 * the ground's. A sheet that lacks the part is refused.
 */
export const clearSpecks =
  (name: string, most: number): SheetClean =>
  (sheet) =>
    Result.map(indexOf(sheet, name), (k) => {
      const pixels = sheet.parts[k]?.pixels ?? NO_PIXELS;
      const rgba = new Uint8Array(pixels.rgba);
      const owner = new Uint8Array(sheet.owner);
      for (const region of looseOf(regionsOf(pixels))) {
        if (region.length > most) continue;
        for (const i of region) {
          rgba.fill(0, i * 4, i * 4 + 4);
          if (owner[i] === k + 1) owner[i] = 0;
        }
      }
      return {
        ...withPixels(sheet, (j) => Option.liftPredicate(rgba, () => j === k)),
        owner,
      };
    });

/** An arm whose hand is a disc of its cut, in the part sheet's pixels. */
export interface HandArm {
  readonly name: string;
  readonly hand: { readonly c: readonly [number, number]; readonly r: number };
}

/** What `cuffsToArms` reads: the arms, the body parts the cut leaves cuff ink on, and the part whose loose pieces go to the arms. */
export interface CuffsToArms {
  readonly arms: ReadonlyArray<HandArm>;
  readonly body: ReadonlyArray<string>;
  readonly loose: string;
  /** What reads a rim pixel as cuff ink; `CUFF` when left out. */
  readonly cuff?: CuffInk;
}

/** What reads a body pixel by a hand disc as cuff ink (`cuffsToArms`). */
export interface CuffInk {
  /** How far past a hand disc's edge, in pixels, its cuff's ink can lie on the body. */
  readonly rim: number;
  /** How much darker than the body around it, in mean channel value, a rim pixel is cuff ink. */
  readonly darker: number;
}

/** The cuff ink every member's rule reads unless it names its own. */
export const CUFF: CuffInk = { rim: 2, darker: 10 };

/** How far past a hand disc's edge the body a rim pixel is measured against begins. */
const BODY_PAST = 1;

/** A pixel's mean channel value in `rgba`. */
const lightOf = (rgba: Uint8Array, i: number): number =>
  ((rgba[i * 4] ?? 0) + (rgba[i * 4 + 1] ?? 0) + (rgba[i * 4 + 2] ?? 0)) / 3;

/** An arm of the sheet: its part's index and its hand disc. */
interface SheetArm extends HandArm {
  readonly k: number;
}

/** How far pixel `i`'s centre lies from `arm`'s hand centre. */
const handDistance = (size: Size, arm: HandArm, i: number): number => {
  const x = i % size.width;
  return Math.hypot(x + 0.5 - arm.hand.c[0], (i - x) / size.width + 0.5 - arm.hand.c[1]);
};

/** Whether body pixel `i`, owned by part `own`, is `arm`'s cuff ink (`cuffsToArms`). */
const isCuffInk = (
  sheet: PartSheet,
  ink: CuffInk,
  arm: SheetArm,
  own: number,
  i: number,
): boolean => {
  const d = handDistance(sheet, arm, i);
  const row = Math.floor(i / sheet.width);
  if (d <= arm.hand.r || d > arm.hand.r + ink.rim || row + 0.5 > arm.hand.c[1]) return false;
  const near = aroundOf(sheet, i);
  if (!near.some((j) => sheet.owner[j] === arm.k + 1)) return false;
  const body = near.filter(
    (j) => sheet.owner[j] === own + 1 && handDistance(sheet, arm, j) > arm.hand.r + BODY_PAST,
  );
  const rgba = sheet.parts[own]?.pixels.rgba ?? NO_PIXELS.rgba;
  const bodyLight = body.reduce((s, j) => s + lightOf(rgba, j), 0) / body.length;
  return body.length > 0 && bodyLight - lightOf(rgba, i) >= ink.darker;
};

/** Each body pixel that is an arm's cuff ink, and that arm's part index. */
const cuffInkOf = (
  sheet: PartSheet,
  cuffInk: CuffInk,
  arms: ReadonlyArray<SheetArm>,
  bodies: ReadonlySet<number>,
): ReadonlyMap<number, number> => {
  const ink = new Map<number, number>();
  for (let i = 0; i < sheet.owner.length; i++) {
    const own = (sheet.owner[i] ?? 0) - 1;
    if (!bodies.has(own)) continue;
    for (const arm of arms) if (isCuffInk(sheet, cuffInk, arm, own, i)) ink.set(i, arm.k);
  }
  return ink;
};

/** Each pixel part `loose` owns in its loose pieces, and the part index of the arm whose hand lies nearest the piece. */
const loosePiecesOf = (
  sheet: PartSheet,
  arms: ReadonlyArray<SheetArm>,
  loose: number,
): ReadonlyMap<number, number> => {
  const pieces = new Map<number, number>();
  for (const region of looseOf(regionsOf(sheet.parts[loose]?.pixels ?? NO_PIXELS))) {
    const first = region[0] ?? 0;
    const byNear = arms.toSorted(
      (a, b) => handDistance(sheet, a, first) - handDistance(sheet, b, first),
    );
    const nearest = byNear[0]?.k ?? -1;
    for (const i of region) if (sheet.owner[i] === loose + 1) pieces.set(i, nearest);
  }
  return pieces;
};

/** Pixel `i` of `rgba` as the rounded mean of its 8 neighbours there, leaving out `moved` and clear ones; as it is where none is left. */
const refilled = (
  size: Size,
  rgba: Uint8Array,
  moved: ReadonlyMap<number, number>,
  i: number,
): ReadonlyArray<number> => {
  const kept = aroundOf(size, i).filter((j) => !moved.has(j) && (rgba[j * 4 + 3] ?? 0) > 0);
  return [0, 1, 2, 3].map((c) =>
    Option.match(
      Option.liftPredicate(kept, (k) => k.length > 0),
      {
        onNone: () => rgba[i * 4 + c] ?? 0,
        onSome: (k) => Math.round(k.reduce((s, j) => s + (rgba[j * 4 + c] ?? 0), 0) / k.length),
      },
    ),
  );
};

/**
 * Gives each arm the pixels of it a hand-disc cut leaves on the body: the
 * cuff's ink between the arm's polygon and its hand disc, and the loose
 * pieces of the `loose` part (its 8-connected regions but its largest) the
 * cut strands beside the cuffs. A body pixel is cuff ink when it lies at or
 * above its hand disc's centre, within `cuff.rim` pixels past the disc's
 * edge, touches the arm, and is at least `cuff.darker` darker than its own
 * part's neighbours lying past the disc's first ring. Each such pixel moves
 * with its bytes to the arm (a loose piece to the arm whose hand lies
 * nearest); its owner becomes that arm. The body part keeps a cuff pixel
 * refilled with the rounded mean of its 8 neighbours there, leaving out the
 * moved and the clear ones, and a loose piece cleared. A sheet that lacks an
 * arm, a body part or the loose part is refused.
 */
export const cuffsToArms =
  ({ arms, body, loose, cuff: cuffInk }: CuffsToArms): SheetClean =>
  (sheet) =>
    Result.map(
      Result.all([
        indicesOf(
          sheet,
          arms.map((arm) => arm.name),
        ),
        indicesOf(sheet, body),
        indexOf(sheet, loose),
      ]),
      ([armAt, bodyAt, looseAt]) => {
        const sheetArms = Arr.zipWith(arms, armAt, (arm, k) => ({ ...arm, k }));
        const ink = Option.getOrElse(Option.fromUndefinedOr(cuffInk), () => CUFF);
        const cuff = cuffInkOf(sheet, ink, sheetArms, new Set(bodyAt));
        const moved = new Map([...cuff, ...loosePiecesOf(sheet, sheetArms, looseAt)]);
        const owner = new Uint8Array(sheet.owner);
        const out = sheet.parts.map((p) => new Uint8Array(p.pixels.rgba));
        for (const [i, k] of moved) {
          const from = (sheet.owner[i] ?? 0) - 1;
          const rgba = sheet.parts[from]?.pixels.rgba ?? NO_PIXELS.rgba;
          out[k]?.set(rgba.subarray(i * 4, i * 4 + 4), i * 4);
          owner[i] = k + 1;
          out[from]?.set(
            Option.match(
              Option.liftPredicate(i, (j) => cuff.has(j)),
              {
                onNone: () => [0, 0, 0, 0],
                onSome: (j) => refilled(sheet, rgba, moved, j),
              },
            ),
            i * 4,
          );
        }
        return { ...withPixels(sheet, (k) => Option.fromUndefinedOr(out[k])), owner };
      },
    );

/** What `clearPaperRim` reads: the view's paper (RGB), how many 8-steps the clear ground's flood reaches, and the ΔE76 within which a pixel is paper-coloured. */
export interface PaperRim {
  readonly paper: Rgb;
  readonly band: number;
  readonly near: number;
}

/** Pixel `i` of the figure laid from `layers` front to back: its front-most layer with alpha above 0, its RGBA there; none on clear ground. */
const frontAt = (
  layers: ReadonlyArray<Raster>,
  i: number,
): Option.Option<readonly [number, number, number, number]> =>
  Option.map(
    Option.fromUndefinedOr(layers.find((l) => (l.rgba[i * 4 + 3] ?? 0) > 0)),
    ({ rgba }) => [
      rgba[i * 4] ?? 0,
      rgba[i * 4 + 1] ?? 0,
      rgba[i * 4 + 2] ?? 0,
      rgba[i * 4 + 3] ?? 0,
    ],
  );

/** Whether pixel `i` of the figure laid from `layers` front to back is paper-coloured: its front-most opaque layer's colour lies within `near` (ΔE76) of `paperLab`. A clear pixel is not. */
const paperAt = (layers: ReadonlyArray<Raster>, i: number, paperLab: Rgb, near: number): boolean =>
  Option.match(frontAt(layers, i), {
    onNone: () => false,
    onSome: ([r, g, b]) => deltaE(labOf([r, g, b]), paperLab) < near,
  });

/**
 * The band the clear ground of the figure laid from `layers` front to back
 * (each a raster of one size) reaches: 1 on each pixel with a layer opaque
 * there that the clear ground (no layer opaque) reaches within `band`
 * 8-steps through pixels `through` holds.
 */
const groundBandOf = (
  layers: ReadonlyArray<Raster>,
  band: number,
  through: (i: number) => boolean,
): Uint8Array => {
  const size = layers[0] ?? NO_PIXELS;
  const count = size.width * size.height;
  const depth = new Int32Array(count).fill(-1);
  const queue: Array<number> = [];
  for (let i = 0; i < count; i++)
    if (!layers.some((l) => (l.rgba[i * 4 + 3] ?? 0) > 0)) {
      depth[i] = 0;
      queue.push(i);
    }
  const reached = new Uint8Array(count);
  for (let head = 0; head < queue.length; head++) {
    const i = queue[head] ?? 0;
    const d = depth[i] ?? 0;
    if (d >= band) continue;
    for (const j of aroundOf(size, i)) {
      if (depth[j] !== -1 || !through(j)) continue;
      depth[j] = d + 1;
      reached[j] = 1;
      queue.push(j);
    }
  }
  return reached;
};

/**
 * The paper rim of the figure laid from `layers` front to back (each a raster
 * of one size): 1 on each pixel the clear ground (no layer opaque) reaches
 * within `band` 8-steps through paper-coloured pixels (`near` of `paper`).
 * The flood stops at ink and its anti-aliased blend, which lie farther from
 * the paper, and at the cloth the ink walls in.
 */
export const paperRimOf = (
  layers: ReadonlyArray<Raster>,
  { paper, band, near }: PaperRim,
): Uint8Array => {
  const paperLab = labOf(paper);
  return groundBandOf(layers, band, (j) => paperAt(layers, j, paperLab, near));
};

/** What `paperRimLeftOf` reads: the view's paper (RGB), its ground shadow's parts by index front to back, how many 8-steps out from the clear ground its outer band reaches, the luma (0..255) at or under which a pixel is ink, the ΔE76 within which a pixel is paper-coloured, and the alpha at or over which a pixel is drawn whole. */
export interface RimLeft {
  readonly paper: Rgb;
  readonly shadow: ReadonlyArray<number>;
  readonly band: number;
  readonly ink: number;
  readonly near: number;
  readonly opaque: number;
}

/** The rim a puppet's un-matte may leave that draws as a torn white fringe: within 8 steps of the clear ground, past ink (luma 110, the un-matte's own), within ΔE76 12 of the paper, at alpha 200 or more. */
export const RIM_LEFT = { band: 8, ink: 110, near: 12, opaque: 200 } as const satisfies Omit<
  RimLeft,
  'paper' | 'shadow'
>;

/** A colour's luma (0..255). */
const lumaOf = (r: number, g: number, b: number): number => 0.299 * r + 0.587 * g + 0.114 * b;

/**
 * The paper rim the un-matte leaves on a figure: `cut` its part sheet's
 * parts front to back as cut, `unmatted` the same parts as its puppet holds
 * them (each a raster of `cut`'s size). 1 on each pixel outside the
 * figure's outer ink, reached in `cut` from its clear ground within `band`
 * 8-steps through pixels lighter than ink (luma over `ink`), that the
 * un-matted figure draws at alpha `opaque` or more in a colour within `near`
 * (ΔE76) of `paper`: the sheet's paper the un-matte read as the member's
 * cloth and kept, which lays a pale fringe round him on any other paper. A
 * pixel a `shadow` part draws in front is his ground shadow's own paint,
 * which has no ink to lie outside, and is never rim.
 */
export const paperRimLeftOf = (
  cut: ReadonlyArray<Raster>,
  unmatted: ReadonlyArray<Raster>,
  { paper, shadow, band, ink, near, opaque }: RimLeft,
): Uint8Array => {
  const paperLab = labOf(paper);
  const outer = groundBandOf(cut, band, (j) =>
    Option.match(frontAt(cut, j), {
      onNone: () => false,
      onSome: ([r, g, b]) => lumaOf(r, g, b) > ink,
    }),
  );
  const figure = (i: number) =>
    !shadow.includes(unmatted.findIndex((l) => (l.rgba[i * 4 + 3] ?? 0) > 0));
  return outer.map((o, i) =>
    Option.match(
      Option.filter(frontAt(unmatted, i), () => o === 1 && figure(i)),
      {
        onNone: () => 0,
        onSome: ([r, g, b, a]) => Number(a >= opaque && deltaE(labOf([r, g, b]), paperLab) < near),
      },
    ),
  );
};

/** `rgba` with every pixel `rim` holds that has alpha above 0 cleared to 0 in all four bytes; a clear pixel keeps its bytes. */
export const clearedBy = (rgba: Uint8Array, rim: Uint8Array): Uint8Array => {
  const out = new Uint8Array(rgba);
  for (let i = 0; i < rim.length; i++)
    if (rim[i] === 1 && (out[i * 4 + 3] ?? 0) > 0) out.fill(0, i * 4, i * 4 + 4);
  return out;
};

/**
 * Clears the paper rim a view's paint keeps outside the figure's ink: a pale
 * band the painter lays just outside the outer outline, nearer the member's
 * cloth than the paper, which the un-matte would read as cloth and draw as a
 * white torn rim on any paper. The parts are laid front to back as the sheet
 * holds them; each pixel of their paper rim (`paperRimOf`) is cleared from
 * every part and becomes the ground's. Run again on its own answer, the flood
 * stops where it starts.
 */
export const clearPaperRim =
  (rim: PaperRim): SheetClean =>
  (sheet) => {
    const mask = paperRimOf(
      sheet.parts.map((p) => p.pixels),
      rim,
    );
    const owner = new Uint8Array(sheet.owner);
    for (let i = 0; i < mask.length; i++) if (mask[i] === 1) owner[i] = 0;
    return Result.succeed({
      ...withPixels(sheet, (k) =>
        Option.map(Option.fromUndefinedOr(sheet.parts[k]), (p) => clearedBy(p.pixels.rgba, mask)),
      ),
      owner,
    });
  };
