/** Bun runtime composition for the driver-agnostic `StudyService`.
 *
 *  The two corpora the bundle reads, opened the way every other Bun consumer of
 *  them opens them: `bible.db` read-only and immutable, the writings library
 *  read-write because `EGWParagraphDatabase.layerCore` initializes its schema on
 *  construction.
 *
 *  Nothing about what a bundle contains is decided here — this module supplies
 *  drivers, exactly as `wiki/service-bun.ts` does for the wiki.
 */

import * as SqliteBun from '@effect/sql-sqlite-bun/SqliteClient';
import { Layer } from 'effect';

import { BibleDatabase } from '../bible-db/bible-database.js';
import { EGWCommentaryService } from '../egw-commentary/service.js';
import { EGWParagraphDatabase } from '../egw-db/book-database.js';
import { immutableFilename } from '../wiki/service-artifact.js';
import { StudyService } from './service.js';

export const layerBunStudy = (input: {
  readonly bible: string;
  readonly writings: string;
}): Layer.Layer<StudyService> => {
  const writings = EGWParagraphDatabase.layerCore.pipe(
    Layer.provide(SqliteBun.layer({ filename: input.writings, create: false })),
  );
  return StudyService.Live.pipe(
    Layer.provide(
      BibleDatabase.layer.pipe(
        Layer.provide(
          SqliteBun.layer({
            filename: immutableFilename(input.bible),
            readonly: true,
            readwrite: false,
            create: false,
            disableWAL: true,
          }),
        ),
      ),
    ),
    Layer.provide(EGWCommentaryService.Live.pipe(Layer.provide(writings))),
    Layer.orDie,
  );
};
