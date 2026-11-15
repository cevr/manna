/**
 * Today's data sources, as `app.ts` registers them: one per input of
 * `step`, each answering the screen after it. The state lives here, one
 * per launch of the data module; `todayBoot` reads the kept result once
 * and answers the screen, and `todayNext` keeps the result it handed on,
 * the one write. Time is never read: a try's start and Show all's instant
 * are the call's arguments, and the zone's offset at the start is the
 * current Heartseed's `offsetAt` of it. Storage is only waited on, never
 * chained into logic of its own, so a storage that answers at once runs
 * every rule inside the call.
 */

import { offsetAt } from '@manna/heartseed/day';
import { Option, Schema } from 'effect';

import {
  handedBy,
  initial,
  step,
  type Cue,
  type Outcome,
  type Passage,
  type TodayInput,
  type TodayResult,
  type TodayState,
} from './step';
import { resultWire, view, type TodayView } from './view';

/** Where the last result is kept: the stand-in store a later unit's garden replaces. */
export const RECALL_FILE = 'app:/data/today.json';

/** The part of Exact's `Storage` Today uses. */
interface TodayStorage {
  readonly fs: {
    readonly readFile: (path: string) => PromiseLike<ArrayBuffer>;
    readonly atomicWriteFile: (path: string, bytes: Uint8Array) => PromiseLike<unknown>;
  };
}

const Whole = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0));
const Graded = Schema.Literals([1, 2, 3, 4]);

/** The kept file: a result as `resultWire` writes it. */
const Kept = Schema.fromJsonString(
  Schema.Struct({
    reference: Schema.String,
    recall: Schema.Struct({
      reference: Schema.String,
      startedAt: Schema.Finite,
      offset: Schema.Int,
      grade: Graded,
      suggested: Schema.Literals([1, 2, 3]),
      words: Whole,
      missed: Whole,
      peeked: Whole,
      extra: Whole,
    }),
    help: Schema.NullOr(
      Schema.Struct({
        reference: Schema.String,
        peeked: Schema.Array(Whole),
        shownAt: Schema.NullOr(Schema.Finite),
        cap: Graded,
      }),
    ),
  }),
);

/** A kept file's text as a result: none for any text `resultWire` did not write. */
const decodeKept = (text: string): Option.Option<TodayResult> =>
  Option.map(Schema.decodeOption(Kept)(text), (kept) => ({
    reference: kept.reference,
    recall: kept.recall,
    help: Option.fromNullishOr(kept.help),
  }));

/** JSON text as ASCII bytes, each UTF-16 unit past ASCII escaped as JSON escapes it, and bytes back as text. */
const bytesOf = (json: string) =>
  Uint8Array.from(
    // oxlint-disable-next-line eslint/require-unicode-regexp -- each UTF-16 unit is escaped alone, a surrogate pair as two escapes, as JSON writes it.
    json.replace(
      /[^\x20-\x7e]/g,
      (unit) => `\\u${unit.charCodeAt(0).toString(16).padStart(4, '0')}`,
    ),
    (char) => char.charCodeAt(0),
  );
const textOf = (bytes: ArrayBuffer) => String.fromCharCode(...new Uint8Array(bytes));

/** `started`'s outcome as `ok` or `bad` makes it, run as soon as it settles. */
const settle = <A, B>(started: PromiseLike<A>, ok: (value: A) => B, bad: () => B) =>
  // oxlint-disable-next-line effect/noNewPromise -- Exact's data module answers a Promise; the storage call is Exact's own PromiseLike.
  new Promise<B>((resolve) => {
    started.then(
      (value) => resolve(ok(value)),
      () => resolve(bad()),
    );
  });

/** The voice's ending as `step` reads it: anything but a spoken end is an error. */
const outcomeOf = (text: string): Outcome => {
  if (text === 'end') return 'end';
  return 'error';
};

/** The zone's offset at a try's start, `offsetAt`'s; 0 for an instant that is no time. */
const zoneAt = (at: number) => {
  if (!Number.isFinite(at)) return 0;
  return offsetAt(at);
};

