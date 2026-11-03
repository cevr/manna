import { Clock, Effect, FileSystem, Option, Path, Result, Schema, Struct } from 'effect';
import * as Tool from 'effect/ai/Tool';
import { reviewFileUrl } from '../core/api.ts';
import { Catalogue, Render } from '../core/catalogue.ts';
import { LabLinks, linksAt } from '../core/lab-events.ts';
import { ProductionId, VersionNumber, setNamed } from '../core/production.ts';
import { ReviewManifest, ReviewManifestJson } from '../core/review.ts';
import { repoJson } from '../core/schema.ts';
import { Segment } from '../core/segment.ts';
import { CATALOGUE_FILE, RenderCatalogue } from './catalogue.ts';
import { ContentStore, type Manifest, writeWholeWith } from './content-store.ts';
import { FilmFolder, filmNamed, filmsOut } from './film-repo.ts';
import { LabAddress, labCommand } from './lab-command.ts';
import { LabRefused, inside, refused } from './lab-mcp-parts.ts';
import { ProductionStore, type Stamp, stampedManifest } from './production-store.ts';
import {
  Review,
  canonicalOf,
  filesInMontage,
  namesInMontage,
  pathOf,
  recordsUnder,
  refOf,
} from './review.ts';
import { widenRecord } from './segment-cache.ts';

export const SetRead = Schema.Struct({
  set: Schema.String,
  kind: Schema.Literals(['montage', 'project']),
  title: Schema.optionalKey(Schema.String),
  dir: Schema.String,
});

const CatalogueRead = Schema.Struct({
  set: Schema.String,
  catalogue: Catalogue,
});

const SetFileRead = Schema.Struct({
  file: Schema.String,
  ref: Schema.String,
  src: Schema.String,
  links: LabLinks,
});

const SetManifestRead = Schema.Struct({
  set: Schema.String,
  dir: Schema.String,
  manifest: ReviewManifest,
  files: Schema.Array(SetFileRead),
});

const SetFile = Schema.Struct({
  from: Schema.String.annotate({ description: 'An absolute path on this machine.' }),
  to: Schema.String.annotate({
    description:
      'Where it goes in the set, relative (`images/1-k1.png`); the file name when left out.',
  }).pipe(Schema.optionalKey),
});

const ManifestPatch = Schema.Struct({
  production: Schema.optionalKey(
    ProductionId.annotate({
      description:
        "The production whose timeline the set lands on (a film's, or a track such as `look`): it must keep a ledger. The set is stamped published now, as `film publish` stamps it.",
    }),
  ),
  version: Schema.optionalKey(
    VersionNumber.annotate({
      description:
        "The production's version the set was made for, given with `production`; the version open now when left out.",
    }),
  ),
  title: Schema.optionalKey(Schema.String),
  blurb: Schema.optionalKey(Schema.String),
  docs: Schema.optionalKey(Schema.Array(Schema.String)),
  images: Schema.optionalKey(Schema.Array(Schema.String)),
  videos: Schema.optionalKey(Schema.Array(Schema.String)),
  downloads: Schema.optionalKey(Schema.Array(Schema.String)),
  sets: Schema.optionalKey(
    Schema.Record(Schema.String, Schema.Json).annotate({
      description:
        'Comparison sets by clip: `{ title?, order?, start?, moments?, variants: { <id>: { label?, tag?, verdict?, notes?, file? } } }`; a variant with no `file` is `<clip>.<id>.share.mp4` or `<clip>.<id>.mp4` beside it.',
    }),
  ),
});

const ManifestJson = repoJson(Schema.Record(Schema.String, Schema.Json));

const SetName = Segment.check(
  Schema.isPattern(/^[a-z0-9][a-z0-9._-]*$/, {
    message: 'a folder name of lower case, digits, `.`, `_` and `-`',
  }),
);

const SET_FILE = /\.(png|jpe?g|webp|gif|svg|mp4|webm|mov|m4a|mp3|wav|vtt|md|txt|json|pdf|zip)$/i;

const emptyManifest = Schema.decodeSync(ReviewManifestJson)('{}');

const CatalogueTool = Tool.make('catalogue', {
  description:
    "A project folder's render catalogue: its renders, and the owner's approvals and comments on them. Name the folder by `set` (a ref from `sets`), or a film's own by `film`.",
  parameters: Schema.Struct({
    film: Schema.optionalKey(Schema.String),
    set: Schema.optionalKey(Schema.String),
  }),
  success: CatalogueRead,
  failure: LabRefused,
}).annotate(Tool.Readonly, true);

