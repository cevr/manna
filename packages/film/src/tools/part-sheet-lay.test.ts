import { describe, expect, test } from 'bun:test';
import { Boolean as Bool, Option, Result, Schema } from 'effect';
import { type PartCut, cutParts } from '../core/part-sheet.ts';
import type { Raster } from '../core/raster.ts';
import {
  HiddenMeasures,
  domainOf,
  hiddenOf,
  layAnswer,
  missedBars,
  rankOrder,
} from './part-sheet-lay.ts';

type Rgb = readonly [number, number, number];
type Box = { readonly x0: number; readonly y0: number; readonly x1: number; readonly y1: number };

const W = 48;
const PAPER: Rgb = [244, 232, 212];
const OLIVE: Rgb = [150, 140, 100];
/** The sleeve's cream: what a speck of the kept arm left in the paint shows. */
const CREAM: Rgb = [217, 191, 165];
/** A grey of the olive's lightness: shade with no colour. */
const GREY: Rgb = [138, 138, 138];
/** The ink of an outline drawn in the paint. */
const INK: Rgb = [70, 58, 46];
/** A skin beside the olive: a second material of the torso. */
const SKIN: Rgb = [214, 160, 128];
/** A light tunic: the cloth the robe and most of the torso keep. */
const TUNIC: Rgb = [225, 215, 190];
/** The olive 5.3 L* lighter: a fleck of fine grain, under the speck's 12 L* and over the grain's 4. */
const FLECK: Rgb = [164, 154, 114];
/** An olive cloth as dark as L* 40, under the ink's 45: shade a figure's cloth keeps. */
const DARK_OLIVE: Rgb = [105, 95, 60];
/** The dark olive 5 L* darker: a fleck of fine grain in it. */
const DARK_FLECK: Rgb = [93, 83, 49];
/** An ink of L* 20, drawn as an outline through the dark olive. */
const DARK_INK: Rgb = [56, 47, 37];
/** A brown cloth of L* 15.25: the darkest kept cloth of the cast measures L* 15.2, under 1 above the outline's 15. */
const DEEP: Rgb = [45, 37, 26];
/** The deep brown 6.1 L* lighter: a fleck of fine grain in it. */
const DEEP_FLECK: Rgb = [59, 50, 36];
/** An ink of L* 5: an outline's core. */
const OUTLINE_INK: Rgb = [20, 16, 14];
/** An outline's ramp into its cloth, L* 46. */
const RAMP: Rgb = [118, 108, 96];

/** The torso in a picture `h` px tall: 4 px in from its top and foot. */
const torsoOf = (h: number): Box => ({ x0: 6, y0: 4, x1: 42, y1: h - 4 });
const ARM: Box = { x0: 18, y0: 8, x1: 30, y1: 40 };
const inside = (b: Box, x: number, y: number) => x >= b.x0 && x < b.x1 && y >= b.y0 && y < b.y1;

const rasterOf = (colour: (x: number, y: number) => Rgb, w = W, h = W): Raster => {
  const rgba = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) rgba.set([...colour(x, y), 255], (y * w + x) * 4);
  return { width: w, height: h, rgba };
};

const corners = (b: Box): ReadonlyArray<readonly [number, number]> => [
  [b.x0, b.y0],
  [b.x1, b.y0],
  [b.x1, b.y1],
  [b.x0, b.y1],
];

type Paint = (x: number, y: number) => Rgb;
type Still = { readonly name: string; readonly polygon: ReadonlyArray<readonly [number, number]> };

/**
 * A torso of `cloth` (flat olive unless given) on `paper` (flat unless
 * given), in a picture `h` px tall (`W` unless given), cut into the `still`
 * parts (one torso unless given), with a cream arm in `arm` in front of it
 * that moves, and okra's answer laid on it: the view with the arm's place
 * painted, the cloth or paper at its edge and `inner` more than `margin` px
 * in from it (2 unless given, where the seam never reads).
 */
