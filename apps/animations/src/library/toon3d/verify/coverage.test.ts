import * as BunServices from '@effect/platform-bun/BunServices';
import { describe, expect, test } from 'bun:test';
import { Effect, FileSystem, Option, Schema } from 'effect';
import { it } from 'effect-bun-test';
import type { ViewName } from '../render.ts';
import {
  COVER,
  coverOf,
  keptPaint,
  PATCH_FLOOR,
  patchesOf,
  patchText,
  uncoveredPatches,
  type KeptPaint,
  type Patch,
} from './coverage.ts';
import { deltaLab, flatMedian, lab, PROBE_FLAT, rgbOf, type Raster, type Rgb } from './measures.ts';
import { decode, VIEWS } from './pipeline.ts';
import {
  ColourCoverageJson,
  ColourProbesJson,
  type ColourCoverage,
  type ColourProbe,
  type ColourProbes,
} from './probes.ts';
import { probesFile } from './run.ts';

/** How many flat patches the lead's coverage lets go with no probe, each with its reason. */
const LEAD_EXEMPTIONS = 0;

/** A kept view read for coverage, with its patches. */
interface Read {
  readonly paint: KeptPaint;
  readonly patches: ReadonlyArray<Patch>;
}

/** The lead's probes, coverage and each kept view read for coverage, read as the file loads for every case. */
const lead = Effect.succeed(
  // oxlint-disable-next-line effect/noAsyncFunction -- read once as the file loads, so no case pays for it inside its time limit
  await Effect.runPromise(
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const probes = yield* Schema.decodeEffect(ColourProbesJson)(
        yield* fs.readFileString(probesFile('lead-feast')),
      );
      const coverage = yield* Schema.decodeEffect(ColourCoverageJson)(
        yield* fs.readFileString(
          `${import.meta.dir}/../../cast/lead-feast/cast-sheet/colour-coverage.json`,
        ),
      );
      const kept = yield* Effect.forEach(VIEWS, (view) =>
        Effect.map(
          Effect.flatMap(
            fs.readFile(`${import.meta.dir}/../../cast/lead-feast/cast-sheet/views/${view}.png`),
            decode,
          ),
          (raster): readonly [ViewName, Read] => {
            const paint = keptPaint(raster);
            return [view, { paint, patches: patchesOf(paint) }];
          },
        ),
      );
      return { probes, coverage, kept: new Map<ViewName, Read>(kept) };
    }).pipe(Effect.provide(BunServices.layer)),
  ),
);

/** A view's read, which the lead's load holds for every view. */
const readOf = (kept: ReadonlyMap<ViewName, Read>, view: ViewName): Read =>
  Option.getOrThrow(Option.fromUndefinedOr(kept.get(view)));

/** Every uncovered patch at or above the floor of every view, named `<view> patch [x, y, w, h] Lab L a b area n bounds [x, y, w, h]`. */
const gaps = (
  kept: ReadonlyMap<ViewName, Read>,
  probes: ColourProbes,
  coverage: ColourCoverage,
): ReadonlyArray<string> =>
  VIEWS.flatMap((view) => {
    const { paint, patches } = readOf(kept, view);
    return uncoveredPatches(
      paint,
      patches,
      probes.views[view],
      coverage.exempt[view],
      PATCH_FLOOR,
    ).map((p) => `${view} ${patchText(paint, p)}`);
  });

/** The patch of a view holding the witness whose box starts at (x, y). */
const patchAt = (read: Read, x: number, y: number): Option.Option<Patch> =>
  Option.fromUndefinedOr(
    read.patches.find((p) => p.witnesses.some((w) => w.box.x0 === x && w.box.y0 === y)),
  );

/** The hand shades round 6's finding showed covered only by head probes far off: the view, the hand and a witness box of the shade. */
const ROUND_6_HANDS = [
  { view: 'front', part: 'handL', at: [226, 436] },
  { view: 'profileRight', part: 'handR', at: [66, 430] },
] as const;

