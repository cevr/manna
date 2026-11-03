import { Schema } from 'effect';

export const ManifestHymn = Schema.Struct({
  hymn: Schema.Int,
  key: Schema.String,
  file: Schema.String,
  bytes: Schema.Int,
  sha256: Schema.String,
  md5: Schema.String,
  seconds: Schema.Finite,
  lufs: Schema.Finite,
  truePeak: Schema.Finite,
  lagMs: Schema.Finite,
  passed: Schema.Boolean,
});
export type ManifestHymn = typeof ManifestHymn.Type;

export const RecordingManifest = Schema.Struct({
  set: Schema.String,
  style: Schema.String,
  transpose: Schema.optional(Schema.Int),
  platform: Schema.String,
  configHash: Schema.String,
  tools: Schema.Struct({
    sfizz: Schema.Struct({ version: Schema.String, sha256: Schema.String }),
    nodeAv: Schema.Struct({ version: Schema.String }),
  }),
  hymns: Schema.Array(ManifestHymn),
});
export type RecordingManifest = typeof RecordingManifest.Type;

export const ManifestJson = Schema.fromJsonString(RecordingManifest);
