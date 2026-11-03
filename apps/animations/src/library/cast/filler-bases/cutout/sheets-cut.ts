// Cuts the filler bases' four kept views into their part sheets: each view's
// kept box, padded (`frames.ts`), cropped from the kept poses sheet and cut by
// its bust cut (`cut.ts`) into its head and its torso, each written to
// `sheets/<view>/<part>.png`, the view's bytes where the part owns a px and
// alpha 0 elsewhere, as the parts CLI writes a part. The bases' arms hang
// inside the torso, so a turned head uncovers nothing a part hides and no
// repaint is asked. Each part's cloth is dyed here, once, as the crowd's base
// wears it (`docs/casting.md` §2.6): every torso's robe and sash to undyed
// linen, and the older pair's grey-white hair to the pale cool paper. The dye
// scales each channel of a pale, unsaturated px by target / base, the base
// being the median of the part's own pale px, so the painted shading keeps
// its steps; saturated px (skin and its shadows, brows, eyes) and the ink are
// left as drawn. Only px inside the outline's ink are dyed: the rim the load
// un-mattes against the paper (`core/unmatte.ts`) stays as painted. Each
// view's enclosed paper (`paperOf`) is printed: the grown pair's cream robe
// is painted in nearly the paper's colour, so their cloth reads as enclosed
// paper the figure holds, and each held piece is a place to look for a gap
// the cut should name. The run fails before it writes a view whose named gap
// is stale. Run it from the repo root with
// `bun apps/animations/src/library/cast/filler-bases/cutout/sheets-cut.ts`.

import * as BunRuntime from '@effect/platform-bun/BunRuntime';
import * as BunServices from '@effect/platform-bun/BunServices';
import { type Raster, cutParts, decodePng, encodePng } from '@manna/film/tools';
import { Array as Arr, Console, Effect, FileSystem, Option, Record as Records } from 'effect';
import { CUTS, cutOptionsFor, paperOf } from './cut.ts';
// the kept sheet, imported as a file so the cast build keys the parts stage by it (`COVERAGE.cutters`)
import KEPT from '../cast-sheet/kept/poses.png' with { type: 'file' };
import { FRAMES, type FramedView, boxOf } from './frames.ts';

const here = import.meta.dir;

type Rgb = readonly [number, number, number];

/** Undyed linen, the crowd's base cloth (`docs/casting.md` §2.6). */
const LINEN: Rgb = [0xd1, 0xc6, 0xb4];

/** Old hair: the pale cool paper, never robe white (`.claude/skills/film/reference/character-design.md`, the plain lead's pale cool paper). */
const PALE_COOL: Rgb = [0xdb, 0xd6, 0xdc];

/** Each view's dye, by part: the colour its pale px are carried to. A part it does not name is written as drawn. */
const DYES: Readonly<Record<FramedView, Readonly<Record<string, Rgb>>>> = {
  'poses-1': { torso: LINEN },
  'poses-2': { torso: LINEN },
  'poses-3': { head: PALE_COOL, torso: LINEN },
  'poses-4': { head: PALE_COOL, torso: LINEN },
};

/** A px is ground to the outside's flood where its luminance is this or more: the paper and the pale side of the outline's rim. */
const GROUND = 90;

/** A px counts toward a part's base where its luminance is this or more and it takes all the dye: its cloth or hair, not an ink blend. */
const PALE = 150;

/** The luminance of `r`'s px `i`. */
const lumOf = (r: Raster, i: number) =>
  0.299 * (r.rgba[i * 4] ?? 0) +
  0.587 * (r.rgba[i * 4 + 1] ?? 0) +
  0.114 * (r.rgba[i * 4 + 2] ?? 0);

/** How much of the dye a px takes by its saturation, (max − min) / max: all of it at 0.30 or less, none at 0.45 or more, and in between in proportion. */
const weightOf = (r: number, g: number, b: number) => {
  const max = Math.max(r, g, b);
  if (max === 0) return 0;
  const saturation = (max - Math.min(r, g, b)) / max;
  return Math.min(1, Math.max(0, (0.45 - saturation) / 0.15));
};

/**
 * The px of `view` the outside reaches (1): a flood from its top, left and
 * right edges through px of luminance `GROUND` or more. Its foot, the bust's
 * open waist, lets nothing in, as the cut's figure reads it with that row closed.
 */
const outsideOf = (view: Raster): Uint8Array => {
  const { width: w, height: h } = view;
  const out = new Uint8Array(w * h);
  const stack: Array<number> = [];
  const visit = (x: number, y: number) => {
    const i = y * w + x;
    if (x < 0 || y < 0 || x >= w || y >= h || out[i] === 1 || lumOf(view, i) < GROUND) return;
    out[i] = 1;
    stack.push(i);
  };
  for (let x = 0; x < w; x++) visit(x, 0);
  for (let y = 0; y < h; y++) {
    visit(0, y);
    visit(w - 1, y);
  }
  while (stack.length > 0) {
    const i = stack.pop() ?? 0;
    const [x, y] = [i % w, Math.floor(i / w)];
    visit(x - 1, y);
    visit(x + 1, y);
    visit(x, y - 1);
    visit(x, y + 1);
  }
  return out;
};

