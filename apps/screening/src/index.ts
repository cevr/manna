/**
 * The screening site as the publisher reads it: a film's manifest and its
 * keys in the bucket (`./manifest.ts`), and the plan of what publishing a
 * version writes (`./publish.ts`). The pages are Solid JSX: import
 * `@manna/screening/solid-ssr` before this module.
 */
export {
  type AssetExt,
  type FilmManifest,
  FilmManifestJson,
  isManifestKey,
  PATHS,
  VERSION_LABELS,
  VERSION_NAMES,
  VersionName,
  versionsOf,
} from './manifest.ts';
export { type Material, type MaterialFile, type MaterialPanel, publication } from './publish.ts';