export const SetsTool = Tool.make('sets', {
  description:
    'Every set the lab lists, by ref, as the review lists them (a folder with something to review: a set published with no file in it waits until one lands): montages (a `review.json`) and project folders (a `catalogue.json`), each with its title, lab link and folder.',
  success: Schema.Struct({ sets: Schema.Array(SetRead) }),
  failure: LabRefused,
}).annotate(Tool.Readonly, true);

const SetTool = Tool.make('set', {
  description:
    "A montage set's `review.json` and its folder, and each file it shows where the lab serves it (`files`: its `ref` for a `video` or `document` block, its `src` for an ask's image, its links): copy them, never build them.",
  parameters: Schema.Struct({ set: Schema.String }),
  success: SetManifestRead,
  failure: LabRefused,
}).annotate(Tool.Readonly, true);

const PublishSet = Tool.make('publish_set', {
  description:
    "Publish a set into the lab, or update one: its folder `name` in the lab's own `out/` (never a project folder, a film's or one a catalogue keeps: a render is recorded there with `record_render`), the files copied in (each `from` an absolute path, `to` its place in the folder), and its `review.json` written with the keys given (each replaces the one there; a key left out is kept). List each file the set shows under `images`, `videos`, `docs`, `downloads` or a comparison set's variants (and their `notes`), by its path in the folder: each must be there once the files are in, a variant with no `file` as its share copy or its master. Answers the set's ref, and each file it shows where the lab serves it (`files`: its `ref`, its `src` for an ask's image, its links).",
  parameters: Schema.Struct({
    name: SetName,
    files: Schema.optionalKey(Schema.Array(SetFile)),
    manifest: ManifestPatch,
  }),
  success: SetManifestRead,
  failure: LabRefused,
});

const RecordRender = Tool.make('record_render', {
  description:
    "Record a render in a film's catalogue (its project folder, `out/<film>`), in place of the one before it at the same address and variant, so the review lists it. `film render` records its own; use this for a render made another way. Every file it names must be in the project folder, named relative to it.",
  parameters: Schema.Struct({
    film: Schema.String,
    render: Schema.Struct(Struct.omit(Render.fields, ['at'])),
  }),
  success: Schema.Struct({ set: Schema.String }),
  failure: LabRefused,
});

