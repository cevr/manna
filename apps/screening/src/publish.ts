/**
 * Publishing a version, as a plan: what the bucket must hold once a film's
 * version is published, from the films' manifests as the bucket holds them
 * now and the version's material as the publisher gathered it
 * (`apps/animations/screening.ts`). Pure: the publisher (`./desk-client.ts`)
 * writes what it says.
 *
 * The plan names each file to upload under its content-addressed key
 * (`assetKey`), then the pages that change (the version's page, the film's
 * folder, the index) and the film's manifest, and the files of the version
 * it replaces. The publisher writes the files first and the index last, so
 * no page links a file the bucket does not hold yet; it draws the index
 * again from the manifests as they are then, which another film's publish
 * may have changed.
 */
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

/** A file the publisher gathered: where it is here, its bytes' sha256 (hex), its size and its kind. */
export interface MaterialFile {
  readonly file: string;
  readonly sha256: string;
  readonly bytes: number;
  readonly ext: AssetExt;
}

/** One kept Board panel's picture, and its beat. */
export interface MaterialPanel {
  readonly beat: string;
  readonly image: MaterialFile;
}

/** What one version is made of, as the publisher gathered it. */
export interface Material {
  readonly film: string;
  readonly title: string;
  readonly version: VersionName;
  /** When it is published (ISO 8601). */
  readonly at: string;
  /** The publisher's local date (`YYYY-MM-DD`). */
  readonly day: string;
  readonly video: MaterialFile;
  readonly poster: MaterialFile;
  /** The Board's kept panels, in the film's order; empty for any other version. */
  readonly panels: ReadonlyArray<MaterialPanel>;
}

/** A file to upload under `key`. */
export interface Upload {
  readonly key: string;
  readonly file: string;
  readonly sha256: string;
  readonly bytes: number;
}

/** A text to write under `key`: a page or the film's manifest. */
export interface Written {
  readonly key: string;
  readonly text: string;
}

/** What publishing a version writes, in the order it is written. */
export interface Publication {
  readonly manifest: FilmManifest;
  /** The version's files, each once. */
  readonly uploads: ReadonlyArray<Upload>;
  /** The version's page, the film's folder, the film's manifest, then the index. */
  readonly texts: ReadonlyArray<Written>;
  /** The keys of the files of the version this one replaces; none on its first publish. */
  readonly replaced: ReadonlyArray<string>;
  /** The version's path on the site. */
  readonly path: string;
}

const encodeManifest = Schema.encodeSync(FilmManifestJson);

/** `film`'s manifest as the bucket keeps it. */
export const manifestText = (film: FilmManifest): string => encodeManifest(film);

/** The plan for publishing `material`, over `site`: every film's manifest the bucket holds now. */
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

/** Every page `site` draws, by its bucket key: what the bucket's pages are once each film's last publish is written. */
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
