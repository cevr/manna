import { encodePng } from '@manna/film/tools';
import { Effect, FileSystem, Option, Path, Schema, type Scope } from 'effect';
import { Base64 } from 'effect/encoding';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';
import type { PageCell, PageItem, PageRequest, PageScene } from './page.ts';
import { type Lines, linesOf } from './sheet.ts';
import { drawnKeyOf, drawOrder, type Frame, frameAt, lit, type Shot, timesOf } from './shot.ts';
import { CAST, drawnCellOf, headsOf, loadFigures, type StoredFigure } from './store.ts';

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

/** One drawn key (a stored cell, or a blink built from one) as the page draws it: lit by the shot's one light, anchored at its soles' centre. */
const pageCellOf = (shot: Shot, stored: StoredFigure, key: string) =>
  Effect.gen(function* () {
    const lines = Option.flatMap(drawnCellOf(stored, key), (r) =>
      linesOf(r, stored.paints).pipe(Option.map((l) => ({ r, l }))),
    );
    if (Option.isNone(lines))
      return yield* StorybookFailed.make({
        reason: `${stored.figure.member}'s cell ${key} reads no soles`,
      });
    const { r, l } = lines.value;
    return {
      image: dataUrlOf(encodePng(lit(r, shot.light, stored.paints))),
      ...anchorOf(l),
    } satisfies PageCell;
  });

/** Where the page pins a cell to its figure's place: its soles' centre, the centre column's middle and the row below its soles, in its own px. */
export const anchorOf = (l: Lines) => ({
  ax: l.centreColumn + 0.5,
  ay: l.bottom + 1,
});

/** The shot as the page holds it: each plate's file and each figure's lit cells and blinks by drawn key, by layer in drawing order. */
export const sceneOf = Effect.fn('Storybook.sceneOf')(function* (
  shot: Shot,
  figures: ReadonlyArray<StoredFigure>,
) {
  const fs = yield* FileSystem.FileSystem;
  const byName = new Map(figures.map((f) => [f.figure.name, f] as const));
  const layers = yield* Effect.forEach(drawOrder(shot.layers), (layer) =>
    Effect.forEach(layer.items, (item) =>
      Effect.gen(function* () {
        if (item._tag === 'Plate')
          return {
            _tag: 'Plate',
            image: dataUrlOf(yield* fs.readFile(`${APP}/${item.file}`)),
            place: item.place,
          } satisfies PageItem;
        const stored = byName.get(item.name);
        if (!stored) return yield* StorybookFailed.make({ reason: `${item.name} is not loaded` });
        const cells: Record<string, PageCell> = {};
        for (const key of [...stored.cells.keys(), ...stored.blinks.keys()])
          cells[key] = yield* pageCellOf(shot, stored, key);
        return { _tag: 'Figure', name: item.name, cells } satisfies PageItem;
      }),
    ).pipe(Effect.map((items) => ({ name: layer.name, z: layer.z, blur: layer.blur, items }))),
  );
  return {
    width: shot.size.width,
    height: shot.size.height,
    paper: PAPER,
    layers,
  } satisfies PageScene;
});

/** Renders one request to PNG bytes. */
export type RenderPng = (req: PageRequest) => Effect.Effect<Uint8Array, StorybookFailed>;

/**
 * The shot's page in a headless Chrome, closed with the scope: its bundle
 * runs on a blank page, decodes the scene's pictures and leaves
 * `window.storybook.render`, which the returned renderer calls once per
 * request.
 */
export const storybookPage = (
  scene: PageScene,
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
    return (req: PageRequest) =>
      Effect.tryPromise({
        try: () => view.evaluate<string>(`window.storybook.render(${jsonOf(req)})`),
        catch: failed,
      }).pipe(
        Effect.flatMap((answer) => {
          if (answer.startsWith('data:image/png;base64,')) return pngOfUrl(answer);
          return Effect.fail(StorybookFailed.make({ reason: `${req.output}: ${answer}` }));
        }),
      );
  });

/** One render of a frame: `colour` the whole frame, `figure:<name>` that figure alone; each figure draws its drawn key (`drawnKeyOf`), and its stretch up is its squash times its breath. */
export const requestOf = (frame: Frame, output: string): PageRequest => ({
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
  output,
});

/** A frame's file name: `f0000.png` for frame 0. */
export const frameName = (i: number): string => `f${String(i).padStart(4, '0')}.png`;

/** A shot read from the cast: its stored figures, each figure's sheet head and the scene its page draws. */
export const loadShot = Effect.fn('Storybook.loadShot')(function* (shot: Shot) {
  const figures = yield* loadFigures(CAST, shot);
  return { figures, heads: headsOf(figures), scene: yield* sceneOf(shot, figures) };
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
export const renderShot = Effect.fn('Storybook.renderShot')(function* (shot: Shot, out: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const { heads, scene } = yield* loadShot(shot);
  const render = yield* storybookPage(scene);
  const frames = path.join(out, 'frames');
  yield* fs.remove(frames, { recursive: true, force: true });
  yield* fs.makeDirectory(frames, { recursive: true });
  const times = timesOf(shot);
  for (const [i, t] of times.entries())
    yield* fs.writeFile(
      path.join(frames, frameName(i)),
      yield* render(requestOf(frameAt(shot, heads, t), 'colour')),
    );
  yield* encodeClip(frames, shot.fps, path.join(out, 'shot.mp4'));
  return times.length;
}, Effect.scoped);
