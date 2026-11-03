import {
  Array as Arr,
  Boolean as Bool,
  Cache,
  Clock,
  Config,
  Context,
  Duration,
  Effect,
  Fiber,
  FiberMap,
  FileSystem,
  Layer,
  Option,
  Order,
  Path,
  Queue,
  Record as Rec,
  Ref,
  Schema,
} from 'effect';
import { type PlatformError, isPlatformError } from 'effect/PlatformError';
import { addressKey } from '../core/address.ts';
import {
  type Catalogue,
  CatalogueJson,
  MAIN_VARIANT,
  type Render,
  approvalState,
  commentsOn,
  recordedNow,
  renderState,
  saidOn,
  subjectOf,
} from '../core/catalogue.ts';
import { type ChoicePoint, type ChoiceVariant, pointHead, seenVariants } from '../core/choice.ts';
import type {
  ReviewDuration,
  ReviewFile,
  ReviewFolder,
  ReviewIndex,
  RefAliases,
  ReviewManifest,
  ReviewVideo,
} from '../core/review.ts';
import { ReviewManifestJson, canonicalRef } from '../core/review.ts';
import {
  type MediaFailed,
  PhoneCopyFailed,
  ReviewFileUnknown,
  ReviewToolFailed,
} from '../core/refusals.ts';
import { clamp } from '../core/time.ts';
import { counted } from '../core/words.ts';
import { CATALOGUE_FILE } from './catalogue.ts';
import { writeWhole } from './content-store.ts';
import { AtMtime, fileCache, madeFromName } from './file-cache.ts';
import { Media, PHONE_COPY, PHONE_RATE } from './media.ts';

export interface ReviewRoot {
  readonly label: string;
  readonly path: string;
  readonly aliases?: ReadonlyArray<string>;
}

interface ReviewConfig {
  readonly roots: ReadonlyArray<ReviewRoot>;
  readonly cache: string;
  readonly phoneOver: number;
  readonly phoneRate?: number;
  readonly maxVideo: number;
  readonly phoneCopies: boolean;
}

const PHONE_OVER = 40 * 1024 * 1024;
const MAX_VIDEO = 600 * 1024 * 1024;
const INDEX_FRESH = Duration.seconds(15);

const SKIP_DIRS = ['stills', 'frames', 'node_modules'];
const MAX_DEPTH = 8;

type PhoneState = ReviewVideo['phone'];

export interface Found {
  readonly path: string;
  readonly ref: string;
  readonly name: string;
  readonly size: number;
  readonly mtime: number;
}

const rootFrom = (entry: string, path: Path.Path): ReviewRoot => {
  const eq = entry.indexOf('=');
  if (eq > 0)
    return { label: entry.slice(0, eq).trim(), path: path.resolve(entry.slice(eq + 1).trim()) };
  const at = path.resolve(entry);
  return { label: path.basename(at), path: at };
};

export const parseRoots = (text: string, path: Path.Path): ReadonlyArray<ReviewRoot> => {
  const entries = text
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .map((entry) => rootFrom(entry, path));
  return entries.map((root, i) => {
    if (!entries.some((other, j) => j !== i && other.label === root.label)) return root;
    return { ...root, label: `${path.basename(path.dirname(root.path))}-${root.label}` };
  });
};

const within = (root: string, at: string, path: Path.Path) =>
  at === root || at.startsWith(`${root}${path.sep}`);

export const refOf = (
  roots: ReadonlyArray<ReviewRoot>,
  file: string,
  path: Path.Path,
): Option.Option<string> => {
  const at = path.resolve(file);
  const holding = roots
    .filter((root) => within(root.path, at, path))
    .toSorted((a, b) => b.path.length - a.path.length);
  return Option.map(Arr.head(holding), (root) => {
    const rel = path.relative(root.path, at).split(path.sep).join('/');
    if (rel.length === 0) return root.label;
    return `${root.label}/${rel}`;
  });
};

const aliasesOf = (roots: ReadonlyArray<ReviewRoot>): RefAliases => {
  const labels = new Set(roots.map((root) => root.label));
  const claims = roots.flatMap((root) =>
    (root.aliases ?? [])
      .filter((alias) => !labels.has(alias))
      .map((alias) => [alias, root.label] as const),
  );
  return Object.fromEntries(
    claims.filter(([alias]) => claims.filter(([other]) => other === alias).length === 1),
  );
};

