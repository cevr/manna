import { rng } from '@manna/film/core';
import type { Raster } from '@manna/film/tools';
import { Option, Result } from 'effect';
import { describe, expect, test } from 'effect-bun-test';
import {
  alphaAt,
  blinkOf,
  cellsOf,
  clearBackground,
  deltaE,
  drawnNearestOf,
  figuresIn,
  groundOf,
  hexOf,
  inkedFaceMarks,
  largestPiece,
  linesOf,
  mendPockets,
  type Palette,
  paintsOf,
  rgbAt,
  rgbOfHex,
  type Rgb,
  sheetHeadOf,
  SKIN_REACH,
  SPECK_PX,
  snapped,
  splitSheet,
  tidied,
  withHeadOf,
} from './sheet.ts';

const INK: Rgb = [30, 20, 15];
const BASE: Rgb = [200, 80, 60];
const SHADE: Rgb = [90, 120, 200];
const GROUND: Rgb = [240, 236, 220];
const FOREIGN: Rgb = [0, 200, 0];

const PALETTE: Palette = {
  ink: hexOf(INK),
  parts: [{ name: 'cloth', base: hexOf(BASE), shade: hexOf(SHADE), role: 'garment' }],
};

const PAINTS = paintsOf(PALETTE);

/** A picture drawn by rows of letters: `.` clear, every other letter the colour `key` gives it, opaque. */
const art = (rows: ReadonlyArray<string>, key: Readonly<Record<string, Rgb>>): Raster => {
  const width = rows[0]?.length ?? 0;
  const rgba = new Uint8Array(width * rows.length * 4);
  rows.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      if (ch === '.') return;
      rgba.set([...(key[ch] ?? FOREIGN), 255], (y * width + x) * 4);
    }),
  );
  return { width, height: rows.length, rgba };
};

const KEY = { k: INK, b: BASE, s: SHADE, g: GROUND, f: FOREIGN };

/** `r` with its pockets mended on the ground, each rim colour read as the paint the picture draws it as. */
const mend = (r: Raster): Raster => mendPockets(r, GROUND, PAINTS, drawnNearestOf(r, PAINTS));

/** Each pixel as a letter: `.` clear, else the letter of the key colour it is exactly, `?` for none. */
const lettersOf = (r: Raster, key: Readonly<Record<string, Rgb>> = KEY): ReadonlyArray<string> =>
  Array.from({ length: r.height }, (_, y) =>
    Array.from({ length: r.width }, (_, x) => {
      const q = y * r.width + x;
      if (alphaAt(r, q) === 0) return '.';
      const c = hexOf(rgbAt(r, q));
      return Object.entries(key).find(([, v]) => hexOf(v) === c)?.[0] ?? '?';
    }).join(''),
  );

describe('mendPockets', () => {
  test('refills a pale pocket with the paint of its rim: a garment painted the paper', () => {
    const r = art(['kkkkkk', 'kbbbbk', 'kbggbk', 'kbgbbk', 'kbbbbk', 'kkkkkk'], KEY);
    expect(lettersOf(mend(r))).toEqual([
      'kkkkkk',
      'kbbbbk',
      'kbbbbk',
      'kbbbbk',
      'kbbbbk',
      'kkkkkk',
    ]);
  });

  test('clears a pocket ringed all in ink: a true gap', () => {
    const r = art(['kkkkk', 'kgggk', 'kgggk', 'kkkkk'], KEY);
    expect(lettersOf(mend(r))).toEqual(['kkkkk', 'k...k', 'k...k', 'kkkkk']);
  });

  test('reads ground drawn a little lighter inside a ring of ink as a gap: within ΔE 12 of the ground, past its channel sum (round 2: the ground between the raised arm and the head)', () => {
    const halo: Rgb = [GROUND[0] + 10, GROUND[1] + 14, GROUND[2] + 16];
    expect(deltaE(halo, GROUND)).toBeLessThanOrEqual(12);
    const r = art(['kkkkk', 'khhhk', 'khghk', 'kkkkk'], { ...KEY, h: halo });
    expect(lettersOf(mend(r))).toEqual(['kkkkk', 'k...k', 'k...k', 'kkkkk']);
  });

  test("clears a gap whose ring holds a blend of ink and paint, a vote only a plain paint casts (round 2: an outline's soft edge on the ring)", () => {
    const blend = atDistance(20);
    const r = art(['kkkkkk', 'kggggk', 'kggggm', 'kkkkkk'], { ...KEY, m: blend });
    expect(lettersOf(mend(r))).toEqual(['kkkkkk', 'k....k', 'k....?', 'kkkkkk']);
  });

  test('refills by the most of its rim, the ink not counted, however large or high the pocket', () => {
    const r = art(['kkkkkkk', 'kgggggs', 'kgggggs', 'kbbbbbk'], KEY);
    expect(lettersOf(mend(r))).toEqual(['kkkkkkk', 'kbbbbbs', 'kbbbbbs', 'kbbbbbk']);
  });

  test('counts each rim pixel once, however many pocket pixels it touches: a concave pocket (round 1, case 54)', () => {
    const r = art(
      [
        'kkkkkkkkk',
        'kkkkkkkkk',
        'kkkkskskk',
        'kksbgbgbk',
        'kbgggggsk',
        'kksbsgbkk',
        'kkkkkskkk',
        'kkkkkkkkk',
        'kkkkkkkkk',
      ],
      KEY,
    );
    expect(lettersOf(mend(r))).toEqual([
      'kkkkkkkkk',
      'kkkkkkkkk',
      'kkkkskskk',
      'kksbsbsbk',
      'kbssssssk',
      'kksbssbkk',
      'kkkkkskkk',
      'kkkkkkkkk',
      'kkkkkkkkk',
    ]);
  });
});

/** A pocket grown at random from the middle of a 13 × 13 inked picture: its pixels, each a 4-neighbour of one before it, and its rim painted at random base, shade or ink. */
const pocketCase = (seed: number) => {
  const draw = rng(seed);
  const size = 13;
  const pocket = new Set([6 * size + 6]);
  const grow = 1 + Math.floor(draw() * 24);
  for (let k = 0; k < grow * 8 && pocket.size < grow; k++) {
    const from = [...pocket][Math.floor(draw() * pocket.size)] ?? 0;
    const step = [1, -1, size, -size][Math.floor(draw() * 4)] ?? 1;
    const x = (from + step) % size;
    const y = Math.floor((from + step) / size);
    if (x >= 2 && x <= 10 && y >= 2 && y <= 10) pocket.add(from + step);
  }
  const paints: ReadonlyArray<Rgb> = [BASE, SHADE, INK];
  const rgba = new Uint8Array(size * size * 4);
  for (let q = 0; q < size * size; q++) rgba.set([...INK, 255], q * 4);
  for (const q of pocket) {
    rgba.set([...GROUND, 255], q * 4);
    for (const m of [q - 1, q + 1, q - size, q + size])
      if (!pocket.has(m)) rgba.set([...(paints[Math.floor(draw() * 3)] ?? INK), 255], m * 4);
  }
  return { picture: { width: size, height: size, rgba }, pocket };
};

/** The paint a rim of `base` base pixels and `shade` shade pixels fills with: the more, the base on a tie (it comes first in the palette). */
const winner = (base: number, shade: number): Rgb => {
  if (shade > base) return SHADE;
  return BASE;
};

describe('mendPockets over generated pockets', () => {
  test('fills each pocket with the paint most of its distinct non-ink rim pixels are, or clears it when its rim is all ink', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const { picture, pocket } = pocketCase(seed);
      const size = picture.width;
      const rim = new Set(
        [...pocket].flatMap((q) =>
          [q - 1, q + 1, q - size, q + size].filter((m) => !pocket.has(m)),
        ),
      );
      const count = (paint: Rgb) =>
        [...rim].filter((m) => hexOf(rgbAt(picture, m)) === hexOf(paint)).length;
      const [base, shade] = [count(BASE), count(SHADE)];
      const mended = mend(picture);
      const want = hexOf(winner(base, shade));
      for (const q of pocket) {
        const got = { alpha: alphaAt(mended, q), hex: hexOf(rgbAt(mended, q)) };
        if (base + shade === 0)
          expect({ seed, q, alpha: got.alpha }).toEqual({ seed, q, alpha: 0 });
        else expect({ seed, q, ...got }).toEqual({ seed, q, alpha: 255, hex: want });
      }
    }
  });
});