/** A 48 × 40 figure on paper: a 2 px ink outline round x 4 to 43, y 4 to 35; an ink line at x 22 and 23 splits a flat skin left (with a checker of skin and its shade at x 8 to 15, y 24 to 31) from a blue right that darkens across x. */
const SYNTHETIC = { w: 48, h: 40 };

/** Whether (x, y) of the synthetic figure is ink: its outline or its splitting line. */
const syntheticInk = (x: number, y: number): boolean =>
  (x >= 4 && x <= 43 && y >= 4 && y <= 35 && (x <= 5 || x >= 42 || y <= 5 || y >= 34)) ||
  ((x === 22 || x === 23) && y >= 4 && y <= 35);

/** Whether (x, y) of the synthetic figure lies inside its outline. */
const syntheticInside = (x: number, y: number): boolean => x >= 4 && x <= 43 && y >= 4 && y <= 35;

/** The synthetic figure's colour at (x, y). */
const syntheticAt = (x: number, y: number): Rgb => {
  if (syntheticInk(x, y)) return rgbOf('#140a05');
  if (!syntheticInside(x, y)) return rgbOf('#fdf1d9');
  if (x < 22 && x >= 8 && x <= 15 && y >= 24 && y <= 31 && (x + y) % 2 === 0)
    return rgbOf('#b07a5a');
  if (x < 22) return rgbOf('#f9dbb6');
  const t = (x - 24) / 17;
  return [Math.round(150 - 110 * t), Math.round(190 - 110 * t), Math.round(220 - 110 * t)];
};

/** The synthetic figure drawn. */
const synthetic = (): Raster => {
  const { w, h } = SYNTHETIC;
  const rgba = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) rgba.set([...syntheticAt(x, y), 255], (y * w + x) * 4);
  return { width: w, height: h, rgba };
};

/** Whether two witness boxes overlap or touch. */
const touch = (a: Patch['seed'], b: Patch['seed']): boolean =>
  a.box.x0 <= b.box.x1 + 1 &&
  b.box.x0 <= a.box.x1 + 1 &&
  a.box.y0 <= b.box.y1 + 1 &&
  b.box.y0 <= a.box.y1 + 1;