const layOn =
  (
    arm: Box,
    {
      h = W,
      cloth = (): Rgb => OLIVE,
      paper = (): Rgb => PAPER,
      margin = 2,
      still = [{ name: 'torso', polygon: corners(torsoOf(h)) }],
    }: {
      h?: number;
      cloth?: Paint;
      paper?: Paint;
      margin?: number;
      still?: ReadonlyArray<Still>;
    } = {},
  ) =>
  (inner: Paint) => {
    const body = torsoOf(h);
    const torso = (x: number, y: number) =>
      Bool.match(inside(body, x, y), { onTrue: () => cloth(x, y), onFalse: () => paper(x, y) });
    const view = rasterOf(
      (x, y) => Bool.match(inside(arm, x, y), { onTrue: () => CREAM, onFalse: () => torso(x, y) }),
      W,
      h,
    );
    const cut: PartCut = {
      parts: [
        { name: 'arm', take: [{ polygon: corners(arm) }] },
        ...still.map(({ name, polygon }) => ({ name, take: [{ polygon }] })),
      ],
    };
    const m = margin;
    const within = { x0: arm.x0 + m, y0: arm.y0 + m, x1: arm.x1 - m, y1: arm.y1 - m };
    const answer = rasterOf(
      (x, y) =>
        Bool.match(inside(within, x, y), { onTrue: () => inner(x, y), onFalse: () => torso(x, y) }),
      W,
      h,
    );
    const figure = Uint8Array.from({ length: W * h }, (_, i) =>
      Number(inside(body, i % W, Math.floor(i / W)) || inside(arm, i % W, Math.floor(i / W))),
    );
    return measuresOf(view, cut, figure, answer);
  };

type Lay = Result.Result.Success<ReturnType<typeof layAnswer>>;

/** Each measure `measuresOf` gave, with the whole lay it came from: the fit and the sheet made, for the golden digests. */
const lays = new WeakMap<HiddenMeasures, Lay>();

/** The measures of `answer` laid on `view`, cut by `cut` within `figure`, with the arm moving. */
const measuresOf = (view: Raster, cut: PartCut, figure: Uint8Array, answer: Raster) => {
  const sheet = Result.getOrThrow(cutParts(view, cut, { figure }));
  const hidden = hiddenOf(sheet, ['arm']);
  const target = {
    view,
    sheet,
    hidden,
    domain: domainOf(sheet, hidden),
    moving: ['arm'],
    pad: { s: 1, dx: 0, dy: 0 },
    portrait: { width: view.width, height: view.height },
  };
  const lay = Result.getOrThrow(layAnswer(target, answer));
  lays.set(lay.measures, lay);
  return lay.measures;
};

/** A digest of the whole lay behind `measures`: its fit and measures to the last bit, and every byte of the sheet it made. */
const digestOf = (measures: HiddenMeasures) => {
  const lay = lays.get(measures);
  const fit = lay?.fit ?? { s: 0, dx: 0, dy: 0, score: 0 };
  const hash = new Bun.CryptoHasher('sha256')
    .update(new Uint8Array(Float64Array.of(fit.s, fit.dx, fit.dy, fit.score).buffer))
    .update(Schema.encodeSync(Schema.fromJsonString(HiddenMeasures))(measures));
  hash.update(lay?.made.owner ?? new Uint8Array());
  for (const part of lay?.made.parts ?? [])
    hash.update(`${part.name} ${part.kept} ${part.painted}`).update(part.pixels.rgba);
  return hash.digest('hex').slice(0, 16);
};

/** The size of the strip `layStrip` lays: tall enough for its edge to cross eight rows of grain cells. */
const STRIP = { w: 72, h: 192 } as const;
/** The torso's left edge in the strip: one pixel out every four rows, from x 6. */
const stripEdge = (y: number) => 6 + Math.floor(y / 4);
/** The corners down the strip's edge, `d` px right of it, for a strip `h` px tall. */
const stairOf = (d: number, h: number = STRIP.h): ReadonlyArray<readonly [number, number]> =>
  Array.from({ length: h / 4 }, (_, s) => [
    [6 + s + d, 4 * s] as const,
    [6 + s + d, 4 * s + 4] as const,
  ]).flat();
/** A patch the arm takes inside the torso, in grain cells of its own, the answer paints smooth. */
const PATCH: Box = { x0: 50, y0: 8, x1: 66, y1: 72 };

