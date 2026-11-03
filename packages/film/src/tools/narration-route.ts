import { Effect, FileSystem, Option, Path } from 'effect';
import { filmMarks } from './film-repo.ts';

const NARRATION_URL = /^\/films\/([^/]+)\/narration\/([^/]+)$/;

export const isNarrationUrl = (pathname: string): boolean => NARRATION_URL.test(pathname);

const NARRATION_FILE = /^[\w-][\w.-]*$/;

const named = (pathname: string) =>
  Option.flatMap(Option.fromNullishOr(NARRATION_URL.exec(pathname)), ([, film, file]) =>
    Option.filter(
      Option.all([Option.fromUndefinedOr(film), Option.fromUndefinedOr(file)]),
      ([, name]) => NARRATION_FILE.test(name),
    ),
  );

const exists = (file: string) =>
  Effect.flatMap(FileSystem.FileSystem, (fs) =>
    fs.exists(file).pipe(Effect.orElseSucceed(() => false)),
  );

export const narrationPath = Effect.fn('narrationPath')(function* (
  films: string,
  pathname: string,
) {
  const path = yield* Path.Path;
  for (const [film, name] of Option.toArray(named(pathname)))
    for (const mark of filmMarks(films, film))
      if (yield* exists(mark)) return Option.some(path.join(films, film, 'narration', name));
  return Option.none<string>();
});

export const narrationFile = Effect.fn('narrationFile')(function* (
  films: string,
  pathname: string,
) {
  for (const file of Option.toArray(yield* narrationPath(films, pathname)))
    if (yield* exists(file)) return Option.some(file);
  return Option.none<string>();
});

const BOARD_URL =
  /^\/films\/([^/]+)\/board(?:\.json|\/([A-Za-z0-9_][A-Za-z0-9_.-]*\.(?:png|jpe?g|webp)))$/;

export const isBoardUrl = (pathname: string): boolean => BOARD_URL.test(pathname);

export const boardFile = Effect.fn('boardFile')(function* (films: string, pathname: string) {
  const path = yield* Path.Path;
  for (const [, film, image] of Option.toArray(Option.fromNullishOr(BOARD_URL.exec(pathname))))
    for (const name of Option.toArray(Option.fromUndefinedOr(film)))
      for (const mark of filmMarks(films, name))
        if (yield* exists(mark)) {
          const file = Option.match(Option.fromUndefinedOr(image), {
            onNone: () => path.join(films, name, 'board.json'),
            onSome: (img) => path.join(films, name, 'board', img),
          });
          if (yield* exists(file)) return Option.some(file);
        }
  return Option.none<string>();
});
