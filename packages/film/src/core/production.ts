// A production: something the studio moves forward version by version (a
// film, or a development track such as the look), and its history as the
// lab's front door shows it. Kitsu calls the same thing a production; its
// numbered versions are what the owner moves forward ("once we move forward
// we increment versions").
//
// Most of a production's history is derived, never kept twice:
//
// - its sets: a review set names its production in its own `review.json`
//   (`production`, and `published`, the time `film publish` wrote it; an
//   older set is filed by the ledger instead, `filed`), and lands in the
//   version open when it was published (or the one it names, `version`);
// - its choices: each set's comparison sets, and whether the owner approved
//   a variant (the folder's catalogue, as the review index reads it);
// - what waits on the owner: each question an agent asked of them about a
//   set (`Asked`) that no pick in its choice and no later decision on it
//   has answered; it waits on the current version, whenever it was asked.
//
// The ledger (`ProductionFile`, kept by `tools/production-store.ts`) holds
// only what nothing else records: the versions (each opened at a time,
// with what it is for and the decision that moved the production into it),
// the owner's decisions and notes given outside the lab (in words, to an
// agent) and the questions asked of them, and the filing of sets published before sets named their
// production. A version's number is its place in the ledger, so a gap or a
// repeat cannot be written. Pure: the lab's page and its tools share it.

import { Array as Arr, Data, Effect, Option, Order, Result, Schema } from 'effect';
import { DecisionUnknown, Undecided, VersionMoved, WordUnaimed } from './refusals.ts';
import type { ReviewFolder } from './review.ts';
import { maybe } from './schema.ts';

/** A production's name: lower case, digits and `-`, as its URL and its ledger's file carry it. */
export const ProductionId = Schema.String.check(Schema.isPattern(/^[a-z0-9][a-z0-9-]{0,63}$/));
export type ProductionId = typeof ProductionId.Type;

/** A key a JSON file may leave out, read as `fallback` when it does. */
const orElse = <S extends Schema.Top>(schema: S, fallback: S['Encoded']) =>
  schema.pipe(Schema.withDecodingDefaultKey(Effect.succeed(fallback)));

/** ms since the epoch. */
const At = Schema.Finite.check(Schema.isGreaterThanOrEqualTo(0));

/** A version's number: 1 for the first. */
export const VersionNumber = Schema.Int.check(Schema.isGreaterThanOrEqualTo(1));

/**
 * A version as it was opened: when, what it is for (`title`, its name on the
 * timeline), and why the production moved into it (`because`: the decision
 * that closed the version before; none for the first).
 */
const VersionOpened = Schema.Struct({
  at: At,
  title: Schema.String,
  because: maybe(Schema.String),
});
type VersionOpened = typeof VersionOpened.Type;

/** What a word of the owner's is about: a set (its path under its root), one of its choices, one variant. */
const SaidOn = {
  set: maybe(Schema.String),
  point: maybe(Schema.String),
  variant: maybe(Schema.String),
};

/**
 * The owner's picks on a lab ask: each question he answered by a choice, by
 * its name, and the value of the option he chose.
 */
const Picks = Schema.Record(Schema.String, Schema.String);

/**
 * The lab ask a word files (`ask`, in the lab's asks): its question, or its
 * answer or withdrawal; and with its answer, the owner's picks on it
 * (`picks`; none on a question, a withdrawal or a word from chat). An
 * answer's decision that carries none backs no pick, whatever its line says.
 */
const SaidAsk = { ask: maybe(Schema.String), picks: maybe(Picks) };

/** Who filed the word: the agent that heard it (`by`), or the ask's asker; none for a word that does not say. */
const SaidBy = { by: maybe(Schema.String) };

/**
 * The owner's word given outside the lab, as an agent recorded it: a
 * decision (a pick, a direction) or a note (feedback), and the question an
 * agent asks the owner about a set (`Asked`: it waits on the owner until a
 * decision on that set, or a pick in that choice, answers it). `quote` is
 * the owner's own words, verbatim; `text` says it plainly; `by` names who
 * filed it. A word an ask files names it (`ask`): that ask's answer answers
 * its question and no other, and withdrawing the ask (a note naming it)
 * closes its question.
 */
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