/**
 * A torso of flat olive whose left edge slants (`stripEdge`), with a cream
 * arm in front of that edge, 6 px over the ground and 7 px over the torso,
 * and in `PATCH`; and okra's answer laid on it: the patch olive, and under
 * the arm the paper to the edge, then `edge[d]` for the 7 px `d` in from it.
 */
const layStrip = (edge: ReadonlyArray<Rgb>) => {
  const { w, h } = STRIP;
  const ground = (x: number, y: number) => x < stripEdge(y) - 6 || x >= w - 4;
  const armAt = (x: number, y: number) => x < stripEdge(y) + 7 || inside(PATCH, x, y);
  const view = rasterOf(
    (x, y) =>
      Bool.match(ground(x, y), {
        onTrue: () => PAPER,
        onFalse: () => Bool.match(armAt(x, y), { onTrue: () => CREAM, onFalse: () => OLIVE }),
      }),
    w,
    h,
  );
  const answer = rasterOf(
    (x, y) =>
      Bool.match(x < stripEdge(y) || x >= w - 4, {
        onTrue: () => PAPER,
        onFalse: () => edge[x - stripEdge(y)] ?? OLIVE,
      }),
    w,
    h,
  );
  const cut: PartCut = {
    parts: [
      {
        name: 'arm',
        take: [
          { polygon: [...stairOf(7), ...stairOf(-6).toReversed()] },
          { polygon: corners(PATCH) },
        ],
      },
      { name: 'torso', take: [{ polygon: [[w - 4, 0], [w - 4, h], ...stairOf(0).toReversed()] }] },
    ],
  };
  const figure = Uint8Array.from({ length: w * h }, (_, i) =>
    Number(!ground(i % w, Math.floor(i / w))),
  );
  return measuresOf(view, cut, figure, answer);
};

/** A part's own outline along its edge, read in from the edge: 4 px of ink, a ramp and 2 px of cloth. */
const OUTLINE: ReadonlyArray<Rgb> = [...Array<Rgb>(4).fill(OUTLINE_INK), RAMP, OLIVE, OLIVE];
/**
 * How far in from the strip's edge the arm lies over the outlined torso, and
 * where the torso ends, px: its 7 px of olive past the arm are enough of its
 * kept cloth that the pooled grain reads it smooth beside the outline (6 px
 * are not), and few enough that the outline, read as cloth, is near 5 % of
 * each cell's kept cloth.
 */
const BESIDE = {
  arm: [OUTLINE.length, OUTLINE.length + 16],
  end: OUTLINE.length + 16 + 7,
} as const;

/**
 * A torso, half the strip's height, whose left edge slants (`stripEdge`):
 * its `OUTLINE` kept along that edge, a cream arm that moves over the 16 px
 * in from it, and a band of olive past the arm; and okra's answer laid on
 * it: `inner` in the arm's place, the view elsewhere.
 */
const layBeside = (inner: Paint) => {
  const [w, h] = [STRIP.w, STRIP.h / 2];
  const [a0, a1] = BESIDE.arm;
  const ground = (x: number, y: number) => x < stripEdge(y) || x >= stripEdge(y) + BESIDE.end;
  const armAt = (x: number, y: number) => x >= stripEdge(y) + a0 && x < stripEdge(y) + a1;
  const pictureOf = (arm: Paint) =>
    rasterOf(
      (x, y) =>
        Bool.match(ground(x, y), {
          onTrue: () => PAPER,
          onFalse: () =>
            Bool.match(armAt(x, y), {
              onTrue: () => arm(x, y),
              onFalse: () => OUTLINE[x - stripEdge(y)] ?? OLIVE,
            }),
        }),
      w,
      h,
    );
  const cut: PartCut = {
    parts: [
      { name: 'arm', take: [{ polygon: [...stairOf(a0, h), ...stairOf(a1, h).toReversed()] }] },
      {
        name: 'torso',
        take: [{ polygon: [...stairOf(0, h), ...stairOf(BESIDE.end, h).toReversed()] }],
      },
    ],
  };
  const figure = Uint8Array.from({ length: w * h }, (_, i) =>
    Number(!ground(i % w, Math.floor(i / w))),
  );
  return measuresOf(
    pictureOf(() => CREAM),
    cut,
    figure,
    pictureOf(inner),
  );
};

