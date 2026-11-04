import { Effect, FileSystem, Option, Path, Schema, type Scope } from 'effect';
import { Base64 } from 'effect/encoding';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';
import sharp from 'sharp';
import type { PaintCell, PaintFigure, PaintPlate, PaintRequest, PaintScene } from './painter.ts';
import { shareOf } from './sheet.ts';
import {
  drawnKeyOf,
  drawOrder,
  type Frame,
  frameAt,
  type Plate,
  type Shot,
  timesOf,
} from './shot.ts';
import {
  CAST,
  type Cast,
  type CellEntry,
  cellEntryOf,
  headsOf,
  loadFigures,
  sharesOf,
  sheetDir,
  type StoredFigure,
} from './store.ts';

/** The shot's page failed: its build, its Chrome, its script, a render or the clip. */
export class StorybookFailed extends Schema.TaggedError<StorybookFailed>()('StorybookFailed', {
  reason: Schema.String,
}) {
  override get message() {
    return this.reason;
  }
}

/** The app's root: a shot's set plates are named from it, and its renders go under its `out/storybook/`. */
export const APP = `${import.meta.dir}/../../..`;

/** Where a shot's renders go by default: `apps/animations/out/storybook/<shot>/`. */
export const outOf = (shot: Shot): string => `${APP}/out/storybook/${shot.id}`;

/** The house paper, behind every plate. */
const PAPER = '#fdf7e5';

/**
 * Chrome's flags: rendering on the CPU (Bun spawns Chrome with the GPU off),
 * so a software rasterizer gives the same bytes every launch.
 */
const SOFTWARE_GL = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio'];

const PAGE = `${import.meta.dir}/page.ts`;

const failed = (cause: unknown) => StorybookFailed.make({ reason: String(cause) });

const jsonOf = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown));

/** PNG bytes as a data URL the page decodes. */
const dataUrlOf = (png: Uint8Array): string => `data:image/png;base64,${Base64.encode(png)}`;

/** The page's bundle: `page.ts` and the engine's camera as one script that runs on a blank page. */
const pageScript = Effect.gen(function* () {
  const built = yield* Effect.tryPromise({
    try: () => Bun.build({ entrypoints: [PAGE], target: 'browser', format: 'iife' }),
    catch: failed,
  });
  if (!built.success)
    return yield* StorybookFailed.make({ reason: built.logs.map(String).join('\n') });
  const texts = yield* Effect.forEach(built.outputs, (o) =>
    Effect.tryPromise({ try: () => o.text(), catch: failed }),
  );
  return texts.join('\n');
});

/**
 * Runs in the page, not here: `source` as the page's own script element,
 * answering `ready` once the script set `window.ready`, else the errors it
 * threw. The page is sent this function's own source, so the code it runs
 * is linted like any other.
 */
const bootPage = (source: string): string => {
  const failures: Array<string> = [];
  window.addEventListener('error', (e) => failures.push(String(e.message)));
  const tag = document.createElement('script');
  tag.textContent = source;
  document.head.appendChild(tag);
  if (Reflect.get(window, 'ready') === true) return 'ready';
  return `page failed: ${failures.join('; ')}`;
};

/** A PNG data URL's bytes. */
const pngOfUrl = (dataUrl: string) =>
  Effect.fromResult(Base64.decode(dataUrl.slice(dataUrl.indexOf(',') + 1))).pipe(
    Effect.mapError(failed),
  );

/** A figure as the painter draws it: its member's palette, each stored cell of its sheet unlit as a data URL with its entry (`cellEntryOf`), the keys it wears another head on, and the blinks its holds show. */
const paintFigureOf = (
  stored: StoredFigure,
  cells: Readonly<Record<string, PaintCell>>,
): PaintFigure => ({
  _tag: 'Figure',
  name: stored.figure.name,
  palette: stored.palette,
  share: shareOf(stored.palette, stored.figure.sheet),
  cells,
  worn: stored.figure.worn ?? [],
  blinks: [...stored.blinks.keys()].map((key) => {
    const [cell = key, blink = key] = key.split('~');
    return [cell, blink] as const;
  }),
});

