import { Effect, FileSystem, Option, Path, Predicate, Schema } from 'effect';

import { type BuiltImage, buildSite, builtImages, Format, sha256 } from './build-walk.ts';
import { AskAnswers, type AskRead, LabAsk, LabAsks } from './lab-asks.ts';
import { OUTSIDE, servedImages } from './served.ts';

export const RECORD = 'kit/approved-stills.json';

export const STILLS_QUESTION = 'stills';
export const APPROVE = 'approve';

export const Given = Schema.Struct({
  status: Schema.Literal('approved'),
  ask: Schema.String,
  lab: Schema.String,
  answered: Schema.String,
  answer: Schema.String,
  answers: AskAnswers,
  shown: Schema.Record(Schema.String, Schema.String),
});
export type Given = typeof Given.Type;

export const Approval = Schema.Union([
  Schema.Struct({ status: Schema.Literal('pending'), ask: Schema.String }),
  Given,
]);
export type Approval = typeof Approval.Type;

export const Approved = Schema.Struct({
  approval: Approval,
  earlier: Schema.Array(Given),
  stills: Schema.Record(Schema.String, Schema.String),
});
export type Approved = typeof Approved.Type;

export const savedAsk = (ask: string) => ({
  record: `kit/fixtures/ask-${ask}.json`,
  shown: `kit/fixtures/ask-${ask}.shown.json`,
});

const BodyJson = Schema.fromJsonString(Schema.Unknown, { space: 2 });
const ShownJson = Schema.fromJsonString(Schema.Record(Schema.String, Schema.String), {
  space: 2,
});

const saveAsk = Effect.fn('Approval.saveAsk')(function* (
  app: string,
  ask: string,
  { body }: AskRead,
  shown: Readonly<Record<string, string>>,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const { record, shown: shownAt } = savedAsk(ask);
  yield* fs.makeDirectory(path.dirname(path.join(app, record)), { recursive: true });
  yield* fs.writeFileString(
    path.join(app, record),
    `${yield* Schema.encodeEffect(BodyJson)(body)}\n`,
  );
  yield* fs.writeFileString(
    path.join(app, shownAt),
    `${yield* Schema.encodeEffect(ShownJson)(shown)}\n`,
  );
});

const RecordJson = Schema.fromJsonString(Approved, { space: 2 });

const outside = new Set(OUTSIDE.map(({ image }) => image));

export const servedStills = Effect.fn('Approval.served')(function* (app: string) {
  return (yield* servedImages(app)).filter((image) => !outside.has(image));
});

export const hashedStills = Effect.fn('Approval.hashed')(function* (app: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  return yield* Effect.forEach(yield* servedStills(app), (still) =>
    Effect.map(fs.readFile(path.join(app, still)), (bytes) => [still, sha256(bytes)] as const),
  );
});

export const readRecord = Effect.fn('Approval.read')(function* (app: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  return yield* Schema.decodeEffect(RecordJson)(yield* fs.readFileString(path.join(app, RECORD)));
});

const writeRecord = Effect.fn('Approval.write')(function* (app: string, record: Approved) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const json = yield* Schema.encodeEffect(RecordJson)(record);
  yield* fs.writeFileString(path.join(app, RECORD), `${json}\n`);
  return record;
});

export const Why = Schema.Literals(['changed', 'not in the record', 'no file']);
export type Why = typeof Why.Type;

export const Unapproved = Schema.Struct({ still: Schema.String, why: Why });
export type Unapproved = typeof Unapproved.Type;

export const unapproved = Effect.fn('Approval.unapproved')(function* (app: string) {
  const { stills: approved } = yield* readRecord(app);
  const served = yield* hashedStills(app);
  const named = new Set(served.map(([still]) => still));
  const found: Array<Unapproved> = [];
  for (const [still, hash] of served) {
    const known = Object.hasOwn(approved, still);
    if (!known) found.push({ still, why: 'not in the record' });
    if (known && approved[still] !== hash) found.push({ still, why: 'changed' });
  }
  for (const still of Object.keys(approved))
    if (!named.has(still)) found.push({ still, why: 'no file' });
  return found.toSorted((a, b) => a.still.localeCompare(b.still));
});

const listed = (stills: ReadonlyArray<Unapproved>) =>
  stills.map(({ still, why }) => `${still} (${why})`).join(', ');

