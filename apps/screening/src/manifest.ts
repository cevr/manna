import { Array as Arr, Option, Order, Schema } from 'effect';

export const VERSION_NAMES = ['final', 'render', 'board'] as const;

export const VersionName = Schema.Literals(VERSION_NAMES);
export type VersionName = typeof VersionName.Type;

export const VERSION_LABELS: Record<VersionName, string> = {
  board: 'The Board',
  render: 'The render',
  final: 'The final film',
};

export const FilmId = Schema.String.check(
  Schema.isPattern(/^[a-z0-9][a-z0-9-]*$/, {
    message: 'a film folder name: lower-case letters, digits and `-`',
  }),
);

export const ASSET_TYPES = {
  mp4: 'video/mp4',
  jpg: 'image/jpeg',
  png: 'image/png',
} as const;

export const AssetExt = Schema.Literals(['mp4', 'jpg', 'png']);
export type AssetExt = typeof AssetExt.Type;

export const Asset = Schema.Struct({
  key: Schema.String,
  bytes: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
});
export type Asset = typeof Asset.Type;

export const Panel = Schema.Struct({
  beat: Schema.String,
  image: Asset,
});
export type Panel = typeof Panel.Type;

export const Version = Schema.Struct({
  name: VersionName,
  at: Schema.String,
  day: Schema.String.check(Schema.isPattern(/^\d{4}-\d{2}-\d{2}$/)),
  video: Asset,
  poster: Asset,
  panels: Schema.Array(Panel),
});
export type Version = typeof Version.Type;

export const FilmManifest = Schema.Struct({
  film: FilmId,
  title: Schema.String,
  versions: Schema.Array(Version),
});
export type FilmManifest = typeof FilmManifest.Type;

export const FilmManifestJson = Schema.fromJsonString(FilmManifest);

export const manifestKey = (film: string): string => `${film}/manifest.json`;

export const isManifestKey = (key: string): boolean =>
  /^[a-z0-9][a-z0-9-]*\/manifest\.json$/.test(key);

export const PAGE_KEYS = {
  index: 'index.html',
  folder: (film: string) => `${film}/index.html`,
  version: (film: string, version: VersionName) => `${film}/${version}/index.html`,
} as const;

export const PATHS = {
  index: '/',
  folder: (film: string) => `/${film}/`,
  version: (film: string, version: VersionName) => `/${film}/${version}/`,
  asset: (key: string) => `/${key}`,
} as const;

const NAME_DIGITS = 16;

export const assetKey = (
  film: string,
  version: VersionName,
  sha256: string,
  ext: AssetExt,
): string => `${film}/${version}/${sha256.slice(0, NAME_DIGITS).toLowerCase()}.${ext}`;

const newestFirst = Order.flip(Order.mapInput(Order.String, (version: Version) => version.at));

export const versionsOf = (film: FilmManifest): ReadonlyArray<Version> =>
  Arr.sort(film.versions, newestFirst);

export const newestOf = (film: FilmManifest): Option.Option<Version> => Arr.head(versionsOf(film));

export const versionNamed = (film: FilmManifest, name: VersionName): Option.Option<Version> =>
  Arr.findFirst(film.versions, (version) => version.name === name);

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
