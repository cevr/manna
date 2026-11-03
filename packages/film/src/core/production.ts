import { Array as Arr, Data, Effect, Option, Order, Result, Schema } from 'effect';
import { DecisionUnknown, Undecided, VersionMoved, WordUnaimed } from './refusals.ts';
import type { ReviewFolder } from './review.ts';
import { maybe } from './schema.ts';

export const ProductionId = Schema.String.check(Schema.isPattern(/^[a-z0-9][a-z0-9-]{0,63}$/));
export type ProductionId = typeof ProductionId.Type;

const orElse = <S extends Schema.Top>(schema: S, fallback: S['Encoded']) =>
  schema.pipe(Schema.withDecodingDefaultKey(Effect.succeed(fallback)));

const At = Schema.Finite.check(Schema.isGreaterThanOrEqualTo(0));

export const VersionNumber = Schema.Int.check(Schema.isGreaterThanOrEqualTo(1));

const VersionOpened = Schema.Struct({
  at: At,
  title: Schema.String,
  because: maybe(Schema.String),
});
type VersionOpened = typeof VersionOpened.Type;

const SaidOn = {
  set: maybe(Schema.String),
  point: maybe(Schema.String),
  variant: maybe(Schema.String),
};

const Picks = Schema.Record(Schema.String, Schema.String);

const SaidAsk = { ask: maybe(Schema.String), picks: maybe(Picks) };

const SaidBy = { by: maybe(Schema.String) };

export const Said = Schema.Union([
  Schema.TaggedStruct('Decided', {
    at: At,
    text: Schema.String,
    quote: maybe(Schema.String),
    ...SaidOn,
    ...SaidAsk,
    ...SaidBy,
  }),
  Schema.TaggedStruct('Noted', {
    at: At,
    text: Schema.String,
    quote: maybe(Schema.String),
    ...SaidOn,
    ...SaidAsk,
    ...SaidBy,
  }),
  Schema.TaggedStruct('Asked', {
    at: At,
    text: Schema.String,
    quote: maybe(Schema.String),
    ...SaidOn,
    ...SaidAsk,
    ...SaidBy,
  }),
]).pipe(Schema.toTaggedUnion('_tag'));
export type Said = typeof Said.Type;

export type OwnerWord = Extract<Said, { readonly _tag: 'Decided' | 'Noted' }>;

const Filed = Schema.Struct({ set: Schema.String, version: VersionNumber });
type Filed = typeof Filed.Type;

export const ProductionFile = Schema.Struct({
  production: ProductionId,
  title: Schema.String,
  film: maybe(Schema.String),
  blurb: maybe(Schema.String),
  versions: Schema.NonEmptyArray(VersionOpened).check(
    Schema.makeFilter(
      (versions) =>
        versions.every((v, i) => i === 0 || v.at >= (versions[i - 1]?.at ?? 0)) ||
        'each version is opened no earlier than the one before it',
    ),
  ),
  said: orElse(Schema.Array(Said), []),
  filed: orElse(Schema.Array(Filed), []),
});
export type ProductionFile = typeof ProductionFile.Type;

export const MoveForward = Schema.Struct({
  after: VersionNumber,
  title: Schema.String.check(Schema.isMinLength(1)),
  because: maybe(Schema.String),
});
export type MoveForward = typeof MoveForward.Type;

export const newProduction = (
  production: ProductionId,
  title: string,
  at: number,
  film: Option.Option<string> = Option.none(),
): ProductionFile => ({
  production,
  title,
  film,
  blurb: Option.none(),
  versions: [{ at, title: 'v1', because: Option.none() }],
  said: [],
  filed: [],
});

export const currentVersion = (file: ProductionFile): number => file.versions.length;

export const moveForward = (
  file: ProductionFile,
  move: MoveForward,
  at: number,
): Result.Result<ProductionFile, VersionMoved> => {
  const current = currentVersion(file);
  if (move.after !== current)
    return Result.fail(
      VersionMoved.make({ production: file.production, after: move.after, current }),
    );
  const last = file.versions[current - 1]?.at ?? 0;
  return Result.succeed({
    ...file,
    versions: [
      ...file.versions,
      { at: Math.max(at, last), title: move.title, because: move.because },
    ],
  });
};

export const withSaid = (file: ProductionFile, said: Said): ProductionFile => ({
  ...file,
  said: Arr.sort(
    [...file.said, said],
    Order.mapInput(Order.Number, (s: Said) => s.at),
  ),
});

export const aimedWord = <W extends Pick<OwnerWord, 'set' | 'point' | 'variant'>>(
  word: W,
): Result.Result<W, WordUnaimed> => {
  if (Option.isSome(word.point) && Option.isNone(word.set))
    return Result.fail(WordUnaimed.make({ names: 'point' }));
  if (Option.isSome(word.variant) && Option.isNone(word.point))
    return Result.fail(WordUnaimed.make({ names: 'variant' }));
  return Result.succeed(word);
};

