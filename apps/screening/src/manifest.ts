/**
 * What the screening site holds, as data: each film's manifest
 * (`<film>/manifest.json` in the bucket), the versions the owner published
 * of it, and the bucket keys of every file a version shows.
 *
 * A film has at most one version of each name (`board`, `render`, `final`):
 * publishing a version again replaces it, with its new date. The site's
 * pages are drawn from these manifests alone (`./pages.tsx`), so a manifest
 * read back draws the same pages it was written with.
 *
 * Every file a version shows is named by the first 16 hex digits of its
 * bytes' sha256 (`<film>/<version>/<hash>.<ext>`): a re-published file gets a
 * new name, so a browser or the edge never serves a stale copy under an old
 * one.
 */
import { Array as Arr, Option, Order, Schema } from 'effect';

/** The versions a film is published as. */
export const VERSION_NAMES = ['final', 'render', 'board'] as const;

export const VersionName = Schema.Literals(VERSION_NAMES);
export type VersionName = typeof VersionName.Type;

/** What each version is called on its card and page. */
export const VERSION_LABELS: Record<VersionName, string> = {
  board: 'The Board',
  render: 'The render',
  final: 'The final film',
};

/** A film's folder name: what its path on the site and its keys in the bucket start with. */
export const FilmId = Schema.String.check(
  Schema.isPattern(/^[a-z0-9][a-z0-9-]*$/, {
    message: 'a film folder name: lower-case letters, digits and `-`',
  }),
);

/** The media types a version's files are served as, by their extension. */
export const ASSET_TYPES = {
  mp4: 'video/mp4',
  jpg: 'image/jpeg',
  png: 'image/png',
} as const;

export const AssetExt = Schema.Literals(['mp4', 'jpg', 'png']);
export type AssetExt = typeof AssetExt.Type;

/** A file in the bucket: its key and its size in bytes. */
export const Asset = Schema.Struct({
  key: Schema.String,
  bytes: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
});
export type Asset = typeof Asset.Type;

/** One kept Board panel: its picture and the beat it belongs to. */
export const Panel = Schema.Struct({
  beat: Schema.String,
  image: Asset,
});
export type Panel = typeof Panel.Type;

/** One published version of a film. */
export const Version = Schema.Struct({
  name: VersionName,
  /** When it was published (ISO 8601): what orders a film's versions. */
  at: Schema.String,
  /** The publisher's local date (`YYYY-MM-DD`): what its card says. */
  day: Schema.String.check(Schema.isPattern(/^\d{4}-\d{2}-\d{2}$/)),
  video: Asset,
  poster: Asset,
  /** The Board's kept panels, in the film's order; empty for any other version. */
  panels: Schema.Array(Panel),
});
export type Version = typeof Version.Type;

/** A film's manifest: its title and its published versions. */
export const FilmManifest = Schema.Struct({
  film: FilmId,
  title: Schema.String,
  versions: Schema.Array(Version),
});
export type FilmManifest = typeof FilmManifest.Type;

/** A manifest as the bucket keeps it. */
export const FilmManifestJson = Schema.fromJsonString(FilmManifest);

/** The bucket key of `film`'s manifest. */
export const manifestKey = (film: string): string => `${film}/manifest.json`;

/** Whether `key` is a film's manifest, and so names a film the site holds. */
export const isManifestKey = (key: string): boolean =>
  /^[a-z0-9][a-z0-9-]*\/manifest\.json$/.test(key);

/** The bucket keys of the pages: the index, a film's folder, one version. */
export const PAGE_KEYS = {
  index: 'index.html',
  folder: (film: string) => `${film}/index.html`,
  version: (film: string, version: VersionName) => `${film}/${version}/index.html`,
} as const;

/** The site paths of the pages, as their links name them. */
export const PATHS = {
  index: '/',
  folder: (film: string) => `/${film}/`,
  version: (film: string, version: VersionName) => `/${film}/${version}/`,
  asset: (key: string) => `/${key}`,
} as const;

/** How many hex digits of a file's sha256 name it: 64 bits, unique among a film's files. */
const NAME_DIGITS = 16;

/** The bucket key of a file of `film`'s `version`, named by its bytes' sha256. */
export const assetKey = (
  film: string,
  version: VersionName,
  sha256: string,
  ext: AssetExt,
): string => `${film}/${version}/${sha256.slice(0, NAME_DIGITS).toLowerCase()}.${ext}`;

/** Newest first, by when each was published. */
const newestFirst = Order.flip(Order.mapInput(Order.String, (version: Version) => version.at));

/** `film`'s versions, newest first. */
export const versionsOf = (film: FilmManifest): ReadonlyArray<Version> =>
  Arr.sort(film.versions, newestFirst);

/** `film`'s newest version; none for a film with none published. */
export const newestOf = (film: FilmManifest): Option.Option<Version> => Arr.head(versionsOf(film));

/** `film`'s version `name`, when it is published. */
export const versionNamed = (film: FilmManifest, name: VersionName): Option.Option<Version> =>
  Arr.findFirst(film.versions, (version) => version.name === name);

/**
 * `film` with `version` published: in place of the version of the same name
 * when it had one, beside the others otherwise, under `title`.
 */
export const withVersion = (
  film: Option.Option<FilmManifest>,
  id: string,
  title: string,
  version: Version,
): FilmManifest => {
  const others = Option.match(film, {
    onNone: (): ReadonlyArray<Version> => [],
    onSome: (found) => found.versions.filter((each) => each.name !== version.name),
  });
  return { film: id, title, versions: [...others, version] };
};

/** The index's films: each with a published version, the most recently published first. */
export const indexOf = (
  films: ReadonlyArray<FilmManifest>,
): ReadonlyArray<{ readonly film: FilmManifest; readonly newest: Version }> =>
  Arr.sort(
    films.flatMap((film) =>
      Option.toArray(Option.map(newestOf(film), (newest) => ({ film, newest }))),
    ),
    Order.flip(
      Order.mapInput(Order.String, (entry: { readonly newest: Version }) => entry.newest.at),
    ),
  );
