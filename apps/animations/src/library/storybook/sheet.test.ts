import { rng } from '@manna/film/core';
import type { Raster } from '@manna/film/tools';
import { Result } from 'effect';
import { describe, expect, test } from 'effect-bun-test';
import {
  alphaAt,
  cellsOf,
  clearBackground,
  deltaE,
  drawnNearestOf,
  figuresIn,
  groundOf,
  hexOf,
  largestPiece,
  measuredPaint,
  mendPockets,
  type Palette,
  paintsOf,
  rgbAt,
  rgbOfHex,
  type Rgb,
  PLAIN_SPLIT,
  SHADE_REACH,
  SKIN_REACH,
  strayShadeShare,
  SPECK_PX,
  snapped,
  splitSheet,
  tidied,
  tidiedReport,
} from './sheet.ts';
import { art, FOREIGN, GROUND, INK } from './testing.ts';

const BASE: Rgb = [200, 80, 60];
const SHADE: Rgb = [90, 120, 200];

const PALETTE: Palette = {
  ink: hexOf(INK),
  parts: [{ name: 'cloth', base: hexOf(BASE), shade: hexOf(SHADE), role: 'garment' }],
};

const PAINTS = paintsOf(PALETTE);

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
  test('under unstray, gives a hair shade farther than SHADE_REACH from its hair base its neighbours’ paint, and keeps the shade beside the hair; a plain split keeps both; the share reads them (critique 1, items 15 and 16)', () => {
    const key = {
      k: rgbOfHex('#130803'),
      a: rgbOfHex('#f2b27c'),
      h: rgbOfHex('#4f291c'),
      p: rgbOfHex('#57384a'),
    };
    const palette: Palette = {
      ink: '#130803',
      parts: [
        { name: 'skin', base: '#f2b27c', role: 'skin' },
        { name: 'hair', base: '#4f291c', shade: '#57384a', role: 'hair' },
      ],
    };
    const row = 'hhhhhpkaapaaaaak';
    const rows = Array.from({ length: 24 }, () => row);
    const drawn = art(rows, key);
    const paints = paintsOf(palette);
    const nearest = drawnNearestOf(drawn, paints);
    const snap = snapped(drawn, paints, nearest);
    const plain = lettersOf(tidied(drawn, snap, paints, nearest), key);
    const unstray = lettersOf(
      tidied(drawn, snap, paints, nearest, { ...PLAIN_SPLIT, unstray: true }),
      key,
    );
    expect(plain).toEqual(rows);
    expect(unstray).toEqual(Array.from({ length: 24 }, () => 'hhhhhpkaaaaaaaak'));
    expect(9 - 4).toBeGreaterThan(SHADE_REACH);
    expect(strayShadeShare(drawn, paints)).toBeCloseTo(1 / 16, 9);
    expect(strayShadeShare(art(unstray, key), paints)).toBe(0);
    const block = Array.from({ length: 24 }, () => 'hhhhhpkapppaaaak');
    const blocked = art(block, key);
    const near = drawnNearestOf(blocked, paints);
    const kept = tidied(blocked, snapped(blocked, paints, near), paints, near, {
      ...PLAIN_SPLIT,
      unstray: true,
    });
    expect(lettersOf(kept, key)).toEqual(block);
    expect(strayShadeShare(blocked, paints)).toBe(0);
  });

  test('under feetLow, gives a footwear paint above the figure’s middle row its nearest other paint, the hair here, and keeps it below; a plain split keeps both (critique 1, item 4)', () => {
    const key = {
      k: rgbOfHex('#130803'),
      a: rgbOfHex('#f2b27c'),
      h: rgbOfHex('#6c432b'),
      f: rgbOfHex('#7a5236'),
    };
    const palette: Palette = {
      ink: '#130803',
      parts: [
        { name: 'skin', base: '#f2b27c', role: 'skin' },
        { name: 'hair', base: '#6c432b', role: 'hair' },
        { name: 'sandals', base: '#7a5236', role: 'footwear' },
      ],
    };
    const rows = [
      ...Array.from({ length: 10 }, () => 'hhhhffffaaaa'),
      ...Array.from({ length: 10 }, () => 'aaaaffffaaaa'),
    ];
    const drawn = art(rows, key);
    const paints = paintsOf(palette);
    const nearest = drawnNearestOf(drawn, paints);
    const snap = snapped(drawn, paints, nearest);
    const plain = lettersOf(tidied(drawn, snap, paints, nearest), key);
    const low = lettersOf(
      tidied(drawn, snap, paints, nearest, { ...PLAIN_SPLIT, feetLow: true }),
      key,
    );
    expect(plain).toEqual(rows);
    expect(low).toEqual([
      ...Array.from({ length: 10 }, () => 'hhhhhhhhaaaa'),
      ...Array.from({ length: 10 }, () => 'aaaaffffaaaa'),
    ]);
  });

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

