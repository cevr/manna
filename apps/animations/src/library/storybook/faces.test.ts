import { rng } from '@manna/film/core';
import type { Raster } from '@manna/film/tools';
import { Option, Result } from 'effect';
import { describe, expect, test } from 'effect-bun-test';
import {
  alphaAt,
  blinkOf,
  hexOf,
  inkedFaceMarks,
  paintsOf,
  rgbAt,
  type Rgb,
  withHeadOf,
} from './sheet.ts';
import {
  ANATOMY,
  ANATOMY_HAIR,
  anatomyFigure,
  art,
  DRESSED,
  FIGURE_KEY,
  HAIR,
  INK,
  MARKED,
  ROBE,
  SANDAL,
  SASH,
  SKIN,
} from './testing.ts';

/** A box of a drawn face mark, inclusive, in its picture's px. */
interface MarkBox {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

/**
 * A generated head and shoulders `FACE_W` px wide: an ink crown, a face of
 * skin ringed in ink, a pair of brows, a pair of eyes (open ovals, or closed
 * bars two rows deep), a mouth, a robe below. The face sits `dx`, `dy` off
 * its place; `lower` paints each open eye's lower half (critique 2, item 2);
 * `cheek` adds a robe patch on the face with no ink in it. Its `look` sets
 * the eyes `near` the face's sides (a skin pixel between each eye and the
 * ring), a `hood` of robe right beside the face, and the `reach` of a
 * closed eye's half width. Answers the picture, its face's inside and each
 * eye's pixels.
 */
const FACE_W = 90;
interface FaceBox {
  readonly fx: number;
  readonly fy: number;
  readonly fw: number;
  readonly fh: number;
  readonly height: number;
  readonly hood: boolean;
}
/** How a generated face is drawn past its marks: its eyes near its sides or in their places, a hood beside it or none, and the half width a closed eye reaches. */
interface Look {
  readonly near: boolean;
  readonly hood: boolean;
  readonly reach: number;
}
const PLAIN: Look = { near: false, hood: false, reach: 5 };
/** The paint of the figure's body at a pixel, before any mark: ink hair above, the ringed skin face, a robe hood beside it when it wears one, the ringed robe below; none off the figure. */
const bodyPaintAt = (b: FaceBox, x: number, y: number): Option.Option<Rgb> => {
  if (x < 4 || x >= FACE_W - 4) return Option.none();
  if (y < b.fy) return Option.liftPredicate(INK, () => x >= b.fx && x < b.fx + b.fw);
  if (y < b.fy + b.fh) {
    const edge = x === b.fx || x === b.fx + b.fw - 1 || y === b.fy || y === b.fy + b.fh - 1;
    const onFace = x >= b.fx && x < b.fx + b.fw;
    if (!onFace) return Option.liftPredicate(ROBE, () => b.hood);
    return Option.some([SKIN, INK][Number(edge)] ?? SKIN);
  }
  const edge = x === 4 || x === FACE_W - 5 || y === b.fy + b.fh || y === b.height - 1;
  return Option.some([ROBE, INK][Number(edge)] ?? ROBE);
};
const faceFigure = (
  draw: () => number,
  o: {
    readonly closed: boolean;
    readonly dx: number;
    readonly dy: number;
    readonly lower: Rgb;
    readonly cheek: boolean;
  },
  look: Look = PLAIN,
) => {
  const int = (a: number, b: number) => a + Math.floor(draw() * (b - a + 1));
  const [fx, fy, fw, fh] = [20 + o.dx, 4 + o.dy, int(44, 56), int(44, 56)];
  const height = fh + 60;
  const rgba = new Uint8Array(FACE_W * height * 4);
  const put = (x: number, y: number, c: Rgb) => rgba.set([...c, 255], (y * FACE_W + x) * 4);
  const inside = new Set<number>();
  const body = { fx, fy, fw, fh, height, hood: look.hood };
  for (let y = 0; y < height; y++)
    for (let x = 0; x < FACE_W; x++)
      Option.map(bodyPaintAt(body, x, y), (c) => {
        put(x, y, c);
        if (c === SKIN) inside.add(y * FACE_W + x);
      });
  const mark = (b: MarkBox, paint: (x: number, y: number) => Rgb): ReadonlyArray<number> => {
    const px: Array<number> = [];
    for (let y = b.y0; y <= b.y1; y++)
      for (let x = b.x0; x <= b.x1; x++) {
        put(x, y, paint(x, y));
        px.push(y * FACE_W + x);
      }
    return px;
  };
  const centres = (): readonly [number, number] => {
    if (look.near) return [fx + 5 + int(0, 2), fx + fw - 6 - int(0, 2)];
    return [fx + Math.floor(fw * 0.3) + int(-1, 1), fx + Math.floor(fw * 0.7) + int(-1, 1)];
  };
  const [cl, cr] = centres();
  for (const c of [cl, cr]) {
    const w = int(3, 4);
    mark(
      { x0: Math.max(c - w, fx + 2), y0: fy + 6, x1: Math.min(c + w, fx + fw - 3), y1: fy + 7 },
      () => INK,
    );
  }
  const eyes = [cl, cr].map((c) => {
    if (o.closed) {
      const w = int(3, look.reach);
      const mid = fx + (fw >> 1);
      const left = c < mid;
      const lo = [mid + 1, fx + 2][Number(left)] ?? fx + 2;
      const hi = [fx + fw - 3, mid - 1][Number(left)] ?? mid - 1;
      const b = { x0: Math.max(c - w, lo), y0: fy + 15, x1: Math.min(c + w, hi), y1: fy + 16 };
      return { box: b, px: mark(b, () => INK) };
    }
    const [w, h] = [int(1, 3), int(3, 5)];
    const b = { x0: c - w, y0: fy + 16 - h, x1: c + w, y1: fy + 16 + h };
    return { box: b, px: mark(b, (_, y) => [INK, o.lower][Number(y > fy + 16)] ?? INK) };
  });
  const m = int(4, 7);
  mark(
    { x0: fx + (fw >> 1) - m, y0: fy + fh - 12, x1: fx + (fw >> 1) + m, y1: fy + fh - 11 },
    () => INK,
  );
  const cheek = mark(
    { x0: fx + 3, y0: fy + 24, x1: fx + 5, y1: fy + 26 },
    () => [SKIN, ROBE][Number(o.cheek)] ?? SKIN,
  );
  return { raster: { width: FACE_W, height, rgba }, inside, eyes, cheek };
};

describe('inkedFaceMarks (critique 2, item 2)', () => {
  const paints = paintsOf(DRESSED);

  test('over generated faces: every mark the face rings that holds ink is drawn all in ink, a mark with no ink and everything off the face stay', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const draw = rng(seed);
      const lower = [ROBE, SANDAL, SASH, INK][Math.floor(draw() * 4)] ?? ROBE;
      const f = faceFigure(draw, { closed: false, dx: 0, dy: 0, lower, cheek: true });
      const want = new Uint8Array(f.raster.rgba);
      for (const eye of f.eyes) for (const q of eye.px) want.set(INK, q * 4);
      const got = inkedFaceMarks(f.raster, paints);
      expect([seed, [...got.rgba].join() === [...want].join()]).toEqual([seed, true]);
    }
  });

