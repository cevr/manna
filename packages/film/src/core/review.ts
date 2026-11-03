import { Array as Arr, Effect, Option, Record as Rec, Schema } from 'effect';
import { ChoicePoint, seenVariants } from './choice.ts';
import { Clip } from './point.ts';
import { ProductionId, VersionNumber } from './production.ts';
import { Seconds, maybe } from './schema.ts';
import { ReviewFile, ReviewVideo } from './served.ts';

export { ReviewFile, ReviewVideo } from './served.ts';

const orElse = <S extends Schema.Top>(schema: S, fallback: S['Encoded']) =>
  schema.pipe(Schema.withDecodingDefaultKey(Effect.succeed(fallback)));

const ManifestVariant = Schema.Struct({
  label: maybe(Schema.String),
  tag: maybe(Schema.String),
  verdict: maybe(Schema.String),
  notes: maybe(Schema.String),
  file: maybe(Schema.String),
});

const ManifestSet = Schema.Struct({
  title: maybe(Schema.String),
  order: orElse(Schema.Array(Schema.String), []),
  start: orElse(Seconds, 0),
  moments: maybe(Schema.Array(Seconds)),
  variants: orElse(Schema.Record(Schema.String, ManifestVariant), {}),
});

const isClip = Schema.is(Clip);

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

export const ReviewManifest = Schema.Struct({
  title: maybe(Schema.String),
  blurb: maybe(Schema.String),
  production: maybe(ProductionId),
  version: maybe(VersionNumber),
  published: maybe(Schema.Finite),
  docs: orElse(Schema.Array(Schema.String), []),
  images: orElse(Schema.Array(Schema.String), []),
  videos: orElse(Schema.Array(Schema.String), []),
  downloads: orElse(Schema.Array(Schema.String), []),
  sets: orElse(ManifestSets, {}),
});
export type ReviewManifest = typeof ReviewManifest.Type;

export const ReviewManifestJson = Schema.fromJsonString(ReviewManifest);

export const ReviewFolder = Schema.Struct({
  ref: Schema.String,
  title: maybe(Schema.String),
  blurb: maybe(Schema.String),
  mtime: Schema.Finite,
  sets: Schema.Array(ChoicePoint),
  videos: Schema.Array(ReviewVideo),
  images: Schema.Array(ReviewFile),
  docs: Schema.Array(ReviewFile),
  downloads: Schema.optionalKey(Schema.Array(ReviewFile)),
  production: Schema.optionalKey(Schema.String),
  version: Schema.optionalKey(Schema.Int),
  published: Schema.optionalKey(Schema.Finite),
});
export type ReviewFolder = typeof ReviewFolder.Type;

export const RefAliases = Schema.Record(Schema.String, Schema.String);
export type RefAliases = typeof RefAliases.Type;

export const ReviewIndex = Schema.Struct({
  folders: Schema.Array(ReviewFolder),
  aliases: Schema.optionalKey(RefAliases),
});
export type ReviewIndex = typeof ReviewIndex.Type;

export const canonicalRef = (aliases: RefAliases, ref: string): string => {
  const [label = '', ...rest] = ref.split('/');
  return Option.match(Rec.get(aliases, label), {
    onNone: () => ref,
    onSome: (root) => [root, ...rest].join('/'),
  });
};

const indexRef = (index: ReviewIndex, ref: string): string =>
  canonicalRef(
    Option.getOrElse(Option.fromUndefinedOr(index.aliases), () => ({})),
    ref,
  );

export const docAt = (index: ReviewIndex, ref: string): Option.Option<ReviewFile> => {
  const canonical = indexRef(index, ref);
  return Arr.findFirst(
    index.folders.flatMap((f) => f.docs),
    (d) => d.ref === canonical,
  );
};

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

export const ReviewDuration = Schema.Struct({
  seconds: Seconds,
  fps: maybe(Schema.Finite.check(Schema.isGreaterThan(0))),
});
export type ReviewDuration = typeof ReviewDuration.Type;