describe('tidiedReport', () => {
  /** A 40 × 20 cell of `garment` with a skin patch at its left and, 12 px from it, an 8 × 8 island of `island`. */
  const cell = (skin: Rgb, garment: Rgb, island: Rgb): Raster => {
    const [width, height] = [40, 20];
    const rgba = new Uint8Array(width * height * 4);
    for (let q = 0; q < width * height; q++) {
      const [x, y] = [q % width, Math.floor(q / width)];
      const inIsland = x >= 24 && x < 32 && y >= 6 && y < 14;
      const paint =
        [[garment, skin][Number(x < 12)] ?? garment, island][Number(inIsland)] ?? island;
      rgba.set([...paint, 255], q * 4);
    }
    return { width, height, rgba };
  };
  const skin: Rgb = [242, 178, 124];
  const garment: Rgb = [91, 97, 144];
  const terracotta: Rgb = [202, 124, 101];
  const base: Palette = {
    ink: '#1b0b03',
    parts: [
      { name: 'skin', base: hexOf(skin), shade: '#c9877e', role: 'skin' },
      { name: 'dress', base: hexOf(garment), role: 'garment' },
    ],
  };
  const reportOf = (palette: Palette) => {
    const drawn = cell(skin, garment, terracotta);
    const paints = paintsOf(palette);
    const nearest = drawnNearestOf(drawn, paints);
    return tidiedReport(drawn, snapped(drawn, paints, nearest), paints, nearest);
  };

  test('counts each skin pixel the skin rule repaints with a paint past SNAP_RADIUS of its drawn colour (the mother’s terracotta hair, critique 1, item 2), and none once the palette has a paint for it', () => {
    expect(reportOf(base).skinFar).toBe(64);
    const haired: Palette = {
      ...base,
      parts: [...base.parts, { name: 'hair', base: hexOf(terracotta), role: 'hair' }],
    };
    expect(reportOf(haired).skinFar).toBe(0);
  });
});

describe('measuredPaint', () => {
  /** A 60 × 40 drawing over generated seeds: a flat paint `a` on the left half and `b` on the right, ±2 of grain, an ink line every 5th row, a transparent column every 7th. */
  const drawing = (seed: number, a: Rgb, b: Rgb): Raster => {
    const next = rng(seed);
    const [width, height] = [60, 40];
    const rgba = new Uint8Array(width * height * 4);
    for (let q = 0; q < width * height; q++) {
      const [x, y] = [q % width, Math.floor(q / width)];
      const paint = [[a, b][Number(x >= 30)] ?? a, INK][Number(y % 5 === 0)] ?? INK;
      const grain = Math.round(next() * 4) - 2;
      rgba.set(
        [
          ...paint.map((c) => Math.min(255, Math.max(0, c + grain))),
          [255, 0][Number(x % 7 === 0)] ?? 0,
        ],
        q * 4,
      );
    }
    return { width, height, rgba };
  };

  test('reads the paint a box lies on within ΔE 2, its ink lines, grain and clear pixels left out, a box past the edge clipped; a box on the other paint reads that one', () => {
    const misses = Array.from({ length: 8 }, (_, k) => k + 1).flatMap((seed) => {
      const next = rng(seed * 31);
      const a: Rgb = [
        40 + Math.floor(next() * 170),
        40 + Math.floor(next() * 170),
        40 + Math.floor(next() * 170),
      ];
      const b: Rgb = [255 - a[0], a[2], a[1]];
      const r = drawing(seed, a, b);
      const reads: ReadonlyArray<readonly [string, Rgb, Rgb]> = [
        ['left', measuredPaint(r, { x: -6, y: 2, width: 30, height: 30 }), a],
        ['right', measuredPaint(r, { x: 34, y: 20, width: 40, height: 40 }), b],
      ];
      return reads
        .filter(([, got, want]) => deltaE(got, want) > 2)
        .map(([side, got, want]) => `seed ${seed}: ${side} ${hexOf(got)} for ${hexOf(want)}`);
    });
    expect(misses).toEqual([]);
  });
});

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