  test('leaves a picture with no face as it is', () => {
    const r = art(['kkk', 'krk', 'kkk'], FIGURE_KEY);
    expect([...inkedFaceMarks(r, paints).rgba]).toEqual([...r.rgba]);
  });
});

describe('blinkOf (critique 2, items 3 and 4)', () => {
  const paints = paintsOf(DRESSED);

  test('over generated faces and blink drawings set off from them, eyes in place or near the face sides, a hood beside the face or none, closed eyes up to 19 px wide: each open eye painted out in the face skin and the drawing nearest closed eye stamped centred on it on the face only, every other pixel the open cell', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const draw = rng(seed);
      const look = { near: draw() < 0.5, hood: draw() < 0.5, reach: 5 + Math.floor(draw() * 5) };
      const open = faceFigure(
        draw,
        { closed: false, dx: 0, dy: 0, lower: INK, cheek: false },
        { ...look, reach: 5 },
      );
      const shut = faceFigure(
        rng(seed + 1000),
        {
          closed: true,
          dx: Math.floor(draw() * 9) - 4,
          dy: Math.floor(draw() * 5) - 2,
          lower: INK,
          cheek: false,
        },
        { ...look, near: false },
      );
      const want = new Uint8Array(open.raster.rgba);
      for (const [i, eye] of open.eyes.entries()) {
        for (const q of eye.px) want.set(SKIN, q * 4);
        const stamp = shut.eyes[i] ?? eye;
        const ox = Math.round((eye.box.x0 + eye.box.x1) / 2 - (stamp.box.x0 + stamp.box.x1) / 2);
        const oy = Math.round((eye.box.y0 + eye.box.y1) / 2 - (stamp.box.y0 + stamp.box.y1) / 2);
        for (const q of stamp.px) {
          const at = q + oy * FACE_W + ox;
          if (open.inside.has(at)) want.set(INK, at * 4);
        }
      }
      const got = Result.map(blinkOf(open.raster, shut.raster, paints), (r) => [...r.rgba].join());
      expect([seed, got]).toEqual([seed, Result.succeed([...want].join())]);
    }
  });

  test('stamps a closed eye 17 px wide over an open eye 3 px wide beside a hood on the face only, the hood and the ring as they were (round 3, T1)', () => {
    const ink: Rgb = [20, 10, 5];
    const skin: Rgb = [240, 180, 130];
    const robe: Rgb = [110, 130, 125];
    const own = paintsOf({
      ink: hexOf(ink),
      parts: [
        { name: 'skin', role: 'skin', base: hexOf(skin) },
        { name: 'robe', role: 'garment', base: hexOf(robe) },
      ],
    });
    const face = (closed: boolean): Raster => {
      const at = (x: number, y: number): Option.Option<Rgb> => {
        const inRows = (a: number, b: number) => y >= a && y <= b;
        const inCols = (a: number, b: number) => x >= a && x <= b;
        if (y < 10) return Option.liftPredicate(ink, () => inCols(20, 79));
        if (y >= 70) return Option.liftPredicate(robe, () => inCols(5, 94));
        if (!inCols(20, 79)) return Option.liftPredicate(robe, () => inCols(10, 89));
        const marks = [
          x === 20 || x === 79 || y === 10 || y === 69,
          inRows(20, 21) && (inCols(23, 31) || inCols(61, 69)),
          closed && inRows(35, 36) && (inCols(28, 44) || inCols(55, 71)),
          !closed && inRows(32, 39) && (inCols(22, 24) || inCols(63, 65)),
          inRows(55, 56) && inCols(43, 56),
        ];
        return Option.some([skin, ink][Number(marks.some(Boolean))] ?? ink);
      };
      const rgba = new Uint8Array(100 * 120 * 4);
      for (let y = 0; y < 120; y++)
        for (let x = 0; x < 100; x++)
          Option.map(at(x, y), (c) => rgba.set([...c, 255], (y * 100 + x) * 4));
      return { width: 100, height: 120, rgba };
    };
    const opened = face(false);
    const built = Result.getOrThrow(blinkOf(opened, face(true), own));
    const changedOffFace: Array<readonly [number, number]> = [];
    for (let q = 0; q < 100 * 120; q++) {
      const [x, y] = [q % 100, Math.floor(q / 100)];
      const offFace = x <= 20 || x >= 79 || y <= 10 || y >= 69;
      if (offFace && hexOf(rgbAt(opened, q)) !== hexOf(rgbAt(built, q)))
        changedOffFace.push([x, y]);
    }
    expect(changedOffFace).toEqual([]);
  });

  test('refuses an open cell or a blink drawing whose face holds no row of eyes between its brows and its mouth', () => {
    const open = faceFigure(rng(7), { closed: false, dx: 0, dy: 0, lower: INK, cheek: false });
    const bare = art(['kkk', 'ksk', 'kkk'], FIGURE_KEY);
    expect(Result.isFailure(blinkOf(bare, open.raster, paints))).toBe(true);
    expect(Result.isFailure(blinkOf(open.raster, bare, paints))).toBe(true);
  });
});

