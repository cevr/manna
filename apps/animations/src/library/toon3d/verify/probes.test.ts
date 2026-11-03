import * as BunServices from '@effect/platform-bun/BunServices';
import { describe, expect, test } from 'bun:test';
import { Effect, FileSystem, Option, Result, Schema } from 'effect';
import { it } from 'effect-bun-test';
import { PART } from '../figure.ts';
import type { ViewName } from '../render.ts';
import { BARS } from './bars.ts';
import {
  deltaE,
  figureMask,
  flatMedian,
  PROBE_FLAT,
  probeDelta,
  rgbOf,
  type Box,
  type ProbeRead,
  type Raster,
  type Rgb,
} from './measures.ts';
import { decode, readProbes, VIEWS } from './pipeline.ts';
import {
  ColourCoverageJson,
  ColourProbesJson,
  probeAt,
  probeBox,
  ProbePaint,
  ProbePart,
  type ColourProbe,
  type ProbedPaint,
  type CoverageEntry,
} from './probes.ts';
import { probesFile } from './run.ts';
import { verdictOf, type CheckVerdict, type Measured } from './verdict.ts';

const PAPER = rgbOf('#fdf1d9');
const INK = rgbOf('#2c1b10');
const BASE = rgbOf('#f9dbb6');
const SHADE = rgbOf('#b07a5a');

const paint = (w: number, h: number, at: (x: number, y: number) => Rgb): Raster => {
  const rgba = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const c = at(x, y);
      rgba.set([c[0], c[1], c[2], 255], (y * w + x) * 4);
    }
  return { width: w, height: h, rgba };
};

const idsOf = (w: number, h: number, at: (x: number, y: number) => number): Raster =>
  paint(w, h, (x, y) => {
    const g = at(x, y) * 12;
    return [g, g, g];
  });

const inRect = (x: number, y: number, b: Box): boolean =>
  x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1;

