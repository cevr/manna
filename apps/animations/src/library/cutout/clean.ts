// The rules a member's cut table runs on a view's laid part sheet (`CLEAN`,
// @manna/film's `SheetClean`): fixes its art needs that neither the cut nor the
// paint makes, kept as rules so laying the answer again makes the same part
// PNGs. A member's `cutout/cut.ts` names each view's rule with its own numbers.
// Pure: the same sheet in gives the same bytes out.

import type { PartSheet, Raster, SheetClean } from '@manna/film/tools';
import { Option } from 'effect';

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

/** The index of the part named `name` in `sheet`, where the sheet has it. */
const indexOf = (sheet: PartSheet, name: string): Option.Option<number> =>
  Option.liftPredicate(
    sheet.parts.findIndex((p) => p.name === name),
    (k) => k >= 0,
  );

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
 * the ground's. A part the sheet lacks is left as it is.
 */
export const clearSpecks =
  (name: string, most: number): SheetClean =>
  (sheet) =>
    Option.match(indexOf(sheet, name), {
      onNone: () => sheet,
      onSome: (k) => {
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
      },
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
}

/** How far past a hand disc's edge, in pixels, its cuff's ink can lie on the body. */
const CUFF_RIM = 2;

/** How far past a hand disc's edge the body a rim pixel is measured against begins. */
const BODY_PAST = 1;

/** How much darker than the body around it, in mean channel value, a rim pixel is cuff ink. */
const CUFF_DARKER = 10;

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
const isCuffInk = (sheet: PartSheet, arm: SheetArm, own: number, i: number): boolean => {
  const d = handDistance(sheet, arm, i);
  const row = Math.floor(i / sheet.width);
  if (d <= arm.hand.r || d > arm.hand.r + CUFF_RIM || row + 0.5 > arm.hand.c[1]) return false;
  const near = aroundOf(sheet, i);
  if (!near.some((j) => sheet.owner[j] === arm.k + 1)) return false;
  const body = near.filter(
    (j) => sheet.owner[j] === own + 1 && handDistance(sheet, arm, j) > arm.hand.r + BODY_PAST,
  );
  const rgba = sheet.parts[own]?.pixels.rgba ?? NO_PIXELS.rgba;
  const bodyLight = body.reduce((s, j) => s + lightOf(rgba, j), 0) / body.length;
  return body.length > 0 && bodyLight - lightOf(rgba, i) >= CUFF_DARKER;
};

/** Each body pixel that is an arm's cuff ink, and that arm's part index. */
const cuffInkOf = (
  sheet: PartSheet,
  arms: ReadonlyArray<SheetArm>,
  bodies: ReadonlySet<number>,
): ReadonlyMap<number, number> => {
  const ink = new Map<number, number>();
  for (let i = 0; i < sheet.owner.length; i++) {
    const own = (sheet.owner[i] ?? 0) - 1;
    if (!bodies.has(own)) continue;
    for (const arm of arms) if (isCuffInk(sheet, arm, own, i)) ink.set(i, arm.k);
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
 * above its hand disc's centre, within `CUFF_RIM` pixels past the disc's
 * edge, touches the arm, and is at least `CUFF_DARKER` darker than its own
 * part's neighbours lying past the disc's first ring. Each such pixel moves
 * with its bytes to the arm (a loose piece to the arm whose hand lies
 * nearest); its owner becomes that arm. The body part keeps a cuff pixel
 * refilled with the rounded mean of its 8 neighbours there, leaving out the
 * moved and the clear ones, and a loose piece cleared.
 */
export const cuffsToArms =
  ({ arms, body, loose }: CuffsToArms): SheetClean =>
  (sheet) => {
    const at = (name: string) => sheet.parts.findIndex((p) => p.name === name);
    const sheetArms = arms.map((arm) => ({ ...arm, k: at(arm.name) }));
    const cuff = cuffInkOf(sheet, sheetArms, new Set(body.map(at)));
    const moved = new Map([...cuff, ...loosePiecesOf(sheet, sheetArms, at(loose))]);
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
  };