/** A generated face's width, ring to ring, read from its inside: the face set `dx` off its place. */
const faceWidthOf = (f: { readonly inside: ReadonlySet<number> }, dx: number): number =>
  Math.max(...[...f.inside].map((q) => q % FACE_W)) - (20 + dx) + 2;

/** How a head figure for `withHeadOf` is drawn: its crown row, the rows of hair above its face's ink ring, the ring's left column, the face's skin width and height inside the ring, the hair's reach left and right of the ring, and how far its locks hang down beside the face. */
interface HeadDrawing {
  readonly crown: number;
  readonly hair: number;
  readonly fx: number;
  readonly fw: number;
  readonly fh: number;
  readonly left: number;
  readonly right: number;
  readonly lock: number;
}

const HEADED_W = 140;
const HEADED_H = 124;

/**
 * A figure drawn as `d` says, `HEADED_W` by `HEADED_H`: a block of hair
 * from the crown down to the face's ink ring and locks beside the face,
 * the face in skin inside the ring, a neck in skin between ink sides, and
 * the robe ringed in ink to the bottom. `arm` raises a sleeve from the
 * robe beside the head, a hand ringed in ink at its end, its left column
 * at the given x, from the ring's top row down. Answers the picture, its
 * chin (the face's last skin row), its hair's rightmost column, and the
 * arm's pixels.
 */