const laid = layOn(ARM);
const olive = () => OLIVE;
/** The arm laid in smooth olive, the kept cloth: two tests read it and neither changes it. */
const smoothArm = laid(olive);
/** The arm laid with a cream pixel every 3 px across the paint, the sleeve's colour left in the torso: a test and the golden digests read it. */
const fleckedArm = laid((x, y) =>
  Bool.match((x - ARM.x0) % 3 === 2 && (y - ARM.y0) % 3 === 2, {
    onTrue: () => CREAM,
    onFalse: () => OLIVE,
  }),
);
/** One pixel in 14, 5.3 L* lighter than the olive: fine grain the part's pooled grain reads as smooth. */
const fineFleck = (x: number, y: number): Rgb =>
  Bool.match((x + 5 * y) % 14 === 0, { onTrue: () => FLECK, onFalse: () => OLIVE });
/** Fine grain painted beside a part's own outline: a test and the golden digests read it. */
const grainyBeside = layBeside(fineFleck);

/** A fixed scatter of each channel of `c` up to `k` either way, pixel by pixel: grain with no seed to keep. */
const grained =
  (c: Rgb, k: number): Paint =>
  (x, y) => {
    const at = (ch: number) => {
      const scatter =
        (Math.imul(x + 1, 73856093) ^ Math.imul(y + 1, 19349663) ^ Math.imul(ch + 1, 83492791)) >>>
        0;
      return Math.max(0, Math.min(255, (c[ch] ?? 0) + (scatter % (2 * k + 1)) - k));
    };
    return [at(0), at(1), at(2)];
  };
/** The arm across the torso's left edge, half on the paper. */
const ACROSS: Box = { x0: 2, y0: 8, x1: 30, y1: 40 };
/**
 * For the golden digests only, the three reads the other lays never decide:
 * a torso whose cloth runs more than the 24 px lattice reach past the paint;
 * paint of 2 px cream stripes every 4 px, so a speck at its edge is read
 * against an even count of neighbours, half cream; and the arm across the
 * torso's edge onto paper grained 16 either way, the paper under it grained
 * 40, so the paper's spread, not its floor, sets how far the ground reaches.
 */
const acrossTheEdge = layOn(ACROSS, { h: 72, paper: grained(PAPER, 16) })((x, y) =>
  Bool.match(x < torsoOf(72).x0, {
    onTrue: () => grained(PAPER, 40)(x, y),
    onFalse: () => Bool.match(x % 4 < 2, { onTrue: () => CREAM, onFalse: () => OLIVE }),
  }),
);