export const canonicalOf = (roots: ReadonlyArray<ReviewRoot>, ref: string): string =>
  canonicalRef(aliasesOf(roots), ref);

export const pathOf = (
  roots: ReadonlyArray<ReviewRoot>,
  ref: string,
  path: Path.Path,
): Option.Option<string> => {
  const [label = '', ...rest] = canonicalOf(roots, ref).split('/');
  if (ref.includes('\u0000')) return Option.none();
  return Option.flatMap(
    Arr.findFirst(roots, (root) => root.label === label),
    (root) =>
      Option.liftPredicate(path.resolve(root.path, ...rest), (at) => within(root.path, at, path)),
  );
};

const newestFirst = Order.mapInput(
  Order.flip(Order.Number),
  (f: { readonly mtime: number }) => f.mtime,
);

const fileOf = (found: Found): ReviewFile => ({
  ref: found.ref,
  name: found.name,
  size: found.size,
  mtime: found.mtime,
});

const MANIFEST_FILE = 'review.json';

interface FolderParts<A> {
  readonly ref: string;
  readonly record: A;
  readonly look: (name: string) => Option.Option<Found>;
  readonly phone: (video: Found) => PhoneState;
  readonly maxVideo: number;
}

const found = <A>(parts: FolderParts<A>, names: ReadonlyArray<string>) =>
  names.flatMap((name) => Option.toArray(parts.look(name)));

const videoOf = <A>(
  parts: FolderParts<A>,
  names: ReadonlyArray<string>,
): Option.Option<ReviewVideo> =>
  Option.map(
    Arr.findFirst(found(parts, names), (f) => f.size <= parts.maxVideo),
    (f) => ({ ...fileOf(f), phone: parts.phone(f) }),
  );

const uniqueFiles = (files: ReadonlyArray<Found>): ReadonlyArray<Found> =>
  Arr.dedupeWith(files, (a, b) => a.path === b.path);

const newestFiles = (files: ReadonlyArray<Found>): ReadonlyArray<ReviewFile> =>
  Arr.sort(uniqueFiles(files), newestFirst).map(fileOf);

const newestMtime = (files: ReadonlyArray<Found>) => Math.max(0, ...files.map((f) => f.mtime));

const renderFiles = (render: Render): ReadonlyArray<string> => [
  ...Option.toArray(render.files.clip),
  ...Option.toArray(render.files.share),
  ...Option.toArray(render.files.captions),
  ...Option.toArray(render.files.chapters),
  ...Option.toArray(render.files.description),
  ...render.files.images,
];

export const namesInProject = (catalogue: Catalogue): ReadonlyArray<string> =>
  Arr.dedupe(catalogue.renders.flatMap(renderFiles));

const playedFiles = (render: Render) => [
  ...Option.toArray(render.files.share),
  ...Option.toArray(render.files.clip),
];

const playedInProject = (catalogue: Catalogue): ReadonlyArray<string> =>
  Arr.dedupe(catalogue.renders.flatMap(playedFiles));

const renderVideo = (parts: FolderParts<Catalogue>, render: Render) =>
  videoOf(parts, playedFiles(render));

const placeOf = (render: Render): readonly [number, number] => {
  if (render.address._tag === 'Film') return [0, 0];
  if (render.address._tag === 'Short') return [2, 0];
  return [1, Option.match(render.span, { onNone: () => 0, onSome: (s) => s.from })];
};

const addressTitle = (render: Render): string => {
  const address = render.address;
  if (address._tag === 'Film') return 'film';
  if (address._tag === 'Act') return `act ${address.act}`;
  if (address._tag === 'Short') return `short ${address.id}`;
  if (address.ids.length === 1) return `scene ${address.ids[0]}`;
  return `scenes ${address.ids.join(', ')}`;
};

const renderTag = (catalogue: Catalogue, render: Render): string => {
  const said = commentsOn(catalogue, subjectOf(render)).length;
  return [
    `scale ${render.settings.scale}`,
    ...Option.toArray(Option.map(render.stamp.commit, (c) => c.slice(0, 7))),
    ...Arr.filter([counted(said, 'comment')], () => said > 0),
  ].join(' · ');
};

