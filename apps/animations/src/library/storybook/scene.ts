import {
  type Box,
  type CardWord,
  drawing,
  type Frame as FilmFrame,
  type PaintingSpec,
  type SceneSpec,
} from '@manna/film/canvas';
import type { Raster } from '@manna/film/tools';
import { Option } from 'effect';
import {
  canvasOf,
  type PaintFigure,
  type PaintPlate,
  type PaintScene,
  type Pictures,
  type Prepared,
  paintFrame,
  prepare,
} from './painter.ts';
import { type Palette, shareOf } from './sheet.ts';
import {
  drawOrder,
  drawnKeyOf,
  figuresOf,
  frameAt,
  type Item,
  type Light,
  type Shot,
} from './shot.ts';

/** A scene's timeline, as the engine reads it. */
type Timeline = NonNullable<SceneSpec['timeline']>;

/** One named cue of a scene's timeline: a mark, a word, a landmark or another cue, never a second. */
export type Cue = Timeline[string];

/** Where one cue lies in a shot: its start and end, in the shot's own seconds. */
export interface CueSpan {
  readonly start: number;
  readonly end: number;
}

/** What a film shot is built from: its length, and where each of its own cues lies, in its own seconds. */
export interface ShotClock {
  readonly duration: number;
  readonly cue: (name: string) => CueSpan;
}

/** A film shot's set, cast and camera, every time in it in the shot's own seconds. */
export type ShotBody = Pick<Shot, 'headPx' | 'camera' | 'layers'>;

/**
 * A storybook shot of a film: its span in its scene (the cue `shot:<id>`),
 * its own cues (each `<id>:<name>` in the scene's timeline, so `bun run
 * cues` prints them), and its body built from where they fall. No film
 * second is written in it: every time is a cue's, or an offset or a length.
 */
export interface FilmShot {
  readonly id: string;
  readonly span: Cue;
  readonly cues: Readonly<Record<string, Cue>>;
  readonly build: (at: ShotClock) => ShotBody;
}

/** A full-screen card of a storybook scene: its cue (`card:<scene>`), its words from the mark `from` to `to`, its payoff, and how the film sets it. */
export interface StoryCard<F = FilmFrame> {
  readonly span: Cue;
  readonly from: string;
  readonly to?: string;
  readonly payoff: string;
  readonly draw: (f: F, words: ReadonlyArray<CardWord>) => void;
}

/** What a storybook scene reads of the film's frame: its canvas, its time and size, its hands, its cues' progress, and its paintings by name. */
export type PaintingFrame = Pick<FilmFrame, 'ctx' | 't' | 'w' | 'h' | 'hand' | 'at'> & {
  readonly painting: (name: string) => void;
};

/** The film's own drawing over one shot (a title), within `box` of the frame, which the storybook verify does not render. */
export interface Over {
  readonly shot: string;
  readonly box: Box;
  readonly draw: (f: PaintingFrame) => void;
}

/** One sheet as a film draws it: its member's palette, and each cell's PNG and entry (the sheet's `cells.ts`). */
export interface SheetCells {
  readonly palette: Palette;
  readonly cells: Readonly<
    Record<
      string,
      {
        readonly png: string;
        readonly size: readonly [number, number];
        readonly ax: number;
        readonly ay: number;
        readonly head?: number;
      }
    >
  >;
}

/** A film's sheets by `<member>/<sheet>`. */
export type Sheets = ReadonlyMap<string, SheetCells>;

/** A scene of a film drawn as storybook shots under its one light, with its cards and any drawing of its own over a shot. */
export interface StoryScene {
  readonly scene: string;
  readonly light: Light;
  readonly shots: ReadonlyArray<FilmShot>;
  readonly cards: ReadonlyArray<StoryCard>;
  readonly over: ReadonlyArray<Over>;
}

/** The cue a shot holds the frame over. */
export const shotCue = (id: string): string => `shot:${id}`;

/** The cue a scene's card holds the frame over: one card a scene, `card:<scene>`. */
export const cardCue = (scene: string, i: number): string =>
  [`card:${scene}`, `card:${scene}-${i + 1}`][Number(i > 0)] ?? `card:${scene}`;

