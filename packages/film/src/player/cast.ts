// A member's cast render page (`<film>/cast/<member>`): each kind of his
// kept sheets a scene of its own, a canvas the sheet's size with each kept
// view's rig drawn in its pose, laid in its kept box at the sheet's one scale
// (`CastTable`, the film's `rigs/cast.ts`), on the film's paper, with no
// light, vignette, grain or breath of the camera over it. It is a film like
// any other, made by `createFilm` and drawn by `drawRig` through `f.rive`,
// its rigs loaded as a film's are (`loadRigs`): the render is what a scene
// draws, and `film concept render` takes a still of each scene
// (`tools/cast-render.ts`).

import { Effect, Layer, ManagedRuntime, type Scope } from 'effect';
import { FetchHttpClient, type HttpClient } from 'effect/http';
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

/** The rate a cast page is laid at: any, since each scene is one still. */
const FPS = 30;

/** How far past its kept box a view is drawn, sheet pixels: a line the figure lays just past the box (a crown's ink) shows on the sheet, where the crop by the box can be read against it. */
const CLIP_MARGIN = 12;

/** One view drawn on its sheet beside `views` (the sheet's every view): clipped to its box and `CLIP_MARGIN` round it less the others' boxes (`clipCast`), its rig's origin at `at`, at the sheet's scale, its props and the rigs drawn with it about that origin, in their order (`castDrawOrder`). */
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

/** `member`'s cast render as a film: a scene a kind of his sheets, each the size of the sheet. */
const castFilm = (film: string, member: string, m: CastModule): Film => {
  const kinds = m.CAST[member];
  const sheets = m.SHEETS[member];
  if (kinds === undefined || sheets === undefined)
    throw new Error(`${film}'s rigs/cast.ts has no cast render of ${member}`);
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

/**
 * A cut-out still's look: the boil's tick 0, the tick an ease starts on, so
 * a still is its ease's first frame where nothing has moved.
 */
const STILL_TICK = 0;

/** One cut-out view drawn on its sheet beside `views`: clipped as a rig's view is, its puppet's origin at `at`, at the sheet's own pixels, the sheet standing `CUTOUT_MARGIN` into the page, boiling `amp` px. */
const drawCutout = (f: Frame, view: CutoutView, views: ReadonlyArray<CutoutView>, amp: number) => {
  const { ctx } = f;
  ctx.save();
  ctx.translate(CUTOUT_MARGIN[0], CUTOUT_MARGIN[1]);
  clipCast(ctx, view, views, CLIP_MARGIN);
  ctx.translate(view.at[0], view.at[1]);
  f.puppet(view.puppet.key, view.pose, { ...view.look, boil: STILL_TICK, amp });
  ctx.restore();
};

/** `member`'s `kind` sheet as a cut-out page lays it: the sheet grown by `CUTOUT_MARGIN` each side. */
const cutoutCanvas = (film: string, member: string, m: CastModule, kind: string) => {
  const sheet = m.SHEETS[member]?.[kind];
  if (sheet === undefined)
    throw new Error(`${film}'s rigs/cast.ts gives ${member}'s ${kind} sheet no size`);
  return {
    width: sheet.width + 2 * CUTOUT_MARGIN[0],
    height: sheet.height + 2 * CUTOUT_MARGIN[1],
  };
};

/** `member`'s cut-out render as a film: a scene each kind his `CUTOUT` views are of, each the size of the sheet grown by `CUTOUT_MARGIN`, each view drawn by its puppet, boiling `amp` px. */
const cutoutFilm = (film: string, member: string, m: CastModule, amp: number): Film => {
  const kinds = m.CUTOUT?.[member];
  if (kinds === undefined)
    throw new Error(`${film}'s rigs/cast.ts has no cut-out of ${member} (CUTOUT)`);
  const [first] = Object.keys(kinds);
  if (first === undefined) throw new Error(`${film}'s CUTOUT draws no sheet of ${member}`);
  const { width, height } = cutoutCanvas(film, member, m, first);
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

/** The rate an ease page is laid at: every ease's own, checked. */
const EASE_FPS = 24;

/**
 * `member`'s eases as a film: a scene an ease (`easeScene`), its frames the
 * ease's, each drawn from its index alone, the view it moves standing where
 * the cut-out page stands it, on the same canvas and paper, unclipped (a
 * raised arm reaches past its box).
 */
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

/**
 * The player's entries for a film's cast renders, its pages a member: his
 * rigs under `<film>/cast/<member>`, and his puppets (`CUTOUT`) under
 * `<film>/cast/<member>/cutout` (at the house boil; at none under
 * `…/cutout/boil-0`, `CUTOUT_BOILS`), and his eases (`EASES`) under
 * `<film>/cast/<member>/ease`. Spread them, beside the films, into the
 * pages the app mounts. A page loads its member's table (`load`, the film's
 * `rigs/cast.ts`) and the rigs or puppets it draws, through `rive` (the
 * page's Rive runtimes unless given) or the page's image decoder, into the
 * scope its load runs in.
 */
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
      ...CUTOUT_BOILS.map((amp) => [
        castPage(film, member, 'cutout', amp),
        Effect.flatMap(page.contextEffect, (services) =>
          Effect.promise(load).pipe(
            Effect.map((m) => cutoutFilm(film, member, m, amp)),
            Effect.flatMap(loadPuppets),
            Effect.provideContext(services),
          ),
        ),
      ]),
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
