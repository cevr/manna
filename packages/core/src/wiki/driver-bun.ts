import * as SqliteBun from '@effect/sql-sqlite-bun/SqliteClient';

import { immutableFilename, type ArtifactSqlClientLayer } from './service-artifact.js';

export const bunArtifactDriver: ArtifactSqlClientLayer = (filename) =>
  SqliteBun.layer({
    filename: immutableFilename(filename),
    readonly: true,
    readwrite: false,
    create: false,
    disableWAL: true,
  });