export class AskUnanswered extends Schema.TaggedError<AskUnanswered>()('AskUnanswered', {
  ask: Schema.String,
}) {
  override get message() {
    return `the owner has not answered ask ${this.ask}'s ${STILLS_QUESTION} question: wait on it (bun cli.ts ask wait ${this.ask}, from apps/animations)`;
  }
}

export class AskNotApproval extends Schema.TaggedError<AskNotApproval>()('AskNotApproval', {
  ask: Schema.String,
  answer: Schema.String,
}) {
  override get message() {
    return `ask ${this.ask}'s ${STILLS_QUESTION} answer is ${this.answer}, not the ${APPROVE} choice: the stills are not approved`;
  }
}

export class RecordNotPending extends Schema.TaggedError<RecordNotPending>()('RecordNotPending', {
  ask: Schema.String,
  approval: Approval,
}) {
  override get message() {
    return `the record is ${this.approval.status} on ask ${this.approval.ask}, not pending on ask ${this.ask}: pin the stills on the ask that shows them (bun run kit:pin --ask <id>)`;
  }
}

export class StillsMoved extends Schema.TaggedError<StillsMoved>()('StillsMoved', {
  ask: Schema.String,
  stills: Schema.Array(Unapproved),
}) {
  override get message() {
    return `the stills are not the ones ask ${this.ask} showed: ${listed(this.stills)}; show the owner these as a new ask and pin them on it`;
  }
}

export class StillsNotShown extends Schema.TaggedError<StillsNotShown>()('StillsNotShown', {
  ask: Schema.String,
  stills: Schema.Array(Schema.String),
}) {
  override get message() {
    return `ask ${this.ask} showed no file with the bytes of ${this.stills.join(', ')}: show the owner each still byte for byte as an image block of a new ask, and pin the stills on it`;
  }
}

export class AskUnreceipted extends Schema.TaggedError<AskUnreceipted>()('AskUnreceipted', {
  ask: Schema.String,
}) {
  override get message() {
    return `the lab's record of ask ${this.ask} holds no receipt of the files its image blocks showed (it was made before the lab kept one): show the owner the stills on a new ask, and pin them on it`;
  }
}

export const Unsound = Schema.Literals([
  'has no saved ask',
  'is not answered approve in its saved ask',
  'shows other files than its saved ask',
  'repeats the current ask',
]);
export type Unsound = typeof Unsound.Type;

export class ApprovalUnsound extends Schema.TaggedError<ApprovalUnsound>()('ApprovalUnsound', {
  ask: Schema.String,
  why: Unsound,
}) {
  override get message() {
    return `the record's approval on ask ${this.ask} ${this.why}: an approval is written by kit:approve from the lab's record, never by hand (bun run kit:pin --ask <id>, then bun run kit:approve --ask <id>)`;
  }
}

export class ShipPending extends Schema.TaggedError<ShipPending>()('ShipPending', {
  ask: Schema.String,
}) {
  override get message() {
    return `the stills are pending on ask ${this.ask}: nothing ships until the owner approves them (bun run kit:approve --ask ${this.ask})`;
  }
}

export const BuiltUnapproved = Schema.Struct({ image: Schema.String, format: Format });
export type BuiltUnapproved = typeof BuiltUnapproved.Type;

export class ShipUnapproved extends Schema.TaggedError<ShipUnapproved>()('ShipUnapproved', {
  images: Schema.Array(BuiltUnapproved),
}) {
  override get message() {
    const images = this.images.map(({ image, format }) => `dist/${image} (${format})`);
    return `the built site would serve images the owner did not approve: ${images.join(', ')}`;
  }
}

export const pin = Effect.fn('Approval.pin')(function* (app: string, ask: string) {
  const lab = yield* LabAsks;
  const read = yield* lab.read(ask);
  const shown = yield* receiptOf(read.record);
  const before = yield* readRecord(app);
  const stills = Object.fromEntries(yield* hashedStills(app));
  const pinned = new Set(Object.values(stills));
  const given = [before.approval].filter(Schema.is(Given));
  const earlier = [...given, ...before.earlier].filter(
    (approval) =>
      approval.ask !== ask && Object.values(approval.shown).some((hash) => pinned.has(hash)),
  );
  yield* saveAsk(app, ask, read, shown);
  return yield* writeRecord(app, { approval: { status: 'pending', ask }, earlier, stills });
});