describe('largestPiece', () => {
  test('drops a speck apart from the figure and keeps a pixel touching it at a corner', () => {
    const r = art(['b.....', '......', '..bbb.', '..bbb.', '.....b'], KEY);
    expect(lettersOf(largestPiece(r))).toEqual(['......', '......', '..bbb.', '..bbb.', '.....b']);
  });
});

/** The first colour along the red axis from `BASE` lying at least `want` ΔE from it. */
const atDistance = (want: number): Rgb => {
  for (let k = 0; k < 120; k++) {
    const c: Rgb = [BASE[0], BASE[1] + k, BASE[2]];
    if (deltaE(c, BASE) >= want) return c;
  }
  return BASE;
};

/** A channel held to 0..255. */
const clamp = (v: number): number => Math.max(0, Math.min(255, v));

/** A drawing of a generated palette: every paint drawn flat in its hex moved by one cast, with ±1 of noise, in strips of 20 to 300 pixels; one pair of parts as close as the lead's tunic and sash (ΔE 5 to 12), every other paint ΔE 25 or more from the rest. */
const castCase = (seed: number) => {
  const draw = rng(seed);
  const int = (a: number, b: number) => a + Math.floor(draw() * (b - a + 1));
  const bases: Array<Rgb> = [];
  const apart = int(2, 5);
  for (let tries = 0; tries < 2000 && bases.length < apart; tries++) {
    const c: Rgb = [int(40, 230), int(40, 230), int(40, 230)];
    if ([INK, ...bases].every((b) => deltaE(b, c) >= 25)) bases.push(c);
  }
  const first = bases[0] ?? BASE;
  for (let tries = 0; tries < 400; tries++) {
    const c: Rgb = [
      clamp(first[0] + int(-9, 9)),
      clamp(first[1] + int(-9, 9)),
      clamp(first[2] + int(-9, 9)),
    ];
    const near = deltaE(first, c);
    if (near >= 5 && near <= 12 && [INK, ...bases.slice(1)].every((b) => deltaE(b, c) >= 25)) {
      bases.push(c);
      break;
    }
  }
  const palette: Palette = {
    ink: hexOf(INK),
    parts: bases.map((b, i) => ({ name: `p${i}`, base: hexOf(b) })),
  };
  const cast: Rgb = [int(-8, 8), int(-8, 8), int(-8, 8)];
  const truth: Array<string> = [];
  const pixels: Array<Rgb> = [];
  for (const paint of [INK, ...bases])
    for (let k = int(20, 300); k > 0; k--) {
      pixels.push([
        clamp(paint[0] + cast[0] + int(-1, 1)),
        clamp(paint[1] + cast[1] + int(-1, 1)),
        clamp(paint[2] + cast[2] + int(-1, 1)),
      ]);
      truth.push(hexOf(paint));
    }
  const rgba = new Uint8Array(pixels.length * 4);
  pixels.forEach((c, q) => rgba.set([...c, 255], q * 4));
  return { palette, picture: { width: pixels.length, height: 1, rgba }, truth };
};

describe('drawnNearestOf over generated drawings', () => {
  test("snaps every pixel to the paint it was drawn as, though a cast moves a close paint nearer its neighbour's hex", () => {
    for (let seed = 1; seed <= 120; seed++) {
      const { palette, picture, truth } = castCase(seed);
      const paints = paintsOf(palette);
      const out = snapped(picture, paints, drawnNearestOf(picture, paints));
      const wrong = truth.flatMap((want, q) => {
        const got = hexOf(rgbAt(out, q));
        if (got === want) return [];
        return [`${q}: ${got}, drawn as ${want}`];
      });
      expect({ seed, wrong: wrong.slice(0, 3), count: wrong.length }).toEqual({
        seed,
        wrong: [],
        count: 0,
      });
    }
  });
});

describe('snapped', () => {
  test('takes a paint exactly within ΔE 30 and keeps a farther pixel as drawn, every opaque pixel at alpha 255', () => {
    const near = atDistance(29);
    const far = atDistance(31);
    expect(deltaE(near, BASE)).toBeLessThan(30);
    expect(deltaE(far, BASE)).toBeGreaterThan(30);
    const r: Raster = {
      width: 3,
      height: 1,
      rgba: new Uint8Array([...near, 200, ...far, 255, ...INK, 0]),
    };
    expect([...snapped(r, PAINTS, drawnNearestOf(r, PAINTS)).rgba]).toEqual([
      ...BASE,
      255,
      ...far,
      255,
      ...INK,
      0,
    ]);
  });
});

/** The lead's skin, tunic and sash paints, and the two thin lines a drawing drew on his cloth: a fold and the sash's edge. */
const LEAD_KEY = {
  k: rgbOfHex('#130803'),
  a: rgbOfHex('#f2b27c'),
  r: rgbOfHex('#c9877e'),
  t: rgbOfHex('#f2d8b7'),
  v: rgbOfHex('#cbbfd2'),
  s: rgbOfHex('#eadcc2'),
  w: rgbOfHex('#c8bdd6'),
  f: rgbOfHex('#bc9e9a'),
  e: rgbOfHex('#b3a89a'),
};

const LEAD_PALETTE: Palette = {
  ink: '#130803',
  parts: [
    { name: 'skin', base: '#f2b27c', shade: '#c9877e', role: 'skin' },
    { name: 'tunic', base: '#f2d8b7', shade: '#cbbfd2', role: 'garment' },
    { name: 'sash', base: '#eadcc2', shade: '#c8bdd6', role: 'sash' },
  ],
};

/** `drawn` snapped and tidied with `palette`, each colour read as the paint the picture draws it as. */
const tidy = (drawn: Raster, palette: Palette): Raster => {
  const paints = paintsOf(palette);
  const nearest = drawnNearestOf(drawn, paints);
  return tidied(drawn, snapped(drawn, paints, nearest), paints, nearest);
};

/** Each skin-paint pixel of `r` with no skin base within `SKIN_REACH` px (a square round it): the rose on cloth. */
const skinOnCloth = (r: Raster, palette: Palette): ReadonlyArray<number> => {
  const paints = paintsOf(palette);
  const role = (q: number) =>
    paints.find((p) => hexOf(p.rgb) === hexOf(rgbAt(r, q)) && alphaAt(r, q) > 0);
  const base = (q: number) => role(q)?.role === 'skin' && role(q)?.tone === 'base';
  return Array.from({ length: r.width * r.height }, (_, q) => q).filter((q) => {
    if (role(q)?.role !== 'skin') return false;
    const [x, y] = [q % r.width, Math.floor(q / r.width)];
    return !area(x - SKIN_REACH, x + SKIN_REACH + 1, y - SKIN_REACH, y + SKIN_REACH + 1).some(
      ([u, v]) => u >= 0 && v >= 0 && u < r.width && v < r.height && base(v * r.width + u),
    );
  });
};

const SPECK: Rgb = [230, 180, 140];

const SPECK_PALETTE: Palette = {
  ink: hexOf(INK),
  parts: [
    { name: 'a', base: hexOf(BASE) },
    { name: 'b', base: hexOf(SHADE) },
    { name: 'c', base: hexOf(SPECK) },
  ],
};

const SPECK_KEY = { k: INK, b: BASE, s: SHADE, c: SPECK };

/** The side of the speck pictures, square. */
const SPECK_SIDE = 40;

/** A 4-connected blob of `size` pixels grown at random from a seed pixel, 2 px or more inside the picture. */
const blobOf = (int: (a: number, b: number) => number, size: number): ReadonlyArray<number> => {
  const w = SPECK_SIDE;
  const blob = [int(3, w - 4) + int(3, w - 4) * w];
  while (blob.length < size) {
    const from = blob[int(0, blob.length - 1)] ?? 0;
    const next = [from - 1, from + 1, from - w, from + w][int(0, 3)] ?? from;
    const [x, y] = [next % w, Math.floor(next / w)];
    const inside = x >= 2 && y >= 2 && x < w - 2 && y < w - 2;
    if (inside && !blob.includes(next)) blob.push(next);
  }
  return blob;
};

