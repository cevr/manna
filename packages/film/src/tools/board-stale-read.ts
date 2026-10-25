// The stale panels of a film's Board as the lab reads them: the script read
// fresh (`FreshFilm.script`, the lab keeps no film module), judged by the
// board store (`stalenessOf`), so the MCP's board read and the studio's Board
// name what a run would draw again.

import { Array as Arr, Effect, Option } from 'effect';
import { boardBeatOf } from './board-prompt.ts';
import { BoardStore } from './board-store.ts';
import type { FilmName } from './film-repo.ts';
import { FreshFilm } from './fresh-film.ts';

/** `film`'s stale picture panels, judged against its script as the file stands now. */
export const staleInLab = Effect.fn('Board.staleInLab')(function* (film: FilmName) {
  const script = yield* (yield* FreshFilm).script(film);
  const beats = Arr.flatMap(script, (b) => Option.toArray(boardBeatOf(b)));
  return yield* (yield* BoardStore).stale(film, beats);
});
