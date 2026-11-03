import type { Film } from '../canvas/film.ts';
import type { FilmUnloadable } from './narrated.ts';
import { Effect, Option, Scope } from 'effect';
import { parseHref } from '@manna/url-state';
import { filmOfPage } from '../core/api.ts';

export type Films = Record<string, Effect.Effect<Film, FilmUnloadable, Scope.Scope>>;

export interface Staged {
  readonly name: string;
  readonly film: Film;
  readonly stage: HTMLElement;
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  readonly captions: { on: boolean };
}

const filmName = (href: string, films: Films): string =>
  Option.getOrElse(
    Option.orElse(filmOfPage(href), () =>
      Option.fromNullishOr(parseHref(href).searchParams.get('film')),
    ),
    () => Object.keys(films)[0] ?? '',
  );

export const stageFilm = async (films: Films, href: string): Promise<Staged> => {
  const name = filmName(href, films);
  const captions = { on: parseHref(href).searchParams.get('captions') !== '0' };
  const load = films[name];
  if (load === undefined)
    throw new Error(`unknown film "${name}"; have ${Object.keys(films).join(', ')}`);
  const film = await Effect.runPromise(Scope.provide(load, Scope.makeUnsafe()));

  const canvas = document.createElement('canvas');
  canvas.width = film.width;
  canvas.height = film.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: false });
  if (ctx === null) throw new Error('2d context unavailable');
  const stage = document.createElement('div');
  stage.className = 'stage';
  stage.append(canvas);
  document.body.append(stage);
  return { name, film, stage, canvas, ctx, captions };
};
