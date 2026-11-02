// Clears the paper rim her part sheets keep outside her ink. Her kept views
// are painted with a pale band just outside her outer outline (251,243,226 at
// the median on poses-1, against its paper 253,240,215), jagged where the
// painter's ground grain meets it. The cut (`film concept parts`) keeps it,
// and the un-matte (`core/unmatte.ts`) keeps it too: it lies nearer her cream
// cloth (`CLOTH` in `puppets.ts`, which her veil's lining needs) than the
// paper, so it is read as cloth and drawn on any paper as a white torn rim.
// Here each view's parts are laid as one figure, front to back, and the px
// the clear ground reaches within `BAND` steps through paper-coloured px
// (within ΔE76 `NEAR` of the view's paper, as `puppets.ts` names it) are
// cleared from every part that holds them. The flood stops at her ink and
// its anti-aliased blend (farther than `NEAR` from the paper), which the
// un-matte still solves against the paper, and at her cloth, which her ink
// walls in. A drawing of a part (`DRAWINGS`, her shut eyes) is laid in its
// part's place and cleared the same way. Clearing is idempotent: once the
// band is gone, the flood stops where it starts. Run it from the repo root
// with `bun apps/animations/src/films/in-its-order/cast/feast-mother/cutout/sheets-clean.ts`.

import * as BunRuntime from '@effect/platform-bun/BunRuntime';
import * as BunServices from '@effect/platform-bun/BunServices';
import { labOf } from '@manna/film/core';
import { type Raster, decodePng, encodePng } from '@manna/film/tools';
import {
  Array as Arr,
  Console,
  Effect,
  FileSystem,
  Option,
  Record as Records,
  Schema,
} from 'effect';
import { PUPPETS } from './puppets.ts';

const here = import.meta.dir;

type Rgb = readonly [number, number, number];

/** How far from the clear ground the flood reaches, px (8-neighbour steps): her band runs 1 to 5 px wide, and where it meets the fading edge of her ground shadow up to 19, so one pass clears it all; a gap in her ink could let it into her cream cloth no farther. */
const BAND = 24;

/** A px is paper-coloured within this ΔE76 of the view's paper: the band lies about 5 from it, her ink's blend 20 or more. */
const NEAR = 12;

/** Drawings of a part kept beside a view's parts, each laid in its part's place. */
const DRAWINGS = [{ view: 'poses-1', file: 'head-closed', part: 'head' }] as const;

/** A view's drawings (`DRAWINGS`), none for most. */
const drawingsOf = (view: string) => DRAWINGS.filter((d) => d.view === view);

/** The part sheet's record as kept: its parts front to back, by name. */
const RecordJson = Schema.fromJsonString(
  Schema.Struct({ parts: Schema.Array(Schema.Struct({ name: Schema.String })) }),
);

/** ΔE76 between two Lab colours. */
const deltaE = (a: Rgb, b: Rgb) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** Whether the front px at `i` of the figure laid from `layers` lies within `NEAR` of the paper (Lab); a clear px does not. */
const paperAt = (layers: ReadonlyArray<Raster>, i: number, paperLab: Rgb): boolean =>
  Option.match(Option.fromUndefinedOr(layers.find((l) => (l.rgba[i * 4 + 3] ?? 0) > 0)), {
    onNone: () => false,
    onSome: (l) => {
      const c: Rgb = [l.rgba[i * 4] ?? 0, l.rgba[i * 4 + 1] ?? 0, l.rgba[i * 4 + 2] ?? 0];
      return deltaE(labOf(c), paperLab) < NEAR;
    },
  });

/**
 * The px of the figure laid from `layers` front to back that the clear ground
 * reaches within `BAND` steps through px within `NEAR` of `paper`.
 */
const rimOf = (layers: ReadonlyArray<Raster>, paper: Rgb): Uint8Array => {
  const { width: w, height: h } = layers[0] ?? { width: 0, height: 0 };
  const paperLab = labOf(paper);
  const depth = new Int32Array(w * h).fill(-1);
  const queue: Array<number> = [];
  for (let i = 0; i < w * h; i++)
    if (!layers.some((l) => (l.rgba[i * 4 + 3] ?? 0) > 0)) {
      depth[i] = 0;
      queue.push(i);
    }
  const rim = new Uint8Array(w * h);
  for (let head = 0; head < queue.length; head++) {
    const i = queue[head] ?? 0;
    const d = depth[i] ?? 0;
    if (d >= BAND) continue;
    for (const j of neighboursOf(i, w, h)) {
      if (depth[j] !== -1 || !paperAt(layers, j, paperLab)) continue;
      depth[j] = d + 1;
      rim[j] = 1;
      queue.push(j);
    }
  }
  return rim;
};

/** The 8 neighbours of px `i` in a `w` by `h` raster that lie inside it. */
const neighboursOf = (i: number, w: number, h: number): Array<number> => {
  const [x, y] = [i % w, Math.floor(i / w)];
  const out: Array<number> = [];
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      const [nx, ny] = [x + dx, y + dy];
      if (nx >= 0 && ny >= 0 && nx < w && ny < h && (dx !== 0 || dy !== 0)) out.push(ny * w + nx);
    }
  return out;
};

/** `part` with every px `rim` holds cleared, and how many it held there. */
const cleared = (part: Raster, rim: Uint8Array) => {
  const rgba = Uint8Array.from(part.rgba);
  let count = 0;
  for (let i = 0; i < rim.length; i++)
    if (rim[i] === 1 && (rgba[i * 4 + 3] ?? 0) > 0) {
      rgba.fill(0, i * 4, i * 4 + 4);
      count++;
    }
  const raster: Raster = { width: part.width, height: part.height, rgba };
  return { raster, count };
};

const cleanView = (view: keyof typeof PUPPETS) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const dir = `${here}/sheets/${view}`;
    const paper = yield* Effect.fromOption(Option.fromUndefinedOr(PUPPETS[view].paper));
    const record = yield* Schema.decodeEffect(RecordJson)(
      yield* fs.readFileString(`${dir}/record.json`),
    );
    const read = (name: string) =>
      Effect.flatMap(fs.readFile(`${dir}/${name}.png`), (b) => Effect.fromResult(decodePng(b)));
    const names = record.parts.map((p) => p.name);
    const parts = yield* Effect.forEach(names, read);
    const rim = rimOf(parts, paper);
    const write = (name: string, part: Raster, mask: Uint8Array) =>
      Effect.gen(function* () {
        const out = cleared(part, mask);
        if (out.count > 0) yield* fs.writeFile(`${dir}/${name}.png`, encodePng(out.raster));
        yield* Console.log(`  ${view}/${name}.png: cleared ${out.count} px`);
      });
    yield* Effect.forEach(Arr.zip(names, parts), ([name, part]) => write(name, part, rim));
    yield* Effect.forEach(drawingsOf(view), (drawing) =>
      Effect.gen(function* () {
        const key = yield* read(drawing.file);
        const laid = Arr.zipWith(names, parts, (name, part) => {
          if (name === drawing.part) return key;
          return part;
        });
        yield* write(drawing.file, key, rimOf(laid, paper));
      }),
    );
  });

const clean = Effect.forEach(Records.keys(PUPPETS), cleanView);

if (import.meta.main) clean.pipe(Effect.provide(BunServices.layer), BunRuntime.runMain);
