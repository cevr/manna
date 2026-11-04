import { multiplane } from '@manna/film/canvas';
import type { Raster } from '@manna/film/tools';
import { Option, Result } from 'effect';
import {
  anchorOf,
  blinkOf,
  linesOf,
  type Paint,
  type Palette,
  paintsOf,
  sheetHeadOf,
  withHeadOf,
} from './sheet.ts';
import {
  drawnKeyOf,
  type Light,
  lit,
  type PlateKey,
  plateAt,
  type Reveal,
  revealAt,
  type Worn,
} from './shot.ts';

/** One stored cell as the painter holds it: its picture's id, its size in px, its soles' centre and its head in px where its lines read one. */
export interface PaintCell {
  readonly image: string;
  readonly size: readonly [number, number];
  readonly ax: number;
  readonly ay: number;
  readonly head?: number;
}

/** A plate as the painter draws it: its picture's id and size, its place in its layer's px, and its moves and reveal. */
export interface PaintPlate {
  readonly _tag: 'Plate';
  readonly image: string;
  readonly size: readonly [number, number];
  readonly place: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
  readonly moves: ReadonlyArray<readonly [number, PlateKey]>;
  readonly reveal?: Reveal;
}

/** A figure as the painter draws it: its name, its member's palette, its stored cells by key, the keys it wears another head on and the blinks its holds show (`[cell, blink]`). */
export interface PaintFigure {
  readonly _tag: 'Figure';
  readonly name: string;
  readonly palette: Palette;
  readonly cells: Readonly<Record<string, PaintCell>>;
  readonly worn: ReadonlyArray<Worn>;
  readonly blinks: ReadonlyArray<readonly [string, string]>;
}

/** A shot's set and cast as the painter holds them: the frame's size, the paper behind everything, the scene's one light, and each layer's depth, blur and items in drawing order. */
export interface PaintScene {
  readonly width: number;
  readonly height: number;
  readonly paper: string;
  readonly light: Light;
  readonly layers: ReadonlyArray<{
    readonly name: string;
    readonly z: number;
    readonly blur: number;
    readonly items: ReadonlyArray<PaintPlate | PaintFigure>;
  }>;
}

/** One figure of a frame: its drawn key (`drawnKeyOf`), its soles' centre in its layer's px, its stretch across and up (squash, and breath up) and its scale. */
export interface PaintedFigure {
  readonly name: string;
  readonly cell: string;
  readonly x: number;
  readonly y: number;
  readonly sx: number;
  readonly sy: number;
  readonly scale: number;
}

/**
 * One frame to paint: its time in the shot (the plates' moves read it), its
 * camera, its figures, and `only`: empty for the whole frame on its paper,
 * or a figure's name for that figure alone, through its plane at the
 * frame's camera, on transparent and with no fibre.
 */
export interface PaintRequest {
  readonly t: number;
  readonly camera: { readonly x: number; readonly y: number; readonly zoom: number };
  readonly figures: ReadonlyArray<PaintedFigure>;
  readonly only: string;
}

/** Where the painter reads a picture by its id: its pixels, and a draw of it at (0, 0) under the context's transform at its own size. */
export interface Pictures {
  readonly pixels: (image: string, size: readonly [number, number]) => Option.Option<Raster>;
  readonly draw: (ctx: CanvasRenderingContext2D, image: string) => void;
}

/** A drawn key ready to paint: its lit picture and its soles' centre in its own px. */
interface LitCell {
  readonly canvas: HTMLCanvasElement;
  readonly ax: number;
  readonly ay: number;
}

/** A scene prepared once: each figure's lit drawn keys by `<figure>/<key>`, and its sheet head and head share by name. */
export interface Prepared {
  readonly cells: ReadonlyMap<string, LitCell>;
  readonly heads: ReadonlyMap<string, number>;
  readonly shares: ReadonlyMap<string, number>;
}

/** A raster as a canvas of its own size. */
const canvasOf = (r: Raster): HTMLCanvasElement => {
  const canvas = document.createElement('canvas');
  canvas.width = r.width;
  canvas.height = r.height;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const data = ctx.createImageData(r.width, r.height);
    data.data.set(r.rgba);
    ctx.putImageData(data, 0, 0);
  }
  return canvas;
};

/** A figure's drawing at one key: a raster, and its soles' centre and head when the sheet's module names them, else none to read from its lines. */
interface Drawn {
  readonly key: string;
  readonly raster: Raster;
  readonly anchor: Option.Option<{ readonly ax: number; readonly ay: number }>;
  readonly head: Option.Option<Option.Option<number>>;
}