/** A seeded generator of numbers in [0, 1) (mulberry32), so a generated case fails the same way each run. */
const seeded = (seed: number) => {
  let s = seed >>> 0;
  return (): number => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/** A whole number in [lo, hi] drawn from `r`. */
const between = (r: () => number, lo: number, hi: number): number =>
  lo + Math.floor(r() * (hi - lo + 1));

/** One of `xs`, drawn from `r`. */
const oneOf = <A>(r: () => number, xs: ReadonlyArray<A>): A =>
  Option.getOrThrow(Option.fromUndefinedOr(xs[Math.floor(r() * xs.length)]));

const COLOUR_BAR = BARS.filter((b) => b.id === 'colour');

/** The colour check's verdict over one view's probe readings. */
const colourCheck = (reads: ReadonlyArray<ProbeRead>): CheckVerdict => {
  const measured: Measured = {
    renders: { compared: 0, differing: [] },
    views: [
      {
        view: 'front',
        iou: 1,
        probes: reads.map((read, k) => ({ at: `front body base #${k}`, read })),
        flatness: [],
        keptHairBlobs: 0,
        inkWidth: 8,
        keptInkWidth: 8,
        inkDeltaE: Option.some(0),
      },
    ],
    frontRows: Option.none(),
    face: Option.none(),
    bend: [],
    turn: [],
  };
  return Option.getOrThrow(Option.fromUndefinedOr(verdictOf(COLOUR_BAR, measured).checks[0]));
};

const ok = (read: ProbeRead): number =>
  Result.getOrThrowWith(read, (why) => `expected a reading, got ${why}`);

const why = (read: ProbeRead): string =>
  Result.match(read, { onSuccess: (d) => `read ${d}`, onFailure: (w) => w });

/** A 40 × 40 picture: a 30 × 30 body of `fill` inked round on paper. */
const body = (fill: (x: number, y: number) => Rgb): Raster =>
  paint(40, 40, (x, y) => {
    if (x >= 5 && x <= 34 && y >= 5 && y <= 34) return fill(x, y);
    if (x >= 3 && x <= 36 && y >= 3 && y <= 36) return INK;
    return PAPER;
  });

const BODY_IDS = idsOf(
  40,
  40,
  (x, y) => PART.body * Number(x >= 5 && x <= 34 && y >= 5 && y <= 34),
);
const PROBE: Box = { x0: 12, y0: 12, x1: 21, y1: 21 };

describe('probeDelta', () => {
  test('a probe whose box the render paints as the kept does reads 0', () => {
    expect(
      ok(
        probeDelta(
          body(() => BASE),
          body(() => BASE),
          BODY_IDS,
          PART.body,
          PROBE,
        ),
      ),
    ).toBe(0);
  });

  test('a probe painted a known colour off the kept reads that ΔE, slight or gross', () => {
    for (const off of [
      [BASE[0] - 4, BASE[1], BASE[2]],
      [BASE[0] - 40, BASE[1] - 40, BASE[2]],
      SHADE,
      [40, 160, 60],
    ] satisfies ReadonlyArray<Rgb>)
      expect(
        ok(
          probeDelta(
            body(() => BASE),
            body(() => off),
            BODY_IDS,
            PART.body,
            PROBE,
          ),
        ),
      ).toBeCloseTo(deltaE(BASE, off), 3);
  });

  test('a probe whose render box shows another part, at one pixel or all, is unread', () => {
    const one = idsOf(40, 40, (x, y) => {
      if (x === 21 && y === 21) return PART.mantle;
      return PART.body * Number(x >= 5 && x <= 34 && y >= 5 && y <= 34);
    });
    const all = idsOf(
      40,
      40,
      (x, y) => PART.mantle * Number(x >= 5 && x <= 34 && y >= 5 && y <= 34),
    );
    for (const ids of [one, all])
      expect(
        why(
          probeDelta(
            body(() => BASE),
            body(() => BASE),
            ids,
            PART.body,
            PROBE,
          ),
        ),
      ).toBe('other part');
  });

  test('a probe whose render box is not one flat colour is unread, though its median matches', () => {
    const speck = body((x, y) => {
      if (x === 12 && y === 12) return SHADE;
      return BASE;
    });
    const stripes = body((x) => {
      if (x % 2 === 0) return SHADE;
      return BASE;
    });
    for (const scene of [speck, stripes])
      expect(
        why(
          probeDelta(
            body(() => BASE),
            scene,
            BODY_IDS,
            PART.body,
            PROBE,
          ),
        ),
      ).toBe('render not flat');
  });

  test('a probe whose kept box is not flat, or that leaves the picture, is unread', () => {
    const stripes = body((x) => {
      if (x % 2 === 0) return SHADE;
      return BASE;
    });
    expect(
      why(
        probeDelta(
          stripes,
          body(() => BASE),
          BODY_IDS,
          PART.body,
          PROBE,
        ),
      ),
    ).toBe('kept not flat');
    expect(
      why(
        probeDelta(
          body(() => BASE),
          body(() => BASE),
          BODY_IDS,
          PART.body,
          {
            x0: 35,
            y0: 12,
            x1: 44,
            y1: 21,
          },
        ),
      ),
    ).toBe('outside the picture');
  });
});

describe('readProbes', () => {
  test('reads every probe of a view at its own part and box, each named by view, part, paint and index', () => {
    const ids = idsOf(40, 40, (x, y) => {
      if (!(x >= 5 && x <= 34 && y >= 5 && y <= 34)) return 0;
      if (x < 20) return PART.mantle;
      return PART.body;
    });
    const kept = body(() => BASE);
    const scene = body((x) => {
      if (x < 20) return BASE;
      return SHADE;
    });
    const probes: ReadonlyArray<ColourProbe> = [
      { id: 'a', part: 'mantle', paint: 'base', box: [8, 10, 8, 8] },
      { id: 'b', part: 'body', paint: 'shade', box: [24, 10, 8, 8] },
      { id: 'c', part: 'body', paint: 'base', box: [10, 24, 8, 8] },
    ];
    const read = readProbes('back', probes, kept, scene, ids).map((p) => ({
      at: p.at,
      read: why(p.read),
    }));
    expect(read).toEqual([
      { at: 'back mantle base #0', read: 'read 0' },
      { at: 'back body shade #1', read: `read ${deltaE(BASE, SHADE)}` },
      { at: 'back body base #2', read: 'other part' },
    ]);
  });
});

describe('the colour check over probes', () => {
  test('one matched probe never hides another: an off probe fails with its ΔE, an unread one fails as unread', () => {
    expect(colourCheck([Result.succeed(0), Result.succeed(5.2)])).toMatchObject({
      pass: false,
      value: '5.2',
      at: 'front body base #1',
    });
    expect(colourCheck([Result.succeed(0), Result.fail('render not flat')])).toMatchObject({
      pass: false,
      value: 'unread',
      at: 'front body base #1 (render not flat)',
    });
    expect(colourCheck([Result.succeed(0), Result.succeed(2.9)])).toMatchObject({
      pass: true,
      value: '2.9',
    });
  });

  test('round 2: a base body repainted its shade from the left on any width from 5 to 55 of 60 columns fails, though the base probes left match', () => {
    const ids = idsOf(
      80,
      80,
      (x, y) => PART.body * Number(x >= 10 && x <= 69 && y >= 10 && y <= 69),
    );
    const fig = (fill: (x: number) => Rgb) =>
      paint(80, 80, (x, y) => {
        if (x >= 10 && x <= 69 && y >= 10 && y <= 69) return fill(x);
        if (x >= 8 && x <= 71 && y >= 8 && y <= 71) return INK;
        return PAPER;
      });
    const kept = fig(() => BASE);
    const probes: ReadonlyArray<Box> = [14, 34, 54].map((x0) => ({
      x0,
      y0: 30,
      x1: x0 + 9,
      y1: 39,
    }));
    const passed = Array.from({ length: 51 }, (_, k) => k + 5).filter((width) => {
      const scene = fig((x) => {
        if (x < 10 + width) return SHADE;
        return BASE;
      });
      return colourCheck(probes.map((b) => probeDelta(kept, scene, ids, PART.body, b))).pass;
    });
    expect(passed).toEqual([]);
  });

  test('round 3: a shade the kept shows that the render cannot read fails as unread, though the base beside it reads 0', () => {
    const ids = idsOf(
      80,
      80,
      (x, y) => PART.body * Number(x >= 10 && x <= 69 && y >= 10 && y <= 69),
    );
    const fig = (left: (x: number) => Rgb) =>
      paint(80, 80, (x, y) => {
        if (x >= 10 && x <= 69 && y >= 10 && y <= 69) {
          if (x < 40) return left(x);
          return BASE;
        }
        if (x >= 8 && x <= 71 && y >= 8 && y <= 71) return INK;
        return PAPER;
      });
    const kept = fig(() => SHADE);
    const scene = fig((x) => {
      if (x % 2 === 0) return SHADE;
      return BASE;
    });
    const shade: Box = { x0: 18, y0: 30, x1: 27, y1: 39 };
    const base: Box = { x0: 50, y0: 30, x1: 59, y1: 39 };
    const reads = [
      probeDelta(kept, scene, ids, PART.body, base),
      probeDelta(kept, scene, ids, PART.body, shade),
    ];
    expect(ok(reads[0] ?? Result.fail('other part'))).toBe(0);
    expect(colourCheck(reads)).toMatchObject({ pass: false, value: 'unread' });
  });

  test('generated probes and renders: the check fails whenever any probe is off or unread, whatever the others read, and its value is the worst', () => {
    const r = seeded(11);
    const kinds = { matched: 0, near: 0, off: 0, otherPart: 0, notFlat: 0, masked: 0, passed: 0 };
    for (let n = 0; n < 160; n++) {
      const count = between(r, 1, 6);
      const cells = [0, 1, 2, 3, 4, 5, 6, 7, 8].sort(() => r() - 0.5).slice(0, count);
      const cases = cells.map((cell) => {
        const cx = 2 + (cell % 3) * 20;
        const cy = 2 + Math.floor(cell / 3) * 20;
        const size = between(r, 6, 12);
        const x0 = between(r, cx + 1, cx + 17 - size);
        const y0 = between(r, cy + 1, cy + 17 - size);
        const box: Box = { x0, y0, x1: x0 + size - 1, y1: y0 + size - 1 };
        const kept: Rgb = [between(r, 60, 240), between(r, 60, 240), between(r, 60, 240)];
        const kind = oneOf(r, ['matched', 'near', 'off', 'otherPart', 'notFlat'] as const);
        const shift = Math.round((r() - 0.5) * 2 * oneOf(r, [3, 30]));
        const scene: Rgb = [
          Math.min(255, Math.max(0, kept[0] + shift * Number(kind === 'near' || kind === 'off'))),
          kept[1],
          kept[2],
        ];
        const speck: readonly [number, number] = [between(r, x0, box.x1), between(r, y0, box.y1)];
        return { cell, cx, cy, box, kept, scene, kind, speck, part: between(r, 1, 16) };
      });
      const cellOf = (x: number, y: number) =>
        Option.fromUndefinedOr(
          cases.find((c) => x >= c.cx && x < c.cx + 20 && y >= c.cy && y < c.cy + 20),
        );
      const keptPic = paint(64, 64, (x, y) =>
        Option.match(cellOf(x, y), { onNone: () => PAPER, onSome: (c) => c.kept }),
      );
      const scenePic = paint(64, 64, (x, y) =>
        Option.match(cellOf(x, y), {
          onNone: () => PAPER,
          onSome: (c): Rgb => {
            if (c.kind === 'notFlat' && x === c.speck[0] && y === c.speck[1]) return INK;
            if (inRect(x, y, c.box)) return c.scene;
            return c.kept;
          },
        }),
      );
      const ids = idsOf(64, 64, (x, y) =>
        Option.match(cellOf(x, y), {
          onNone: () => 0,
          onSome: (c) => {
            if (c.kind === 'otherPart' && x === c.speck[0] && y === c.speck[1])
              return (c.part % 16) + 1;
            return c.part;
          },
        }),
      );
      const reads = cases.map((c) => probeDelta(keptPic, scenePic, ids, c.part, c.box));
      const unread = cases.some((c) => c.kind === 'otherPart' || c.kind === 'notFlat');
      const worst = Math.max(...cases.map((c) => deltaE(c.kept, c.scene)));
      const check = colourCheck(reads);
      for (const c of cases) kinds[c.kind]++;
      const failing = unread || worst > 3;
      if (failing && cases.some((c) => c.kind === 'matched')) kinds.masked++;
      if (!failing) kinds.passed++;
      const value = Option.match(
        Option.liftPredicate(unread, (u) => u),
        {
          onSome: () => 'unread',
          onNone: () => String(Number(worst.toFixed(3))),
        },
      );
      expect({ n, pass: check.pass, value: check.value }).toEqual({ n, pass: !failing, value });
    }
    expect(Math.min(...Object.values(kinds))).toBeGreaterThanOrEqual(20);
  });
});

/** Each of a view's probes that is not 4 to 20 px a side, inside the figure and flat in the kept view, named with why. */
const badProbes = (
  view: ViewName,
  kept: Raster,
  list: ReadonlyArray<ColourProbe>,
): ReadonlyArray<string> => {
  const figure = figureMask(kept);
  return list.flatMap((probe, k) => {
    const box = probeBox(probe);
    const [, , w, h] = probe.box;
    let inside = w >= 4 && h >= 4 && w <= 20 && h <= 20;
    for (let y = box.y0; y <= box.y1 && inside; y++)
      for (let x = box.x0; x <= box.x1; x++)
        inside = inside && x < kept.width && y < kept.height && figure[y * kept.width + x] === 1;
    if (!inside) return [`${probeAt(view, probe, k)} outside the figure`];
    if (Option.isNone(flatMedian(kept, box)))
      return [`${probeAt(view, probe, k)} not flat within ΔE ${PROBE_FLAT}`];
    return [];
  });
};

describe("the lead's authored colour probes", () => {
  it.effect(
    'every probe box lies inside the figure and is flat in its kept view, and each view has probes',
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const probes = yield* Schema.decodeEffect(ColourProbesJson)(
          yield* fs.readFileString(probesFile('lead-feast')),
        );
        const bad = yield* Effect.forEach(VIEWS, (view) =>
          Effect.gen(function* () {
            const kept = yield* decode(
              yield* fs.readFile(
                `${import.meta.dir}/../../cast/lead-feast/cast-sheet/views/${view}.png`,
              ),
            );
            const list = probes.views[view];
            if (list.length === 0) return [`${view} has no probes`];
            return badProbes(view, kept, list);
          }),
        );
        expect(bad.flat()).toEqual([]);
      }).pipe(Effect.provide(BunServices.layer)),
  );
});