/** A cue as the screen names it; none for any other name. */
const cueOf = (text: string): Option.Option<Cue> => {
  if (text === 'none' || text === 'initials' || text === 'full') return Option.some(text);
  return Option.none();
};

/** Exact's `Store` argument, as much of it as names it: Today keeps nothing there. */
interface ExactStore {
  readonly forget: (name: string) => void;
}

type Args<A extends readonly unknown[]> = (
  args: A,
  store: ExactStore,
  storage: TodayStorage,
) => TodayView | Promise<TodayView>;

/** Today's sources over `passage`, with the state of one launch. */
export const todaySources = (passage: Passage) => {
  let state: TodayState = initial(passage);
  let booted = false;
  const apply = (input: TodayInput) => {
    state = step(state, input);
    return view(state);
  };
  const todayBoot: Args<readonly []> = (_args, _store, storage) => {
    if (booted) return view(state);
    booted = true;
    return settle(
      storage.fs.readFile(RECALL_FILE),
      (bytes) => apply({ _tag: 'loaded', last: decodeKept(textOf(bytes)) }),
      () => apply({ _tag: 'loaded', last: Option.none() }),
    );
  };
  const todayNext: Args<readonly []> = (_args, _store, storage) => {
    const before = state;
    const input: TodayInput = { _tag: 'next' };
    const shown = apply(input);
    const kept = Option.flatMap(handedBy(before, input, state), (result) =>
      Schema.encodeOption(Kept)(resultWire(result)),
    );
    return Option.match(kept, {
      onNone: () => shown,
      onSome: (json) =>
        settle(
          storage.fs.atomicWriteFile(RECALL_FILE, bytesOf(json)),
          () => shown,
          () => shown,
        ),
    });
  };
  return {
    todayBoot,
    todayHear: (([utterance]) => apply({ _tag: 'hear', utterance })) satisfies Args<
      readonly [string]
    >,
    todayVoice: (([utterance, charIndex, charLength]) =>
      apply({ _tag: 'voice', utterance, charIndex, charLength })) satisfies Args<
      readonly [string, number, number]
    >,
    todayVoiceEnded: (([utterance, outcome]) =>
      apply({ _tag: 'voiceEnded', utterance, outcome: outcomeOf(outcome) })) satisfies Args<
      readonly [string, string]
    >,
    todayStop: (() => apply({ _tag: 'stop' })) satisfies Args<readonly []>,
    todaySay: (([recognition, at]) =>
      apply({ _tag: 'say', recognition, at, offset: zoneAt(at) })) satisfies Args<
      readonly [string, number]
    >,
    todayHeard: (([recognition, transcript, final]) =>
      apply({ _tag: 'heard', recognition, transcript, final })) satisfies Args<
      readonly [string, string, boolean]
    >,
    todayFinish: (() => apply({ _tag: 'finish' })) satisfies Args<readonly []>,
    todayDenied: (() => apply({ _tag: 'denied' })) satisfies Args<readonly []>,
    todayCue: (([cue]) =>
      Option.match(cueOf(cue), {
        onNone: () => view(state),
        onSome: (shown) => apply({ _tag: 'cue', cue: shown, cap: state.shownAllCap }),
      })) satisfies Args<readonly [string]>,
    todayPeek: (([index]) => apply({ _tag: 'peek', index })) satisfies Args<readonly [number]>,
    todayPeekEnded: (([index]) => apply({ _tag: 'peekEnded', index })) satisfies Args<
      readonly [number]
    >,
    todayShowAll: (([at]) => apply({ _tag: 'showAll', at })) satisfies Args<readonly [number]>,
    todayGrade: (([grade]) => apply({ _tag: 'grade', grade })) satisfies Args<readonly [number]>,
    todayNext,
    todayAgain: (() => apply({ _tag: 'again' })) satisfies Args<readonly []>,
  };
};