const receiptOf = (held: LabAsk) =>
  Effect.fromOption(Option.fromUndefinedOr(held.shown)).pipe(
    Effect.mapError(() => AskUnreceipted.make({ ask: held.id })),
  );

export const imagesShown = (ask: LabAsk) => [
  ...new Set(
    ask.answered.flatMap(({ step }) =>
      Option.match(Option.fromUndefinedOr(ask.ask.steps[step]), {
        onNone: () => [],
        onSome: ({ blocks = [] }) =>
          blocks
            .filter(({ kind }) => kind === 'image')
            .flatMap(({ image }) =>
              Option.toArray(
                Option.flatMap(Option.fromUndefinedOr(image), ({ src }) =>
                  Option.fromUndefinedOr(src),
                ),
              ),
            ),
      }),
    ),
  ),
];

export const shownOn = Effect.fn('Approval.shownOn')(function* (held: LabAsk) {
  const receipt = yield* receiptOf(held);
  return Object.fromEntries(
    imagesShown(held).flatMap((src) =>
      Option.toArray(
        Option.map(Option.fromUndefinedOr(receipt[src]), (hash) => [src, hash] as const),
      ),
    ),
  );
});

const sameShown = (a: Readonly<Record<string, string>>, b: Readonly<Record<string, string>>) => {
  const keys = Object.keys(a);
  return (
    keys.length === Object.keys(b).length &&
    keys.every((src) => Object.hasOwn(b, src) && b[src] === a[src])
  );
};

const unsoundOf = Effect.fn('Approval.unsoundOf')(function* (app: string, given: Given) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const { record, shown } = savedAsk(given.ask);
  const saved = yield* Effect.all([
    fs
      .readFileString(path.join(app, record))
      .pipe(Effect.flatMap(Schema.decodeEffect(Schema.fromJsonString(LabAsk)))),
    fs.readFileString(path.join(app, shown)).pipe(Effect.flatMap(Schema.decodeEffect(ShownJson))),
  ]).pipe(Effect.option);
  if (Option.isNone(saved)) return Option.some<Unsound>('has no saved ask');
  const [held, files] = saved.value;
  if (held.id !== given.ask) return Option.some<Unsound>('has no saved ask');
  const answer = held.state.answers[STILLS_QUESTION];
  if (held.state._tag === 'Asking' || answer?.kind !== 'choose' || answer.value !== APPROVE)
    return Option.some<Unsound>('is not answered approve in its saved ask');
  const reached = imagesShown(held);
  const receipted = Option.match(Option.fromUndefinedOr(held.shown), {
    onNone: () => true,
    onSome: (receipt) =>
      sameShown(
        given.shown,
        Object.fromEntries(Object.keys(given.shown).map((src) => [src, receipt[src] ?? ''])),
      ),
  });
  const shows =
    sameShown(given.shown, files) &&
    receipted &&
    Object.keys(given.shown).every((src) => reached.includes(src));
  if (!shows) return Option.some<Unsound>('shows other files than its saved ask');
  return Option.none<Unsound>();
});

export const checkKept = Effect.fn('Approval.checkKept')(function* (
  app: string,
  current: string,
  kept: ReadonlyArray<Given>,
  earlier: ReadonlyArray<Given>,
) {
  const repeated = earlier.find(({ ask }) => ask === current);
  if (Predicate.isNotUndefined(repeated))
    return yield* ApprovalUnsound.make({ ask: repeated.ask, why: 'repeats the current ask' });
  for (const given of [...kept, ...earlier]) {
    const why = yield* unsoundOf(app, given);
    if (Option.isSome(why)) return yield* ApprovalUnsound.make({ ask: given.ask, why: why.value });
  }
});

export const stillsNotShown = (
  stills: Approved['stills'],
  ...shown: ReadonlyArray<Readonly<Record<string, string>>>
) => {
  const hashes = new Set(shown.flatMap((files) => Object.values(files)));
  return Object.keys(stills)
    .filter((still) => !hashes.has(stills[still] ?? ''))
    .toSorted();
};

