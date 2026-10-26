// A film's writes as the lab's agent tools answer them: each write named one
// way (the file it changed, what it set, the change it made), with
// `film check --static` after it (`writeAnswer`, which the `tweak` command's
// scene writes in `tweak-mcp.ts` answer with).

import { Effect, Option, Path } from 'effect';
import { type LabWrite } from '../core/schema.ts';
import { FilmFolder } from './film-repo.ts';
import { FreshFilm } from './fresh-film.ts';
import { type Change, type Wrote } from './source-writer.ts';

/** `film check --static` as the lab shows it, in a fresh process: a check that cannot run is itself a finding. */
const findings = (film: string) => FreshFilm.use((fresh) => fresh.check(film, 'static'));

/** A file of `film`'s as an answer names it: relative to the film's folder. */
const relativeTo = Effect.fn('lab.relativeTo')(function* (film: string) {
  const path = yield* Path.Path;
  const dir = (yield* FilmFolder).paths(film).dir;
  return (file: string) => path.relative(dir, file);
});

/** Where a write landed as an answer names it: its scene (none for a film's own file), its file (`relative`). */
const placed = (
  relative: (file: string) => string,
  at: { readonly scene: Option.Option<string>; readonly file: string },
) => ({
  ...Option.match(at.scene, { onNone: () => ({}), onSome: (scene) => ({ scene }) }),
  file: relative(at.file),
});

/** A change as an answer names it: where it landed, what it set, and its id (what an undo asks for). */
const changeNamed = (relative: (file: string) => string, c: Change) => ({
  ...placed(relative, c),
  target: c.target,
  change: c.id,
});

/** `wrote` as every answer names it: the change it made, else where it landed and what it set `(already so)`. */
const named = (relative: (file: string) => string, wrote: Wrote) =>
  Option.match(wrote.change, {
    onNone: () => ({ ...placed(relative, wrote), target: `${wrote.target} (already so)` }),
    onSome: (c) => changeNamed(relative, c),
  });

/**
 * What a write answers: the write (where it landed, what it set, its
 * change), the value as the file now reads (`read`), the check.
 */
export const writeAnswer = Effect.fn('lab.writeAnswer')(function* <R>(
  film: string,
  wrote: Wrote,
  read: Effect.Effect<
    Partial<Pick<LabWrite, 'span' | 'resolved' | 'unresolved' | 'knob' | 'mixed'>>,
    never,
    R
  >,
) {
  const fields = yield* Effect.map(relativeTo(film), (relative) => named(relative, wrote));
  const found = yield* findings(film);
  const answer: LabWrite = { ...fields, ...(yield* read), findings: found };
  return answer;
});
