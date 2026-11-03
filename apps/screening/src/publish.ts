import { Array as Arr, Option, Schema } from 'effect';

import {
  type AssetExt,
  assetKey,
  type FilmManifest,
  FilmManifestJson,
  manifestKey,
  PAGE_KEYS,
  PATHS,
  type Version,
  type VersionName,
  withVersion,
} from './manifest.ts';
import { folderPage, indexPage, versionPage } from './pages.tsx';

export interface MaterialFile {
  readonly file: string;
  readonly sha256: string;
  readonly bytes: number;
  readonly ext: AssetExt;
}

export interface MaterialPanel {
  readonly beat: string;
  readonly image: MaterialFile;
}

export interface Material {
  readonly film: string;
  readonly title: string;
  readonly version: VersionName;
  readonly at: string;
  readonly day: string;
  readonly video: MaterialFile;
  readonly poster: MaterialFile;
  readonly panels: ReadonlyArray<MaterialPanel>;
}

export interface Upload {
  readonly key: string;
  readonly file: string;
  readonly sha256: string;
  readonly bytes: number;
}

export interface Written {
  readonly key: string;
  readonly text: string;
}

export interface Publication {
  readonly manifest: FilmManifest;
  readonly uploads: ReadonlyArray<Upload>;
  readonly texts: ReadonlyArray<Written>;
  readonly replaced: ReadonlyArray<string>;
  readonly path: string;
}

const encodeManifest = Schema.encodeSync(FilmManifestJson);

export const manifestText = (film: FilmManifest): string => encodeManifest(film);

export const publication = (site: ReadonlyArray<FilmManifest>, material: Material): Publication => {
  const { film, version } = material;
  const keyOf = (file: MaterialFile) => assetKey(film, version, file.sha256, file.ext);
  const asset = (file: MaterialFile) => ({ key: keyOf(file), bytes: file.bytes });
  const published: Version = {
    name: version,
    at: material.at,
    day: material.day,
    video: asset(material.video),
    poster: asset(material.poster),
    panels: material.panels.map((panel) => ({ beat: panel.beat, image: asset(panel.image) })),
  };
  const current = Arr.findFirst(site, (each) => each.film === film);
  const replaced = Option.match(
    Option.flatMap(current, (each) => Arr.findFirst(each.versions, (one) => one.name === version)),
    {
      onNone: () => [],
      onSome: (before) => [
        before.video.key,
        before.poster.key,
        ...before.panels.map((panel) => panel.image.key),
      ],
    },
  );
  const manifest = withVersion(current, film, material.title, published);
  const others = site.filter((each) => each.film !== film);
  const files = [material.video, material.poster, ...material.panels.map((panel) => panel.image)];
  const uploads = Arr.dedupeWith(
    files.map((file) => ({
      key: keyOf(file),
      file: file.file,
      sha256: file.sha256,
      bytes: file.bytes,
    })),
    (a, b) => a.key === b.key,
  );
  return {
    manifest,
    uploads,
    texts: [
      { key: PAGE_KEYS.version(film, version), text: versionPage(manifest, published) },
      { key: PAGE_KEYS.folder(film), text: folderPage(manifest) },
      { key: manifestKey(film), text: manifestText(manifest) },
      { key: PAGE_KEYS.index, text: indexPage([...others, manifest]) },
    ],
    replaced,
    path: PATHS.version(film, version),
  };
};

export const sitePages = (site: ReadonlyArray<FilmManifest>): ReadonlyMap<string, string> =>
  new Map([
    [PAGE_KEYS.index, indexPage(site)],
    ...site.flatMap((film) => [
      [PAGE_KEYS.folder(film.film), folderPage(film)] as const,
      ...film.versions.map(
        (version) =>
          [PAGE_KEYS.version(film.film, version.name), versionPage(film, version)] as const,
      ),
    ]),
  ]);