/** The median of `values`, which it sorts. */
const medianOf = (values: Array<number>) => values.sort((a, b) => a - b)[values.length >> 1] ?? 0;

/**
 * `part` dyed to `to` where `inside` holds: each channel of each px scaled by
 * 1 − w + w·to/base, w its `weightOf`, base the per-channel median of the
 * part's px inside that take all the dye and are `PALE` or lighter. None when
 * the part has no such px.
 */
const dyed = (
  part: Raster,
  inside: Uint8Array,
  to: Rgb,
): Option.Option<{ raster: Raster; base: Rgb }> => {
  const { width: w, height: h, rgba } = part;
  const pale = Arr.filter(
    Arr.makeBy(w * h, (i) => i),
    (i) =>
      inside[i] === 1 &&
      (rgba[i * 4 + 3] ?? 0) > 0 &&
      lumOf(part, i) >= PALE &&
      weightOf(rgba[i * 4] ?? 0, rgba[i * 4 + 1] ?? 0, rgba[i * 4 + 2] ?? 0) === 1,
  );
  if (pale.length === 0) return Option.none();
  const channel = (c: number) => medianOf(pale.map((i) => rgba[i * 4 + c] ?? 0));
  const base: Rgb = [channel(0), channel(1), channel(2)];
  const out = Uint8Array.from(rgba);
  for (let i = 0; i < w * h; i++) {
    if (inside[i] !== 1 || (rgba[i * 4 + 3] ?? 0) === 0) continue;
    const [r, g, b] = [rgba[i * 4] ?? 0, rgba[i * 4 + 1] ?? 0, rgba[i * 4 + 2] ?? 0];
    const k = weightOf(r, g, b);
    if (k === 0) continue;
    [r, g, b].forEach((v, c) => {
      const f = (to[c] ?? 0) / Math.max(1, base[c] ?? 0);
      out[i * 4 + c] = Math.min(255, Math.max(0, Math.round(v * (1 - k + k * f))));
    });
  }
  return Option.some({ raster: { width: w, height: h, rgba: out }, base });
};

/** The `[x0, y0, x1, y1]` box of `sheet`, its far edges exclusive. */
const cropOf = (
  sheet: Raster,
  [x0, y0, x1, y1]: readonly [number, number, number, number],
): Raster => {
  const [w, h] = [x1 - x0, y1 - y0];
  const rgba = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++)
    rgba.set(
      sheet.rgba.subarray(((y0 + y) * sheet.width + x0) * 4, ((y0 + y) * sheet.width + x1) * 4),
      y * w * 4,
    );
  return { width: w, height: h, rgba };
};

/** A colour as `r,g,b`. */
const rgbText = ([r, g, b]: Rgb) => `${r},${g},${b}`;

const cutView = (sheet: Raster, name: FramedView) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const view = cropOf(sheet, boxOf(name));
    const paper = paperOf(name, view);
    yield* Console.log(
      `${name}: enclosed paper held ${paper.held.length}, open ${paper.open.length}, stale ${paper.stale.length}${paper.held.map((p) => ` [held ${p.box.join(',')} ${p.area} px]`).join('')}`,
    );
    if (paper.stale.length > 0)
      return yield* Effect.fail(
        `${name} names a gap that opens no paper: fix its point or box in cut.ts`,
      );
    const parts = yield* Effect.fromResult(cutParts(view, CUTS[name], cutOptionsFor(name, view)));
    const inside = Uint8Array.from(outsideOf(view), (o) => 1 - o);
    yield* fs.makeDirectory(`${here}/sheets/${name}`, { recursive: true });
    yield* Effect.forEach(parts.parts, (part) =>
      Effect.gen(function* () {
        const to = Option.fromUndefinedOr(DYES[name][part.name]);
        const written = Option.flatMap(to, (t) =>
          Option.map(dyed(part.pixels, inside, t), (d) => ({ ...d, to: t })),
        );
        const raster = Option.match(written, {
          onNone: () => part.pixels,
          onSome: (d) => d.raster,
        });
        yield* fs.writeFile(`${here}/sheets/${name}/${part.name}.png`, encodePng(raster));
        yield* Console.log(
          `  ${part.name}.png: ${part.kept} px${Option.match(written, {
            onNone: () =>
              Option.match(to, { onNone: () => '', onSome: () => ', no pale px to dye' }),
            onSome: (d) => `, dyed from base ${rgbText(d.base)} to ${rgbText(d.to)}`,
          })}`,
        );
      }),
    );
  });

const cut = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const sheet = yield* Effect.fromResult(decodePng(yield* fs.readFile(KEPT)));
  yield* Effect.forEach(Records.keys(FRAMES), (name) => cutView(sheet, name));
});

if (import.meta.main) cut.pipe(Effect.provide(BunServices.layer), BunRuntime.runMain);
