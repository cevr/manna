import { Effect, Layer, ManagedRuntime, type Scope } from 'effect';
import { FetchHttpClient, type HttpClient } from 'effect/http';
import { SheetKind } from '../core/cast-sheet.ts';
import type { RigNameMissing, RigUnloadable } from '../core/errors.ts';
import {
  type CastModule,
  type CastSheet,
  type CastView,
  CUTOUT_BOILS,
  CUTOUT_MARGIN,
  type CutoutView,
  clipCast,
  castDrawOrder,
  castPage,
  castRigs,
  cutoutPuppets,
  easePage,
  easeScene,
} from '../canvas/cast.ts';
import { type Film, type Frame, createFilm } from '../canvas/film.ts';
import type { PuppetUnloadable } from '../puppet/images.ts';
import { PuppetImagesBrowser } from '../puppet/images-browser.ts';
import { loadPuppets } from '../puppet/load.ts';
import { loadRigs } from '../rive/load.ts';
import type { RiveRuntime } from '../rive/runtime.ts';
import { RiveRuntimeBrowser } from '../rive/runtime-browser.ts';

const FPS = 30;

const CLIP_MARGIN = 12;

const drawView = (f: Frame, view: CastView, views: ReadonlyArray<CastView>, sheet: CastSheet) => {
  const { ctx } = f;
  ctx.save();
  clipCast(ctx, view, views, CLIP_MARGIN);
  ctx.translate(view.at[0], view.at[1]);
  ctx.scale(sheet.scale, sheet.scale);
  for (const d of castDrawOrder(view))
    if (d.kind === 'prop') d.prop.draw(ctx);
    else if (d.kind === 'figure') f.rive(view.rig.key, view.pose);
    else {
      ctx.save();
      ctx.translate(d.with.at[0], d.with.at[1]);
      f.rive(d.with.rig.key, d.with.pose);
      ctx.restore();
    }
  ctx.restore();
};

const castFilm = (film: string, member: string, m: CastModule): Film => {
  const kinds = m.CAST?.[member];
  const sheets = m.SHEETS[member];
  if (kinds === undefined || sheets === undefined)
    throw new Error(
      `${film}'s rigs/cast.ts has no rigs of ${member} (CAST)${m.CUTOUT?.[member] === undefined ? '' : `: his figure is his cut-out, ${castPage(film, member, 'cutout')}`}`,
    );
  const sized = Object.keys(kinds).map((kind) => {
    const sheet = sheets[kind];
    if (sheet === undefined)
      throw new Error(`${film}'s rigs/cast.ts gives ${member}'s ${kind} sheet no size and scale`);
    return [kind, sheet] as const;
  });
  const [first] = sized;
  if (first === undefined) throw new Error(`${film}'s rigs/cast.ts renders no sheet of ${member}`);
  const { width, height } = first[1];
  if (sized.some(([, s]) => s.width !== width || s.height !== height))
    throw new Error(`${member}'s sheets are not one size: a cast page draws them on one canvas`);
  const rigs = castRigs(kinds);
  return createFilm({
    title: `${member}'s cast render`,
    width,
    height,
    fps: FPS,
    paper: m.PAPER,
    shade: m.PAPER.base,
    finish: { vignette: 0, grain: 0 },
    scenes: sized.map(([kind, sheet]) => ({
      id: kind,
      min: 1,
      drift: 0 as const,
      rigs,
      draw: (f: Frame) => {
        const views = Object.values(kinds[kind] ?? {});
        for (const view of views) drawView(f, view, views, sheet);
      },
    })),
  });
};

const STILL_TICK = 0;

const drawCutout = (f: Frame, view: CutoutView, views: ReadonlyArray<CutoutView>, amp: number) => {
  const { ctx } = f;
  ctx.save();
  ctx.translate(CUTOUT_MARGIN[0], CUTOUT_MARGIN[1]);
  clipCast(ctx, view, views, CLIP_MARGIN);
  ctx.translate(view.at[0], view.at[1]);
  f.puppet(view.puppet.key, view.pose, { ...view.look, boil: STILL_TICK, amp });
  ctx.restore();
};

const cutoutCanvas = (film: string, member: string, m: CastModule, kind: string) => {
  const sheet = m.SHEETS[member]?.[kind];
  if (sheet === undefined)
    throw new Error(`${film}'s rigs/cast.ts gives ${member}'s ${kind} sheet no size`);
  return {
    width: sheet.width + 2 * CUTOUT_MARGIN[0],
    height: sheet.height + 2 * CUTOUT_MARGIN[1],
  };
};

