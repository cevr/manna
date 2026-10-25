// Where a cast member's record is found for a film, and the library reference
// a picture of the member takes from it. A film's own role
// (`src/films/<film>/cast/<member>/cast-sheet/`) wins over the library's
// (`src/library/cast/<member>/cast-sheet/`); the reference is the record's
// `castLock`, each file checked on disk, since a reference sent short would
// shift the numbers the prompt names the images by.

import { Effect, FileSystem, Path, Result, Schema } from 'effect';
import { CastSheetJson } from '../core/cast-record.ts';
import { type CastLock, castLock } from '../core/cast-lock.ts';
import { FileInvalid } from './errors.ts';
import { FilmFolder } from './film-repo.ts';

/** A member with no `cast-sheet.json` in the film's cast or the library's. */
class CastUnfound extends Schema.TaggedError<CastUnfound>()('CastUnfound', {
  member: Schema.String,
  looked: Schema.Array(Schema.String),
}) {
  override get message() {
    return `${this.member} has no cast-sheet.json: looked in ${this.looked.join(' and ')}`;
  }
}

/** A file the member's library reference names that is not on disk. */
class CastReferenceMissing extends Schema.TaggedError<CastReferenceMissing>()(
  'CastReferenceMissing',
  { member: Schema.String, file: Schema.String },
) {
  override get message() {
    return `${this.member}'s library reference ${this.file} is not on disk: keep its sheet (\`film concept keep\`) or put the record's reference images back in its cast-sheet folder`;
  }
}

/** The member's sheet folder: the film's own role's when it has one, else the library's. */
export const castFolder = Effect.fn('Cast.folder')(function* (film: string, member: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const dir = (yield* FilmFolder).paths(film).dir;
  const looked = [
    path.join(dir, 'cast', member, 'cast-sheet'),
    path.join(dir, '..', '..', 'library', 'cast', member, 'cast-sheet'),
  ];
  const found = yield* Effect.findFirst(looked, (folder) =>
    fs.exists(path.join(folder, 'cast-sheet.json')).pipe(Effect.orElseSucceed(() => false)),
  );
  return yield* Effect.fromOption(found).pipe(
    Effect.mapError(() => CastUnfound.make({ member, looked })),
  );
});

/** The member's library reference for `film`, each file as an absolute path and on disk. */
export const castReference = Effect.fn('Cast.reference')(function* (film: string, member: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const folder = yield* castFolder(film, member);
  const record = yield* fs
    .readFileString(path.join(folder, 'cast-sheet.json'))
    .pipe(
      Effect.flatMap((text) =>
        Effect.fromResult(
          Result.mapError(Schema.decodeResult(CastSheetJson)(text), (e) =>
            FileInvalid.make({ file: path.join(folder, 'cast-sheet.json'), reason: e.message }),
          ),
        ),
      ),
    );
  const lock: CastLock = castLock(record, folder);
  for (const file of lock.files)
    if (!(yield* fs.exists(file).pipe(Effect.orElseSucceed(() => false))))
      return yield* CastReferenceMissing.make({ member, file });
  return lock;
});
