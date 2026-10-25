// The review on the wire: the folders it lists (a film's project folder by
// its catalogue, a montage by its manifest), each with its comparison sets
// (render choice points, `choice.ts`) and the files in no set. Pure: the
// review's server and its page share them.

import { Array as Arr, Effect, Option, Record as Rec, Schema } from 'effect';
import { ChoicePoint, seenVariants } from './choice.ts';
import { Clip } from './point.ts';
import { ProductionId, VersionNumber } from './production.ts';
import { Seconds, maybe } from './schema.ts';
import { ReviewFile, ReviewVideo } from './served.ts';

export { ReviewFile, ReviewVideo } from './served.ts';

/** A key a JSON file may leave out, read as `fallback` when it does. */
const orElse = <S extends Schema.Top>(schema: S, fallback: S['Encoded']) =>
  schema.pipe(Schema.withDecodingDefaultKey(Effect.succeed(fallback)));

const ManifestVariant = Schema.Struct({
  label: maybe(Schema.String),
  /** A line under the label: what the variant is. */
  tag: maybe(Schema.String),
  /** What was said of it, in words: shown under its label. */
  verdict: maybe(Schema.String),
  /** A markdown file of notes, relative to the folder. */
  notes: maybe(Schema.String),
  /**
   * The video, relative to the folder, when it is not beside it as
   * `<clip>.<id>.share.mp4` (preferred) or `<clip>.<id>.mp4`.
   */
  file: maybe(Schema.String),
});

const ManifestSet = Schema.Struct({
  title: maybe(Schema.String),
  /** Variant ids, first to last; the rest follow by name. */
  order: orElse(Schema.Array(Schema.String), []),
  /** Where every video starts, in seconds. */
  start: orElse(Seconds, 0),
  /** The instants the Moments view shows; five spread over the first variant otherwise. */
  moments: maybe(Schema.Array(Seconds)),
  variants: orElse(Schema.Record(Schema.String, ManifestVariant), {}),
});

const isClip = Schema.is(Clip);

/**
 * The sets by clip. A clip that is empty or named like an address (`film`,
 * `act:…`) is refused, not dropped, so the review's warning names it and no
 * montage's id reads back as a film's render.
 */
const ManifestSets = Schema.Record(Schema.String, ManifestSet).check(
  Schema.makeFilter((sets) =>
    Option.match(
      Arr.findFirst(Object.keys(sets), (clip) => !isClip(clip)),
      {
        onNone: () => true,
        onSome: (bad) => `a set's clip is never empty nor named like an address ("${bad}")`,
      },
    ),
  ),
);

/**
 * A montage's `review.json`: the record the review lists a folder of
 * hand-made clips by (a film's renders are listed by their catalogue). A
 * title and a line for the folder, the videos, images, docs and downloads it shows, and
 * per comparison set (by clip) its title, order, start, moments, and each
 * variant's label, tag, verdict, notes, or file when it lies elsewhere; the
 * production and version it is published to, and when. A set
 * lists the variants its `order` and `variants` name. Every key may be left
 * out; a file it does not name is not shown.
 */
export const ReviewManifest = Schema.Struct({
  title: maybe(Schema.String),
  blurb: maybe(Schema.String),
  /** The production whose timeline the set is on (`core/production.ts`), as `film publish` names it. */
  production: maybe(ProductionId),
  /** The version it was made for; the one open when it was published otherwise. */
  version: maybe(VersionNumber),
  /** When it was published, ms since the epoch (`film publish`); its newest file's time otherwise. */
  published: maybe(Schema.Finite),
  /** Text files (markdown, logs), relative to the folder, shown with it. */
  docs: orElse(Schema.Array(Schema.String), []),
  /** Images, relative to the folder, shown with it. */
  images: orElse(Schema.Array(Schema.String), []),
  /** Videos in no set, relative to the folder, shown with it. */
  videos: orElse(Schema.Array(Schema.String), []),
  /** Explicit file downloads, relative to the folder, including masters too large to stream inline. */
  downloads: orElse(Schema.Array(Schema.String), []),
  sets: orElse(ManifestSets, {}),
});
export type ReviewManifest = typeof ReviewManifest.Type;

export const ReviewManifestJson = Schema.fromJsonString(ReviewManifest);

/**
 * A folder of renders: its comparison sets (render choice points, each
 * variant seen), and what is in no set.
 */