const cutoutFilm = (
  film: string,
  member: string,
  m: CastModule,
  amp: number,
  only?: string,
): Film => {
  const all = m.CUTOUT?.[member];
  if (all === undefined)
    throw new Error(`${film}'s rigs/cast.ts has no cut-out of ${member} (CUTOUT)`);
  const lead = only ?? Object.keys(all)[0];
  if (lead === undefined || all[lead] === undefined)
    throw new Error(`${film}'s CUTOUT draws no ${only ?? ''} sheet of ${member}`);
  const { width, height } = cutoutCanvas(film, member, m, lead);
  const onCanvas = (kind: string) => {
    const sheet = m.SHEETS[member]?.[kind];
    return (
      sheet !== undefined &&
      sheet.width + 2 * CUTOUT_MARGIN[0] === width &&
      sheet.height + 2 * CUTOUT_MARGIN[1] === height
    );
  };
  const kinds = Object.fromEntries(
    Object.entries(all).filter(([kind]) => (only === undefined && onCanvas(kind)) || kind === only),
  );
  const puppets = cutoutPuppets(kinds);
  return createFilm({
    title: `${member}'s cut-out render`,
    width,
    height,
    fps: FPS,
    paper: m.PAPER,
    shade: m.PAPER.base,
    finish: { vignette: 0, grain: 0 },
    scenes: Object.keys(kinds).map((kind) => ({
      id: kind,
      min: 1,
      drift: 0 as const,
      puppets,
      draw: (f: Frame) => {
        const views = Object.values(kinds[kind] ?? {});
        for (const view of views) drawCutout(f, view, views, amp);
      },
    })),
  });
};

const EASE_FPS = 24;

const easeFilm = (film: string, member: string, m: CastModule): Film => {
  const eases = Object.values(m.EASES?.[member] ?? {});
  const [first] = eases;
  if (first === undefined)
    throw new Error(`${film}'s rigs/cast.ts has no ease of ${member} (EASES)`);
  const placed = eases.map((ease) => {
    const view = m.CUTOUT?.[member]?.[ease.kind]?.[ease.view];
    if (view === undefined)
      throw new Error(
        `${member}'s ease ${ease.from} to ${ease.to} moves ${ease.kind} ${ease.view}, which CUTOUT lacks`,
      );
    if (ease.fps !== EASE_FPS)
      throw new Error(
        `${member}'s ease ${ease.from} to ${ease.to} is ${ease.fps} fps; an ease page is ${EASE_FPS}`,
      );
    return { ease, view };
  });
  const { width, height } = cutoutCanvas(film, member, m, first.kind);
  return createFilm({
    title: `${member}'s eases`,
    width,
    height,
    fps: EASE_FPS,
    paper: m.PAPER,
    shade: m.PAPER.base,
    finish: { vignette: 0, grain: 0 },
    scenes: placed.map(({ ease, view }) => ({
      id: easeScene(ease.from, ease.to),
      min: ease.count / ease.fps,
      drift: 0 as const,
      puppets: { [ease.puppet.key]: ease.puppet },
      draw: (f: Frame) => {
        const i = Math.min(ease.count - 1, Math.max(0, Math.round(f.t * ease.fps)));
        const at = ease.frame(i);
        const { ctx } = f;
        ctx.save();
        ctx.translate(CUTOUT_MARGIN[0] + view.at[0], CUTOUT_MARGIN[1] + view.at[1]);
        f.puppet(ease.puppet.key, at.pose, at.look);
        ctx.restore();
      },
    })),
  });
};

export const castPages = (
  film: string,
  members: ReadonlyArray<string>,
  load: () => Promise<CastModule>,
  http: Layer.Layer<HttpClient.HttpClient> = FetchHttpClient.layer,
  rive: Layer.Layer<RiveRuntime, never, HttpClient.HttpClient> = RiveRuntimeBrowser,
): Record<
  string,
  Effect.Effect<Film, RigUnloadable | RigNameMissing | PuppetUnloadable, Scope.Scope>
> => {
  const page = ManagedRuntime.make(
    Layer.mergeAll(rive, PuppetImagesBrowser).pipe(Layer.provideMerge(http)),
  );
  return Object.fromEntries(
    members.flatMap((member) => [
      [
        castPage(film, member),
        Effect.flatMap(page.contextEffect, (services) =>
          Effect.promise(load).pipe(
            Effect.map((m) => castFilm(film, member, m)),
            Effect.flatMap(loadRigs),
            Effect.provideContext(services),
          ),
        ),
      ],
      ...CUTOUT_BOILS.flatMap((amp) =>
        [undefined, ...SheetKind.literals].map((only) => [
          castPage(film, member, 'cutout', amp, only),
          Effect.flatMap(page.contextEffect, (services) =>
            Effect.promise(load).pipe(
              Effect.map((m) => cutoutFilm(film, member, m, amp, only)),
              Effect.flatMap(loadPuppets),
              Effect.provideContext(services),
            ),
          ),
        ]),
      ),
      [
        easePage(film, member),
        Effect.flatMap(page.contextEffect, (services) =>
          Effect.promise(load).pipe(
            Effect.map((m) => easeFilm(film, member, m)),
            Effect.flatMap(loadPuppets),
            Effect.provideContext(services),
          ),
        ),
      ],
    ]),
  );
};
