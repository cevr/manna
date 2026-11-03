import { Effect, Option, type Path, Schema } from 'effect';

export class LabRefused extends Schema.TaggedError<LabRefused>()('LabRefused', {
  reason: Schema.String,
}) {
  override get message() {
    return this.reason;
  }
}

export const LAB_SERVER = { name: 'film-lab', version: '0.1.0' } as const;

export const refused = <A, R>(self: Effect.Effect<A, { readonly message: string }, R>) =>
  Effect.mapError(self, (error) => LabRefused.make({ reason: error.message }));

export const FilmParam = Schema.Struct({
  film: Schema.String.annotate({ description: 'The film, by name (see `overview`).' }),
});

export const inside = (path: Path.Path, root: string, rel: string): Option.Option<string> => {
  if (path.isAbsolute(rel)) return Option.none();
  const at = path.resolve(root, rel);
  return Option.liftPredicate(at, (a) => a.startsWith(`${root}${path.sep}`));
};
