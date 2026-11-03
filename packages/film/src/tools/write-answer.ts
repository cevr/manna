import { Effect, Option, Path } from 'effect';
import { type LabWrite } from '../core/schema.ts';
import { FilmFolder } from './film-repo.ts';
import { FreshFilm } from './fresh-film.ts';
import { type Change, type Wrote } from './source-writer.ts';

const findings = (film: string) => FreshFilm.use((fresh) => fresh.check(film, 'static'));

const relativeTo = Effect.fn('lab.relativeTo')(function* (film: string) {
  const path = yield* Path.Path;
  const dir = (yield* FilmFolder).paths(film).dir;
  return (file: string) => path.relative(dir, file);
});

const placed = (
  relative: (file: string) => string,
  at: { readonly scene: Option.Option<string>; readonly file: string },
) => ({
  ...Option.match(at.scene, { onNone: () => ({}), onSome: (scene) => ({ scene }) }),
  file: relative(at.file),
});

const changeNamed = (relative: (file: string) => string, c: Change) => ({
  ...placed(relative, c),
  target: c.target,
  change: c.id,
});

const named = (relative: (file: string) => string, wrote: Wrote) =>
  Option.match(wrote.change, {
    onNone: () => ({ ...placed(relative, wrote), target: `${wrote.target} (already so)` }),
    onSome: (c) => changeNamed(relative, c),
  });

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