describe('the part sheet lay', () => {
  test('paint flecked with the kept sleeve misses the speck bar; smooth paint meets it', () => {
    const flecked = fleckedArm;
    const smooth = smoothArm;
    expect(flecked.speck).toEqual([
      expect.objectContaining({ part: 'torso', under: 'arm', verdict: 'outside' }),
    ]);
    expect(missedBars(flecked)).toContain('speck');
    expect(smooth.speck).toEqual([
      expect.objectContaining({ part: 'torso', under: 'arm', verdict: 'within' }),
    ]);
    expect(missedBars(smooth)).not.toContain('speck');
  });

  test('paint clumped with the kept sleeve, 2 px across every 5 px, misses the speck bar', () => {
    const clumped = laid((x, y) =>
      Bool.match((x - ARM.x0) % 5 < 2 && (y - ARM.y0) % 5 < 2, {
        onTrue: () => CREAM,
        onFalse: () => OLIVE,
      }),
    );
    expect(clumped.speck).toEqual([expect.objectContaining({ verdict: 'outside' })]);
    expect(missedBars(clumped)).toContain('speck');
  });

  test('paint hatched with dashes of the kept sleeve, 4 × 1 on every fourth row, misses the speck bar', () => {
    const dash = (x: number, y: number) =>
      (y - ARM.y0) % 4 === 2 && [1, 2, 3, 4, 7, 8, 9, 10].includes(x - ARM.x0);
    const hatched = layOn(ARM, { margin: 0 })((x, y) =>
      Bool.match(dash(x, y), { onTrue: () => CREAM, onFalse: () => OLIVE }),
    );
    expect(hatched.speck).toEqual([expect.objectContaining({ verdict: 'outside' })]);
    expect(missedBars(hatched)).toContain('speck');
  });

  test('a thin outline in the paint, dotted along its edge or drawn across it, is not speckle', () => {
    const edge = (x: number, y: number) =>
      (x === ARM.x0 || x === ARM.x1 - 1 || y === ARM.y0 || y === ARM.y1 - 1) && (x + y) % 2 === 0;
    const across = (x: number, y: number) => x === ARM.x0 + 2 + Math.floor((y - ARM.y0) / 4);
    const outlined = layOn(ARM, { margin: 0 })((x, y) =>
      Bool.match(edge(x, y) || across(x, y), { onTrue: () => INK, onFalse: () => OLIVE }),
    );
    expect(outlined.speck).toEqual([expect.objectContaining({ verdict: 'within' })]);
    expect(missedBars(outlined)).not.toContain('speck');
  });

  test('paint of two materials, each matching its cloth, with a cell too sparse to read, meets the speck and drift bars', () => {
    const cloth = (x: number): Rgb =>
      Bool.match(x < 21, { onTrue: () => OLIVE, onFalse: () => SKIN });
    const mixed = layOn({ x0: 18, y0: 8, x1: 30, y1: 26 }, { cloth })((x) => cloth(x));
    expect(mixed.speck).toEqual([expect.objectContaining({ verdict: 'within' })]);
    expect(mixed.drift.chroma).toEqual([expect.objectContaining({ cells: 2, verdict: 'within' })]);
    expect(missedBars(mixed)).not.toContain('speck');
    expect(missedBars(mixed)).not.toContain('drift');
  });

  test('paint with fine grain in a cell misses the grain bar over smooth cloth; paint as grainy as its cloth meets it', () => {
    const fleck = (x: number, y: number): Rgb =>
      Bool.match((x + 5 * y) % 14 === 0, { onTrue: () => FLECK, onFalse: () => OLIVE });
    const arm = { x0: 24, y0: 8, x1: 36, y1: 40 };
    const grainy = layOn(arm, { margin: 0 })(fleck);
    const asCloth = layOn(arm, { margin: 0, cloth: fleck })(fleck);
    expect(grainy.grain).toEqual([expect.objectContaining({ part: 'torso', verdict: 'outside' })]);
    expect(missedBars(grainy)).toContain('grain');
    expect(asCloth.grain).toEqual([expect.objectContaining({ part: 'torso', verdict: 'within' })]);
    expect(missedBars(asCloth)).not.toContain('grain');
  });

  test('fine grain in one cell among smooth cells misses the grain bar, though pooled over the part it is under the bar', () => {
    const arm = { x0: 24, y0: 8, x1: 40, y1: 88 };
    const fleck = (x: number, y: number): Rgb =>
      Bool.match(y >= 24 && y < 48 && (x + 5 * y) % 14 === 0, {
        onTrue: () => FLECK,
        onFalse: () => OLIVE,
      });
    const patched = layOn(arm, { margin: 0, h: 96 })(fleck);
    expect(patched.grain).toEqual([expect.objectContaining({ part: 'torso', verdict: 'outside' })]);
    expect(missedBars(patched)).toContain('grain');
    expect(patched.grain[0]?.fine.cells).toBe(4);
    expect(patched.grain[0]?.fine.painted.share).toBeGreaterThan(0.06);
  });

  test('fine grain in cloth as dark as L* 40 misses the grain bar; an ink outline through it is not grain; smooth dark paint meets it', () => {
    const arm = { x0: 24, y0: 8, x1: 40, y1: 40 };
    const dark = (): Rgb => DARK_OLIVE;
    const fleck = (x: number, y: number): Rgb =>
      Bool.match((x + 5 * y) % 14 === 0, { onTrue: () => DARK_FLECK, onFalse: dark });
    const inked = (x: number, y: number): Rgb =>
      Bool.match(x === arm.x0 + 2 + Math.floor((y - arm.y0) / 4), {
        onTrue: () => DARK_INK,
        onFalse: dark,
      });
    const onDark = layOn(arm, { margin: 0, cloth: dark });
    const [grainy, lined, smooth] = [onDark(fleck), onDark(inked), onDark(dark)];
    expect(grainy.grain).toEqual([expect.objectContaining({ part: 'torso', verdict: 'outside' })]);
    expect(missedBars(grainy)).toContain('grain');
    expect(lined.grain).toEqual([expect.objectContaining({ part: 'torso', verdict: 'within' })]);
    expect(missedBars(lined)).not.toContain('grain');
    expect(smooth.grain).toEqual([expect.objectContaining({ part: 'torso', verdict: 'within' })]);
    expect(missedBars(smooth)).not.toContain('grain');
  });

  test('fine grain in cloth as dark as the darkest kept cloth misses the grain bar; smooth paint of it meets it', () => {
    const arm = { x0: 24, y0: 8, x1: 40, y1: 40 };
    const deep = (): Rgb => DEEP;
    const fleck = (x: number, y: number): Rgb =>
      Bool.match((x + 5 * y) % 14 === 0, { onTrue: () => DEEP_FLECK, onFalse: deep });
    const onDeep = layOn(arm, { margin: 0, cloth: deep });
    const [grainy, smooth] = [onDeep(fleck), onDeep(deep)];
    expect(grainy.grain).toEqual([expect.objectContaining({ part: 'torso', verdict: 'outside' })]);
    expect(missedBars(grainy)).toContain('grain');
    expect(smooth.grain).toEqual([expect.objectContaining({ part: 'torso', verdict: 'within' })]);
    expect(missedBars(smooth)).not.toContain('grain');
  });

  test("a part's own outline along its edge, 4 px of ink, a ramp and 2 px of cloth, is not grain beside smooth kept cloth", () => {
    const outlined = layStrip(OUTLINE);
    expect(outlined.grain).toEqual([expect.objectContaining({ part: 'torso', verdict: 'within' })]);
    expect(missedBars(outlined)).not.toContain('grain');
  });

  test("fine grain painted beside a part's own outline in its kept cloth misses the grain bar", () => {
    const [grainy, smooth] = [grainyBeside, layBeside(olive)];
    expect(grainy.grain).toEqual([expect.objectContaining({ part: 'torso', verdict: 'outside' })]);
    expect(missedBars(grainy)).toContain('grain');
    expect(smooth.grain).toEqual([expect.objectContaining({ part: 'torso', verdict: 'within' })]);
    expect(missedBars(smooth)).not.toContain('grain');
  });

  test('paint greyer than the cloth beside it misses the drift bar, though its seam matches', () => {
    const grey = laid(() => GREY);
    const kept = smoothArm;
    expect(grey.seam.deltaE._tag === 'Some' && grey.seam.deltaE.value).toBe(0);
    expect(grey.drift.chroma).toEqual([
      expect.objectContaining({ part: 'torso', under: 'arm', verdict: 'outside' }),
    ]);
    expect(missedBars(grey)).toContain('drift');
    expect(kept.drift.chroma).toEqual([
      expect.objectContaining({ part: 'torso', under: 'arm', verdict: 'within' }),
    ]);
    expect(missedBars(kept)).not.toContain('drift');
  });

  test('a region with one pixel fewer than the speck floor misses the speck bar and ranks below one at the floor', () => {
    const atFloor = layOn({ x0: 8, y0: 8, x1: 20, y1: 20 })(olive);
    const under = layOn({ x0: 8, y0: 8, x1: 19, y1: 21 })(olive);
    expect(atFloor.speck).toEqual([
      expect.objectContaining({ painted: { share: 0, px: 100 }, verdict: 'within' }),
    ]);
    expect(missedBars(atFloor)).not.toContain('speck');
    expect(under.speck).toEqual([
      expect.objectContaining({ painted: { share: 0, px: 99 }, verdict: 'unverified' }),
    ]);
    expect(missedBars(under)).toContain('speck');
    expect(rankOrder(under, atFloor)).toBe(1);
  });

  test('a region whose cells hold one pixel fewer than the chroma floor misses the drift bar and ranks below one at the floor', () => {
    const atFloor = layOn({ x0: 8, y0: 8, x1: 13, y1: 16 })(olive);
    const under = layOn({ x0: 8, y0: 8, x1: 11, y1: 21 })(olive);
    expect(atFloor.drift.chroma).toEqual([
      expect.objectContaining({ painted: expect.objectContaining({ px: 40 }), verdict: 'within' }),
    ]);
    expect(missedBars(atFloor)).not.toContain('drift');
    expect(under.drift.chroma).toEqual([
      expect.objectContaining({ cells: 0, verdict: 'unverified' }),
    ]);
    expect(missedBars(under)).toContain('drift');
    expect(rankOrder(under, atFloor)).toBe(1);
  });

  const torsoOverRobe: ReadonlyArray<Still> = [
    {
      name: 'torso',
      polygon: [
        [6, 4],
        [42, 4],
        [42, 44],
        [30, 44],
        [30, 26],
        [6, 26],
      ],
    },
    { name: 'robe', polygon: corners({ x0: 6, y0: 26, x1: 30, y1: 44 }) },
  ];
  /** Tunic paint under a torso and a robe, the torso's taking the vest beside it into its tone: a test and the golden digests read it. */
  const steppedTunic = layOn(ARM, {
    cloth: (x) => Bool.match(x >= 30, { onTrue: () => OLIVE, onFalse: () => TUNIC }),
    still: torsoOverRobe,
  })(() => TUNIC);

  test('paint toned into a step across a part line the answer paints flat misses the step bar', () => {
    const stepped = steppedTunic;
    expect(stepped.step).toEqual([
      expect.objectContaining({
        part: 'torso',
        meets: 'robe',
        under: 'arm',
        answer: 0,
        verdict: 'outside',
      }),
    ]);
    expect(missedBars(stepped)).toContain('step');
  });

  test('paint that steps across a part line as the answer does meets the step bar', () => {
    const cloth = (_: number, y: number): Rgb =>
      Bool.match(y < 26, { onTrue: () => OLIVE, onFalse: () => TUNIC });
    const kept = layOn(ARM, { cloth, still: torsoOverRobe })(cloth);
    expect(kept.step).toEqual([
      expect.objectContaining({ part: 'torso', meets: 'robe', under: 'arm', verdict: 'within' }),
    ]);
    expect(missedBars(kept)).not.toContain('step');
  });

  test('the lays the tests above read are made to the bit as recorded', () => {
    expect(
      [smoothArm, fleckedArm, grainyBeside, steppedTunic, acrossTheEdge].map(digestOf),
    ).toEqual([
      '6b9f3fa4127e079a',
      'e165d6fe33336d3e',
      '9f34941d23116793',
      'caba15530cc12b3d',
      'f05487e14884fdc7',
    ]);
  });

  /** A part's fine grain read in two cells, its paint as grainy as its cloth. */
  const fineWithin = {
    painted: { share: 0.01, px: 300 },
    kept: { share: 0.01, px: 900 },
    cells: 2,
  };
  /** A measure that meets every bar, with the reads `over` names. */
  const measured = (over: Partial<HiddenMeasures>): HiddenMeasures => ({
    seam: { deltaE: Option.some(4), pairs: 80 },
    drift: { deltaE: 3, px: 900, chroma: [] },
    grain: [
      {
        part: 'robe',
        painted: { robust: 1.5, plain: 2, n: 200 },
        kept: { robust: 1.6, plain: 2, n: 200 },
        fine: fineWithin,
        verdict: 'within',
      },
    ],
    speck: [],
    step: [],
    paintUnder: [{ part: 'armRight', px: 900 }],
    paintedPx: 900,
    visibleAtRest: 0,
    recomposeByteEqual: true,
    ...over,
  });
  const robeChroma = (painted: number, kept: number) => ({
    part: 'robe',
    under: 'armRight',
    painted: { chroma: painted, px: 300 },
    kept: { chroma: kept, px: 300 },
    cells: 2,
    verdict: 'outside' as const,
  });
  const robeStep = (laid: number, answer: number) => ({
    part: 'robe',
    meets: 'torso',
    under: 'armRight',
    laid,
    answer,
    pairs: 27,
    verdict: 'outside' as const,
  });

  test('paint far greyer than its cloth ranks below paint that misses two bars by a little', () => {
    const far = measured({ drift: { deltaE: 3, px: 900, chroma: [robeChroma(0.01, 22.11)] } });
    const near = measured({
      drift: { deltaE: 3, px: 900, chroma: [robeChroma(7.43, 13.81)] },
      step: [robeStep(-7.15, -0.2)],
    });
    expect(missedBars(far)).toEqual(['drift']);
    expect(missedBars(near)).toEqual(['drift', 'step']);
    expect(rankOrder(near, far)).toBe(-1);
  });

  test('an answer whose step went unread ranks below one whose step misses by a little', () => {
    const unread = measured({
      step: [{ ...robeStep(-8.81, -0.13), pairs: 3, verdict: 'unverified' }],
    });
    const near = measured({ step: [robeStep(-7.87, -0.57)] });
    expect(missedBars(unread)).toEqual(['step']);
    expect(missedBars(near)).toEqual(['step']);
    expect(rankOrder(near, unread)).toBe(-1);
  });

  test('of two answers with the same unread region, the one whose read drift lies past its bar ranks below', () => {
    const unread = {
      ...robeChroma(0, 0),
      painted: { chroma: 0, px: 0 },
      kept: { chroma: 0, px: 0 },
    };
    const chroma = [{ ...unread, cells: 0, verdict: 'unverified' as const }];
    const worse = measured({ drift: { deltaE: 5.01, px: 900, chroma } });
    const better = measured({ drift: { deltaE: 4.99, px: 900, chroma } });
    expect(missedBars(worse)).toEqual(['drift']);
    expect(missedBars(better)).toEqual(['drift']);
    expect(rankOrder(worse, better)).toBe(1);
  });

  test('of two answers with the same unread line, the one whose read line steps past its bar ranks below', () => {
    const unread = { ...robeStep(-8, 0), meets: 'robe', pairs: 3, verdict: 'unverified' as const };
    const worse = measured({ step: [robeStep(5.1, 0), unread] });
    const better = measured({ step: [{ ...robeStep(4, 0), verdict: 'within' }, unread] });
    expect(missedBars(worse)).toEqual(['step']);
    expect(missedBars(better)).toEqual(['step']);
    expect(rankOrder(worse, better)).toBe(1);
  });

  test('of two answers whose misses are the same size, the one that misses one bar more ranks below', () => {
    const step = measured({ step: [robeStep(7.5, 0)] });
    const both = measured({
      step: [robeStep(7.5, 0)],
      grain: [
        {
          part: 'robe',
          painted: { robust: 0.56, plain: 1, n: 200 },
          kept: { robust: 1.31, plain: 2, n: 200 },
          fine: fineWithin,
          verdict: 'outside',
        },
      ],
    });
    expect(missedBars(both)).toEqual(['grain', 'step']);
    expect(rankOrder(both, step)).toBe(1);
  });

  test("a miss 1.5 of its bar's allowances past weighs as a step miss 1.5 allowances past, on every bar", () => {
    const grain = measured({}).grain[0];
    const misses: ReadonlyArray<readonly [string, HiddenMeasures]> = [
      ['seam', measured({ seam: { deltaE: Option.some(25), pairs: 80 } })],
      ['drift', measured({ drift: { deltaE: 12.5, px: 900, chroma: [] } })],
      ['drift', measured({ drift: { deltaE: 3, px: 900, chroma: [robeChroma(10, 17.5)] } })],
      [
        'grain',
        measured({
          grain: [{ ...grain!, painted: { robust: 2.85, plain: 3, n: 200 }, verdict: 'outside' }],
        }),
      ],
      [
        'grain',
        measured({
          grain: [
            {
              ...grain!,
              fine: { ...fineWithin, painted: { share: 0.085, px: 300 } },
              verdict: 'outside',
            },
          ],
        }),
      ],
      [
        'speck',
        measured({
          speck: [
            {
              part: 'robe',
              under: 'armRight',
              painted: { share: 0.1, px: 300 },
              kept: { share: 0, px: 900 },
              verdict: 'outside',
            },
          ],
        }),
      ],
    ];
    const steps = [0.5, 1.4, 1.6].map((k) => measured({ step: [robeStep(5 + 5 * k, 0)] }));
    for (const [bar, miss] of misses) {
      expect(missedBars(miss)).toEqual([bar]);
      expect(steps.map((step) => rankOrder(miss, step))).toEqual([1, 1, -1]);
    }
  });
});