/** A storybook scene's timeline: each shot's span and its own cues, and each card's. */
export const timelineOf = (story: StoryScene): Timeline =>
  Object.fromEntries([
    ...story.shots.flatMap((s) => [
      [shotCue(s.id), s.span] as const,
      ...Object.entries(s.cues).map(([name, cue]) => [`${s.id}:${name}`, cue] as const),
    ]),
    ...story.cards.map((c, i) => [cardCue(story.scene, i), c.span] as const),
  ]);

/** The frame's size and rate a film's shots are drawn at. */
export interface Grid {
  readonly size: { readonly width: number; readonly height: number };
  readonly fps: number;
}

/**
 * One film shot made a storybook shot from where its scene's cues fall
 * (`cue`, in scene seconds): it starts at its span's start, lasts to its
 * end, and its own cues are read in its own seconds. A pure function of the
 * cues, so the film and the verify make the same shot.
 */
export const shotOf = (
  story: StoryScene,
  s: FilmShot,
  cue: (name: string) => CueSpan,
  grid: Grid,
): Shot => {
  const span = cue(shotCue(s.id));
  const duration = span.end - span.start;
  const body = s.build({
    duration,
    cue: (name) => {
      const c = cue(`${s.id}:${name}`);
      return { start: c.start - span.start, end: c.end - span.start };
    },
  });
  return {
    id: s.id,
    size: grid.size,
    fps: grid.fps,
    duration,
    from: span.start,
    light: story.light,
    ...body,
  };
};

/** A cell's painting key: its member, sheet and key. */
const cellKey = (member: string, sheet: string, key: string): string => `${member}/${sheet}/${key}`;

/** Every painting a storybook scene's shots name: each plate by its file and each stored cell of every sheet a figure draws, each at rest at (0, 0), its clear edges named. */
export const paintingsOf = (
  shots: ReadonlyArray<ReadonlyArray<Item>>,
  sheets: Sheets,
): Readonly<Record<string, PaintingSpec>> =>
  Object.fromEntries(
    shots.flat().flatMap((item): ReadonlyArray<readonly [string, PaintingSpec]> => {
      if (item._tag === 'Plate')
        return Option.toArray(
          Option.map(Option.fromUndefinedOr(item.painting), (p) => [
            item.file,
            {
              key: item.file,
              png: p.png,
              size: p.size,
              ...Option.match(Option.fromUndefinedOr(p.open), {
                onNone: () => ({}),
                onSome: (open) => ({ open }),
              }),
            } satisfies PaintingSpec,
          ]),
        );
      const sheet = sheets.get(`${item.member}/${item.sheet}`);
      return Object.entries(sheet?.cells ?? {}).map(([key, c]) => {
        const id = cellKey(item.member, item.sheet, key);
        return [
          id,
          {
            key: id,
            png: c.png,
            size: c.size,
            open: ['top', 'right', 'bottom', 'left'],
          } satisfies PaintingSpec,
        ] as const;
      });
    }),
  );

/** A shot as the painter holds it in a film: each plate and each cell by its painting key, under the scene's light. */
export const filmSceneOf = (shot: Shot, sheets: Sheets): PaintScene => ({
  width: shot.size.width,
  height: shot.size.height,
  paper: PAPER,
  light: shot.light,
  layers: drawOrder(shot.layers).map((layer) => ({
    name: layer.name,
    z: layer.z,
    blur: layer.blur,
    items: layer.items.map((item): PaintPlate | PaintFigure => {
      if (item._tag === 'Plate')
        return {
          _tag: 'Plate',
          image: item.file,
          size: item.painting?.size ?? [item.place.width, item.place.height],
          place: item.place,
          moves: item.moves ?? [],
          ...Option.match(Option.fromUndefinedOr(item.reveal), {
            onNone: () => ({}),
            onSome: (reveal) => ({ reveal }),
          }),
        };
      const sheet = sheets.get(`${item.member}/${item.sheet}`);
      return {
        _tag: 'Figure',
        name: item.name,
        palette: sheet?.palette ?? NO_PALETTE,
        share: shareOf(sheet?.palette ?? NO_PALETTE, item.sheet),
        cells: Object.fromEntries(
          Object.entries(sheet?.cells ?? {}).map(([key, c]) => [
            key,
            {
              image: cellKey(item.member, item.sheet, key),
              size: c.size,
              ax: c.ax,
              ay: c.ay,
              ...Option.match(Option.fromUndefinedOr(c.head), {
                onNone: () => ({}),
                onSome: (head) => ({ head }),
              }),
            },
          ]),
        ),
        worn: item.worn ?? [],
        blinks: blinksOf(item),
      };
    }),
  })),
});

