/**
 * Today's data sources, as `app.ts` registers them: one per input of
 * `step`, each answering the screen after it. The state lives here, one
 * per launch of the data module; `todayBoot` reads the kept recall once
 * and answers the screen, and `todayFinish` keeps the recall it made. Time
 * and randomness are never read: every input is the call's arguments.
 * Storage is only waited on, never chained into logic of its own, so a
 * storage that answers at once runs every rule inside the call.
 */

import {
  initial,
  none,
  some,
  step,
  type Maybe,
  type Outcome,
  type Passage,
  type Recall,
  type TodayInput,
  type TodayState,
} from './step';
import { view, type TodayView } from './view';

/** Where the last recall is kept: the stand-in store a later unit's garden replaces. */
export const RECALL_FILE = 'app:/data/today.json';

/** The part of Exact's `Storage` Today uses. */
interface TodayStorage {
  readonly fs: {
    readonly readFile: (path: string) => PromiseLike<ArrayBuffer>;
    readonly atomicWriteFile: (path: string, bytes: Uint8Array) => PromiseLike<unknown>;
  };
}

const RECALL = /^\{"right":(\d{1,6}),"total":(\d{1,6})\}$/u;

/** A recall as the text kept, plain JSON. */
const encodeRecall = (recall: Recall): string =>
  `{"right":${recall.right},"total":${recall.total}}`;

/** A kept recall's text as a recall: none for any text `encodeRecall` did not write. */
const decodeRecall = (text: string): Maybe<Recall> => {
  const [right, total] = text
    .replace(/[^\d,]/gu, '')
    .split(',')
    .map(Number);
  const recall = { right: Number(right), total: Number(total) };
  if (!RECALL.test(text) || recall.right > recall.total) return none;
  return some(recall);
};

/** ASCII text as bytes and back, the kept recall's alphabet. */
const bytesOf = (text: string) => Uint8Array.from(text, (char) => char.charCodeAt(0));
const textOf = (bytes: ArrayBuffer) => String.fromCharCode(...new Uint8Array(bytes));

/** `started`'s outcome as `ok` or `bad` makes it, run as soon as it settles. */
const settle = <A, B>(started: PromiseLike<A>, ok: (value: A) => B, bad: () => B) =>
  // oxlint-disable-next-line effect/noNewPromise -- Exact's data module answers a Promise and cannot import effect (docs/exact.md).
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
      (bytes) => apply({ _tag: 'loaded', recall: decodeRecall(textOf(bytes)) }),
      () => apply({ _tag: 'loaded', recall: none }),
    );
  };
  const todayFinish: Args<readonly []> = (_args, _store, storage) => {
    const before = state.phase;
    const shown = apply({ _tag: 'finish' });
    if (before !== 'listening' || state.last._tag === 'None') return shown;
    return settle(
      storage.fs.atomicWriteFile(RECALL_FILE, bytesOf(encodeRecall(state.last.value))),
      () => shown,
      () => shown,
    );
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
    todaySay: (([recognition]) => apply({ _tag: 'say', recognition })) satisfies Args<
      readonly [string]
    >,
    todayHeard: (([recognition, transcript, final]) =>
      apply({ _tag: 'heard', recognition, transcript, final })) satisfies Args<
      readonly [string, string, boolean]
    >,
    todayFinish,
    todayDenied: (() => apply({ _tag: 'denied' })) satisfies Args<readonly []>,
  };
};