/** Each pixel of `blob` and its 8 neighbours. */
const haloOf = (blob: ReadonlyArray<number>): ReadonlyArray<number> =>
  blob.flatMap((q) => [-1, 0, 1].flatMap((dy) => [-1, 0, 1].map((dx) => q + dy * SPECK_SIDE + dx)));

/** The letter most of `blob`'s distinct 4-neighbours outside it are, `b` before `s` when equal. */
const rimMajority = (letters: ReadonlyArray<string>, blob: ReadonlyArray<number>): string => {
  const w = SPECK_SIDE;
  const rim = [...new Set(blob.flatMap((q) => [q - 1, q + 1, q - w, q + w]))].filter(
    (q) => !blob.includes(q),
  );
  const [b, s] = ['b', 's'].map((ch) => rim.filter((q) => letters[q] === ch).length);
  return ['b', 's'][Number((s ?? 0) > (b ?? 0))] ?? 'b';
};

/** A picture of two cloths, `b` left and `s` right of a ragged seam, with up to 6 blobs of `c` apart from each other, each with the letter it must end as: its rim's majority when 12 px or fewer, else `c`. */
const speckCase = (seed: number) => {
  const draw = rng(seed);
  const int = (a: number, b: number) => a + Math.floor(draw() * (b - a + 1));
  const w = SPECK_SIDE;
  const seam = int(14, 26);
  const letters = Array.from({ length: w * w }, (_, q) => {
    const [x, y] = [q % w, Math.floor(q / w)];
    return ['b', 's'][Number(x >= seam + (y % 3) - 1)] ?? 'b';
  });
  const taken = new Set<number>();
  const wants: Array<{ readonly cells: ReadonlyArray<number>; readonly want: string }> = [];
  for (let tries = 0; tries < 60 && wants.length < 6; tries++) {
    const size = [int(1, 12), int(13, 18)][Number(draw() < 0.25)] ?? 1;
    const blob = blobOf(int, size);
    const halo = haloOf(blob);
    if (halo.some((q) => taken.has(q))) continue;
    for (const q of halo) taken.add(q);
    wants.push({
      cells: blob,
      want: [rimMajority(letters, blob), 'c'][Number(size > SPECK_PX)] ?? 'c',
    });
    for (const q of blob) letters[q] = 'c';
  }
  const rows = Array.from({ length: w }, (_, y) => letters.slice(y * w, y * w + w).join(''));
  return { rows, wants };
};

describe('tidied', () => {
  test("paints a thin line darker than one part's cloth on both sides in that part's shade, and one between two parts in ink (critique 1, item 1)", () => {
    const row = 'kttttftttesssssk';
    const rows = ['kkkkkkkkkkkkkkkk', ...Array.from({ length: 13 }, () => row), 'kkkkkkkkkkkkkkkk'];
    const out = lettersOf(tidy(art(rows, LEAD_KEY), LEAD_PALETTE), LEAD_KEY);
    const want = 'kttttvtttksssssk';
    expect(out).toEqual([
      'kkkkkkkkkkkkkkkk',
      ...Array.from({ length: 13 }, () => want),
      'kkkkkkkkkkkkkkkk',
    ]);
  });

  test('over generated faces and cloth: no skin paint stays farther than SKIN_REACH from skin base, and the skin shade beside the skin stays (critique 1, item 1: rose on cloth = 0)', () => {
    for (let seed = 1; seed <= 24; seed++) {
      const draw = rng(seed);
      const int = (a: number, b: number) => a + Math.floor(draw() * (b - a + 1));
      const [width, height] = [48, 36];
      const grid = Array.from({ length: height }, () => Array.from({ length: width }, () => 't'));
      const paint = (x0: number, y0: number, w: number, h: number, ch: string) => {
        for (const [x, y] of area(x0, x0 + w, y0, y0 + h)) {
          const line = grid[y];
          if (line && x >= 0 && x < width) line[x] = ch;
        }
      };
      const [fx, fy, fw, fh] = [int(4, 10), int(4, 10), int(6, 10), int(6, 10)];
      paint(fx, fy, fw, fh, 'a');
      const ry = fy + int(0, fh - 4);
      paint(fx + fw, ry, 4, 4, 'r');
      const blobs = int(1, 3);
      for (let b = 0; b < blobs; b++)
        paint(int(fx + fw + 4 + SKIN_REACH + 1, width - 5), int(0, height - 5), 4, 4, 'r');
      const out = tidy(
        art(
          grid.map((l) => l.join('')),
          LEAD_KEY,
        ),
        LEAD_PALETTE,
      );
      const beside = lettersOf(out, LEAD_KEY)
        .slice(ry, ry + 4)
        .map((l) => l.slice(fx + fw, fx + fw + 4));
      expect({ seed, onCloth: skinOnCloth(out, LEAD_PALETTE).length }).toEqual({
        seed,
        onCloth: 0,
      });
      expect({ seed, beside }).toEqual({ seed, beside: ['rrrr', 'rrrr', 'rrrr', 'rrrr'] });
    }
  });

  test('gives a speck of 12 px or fewer the paint most of its distinct rim is, the ink not counted, and keeps a larger patch and a speck ringed in ink (critique 1, item 6)', () => {
    const rows = [
      'bbbbbbbbbbbbssssssss',
      'bsbbbbbbbbbbssssssss',
      'bbbbbbbbbbbbsssbssss',
      'bbbbkkkbbbbbssssssss',
      'bbbbkbkbbbbbssssssss',
      'bbbbkkkbbbsssbbbbsss',
      'bbbbbbbbbbsssbbbbsss',
      'bssssbbbbbsssbbbbsss',
      'bssssbbbbbsssbbbbsss',
      'bssssbbbbbssssssssss',
      'bbbbbbbbbbssssssssss',
    ];
    expect(lettersOf(tidy(art(rows, KEY), PALETTE))).toEqual([
      'bbbbbbbbbbbbssssssss',
      'bbbbbbbbbbbbssssssss',
      'bbbbbbbbbbbbssssssss',
      'bbbbkkkbbbbbssssssss',
      'bbbbkbkbbbbbssssssss',
      'bbbbkkkbbbsssbbbbsss',
      'bbbbbbbbbbsssbbbbsss',
      'bbbbbbbbbbsssbbbbsss',
      'bbbbbbbbbbsssbbbbsss',
      'bbbbbbbbbbssssssssss',
      'bbbbbbbbbbssssssssss',
    ]);
  });

  test('over generated specks on two cloths and their seam: each island of 12 px or fewer takes the paint most of its distinct rim pixels are, a larger one stays (critique 1, item 6)', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const { rows, wants } = speckCase(seed);
      const out = lettersOf(tidy(art(rows, SPECK_KEY), SPECK_PALETTE), SPECK_KEY).join('');
      for (const { cells, want } of wants)
        expect({ seed, got: [...new Set(cells.map((q) => out[q]))] }).toEqual({
          seed,
          got: [want],
        });
    }
  });
});

describe('cellsOf', () => {
  test('cuts through a one-column touch, the lowest occupancy, the touch going to the right cell', () => {
    const r = art(['bbbb.bbb', 'bbbbbbbb', 'bbbb.bbb'], KEY);
    expect(Result.getOrThrow(cellsOf(r, 2))).toEqual([
      { x: 0, y: 0, width: 4, height: 3 },
      { x: 4, y: 0, width: 4, height: 3 },
    ]);
  });

  test('cuts in the widest empty runs, at each centre, from the first to the last occupied column', () => {
    const r = art(['..b...b.b....b..', '..b...b.b....b..'], KEY);
    expect(Result.getOrThrow(cellsOf(r, 3)).map((b) => [b.x, b.width])).toEqual([
      [2, 2],
      [4, 6],
      [10, 4],
    ]);
  });

  test('goes to the next level up when the empty runs are too few', () => {
    const r = art(['bb.bbbb', 'bb.b.bb'], KEY);
    expect(Result.getOrThrow(cellsOf(r, 3)).map((b) => [b.x, b.width])).toEqual([
      [0, 2],
      [2, 2],
      [4, 3],
    ]);
  });

  test('refuses a sheet that holds no figure or too few columns to cut', () => {
    expect(Result.isFailure(cellsOf(art(['...'], KEY), 1))).toBe(true);
    expect(Result.isFailure(cellsOf(art(['bb'], KEY), 3))).toBe(true);
  });

  test('counts the figures as the empty runs between the first and last occupied columns, plus one', () => {
    expect(figuresIn(art(['.b.bb..b.'], KEY))).toBe(3);
    expect(figuresIn(art(['...'], KEY))).toBe(0);
  });
});

