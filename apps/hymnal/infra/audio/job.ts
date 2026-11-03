import { Console, Data, Effect, Option, Result, Schema } from 'effect';

import { AUDIO_PREFIX, Head, Item, SDAH_HYMNS, holds, needsFill, plan, unquote } from './plan.ts';
import type { FillEntry, TargetObject } from './stores.ts';
import { Fill, Hash, Source, Target } from './stores.ts';

export const CACHE_CONTROL = 'public, max-age=604800';

const FILL_WARNING = 10;

type Outcome = Data.TaggedEnum<{
  Kept: {
    readonly hymn: number;
    readonly key: string;
    readonly size: number;
    readonly md5: string;
  };
  Uploaded: {
    readonly hymn: number;
    readonly key: string;
    readonly size: number;
    readonly md5: string;
  };
  Would: { readonly hymn: number };
  Failed: { readonly hymn: number; readonly reason: string };
  Missing: { readonly hymn: number };
}>;
const Outcome = Data.taggedEnum<Outcome>();

export class CopyIncomplete extends Schema.TaggedError<CopyIncomplete>()('CopyIncomplete', {
  failed: Schema.Finite,
  missing: Schema.Finite,
  verified: Schema.Finite,
}) {
  override get message() {
    return `audio copy incomplete: failed=${this.failed} missing=${this.missing} verified=${this.verified}/${SDAH_HYMNS.length}; run it again to resume`;
  }
}

class Refused extends Schema.TaggedError<Refused>()('Refused', { reason: Schema.String }) {
  override get message() {
    return this.reason;
  }
}

const reasonOf = (error: { readonly message: string }) => error.message.replaceAll('\n', ' ');

const heads = Effect.gen(function* () {
  const source = yield* Source;
  const answered = yield* Effect.forEach(
    SDAH_HYMNS,
    (hymn) =>
      source.head(hymn).pipe(
        Effect.map(
          Option.match({
            onNone: () => Head.Absent(),
            onSome: (head) => Head.Present({ head }),
          }),
        ),
        Effect.catchTag('StoreFailed', (error) =>
          Effect.succeed(Head.Unanswered({ reason: reasonOf(error) })),
        ),
        Effect.map((head) => [hymn, head] as const),
      ),
    { concurrency: 16 },
  );
  return new Map(answered);
});

const fillTree = (answered: ReadonlyMap<number, Head>) =>
  Effect.gen(function* () {
    if (!needsFill(answered)) return Result.succeed(new Map<number, FillEntry>());
    const fill = yield* Fill;
    return yield* fill.tree.pipe(
      Effect.map((tree) => Result.succeed<ReadonlyMap<number, FillEntry>>(tree)),
      Effect.catchTag('StoreFailed', (error) => Effect.succeed(Result.fail(reasonOf(error)))),
    );
  });

const s3Bytes = Effect.fn('audio.s3Bytes')(function* (
  item: Extract<Item, { readonly _tag: 'FromS3' }>,
) {
  const source = yield* Source;
  const hash = yield* Hash;
  const bytes = yield* source.get(item.hymn);
  if (bytes.byteLength !== item.size) {
    return yield* Refused.make({
      reason: `s3 body ${bytes.byteLength} bytes, head said ${item.size}`,
    });
  }
  const md5 = hash.md5(bytes);
  if (Option.isSome(item.md5) && md5 !== item.md5.value) {
    return yield* Refused.make({ reason: `s3 body md5 ${md5}, etag ${item.md5.value}` });
  }
  return { bytes, md5: Option.getOrElse(item.md5, () => md5) };
});

const fillBytes = Effect.fn('audio.fillBytes')(function* (entry: FillEntry) {
  const fill = yield* Fill;
  const hash = yield* Hash;
  const bytes = yield* fill.get(entry);
  if (bytes.byteLength !== entry.size) {
    return yield* Refused.make({
      reason: `github body ${bytes.byteLength} bytes, tree said ${entry.size}`,
    });
  }
  const sha = hash.gitBlobSha1(bytes);
  if (sha !== entry.sha) {
    return yield* Refused.make({ reason: `github body blob ${sha}, tree said ${entry.sha}` });
  }
  return { bytes, md5: hash.md5(bytes) };
});

const upload = Effect.fn('audio.upload')(function* (
  hymn: number,
  key: string,
  bytes: Uint8Array,
  md5: string,
) {
  const target = yield* Target;
  const stored = yield* target.put(key, bytes, {
    contentType: 'audio/mpeg',
    cacheControl: CACHE_CONTROL,
  });
  if (!holds(stored, bytes.byteLength, md5)) {
    return yield* Refused.make({
      reason: `r2 stored etag ${unquote(stored.etag)} size ${stored.size}, expected ${md5} size ${bytes.byteLength}`,
    });
  }
  return Outcome.Uploaded({ hymn, key, size: bytes.byteLength, md5 });
});

const place = Effect.fn('audio.place')(function* (
  hymn: number,
  key: string,
  read: { readonly bytes: Uint8Array; readonly md5: string },
  existing: Option.Option<TargetObject>,
) {
  const size = read.bytes.byteLength;
  if (Option.exists(existing, (object) => holds(object, size, read.md5))) {
    return Outcome.Kept({ hymn, key, size, md5: read.md5 });
  }
  return yield* upload(hymn, key, read.bytes, read.md5);
});

const failed = (hymn: number) => (error: { readonly message: string }) =>
  Console.log(`failed ${hymn} ${reasonOf(error)}`).pipe(
    Effect.as(Outcome.Failed({ hymn, reason: reasonOf(error) })),
  );

const report = (line: string, outcome: Outcome) => Effect.as(Console.log(line), outcome);