const ASK_NAMED = /\(ask (a[0-9a-f]{10})\)/;

const askNamed = (said: Said): Option.Option<string> =>
  Option.orElse(said.ask, () =>
    Option.flatMap(
      Option.liftPredicate(said, (s) => s._tag === 'Asked'),
      (s) => Option.fromNullishOr(ASK_NAMED.exec(s.text)?.[1]),
    ),
  );

export const withAskSaid = (file: ProductionFile, said: Said): ProductionFile => {
  const isQuestion = (s: Said) => s._tag === 'Asked';
  const filed = Option.exists(said.ask, (id) =>
    file.said.some((s) => Option.contains(askNamed(s), id) && isQuestion(s) === isQuestion(said)),
  );
  if (filed) return file;
  return withSaid(file, said);
};

export const withFiled = (file: ProductionFile, filed: Filed): ProductionFile => ({
  ...file,
  filed: [...file.filed.filter((f) => f.set !== filed.set), filed],
});

export const setPathOf = (ref: string): string => ref.split('/').slice(1).join('/');

interface NamedSet {
  readonly ref: string;
  readonly folder: string;
}

interface FolderInRoots {
  readonly folder: string;
  readonly refs: ReadonlyArray<string>;
}

export const setNamed = (
  listed: ReadonlyArray<string>,
  given: string,
): Result.Result<Option.Option<NamedSet>, FolderInRoots> => {
  const holding = (folder: string) => listed.filter((ref) => setPathOf(ref) === folder);
  const folder = Option.getOrElse(
    Option.map(
      Option.liftPredicate(given, (g) => holding(g).length === 0 && listed.includes(g)),
      setPathOf,
    ),
    () => given,
  );
  const refs = holding(folder);
  if (refs.length > 1) return Result.fail({ folder, refs });
  return Result.succeed(Option.map(Arr.head(refs), (ref) => ({ ref, folder })));
};

type Entry = Data.TaggedEnum<{
  Published: { readonly at: number; readonly folder: ReviewFolder };
  Missing: { readonly at: number; readonly set: string };
  Said: { readonly at: number; readonly said: Said };
}>;
const Entry = Data.taggedEnum<Entry>();

export const versionAt = (file: ProductionFile, at: number): number =>
  Math.max(1, file.versions.findLastIndex((v) => v.at <= at) + 1);

export type Decided = Extract<Said, { readonly _tag: 'Decided' }>;

export const decisionsOf = (file: ProductionFile): ReadonlyArray<Decided> =>
  file.said.filter((s): s is Decided => s._tag === 'Decided');

export const decisionsIn = (file: ProductionFile, version: number): ReadonlyArray<Decided> =>
  decisionsOf(file)
    .filter((d) => versionAt(file, d.at) === version)
    .toReversed();

export const forwardOnDecision = (
  file: ProductionFile,
  move: { readonly after: number; readonly title: string; readonly decision: number },
): Result.Result<MoveForward, VersionMoved | Undecided | DecisionUnknown> => {
  const current = currentVersion(file);
  if (move.after !== current)
    return Result.fail(
      VersionMoved.make({ production: file.production, after: move.after, current }),
    );
  const decisions = decisionsIn(file, current);
  if (!Arr.isReadonlyArrayNonEmpty(decisions))
    return Result.fail(Undecided.make({ production: file.production, version: current }));
  return Option.match(
    Arr.findFirst(decisions, (d) => d.at === move.decision),
    {
      onNone: () =>
        Result.fail(
          DecisionUnknown.make({
            production: file.production,
            version: current,
            at: move.decision,
            held: decisions.map((d) => ({ at: d.at, text: d.text })),
          }),
        ),
      onSome: (decided) =>
        Result.succeed({
          after: move.after,
          title: move.title,
          because: Option.some(decided.text),
        }),
    },
  );
};

const decides = (said: Said, path: string, point: Option.Option<string>): boolean =>
  said._tag === 'Decided' &&
  Option.isNone(said.ask) &&
  Option.contains(said.set, path) &&
  Option.match(said.point, {
    onNone: () => true,
    onSome: (p) => Option.match(point, { onNone: () => false, onSome: (q) => q === p }),
  });

export const decidedSince = (
  said: ReadonlyArray<Said>,
  ref: string,
  point: Option.Option<string>,
  since: number,
): boolean => said.some((s) => s.at >= since && decides(s, setPathOf(ref), point));

type ChoiceState = Data.TaggedEnum<{
  Picked: { readonly variants: ReadonlyArray<string> };
  Decided: { readonly variant: Option.Option<string> };
  Waiting: {};
  Quiet: {};
}>;
const ChoiceState = Data.taggedEnum<ChoiceState>();