describe('groundOf and clearBackground', () => {
  test('reads the ground as the border median and clears only ground joined to the border', () => {
    const r = art(['ggggggg', 'gkkkkkg', 'gkgggkg', 'gkkkkkg', 'ggggggg'], { ...KEY, g: GROUND });
    expect(groundOf(r)).toEqual(GROUND);
    expect(lettersOf(clearBackground(r, GROUND))).toEqual([
      '.......',
      '.kkkkk.',
      '.kgggk.',
      '.kkkkk.',
      '.......',
    ]);
  });
});

/** A generated sheet: its pixels, which figure owns each (-1 none), and the colour each owned pixel must end as. */
interface Generated {
  readonly n: number;
  readonly raster: Raster;
  readonly owner: Int32Array;
  readonly want: ReadonlyArray<Rgb>;
}

const HEIGHT = 60;

/** A generated sheet being drawn: its seeded draws and its pixels. */
interface Easel {
  readonly int: (a: number, b: number) => number;
  readonly chance: () => boolean;
  readonly noisy: (c: Rgb) => Rgb;
  readonly put: (x: number, y: number, c: Rgb) => void;
  readonly own: (x: number, y: number, f: number, paint: Rgb, drawn: Rgb) => void;
  readonly free: (x: number, y: number) => void;
}

/** One figure's place: its left column, width, crown row and soles row. */
interface Place {
  readonly left: number;
  readonly fw: number;
  readonly top: number;
  readonly soles: number;
}

/** Each pixel in the rows `y0..y1` and columns `x0..x1`, the ends outside. */
const area = (
  x0: number,
  x1: number,
  y0: number,
  y1: number,
): ReadonlyArray<readonly [number, number]> =>
  Array.from({ length: (x1 - x0) * (y1 - y0) }, (_, k) => [
    x0 + (k % (x1 - x0)),
    y0 + Math.floor(k / (x1 - x0)),
  ]);

/** A figure's body: an ink edge 2 px wide round its base, its right third in its shade. */
const body = (e: Easel, f: number, p: Place) => {
  for (const [x, y] of area(p.left, p.left + p.fw, p.top, p.soles + 1)) {
    const edge = x < p.left + 2 || x >= p.left + p.fw - 2 || y < p.top + 2 || y > p.soles - 2;
    const cloth = [BASE, SHADE][Number(x - p.left > (p.fw * 2) / 3)] ?? BASE;
    const paint = [cloth, INK][Number(edge)] ?? INK;
    e.own(x, y, f, paint, e.noisy(paint));
  }
};

/** A 3 × 3 pocket of the ground's colour inside the base: it must come back as the base. */
const palePocket = (e: Easel, f: number, p: Place) => {
  for (const [x, y] of area(p.left + 3, p.left + 6, p.top + 3, p.top + 6))
    e.own(x, y, f, BASE, e.noisy(GROUND));
};

/** A 3 × 3 hole of ground ringed 2 px in ink, low in the body: it must come back clear. */
const trueGap = (e: Easel, f: number, p: Place) => {
  for (const [x, y] of area(p.left + 2, p.left + 9, p.soles - 9, p.soles - 2))
    e.own(x, y, f, INK, e.noisy(INK));
  for (const [x, y] of area(p.left + 4, p.left + 7, p.soles - 7, p.soles - 4)) e.free(x, y);
};

/** A ring 1 or 2 px wide round a figure's box, outside its outline, of the ground blended 20 to 50 % toward the ink: a drawing's soft edge on its ground, which no figure owns. */
const fringe = (e: Easel, p: Place) => {
  const w = e.int(1, 2);
  for (const [x, y] of area(p.left - w, p.left + p.fw + w, p.top - w, p.soles + w + 1)) {
    if (x >= p.left && x < p.left + p.fw && y >= p.top && y <= p.soles) continue;
    const t = e.int(20, 50) / 100;
    e.put(x, y, [
      Math.round(GROUND[0] + (INK[0] - GROUND[0]) * t),
      Math.round(GROUND[1] + (INK[1] - GROUND[1]) * t),
      Math.round(GROUND[2] + (INK[2] - GROUND[2]) * t),
    ]);
  }
};

/** A small sheet drawn as the acceptance draws its own: inked figures in a row on noisy ground, half with a pale pocket, half a true gap, a foreign patch, specks above; `fringed`, each figure in a soft fringe outside its outline. */
const generated = (seed: number, fringed = false): Generated => {
  const draw = rng(seed);
  const int = (a: number, b: number) => a + Math.floor(draw() * (b - a + 1));
  const n = int(2, 4);
  const [slot, gap, margin] = [24, int(4, 8) + 4 * Number(fringed), 6];
  const width = margin * 2 + n * slot + (n - 1) * gap;
  const rgba = new Uint8Array(width * HEIGHT * 4);
  const owner = new Int32Array(width * HEIGHT).fill(-1);
  const want: Array<Rgb> = Array.from({ length: width * HEIGHT }, () => GROUND);
  const put = (x: number, y: number, c: Rgb) => rgba.set([...c, 255], (y * width + x) * 4);
  const noisy = (c: Rgb): Rgb => [c[0] + int(-2, 2), c[1] + int(-2, 2), c[2] + int(-2, 2)];
  const e: Easel = {
    int,
    chance: () => draw() < 0.5,
    noisy,
    put,
    own: (x, y, f, paint, drawn) => {
      put(x, y, drawn);
      owner[y * width + x] = f;
      want[y * width + x] = paint;
    },
    free: (x, y) => {
      put(x, y, noisy(GROUND));
      owner[y * width + x] = -1;
    },
  };
  for (const [x, y] of area(0, width, 0, HEIGHT)) put(x, y, noisy(GROUND));
  const foreign = e.chance();
  for (let f = 0; f < n; f++) {
    const fw = int(14, slot - 2);
    const p: Place = {
      left: margin + f * (slot + gap) + int(0, slot - fw),
      fw,
      top: int(8, 16),
      soles: HEIGHT - 6,
    };
    body(e, f, p);
    if (foreign) e.own(p.left + 6, p.top + 12, f, FOREIGN, FOREIGN);
    if (e.chance()) palePocket(e, f, p);
    if (e.chance()) trueGap(e, f, p);
    for (const [x, y] of area(p.left + 4, p.left + 6, p.top - 6, p.top - 4)) put(x, y, noisy(BASE));
    if (fringed) fringe(e, p);
  }
  return { n, raster: { width, height: HEIGHT, rgba }, owner, want };
};

/** Every pixel of every cell against the generated sheet: clear unless its figure owns it, else opaque in exactly its colour. */
const missesOf = (g: Generated): ReadonlyArray<string> => {
  const split = Result.getOrThrow(splitSheet(g.raster, g.n, PALETTE));
  const misses: Array<string> = [];
  for (const [i, cell] of split.cells.entries())
    for (let v = 0; v < cell.box.height; v++)
      for (let u = 0; u < cell.box.width; u++) {
        const q = v * cell.box.width + u;
        const s = (cell.box.y + v) * g.raster.width + cell.box.x + u;
        const mine = g.owner[s] === i;
        const ok =
          (!mine && alphaAt(cell.raster, q) === 0) ||
          (mine &&
            alphaAt(cell.raster, q) === 255 &&
            hexOf(rgbAt(cell.raster, q)) === hexOf(g.want[s] ?? GROUND));
        if (!ok) misses.push(`cell ${i} (${u},${v})`);
      }
  const owned = [...g.owner].filter((f) => f >= 0).length;
  const kept = split.cells.reduce(
    (sum, c) =>
      sum +
      Array.from({ length: c.box.width * c.box.height }, (_, q) => q).filter(
        (q) => alphaAt(c.raster, q) > 0,
      ).length,
    0,
  );
  if (kept !== owned) misses.push(`${kept} pixels kept, ${owned} owned`);
  return misses;
};

