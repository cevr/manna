import * as SqliteBun from '@effect/sql-sqlite-bun/SqliteClient';
import { Cause, Layer, type FileSystem } from 'effect';
import type { SqlError } from 'effect/sql/SqlError';

import type { TopicService } from '../topics/service.js';
import { bunArtifactDriver } from './driver-bun.js';
import { immutableFilename, layerArtifactOrAbsent } from './service-artifact.js';
import { LookupService } from './lookup-service.js';
import type { WikiSectionSources } from './section-composer.js';
import { catalogOver, sectionSourcesOver } from './section-sources.js';
import { WikiService } from './service.js';

const layerBunOrAbsent = (
  filename: string,
): Layer.Layer<WikiService, never, FileSystem.FileSystem | TopicService | WikiSectionSources> =>
  layerArtifactOrAbsent(bunArtifactDriver, filename);

const layerBunSectionSources = (input: {
  readonly bible: string;
  readonly writings: string;
}): Layer.Layer<WikiSectionSources> =>
  sectionSourcesOver({
    bible: readOnlySqlite(input.bible),
    catalog: readOnlySqlite(input.bible),
    writings: SqliteBun.layer({ filename: input.writings, create: false }),
  });

const layerBunCatalog = (bible: string): Layer.Layer<TopicService, SqlError> =>
  catalogOver(readOnlySqlite(bible));

const readOnlySqlite = (filename: string) =>
  SqliteBun.layer({
    filename: immutableFilename(filename),
    readonly: true,
    readwrite: false,
    create: false,
    disableWAL: true,
  });

export const layerBunWithCatalog = (input: {
  readonly topics: string;
  readonly bible: string;
  readonly writings: string;
}): Layer.Layer<WikiService, never, FileSystem.FileSystem> =>
  layerBunOrAbsent(input.topics).pipe(
    Layer.provide(layerBunSectionSources({ bible: input.bible, writings: input.writings })),
    Layer.provide(layerBunCatalog(input.bible)),
    Layer.catchCause((cause) =>
      WikiService.Broken({ operation: 'open-catalog', message: Cause.pretty(cause) }),
    ),
  );

export const layerBunLookup = (input: {
  readonly topics: string;
  readonly bible: string;
  readonly writings: string;
}): Layer.Layer<LookupService, never, FileSystem.FileSystem> => {
  const sections = layerBunSectionSources({ bible: input.bible, writings: input.writings });
  const catalog = layerBunCatalog(input.bible);
  const wiki = layerBunOrAbsent(input.topics).pipe(
    Layer.provide(sections),
    Layer.provide(catalog),
    Layer.catchCause((cause) =>
      WikiService.Broken({ operation: 'open-catalog', message: Cause.pretty(cause) }),
    ),
  );
  return LookupService.Live.pipe(Layer.provide(wiki), Layer.provide(sections));
};