export const projectFolder = (parts: FolderParts<Catalogue>): ReviewFolder => {
  const catalogue = parts.record;
  const videos = catalogue.renders.filter((r) => r.kind === 'video');
  const byAddress = Arr.groupBy(videos, (r) => addressKey(r.address));
  const sets = Object.entries(byAddress)
    .map(([key, renders]) => ({ key, renders, place: placeOf(renders[0]) }))
    .toSorted(
      (a, b) => a.place[0] - b.place[0] || a.place[1] - b.place[1] || a.key.localeCompare(b.key),
    )
    .flatMap(({ renders }): ReadonlyArray<ChoicePoint> => {
      const now = recordedNow(catalogue, renders[0].address);
      const variants = renders
        .toSorted(
          (a, b) =>
            Number(b.variant === MAIN_VARIANT) - Number(a.variant === MAIN_VARIANT) ||
            a.variant.localeCompare(b.variant),
        )
        .flatMap((render) =>
          Option.toArray(
            Option.map(renderVideo(parts, render), (video): ChoiceVariant => ({
              id: render.variant,
              label: render.variant,
              lines: [renderTag(catalogue, render)],
              ...Option.match(now, {
                onNone: () => ({ state: 'current' as const, staleBy: Option.none() }),
                onSome: (at) => renderState(Option.some(render), at),
              }),
              picked: false,
              verbs: [],
              fixed: Option.none(),
              media: { _tag: 'Seen', video },
              key: subjectOf(render).key,
              approval: approvalState(catalogue, subjectOf(render)),
              comments: saidOn(catalogue, subjectOf(render)),
              notes: Option.none(),
            })),
          ),
        );
      if (variants.length === 0) return [];
      return [
        {
          ...pointHead({ _tag: 'Render', address: renders[0].address }),
          address: Option.some(renders[0].address),
          title: addressTitle(renders[0]),
          lines: [],
          start: 0,
          moments: Option.none(),
          marks: [],
          variants,
        },
      ];
    });
  const all = found(parts, namesInProject(catalogue));
  const approved = catalogue.renders.filter(
    (r) => approvalState(catalogue, subjectOf(r)) === 'approved',
  );
  return {
    ref: parts.ref,
    title: Option.some(catalogue.film),
    blurb: Option.some(
      `${counted(catalogue.renders.length, 'render')}, ${approved.length} approved`,
    ),
    mtime: newestMtime(all),
    sets,
    videos: [],
    images: newestFiles(
      found(
        parts,
        catalogue.renders.flatMap((r) => r.files.images),
      ),
    ),
    docs: newestFiles(
      found(
        parts,
        catalogue.renders.flatMap((r) => [
          ...Option.toArray(r.files.captions),
          ...Option.toArray(r.files.chapters),
          ...Option.toArray(r.files.description),
        ]),
      ),
    ),
  };
};

type ManifestSet = ReviewManifest['sets'][string];

const variantIds = (set: ManifestSet): ReadonlyArray<string> =>
  Arr.dedupe([...set.order, ...Object.keys(set.variants).toSorted()]);

const variantNames = (clip: string, id: string, set: ManifestSet): ReadonlyArray<string> =>
  Option.match(
    Option.flatMap(Rec.get(set.variants, id), (v) => v.file),
    {
      onSome: (file) => [file],
      onNone: () => [`${clip}.${id}.share.mp4`, `${clip}.${id}.mp4`],
    },
  );

export const filesInMontage = (manifest: ReviewManifest): ReadonlyArray<ReadonlyArray<string>> => [
  ...[...manifest.docs, ...manifest.images, ...manifest.videos, ...manifest.downloads].map(
    (name) => [name],
  ),
  ...Object.entries(manifest.sets).flatMap(([clip, set]) =>
    variantIds(set).flatMap((id) => [
      variantNames(clip, id, set),
      ...Option.toArray(Option.flatMap(Rec.get(set.variants, id), (v) => v.notes)).map((n) => [n]),
    ]),
  ),
];

export const namesInMontage = (manifest: ReviewManifest): ReadonlyArray<string> =>
  Arr.dedupe(filesInMontage(manifest).flat());

const playedInMontage = (manifest: ReviewManifest): ReadonlyArray<string> =>
  Arr.dedupe([
    ...manifest.videos,
    ...Object.entries(manifest.sets).flatMap(([clip, set]) =>
      variantIds(set).flatMap((id) => variantNames(clip, id, set)),
    ),
  ]);

