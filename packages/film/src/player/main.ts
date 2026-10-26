// The browser player, framework-free. A page with a film on it stages it
// here (`stageFilm`): the render page (`render.ts`, `mountRender`). So the
// render page loads no Solid.

import type { Film } from '../canvas/film.ts';
import type { FilmUnloadable } from './narrated.ts';
import { Effect, Option, Scope } from 'effect';
import { parseHref } from '@manna/url-state';
import { filmOfPage } from '../core/api.ts';

/**
 * An app's film registry: each film's name and its load, which gives the
 * film with what it holds while it draws (its Rive rigs, `loadRigs`) in the
 * scope it runs in: whoever runs the load owns their lifetime, closing that
 * scope frees them, and stopping the load stops it where it is, releasing
 * what it had acquired.
 */
export type Films = Record<string, Effect.Effect<Film, FilmUnloadable, Scope.Scope>>;

/** A page's film, loaded and on the stage: its name, its stage and canvas, and the captions switch. */
export interface Staged {
  readonly name: string;
  readonly film: Film;
  /** The element the canvas stands in, which a page places. */
  readonly stage: HTMLElement;
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  readonly captions: { on: boolean };
}

/**
 * The film the page at `href` is on: its path's (`/films/<film>/…`, a film's
 * export page on the lab among them), else the PreviewServer's render page's
 * `?film=<name>`, else the registry's first.
 */
const filmName = (href: string, films: Films): string =>
  Option.getOrElse(
    Option.orElse(filmOfPage(href), () =>
      Option.fromNullishOr(parseHref(href).searchParams.get('film')),
    ),
    () => Object.keys(films)[0] ?? '',
  );

/**
 * Load the film of the page at `href` (its loader gives it with the faces it
 * draws in asked for, `narratedFilms`; what draws it waits for them,
 * `pictureFacesWait`, so text measures true from the first frame: a short's
 * hook and captions are measured once, on the first frame that draws them),
 * and put the film's canvas on the stage, undrawn; its captions are on
 * unless an export page says `captions=0`. The page's title is the shell's
 * (`page-shell.tsx`).
 */
export const stageFilm = async (films: Films, href: string): Promise<Staged> => {
  const name = filmName(href, films);
  const captions = { on: parseHref(href).searchParams.get('captions') !== '0' };
  const load = films[name];
  if (load === undefined)
    throw new Error(`unknown film "${name}"; have ${Object.keys(films).join(', ')}`);
  // The page's own scope, never closed: the staged film's rigs live as long as the page.
  const film = await Effect.runPromise(Scope.provide(load, Scope.makeUnsafe()));

  const canvas = document.createElement('canvas');
  canvas.width = film.width;
  canvas.height = film.height;
  // Not `willReadFrequently`: Chrome moves a context left unset back to
  // software after its first read, and the one-pixel read after each frame
  // (`drawn`) is one, so a page would draw its first frames on the GPU and the
  // rest in software, and the segments' encodes would not join.
  const ctx = canvas.getContext('2d', { willReadFrequently: false });
  if (ctx === null) throw new Error('2d context unavailable');
  const stage = document.createElement('div');
  stage.className = 'stage';
  stage.append(canvas);
  document.body.append(stage);
  return { name, film, stage, canvas, ctx, captions };
};
