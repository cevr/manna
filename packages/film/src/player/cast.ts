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
  castDrawOrder,
  castPage,
  castRigs,
} from '../canvas/cast.ts';
import { type Film, type Frame, createFilm } from '../canvas/film.ts';
import { loadRigs } from '../rive/load.ts';
import type { RiveRuntime } from '../rive/runtime.ts';
import { RiveRuntimeBrowser } from '../rive/runtime-browser.ts';

/** The rate a cast page is laid at: any, since each scene is one still. */
const FPS = 30;

/** How far past its kept box a view is drawn, sheet pixels: a line the figure lays just past the box (a crown's ink) shows on the sheet, where the crop by the box can be read against it. */
const CLIP_MARGIN = 12;

/** One view drawn on its sheet: clipped to its box and `CLIP_MARGIN` round it, its rig's origin at `at`, at the sheet's scale, its props and the rigs drawn with it about that origin, in their order (`castDrawOrder`). */
const drawView = (f: Frame, view: CastView, sheet: CastSheet) => {
  const { ctx } = f;
  const [x0, y0, x1, y1] = view.box;
  ctx.save();
  ctx.beginPath();
  ctx.rect(
    x0 - CLIP_MARGIN,
    y0 - CLIP_MARGIN,
    x1 - x0 + 2 * CLIP_MARGIN,
    y1 - y0 + 2 * CLIP_MARGIN,
  );
  ctx.clip();
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
        for (const view of Object.values(kinds[kind] ?? {})) drawView(f, view, sheet);
      },
    })),
  });
};

/**
 * The player's entries for a film's cast renders, one page each under
 * `<film>/cast/<member>`: spread them, beside the films, into the pages the
 * app mounts. A page loads its member's table (`load`, the film's
 * `rigs/cast.ts`) and the rigs it draws, through `rive` (the page's Rive
 * runtimes unless given), into the scope its load runs in.
 */
export const castPages = (
  film: string,
  members: ReadonlyArray<string>,
  load: () => Promise<CastModule>,
  http: Layer.Layer<HttpClient.HttpClient> = FetchHttpClient.layer,
  rive: Layer.Layer<RiveRuntime, never, HttpClient.HttpClient> = RiveRuntimeBrowser,
): Record<string, Effect.Effect<Film, RigUnloadable | RigNameMissing, Scope.Scope>> => {
  const page = ManagedRuntime.make(Layer.provideMerge(rive, http));
  return Object.fromEntries(
    members.map((member) => [
      castPage(film, member),
      Effect.flatMap(page.contextEffect, (services) =>
        Effect.promise(load).pipe(
          Effect.map((m) => castFilm(film, member, m)),
          Effect.flatMap(loadRigs),
          Effect.provideContext(services),
        ),
      ),
    ]),
  );
};
