import * as BunServices from '@effect/platform-bun/BunServices';
import { describe, expect, test } from 'bun:test';
import { Effect, FileSystem, Option, Schema } from 'effect';
import { it } from 'effect-bun-test';
import type { ViewName } from '../render.ts';
import {
  COVER,
  keptPaint,
  probeReach,
  uncovered,
  witnessText,
  type KeptPaint,
  type Witness,
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

/** How many flat colours the lead's coverage lets go with no probe, each with its reason. */
const LEAD_EXEMPTIONS = 0;

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
          (raster) => [view, keptPaint(raster)] as const,
        ),
      );
      return { probes, coverage, kept: new Map<ViewName, KeptPaint>(kept) };
    }).pipe(Effect.provide(BunServices.layer)),
  ),
);

/** Every uncovered witness of every view, named `<view> region <x,y> [x, y, w, h] Lab L a b`. */
const gaps = (
  kept: ReadonlyMap<ViewName, KeptPaint>,
  probes: ColourProbes,
  coverage: ColourCoverage,
): ReadonlyArray<string> =>
  VIEWS.flatMap((view) =>
    Option.match(Option.fromUndefinedOr(kept.get(view)), {
      onNone: () => [`${view} not read`],
      onSome: (paint) =>
        uncovered(paint, probes.views[view], coverage.exempt[view]).map(
          (w) => `${view} ${witnessText(paint, w)}`,
        ),
    }),
  );

/** Each probe of a view that alone covers some witness, with those witnesses: no other probe of their region lies within the colour bar of them. */
const soleCovers = (
  paint: KeptPaint,
  list: ReadonlyArray<ColourProbe>,
): ReadonlyArray<{ readonly probe: ColourProbe; readonly witnesses: ReadonlyArray<Witness> }> => {
  const reach = list.flatMap((probe) =>
    Option.toArray(Option.map(probeReach(paint, probe), (p) => ({ probe, ...p }))),
  );
  const sole = new Map<ColourProbe, Array<Witness>>();
  for (const w of paint.witnesses) {
    const by = reach.filter((p) => p.regions.has(w.region) && deltaLab(p.lab, w.lab) <= COVER);
    for (const p of by.filter(() => by.length === 1))
      sole.set(p.probe, [...(sole.get(p.probe) ?? []), w]);
  }
  return [...sole].map(([probe, witnesses]) => ({ probe, witnesses }));
};

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

describe("a kept view's flat witnesses", () => {
  test('are every 4 px box on the 2 px grid inside the outline, 2 px clear of ink and flat by the probes rule, each in the region of its side of the line', () => {
    const { w, h } = SYNTHETIC;
    const rgba = new Uint8Array(w * h * 4);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) rgba.set([...syntheticAt(x, y), 255], (y * w + x) * 4);
    const raster: Raster = { width: w, height: h, rgba };
    const clear = (x0: number, y0: number): boolean => {
      for (let y = y0 - 2; y <= y0 + 5; y++)
        for (let x = x0 - 2; x <= x0 + 5; x++) if (syntheticInk(x, y)) return false;
      return syntheticInside(x0, y0) && syntheticInside(x0 + 3, y0 + 3);
    };
    const expected: Array<string> = [];
    for (let y0 = 0; y0 + 4 <= h; y0 += 2)
      for (let x0 = 0; x0 + 4 <= w; x0 += 2) {
        const box = { x0, y0, x1: x0 + 3, y1: y0 + 3 };
        if (clear(x0, y0) && Option.isSome(flatMedian(raster, box)))
          expected.push(`${x0},${y0} ${['right', 'left'][Number(x0 < 22)]}`);
      }
    const paint = keptPaint(raster);
    const left = paint.witnesses.filter((v) => v.box.x0 < 22).map((v) => v.region);
    expect(
      paint.witnesses.map(
        (v) => `${v.box.x0},${v.box.y0} ${['right', 'left'][Number(v.region === left[0])]}`,
      ),
    ).toEqual(expected);
    expect(new Set(paint.witnesses.map((v) => v.region)).size).toBe(2);
    expect(expected.filter((e) => e.endsWith('right')).length).toBeGreaterThan(30);
    const span = paint.witnesses.map((v) => {
      const ls = [v.box.x0, v.box.x1].map((x) => lab(syntheticAt(x, v.box.y0))[0]);
      return Math.abs((ls[0] ?? 0) - (ls[1] ?? 0));
    });
    expect(Math.max(...span)).toBeGreaterThan(PROBE_FLAT);
    expect(expected.some((e) => e.startsWith('10,26'))).toBe(false);
  });
});

describe("the lead's colour coverage of the kept views' flat paints", () => {
  it.effect(
    'every flat witness of every kept view has a probe in its region within the colour bar of it, or an exemption with its reason; deleting any probe that alone covers a witness leaves that witness uncovered',
    () =>
      Effect.gen(function* () {
        const { probes, coverage, kept } = yield* lead;
        const exemptions = VIEWS.reduce((n, view) => n + coverage.exempt[view].length, 0);
        expect({ uncovered: gaps(kept, probes, coverage), exemptions }).toEqual({
          uncovered: [],
          exemptions: LEAD_EXEMPTIONS,
        });
        const sole = VIEWS.map((view) =>
          Option.match(Option.fromUndefinedOr(kept.get(view)), {
            onNone: () => ({ view, probes: 0, kept: [`${view} not read`] }),
            onSome: (paint) => {
              const list = probes.views[view];
              const covers = soleCovers(paint, list);
              const stayed = covers.flatMap(({ probe, witnesses }) => {
                const only = { ...paint, witnesses };
                const left = uncovered(
                  only,
                  list.filter((p) => p !== probe),
                  coverage.exempt[view],
                );
                return [`${view} ${probe.id}`].filter(() => left.length !== witnesses.length);
              });
              return { view, probes: covers.length, kept: stayed };
            },
          }),
        );
        expect(sole.flatMap((s) => s.kept)).toEqual([]);
        expect(Math.min(...sole.map((s) => s.probes))).toBeGreaterThan(20);
      }),
  );

  it.effect(
    "an exemption lets go the witnesses of its region within the colour bar of its colour, and no other region's",
    () =>
      Effect.gen(function* () {
        const { probes, kept } = yield* lead;
        const paint = Option.getOrThrow(Option.fromUndefinedOr(kept.get('front')));
        const list = probes.views.front;
        const [first] = soleCovers(paint, list);
        const { probe, witnesses } = Option.getOrThrow(Option.fromUndefinedOr(first));
        const w = Option.getOrThrow(Option.fromUndefinedOr(witnesses[0]));
        const left = list.filter((p) => p !== probe);
        const at = [w.box.x0, w.box.y0] as const;
        const exempt = (lab: readonly [number, number, number]) => [
          { at, lab, reason: 'a test exemption' },
        ];
        expect(uncovered(paint, left, exempt(w.lab))).not.toContainEqual(w);
        expect(uncovered(paint, left, exempt([w.lab[0] + 4, w.lab[1], w.lab[2]]))).toContainEqual(
          w,
        );
        const elsewhere = paint.witnesses.find((v) => v.region !== w.region);
        const away = Option.getOrThrow(Option.fromUndefinedOr(elsewhere));
        expect(
          uncovered(paint, left, [{ at: [away.box.x0, away.box.y0], lab: w.lab, reason: 'away' }]),
        ).toContainEqual(w);
      }),
  );
});