export const montageFolder = (parts: FolderParts<ReviewManifest>): ReviewFolder => {
  const manifest = parts.record;
  const sets = Object.entries(manifest.sets)
    .toSorted(([a], [b]) => a.localeCompare(b))
    .flatMap(([clip, set]): ReadonlyArray<ChoicePoint> => {
      const variants = variantIds(set).flatMap((id) => {
        const meta = Rec.get(set.variants, id);
        return Option.toArray(
          Option.map(videoOf(parts, variantNames(clip, id, set)), (video): ChoiceVariant => ({
            id,
            label: Option.getOrElse(
              Option.flatMap(meta, (v) => v.label),
              () => id,
            ),
            lines: [
              ...Option.toArray(Option.flatMap(meta, (v) => v.tag)),
              ...Option.toArray(Option.flatMap(meta, (v) => v.verdict)),
            ],
            state: 'current',
            staleBy: Option.none(),
            picked: false,
            verbs: [],
            fixed: Option.none(),
            media: { _tag: 'Seen', video },
            key: video.ref,
            approval: 'none',
            comments: [],
            notes: Option.map(
              Option.flatMap(
                Option.flatMap(meta, (v) => v.notes),
                parts.look,
              ),
              fileOf,
            ),
          })),
        );
      });
      if (variants.length === 0) return [];
      return [
        {
          ...pointHead({ _tag: 'Montage', clip }),
          address: Option.none(),
          title: Option.getOrElse(set.title, () => clip),
          lines: [],
          start: set.start,
          moments: set.moments,
          marks: [],
          variants,
        },
      ];
    });
  const videos = found(parts, manifest.videos).filter((f) => f.size <= parts.maxVideo);
  return {
    ref: parts.ref,
    title: manifest.title,
    blurb: manifest.blurb,
    mtime: newestMtime(found(parts, namesInMontage(manifest))),
    sets,
    videos: Arr.sort(videos, newestFirst).map((f) => ({ ...fileOf(f), phone: parts.phone(f) })),
    images: uniqueFiles(found(parts, manifest.images)).map(fileOf),
    docs: newestFiles(found(parts, manifest.docs)),
    downloads: uniqueFiles(found(parts, manifest.downloads)).map(fileOf),
    ...Option.match(manifest.production, {
      onNone: () => ({}),
      onSome: (production) => ({
        production,
        ...Option.match(manifest.version, {
          onNone: () => ({}),
          onSome: (version) => ({ version }),
        }),
        ...Option.match(manifest.published, {
          onNone: () => ({}),
          onSome: (published) => ({ published }),
        }),
      }),
    }),
  };
};

const walked = (rel: string): boolean => {
  const segments = rel.split('/');
  const dirs = segments.slice(0, -1);
  if (dirs.length > MAX_DEPTH) return false;
  return !dirs.some((d) => d.startsWith('.') || SKIP_DIRS.includes(d));
};

interface ReviewRecord {
  readonly ref: string;
  readonly dir: string;
  readonly file: string;
  readonly kind: 'project' | 'montage';
}

export const recordsUnder = Effect.fn('Review.recordsUnder')(function* (
  roots: ReadonlyArray<ReviewRoot>,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const found = yield* Effect.forEach(roots, (root) =>
    fs.readDirectory(root.path, { recursive: true }).pipe(
      Effect.orElseSucceed(() => []),
      Effect.map((names) =>
        names
          .map((rel) => rel.split(path.sep).join('/'))
          .filter((rel) => walked(rel))
          .filter((rel) => [CATALOGUE_FILE, MANIFEST_FILE].includes(rel.split('/').at(-1) ?? ''))
          .map((rel) => path.join(root.path, ...rel.split('/'))),
      ),
    ),
  );
  const byDir = new Map<string, ReviewRecord>();
  for (const file of found.flat()) {
    const dir = path.dirname(file);
    const ref = refOf(roots, dir, path);
    if (Option.isNone(ref)) continue;
    const kind = Bool.match(path.basename(file) === CATALOGUE_FILE, {
      onTrue: () => 'project' as const,
      onFalse: () => 'montage' as const,
    });
    if (Option.exists(Option.fromUndefinedOr(byDir.get(dir)), (had) => had.kind === 'project'))
      continue;
    byDir.set(dir, { ref: ref.value, dir, file, kind });
  }
  return [...byDir.values()];
});
interface ReviewService {
  readonly roots: ReadonlyArray<ReviewRoot>;
  readonly index: (fresh: boolean) => Effect.Effect<ReviewIndex>;
  readonly written: Effect.Effect<void>;
  readonly pictures: (film: string) => Effect.Effect<ReadonlyArray<ReviewVideo>>;
  readonly renderVideo: (dir: string, render: Render) => Effect.Effect<Option.Option<ReviewVideo>>;
  readonly resolve: (ref: string) => Effect.Effect<string, ReviewFileUnknown>;
  readonly duration: (
    ref: string,
  ) => Effect.Effect<ReviewDuration, ReviewFileUnknown | MediaFailed>;
  readonly frame: (
    ref: string,
    at: Option.Option<number>,
    width: number,
  ) => Effect.Effect<string, ReviewFileUnknown | ReviewToolFailed | MediaFailed>;
  readonly phone: (
    ref: string,
  ) => Effect.Effect<Option.Option<string>, ReviewFileUnknown | PhoneCopyFailed>;
  readonly derive: <E, R>(
    name: string,
    make: (temporary: string) => Effect.Effect<void, E, R>,
  ) => Effect.Effect<string, E | ReviewToolFailed, R>;
}