describe('splitSheet over generated sheets', () => {
  test('gives each figure alone, pale pockets refilled, gaps and specks cleared, foreign paint kept, every other pixel snapped exactly', () => {
    const misses = Array.from({ length: 6 }, (_, k) => k + 1).flatMap((seed) =>
      missesOf(generated(seed)).map((m) => `seed ${seed}: ${m}`),
    );
    expect(misses.slice(0, 10)).toEqual([]);
  });

  test('peels a soft fringe of ground and ink outside the outline, so no ground-coloured pixel stays on a figure rim (critique 1, item 2)', () => {
    const misses = Array.from({ length: 6 }, (_, k) => k + 1).flatMap((seed) =>
      missesOf(generated(seed, true)).map((m) => `seed ${seed}: ${m}`),
    );
    expect(misses.slice(0, 10)).toEqual([]);
  });

  test('two splits of one sheet are the same pixels', () => {
    const g = generated(9);
    const a = Result.getOrThrow(splitSheet(g.raster, g.n, PALETTE));
    const b = Result.getOrThrow(splitSheet(g.raster, g.n, PALETTE));
    expect(a.cells.map((c) => [...c.raster.rgba])).toEqual(b.cells.map((c) => [...c.raster.rgba]));
  });
});

const SKIN: Rgb = [230, 180, 140];
const ROBE: Rgb = [120, 60, 40];
const SASH: Rgb = [200, 190, 220];
const SANDAL: Rgb = [90, 60, 40];

const DRESSED: Palette = {
  ink: hexOf(INK),
  parts: [
    { name: 'skin', base: hexOf(SKIN), role: 'skin' },
    { name: 'robe', base: hexOf(ROBE), role: 'garment' },
    { name: 'sash', base: hexOf(SASH), role: 'sash' },
    { name: 'sandals', base: hexOf(SANDAL), role: 'footwear' },
  ],
};

const HAIR: Rgb = [60, 90, 150];

/** `DRESSED` with hair: the paints a face mark is drawn in. */
const MARKED: Palette = {
  ink: DRESSED.ink,
  parts: [...DRESSED.parts, { name: 'hair', base: hexOf(HAIR), role: 'hair' }],
};

const FIGURE_KEY = { k: INK, s: SKIN, r: ROBE, h: SASH, f: SANDAL };

/** A standing figure's rows, the head on top, its arms down, the sash in rows 9 to 11. */
const STANDING: ReadonlyArray<string> = [
  '....kkkkk...........',
  '....ksssk...........',
  '....ksssk...........',
  '....ksssk...........',
  '...krrrrrk..........',
  '..krrrrrrr..........',
  '..krrrrrrr..........',
  '..krrrrrrr..........',
  '..krrrrrrr..........',
  '..khhhhhhhk.........',
  '..khhhhhhhk.........',
  '..khhhhhhhk.........',
  '..krrrrrrrk.........',
  '..krrrrrrrk.........',
  '..krrrrrrrk.........',
  '..krrrrrrrk.........',
  '..kkkkkkkkk.........',
  '...kfffkfffk........',
  '...kfffkfffk........',
  '...kkkkkkkkk........',
];

/** A standing figure; `offer` reaches the right arm out at the shoulder in its sleeve, a round hand at the end. */
const standing = (offer: boolean): Raster => {
  const arm = ['..........', 'rrrrrrrkss', 'rrrrrrrkss', 'kkkkkkkk..'];
  const still = ['..........', '..........', '..........', '..........'];
  const reach = [still, arm][Number(offer)] ?? still;
  return art(
    STANDING.map((row, y) => {
      if (y < 5 || y > 8) return row;
      return `${row.slice(0, 10)}${reach[y - 5] ?? ''}`;
    }),
    FIGURE_KEY,
  );
};

/** The columns a band covers, inclusive, in its figure's own px: a mark drawn on part of the face, skin either side of it. */
type Span = readonly [number, number];

/** Every column inside the outline. */
const WHOLE: Span = [0, Number.POSITIVE_INFINITY];

/** One band of a figure's head column, crown to soles: the row its paint ends at (a fraction of a row allowed), the paint, and the columns it covers (`WHOLE` when not given). */
type Band = readonly [number, Rgb, Span?];

/** Where a figure is drawn: its width, outline to outline, and the clear columns left and right of it. */
interface Placing {
  readonly width: number;
  readonly left: number;
  readonly right: number;
}

/** A figure `width` px wide (15 unless placed) and `height` rows tall, outlined in ink at its sides, painted in `bands` moved `dy` of a row down, skin beside a band in the columns its span leaves: a row two bands share is their blend by cover, as drawing at a fraction of a pixel paints it. */
const banded = (
  bands: ReadonlyArray<Band>,
  height: number,
  dy: number,
  placing: Placing = { width: 15, left: 0, right: 0 },
): Raster => {
  const { width, left, right } = placing;
  const across = left + width + right;
  const rgba = new Uint8Array(across * height * 4);
  const soles: Band = [Number.POSITIVE_INFINITY, SANDAL];
  const paintOf = (band: Band, x: number): Rgb => {
    const [x0, x1] = band[2] ?? WHOLE;
    if (x < x0 || x > x1) return SKIN;
    return band[1];
  };
  for (let y = 0; y < height; y++) {
    const edge = bands.map(([end]) => end + dy).find((e) => e > y && e < y + 1) ?? y;
    const cover = edge - y;
    const bandAt = (v: number): Band => bands.find(([end]) => v < end + dy) ?? soles;
    const [above, below] = [bandAt(y), bandAt(y + 0.999)];
    for (let x = 0; x < width; x++) {
      const [a, b] = [paintOf(above, x), paintOf(below, x)];
      const row = [0, 1, 2].map((k) => Math.round((a[k] ?? 0) * cover + (b[k] ?? 0) * (1 - cover)));
      const mixed = [a, [row[0] ?? 0, row[1] ?? 0, row[2] ?? 0] as const][Number(a !== b)] ?? a;
      const outline = x === 0 || x === width - 1;
      rgba.set([...([mixed, INK][Number(outline)] ?? mixed), 255], (y * across + left + x) * 4);
    }
  }
  return { width: across, height, rgba };
};

/** The bands of a figure drawn at `height` rows from shares of its height: each band's end as a share, and its paint. */
const scaledBands = (shares: ReadonlyArray<Band>, height: number): ReadonlyArray<Band> =>
  shares.map(([end, paint, span]) => [end * height, paint, span ?? WHOLE] as const);

/** The paints a mark on a generated face is drawn in: either cloth, the ink, the sandals' paint, the hair. */
const MARK_PAINTS: ReadonlyArray<Rgb> = [ROBE, SASH, INK, SANDAL, HAIR];

/** The paints an edge below a mark is drawn in: mostly the ink, else the hair's or the sandals' paint. */
const EDGE_PAINTS: ReadonlyArray<Rgb> = [INK, INK, HAIR, SANDAL];

/** Whether `paint` is cloth, a paint a collar is drawn in. */
const isCloth = (paint: Rgb): boolean => paint === ROBE || paint === SASH;

/** The colour half `a` and half `b`: a blend no paint is exactly. */
const halfOf = (a: Rgb, b: Rgb): Rgb => [
  Math.round((a[0] + b[0]) / 2),
  Math.round((a[1] + b[1]) / 2),
  Math.round((a[2] + b[2]) / 2),
];

/**
 * A generated figure, the row its collar starts at, and whether its head
 * column can tell that collar from a mark: an ink crown; the face in skin
 * with up to three marks drawn on it, each in a cloth, the ink, the
 * sandals' or the hair's paint, from one row to six hundredths of the
 * figure deep (a jaw line as deep as a collar or deeper), across the face
 * or across the head column and part of the face with skin beside it, half
 * of them edged below in the ink, the hair's or the sandals' paint, a row
 * to a hundredth deep, with a blend row before or after it or none; skin
 * above and below; a collar band in a cloth from two rows to eight
 * hundredths deep; then the clothes, run on or broken by an ink line, a
 * sash, or a hand in skin right under the collar, ringed in ink, edged in
 * ink above and its sleeve joining its lower edge, or drawn straight on the
 * collar; the soles in sandals. A tenth of the figures wear no clothes
 * below the face. The figure is 15 to 40 px wide with up to 6 clear
 * columns either side of it.
 *
 * A mark across the whole face cuts the skin below it off from the face's
 * own skin. A cloth mark read in the head column at or below such a cut
 * leaves skin below it the face cannot reach, as a hand right under the
 * collar does: the column cannot tell the collar from the mark, so neither
 * is told.
 */
