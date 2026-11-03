import { Layer } from 'effect';
import type * as SqlClient from 'effect/sql/SqlClient';
import type { SqlError } from 'effect/sql/SqlError';

import { BibleDatabase } from '../bible-db/bible-database.js';
import { EGWCommentaryService } from '../egw-commentary/service.js';
import { EGWParagraphDatabase } from '../egw-db/book-database.js';
import { TopicService } from '../topics/service.js';
import { WritingsService } from '../writings/service.js';
import { WikiSectionSources } from './section-composer.js';

type Connection = Layer.Layer<SqlClient.SqlClient, SqlError>;

export const catalogOver = (connection: Connection): Layer.Layer<TopicService, SqlError> =>
  TopicService.Live.pipe(Layer.provide(connection));

export const sectionSourcesOver = (connections: {
  readonly bible: Connection;
  readonly catalog: Connection;
  readonly writings: Connection;
}): Layer.Layer<WikiSectionSources> => {
  const writingsDatabase = EGWParagraphDatabase.layerCore.pipe(Layer.provide(connections.writings));
  return WikiSectionSources.Live.pipe(
    Layer.provide(catalogOver(connections.catalog)),
    Layer.provide(BibleDatabase.layer.pipe(Layer.provide(connections.bible))),
    Layer.provide(WritingsService.Live.pipe(Layer.provide(writingsDatabase))),
    Layer.provide(EGWCommentaryService.Live.pipe(Layer.provide(writingsDatabase))),
    WikiSectionSources.NotWiredOnCorpusAbsence,
    Layer.orDie,
  );
};