/** A plate as the painter draws it: its picture, its size, its place, its moves and reveal. */
export const paintPlateOf = (
  plate: Plate,
  image: string,
  size: readonly [number, number],
): PaintPlate => ({
  _tag: 'Plate',
  image,
  size,
  place: plate.place,
  moves: plate.moves ?? [],
  ...Option.match(Option.fromUndefinedOr(plate.reveal), {
    onNone: () => ({}),
    onSome: (reveal) => ({ reveal }),
  }),
});

/** A cell's entry as the painter holds it: its picture and its entry, its head where it reads one. */
export const paintCellOf = (image: string, e: CellEntry): PaintCell => ({
  image,
  size: e.size,
  ax: e.ax,
  ay: e.ay,
  ...Option.match(e.head, { onNone: () => ({}), onSome: (head) => ({ head }) }),
});

/** The shot as the page holds it: each plate's file and each figure's stored cells, unlit, by layer in drawing order, under the shot's light. */
export const sceneOf = Effect.fn('Storybook.sceneOf')(function* (
  shot: Shot,
  figures: ReadonlyArray<StoredFigure>,
  cast: Cast,
) {
  const fs = yield* FileSystem.FileSystem;
  const byName = new Map(figures.map((f) => [f.figure.name, f] as const));
  const layers = yield* Effect.forEach(drawOrder(shot.layers), (layer) =>
    Effect.forEach(layer.items, (item) =>
      Effect.gen(function* () {
        if (item._tag === 'Plate') {
          const bytes = yield* fs.readFile(`${APP}/${item.file}`);
          const meta = yield* Effect.tryPromise({
            try: () => sharp(bytes).metadata(),
            catch: (cause) => StorybookFailed.make({ reason: `${item.file}: ${String(cause)}` }),
          });
          return paintPlateOf(item, dataUrlOf(bytes), [meta.width, meta.height]);
        }
        const stored = byName.get(item.name);
        if (!stored) return yield* StorybookFailed.make({ reason: `${item.name} is not loaded` });
        const cells: Record<string, PaintCell> = {};
        for (const c of stored.record.cells) {
          const raster = stored.cells.get(c.key);
          if (!raster) continue;
          const bytes = yield* fs.readFile(
            `${sheetDir(cast, item.member, item.sheet)}/cells/${c.key}.png`,
          );
          cells[c.key] = paintCellOf(dataUrlOf(bytes), cellEntryOf(c.key, raster, stored.paints));
        }
        return paintFigureOf(stored, cells);
      }),
    ).pipe(Effect.map((items) => ({ name: layer.name, z: layer.z, blur: layer.blur, items }))),
  );
  return {
    width: shot.size.width,
    height: shot.size.height,
    paper: PAPER,
    light: shot.light,
    layers,
  } satisfies PaintScene;
});

/** Renders one request to PNG bytes. */
export type RenderPng = (req: PaintRequest) => Effect.Effect<Uint8Array, StorybookFailed>;

/**
 * The shot's page in a headless Chrome, closed with the scope: its bundle
 * runs on a blank page, decodes the scene's pictures and leaves
 * `window.storybook.render`, which the returned renderer calls once per
 * request.
 */