const generatedFigure = (seed: number) => {
  const draw = rng(seed);
  const pick = <A>(xs: ReadonlyArray<A>, fallback: A): A =>
    xs[Math.floor(draw() * xs.length)] ?? fallback;
  const int = (a: number, b: number) => a + Math.floor(draw() * (b - a + 1));
  const height = 120 + Math.floor(draw() * 900);
  const dy = draw();
  const placing = { width: int(15, 40), left: int(0, 6), right: int(0, 6) };
  const column = Math.round(placing.left + (placing.width - 1) / 2) - placing.left;
  const bands: Array<Band> = [];
  const starts: Array<number> = [];
  const halves = new Set<Rgb>();
  const marks: Array<{ readonly mark: number; readonly part: boolean }> = [];
  const hands: Array<number> = [];
  let y = 0;
  const add = (depth: number, paint: Rgb, span: Span = WHOLE) => {
    starts.push(y);
    y += depth;
    bands.push([y, paint, span]);
    return bands.length - 1;
  };
  add(2 + draw() * height * 0.12, INK);
  add(4 + draw() * height * 0.06, SKIN);
  for (let k = Math.floor(draw() * 4); k > 0; k--) {
    const paint = pick(MARK_PAINTS, ROBE);
    const part = draw() < 0.5;
    const left = draw() < 0.5;
    const span: Span = [
      [1, [int(3, column - 1), 1][Number(left)] ?? 1][Number(part)] ?? 1,
      [
        placing.width - 2,
        [placing.width - 2, int(column + 1, placing.width - 4)][Number(left)] ?? placing.width - 2,
      ][Number(part)] ?? placing.width - 2,
    ];
    const mark = add(1 + draw() * height * 0.06, paint, span);
    const blend = int(0, 2);
    const half = (a: Rgb, b: Rgb) => {
      const c = halfOf(a, b);
      halves.add(c);
      add(1 + draw(), c, span);
    };
    if (draw() < 0.5) {
      const paintOfEdge = pick(EDGE_PAINTS, INK);
      if (blend === 1) half(paint, paintOfEdge);
      add(1 + draw() * height * 0.01, paintOfEdge, span);
      if (blend === 2) half(paintOfEdge, SKIN);
    }
    add(2 + draw() * height * 0.04, SKIN);
    marks.push({ mark, part });
  }
  const bare = draw() < 0.1;
  const collar = y + dy;
  const clothes: ReadonlyArray<ReadonlyArray<Rgb>> = [
    [ROBE],
    [INK, ROBE],
    [SASH, ROBE],
    [INK, ROBE, INK, SKIN, INK, ROBE],
    [INK, SKIN, INK, ROBE],
    [INK, SKIN, ROBE],
    [SKIN, ROBE],
  ];
  if (bare) add(Math.max(2, height * 0.92 - y), INK);
  else {
    add(2 + draw() * height * 0.08, pick([ROBE, SASH], ROBE));
    const below = pick(clothes, [ROBE]);
    const room = Math.max(0, height * 0.92 - y);
    const drawn = below.map((paint) =>
      add(Math.max(1, (room / below.length) * (0.5 + draw())), paint),
    );
    const hand = below.indexOf(SKIN);
    if (hand === 0 || hand === 1) hands.push(drawn[hand] ?? -1);
  }
  add(Math.max(2, height - y), SANDAL);
  const raster = banded(bands, Math.ceil(y), dy, placing);
  const shown = (band: number): boolean => {
    const paint = bands[band]?.[1] ?? SKIN;
    const [from, to] = [
      Math.floor((starts[band] ?? 0) + dy),
      Math.ceil((bands[band]?.[0] ?? 0) + dy),
    ];
    if (band < 0 || halves.has(paint)) return false;
    for (let row = from; row < Math.min(to, raster.height); row++)
      if (hexOf(rgbAt(raster, row * raster.width + placing.left + column)) === hexOf(paint))
        return true;
    return false;
  };
  const cut = marks.findIndex(({ part }) => !part);
  const cutOff = marks.some(
    ({ mark }, i) => cut >= 0 && i >= cut && isCloth(bands[mark]?.[1] ?? SKIN) && shown(mark),
  );
  return {
    raster,
    collar: Option.some(collar).pipe(Option.filter(() => !bare)),
    untold: cutOff || hands.some(shown),
  };
};

/** The bands of the verifier's figure (round 2, M2): a jaw line 1.8 % of its height deep at a fifth of it, across the head column with skin to its right, the collar at 33 %, 2.6 % deep, an ink line, the robe and sandals. */
const JAW_AND_COLLAR: ReadonlyArray<Band> = [
  [0.15, INK],
  [0.2, SKIN],
  [0.218, ROBE, [1, 10]],
  [0.33, SKIN],
  [0.356, ROBE],
  [0.406, INK],
  [0.92, ROBE],
  [1, SANDAL],
];

/** How many generated figures the split property draws on a sheet and splits. */
const SPLIT_FIGURES = 40;

/** `r` drawn alone on a sheet of the ground, 10 px in from each side. */
const onSheet = (r: Raster): Raster => {
  const [width, height] = [r.width + 20, r.height + 20];
  const rgba = new Uint8Array(width * height * 4);
  for (let q = 0; q < width * height; q++) rgba.set([...GROUND, 255], q * 4);
  for (let y = 0; y < r.height; y++)
    for (let x = 0; x < r.width; x++) {
      const q = (y * r.width + x) * 4;
      if ((r.rgba[q + 3] ?? 0) > 0)
        rgba.set(r.rgba.subarray(q, q + 4), ((y + 10) * width + x + 10) * 4);
    }
  return { width, height, rgba };
};

const ANATOMY_INK: Rgb = [20, 10, 5];
const ANATOMY_SKIN: Rgb = [240, 180, 130];
const ANATOMY_ROBE: Rgb = [110, 130, 125];
const ANATOMY_HAIR: Rgb = [90, 50, 20];
const ANATOMY_SASH: Rgb = [150, 60, 80];
const ANATOMY_SHOE: Rgb = [70, 50, 60];

/** The round-4 verifier's palette: ink, skin, a robe, hair, a sash and shoes. */
const ANATOMY: Palette = {
  ink: hexOf(ANATOMY_INK),
  parts: [
    { name: 'skin', role: 'skin', base: hexOf(ANATOMY_SKIN) },
    { name: 'robe', role: 'garment', base: hexOf(ANATOMY_ROBE) },
    { name: 'hair', role: 'hair', base: hexOf(ANATOMY_HAIR) },
    { name: 'shoe', role: 'footwear', base: hexOf(ANATOMY_SHOE) },
    { name: 'sash', role: 'sash', base: hexOf(ANATOMY_SASH) },
  ],
};

/**
 * The round-4 verifier's figure (M1), 81 by 240, its body 41 px wide in ink
 * at its sides: hair to row 36, skin to 80, the collar in the robe from 80,
 * an ink line in rows 87 to 94, the robe on down. `paint` draws over it.
 */
const anatomyFigure = (paint: (x: number, y: number) => Option.Option<Rgb>): Raster => {
  const [width, height] = [81, 240];
  const rgba = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 20; x <= 60; x++) {
      const drawn = [
        [y < 36, ANATOMY_HAIR],
        [y < 80, ANATOMY_SKIN],
        [y >= 87 && y < 95, ANATOMY_INK],
        [true, ANATOMY_ROBE],
      ] as const;
      const base = drawn.find(([at]) => at)?.[1] ?? ANATOMY_ROBE;
      const c = [base, ANATOMY_INK][Number(x === 20 || x === 60)] ?? base;
      rgba.set([...Option.getOrElse(paint(x, y), () => c), 255], (y * width + x) * 4);
    }
  return { width, height, rgba };
};