/** The palette of a figure whose sheet the film does not declare: no paint, so it draws nothing. */
const NO_PALETTE: Palette = { ink: '#000000', parts: [] };

/** The blinks a figure's holds show, `[cell, blink]`, each once. */
const blinksOf = (
  f: Extract<Item, { _tag: 'Figure' }>,
): ReadonlyArray<readonly [string, string]> => {
  const keys = new Map<string, readonly [string, string]>();
  for (const s of f.spans)
    if (s._tag === 'Hold' && s.blink)
      keys.set(drawnKeyOf({ cell: s.cell, eyes: s.blink }), [s.cell, s.blink]);
  return [...keys.values()];
};

/** The house paper, behind every plate: the storybook page's. */
export const PAPER = '#fdf7e5';

/**
 * A film's pictures for the painter: each painting's pixels read back off
 * the frame's own canvas a canvas-sized tile at a time, as the drawing
 * declares it (`f.painting`, at rest at (0, 0)); a draw puts those pixels,
 * held once per picture in `held`, onto whichever context paints, as the
 * page draws its decoded image. Where no page draws (Bun's check) the
 * pixels are none and a draw is the painting on the frame's own canvas.
 */
const filmPictures = (
  f: PaintingFrame,
  held: Map<string, Option.Option<HTMLCanvasElement>>,
): Pictures => ({
  draw: (ctx, image, size) => {
    const canvas =
      held.get(image) ??
      held.set(image, Option.map(pixelsOf(f, image, size), canvasOf)).get(image) ??
      Option.none();
    Option.match(canvas, {
      onNone: () => f.painting(image),
      onSome: (c) => ctx.drawImage(c, 0, 0),
    });
  },
  pixels: (image, size) => pixelsOf(f, image, size),
});

/** A painting's pixels at `size`, read back off the frame's own canvas a canvas-sized tile at a time; none where no page draws. */
const pixelsOf = (
  f: PaintingFrame,
  image: string,
  size: readonly [number, number],
): Option.Option<Raster> => {
  const ctx = f.ctx;
  if (!('document' in globalThis) || !('getImageData' in ctx)) return Option.none<Raster>();
  const [w, h] = size;
  const [cw, ch] = [ctx.canvas.width, ctx.canvas.height];
  const rgba = new Uint8Array(w * h * 4);
  for (let ty = 0; ty < h; ty += ch)
    for (let tx = 0; tx < w; tx += cw) {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      ctx.filter = 'none';
      ctx.clearRect(0, 0, cw, ch);
      ctx.translate(-tx, -ty);
      f.painting(image);
      ctx.restore();
      const [tw, th] = [Math.min(cw, w - tx), Math.min(ch, h - ty)];
      const data = ctx.getImageData(0, 0, tw, th).data;
      for (let y = 0; y < th; y++)
        rgba.set(data.subarray(y * tw * 4, (y + 1) * tw * 4), ((ty + y) * w + tx) * 4);
    }
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, cw, ch);
  ctx.restore();
  return Option.some({ width: w, height: h, rgba });
};

/** A canvas whose pixels live on the CPU, its 2d context and its own untouched transform. */
interface CpuCanvas {
  readonly c: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  readonly identity: DOMMatrix;
}

/**
 * A canvas of `width` × `height` whose pixels live on the CPU
 * (`willReadFrequently`), as every canvas of the storybook page does, so a
 * cell drawn smaller is resampled as the verify resampled it; none where no
 * 2d context is made.
 */
const cpuCanvas = (width: number, height: number): Option.Option<CpuCanvas> => {
  if (!('document' in globalThis)) return Option.none();
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  return Option.map(
    Option.fromNullishOr(c.getContext('2d', { willReadFrequently: true })),
    (ctx) => ({ c, ctx, identity: ctx.getTransform() }),
  );
};

/** No light and no vignette: the storybook shot lights its own cells, so the film adds nothing over it. */
const UNLIT = { color: '#ffffff', amount: 0, vignette: 0 } as const;