/** A view's coverage entries that name probes. */
const probedOf = (shown: ReadonlyArray<CoverageEntry>): ReadonlyArray<ProbedPaint> =>
  shown.filter((entry): entry is ProbedPaint => 'probes' in entry);

/** Each way a view's coverage and its probes disagree: a probe id used twice, a (part, paint) listed twice, a probed paint naming a probe the view lacks or one of another part or paint, or a probe no shown paint names. */
const coverageGaps = (
  view: ViewName,
  shown: ReadonlyArray<CoverageEntry>,
  probes: ReadonlyArray<ColourProbe>,
): ReadonlyArray<string> => {
  const byId = new Map(probes.map((probe) => [probe.id, probe] as const));
  const ids = probes.map((probe) => probe.id);
  const keys = shown.map((entry) => `${entry.part} ${entry.paint}`);
  const named = new Set(probedOf(shown).flatMap((entry) => entry.probes));
  return [
    ...ids.filter((id, k) => ids.indexOf(id) !== k).map((id) => `${view} probe ${id} used twice`),
    ...keys.filter((key, k) => keys.indexOf(key) !== k).map((key) => `${view} ${key} listed twice`),
    ...probedOf(shown).flatMap((entry) =>
      entry.probes.flatMap((id) =>
        Option.match(Option.fromUndefinedOr(byId.get(id)), {
          onNone: () => [`${view} ${entry.part} ${entry.paint} names missing probe ${id}`],
          onSome: (probe) =>
            [
              `${view} ${entry.part} ${entry.paint} names ${id}, a ${probe.part} ${probe.paint} probe`,
            ].filter(() => probe.part !== entry.part || probe.paint !== entry.paint),
        }),
      ),
    ),
    ...ids.filter((id) => !named.has(id)).map((id) => `${view} probe ${id} is in no shown paint`),
  ];
};