/** A figure's keys as it draws them: its stored cells, the keys it wears another head on (`withHeadOf`), and the blinks its holds show (`blinkOf`); none when a picture or a derivation fails. */
const drawnOf = (
  f: PaintFigure,
  pictures: Pictures,
  paints: ReadonlyArray<Paint>,
): Option.Option<{
  readonly cells: ReadonlyArray<Drawn>;
  readonly blinks: ReadonlyArray<Drawn>;
}> => {
  const stored = new Map<string, Raster>();
  const cells: Array<Drawn> = [];
  for (const [key, c] of Object.entries(f.cells)) {
    const px = pictures.pixels(c.image, c.size);
    if (Option.isNone(px)) return Option.none();
    stored.set(key, px.value);
    cells.push({
      key,
      raster: px.value,
      anchor: Option.some({ ax: c.ax, ay: c.ay }),
      head: Option.some(Option.fromUndefinedOr(c.head)),
    });
  }
  const derived = (key: string, built: Result.Result<Raster, unknown>): Option.Option<Drawn> =>
    Option.map(Result.getSuccess(built), (raster) => ({
      key,
      raster,
      anchor: Option.none(),
      head: Option.none(),
    }));
  const missing = Result.fail('missing');
  for (const w of f.worn) {
    const [b, h] = [stored.get(w.body), stored.get(w.head)];
    const one = derived(w.key, (b && h && withHeadOf(b, h, paints)) || missing);
    if (Option.isNone(one)) return Option.none();
    cells.push(one.value);
    stored.set(w.key, one.value.raster);
  }
  const blinks: Array<Drawn> = [];
  for (const [cell, blink] of f.blinks) {
    const [open, closed] = [stored.get(cell), stored.get(blink)];
    const one = derived(
      drawnKeyOf({ cell, eyes: blink }),
      (open && closed && blinkOf(open, closed, paints)) || missing,
    );
    if (Option.isNone(one)) return Option.none();
    blinks.push(one.value);
  }
  return Option.some({ cells: cells.filter((c) => !blinks.some((b) => b.key === c.key)), blinks });
};

/** A drawing's soles' centre and head: the module's where it names them, else read from its lines. */
const readOf = (d: Drawn, paints: ReadonlyArray<Paint>) => {
  const lines = () => linesOf(d.raster, paints);
  return {
    anchor: Option.getOrElse(d.anchor, () =>
      Option.match(lines(), {
        onNone: () => ({ ax: d.raster.width / 2, ay: d.raster.height }),
        onSome: anchorOf,
      }),
    ),
    head: Option.getOrElse(d.head, () => Option.flatMap(lines(), (l) => l.head)),
  };
};

/**
 * A scene prepared from its pictures: each figure's drawn keys (its stored
 * cells, the heads it wears and its blinks) under the scene's light
 * (`lit`, once per key), its sheet head (the median over its cells and worn
 * keys, as the store reads it) and its member's head share. None while a
 * picture cannot be read.
 */
export const prepare = (scene: PaintScene, pictures: Pictures): Option.Option<Prepared> => {
  const cells = new Map<string, LitCell>();
  const heads = new Map<string, number>();
  const shares = new Map<string, number>();
  for (const layer of scene.layers)
    for (const item of layer.items) {
      if (item._tag === 'Plate') continue;
      const paints = paintsOf(item.palette);
      const drawn = drawnOf(item, pictures, paints);
      if (Option.isNone(drawn)) return Option.none();
      const read = new Map<string, Option.Option<number>>();
      for (const d of [...drawn.value.cells, ...drawn.value.blinks]) {
        const { anchor, head } = readOf(d, paints);
        if (!drawn.value.blinks.includes(d)) read.set(d.key, head);
        cells.set(`${item.name}/${d.key}`, {
          canvas: canvasOf(lit(d.raster, scene.light, paints)),
          ...anchor,
        });
      }
      heads.set(
        item.name,
        Option.getOrElse(sheetHeadOf(read), () => 1),
      );
      shares.set(item.name, item.palette.head ?? 1);
    }
  return Option.some({ cells, heads, shares });
};

/** The scene's depth settings: its camera authored, so no drift; the engine's default fibre on the backdrop of the whole frame, none on a figure alone. */
const DEPTHS = [{ drift: 0 }, { drift: 0, fibre: 0 }] as const;