const headedFigure = (d: HeadDrawing, arm: Option.Option<number>) => {
  const [width, height] = [HEADED_W, HEADED_H];
  const rgba = new Uint8Array(width * height * 4);
  const ring = d.crown + d.hair;
  const chin = ring + d.fh;
  const robeTop = chin + 5;
  const right = d.fx + d.fw + 1 + d.right;
  const rect = (
    x0: number,
    x1: number,
    y0: number,
    y1: number,
    c: (x: number, y: number) => Rgb,
  ) => {
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) rgba.set([...c(x, y), 255], (y * width + x) * 4);
  };
  const ringed = (x0: number, x1: number, y0: number, y1: number, paint: Rgb) =>
    rect(
      x0,
      x1,
      y0,
      y1,
      (x, y) => [paint, INK][Number(x === x0 || x === x1 || y === y0 || y === y1)] ?? INK,
    );
  ringed(20, width - 21, robeTop, height - 1, ROBE);
  const neck = d.fx + 1 + (d.fw >> 1);
  rect(
    neck - 4,
    neck + 4,
    chin + 2,
    chin + 4,
    (x) => [SKIN, INK][Number(Math.abs(x - neck) === 4)] ?? INK,
  );
  rect(d.fx - d.left, right, d.crown, ring - 1, () => HAIR);
  rect(d.fx - d.left, d.fx - 1, ring, ring + d.lock, () => HAIR);
  rect(d.fx + d.fw + 2, right, ring, ring + d.lock, () => HAIR);
  ringed(d.fx, d.fx + d.fw + 1, ring, chin + 1, SKIN);
  const armed = new Set<number>();
  Option.map(arm, (x0) => {
    ringed(x0, x0 + 8, ring, ring + 8, SKIN);
    rect(
      x0,
      x0 + 8,
      ring + 9,
      robeTop - 1,
      (x) => [ROBE, INK][Number(x === x0 || x === x0 + 8)] ?? INK,
    );
    for (let y = ring; y < robeTop; y++)
      for (let x = x0; x <= x0 + 8; x++) armed.add(y * width + x);
  });
  return { raster: { width, height, rgba }, chin, right, armed };
};

/**
 * One generated case of a worn head (round 4, M2; critique 4, A and B):
 * a body and a head cell drawn apart, the head's crown up to 2 rows above
 * or 3 below the body's, its hair a row taller or shorter above its face,
 * its face a pixel wider, narrower or shorter, its hair reaching further
 * or less far either side and its locks hanging longer or shorter, set off
 * by up to 4 px; the body's face no lower than the head's lands. Half the
 * bodies raise a sleeve and hand beside the head, touching its hair where
 * the body's hair reaches furthest. Answers the body, the head and what
 * `withHeadOf` should give: refused when the crowns and the face middles
 * disagree by more than a pixel, or when the body's own hair is left
 * against the raised hand; else every pixel clear but the body below its
 * chin and its arm, with the head's pixels from its crown to the lower of
 * the two chins laid over them, set on the body's crown row and its face's
 * middle column.
 */