/** A round hand ringed in ink under the collar's ink line, centred at (40, 107), 13 px across, the sleeve's skin joining its lower edge in rows 118 on. */
const roundHand = (x: number, y: number): Option.Option<Rgb> => {
  const d = (x - 40) ** 2 + (y - 107) ** 2;
  if (y < 95 || y > 121 || d > 13 ** 2) return Option.none();
  if (d >= 11.5 ** 2 && !(y >= 118 && Math.abs(x - 40) <= 4)) return Option.some(ANATOMY_INK);
  return Option.some(ANATOMY_SKIN);
};

/** `r` drawn `scale` times as large, `dx` and `dy` clear px on each side. */
const enlarged = (r: Raster, scale: number, dx: number, dy: number): Raster => {
  const [width, height] = [r.width * scale + dx * 2, r.height * scale + dy * 2];
  const rgba = new Uint8Array(width * height * 4);
  for (let y = 0; y < height - dy * 2; y++)
    for (let x = 0; x < width - dx * 2; x++) {
      const q = (Math.floor(y / scale) * r.width + Math.floor(x / scale)) * 4;
      rgba.set(r.rgba.subarray(q, q + 4), ((y + dy) * width + x + dx) * 4);
    }
  return { width, height, rgba };
};

/** The head `palette` reads in the one cell `splitSheet` cuts from `r` drawn alone on a sheet; none when it reads none or the split refuses. */
const splitHeadOf = (r: Raster, palette: Palette): Option.Option<number> =>
  Option.flatMap(Result.getSuccess(splitSheet(onSheet(r), 1, palette)), (s) =>
    Option.flatMap(Option.fromUndefinedOr(s.cells[0]), (cell) =>
      Option.flatMap(linesOf(cell.raster, paintsOf(palette)), (l) => l.head),
    ),
  );

describe('linesOf', () => {
  const paints = paintsOf(DRESSED);

  test('reads the crown, the head (crown to collar), the sash top and the hem in the head and centre columns', () => {
    const lines = Option.getOrThrow(linesOf(standing(false), paints));
    expect([lines.top, lines.bottom, lines.headColumn, lines.crown]).toEqual([0, 19, 6, 0]);
    expect([lines.head, lines.sashTop, lines.hem]).toEqual([
      Option.some(4),
      Option.some(9),
      Option.some(15),
    ]);
  });

  test('holds every line when the arm reaches out at the shoulder, where a row-wide count moves', () => {
    const down = Option.getOrThrow(linesOf(standing(false), paints));
    const out = Option.getOrThrow(linesOf(standing(true), paints));
    expect(out).toEqual(down);
  });

  test('reads the sash top across the figure, where a sleeve hangs over the belt at the centre column or a drawn line runs down it (round 1, M3)', () => {
    for (const letter of ['r', 'k', 's']) {
      const rows = STANDING.map((row, y) => {
        if (y < 9 || y > 11) return row;
        return `${row.slice(0, 7)}${letter}${row.slice(8)}`;
      });
      expect([
        letter,
        Option.flatMap(linesOf(art(rows, FIGURE_KEY), paints), (l) => l.sashTop),
      ]).toEqual([letter, Option.some(9)]);
    }
  });

  test('reads the hem above an outline fringe between the legs that snapped to a garment paint (round 2: ink on a green ground blends to teal)', () => {
    const rows = STANDING.map((row, y) => {
      if (y === 16) return '..kkkkkkkkkkk.......';
      if (y > 16) return '..kffk.r.kffk.......';
      return row;
    });
    const lines = Option.getOrThrow(linesOf(art(rows, FIGURE_KEY), paints));
    expect([lines.centreColumn, lines.hem]).toEqual([7, Option.some(15)]);
  });

  test("reads the collar below a jaw line drawn in a garment's colour with the face's skin above, beside and below it, and none where the line crosses the whole face (round 2: the man's turned head; round 4, M1)", () => {
    const figure = (jaw: string) =>
      art(
        [
          '..kkkkkkk..',
          '..ksssssk..',
          '..ksssssk..',
          '..ksssssk..',
          jaw,
          jaw,
          jaw,
          '..ksssssk..',
          '..ksssssk..',
          ...Array.from({ length: 14 }, () => '.krrrrrrrk.'),
          '.kkkkkkkkk.',
        ],
        FIGURE_KEY,
      );
    const read = (jaw: string) => {
      const lines = Option.getOrThrow(linesOf(figure(jaw), paints));
      return [lines.crown, lines.headColumn, lines.head];
    };
    expect(read('..krrrrsk..')).toEqual([0, 5, Option.some(9)]);
    expect(read('..krrrrrk..')).toEqual([0, 5, Option.none()]);
  });

  test('reads the same collar in one figure drawn 200 and 240 rows tall, a jaw line as deep as the collar above it (round 2, M2)', () => {
    const heads = [200, 240].map((height) =>
      Option.flatMap(
        linesOf(banded(scaledBands(JAW_AND_COLLAR, height), height, 0), paints),
        (l) => l.head,
      ),
    );
    expect(heads).toEqual([Option.some(66), Option.some(80)]);
  });

  test('over generated figures (marks on the face of any paint, depth and width, edged in ink and blends or not; collars two rows deep and more; clothes broken by ink, a sash or a hand), widths, sizes and offsets: reads the head to the row the collar band starts in, none where no clothes follow the face or the column cannot tell the collar from a mark', () => {
    const marked = paintsOf(MARKED);
    const kinds: Array<readonly [boolean, boolean]> = [];
    for (let seed = 1; seed <= 200; seed++) {
      const { raster, collar, untold } = generatedFigure(seed);
      const head = Option.flatMap(linesOf(raster, marked), (l) => l.head);
      const read = Option.match(collar, {
        onNone: () => Option.isNone(head),
        onSome: (c) =>
          [
            Option.exists(head, (h) => h >= Math.floor(c) && h <= Math.ceil(c)),
            Option.isNone(head),
          ][Number(untold)] ?? false,
      });
      expect([seed, raster.height, collar, untold, head, read]).toEqual([
        seed,
        raster.height,
        collar,
        untold,
        head,
        true,
      ]);
      kinds.push([untold, Option.isSome(head)]);
    }
    const [unread, told] = [
      kinds.filter(([u]) => u).length,
      kinds.filter(([u, read]) => !u && read).length,
    ];
    expect([unread, told, unread >= 50, told >= 50]).toEqual([unread, told, true, true]);
  });

  test('over generated figures drawn on a sheet and split (`splitSheet`): reads the head to the row the collar band starts in, or none, never another row', () => {
    for (let seed = 1; seed <= SPLIT_FIGURES; seed++) {
      const { raster, collar } = generatedFigure(seed);
      const head = splitHeadOf(raster, MARKED);
      const read = Option.match(head, {
        onNone: () => true,
        onSome: (h) => Option.exists(collar, (c) => h >= Math.floor(c) && h <= Math.ceil(c)),
      });
      expect([seed, collar, head, read]).toEqual([seed, collar, head, true]);
    }
  });

  test('reads the collar below a full-width jaw mark edged in ink whose skin runs on down into the collar, drawn and through `splitSheet`, and none where ink closes that skin below, a hand under the collar (round 3, M1: the guest read 48 for 80)', () => {
    const ink: Rgb = [20, 10, 5];
    const skin: Rgb = [240, 180, 130];
    const robe: Rgb = [110, 130, 125];
    const palette: Palette = {
      ink: hexOf(ink),
      parts: [
        { name: 'skin', role: 'skin', base: hexOf(skin) },
        { name: 'robe', role: 'garment', base: hexOf(robe) },
      ],
    };
    const own = paintsOf(palette);
    const figure = (edge: number, closed: boolean): Raster => {
      const rows = Array.from({ length: 240 }, (_, y): Rgb => {
        if (y < 36) return ink;
        if (y < 48) return skin;
        if (y < 53) return robe;
        if (y < 53 + edge) return ink;
        if (y < 79) return skin;
        if (y < 80) return [skin, ink][Number(closed)] ?? skin;
        if (y < 87) return robe;
        if (y < 95) return ink;
        return robe;
      });
      const rgba = new Uint8Array(15 * 240 * 4);
      for (let y = 0; y < 240; y++)
        for (let x = 0; x < 15; x++)
          rgba.set(
            [...([rows[y] ?? robe, ink][Number(x === 0 || x === 14)] ?? ink), 255],
            (y * 15 + x) * 4,
          );
      return { width: 15, height: 240, rgba };
    };
    const headOf = (r: Raster) => Option.flatMap(linesOf(r, own), (l) => l.head);
    const collarOrNone = (head: Option.Option<number>) =>
      Option.match(head, { onNone: () => true, onSome: (h) => h === 80 });
    const open = [0, 1, 2, 4].map((edge) => figure(edge, false));
    const reads = [...open.map(headOf), ...open.map((r) => splitHeadOf(r, palette))];
    expect(reads.map((h) => [h, collarOrNone(h)])).toEqual(reads.map((h) => [h, true]));
    const closed = figure(1, true);
    expect([headOf(closed), splitHeadOf(closed, palette)]).toEqual([Option.none(), Option.none()]);
  });

  test('reads none, never the hand, from a round hand ringed in ink under the collar whose sleeve joins its lower edge, at scales 1 to 3 and offsets, drawn and through `splitSheet` (round 4, M1: 121 for 80)', () => {
    const own = paintsOf(ANATOMY);
    const plain = anatomyFigure(() => Option.none());
    const hand = anatomyFigure(roundHand);
    for (const scale of [1, 2, 3])
      for (const [dx, dy] of [
        [0, 0],
        [5, 7],
      ] as const) {
        const [a, b] = [enlarged(plain, scale, dx, dy), enlarged(hand, scale, dx, dy)];
        const heads = [a, b].map((r) => Option.flatMap(linesOf(r, own), (l) => l.head));
        expect([scale, dx, dy, ...heads, splitHeadOf(b, ANATOMY)]).toEqual([
          scale,
          dx,
          dy,
          Option.some(80 * scale),
          Option.none(),
          Option.none(),
        ]);
      }
  });

  test('reads 80 or none, never the mark, from a neck 1 to 5 px wide ringed in ink under a jaw mark across the face in any paint, edged in ink or not (round 4, M1: 48 for 80)', () => {
    const own = paintsOf(ANATOMY);
    for (const neck of [1, 2, 3, 5])
      for (const paint of [ANATOMY_ROBE, ANATOMY_SASH, ANATOMY_HAIR, ANATOMY_SHOE, ANATOMY_INK])
        for (const edge of [0, 1, 4]) {
          const r = anatomyFigure((x, y) => {
            if (y < 48 || y >= 80 || x < 21 || x > 59) return Option.none();
            if (y < 53) return Option.some(paint);
            if (y < 53 + edge || Math.abs(x - 40) > (neck - 1) / 2) return Option.some(ANATOMY_INK);
            return Option.some(ANATOMY_SKIN);
          });
          const head = Option.flatMap(linesOf(r, own), (l) => l.head);
          const read = Option.match(head, { onNone: () => true, onSome: (h) => h === 80 });
          expect([neck, hexOf(paint), edge, head, read]).toEqual([
            neck,
            hexOf(paint),
            edge,
            head,
            true,
          ]);
        }
  });

  test('reads no head from a figure with no face in its head column', () => {
    const rows = ['..kkkkk..', ...Array.from({ length: 12 }, () => '..krrrk..'), '..kkkkk..'];
    expect(Option.flatMap(linesOf(art(rows, FIGURE_KEY), paints), (l) => l.head)).toEqual(
      Option.none(),
    );
  });

  test('reads no sash top from stray sash pixels too few to make a band', () => {
    const rows = STANDING.map((row, y) => {
      if (y >= 9 && y <= 11) return '..krrrrrrrk.........';
      if (y >= 5 && y <= 7) return '..krhrrrrr..........';
      return row;
    });
    expect(Option.flatMap(linesOf(art(rows, FIGURE_KEY), paints), (l) => l.sashTop)).toEqual(
      Option.none(),
    );
  });

  test('reads none from a picture with no opaque pixel', () => {
    expect(linesOf({ width: 3, height: 3, rgba: new Uint8Array(36) }, paints)).toEqual(
      Option.none(),
    );
  });

  test("a sheet's head is the median of its cells' heads, over the cells that read one", () => {
    const heads = new Map([
      ['a', Option.some(4)],
      ['b', Option.none()],
      ['c', Option.some(6)],
      ['d', Option.some(5)],
    ]);
    expect(sheetHeadOf(heads)).toEqual(Option.some(5));
    expect(sheetHeadOf(new Map([['a', Option.none<number>()]]))).toEqual(Option.none());
  });
});

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