/** A plate's brush laid so far as a clip, in the plate's own px: a disc at every point and every half radius between. */
const clipTo = (
  ctx: CanvasRenderingContext2D,
  laid: ReadonlyArray<readonly [number, number, number]>,
) => {
  ctx.beginPath();
  for (const [i, p] of laid.entries()) {
    const q = laid[i + 1] ?? p;
    const steps = Math.max(
      1,
      Math.ceil(Math.hypot(q[0] - p[0], q[1] - p[1]) / Math.max(1, p[2] / 2)),
    );
    for (let k = 0; k < steps; k++) {
      const u = k / steps;
      const [x, y, r] = [
        p[0] + (q[0] - p[0]) * u,
        p[1] + (q[1] - p[1]) * u,
        p[2] + (q[2] - p[2]) * u,
      ];
      ctx.moveTo(x + r, y);
      ctx.arc(x, y, r, 0, 2 * Math.PI);
    }
  }
  ctx.clip();
};

/** A plate at `t`: moved off its place, stretched about its foot, faded, shown under its brush, its picture fitted to its place. */
const paintPlate = (
  ctx: CanvasRenderingContext2D,
  p: PaintPlate,
  t: number,
  pictures: Pictures,
) => {
  const k = plateAt({ moves: p.moves }, t);
  const { x, y, width, height } = p.place;
  if (k.alpha <= 0) return;
  ctx.save();
  ctx.translate(x + k.x + width / 2, y + k.y + height);
  ctx.scale(k.sx, k.sy);
  ctx.translate(-width / 2, -height);
  ctx.scale(width / p.size[0], height / p.size[1]);
  ctx.globalAlpha *= k.alpha;
  const laid = Option.map(Option.fromUndefinedOr(p.reveal), (r) => revealAt(r, t));
  if (Option.isSome(laid)) clipTo(ctx, laid.value);
  if (
    Option.getOrElse(
      Option.map(laid, (l) => l.length > 0),
      () => true,
    )
  )
    pictures.draw(ctx, p.image);
  ctx.restore();
};

/** A figure in its frame pose: its lit drawn key at its scale times its stretch, its soles' centre on its place. */
const paintFigure = (ctx: CanvasRenderingContext2D, cell: LitCell, f: PaintedFigure) => {
  ctx.save();
  ctx.translate(f.x, f.y);
  ctx.scale(f.scale * f.sx, f.scale * f.sy);
  ctx.drawImage(cell.canvas, -cell.ax, -cell.ay);
  ctx.restore();
};

/**
 * Paint one frame of a prepared scene onto `ctx` under `base` (the
 * transform the frame is drawn at): the paper, then each layer through the
 * camera at its depth, its plates and figures in order; or one figure
 * alone. Answers why not when a figure's drawn key is not prepared. The
 * storybook page and a film's storybook scene both paint through it.
 */
export const paintFrame = (
  ctx: CanvasRenderingContext2D,
  base: DOMMatrix,
  scene: PaintScene,
  prepared: Prepared,
  pictures: Pictures,
  req: PaintRequest,
): Option.Option<string> => {
  const missing = req.figures.filter((f) => !prepared.cells.has(`${f.name}/${f.cell}`));
  if (missing.length > 0)
    return Option.some(`no cell ${missing.map((f) => `${f.name}/${f.cell}`).join(', ')}`);
  const figures = new Map(req.figures.map((f) => [f.name, f] as const));
  ctx.setTransform(base);
  ctx.filter = 'none';
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  if (req.only === '') {
    ctx.fillStyle = scene.paper;
    ctx.fillRect(0, 0, scene.width, scene.height);
  }
  const layers = scene.layers.filter(
    (l) => req.only === '' || l.items.some((i) => i._tag === 'Figure' && i.name === req.only),
  );
  multiplane(
    ctx,
    req.camera,
    scene.width,
    scene.height,
    layers.map((layer) => ({
      z: layer.z,
      draw: () => {
        if (layer.blur > 0) ctx.filter = `blur(${layer.blur}px)`;
        for (const item of layer.items) {
          if (item._tag === 'Plate') {
            if (req.only === '') paintPlate(ctx, item, req.t, pictures);
            continue;
          }
          const f = figures.get(item.name);
          const cell = prepared.cells.get(`${item.name}/${f?.cell ?? ''}`);
          if (f && cell && (req.only === '' || req.only === item.name)) paintFigure(ctx, cell, f);
        }
        ctx.filter = 'none';
      },
    })),
    DEPTHS[Number(req.only !== '')],
  );
  return Option.none();
};
