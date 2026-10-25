// The narration route, `/films/<film>/narration/<file>`, for the player, the
// lab and the review page alike: which file a URL names. The film is one of
// the films now (one of its `filmMarks` exists, read per request, so a film made
// while the server runs is served), the file one directly in its
// `narration/` (never `attempts/`, never a path, never a dotfile) and on
// disk. Any other URL names none, a 404. The app's server answers the file;
// the studio rewrites these files in place (a take kept, the track remixed),
// so it serves them uncached. The Board a render page draws (`film render
// --board`) is served the same way: `/films/<film>/board.json` and an image
// directly in its `board/` (`boardFile`, the page's `boardUrls`).

import { Effect, FileSystem, Option, Path } from 'effect';
import { filmMarks } from './film-repo.ts';

/** A narration URL: `/films/<film>/narration/<file>`, the file directly in the folder. */
const NARRATION_URL = /^\/films\/([^/]+)\/narration\/([^/]+)$/;

/** Whether `pathname` is a narration URL, the route's and no page's: `/films/<film>/narration/<file>`. */
export const isNarrationUrl = (pathname: string): boolean => NARRATION_URL.test(pathname);

/** A file name as it may sit in a narration folder: no path, no dotfile. */
const NARRATION_FILE = /^[\w-][\w.-]*$/;

/** The film and file a narration URL names, when the file's name is a plain file's. */
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

/**
 * The file `pathname` names under the films folder `films`, of one of the
 * films now, whether or not it is on disk yet (a film's track before its
 * first mix): what a page asked for, to watch for.
 */
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

/** The file `pathname` names under the films folder `films`, if it is one the route serves. */
export const narrationFile = Effect.fn('narrationFile')(function* (
  films: string,
  pathname: string,
) {
  for (const file of Option.toArray(yield* narrationPath(films, pathname)))
    if (yield* exists(file)) return Option.some(file);
  return Option.none<string>();
});

/** A board URL: `/films/<film>/board.json`, or `/films/<film>/board/<image>`, the image directly in the folder. */
const BOARD_URL =
  /^\/films\/([^/]+)\/board(?:\.json|\/([A-Za-z0-9_][A-Za-z0-9_.-]*\.(?:png|jpe?g|webp)))$/;

/** Whether `pathname` is a board URL: `/films/<film>/board.json` or an image of its `board/`. */
export const isBoardUrl = (pathname: string): boolean => BOARD_URL.test(pathname);

/** The file a board URL names under the films folder `films`, of one of the films now and on disk. */
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