/**
 * A storybook scene as the film's drawing: its timeline holds each shot's
 * span and cues and each card's cue; its paintings are every plate and
 * stored cell its shots name; its draw paints the shot that holds the frame
 * through the painter the storybook page shares (`paintFrame`), each cell
 * lit in the page by the scene's light, and the film's own drawing over it;
 * under a card it paints nothing, the card holding the frame. The shot is
 * painted on a CPU canvas of the grid's size from CPU canvases of its
 * plates and cells, as the storybook page paints it, then copied onto the
 * film's frame: the film's page draws on the GPU, which resamples a cell
 * drawn smaller otherwise than the page. Drawn with no drift, no light and
 * no vignette of the film's, so the frame is the shot's as the verify
 * renders it.
 */
export const storyDrawing = (story: StoryScene, sheets: Sheets, grid: Grid) => {
  const atRest = story.shots.map((s) =>
    shotOf(story, s, () => ({ start: 0, end: 1 }), grid).layers.flatMap((l) => l.items),
  );
  const prepared = new Map<string, Option.Option<Prepared>>();
  const canvases = new Map<'frame', Option.Option<CpuCanvas>>();
  const held = new Map<string, Option.Option<HTMLCanvasElement>>();
  return drawing({
    timeline: timelineOf(story),
    paintings: paintingsOf(atRest, sheets),
    drift: 0,
    light: UNLIT,
    cards: story.cards.map((c, i) => ({
      cue: cardCue(story.scene, i),
      from: c.from,
      ...Option.match(Option.fromUndefinedOr(c.to), {
        onNone: () => ({}),
        onSome: (to) => ({ to }),
      }),
      payoff: c.payoff,
      draw: c.draw,
    })),
    draw: (f) => {
      const active = story.shots.find((s) => {
        const c = f.cue(shotCue(s.id));
        return c.start <= f.t && f.t < c.end;
      });
      if (!active) return;
      const shot = shotOf(story, active, (name) => f.cue(name), grid);
      const scene = filmSceneOf(shot, sheets);
      const pictures = filmPictures(f, held);
      const base = f.ctx.getTransform();
      const ready =
        prepared.get(active.id) ??
        prepared.set(active.id, prepare(scene, pictures)).get(active.id) ??
        Option.none();
      if (Option.isNone(ready)) {
        prepared.delete(active.id);
        return;
      }
      const t = f.t - (shot.from ?? 0);
      const frame = frameAt(shot, ready.value.heads, t, ready.value.shares);
      const paint = (ctx: CanvasRenderingContext2D, from: DOMMatrix) =>
        paintFrame(ctx, from, scene, ready.value, pictures, {
          t,
          camera: { x: frame.camera.x, y: frame.camera.y, zoom: frame.camera.zoom },
          figures: frame.figures.map(({ name, cell, eyes, x, y, sx, sy, breath, scale }) => ({
            name,
            cell: drawnKeyOf({ cell, eyes }),
            x,
            y,
            sx,
            sy: sy * breath,
            scale,
          })),
          only: '',
        });
      const cpu =
        canvases.get('frame') ??
        canvases.set('frame', cpuCanvas(grid.size.width, grid.size.height)).get('frame') ??
        Option.none();
      f.ctx.save();
      Option.match(cpu, {
        onNone: () => paint(f.ctx, base),
        onSome: (canvas) => {
          paint(canvas.ctx, canvas.identity);
          f.ctx.setTransform(base);
          f.ctx.drawImage(canvas.c, 0, 0);
        },
      });
      f.ctx.restore();
      for (const o of story.over.filter((x) => x.shot === active.id)) o.draw(f);
    },
  });
};

/** One shot sheet a film declares: its member and id, its keys left to right with each key's pose words, the member's kept views it is drawn from, and the film's own prompt rules. */
export interface SheetDecl {
  readonly member: string;
  readonly id: string;
  readonly keys: ReadonlyArray<string>;
  readonly poses: Readonly<Record<string, string>>;
  readonly refs: ReadonlyArray<string>;
  readonly rules: ReadonlyArray<string>;
}

/** A film drawn in storybook shots: its name, its frame grid, its scenes as the film lays them out, its storybook scenes, its narration's timings file, its sheets declared and drawn. */
export interface StoryFilm {
  readonly film: string;
  readonly grid: Grid;
  readonly scenes: ReadonlyArray<SceneSpec>;
  readonly stories: ReadonlyArray<StoryScene>;
  readonly timings: string;
  readonly sheets: ReadonlyArray<SheetDecl>;
}

/** Each figure of a shot: its name, member and sheet. */
export const castOf = (shot: Shot) =>
  figuresOf(shot).map(({ figure: f }) => ({ name: f.name, member: f.member, sheet: f.sheet }));