const preview = (item: Item) =>
  Item.$match(item, {
    FromS3: ({ hymn, size }) => report(`upload ${hymn} s3 ${size}`, Outcome.Would({ hymn })),
    FromGitHub: ({ hymn, entry }) =>
      fillBytes(entry).pipe(
        Effect.flatMap(() => report(`fill ${hymn} github ${entry.size}`, Outcome.Would({ hymn }))),
        Effect.catchTags({ Refused: failed(hymn), StoreFailed: failed(hymn) }),
      ),
    Keep: ({ hymn }) => Effect.succeed(Outcome.Would({ hymn })),
    Missing: ({ hymn }) => report(`missing ${hymn}`, Outcome.Missing({ hymn })),
    Unreadable: ({ hymn, reason }) => failed(hymn)({ message: reason }),
  });

const copied = (line: string) => (outcome: Outcome) => {
  if (Outcome.$is('Uploaded')(outcome)) return report(line, outcome);
  return Effect.succeed(outcome);
};

const copy = (item: Item) =>
  Item.$match(item, {
    FromS3: (from) =>
      s3Bytes(from).pipe(
        Effect.flatMap((read) => place(from.hymn, from.key, read, from.existing)),
        Effect.flatMap(copied(`upload ${from.hymn} s3 ${from.size}`)),
        Effect.catchTags({ Refused: failed(from.hymn), StoreFailed: failed(from.hymn) }),
      ),
    FromGitHub: (from) =>
      fillBytes(from.entry).pipe(
        Effect.flatMap((read) => place(from.hymn, from.key, read, from.existing)),
        Effect.flatMap(copied(`fill ${from.hymn} github ${from.entry.size}`)),
        Effect.catchTags({ Refused: failed(from.hymn), StoreFailed: failed(from.hymn) }),
      ),
    Keep: ({ hymn, key, size, md5 }) => Effect.succeed(Outcome.Kept({ hymn, key, size, md5 })),
    Missing: ({ hymn }) => report(`missing ${hymn}`, Outcome.Missing({ hymn })),
    Unreadable: ({ hymn, reason }) => failed(hymn)({ message: reason }),
  });

const sources = (items: ReadonlyArray<Item>) => {
  const s3 = items.flatMap((item) => {
    if (Item.$is('Keep')(item) || Item.$is('FromS3')(item)) return [item.size];
    return [];
  });
  const github = items.flatMap((item) => {
    if (Item.$is('FromGitHub')(item)) return [item.entry.size];
    return [];
  });
  const missing = items.filter(Item.$is('Missing')).length;
  const sum = (sizes: ReadonlyArray<number>) => sizes.reduce((total, size) => total + size, 0);
  const total = [...s3, ...github];
  return `s3=${s3.length}/${sum(s3)} github=${github.length}/${sum(github)} missing=${missing} total=${total.length}/${sum(total)}`;
};

const count = (outcomes: ReadonlyArray<Outcome>, tag: Outcome['_tag']) =>
  outcomes.filter((outcome) => outcome._tag === tag).length;

const warnFills = (items: ReadonlyArray<Item>) => {
  const fills = items.filter(Item.$is('FromGitHub')).length;
  if (fills <= FILL_WARNING) return Effect.void;
  return Console.log(
    `warning ${fills} hymns come from the github fill, not s3: is the s3 bucket still public?`,
  );
};

const endOf = (failures: number, missing: number, verified: number, complete: boolean) => {
  if (complete) return Effect.void;
  return Effect.fail(CopyIncomplete.make({ failed: failures, missing, verified }));
};

export const dryRun = Effect.gen(function* () {
  const answered = yield* heads;
  const items = plan(answered, yield* fillTree(answered), new Map());
  yield* warnFills(items);
  const outcomes = yield* Effect.forEach(items, preview, { concurrency: 4 });
  yield* Console.log(`audio-copy dry-run ${sources(items)} target=unread`);
  const failures = count(outcomes, 'Failed');
  const missing = count(outcomes, 'Missing');
  return yield* endOf(failures, missing, 0, failures + missing === 0);
});

const verify = (outcomes: ReadonlyArray<Outcome>) =>
  Effect.gen(function* () {
    const target = yield* Target;
    const listed = yield* target
      .list(AUDIO_PREFIX)
      .pipe(
        Effect.catchTag('StoreFailed', (error) =>
          Console.log(`failed verify ${reasonOf(error)}`).pipe(
            Effect.as(new Map<string, TargetObject>()),
          ),
        ),
      );
    return outcomes.filter((outcome) => {
      if (!Outcome.$is('Kept')(outcome) && !Outcome.$is('Uploaded')(outcome)) return false;
      return Option.exists(Option.fromUndefinedOr(listed.get(outcome.key)), (object) =>
        holds(object, outcome.size, outcome.md5),
      );
    }).length;
  });

export const run = Effect.gen(function* () {
  const answered = yield* heads;
  const fill = yield* fillTree(answered);
  const target = yield* Target;
  const listed = yield* target.list(AUDIO_PREFIX);
  const items = plan(answered, fill, listed);
  yield* warnFills(items);
  const outcomes = yield* Effect.forEach(items, copy, { concurrency: 4 });
  const verified = yield* verify(outcomes);
  const kept = count(outcomes, 'Kept');
  const uploaded = count(outcomes, 'Uploaded');
  const failures = count(outcomes, 'Failed');
  const missing = count(outcomes, 'Missing');
  yield* Console.log(
    `audio-copy run ${sources(items)} target=kept ${kept} uploaded ${uploaded} failed ${failures} verified ${verified}/${SDAH_HYMNS.length}`,
  );
  return yield* endOf(failures, missing, verified, verified === SDAH_HYMNS.length);
});
