import { Effect, Result, Schema, type Scope } from 'effect';
import { type Placed, sceneOf } from '../core/layout.ts';
import { movedFrames, secondsAt } from '../core/time.ts';
import { Short } from '../core/schema.ts';
import {
  type ResolvedShort,
  SHORT_LAYOUT,
  bandOf,
  pageScale,
  resolveShort,
  shortKey,
  shortPage,
  shortSpanAt,
} from '../core/shorts.ts';
import { shortPhrases } from '../core/phrases.ts';
import { boilTick } from './ink.ts';
import { burnedCaptions } from './short-captions.ts';
import type { Film, RenderOptions, SceneSpec } from './film.ts';
import {
  type Grain,
  type Offscreen,
  grainRect,
  makeGrain,
  makePaper,
  makeVignette,
  offscreen,
  shadeBy,
} from './paper.ts';
import type { Probe, ProbeSink } from './probe.ts';
import { verticalHook } from './vertical.ts';

const retimed = (film: Film, short: ResolvedShort): ReadonlyArray<Placed<SceneSpec>> =>
  short.spans.map((span, index) => {
    const p = Result.getOrThrow(sceneOf(film.placed, span.scene));
    const frame = p.frame - span.shift;
    return { ...p, index, frame, start: secondsAt(frame, p.fps) };
  });

const onPage = (from: ProbeSink, sink: ProbeSink, dy: number) => {
  for (const t of from.texts)
    sink.texts.push({
      ...t,
      y: t.y + dy,
      corners: [
        [t.corners[0][0], t.corners[0][1] + dy],
        [t.corners[1][0], t.corners[1][1] + dy],
        [t.corners[2][0], t.corners[2][1] + dy],
        [t.corners[3][0], t.corners[3][1] + dy],
      ],
      order: sink.texts.length + sink.inks.length,
    });
  for (const i of from.inks)
    sink.inks.push({
      ...i,
      y: i.y + dy,
      points: i.points.map(([x, y]) => [x, y + dy] as const),
      order: sink.texts.length + sink.inks.length,
    });
};

export const createShort = (film: Film, declared: Short): Film => {
  const decoded = Schema.decodeSync(Short)(declared);
  const short = Result.getOrThrow(resolveShort(film.placed, decoded));
  const page = shortPage(film.width);
  const band = bandOf(film);
  const k = pageScale(film.width);
  const placed = retimed(film, short);
  const { finish, short: style } = film.look;
  const below = band.top + band.height;
  const strip = Math.max(band.top, page.height - below);

  let assets:
    | {
        sheet: HTMLCanvasElement;
        grain: Grain;
        band: Offscreen;
      }
    | undefined;
  const getAssets = () => {
    if (assets !== undefined) return assets;
    const base = offscreen(page.width, page.height);
    base.ctx.drawImage(makePaper(page.width, page.height, film.look.paper), 0, 0);
    shadeBy(base.ctx, makeVignette(page.width, page.height, film.look.shade, finish.vignette));
    const grain = makeGrain(
      finish.grainSize,
      finish.grainTiles,
      film.look.paper.seed + 99,
      page.width,
      strip + finish.grainSize,
    );
    assets = { sheet: base.c, grain, band: offscreen(band.width, band.height) };
    return assets;
  };

  const captions = burnedCaptions(shortPhrases(film.placed, short), style.caption, k);

  const hook = verticalHook(decoded.hook, style.hook, k, SHORT_LAYOUT);

  const bandOptions: { captions: false } & {
    -readonly [K in keyof RenderOptions]: RenderOptions[K];
  } = {
    captions: false,
  };

  const sceneAt = (T: number): Placed<SceneSpec> =>
    placed[shortSpanAt(short, T)] ?? film.sceneAt(short.spans[0].from);

  const render = (ctx: CanvasRenderingContext2D, T: number, opts: RenderOptions = {}) => {
    const { sheet, grain, band: frame } = getAssets();
    const index = shortSpanAt(short, T);
    const span = short.spans[index] ?? short.spans[0];
    const at = movedFrames(T, span.shift, film.fps);
    const sink = opts.probe;
    const probed: ProbeSink | undefined = sink === undefined ? undefined : { texts: [], inks: [] };
    bandOptions.knobs = opts.knobs;
    bandOptions.probe = probed;
    film.render(frame.ctx, at, bandOptions);

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(sheet, 0, 0, page.width, band.top, 0, 0, page.width, band.top);
    ctx.drawImage(
      sheet,
      0,
      below,
      page.width,
      page.height - below,
      0,
      below,
      page.width,
      page.height - below,
    );
    const boil = boilTick(T);
    grainRect(ctx, grain, boil, 0, 0, page.width, band.top, finish.grain);
    grainRect(
      ctx,
      grain,
      boil,
      0,
      below,
      page.width,
      page.height - below,
      finish.grain,
      below % grain.size,
    );
    ctx.drawImage(frame.c, 0, band.top);
    ctx.restore();

    const words = opts.captions !== false;
    if (sink === undefined || probed === undefined) {
      hook.draw(ctx, T, undefined);
      if (words) captions.draw(ctx, T, undefined);
      return;
    }
    onPage(probed, sink, band.top);
    const probe: Probe = { sink, scene: span.scene, dx: 0, alpha: 1, caption: true };
    hook.draw(ctx, T, probe);
    if (words) captions.draw(ctx, T, probe);
  };

  return {
    title: short.title,
    width: page.width,
    height: page.height,
    fps: film.fps,
    duration: short.duration,
    placed,
    audio: undefined,
    sound: undefined,
    palette: film.palette,
    allRecorded: film.allRecorded,
    look: film.look,
    sceneAt,
    render,
    rigs: film.rigs,
    puppets: film.puppets,
    paintings: film.paintings,
  };
};

export const shortPages = <E>(
  name: string,
  load: Effect.Effect<Film, E, Scope.Scope>,
  shorts: ReadonlyArray<Short>,
): Record<string, Effect.Effect<Film, E, Scope.Scope>> =>
  Object.fromEntries(
    shorts.map((short) => [
      shortKey(name, short.id),
      Effect.map(load, (f) => createShort(f, short)),
    ]),
  );