const wornCase = (seed: number) => {
  const draw = rng(seed + 500);
  const int = (a: number, b: number) => a + Math.floor(draw() * (b - a + 1));
  const b: HeadDrawing = {
    crown: int(2, 5),
    hair: int(14, 18),
    fx: int(40, 46),
    fw: int(30, 40),
    fh: int(30, 40),
    left: int(2, 8),
    right: int(2, 8),
    lock: int(4, 14),
  };
  const hair = b.hair + int(-1, 1);
  const tall = b.fh + int(-1, 1);
  const h: HeadDrawing = {
    crown: b.crown + int(-2, 3),
    hair,
    fx: b.fx + int(-4, 4),
    fw: b.fw + int(-1, 1),
    fh: Math.min(tall, b.hair + b.fh - hair),
    left: int(2, 8),
    right: int(2, 8),
    lock: int(4, 14),
  };
  const ox = Math.round(b.fx + (b.fw - 1) / 2 - h.fx - (h.fw - 1) / 2);
  const oy = b.crown - h.crown;
  const tilt = b.crown + b.hair + (b.fh - 1) / 2 - (h.crown + h.hair + (h.fh - 1) / 2) - oy;
  const head = headedFigure(h, Option.none());
  const oldRight = b.fx + b.fw + 1 + b.right;
  const wornRight = head.right + ox;
  const armAt = Option.liftPredicate(Math.max(oldRight, wornRight) + 1, () => draw() < 0.5);
  const body = headedFigure(b, armAt);
  const leftAgainstArm =
    Option.isSome(armAt) &&
    (oldRight > wornRight || (oldRight === wornRight && b.hair + b.lock > h.hair + h.lock));
  const refused = Math.abs(tilt) > 1 || leftAgainstArm;
  const want = new Uint8Array(body.raster.rgba.length);
  for (let q = 0; q < HEADED_W * HEADED_H; q++)
    if (Math.floor(q / HEADED_W) > body.chin || body.armed.has(q))
      want.set(body.raster.rgba.subarray(q * 4, q * 4 + 4), q * 4);
  const to = Math.max(head.chin, body.chin - oy);
  for (let y = h.crown; y <= to; y++)
    for (let x = 0; x < HEADED_W; x++) {
      const q = y * HEADED_W + x;
      if ((head.raster.rgba[q * 4 + 3] ?? 0) === 0) continue;
      want.set(head.raster.rgba.subarray(q * 4, q * 4 + 4), ((y + oy) * HEADED_W + x + ox) * 4);
    }
  return {
    body: body.raster,
    head: head.raster,
    want: Option.liftPredicate(want, () => !refused),
    armed: Option.isSome(armAt),
  };
};

