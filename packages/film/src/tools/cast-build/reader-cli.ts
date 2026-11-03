import * as Argument from 'effect/cli/Argument';
import * as Command from 'effect/cli/Command';
import * as Flag from 'effect/cli/Flag';
import { Console, Effect, FileSystem, Option, Path, Schema } from 'effect';
import { PuppetImagesBun } from '../../puppet/images-bun.ts';
import { sha256Hex } from '../digest.ts';
import { castCache, manifestOf } from './built.ts';
import { provenanceOf } from './clip-eval.ts';
import { CastReader } from './reader.ts';
import { chainClip } from './stages.ts';

class ClipUnowned extends Schema.TaggedError<ClipUnowned>()('ClipUnowned', {
  clip: Schema.String,
}) {
  override get message() {
    return `${this.clip} lies in no cast member's folder (none above it has cutout/coverage.ts)`;
  }
}

/** `reader chain --json`: the chain's report, with the reader, clip and member it ran on. */
const OutJson = Schema.fromJsonString(Schema.Unknown);

class ReaderUnknown extends Schema.TaggedError<ReaderUnknown>()('ReaderUnknown', {
  reader: Schema.String,
  reason: Schema.String,
}) {
  override get message() {
    return `no reader ${this.reader}: ${this.reason}`;
  }
}

class FramesAsked extends Schema.TaggedError<FramesAsked>()('FramesAsked', {}) {
  override get message() {
    return 'read --clip <mp4> or --pngs <dir>, one of them';
  }
}

/** The cache's names for imported readers: name → the checkpoint's sha256. */
const Registry = Schema.Record(Schema.String, Schema.String);
const RegistryJson = Schema.fromJsonString(Registry);
/** The part of the committed lock a read needs: its checkpoint's hash. */
const LockJson = Schema.fromJsonString(Schema.Struct({ checkpointSha256: Schema.String }));
const Imported = Schema.fromJsonString(
  Schema.Struct({ name: Schema.String, sha256: Schema.String, bytes: Schema.Finite }),
);
const SHA256 = /^[0-9a-f]{64}$/;

/** `readers.json` in the cast cache; empty when it is not there. */
const registryIn = (cache: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const file = path.join(cache, 'readers.json');
    if (!(yield* fs.exists(file))) return {};
    return yield* Schema.decodeEffect(RegistryJson)(yield* fs.readFileString(file));
  });

/** The `--reader` flag: a name `import` gave, a checkpoint's sha256, or `current`. */
const readerFlag = Flag.String('reader').pipe(
  Flag.withDescription(
    "a name `reader import` gave, a checkpoint's sha256, or current (the lock's)",
  ),
);
/** The `--lock` flag: the committed lock `--reader current` reads. */
const lockFlag = Flag.String('lock').pipe(
  Flag.withDefault('src/library/cutout/reader.lock.json'),
  Flag.withDescription('the reader lock `current` names (from apps/animations)'),
);
/** The `--clip` flag: an mp4, mapped onto the reader's canvas. */
const clipFlag = Flag.String('clip').pipe(
  Flag.optional,
  Flag.withDescription('an mp4 to read, mapped onto the canvas'),
);
const jsonFlag = Flag.Boolean('json').pipe(
  Flag.withDefault(false),
  Flag.withDescription('print JSON'),
);

/** A reader named on the command line, as its checkpoint's sha256. */
const shaOf = Effect.fn('cast.reader.shaOf')(function* (
  reader: string,
  lock: string,
  cache: string,
) {
  const fs = yield* FileSystem.FileSystem;
  const unknown = (reason: string) => ReaderUnknown.make({ reader, reason });
  if (reader === 'current') {
    if (!(yield* fs.exists(lock))) return yield* unknown(`the lock ${lock} is not there yet`);
    return (yield* Schema.decodeEffect(LockJson)(yield* fs.readFileString(lock))).checkpointSha256;
  }
  if (SHA256.test(reader)) return reader;
  const named = Option.fromNullishOr((yield* registryIn(cache))[reader]);
  if (Option.isNone(named)) return yield* unknown('no reader import gave that name');
  return named.value;
});

/** A reader named on the command line, as its checkpoint's file in the cast cache. */
const checkpointOf = Effect.fn('cast.reader.checkpointOf')(function* (
  reader: string,
  lock: string,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const cache = yield* castCache;
  const sha = yield* shaOf(reader, lock, cache);
  const file = path.join(cache, 'objects', sha);
  const unknown = (reason: string) => ReaderUnknown.make({ reader, reason });
  if (!(yield* fs.exists(file))) return yield* unknown(`its checkpoint ${sha} is not in the cache`);
  return file;
});

const importReader = Command.make(
  'import',
  {
    checkpoint: Argument.String('checkpoint').pipe(
      Argument.withDescription('the checkpoint (.pt) to copy into the cache; it is only read'),
    ),
    name: Flag.String('name').pipe(Flag.withDescription('the name --reader finds it by')),
    json: jsonFlag,
  },
  Effect.fn('film.concept.reader.import')(function* (input) {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const cache = yield* castCache;
    const bytes = yield* fs.readFile(input.checkpoint);
    const sha256 = sha256Hex(bytes);
    const objects = path.join(cache, 'objects');
    yield* fs.makeDirectory(objects, { recursive: true });
    const file = path.join(objects, sha256);
    if (!(yield* fs.exists(file))) {
      const partial = `${file}.partial`;
      yield* fs.writeFile(partial, bytes);
      yield* fs.rename(partial, file);
    }
    const registry = { ...(yield* registryIn(cache)), [input.name]: sha256 };
    yield* fs.writeFileString(
      path.join(cache, 'readers.json'),
      yield* Schema.encodeEffect(RegistryJson)(registry),
    );
    const made = { name: input.name, sha256, bytes: bytes.byteLength };
    if (input.json) yield* Console.log(yield* Schema.encodeEffect(Imported)(made));
    else yield* Console.log(`reader ${made.name} = ${made.sha256} (${made.bytes} bytes)`);
  }),
).pipe(Command.withDescription('Copy a reader checkpoint into the cast cache under a name'));