/** The owner's word as an agent records it from chat: a decision or a note. A question is a lab ask's, filed by the ask. */
export type OwnerWord = Extract<Said, { readonly _tag: 'Decided' | 'Noted' }>;

/** A set published before sets named their production, filed in a version by hand. */
const Filed = Schema.Struct({ set: Schema.String, version: VersionNumber });
type Filed = typeof Filed.Type;

/**
 * A production's ledger: its name and title, the film it makes (none for a
 * track such as the look), a line on what it is, its versions (oldest
 * first, at least one, each opened no earlier than the one before), the
 * owner's words, and the sets it files by hand.
 */
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

/** A move forward from version `after` (`forward`). */
export const MoveForward = Schema.Struct({
  /** The version the mover saw as current: refused when the production has moved since. */
  after: VersionNumber,
  title: Schema.String.check(Schema.isMinLength(1)),
  because: maybe(Schema.String),
});
export type MoveForward = typeof MoveForward.Type;

/** A production's first ledger: one version, opened at `at`. */
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

/** The production's current version's number: its last. */
export const currentVersion = (file: ProductionFile): number => file.versions.length;

/**
 * The production moved forward: a new version opened at `at`, after the one
 * the mover saw (`VersionMoved` when it has moved since).
 */
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

/** The owner's word recorded (`film lab decide|note`). */
export const withSaid = (file: ProductionFile, said: Said): ProductionFile => ({
  ...file,
  said: Arr.sort(
    [...file.said, said],
    Order.mapInput(Order.Number, (s: Said) => s.at),
  ),
});

/**
 * A word aimed where it says: a choice (`point`) is one in a set, so it
 * names the `set`; a variant is one of a choice's, so it names the `point`.
 * The rule every caller of the store's `say` gets (the MCP's `decide|note`,
 * `film lab decide|note`), and every ask the asks' store makes.
 */
export const aimedWord = <W extends Pick<OwnerWord, 'set' | 'point' | 'variant'>>(
  word: W,
): Result.Result<W, WordUnaimed> => {
  if (Option.isSome(word.point) && Option.isNone(word.set))
    return Result.fail(WordUnaimed.make({ names: 'point' }));
  if (Option.isSome(word.variant) && Option.isNone(word.point))
    return Result.fail(WordUnaimed.make({ names: 'variant' }));
  return Result.succeed(word);
};

/** An ask's id as the lab writes it into a word's text: `(ask <its id>)`. */
const ASK_NAMED = /\(ask (a[0-9a-f]{10})\)/;

/**
 * The ask a word files: its `ask`, or for a question filed before words named
 * their ask, the id its text names (the lab wrote `(ask a…)` into it).
 */
const askNamed = (said: Said): Option.Option<string> =>
  Option.orElse(said.ask, () =>
    Option.flatMap(
      Option.liftPredicate(said, (s) => s._tag === 'Asked'),
      (s) => Option.fromNullishOr(ASK_NAMED.exec(s.text)?.[1]),
    ),
  );

/**
 * `said`, filed by an ask (`said.ask`), unless the timeline holds that ask's
 * word of its kind already (its question, or what closed it): an ask's
 * filing tried again, or by two closes at once, files it once.
 */
export const withAskSaid = (file: ProductionFile, said: Said): ProductionFile => {
  const isQuestion = (s: Said) => s._tag === 'Asked';
  const filed = Option.exists(said.ask, (id) =>
    file.said.some((s) => Option.contains(askNamed(s), id) && isQuestion(s) === isQuestion(said)),
  );
  if (filed) return file;
  return withSaid(file, said);
};

/** A set filed in version `version` by hand (a later filing of the same set replaces it). */
export const withFiled = (file: ProductionFile, filed: Filed): ProductionFile => ({
  ...file,
  filed: [...file.filed.filter((f) => f.set !== filed.set), filed],
});

// ---------------------------------------------------------------------------
// The history, derived