export const once = <K, A, E>(
  running: FiberMap.FiberMap<K, A, E>,
  key: K,
  effect: Effect.Effect<A, E>,
): Effect.Effect<A, E> =>
  Effect.flatMap(FiberMap.get(running, key), (had) =>
    Option.match(had, {
      onSome: Fiber.join,
      onNone: () => Effect.flatMap(FiberMap.run(running, key, effect), Fiber.join),
    }),
  );

const LENGTHS_KEPT = 4096;

const refsIn = (folder: ReviewFolder): ReadonlyArray<string> => [
  ...folder.sets.flatMap((set) => [
    ...seenVariants(set).map((seen) => seen.video.ref),
    ...set.variants.flatMap((v) => Option.toArray(Option.map(v.notes, (n) => n.ref))),
  ]),
  ...[...folder.videos, ...folder.images, ...folder.docs, ...(folder.downloads ?? [])].map(
    (f) => f.ref,
  ),
];

export class Review extends Context.Service<Review, ReviewService>()('@manna/film/tools/Review') {
  static readonly layer = (config: ReviewConfig) =>
    Layer.effect(
      Review,
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const media = yield* Media;
        const roots = config.roots.map((root) => ({ ...root, path: path.resolve(root.path) }));
        const phoneRate = config.phoneRate ?? PHONE_RATE;
        const cacheFailed = (name: string) => (error: { readonly message: string }) =>
          ReviewToolFailed.make({ tool: 'cache', ref: name, reason: error.message });

        const statOf = (file: string) =>
          fs.stat(file).pipe(
            Effect.map((info) => ({
              type: info.type,
              size: Number(info.size),
              mtime: Option.match(info.mtime, { onNone: () => 0, onSome: (d) => d.getTime() }),
            })),
            Effect.option,
          );

        const standing = (file: string) =>
          Effect.map(
            statOf(file),
            (stat) =>
              new AtMtime({
                file,
                mtime: Option.match(stat, { onNone: () => 0, onSome: (s) => s.mtime }),
              }),
          );

        const foundAt = Effect.fn('Review.foundAt')(function* (file: string) {
          const ref = refOf(roots, file, path);
          const stat = yield* statOf(file);
          if (Option.isNone(ref) || Option.isNone(stat) || stat.value.type !== 'File')
            return Option.none<Found>();
          return Option.some<Found>({
            path: file,
            ref: ref.value,
            name: path.basename(file),
            size: stat.value.size,
            mtime: stat.value.mtime,
          });
        });

        const listed = Effect.fn('Review.listed')(function* (ref: string) {
          const lists = (index: ReviewIndex) =>
            index.folders.some((folder) => refsIn(folder).includes(ref));
          if (lists(yield* Effect.suspend(() => index(false)))) return true;
          return lists(yield* Effect.suspend(() => index(true)));
        });

        const resolve = Effect.fn('Review.resolve')(function* (ref: string) {
          const unknown = ReviewFileUnknown.make({ ref });
          const at = pathOf(roots, ref, path);
          if (Option.isNone(at)) return yield* unknown;
          const real = yield* fs.realPath(at.value).pipe(Effect.option);
          const realRoots = yield* Effect.forEach(roots, (root) =>
            fs.realPath(root.path).pipe(
              Effect.map((p) => ({ ...root, path: p })),
              Effect.orElseSucceed(() => root),
            ),
          );
          const inside = Option.exists(real, (r) => Option.isSome(refOf(realRoots, r, path)));
          const found = yield* foundAt(at.value);
          if (!inside || Option.isNone(found)) return yield* unknown;
          if (!(yield* listed(canonicalOf(roots, ref)))) return yield* unknown;
          return at.value;
        });

        const derive = <E, R>(
          name: string,
          make: (temporary: string) => Effect.Effect<void, E, R>,
        ): Effect.Effect<string, E | ReviewToolFailed, R> =>
          Effect.gen(function* () {
            const out = path.join(config.cache, name);
            const cached = <A>(effect: Effect.Effect<A, PlatformError>) =>
              Effect.mapError(effect, cacheFailed(name));
            if (yield* cached(fs.exists(out))) return out;
            yield* cached(fs.makeDirectory(path.dirname(out), { recursive: true }));
            yield* writeWhole(fs, out, make).pipe(
              Effect.catchIf(isPlatformError, (error) => Effect.fail(cacheFailed(name)(error))),
            );
            yield* Effect.logDebug(`review.derived name=${name}`);
            return out;
          });

        const lengths = yield* fileCache(
          (at) => Effect.result(media.timing(at.file)),
          LENGTHS_KEPT,
        );
        const lengthOf = (at: AtMtime) => Effect.flatMap(Cache.get(lengths, at), Effect.fromResult);

        const duration = Effect.fn('Review.duration')(function* (ref: string) {
          return yield* lengthOf(yield* standing(yield* resolve(ref)));
        });

        const framing = yield* FiberMap.make<string, string, ReviewToolFailed | MediaFailed>();

        const sourceKey = (file: string, rest: ReadonlyArray<string | number>) =>
          Effect.map(standing(file), (at) => madeFromName(at, rest));

        const frame = Effect.fn('Review.frame')(function* (
          ref: string,
          at: Option.Option<number>,
          width: number,
        ) {
          const file = yield* resolve(ref);
          const { seconds: length } = yield* duration(ref);
          let t = 0;
          if (Option.isSome(at)) t = clamp(at.value, 0, length);
          else t = length * 0.1;
          const w = Math.round(Math.min(1920, Math.max(160, width)));
          const key = yield* sourceKey(file, [t.toFixed(3), w]);
          const name = `frames/${key}.jpg`;
          return yield* once(
            framing,
            name,
            derive(name, (temporary) => media.still(file, t, w, temporary)),
          );
        });

        const phonePath = (file: string) =>
          Effect.map(sourceKey(file, PHONE_COPY), (key) =>
            path.join(config.cache, 'phone', `${key}.mp4`),
          );

        const isFile = (file: string) => fs.exists(file).pipe(Effect.orElseSucceed(() => false));

        const unmade = new Set<string>();

        const phone = Effect.fn('Review.phone')(function* (ref: string) {
          const out = yield* phonePath(yield* resolve(ref));
          if (unmade.has(out)) return yield* PhoneCopyFailed.make({ ref });
          const there = yield* isFile(out);
          return Option.liftPredicate(out, () => there);
        });

        const copied = (video: Found) => {
          if (video.size > config.phoneOver) return Effect.succeed(true);
          const at = new AtMtime({ file: video.path, mtime: video.mtime });
          return lengthOf(at).pipe(
            Effect.map(({ seconds }) => seconds > 0 && (video.size * 8) / seconds > phoneRate),
            Effect.orElseSucceed(() => false),
          );
        };

        const phoneState = Effect.fn('Review.phoneState')(function* (video: Found) {
          if (!(yield* copied(video))) return 'none' satisfies PhoneState;
          if (!config.phoneCopies) return 'none' satisfies PhoneState;
          const out = yield* phonePath(video.path);
          if (yield* isFile(out)) return 'ready' satisfies PhoneState;
          if (unmade.has(out)) return 'failed' satisfies PhoneState;
          return 'pending' satisfies PhoneState;
        });

        const cached = yield* Ref.make({
          drops: 0,
          last: Option.none<{ readonly at: number; readonly read: Read }>(),
        });
        const drop = Ref.update(cached, (c) => ({ drops: c.drops + 1, last: Option.none() }));

        const queue = yield* Queue.unbounded<Found>();
        const queued = new Set<string>();
        const makePhone = Effect.fn('Review.makePhone')(function* (video: Found) {
          const out = yield* phonePath(video.path);
          const name = path.relative(config.cache, out);
          const failed = (reason: string) =>
            Effect.sync(() => unmade.add(out)).pipe(
              Effect.andThen(drop),
              Effect.andThen(
                Effect.logWarning(`review.phone.failed ref=${video.ref} reason="${reason}"`),
              ),
            );
          yield* derive(name, (temporary) => media.phoneCopy(video.path, temporary)).pipe(
            Effect.andThen(drop),
            Effect.andThen(Effect.log(`review.phone.made ref=${video.ref}`)),
            Effect.catchTags({
              ReviewToolFailed: (error) => failed(error.message),
              MediaFailed: (error) => failed(error.message),
            }),
          );
        });
        const drain = Effect.forever(
          Effect.flatMap(Queue.take(queue), (video) =>
            makePhone(video).pipe(Effect.ensuring(Effect.sync(() => queued.delete(video.path)))),
          ),
        );
        if (config.phoneCopies) yield* Effect.forkScoped(drain);

        const enqueue = Effect.fn('Review.enqueue')(function* (videos: ReadonlyArray<Found>) {
          for (const video of Arr.sort(videos, newestFirst)) {
            if (queued.has(video.path)) continue;
            queued.add(video.path);
            yield* Queue.offer(queue, video);
          }
        });

        const decodeRecord = <A>(file: string, codec: Schema.Codec<A, string>) =>
          fs.readFileString(file).pipe(
            Effect.flatMap(Schema.decodeEffect(codec)),
            Effect.asSome,
            Effect.catch((error) =>
              Effect.as(
                Effect.logWarning(`review.record.invalid file=${file} reason="${error.message}"`),
                Option.none<A>(),
              ),
            ),
          );

        const lookIn = Effect.fn('Review.lookIn')(function* (
          dir: string,
          names: ReadonlyArray<string>,
          played: ReadonlyArray<string>,
        ) {
          const byName = new Map<string, Found>();
          for (const name of names) {
            const at = yield* foundAt(path.resolve(dir, name));
            if (Option.isSome(at)) byName.set(name, at.value);
          }
          const phones = new Map<string, PhoneState>();
          for (const file of played.flatMap((name) =>
            Option.toArray(Option.fromUndefinedOr(byName.get(name))),
          ))
            if (!phones.has(file.path)) phones.set(file.path, yield* phoneState(file));
          const pending = [...byName.values()].filter(
            (f) => phones.get(f.path) === 'pending' && f.size <= config.maxVideo,
          );
          const parts = {
            ref: Option.getOrElse(refOf(roots, dir, path), () => dir),
            look: (name: string) => Option.fromUndefinedOr(byName.get(name)),
            phone: (video: Found) =>
              Option.getOrElse(
                Option.fromUndefinedOr(phones.get(video.path)),
                () => 'none' as const,
              ),
            maxVideo: config.maxVideo,
          };
          return { parts, pending };
        });

        const folderAt = Effect.fn('Review.folderAt')(function* (file: string) {
          const dir = path.dirname(file);
          if (path.basename(file) === CATALOGUE_FILE) {
            const catalogue = yield* decodeRecord(file, CatalogueJson);
            if (Option.isNone(catalogue)) return Option.none();
            const record = catalogue.value;
            const { parts, pending } = yield* lookIn(
              dir,
              namesInProject(record),
              playedInProject(record),
            );
            const pictures = record.renders
              .filter((r) => r.kind === 'video' && r.address._tag === 'Film')
              .flatMap((r) =>
                Option.toArray(
                  Option.map(renderVideo({ ...parts, record }, r), (video) => ({
                    video,
                    at: r.at,
                  })),
                ),
              );
            return Option.some({
              folder: projectFolder({ ...parts, record }),
              pending,
              film: Option.some(record.film),
              pictures,
            });
          }
          const manifest = yield* decodeRecord(file, ReviewManifestJson);
          if (Option.isNone(manifest)) return Option.none();
          const record = manifest.value;
          const { parts, pending } = yield* lookIn(
            dir,
            namesInMontage(record),
            playedInMontage(record),
          );
          return Option.some({
            folder: montageFolder({ ...parts, record }),
            pending,
            film: Option.none<string>(),
            pictures: [],
          });
        });

        const hasAny = (f: ReviewFolder) =>
          f.sets.length +
            f.videos.length +
            f.images.length +
            f.docs.length +
            (f.downloads?.length ?? 0) >
          0;

        interface Read {
          readonly index: ReviewIndex;
          readonly pictures: ReadonlyMap<string, ReadonlyArray<ReviewVideo>>;
        }

        const read = Effect.fn('Review.read')(function* () {
          const records = yield* recordsUnder(roots).pipe(
            Effect.provideService(FileSystem.FileSystem, fs),
            Effect.provideService(Path.Path, path),
          );
          const built = (yield* Effect.forEach(records, (r) => folderAt(r.file))).flatMap(
            Option.toArray,
          );
          const folders = Arr.sort(
            built.map((b) => b.folder),
            newestFirst,
          ).filter(hasAny);
          if (config.phoneCopies) yield* enqueue(built.flatMap((b) => b.pending));
          const byFilm = Arr.groupBy(
            built.flatMap((b) =>
              Option.toArray(b.film).flatMap((film) => b.pictures.map((p) => ({ film, ...p }))),
            ),
            (p) => p.film,
          );
          const pictures = new Map(
            Object.entries(byFilm).map(([film, found]) => [
              film,
              found.toSorted((x, y) => y.at - x.at).map((p) => p.video),
            ]),
          );
          yield* Effect.logDebug(`review.index.read folders=${folders.length}`);
          const aliases = aliasesOf(roots);
          const named = Option.match(
            Option.liftPredicate(aliases, (a) => !Rec.isEmptyRecord(a)),
            { onNone: () => ({}), onSome: (a) => ({ aliases: a }) },
          );
          return { index: { folders, ...named }, pictures } satisfies Read;
        });

        const current = Effect.fn('Review.current')(function* (fresh: boolean) {
          const now = yield* Clock.currentTimeMillis;
          const began = yield* Ref.get(cached);
          const had = Option.filter(
            began.last,
            (c) => !fresh && now - c.at < Duration.toMillis(INDEX_FRESH),
          );
          if (Option.isSome(had)) return had.value.read;
          const made = yield* read();
          yield* Ref.update(cached, (c) => {
            if (c.drops !== began.drops) return c;
            return { drops: c.drops, last: Option.some({ at: now, read: made }) };
          });
          return made;
        });

        const index = Effect.fn('Review.index')(function* (fresh: boolean) {
          return (yield* current(fresh)).index;
        });

        const pictures = Effect.fn('Review.pictures')(function* (film: string) {
          return (yield* current(false)).pictures.get(film) ?? [];
        });

        const videoOfRender = Effect.fn('Review.renderVideo')(function* (
          dir: string,
          render: Render,
        ) {
          const names = playedFiles(render);
          const { parts } = yield* lookIn(dir, names, names);
          return videoOf({ ...parts, record: render }, names);
        });

        return Review.of({
          roots,
          index,
          written: drop,
          pictures,
          renderVideo: videoOfRender,
          resolve,
          duration,
          frame,
          phone,
          derive,
        });
      }),
    );

  static readonly layerConfig = <R>(defaults: Effect.Effect<ReadonlyArray<ReviewRoot>, never, R>) =>
    Layer.unwrap(
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const home = yield* Config.String('HOME').pipe(Config.withDefault('.'));
        const given = yield* Config.option(Config.String('FILM_REVIEW_ROOTS'));
        const extra = yield* Config.String('FILM_REVIEW_EXTRA_ROOTS').pipe(Config.withDefault(''));
        const base = yield* Option.match(given, {
          onNone: () => defaults,
          onSome: (text) => Effect.succeed(parseRoots(text, path)),
        });
        const roots = [...base, ...parseRoots(extra, path)];
        const cache = yield* Config.String('FILM_REVIEW_CACHE').pipe(
          Config.withDefault(path.join(home, '.cache', 'film-review')),
        );
        const phone = yield* Config.String('FILM_REVIEW_PHONE').pipe(Config.withDefault('on'));
        return Review.layer({
          roots,
          cache,
          phoneOver: PHONE_OVER,
          maxVideo: MAX_VIDEO,
          phoneCopies: phone !== 'off',
        });
      }),
    );
}
