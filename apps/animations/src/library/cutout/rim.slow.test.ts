// No cast member's puppet draws a paper rim. Each puppet view every member's
// `cutout/puppets.ts` exports (`PUPPETS`) under the app's sources is loaded
// as the film loads it (`puppetFrom`: its part PNGs un-matted from its paper
// with its own options, `core/unmatte.ts`), and its rim left is read against
// its cut part PNGs (`paperRimLeftOf`, `RIM_LEFT`): the pixels outside his
// outer ink the un-matte keeps whole in the paper's colour, which draw a torn
// white fringe round him on any other paper; his ground shadow's own pale
// paint is not rim (`RimLeft.shadow`). A view whose paint keeps a pale
// band outside its ink fails here, naming it and its count, until its cut
// table clears the band (`clearPaperRim` in its `CLEAN`). The views are read
// from the tree (`views.ts`), so a new member's are held with no edit here.
// Each case decodes a view's sheets, so they run in the slow suite.

import * as BunServices from '@effect/platform-bun/BunServices';
import type { PuppetSpec } from '@manna/film/canvas';
import { PuppetImagesBun, decodePng, puppetFrom } from '@manna/film/tools';
import { Effect, FileSystem, Layer, Option } from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import { RIM_LEFT, paperRimLeftOf } from './clean.ts';
import { LEAST_VIEWS, cutViews } from './views.ts';

const layer = Layer.mergeAll(
  BunServices.layer,
  PuppetImagesBun.pipe(Layer.provide(BunServices.layer)),
);

/**
 * The most rim px a view may keep. Every view keeps 11 or fewer, none of
 * them a band: single anti-aliased px along a mantle's edge whose solved
 * colour lands near the paper (filler-bases poses-2, 11), the toddler's pale
 * robe where his ink breaks at the armpit cut (poses-1, 11), the lead's
 * tunic on the box's bottom row (single-5, 8). A pale band his paint lays
 * outside his ink holds far more: the sower's views, cut without his
 * paper rim's clear, keep 29 (profileLeft) to 1742.
 */
const MOST_RIM = 12;

/** Every puppet view a member's `cutout/puppets.ts` exports under the app's sources, by its key, sorted. */
const VIEWS: ReadonlyArray<PuppetSpec> =
  // oxlint-disable-next-line effect/noAsyncFunction -- read once as the file loads, so each view is a case of its own
  await Effect.runPromise(cutViews);

/** A part PNG's pixels, decoded. */
const rasterOf = (png: string) =>
  Effect.gen(function* () {
    const bytes = yield* (yield* FileSystem.FileSystem).readFile(png);
    return yield* Effect.fromResult(decodePng(bytes));
  });

/** How many px of paper rim `spec`'s puppet keeps, as loaded, against its cut parts; his ground shadow's own paint is not rim. */
const rimLeftOf = (spec: PuppetSpec) =>
  Effect.gen(function* () {
    const paper = yield* Effect.fromOption(Option.fromUndefinedOr(spec.paper));
    const shadowNames = new Set(spec.shadow);
    const shadow = spec.parts.flatMap((part, k) =>
      Option.toArray(Option.liftPredicate(k, () => shadowNames.has(part.name))),
    );
    const cut = yield* Effect.forEach(spec.parts, (part) => rasterOf(part.png));
    const puppet = yield* puppetFrom(spec);
    const rim = paperRimLeftOf(
      cut,
      puppet.parts.map((p) => p.pixels),
      { ...RIM_LEFT, paper, shadow },
    );
    return rim.reduce((n, m) => n + m, 0);
  });

describe('no cast member keeps a paper rim round his puppet', () => {
  it.effect(`finds at least ${LEAST_VIEWS} puppet views`, () =>
    Effect.sync(() => expect(VIEWS.length).toBeGreaterThanOrEqual(LEAST_VIEWS)),
  );

  for (const spec of VIEWS)
    it.effect.layer(layer)(`${spec.key} keeps at most ${MOST_RIM} px of paper rim`, () =>
      Effect.map(rimLeftOf(spec), (rim) => expect(rim).toBeLessThanOrEqual(MOST_RIM)),
    );
});