export const storybookPage = (
  scene: PaintScene,
): Effect.Effect<RenderPng, StorybookFailed, Scope.Scope> =>
  Effect.gen(function* () {
    const script = yield* pageScript;
    const view = yield* Effect.acquireRelease(
      Effect.try({
        try: () =>
          new Bun.WebView({
            width: scene.width,
            height: scene.height,
            backend: { type: 'chrome', url: false, argv: [...SOFTWARE_GL] },
          }),
        catch: failed,
      }),
      (v) => Effect.sync(() => v.close()),
    );
    yield* Effect.tryPromise({ try: () => view.navigate('about:blank'), catch: failed });
    const loaded = yield* Effect.tryPromise({
      try: () => view.evaluate<string>(`(${bootPage.toString()})(${jsonOf(script)})`),
      catch: failed,
    });
    if (loaded !== 'ready') return yield* StorybookFailed.make({ reason: loaded });
    const scened = yield* Effect.tryPromise({
      try: () => view.evaluate<string>(`window.storybook.load(${jsonOf(scene)})`),
      catch: failed,
    });
    if (scened !== 'loaded') return yield* StorybookFailed.make({ reason: scened });
    return (req: PaintRequest) =>
      Effect.tryPromise({
        try: () => view.evaluate<string>(`window.storybook.render(${jsonOf(req)})`),
        catch: failed,
      }).pipe(
        Effect.flatMap((answer) => {
          if (answer.startsWith('data:image/png;base64,')) return pngOfUrl(answer);
          return Effect.fail(
            StorybookFailed.make({ reason: `${req.only || 'colour'} at ${req.t}: ${answer}` }),
          );
        }),
      );
  });

/** One render of a frame: `colour` the whole frame, `figure:<name>` that figure alone; each figure draws its drawn key (`drawnKeyOf`), and its stretch up is its squash times its breath. */
export const requestOf = (frame: Frame, output: string): PaintRequest => ({
  t: frame.t,
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
  only: output.replace(/^figure:/, '').replace(/^colour$/, ''),
});

/** A frame's file name: `f0000.png` for frame 0. */
export const frameName = (i: number): string => `f${String(i).padStart(4, '0')}.png`;

/** A shot read from `cast` (the library's when it names none): its stored figures, each figure's sheet head and head share, and the scene its page draws. */
export const loadShot = Effect.fn('Storybook.loadShot')(function* (shot: Shot, cast: Cast = CAST) {
  const figures = yield* loadFigures(cast, shot);
  return {
    figures,
    heads: headsOf(figures),
    shares: sharesOf(figures),
    scene: yield* sceneOf(shot, figures, cast),
  };
});

/** A clip of the frames `f*.png` in `frames`, in name order: at `fps`, H.264 at crf 18, yuv420p. */
export const encodeClip = Effect.fn('Storybook.encodeClip')(function* (
  frames: string,
  fps: number,
  to: string,
) {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const code = yield* spawner.exitCode(
    ChildProcess.make(
      'ffmpeg',
      [
        '-y',
        '-loglevel',
        'error',
        '-framerate',
        String(fps),
        '-pattern_type',
        'glob',
        '-i',
        `${frames}/f*.png`,
        '-c:v',
        'libx264',
        '-crf',
        '18',
        '-pix_fmt',
        'yuv420p',
        to,
      ],
      { forceKillAfter: '5 seconds' },
    ),
  );
  if (code !== 0) return yield* StorybookFailed.make({ reason: `ffmpeg exited ${code} on ${to}` });
});

/**
 * Render every frame of `shot` in one page launch, each from its time alone,
 * to `<out>/frames/f0000.png` …, and the clip `<out>/shot.mp4`.
 */
export const renderShot = Effect.fn('Storybook.renderShot')(function* (
  shot: Shot,
  out: string,
  cast: Cast = CAST,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const { heads, shares, scene } = yield* loadShot(shot, cast);
  const render = yield* storybookPage(scene);
  const frames = path.join(out, 'frames');
  yield* fs.remove(frames, { recursive: true, force: true });
  yield* fs.makeDirectory(frames, { recursive: true });
  const times = timesOf(shot);
  for (const [i, t] of times.entries())
    yield* fs.writeFile(
      path.join(frames, frameName(i)),
      yield* render(requestOf(frameAt(shot, heads, t, shares), 'colour')),
    );
  yield* encodeClip(frames, shot.fps, path.join(out, 'shot.mp4'));
  return times.length;
}, Effect.scoped);