/** The read's frames, each naming its nearest drawing. */
const ReadSummary = Schema.fromJsonString(
  Schema.Struct({
    n: Schema.Finite,
    sec_per_frame: Schema.Finite,
    frames: Schema.Array(Schema.Struct({ drawing: Schema.String })),
  }),
);

const read = Command.make(
  'read',
  {
    reader: readerFlag,
    lock: lockFlag,
    clip: clipFlag,
    pngs: Flag.String('pngs').pipe(
      Flag.optional,
      Flag.withDescription('a folder of canvas PNGs to read'),
    ),
    json: jsonFlag,
  },
  Effect.fn('film.concept.reader.read')(function* (input) {
    if (Option.isSome(input.clip) && Option.isSome(input.pngs)) return yield* FramesAsked.make({});
    const ckpt = yield* checkpointOf(input.reader, input.lock);
    const frames = yield* Option.match(input.clip, {
      onSome: (clip) => Effect.succeed({ clip }),
      onNone: () =>
        Option.match(input.pngs, {
          onSome: (pngs) => Effect.succeed({ pngs }),
          onNone: () => FramesAsked.make({}),
        }),
    });
    const text = yield* (yield* CastReader).read(ckpt, frames);
    if (input.json) return yield* Console.log(text);
    const summary = yield* Schema.decodeEffect(ReadSummary)(text);
    const named: Record<string, number> = {};
    for (const f of summary.frames) named[f.drawing] = (named[f.drawing] ?? 0) + 1;
    yield* Console.log(`read ${summary.n} frames, ${summary.sec_per_frame.toFixed(3)} s/frame`);
    for (const [drawing, n] of Object.entries(named)) yield* Console.log(`  ${drawing}: ${n}`);
  }),
).pipe(Command.withDescription('Read a clip or a folder of canvas PNGs with a reader'));

const evaluate = Command.make(
  'eval',
  {
    reader: readerFlag,
    lock: lockFlag,
    shard: Flag.String('shard').pipe(
      Flag.withDescription("a drawing's renders shard (a tar with held/), from the cast cache"),
    ),
  },
  Effect.fn('film.concept.reader.eval')(function* (input) {
    const ckpt = yield* checkpointOf(input.reader, input.lock);
    const text = yield* (yield* CastReader).evaluate(ckpt, input.shard);
    yield* Console.log(text);
  }),
).pipe(
  Command.withDescription("Score a reader on a drawing's held renders; prints eval.py's JSON"),
);

/** The member a clip belongs to: the nearest folder above it with a `cutout/coverage.ts`. */
const clipMember = Effect.fn('cast.reader.clipMember')(function* (clip: string) {
  const path = yield* Path.Path;
  const file = path.resolve(clip);
  for (let dir = path.dirname(file); dir !== path.dirname(dir); dir = path.dirname(dir)) {
    const manifest = yield* manifestOf(dir);
    if (Option.isSome(manifest)) {
      const { coverage } = manifest.value;
      const named = (coverage.clips ?? []).find((c) => path.resolve(dir, c.file) === file);
      return { memberDir: dir, coverage, bands: named?.bands ?? [] };
    }
  }
  return yield* ClipUnowned.make({ clip });
});

const chain = Command.make(
  'chain',
  {
    reader: readerFlag,
    lock: lockFlag,
    clip: Flag.String('clip').pipe(
      Flag.withDescription("a clip inside a cast member's folder, as its manifest's clips name it"),
    ),
    json: jsonFlag,
  },
  Effect.fn('film.concept.reader.chain')(function* (input) {
    const ckpt = yield* checkpointOf(input.reader, input.lock);
    const { memberDir, coverage, bands } = yield* clipMember(input.clip);
    const { map } = yield* provenanceOf(input.clip);
    const made = yield* chainClip({
      ckpt,
      clip: input.clip,
      map,
      memberDir,
      coverage,
      bands,
      cache: yield* castCache,
    });
    const out = { reader: input.reader, clip: input.clip, member: coverage.member, ...made };
    if (input.json) return yield* Console.log(yield* Schema.encodeEffect(OutJson)(out));
    for (const r of made.runs) yield* Console.log(`run f${r.from}-${r.to} ${r.drawing}`);
    yield* Console.log(`keys ${made.keys.join(' ')}`);
    for (const [band, iou] of Object.entries(made.iou)) {
      const named = Object.entries(made.named[band] ?? {})
        .map(([d, n]) => `${d} ${n}`)
        .join(', ');
      yield* Console.log(`f${band}: IoU ${iou.toFixed(4)}; ${named}`);
    }
    yield* Console.log(
      `fits ${made.fits.run} run, ${made.fits.cached} cached, ${made.fits.ms} ms; chain ${made.ms} ms`,
    );
  }),
).pipe(
  Command.withDescription(
    "Read a member's clip with a reader and chain it: runs, keys fitted (cached), each band's IoU and the drawings named",
  ),
  Command.provide(PuppetImagesBun),
);

export const reader = Command.make('reader').pipe(
  Command.withDescription(
    'The cast reader: import a checkpoint, read frames with it, score it, chain a clip with it',
  ),
  Command.withSubcommands([importReader, read, evaluate, chain]),
  Command.provide(CastReader.layer),
);