describe('withHeadOf (critique 3, items 2 and 6)', () => {
  const paints = paintsOf(DRESSED);

  test("over generated heads, their hair reaching further or less far than the body's, their faces a pixel apart in size, start or middle, the body raising a sleeve and hand against its hair or not: the worn head lands on the body's crown row and face middle down to the lower chin, none of the body's own head is left over either head, the body below the chin and its arm are kept, and a paste whose parts cannot be told is refused (round 4, M2; critique 4, A and B)", () => {
    const marked = paintsOf(MARKED);
    const kinds: Array<readonly [boolean, boolean]> = [];
    for (let seed = 1; seed <= 40; seed++) {
      const { body, head, want, armed } = wornCase(seed);
      const got = Result.match(withHeadOf(body, head, marked), {
        onFailure: () => Option.none(),
        onSuccess: (r) => Option.some([...r.rgba].join()),
      });
      expect([seed, got]).toEqual([seed, Option.map(want, (w) => [...w].join())]);
      kinds.push([armed, Option.isSome(want)]);
    }
    const [kept, refused] = [
      kinds.filter(([armed, worn]) => armed && worn).length,
      kinds.filter(([, worn]) => !worn).length,
    ];
    expect([kept, refused, kept >= 5, refused >= 3, refused <= 20]).toEqual([
      kept,
      refused,
      true,
      true,
      true,
    ]);
  });

  test("clears the body's wider hair beyond a narrower worn head of the same face, none of it left (round 4, M2: 1,224 px of old hair kept)", () => {
    const own = paintsOf(ANATOMY);
    const hair = (x0: number, x1: number) => (x: number, y: number) =>
      Option.liftPredicate(ANATOMY_HAIR, () => y < 36 && x >= x0 && x <= x1);
    const wide = anatomyFigure(() => Option.none());
    for (let y = 0; y < 36; y++)
      for (let x = 10; x <= 70; x++)
        wide.rgba.set([...ANATOMY_HAIR, 255], (y * wide.width + x) * 4);
    const narrow = anatomyFigure(hair(27, 53));
    for (let y = 0; y < 36; y++)
      for (const x of [20, 21, 22, 23, 24, 25, 26, 54, 55, 56, 57, 58, 59, 60])
        narrow.rgba.fill(0, (y * narrow.width + x) * 4, (y * narrow.width + x) * 4 + 4);
    const worn = Result.getOrThrow(withHeadOf(wide, narrow, own));
    let old = 0;
    for (let q = 0; q < wide.width * wide.height; q++)
      if (alphaAt(narrow, q) === 0 && alphaAt(worn, q) > 0) old += 1;
    expect([old, [...worn.rgba].join() === [...narrow.rgba].join()]).toEqual([0, true]);
  });

  test("refuses a head whose hair stands a row and more taller or shorter over its face than the body's, so the crowns and the face middles disagree by more than a pixel (critique 4, A and B)", () => {
    const base: HeadDrawing = {
      crown: 4,
      hair: 16,
      fx: 44,
      fw: 34,
      fh: 34,
      left: 4,
      right: 4,
      lock: 6,
    };
    const of = (d: HeadDrawing) => headedFigure(d, Option.none()).raster;
    const marked = paintsOf(MARKED);
    const reads = [-2, -1, 0, 1, 2].map((dh) =>
      Result.isSuccess(withHeadOf(of(base), of({ ...base, hair: base.hair + dh }), marked)),
    );
    expect(reads).toEqual([false, true, true, true, false]);
  });

  test("refuses a head whose locks end above the body's own, which hang past the chin: the body's hair left over the head runs on down into the hair below, so its part cannot be told; locks as long are worn (round 4, M2)", () => {
    const base: HeadDrawing = {
      crown: 4,
      hair: 16,
      fx: 44,
      fw: 34,
      fh: 34,
      left: 4,
      right: 4,
      lock: 40,
    };
    const of = (d: HeadDrawing) => headedFigure(d, Option.none()).raster;
    const marked = paintsOf(MARKED);
    expect(
      [40, 20].map((lock) => Result.isSuccess(withHeadOf(of(base), of({ ...base, lock }), marked))),
    ).toEqual([true, false]);
  });

  test("refuses a head whose face is wider or taller by more than a pixel than the body's, a head turned or tilted, and a cell that reads no face", () => {
    const plain = { closed: false, dx: 0, dy: 0, lower: INK, cheek: false };
    const faces = Array.from({ length: 20 }, (_, k) => faceFigure(rng(k + 1), plain));
    const narrow = faces[0] ?? faceFigure(rng(1), plain);
    const sizeOf = (f: typeof narrow) => [faceWidthOf(f, 0), f.raster.height - 60] as const;
    const [w0, h0] = sizeOf(narrow);
    const wider = faces.filter((f) => Math.abs(sizeOf(f)[0] - w0) > 1 && sizeOf(f)[1] === h0);
    const taller = faces.filter((f) => sizeOf(f)[0] === w0 && Math.abs(sizeOf(f)[1] - h0) > 1);
    const near = faces.filter(
      (f) => Math.abs(sizeOf(f)[0] - w0) <= 1 && Math.abs(sizeOf(f)[1] - h0) <= 1,
    );
    const bare = art(['kkk', 'krk', 'kkk'], FIGURE_KEY);
    expect([wider.length > 0, taller.length > 0 || near.length > 0]).toEqual([true, true]);
    for (const f of [...wider, ...taller])
      expect(Result.isFailure(withHeadOf(narrow.raster, f.raster, paints))).toBe(true);
    for (const f of near)
      expect(Result.isSuccess(withHeadOf(narrow.raster, f.raster, paints))).toBe(true);
    expect(Result.isFailure(withHeadOf(bare, narrow.raster, paints))).toBe(true);
    expect(Result.isFailure(withHeadOf(narrow.raster, bare, paints))).toBe(true);
  });
});

