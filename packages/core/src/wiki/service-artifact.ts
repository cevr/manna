import { Cause, Effect, FileSystem, Layer, Result } from 'effect';
import type * as SqlClient from 'effect/sql/SqlClient';

import type { TopicService } from '../topics/service.js';
import type { WikiSectionSources } from './section-composer.js';
import { WikiService } from './service.js';

export type ArtifactSqlClientLayer = (
  filename: string,
) => Layer.Layer<SqlClient.SqlClient, unknown, never>;

const layerArtifact = (
  driver: ArtifactSqlClientLayer,
  filename: string,
): Layer.Layer<WikiService, never, TopicService | WikiSectionSources> =>
  WikiService.Live.pipe(
    Layer.provide(driver(filename)),
    Layer.catchCause((cause) =>
      WikiService.Broken({ operation: 'open-artifact', message: Cause.pretty(cause) }),
    ),
  );

export const layerArtifactOrAbsent = (
  driver: ArtifactSqlClientLayer,
  filename: string,
): Layer.Layer<WikiService, never, FileSystem.FileSystem | TopicService | WikiSectionSources> =>
  Layer.unwrap(
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const found = yield* fs.exists(filename).pipe(
        Effect.map(Result.succeed),
        Effect.catchCause((cause) => Effect.succeed(Result.fail(Cause.pretty(cause)))),
      );
      if (Result.isFailure(found)) {
        return WikiService.Broken({ operation: 'stat-artifact', message: found.failure });
      }
      if (!found.success) return WikiService.Absent;
      return layerArtifact(driver, filename);
    }),
  );

export { immutableFileUri as immutableFilename } from '../db/immutable-uri.js';
