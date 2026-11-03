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