/** Every (part, paint) a view's coverage must decide, probed or unavailable. */
const GRID = ProbePart.literals
  .flatMap((part) => ProbePaint.literals.map((paint) => `${part} ${paint}`))
  .toSorted();

/** The lead's authored probes and reviewed coverage, decoded. */
const leadData = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const probes = yield* Schema.decodeEffect(ColourProbesJson)(
    yield* fs.readFileString(probesFile('lead-feast')),
  );
  const coverage = yield* Schema.decodeEffect(ColourCoverageJson)(
    yield* fs.readFileString(
      `${import.meta.dir}/../../cast/lead-feast/cast-sheet/colour-coverage.json`,
    ),
  );
  return { probes, coverage };
}).pipe(Effect.provide(BunServices.layer));

describe("the lead's colour coverage", () => {
  it.effect(
    'decides every (part, paint) of every view once, and each probed paint names probes of that part and paint that the view has, and every probe is named',
    () =>
      Effect.gen(function* () {
        const { probes, coverage } = yield* leadData;
        for (const view of VIEWS) {
          const shown = coverage.views[view];
          expect(shown.map((entry) => `${entry.part} ${entry.paint}`).toSorted()).toEqual(GRID);
          expect(coverageGaps(view, shown, probes.views[view])).toEqual([]);
        }
      }),
  );

  it.effect("deleting a paint's last probe, in any view, leaves a gap naming that paint", () =>
    Effect.gen(function* () {
      const { probes, coverage } = yield* leadData;
      const missed = VIEWS.flatMap((view) =>
        probedOf(coverage.views[view]).flatMap((entry) => {
          const left = probes.views[view].filter((probe) => !entry.probes.includes(probe.id));
          const gaps = coverageGaps(view, coverage.views[view], left);
          const named = gaps.some((gap) =>
            gap.startsWith(`${view} ${entry.part} ${entry.paint} names missing probe`),
          );
          return [`${view} ${entry.part} ${entry.paint}`].filter(() => !named);
        }),
      );
      expect(missed).toEqual([]);
      const front = probes.views.front.filter((probe) => probe.id !== 'mantle.shade.0');
      expect(coverageGaps('front', coverage.views.front, front)).toEqual([
        'front mantle shade names missing probe mantle.shade.0',
      ]);
    }),
  );

  it.effect(
    'a probe no shown paint names, or a shown paint naming a probe of another paint, is a gap',
    () =>
      Effect.gen(function* () {
        const { probes, coverage } = yield* leadData;
        const extra: ColourProbe = {
          id: 'hair.shade.9',
          part: 'hair',
          paint: 'shade',
          box: [185, 80, 8, 8],
        };
        expect(coverageGaps('front', coverage.views.front, [...probes.views.front, extra])).toEqual(
          ['front probe hair.shade.9 is in no shown paint'],
        );
        const relabelled = probes.views.front.map((probe) =>
          Object.assign({}, probe, { paint: 'base' as const }),
        );
        expect(coverageGaps('front', coverage.views.front, relabelled)).toContain(
          'front hair shade names hair.shade.0, a hair base probe',
        );
      }),
  );
});