export const ReviewFolder = Schema.Struct({
  /** The folder's ref: its root's label, then its path under the root. */
  ref: Schema.String,
  title: maybe(Schema.String),
  blurb: maybe(Schema.String),
  /** Its newest file's mtime. */
  mtime: Schema.Finite,
  sets: Schema.Array(ChoicePoint),
  videos: Schema.Array(ReviewVideo),
  images: Schema.Array(ReviewFile),
  docs: Schema.Array(ReviewFile),
  /** Authored file links; omitted by older servers and by project folders. */
  downloads: Schema.optionalKey(Schema.Array(ReviewFile)),
  /** The production its manifest publishes it to; omitted when it names none, by older servers and by project folders. */
  production: Schema.optionalKey(Schema.String),
  /** The version its manifest names. */
  version: Schema.optionalKey(Schema.Int),
  /** When its manifest says it was published, ms since the epoch. */
  published: Schema.optionalKey(Schema.Finite),
});
export type ReviewFolder = typeof ReviewFolder.Type;

/**
 * A root's other labels: each alias label, the label of the root it names.
 * A ref may start with an alias when it was written while its checkout's
 * folder had another name: it names the same file as the ref with the
 * root's label.
 */
export const RefAliases = Schema.Record(Schema.String, Schema.String);
export type RefAliases = typeof RefAliases.Type;

/** `GET /api/review/index`: every folder under the roots with something to review, newest first. */
export const ReviewIndex = Schema.Struct({
  folders: Schema.Array(ReviewFolder),
  /** The roots' alias labels; omitted when no root has one, and by older servers. */
  aliases: Schema.optionalKey(RefAliases),
});
export type ReviewIndex = typeof ReviewIndex.Type;

/**
 * `ref` with its label read through `aliases`: a ref that starts with an
 * alias, with its root's own label; any other ref as it is. Every lookup of
 * a folder or a file by a ref it was handed goes through this.
 */
export const canonicalRef = (aliases: RefAliases, ref: string): string => {
  const [label = '', ...rest] = ref.split('/');
  return Option.match(Rec.get(aliases, label), {
    onNone: () => ref,
    onSome: (root) => [root, ...rest].join('/'),
  });
};

/** `ref` as the index names it (`canonicalRef` through its aliases). */
const indexRef = (index: ReviewIndex, ref: string): string =>
  canonicalRef(
    Option.getOrElse(Option.fromUndefinedOr(index.aliases), () => ({})),
    ref,
  );

/** The folder `ref` names in the index, by its canonical ref (`canonicalRef`). */
export const folderAt = (index: ReviewIndex, ref: string): Option.Option<ReviewFolder> => {
  const canonical = indexRef(index, ref);
  return Arr.findFirst(index.folders, (f) => f.ref === canonical);
};

/** The document `ref` names, among the index's folders' documents (an ask's document is found as the set's page finds it). */
export const docAt = (index: ReviewIndex, ref: string): Option.Option<ReviewFile> => {
  const canonical = indexRef(index, ref);
  return Arr.findFirst(
    index.folders.flatMap((f) => f.docs),
    (d) => d.ref === canonical,
  );
};

/** The video `ref` names, among the index's folders' loose videos and their sets' seen ones. */
export const videoAt = (index: ReviewIndex, ref: string): Option.Option<ReviewVideo> => {
  const canonical = indexRef(index, ref);
  return Arr.findFirst(
    index.folders.flatMap((f) => [
      ...f.videos,
      ...f.sets.flatMap((point) => seenVariants(point).map((v) => v.video)),
    ]),
    (v) => v.ref === canonical,
  );
};

/**
 * `GET /api/review/duration`: a video's length, and its frames a second as
 * its own packets give them (`Media.timing`: the whole or 1000/1001 rate the
 * measure lies within its timestamps' precision of, else as measured; never rounded, so
 * 29.97 is 30000/1001), which a review's clock steps and counts by. None for
 * a file with no video, or an older server's answer.
 */
export const ReviewDuration = Schema.Struct({
  seconds: Seconds,
  fps: maybe(Schema.Finite.check(Schema.isGreaterThan(0))),
});
export type ReviewDuration = typeof ReviewDuration.Type;

/** `GET /api/films`: the app's films, by name. */
export const ReviewFilms = Schema.Struct({ films: Schema.Array(Schema.String) });
export type ReviewFilms = typeof ReviewFilms.Type;