describe("a kept view's flat witnesses and patches", () => {
  test('the witnesses are every 4 px box on the 2 px grid inside the outline, 2 px clear of ink and flat by the probes rule', () => {
    const { w, h } = SYNTHETIC;
    const raster = synthetic();
    const clear = (x0: number, y0: number): boolean => {
      for (let y = y0 - 2; y <= y0 + 5; y++)
        for (let x = x0 - 2; x <= x0 + 5; x++) if (syntheticInk(x, y)) return false;
      return syntheticInside(x0, y0) && syntheticInside(x0 + 3, y0 + 3);
    };
    const expected: Array<string> = [];
    for (let y0 = 0; y0 + 4 <= h; y0 += 2)
      for (let x0 = 0; x0 + 4 <= w; x0 += 2) {
        const box = { x0, y0, x1: x0 + 3, y1: y0 + 3 };
        if (clear(x0, y0) && Option.isSome(flatMedian(raster, box))) expected.push(`${x0},${y0}`);
      }
    const paint = keptPaint(raster);
    expect(paint.witnesses.map((v) => `${v.box.x0},${v.box.y0}`)).toEqual(expected);
    expect(expected.filter((e) => Number(e.split(',')[0]) > 22).length).toBeGreaterThan(30);
    const span = paint.witnesses.map((v) => {
      const ls = [v.box.x0, v.box.x1].map((x) => lab(syntheticAt(x, v.box.y0))[0]);
      return Math.abs((ls[0] ?? 0) - (ls[1] ?? 0));
    });
    expect(Math.max(...span)).toBeGreaterThan(PROBE_FLAT);
    expect(expected.some((e) => e.startsWith('10,26'))).toBe(false);
  });

  test('the patches part the witnesses into areas joined box to box, each within the bar of its seed: the flat skin is one patch, the line splits it from the blue, and the blue gradient is cut into several', () => {
    const paint = keptPaint(synthetic());
    const patches = patchesOf(paint);
    const held = patches.flatMap((p) => p.witnesses);
    expect(held.length).toBe(paint.witnesses.length);
    expect(new Set(held).size).toBe(paint.witnesses.length);
    expect(
      patches.filter((p) => p.witnesses.some((v) => deltaLab(v.lab, p.seed.lab) > COVER)),
    ).toEqual([]);
    const linked = (p: Patch): boolean => {
      const reached = new Set([p.seed]);
      const queue = [p.seed];
      for (let q = 0; q < queue.length; q++)
        for (const v of p.witnesses)
          if (!reached.has(v) && touch(v, queue[q] ?? p.seed)) {
            reached.add(v);
            queue.push(v);
          }
      return reached.size === p.witnesses.length;
    };
    expect(patches.filter((p) => !linked(p)).map((p) => patchText(paint, p))).toEqual([]);
    const sides = patches.map((p) => new Set(p.witnesses.map((v) => v.box.x0 < 22)));
    expect(sides.filter((s) => s.size !== 1)).toEqual([]);
    expect(sides.filter((s) => s.has(true)).length).toBe(1);
    expect(sides.filter((s) => s.has(false)).length).toBeGreaterThan(2);
    const pixels = patches.flatMap((p) => p.pixels);
    const boxes = new Set(
      paint.witnesses.flatMap((v) => {
        const out: Array<number> = [];
        for (let y = v.box.y0; y <= v.box.y1; y++)
          for (let x = v.box.x0; x <= v.box.x1; x++) out.push(y * paint.width + x);
        return out;
      }),
    );
    expect(new Set(pixels)).toEqual(boxes);
  });

  test("a probe covers only a patch its box overlaps, at a witness within the bar of the probe's colour", () => {
    const paint = keptPaint(synthetic());
    const patches = patchesOf(paint);
    const skin = patches.findIndex((p) => p.seed.box.x0 < 22);
    const blue = patches.findIndex((p) => p.seed.box.x0 > 22);
    const at = (x: number, y: number, part: ColourProbe['part']): ColourProbe => ({
      id: `${part}.base.0`,
      part,
      paint: 'base',
      box: [x, y, 4, 4],
    });
    const cover = coverOf(paint, patches, [at(10, 10, 'head')]);
    expect(cover.map((c) => c.length)).toEqual(patches.map((_, k) => Number(k === skin)));
    const seed = Option.getOrThrow(Option.fromUndefinedOr(patches[blue])).seed;
    const onBlue = coverOf(paint, patches, [at(seed.box.x0, seed.box.y0, 'body')]);
    expect(onBlue[blue]?.length).toBe(1);
    expect(onBlue[skin]?.length).toBe(0);
  });
});