export const setsReads = Effect.fn('LabMcp.setsReads')(function* () {
  const fs = yield* FileSystem.FileSystem;
  const links = yield* LabAddress;
  const path = yield* Path.Path;
  const folder = yield* FilmFolder;
  const review = yield* Review;
  const store = yield* ContentStore;
  const catalogues = yield* RenderCatalogue;
  const productions = yield* ProductionStore;
  const films = yield* Effect.context<FilmFolder>();
  const platform = yield* Effect.context<FileSystem.FileSystem | Path.Path>();
  const out = yield* refused(filmsOut);

  const linksOf = (at: string) => linksAt(links, at);
  const named = (film: string) => refused(filmNamed(film).pipe(Effect.provideContext(films)));

  const sets = Effect.gen(function* () {
    const index = yield* review.index(true);
    const walked = yield* recordsUnder(review.roots).pipe(Effect.provideContext(platform));
    const byRef = new Map(walked.map((record) => [record.ref, record]));
    return index.folders.flatMap((listed) =>
      Option.toArray(Option.fromUndefinedOr(byRef.get(listed.ref))).map(
        (record): typeof SetRead.Type => ({
          set: listed.ref,
          kind: record.kind,
          ...Option.match(listed.title, { onNone: () => ({}), onSome: (title) => ({ title }) }),
          dir: record.dir,
        }),
      ),
    );
  });

  const folderOf = Effect.fn('LabMcp.folderOf')(function* (
    film: Option.Option<string>,
    set: Option.Option<string>,
  ) {
    if (Option.isSome(set)) {
      const dir = yield* Effect.fromOption(pathOf(review.roots, set.value, path), () =>
        LabRefused.make({ reason: `no set ${set.value} under the lab's roots (see \`sets\`)` }),
      );
      return { ref: canonicalOf(review.roots, set.value), dir, name: path.basename(dir) };
    }
    if (Option.isNone(film))
      return yield* LabRefused.make({ reason: 'name the folder: a `set` ref, or a `film`' });
    const dir = folder.paths(yield* named(film.value)).out;
    const ref = yield* Effect.fromOption(refOf(review.roots, dir, path), () =>
      LabRefused.make({
        reason: `film ${film.value}'s folder ${dir} is under none of the lab's roots`,
      }),
    );
    return { ref, dir, name: film.value };
  });

  const catalogueOf = Effect.fn('LabMcp.catalogue')(function* (
    film: Option.Option<string>,
    set: Option.Option<string>,
  ) {
    const at = yield* folderOf(film, set);
    const catalogue = yield* refused(catalogues.read({ name: at.name, out: at.dir }));
    return { set: at.ref, catalogue };
  });

  const manifestAt = (dir: string): Manifest<{ readonly [k: string]: Schema.Json }> => ({
    file: path.join(dir, 'review.json'),
    codec: ManifestJson,
    empty: {},
  });

  const filesOf = (ref: string, dir: string, manifest: ReviewManifest) =>
    Effect.map(
      Effect.filter(namesInMontage(manifest), (name) =>
        Option.match(inside(path, dir, name), {
          onNone: () => Effect.succeed(false),
          onSome: (at) => Effect.orElseSucceed(fs.exists(at), () => false),
        }),
      ),
      (names) =>
        names.map((file) => {
          const fileRef = `${ref}/${file}`;
          const src = reviewFileUrl(fileRef);
          return { file, ref: fileRef, src, links: linksOf(src) };
        }),
    );

  const setOf = Effect.fn('LabMcp.set')(function* (ref: string) {
    const at = yield* folderOf(Option.none(), Option.some(ref));
    const file = path.join(at.dir, 'review.json');
    if (!(yield* refused(fs.exists(file))))
      return yield* LabRefused.make({
        reason: `set ${ref} has no review.json: read it with \`catalogue\``,
      });
    const manifest = yield* refused(
      store.read({ file, codec: ReviewManifestJson, empty: emptyManifest }),
    );
    return {
      set: ref,
      dir: at.dir,
      manifest,
      files: yield* filesOf(ref, at.dir, manifest),
    };
  });

  const stampOf = (patch: typeof ManifestPatch.Type) =>
    Effect.gen(function* () {
      const version = Option.fromUndefinedOr(patch.version);
      const named = Option.fromUndefinedOr(patch.production);
      if (Option.isNone(named)) {
        if (Option.isNone(version)) return Option.none<Stamp>();
        return yield* LabRefused.make({
          reason: 'a version names one of the production given with it: give `production` too',
        });
      }
      const at = yield* Clock.currentTimeMillis;
      return Option.some(yield* refused(productions.stamp(named.value, version, at)));
    });

  const publishSet = Effect.fn('LabMcp.publishSet')(function* (
    name: string,
    files: ReadonlyArray<typeof SetFile.Type>,
    patch: typeof ManifestPatch.Type,
  ) {
    const dir = path.join(out, name);
    const ref = yield* Effect.fromOption(refOf(review.roots, dir, path), () =>
      LabRefused.make({ reason: `the lab's out/ (${out}) is under none of its review roots` }),
    );
    const elsewhere =
      'publish the set under another name, and record a render there with `record_render`';
    if ((yield* folder.names).includes(name))
      return yield* LabRefused.make({
        reason: `${name} is film ${name}'s project folder, where its renders are recorded: ${elsewhere}`,
      });
    if (yield* fs.exists(path.join(dir, CATALOGUE_FILE)).pipe(Effect.orElseSucceed(() => false)))
      return yield* LabRefused.make({
        reason: `${name} is a project folder (its ${CATALOGUE_FILE}): ${elsewhere}`,
      });
    const copies = yield* Effect.forEach(files, (f) =>
      Effect.gen(function* () {
        if (!path.isAbsolute(f.from))
          return yield* LabRefused.make({
            reason: `${f.from}: name the file by its absolute path`,
          });
        const info = yield* refused(fs.stat(f.from));
        if (info.type !== 'File')
          return yield* LabRefused.make({ reason: `${f.from} is not a file` });
        const rel = f.to ?? path.basename(f.from);
        if (!SET_FILE.test(rel))
          return yield* LabRefused.make({
            reason: `${rel}: a set carries images, videos, sound, docs and captions`,
          });
        const to = yield* Effect.fromOption(inside(path, dir, rel), () =>
          LabRefused.make({ reason: `${rel} is not a place in the set's folder` }),
        );
        return { from: f.from, to };
      }),
    );
    const stamp = yield* stampOf(patch);
    const written = yield* refused(
      store.transact(manifestAt(dir), (current) =>
        Effect.gen(function* () {
          const given = { ...current, ...patch };
          const next = Option.match(stamp, {
            onNone: () => given,
            onSome: (at) => stampedManifest(given, at),
          });
          const manifest = yield* Schema.decodeUnknownEffect(ReviewManifest)(next).pipe(
            Effect.mapError((e) => LabRefused.make({ reason: `review.json: ${e.message}` })),
          );
          const there = (name: string) =>
            Option.match(inside(path, dir, name), {
              onNone: () => Effect.succeed(false),
              onSome: (at) =>
                Effect.map(fs.exists(at), (found) => found || copies.some((c) => c.to === at)),
            });
          const missing = yield* Effect.filter(filesInMontage(manifest), (names) =>
            Effect.map(Effect.forEach(names, there), (found) => !found.includes(true)),
          );
          if (missing.length > 0)
            return yield* LabRefused.make({
              reason: `review.json names what the folder lacks: ${missing.map((names) => names.join(' or ')).join(', ')}`,
            });
          for (const copy of copies) {
            yield* fs.makeDirectory(path.dirname(copy.to), { recursive: true });
            yield* writeWholeWith(
              fs,
              copy.to,
              (partial) => fs.copyFile(copy.from, partial),
              (partial) => fs.rename(partial, copy.to),
            );
          }
          return [manifest, next] as const;
        }),
      ),
    );
    yield* Effect.log(`lab.mcp.publish set=${ref} files=${copies.length}`);
    return {
      set: ref,
      dir,
      manifest: written,
      files: yield* filesOf(ref, dir, written),
    };
  }, Effect.ensuring(review.written));

  const recordRender = Effect.fn('LabMcp.recordRender')(function* (
    name: string,
    given: Omit<Render, 'at'>,
  ) {
    const at = yield* folderOf(Option.some(name), Option.none());
    const files = [
      ...Option.toArray(given.files.clip),
      ...Option.toArray(given.files.share),
      ...Option.toArray(given.files.captions),
      ...Option.toArray(given.files.chapters),
      ...Option.toArray(given.files.description),
      ...given.files.images,
    ];
    const missing = yield* Effect.filter(files, (file) =>
      Option.match(inside(path, at.dir, file), {
        onNone: () => Effect.succeed(true),
        onSome: (where) =>
          Effect.map(fs.exists(where).pipe(Effect.orElseSucceed(() => false)), (there) => !there),
      }),
    );
    if (missing.length > 0)
      return yield* LabRefused.make({
        reason: `the render names files its project folder ${at.dir} lacks: ${missing.join(', ')}`,
      });
    const render: Render = { ...given, at: yield* Clock.currentTimeMillis };
    const lead = Option.filter(
      Option.orElse(render.files.clip, () => render.files.share),
      () => render.kind === 'video',
    );
    yield* Option.match(lead, {
      onNone: () => Effect.void,
      onSome: (file) =>
        refused(
          widenRecord(at.dir, path.resolve(at.dir, file), [], render.at, []).pipe(
            Effect.provideService(FileSystem.FileSystem, fs),
            Effect.provideService(Path.Path, path),
          ),
        ),
    });
    yield* refused(catalogues.record({ name: at.name, out: at.dir }, render));
    return { set: at.ref };
  }, Effect.ensuring(review.written));

  const folderNamed = Effect.fn('LabMcp.folderNamed')(function* (given: string) {
    const named = setNamed(
      (yield* sets).map((listed) => listed.set),
      canonicalOf(review.roots, given),
    );
    if (Result.isFailure(named))
      return yield* LabRefused.make({
        reason: `${named.failure.folder} is a folder in more than one root (${named.failure.refs.join(', ')}), and a production's timeline names a set by its folder alone: rename one, or leave out \`set\``,
      });
    return yield* Option.match(named.success, {
      onNone: () =>
        Effect.fail(
          LabRefused.make({
            reason: `no set ${given}: \`sets\` lists them by ref (a folder under its root names one too)`,
          }),
        ),
      onSome: (set) => Effect.succeed(set.folder),
    });
  });

  const setRef = (given: string) => canonicalOf(review.roots, given);

  return { sets, setOf, catalogueOf, publishSet, recordRender, folderNamed, setRef };
});

const lab = setsReads();

export const setsCommands = [
  labCommand(CatalogueTool, {
    run: ({ film, set }) =>
      Effect.flatMap(lab, (l) =>
        l.catalogueOf(Option.fromUndefinedOr(film), Option.fromUndefinedOr(set)),
      ),
  }),
  labCommand(SetsTool, {
    run: () => Effect.flatMap(lab, (l) => Effect.map(l.sets, (sets) => ({ sets }))),
  }),
  labCommand(SetTool, { run: ({ set }) => Effect.flatMap(lab, (l) => l.setOf(set)) }),
  labCommand(PublishSet, {
    run: ({ name, files, manifest }) =>
      Effect.flatMap(lab, (l) => l.publishSet(name, files ?? [], manifest)),
  }),
  labCommand(RecordRender, {
    run: ({ film, render }) => Effect.flatMap(lab, (l) => l.recordRender(film, render)),
  }),
];