/** Paints `c` (rgba) at every pixel of `r` in columns `x0..x1` and rows `y0..y1`, inclusive, that `at` admits. */
const fill = (
  r: Raster,
  [x0, x1, y0, y1]: readonly [number, number, number, number],
  c: (x: number, y: number) => ReadonlyArray<number>,
  at: (x: number, y: number) => boolean = () => true,
) => {
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) if (at(x, y)) r.rgba.set(c(x, y), (y * r.width + x) * 4);
};

/**
 * One generated case of a worn head: a body face and a head face of one
 * size set off from each other, the head's crown cut at its two corners
 * `cut` px deep; half the bodies hold a hand ringed in ink beside the face
 * and a sleeve across the crown's right corner. Answers the body, the head
 * and the picture wearing it should give: the head's drawn pixels landed
 * aligned on the body's face, its cut corners clear but where the sleeve
 * reaches in, every other pixel the body's.
 */
const wornCase = (seed: number) => {
  const draw = rng(seed + 500);
  const int = (a: number, b: number) => a + Math.floor(draw() * (b - a + 1));
  const [bx, by, hx, cut] = [int(-4, 4), int(0, 2), int(-4, 4), int(2, 6)];
  const hy = by + int(0, 2);
  const hand = draw() < 0.5;
  const plain = { lower: INK, cheek: false };
  const body = faceFigure(rng(seed), { ...plain, closed: false, dx: bx, dy: by }).raster;
  const headFace = faceFigure(rng(seed), { ...plain, closed: true, dx: hx, dy: hy });
  const head = headFace.raster;
  const width = faceWidthOf(headFace, hx);
  const [hfx, bfx] = [20 + hx, 20 + bx];
  const clear = () => [0, 0, 0, 0];
  fill(head, [hfx, hfx + width - 1, 0, cut - 1], clear, (x, y) => x - hfx < cut - y);
  fill(head, [hfx, hfx + width - 1, 0, cut - 1], clear, (x, y) => hfx + width - 1 - x < cut - y);
  if (hand) {
    const [x0, y0] = [bfx + width, 4 + by + 20];
    fill(body, [x0, x0 + 10, y0, y0 + 10], (x, y) => [
      ...([SKIN, INK][Number(y === y0 || y === y0 + 10 || x === x0 + 10)] ?? INK),
      255,
    ]);
    fill(body, [x0 - cut, x0 + 6, 0, cut - 1], () => [...ROBE, 255]);
  }
  const want: Raster = { ...body, rgba: new Uint8Array(body.rgba) };
  const [ox, oy] = [bx - hx, by - hy];
  const landed = (x: number, y: number) => {
    const q = ((y - oy) * FACE_W + x - ox) * 4;
    return [...head.rgba.subarray(q, q + 4)];
  };
  const shows = (x: number, y: number) =>
    (landed(x, y)[3] ?? 0) > 0 || !hand || x - ox < hfx + width / 2;
  fill(
    want,
    [hfx + ox, hfx + ox + width - 1, 0, 4 + hy + head.height - 60 - 2 + oy],
    landed,
    shows,
  );
  return { body, head, want: want.rgba };
};

describe('withHeadOf (critique 3, items 2 and 6)', () => {
  const paints = paintsOf(DRESSED);

  test("over generated faces, the worn head set off from the body's and cut at its crown's corners, the body holding a hand beside its face or not: the worn head lands aligned on the body's face, the body's own head left showing in its box is cleared, and every other pixel, the hand too, is the body's", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const { body, head, want } = wornCase(seed);
      const got = Result.map(withHeadOf(body, head, paints), (r) => [...r.rgba].join());
      expect([seed, got]).toEqual([seed, Result.succeed([...want].join())]);
    }
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