export const approve = Effect.fn('Approval.approve')(function* (app: string, ask: string) {
  const record = yield* readRecord(app);
  if (record.approval.status !== 'pending' || record.approval.ask !== ask)
    return yield* RecordNotPending.make({ ask, approval: record.approval });
  yield* checkKept(app, ask, [], record.earlier);
  const lab = yield* LabAsks;
  const read = yield* lab.read(ask);
  const held = read.record;
  yield* receiptOf(held);
  if (held.state._tag === 'Asking') return yield* AskUnanswered.make({ ask });
  const answer = yield* Effect.fromOption(
    Option.fromUndefinedOr(held.state.answers[STILLS_QUESTION]),
  ).pipe(Effect.mapError(() => AskUnanswered.make({ ask })));
  if (answer.kind === 'free_text' || answer.kind === 'skipped')
    return yield* AskNotApproval.make({ ask, answer: answer.kind });
  if (answer.value !== APPROVE)
    return yield* AskNotApproval.make({ ask, answer: `the ${answer.value} choice` });
  const step = yield* Effect.fromOption(
    Option.fromUndefinedOr(
      held.answered.find(({ values }) => Object.hasOwn(values, STILLS_QUESTION)),
    ),
  ).pipe(Effect.mapError(() => AskUnanswered.make({ ask })));
  const shown = yield* shownOn(held);
  const notShown = stillsNotShown(
    record.stills,
    shown,
    ...record.earlier.map((approval) => approval.shown),
  );
  if (notShown.length > 0) return yield* StillsNotShown.make({ ask, stills: notShown });
  const moved = yield* unapproved(app);
  if (moved.length > 0) return yield* StillsMoved.make({ ask, stills: moved });
  const answers = Object.fromEntries(
    Object.entries(held.state.answers).filter(([, given]) => given.kind !== 'skipped'),
  );
  const approval = {
    status: 'approved' as const,
    ask,
    lab: lab.url,
    answered: step.at,
    answer: answer.label,
    answers,
    shown,
  };
  const left = new Set(
    stillsNotShown(record.stills, shown).flatMap((still) =>
      Option.toArray(Option.fromUndefinedOr(record.stills[still])),
    ),
  );
  const earlier = record.earlier.filter((given) =>
    Object.values(given.shown).some((hash) => left.has(hash)),
  );
  yield* saveAsk(app, ask, read, shown);
  yield* writeRecord(app, { approval, earlier, stills: record.stills });
  return { approval, earlier, stills: record.stills };
});

export const unapprovedBuilt = Effect.fn('Approval.unapprovedBuilt')(function* (
  app: string,
  dist: string,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const { stills } = yield* readRecord(app);
  const outside = yield* Effect.forEach(OUTSIDE, ({ image }) =>
    Effect.map(fs.readFile(path.join(app, image)), sha256),
  );
  const held = new Set([...Object.values(stills), ...outside]);
  return (yield* builtImages(dist))
    .filter(({ hash }: BuiltImage) => !held.has(hash))
    .map(({ file, format }) => ({ image: file, format }));
});

export const shippable = Effect.fn('Approval.shippable')(function* (app: string) {
  const path = yield* Path.Path;
  const { approval, earlier, stills } = yield* readRecord(app);
  if (approval.status === 'pending') return yield* ShipPending.make({ ask: approval.ask });
  yield* checkKept(app, approval.ask, [approval], earlier);
  const notShown = stillsNotShown(stills, approval.shown, ...earlier.map(({ shown }) => shown));
  if (notShown.length > 0)
    return yield* StillsNotShown.make({ ask: approval.ask, stills: notShown });
  yield* buildSite(app);
  const found = yield* unapprovedBuilt(app, path.join(app, 'dist'));
  if (found.length > 0) return yield* ShipUnapproved.make({ images: found });
  return approval;
});

export const reportAgainstRecord = Effect.fn('Approval.report')(function* (app: string) {
  const found = yield* unapproved(app);
  if (found.length === 0) return yield* Effect.logInfo('kit.stills.approved');
  yield* Effect.forEach(found, ({ still, why }) =>
    Effect.logWarning('kit.stills.unapproved').pipe(Effect.annotateLogs({ still, why })),
  );
  yield* Effect.logWarning('kit.stills.ask').pipe(
    Effect.annotateLogs({
      unapproved: found.length,
      next: 'show the owner each still byte for byte as an image block of a lab ask, then bun run kit:pin --ask <id>, and once he approves bun run kit:approve --ask <id>',
    }),
  );
});