/** The paints of a `markedFace`: its ink, skin and robe. */
const MARKED_PAINTS = paintsOf({
  ink: '#140a05',
  parts: [
    { name: 'skin', role: 'skin', base: '#f0b482' },
    { name: 'robe', role: 'garment', base: '#6e827d' },
  ],
});

/** Which marks a `markedFace` draws: brows, its eyes as `open` ovals (3 × 8), `arcs` (13 × 3) or `shut` lids (17 × 2), and a mouth. */
interface FaceMarks {
  readonly brows: boolean;
  readonly eyes: 'open' | 'arcs' | 'shut';
  readonly mouth: boolean;
}

/** A 100 × 120 face: an ink ring with skin inside, a robe under it, and `marks` in ink on the skin. */
const markedFace = (marks: FaceMarks): Raster => {
  const [ink, skin, robe] = MARKED_PAINTS.map((p) => p.rgb);
  const rgba = new Uint8Array(100 * 120 * 4);
  const rows = (y: number, a: number, b: number) => y >= a && y <= b;
  const cols = (x: number, spans: ReadonlyArray<readonly [number, number]>) =>
    spans.some(([a, b]) => x >= a && x <= b);
  const eyes = {
    open: (x: number, y: number) =>
      rows(y, 32, 39) &&
      cols(x, [
        [28, 30],
        [69, 71],
      ]),
    arcs: (x: number, y: number) =>
      rows(y, 33, 35) &&
      cols(x, [
        [23, 35],
        [64, 76],
      ]),
    shut: (x: number, y: number) =>
      rows(y, 35, 36) &&
      cols(x, [
        [22, 38],
        [61, 77],
      ]),
  }[marks.eyes];
  const inked = (x: number, y: number) =>
    [
      y < 10 && x >= 20 && x <= 79,
      rows(y, 10, 69) && (x === 20 || x === 79 || y === 10 || y === 69),
      marks.brows &&
        rows(y, 20, 21) &&
        cols(x, [
          [24, 34],
          [65, 75],
        ]),
      y > 10 && y < 69 && eyes(x, y),
      marks.mouth && rows(y, 55, 56) && cols(x, [[43, 56]]),
    ].some(Boolean);
  const paintAt = (x: number, y: number): Option.Option<Rgb> => {
    const layers: ReadonlyArray<readonly [boolean, Rgb]> = [
      [inked(x, y), ink ?? INK],
      [y > 10 && y < 69 && x > 20 && x < 79, skin ?? SKIN],
      [y >= 70 && x >= 5 && x <= 94, robe ?? ROBE],
    ];
    return Option.map(Option.fromUndefinedOr(layers.find(([on]) => on)), ([, c]) => c);
  };
  for (let y = 0; y < 120; y++)
    for (let x = 0; x < 100; x++)
      Option.map(paintAt(x, y), (c) => rgba.set([...c, 255], (y * 100 + x) * 4));
  return { width: 100, height: 120, rgba };
};

describe('blinkOf on faces of every row count (critique 1, items 13 and 14)', () => {
  const shut = markedFace({ brows: true, eyes: 'shut', mouth: true });
  const blinks = (open: FaceMarks) =>
    Result.isSuccess(blinkOf(markedFace(open), shut, MARKED_PAINTS));

  test('refuses an open cell whose eyes are arcs, a smile’s ∩ with nothing open to close, and blinks the same face with its eyes open', () => {
    expect([
      blinks({ brows: true, eyes: 'arcs', mouth: true }),
      blinks({ brows: true, eyes: 'open', mouth: true }),
    ]).toEqual([false, true]);
  });

  test('reads the eyes of a bearded face, whose mouth no face skin rings: brows over open eyes, or open eyes alone; and none of open eyes over a mouth with no brows', () => {
    expect([
      blinks({ brows: true, eyes: 'open', mouth: false }),
      blinks({ brows: false, eyes: 'open', mouth: false }),
      blinks({ brows: false, eyes: 'open', mouth: true }),
    ]).toEqual([true, true, false]);
    expect(
      Result.isSuccess(
        blinkOf(
          markedFace({ brows: true, eyes: 'open', mouth: false }),
          markedFace({ brows: true, eyes: 'shut', mouth: false }),
          MARKED_PAINTS,
        ),
      ),
    ).toBe(true);
  });
});
