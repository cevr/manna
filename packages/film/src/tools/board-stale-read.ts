// The stale panels of a film's Board as the lab reads them: the script read
// fresh (`FreshFilm.script`, the lab keeps no film module), judged by the
// board store (`stalenessOf`), so the MCP's board read and the studio's Board
// name what a run would draw again. A script that cannot be read now names
// no panel stale, logged, so the board read and the studio stay whole.

import { Array as Arr, Effect, Option } from 'effect';
import { boardBeatOf } from './board-prompt.ts';
import { BoardStore } from './board-store.ts';
import type { FilmName } from './film-repo.ts';
import { FreshFilm } from './fresh-film.ts';

/** `film`'s stale picture panels, judged against its script as the file stands now; none when it cannot be read. */
export const staleInLab = Effect.fn('Board.staleInLab')(function* (film: FilmName) {
  const read = yield* (yield* FreshFilm).script(film).pipe(
    Effect.asSome,
    Effect.catch((e) =>
      Effect.as(Effect.logWarning(`board.stale film=${film} unread="${e.message}"`), Option.none()),
    ),
  );
  const store = yield* BoardStore;
  return yield* Option.match(read, {
    onNone: () => Effect.succeed([]),
    onSome: (script) =>
      store.stale(
        film,
        Arr.flatMap(script, (b) => Option.toArray(boardBeatOf(b))),
      ),
  });
});