describe("the lead's colour coverage of the kept views' flat patches", () => {
  it.effect(
    'every patch at or above the area floor in every kept view holds a probe within the colour bar, or an exemption with its reason; deleting any probe that alone covers a patch leaves that patch uncovered',
    () =>
      Effect.gen(function* () {
        const { probes, coverage, kept } = yield* lead;
        const exemptions = VIEWS.reduce((n, view) => n + coverage.exempt[view].length, 0);
        expect({ uncovered: gaps(kept, probes, coverage), exemptions }).toEqual({
          uncovered: [],
          exemptions: LEAD_EXEMPTIONS,
        });
        const sole = VIEWS.map((view) => {
          const { paint, patches } = readOf(kept, view);
          const list = probes.views[view];
          const cover = coverOf(paint, patches, list);
          const lone = patches.flatMap((patch, k) =>
            (cover[k] ?? [])
              .filter((_, __, all) => all.length === 1 && patch.pixels.length >= PATCH_FLOOR)
              .map((probe) => ({ probe, patch })),
          );
          const stayed = lone.flatMap(({ probe, patch }) =>
            [`${view} ${probe.id}`].filter(
              () =>
                uncoveredPatches(
                  paint,
                  [patch],
                  list.filter((p) => p !== probe),
                  coverage.exempt[view],
                  PATCH_FLOOR,
                ).length !== 1,
            ),
          );
          return { view, lone: lone.length, stayed };
        });
        expect(sole.flatMap((s) => s.stayed)).toEqual([]);
        expect(Math.min(...sole.map((s) => s.lone))).toBeGreaterThan(50);
      }),
  );

  it.effect(
    "round 6's hand shades lie in patches above the floor that a probe of the hand itself covers, and no probe of another part",
    () =>
      Effect.gen(function* () {
        const { probes, kept } = yield* lead;
        const rows = ROUND_6_HANDS.map(({ view, part, at }) => {
          const read = readOf(kept, view);
          const patch = Option.getOrThrow(patchAt(read, at[0], at[1]));
          const k = read.patches.indexOf(patch);
          const by = coverOf(read.paint, read.patches, probes.views[view])[k] ?? [];
          return {
            view,
            above: patch.pixels.length >= PATCH_FLOOR,
            parts: [...new Set(by.map((p) => p.part))],
            part,
          };
        });
        expect(rows.map(({ view, above, parts }) => ({ view, above, parts }))).toEqual(
          rows.map(({ view, part }) => ({ view, above: true, parts: [part] })),
        );
      }),
  );

  it.effect(
    'the area floor lies below every shown paint of a part: each probed paint of each view whose probes reach a patch holds a covered patch at or above it',
    () =>
      Effect.gen(function* () {
        const { probes, coverage, kept } = yield* lead;
        const rows = VIEWS.flatMap((view) => {
          const { paint, patches } = readOf(kept, view);
          const cover = coverOf(paint, patches, probes.views[view]);
          return coverage.views[view].flatMap((entry) => {
            if (!('probes' in entry)) return [];
            const areas = patches
              .filter((_, k) => (cover[k] ?? []).some((p) => entry.probes.includes(p.id)))
              .map((p) => p.pixels.length);
            return [
              { name: `${view} ${entry.part}.${entry.paint}`, largest: Math.max(...areas) },
            ].filter(() => areas.length > 0);
          });
        });
        expect(rows.filter((r) => r.largest < PATCH_FLOOR)).toEqual([]);
        expect(rows.length).toBeGreaterThan(140);
      }),
  );

  it.effect(
    'an exemption lets go the patch holding its pixel, within the colour bar of its colour, and no other',
    () =>
      Effect.gen(function* () {
        const { probes, kept } = yield* lead;
        const { paint, patches } = readOf(kept, 'front');
        const list = probes.views.front;
        const cover = coverOf(paint, patches, list);
        const k = patches.findIndex(
          (p, n) => p.pixels.length >= PATCH_FLOOR && cover[n]?.length === 1,
        );
        const patch = Option.getOrThrow(Option.fromUndefinedOr(patches[k]));
        const left = list.filter((p) => !(cover[k] ?? []).includes(p));
        const at = [patch.seed.box.x0 + 1, patch.seed.box.y0 + 1] as const;
        const exempt = (where: readonly [number, number], lab: Rgb) => [
          { at: where, lab, reason: 'a test exemption' },
        ];
        const still = (e: ReturnType<typeof exempt>): boolean =>
          uncoveredPatches(paint, [patch], left, e, PATCH_FLOOR).length === 1;
        expect(still([])).toBe(true);
        expect(still(exempt(at, patch.seed.lab))).toBe(false);
        expect(
          still(exempt(at, [patch.seed.lab[0] + 4, patch.seed.lab[1], patch.seed.lab[2]])),
        ).toBe(true);
        const away = Option.getOrThrow(
          Option.fromUndefinedOr(
            patches.find(
              (p) =>
                p !== patch &&
                deltaLab(p.seed.lab, patch.seed.lab) <= COVER &&
                !p.witnesses.some(
                  (v) =>
                    v.box.x0 <= at[0] &&
                    at[0] <= v.box.x1 &&
                    v.box.y0 <= at[1] &&
                    at[1] <= v.box.y1,
                ),
            ),
          ),
        );
        expect(still(exempt([away.seed.box.x0 + 1, away.seed.box.y0 + 1], patch.seed.lab))).toBe(
          true,
        );
      }),
  );
});