/** A folder's path under its root: its ref without the root's label. */
export const setPathOf = (ref: string): string => ref.split('/').slice(1).join('/');

/** A set the lab lists, named for a timeline: the lab's ref, and the folder the ledger names it by. */
interface NamedSet {
  readonly ref: string;
  readonly folder: string;
}

/** A folder more than one root holds, with each ref that holds it. */
interface FolderInRoots {
  readonly folder: string;
  readonly refs: ReadonlyArray<string>;
}

/**
 * The set `given` names among the refs the lab lists: by its folder under
 * its root, as the ledger names a set, or else by its ref; none when it names
 * no listed set. A folder more than one root holds is refused, since a
 * timeline names a set by its folder alone and could not tell which.
 */
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
  /** A set published into the version. */
  Published: { readonly at: number; readonly folder: ReviewFolder };
  /** A set the ledger files that no root holds now (moved, trashed, on another machine). */
  Missing: { readonly at: number; readonly set: string };
  /** The owner's decision or note. */
  Said: { readonly at: number; readonly said: Said };
}>;
const Entry = Data.taggedEnum<Entry>();

/** The version (1-based) open at `at`: the last opened at or before it, else the first. */
export const versionAt = (file: ProductionFile, at: number): number =>
  Math.max(1, file.versions.findLastIndex((v) => v.at <= at) + 1);

/** A decision of the owner's, as the ledger keeps it. */
export type Decided = Extract<Said, { readonly _tag: 'Decided' }>;

/**
 * The owner's decisions on `file`'s ledger, in its order (oldest first), in
 * chat or by an ask he answered: each with when it was filed (`at`), what it
 * is on (`set`, `point`), his words (`quote`) and, filed by an ask's answer,
 * the ask and his picks there. What an override cites (`style/override.ts`):
 * a question (`Asked`) is an agent's, and a note decides nothing.
 */
export const decisionsOf = (file: ProductionFile): ReadonlyArray<Decided> =>
  file.said.filter((s): s is Decided => s._tag === 'Decided');

/** The owner's decisions filed in version `version` (in chat, or an ask's answer), newest first. */
export const decisionsIn = (file: ProductionFile, version: number): ReadonlyArray<Decided> =>
  decisionsOf(file)
    .filter((d) => versionAt(file, d.at) === version)
    .toReversed();

/**
 * The move an agent makes on the owner's word: from version `after`, because
 * of the decision filed at `decision` in the version open now. Refused as
 * `moveForward` refuses when the production moved on (`VersionMoved`), when
 * that version holds no decision of his (`Undecided`), and when none of its
 * decisions was filed at `decision` (`DecisionUnknown`, naming those it holds).
 */
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

/**
 * Whether `said` is a decision on the set at `path` that covers `point` (one
 * on the set alone covers all its choices). An ask's answer is not: it
 * answers its own question, not the set.
 */
const decides = (said: Said, path: string, point: Option.Option<string>): boolean =>
  said._tag === 'Decided' &&
  Option.isNone(said.ask) &&
  Option.contains(said.set, path) &&
  Option.match(said.point, {
    onNone: () => true,
    onSome: (p) => Option.match(point, { onNone: () => false, onSome: (q) => q === p }),
  });

/**
 * Whether a decision on the set `ref` (a set's ref, `<root>/<folder>`, as an
 * ask names it) covering `point` was filed at or after `since`: what answers
 * a question about that choice, as `waitingIn` reads it.
 */
export const decidedSince = (
  said: ReadonlyArray<Said>,
  ref: string,
  point: Option.Option<string>,
  since: number,
): boolean => said.some((s) => s.at >= since && decides(s, setPathOf(ref), point));

/** A choice's state on the timeline: picked, decided, asked and open, or none of these. */
type ChoiceState = Data.TaggedEnum<{
  Picked: { readonly variants: ReadonlyArray<string> };
  Decided: { readonly variant: Option.Option<string> };
  Waiting: {};
  Quiet: {};
}>;
const ChoiceState = Data.taggedEnum<ChoiceState>();
