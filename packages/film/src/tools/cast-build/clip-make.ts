// The clip-make stage (`clip:<clip>@<member>`): each of a member's clips
// (`coverage.ts` `clips`) as its fal request asks for it. The request is the
// clip's prompt and seed at the house settings, with its given frames (the
// PNGs beside the clip, `<stem>.first.png` and `<stem>.last.png`) by path
// from the checkout's root and hash (`clips.ts` `clipRequestOf`). The stage
// is keyed by the request's content only (its endpoint, its input and its
// frames' hashes, no path), so a clip is asked for once in every checkout.
//
// This stage makes no fal call: it adopts the committed clip (`<stem>.mp4`,
// with its provenance `<stem>.json`) when `adoptClip` takes it, and its
// output is the mp4's bytes. Else it fails as `ClipMissing`, its reason
// carrying the request as JSON, the call that would make the clip. A cached
// output holds (`holds`) only while the committed clip is still adopted and
// is the same bytes, so the files stay out of the key and a changed clip is
// judged again.

import { Effect, FileSystem, Option, Path, Result, Schema } from 'effect';
import { sha256Hex } from '../digest.ts';
import { type ClipRequest, adoptClip, clipRequestOf } from './clips.ts';
import type { Clip, Coverage } from './coverage.ts';
import { type Stage, StageFailed } from './graph.ts';

/** Bumped when the stage's code makes other bytes from the same request. */
const VERSION = '1';

/** A given frame's hash when its PNG is not in the checkout: the request cannot be sent. */
const ABSENT = 'absent';

const Json = Schema.fromJsonString(Schema.Unknown);
const decodeJson = Schema.decodeUnknownOption(Json);
const encodeJson = Schema.encodeSync(Json);

/** A clip's files, beside its mp4: its provenance and its given frames. */
const filesOf = (path: Path.Path, memberDir: string, file: string) => {
  const mp4 = path.join(memberDir, file);
  const stem = mp4.replace(/\.mp4$/, '');
  return { mp4, provenance: `${stem}.json`, first: `${stem}.first.png`, last: `${stem}.last.png` };
};

/** The request's content as the stage's key reads it: its endpoint, its input and its frames' hashes. */
const keyOf = (r: ClipRequest) =>
  encodeJson({
    endpoint: r.endpoint,
    input: r.input,
    frames: Option.match(Option.fromUndefinedOr(r.frames.last), {
      onNone: () => ({ first: r.frames.first.sha256 }),
      onSome: (last) => ({ first: r.frames.first.sha256, last: last.sha256 }),
    }),
  });

/** The stage that adopts `clip`'s committed mp4, made by `request`. */
const clipMakeStage = (o: {
  readonly member: string;
  readonly memberDir: string;
  readonly clip: Clip;
  readonly request: ClipRequest;
}): Stage<FileSystem.FileSystem | Path.Path> => {
  const id = `clip:${o.clip.id}@${o.member}`;
  /** The committed clip as `adoptClip` judges it against the request: the mp4's bytes, or the reason the stage fails. */
  const committed = Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const files = filesOf(path, o.memberDir, o.clip.file);
    const provenance = Option.getOrUndefined(
      Option.flatMap(
        Option.getSuccess(yield* Effect.result(fs.readFileString(files.provenance))),
        decodeJson,
      ),
    );
    const mp4 = Option.getSuccess(yield* Effect.result(fs.readFile(files.mp4)));
    const got = adoptClip(`${o.member}/${o.clip.id}`, o.request, {
      provenance,
      mp4Sha256: Option.getOrUndefined(Option.map(mp4, sha256Hex)),
    });
    if (got._tag === 'ClipMissing')
      return Result.fail(
        `${id}: ClipMissing: ${got.reason}; the fal request that makes it: ${got.request}`,
      );
    return Result.fromOption(mp4, () => `${id}: the adopted mp4 is gone`);
  });
  return {
    id,
    view: o.clip.id,
    inputs: [],
    version: VERSION,
    config: keyOf(o.request),
    run: () =>
      Effect.gen(function* () {
        const absent = [
          o.request.frames.first,
          ...Option.toArray(Option.fromUndefinedOr(o.request.frames.last)),
        ]
          .filter((f) => f.sha256 === ABSENT)
          .map((f) => f.path);
        if (absent.length > 0)
          return yield* StageFailed.make({
            reason: `${id}: no given frame at ${absent.join(', ')}; draw it before the clip is asked for`,
          });
        const got = yield* committed;
        if (Result.isFailure(got)) return yield* StageFailed.make({ reason: got.failure });
        return got.success;
      }),
    // the key reads the request only, so a cached mp4 answers it only while the
    // committed clip is still adopted and is those same bytes; else the stage runs
    // again, and adopts the new clip or fails as ClipMissing
    holds: (output) =>
      committed.pipe(
        Effect.map((got) =>
          Result.match(got, {
            onFailure: () => false,
            onSuccess: (mp4) => sha256Hex(mp4) === sha256Hex(output),
          }),
        ),
      ),
  };
};

/** Each of the member's clips as its clip-make stage, its request read from the checkout at `root`. */
export const clipMakeStages = Effect.fn('cast.build.clipMake')(function* (
  m: {
    readonly member: string;
    readonly memberDir: string;
    readonly coverage: Coverage;
  },
  root: string,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const frame = (file: string) =>
    fs.readFile(file).pipe(
      Effect.map(sha256Hex),
      Effect.orElseSucceed(() => ABSENT),
      Effect.map((sha256) => ({ path: path.relative(root, file), sha256 })),
    );
  return yield* Effect.forEach(m.coverage.clips ?? [], (clip) =>
    Effect.gen(function* () {
      const files = filesOf(path, m.memberDir, clip.file);
      const first = yield* frame(files.first);
      const last = yield* Effect.transposeOption(
        Option.map(Option.fromUndefinedOr(clip.given.last), () => frame(files.last)),
      );
      const request = clipRequestOf({ prompt: clip.prompt, seed: clip.seed, first, last });
      return clipMakeStage({ member: m.member, memberDir: m.memberDir, clip, request });
    }),
  );
});
