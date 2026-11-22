/* oxlint-disable effect/noAsyncFunction -- Exact's data module answers a Promise: a press of Move back awaits the garden's step back. */

/**
 * Move back a stage on Today, as `features/back.contract` draws it: the
 * state of Today's control, the current Heartseed's own (`barAfter` of
 * `@manna/heartseed/garden/bar`), kept for the launch, and the step back
 * each ask runs. The control lives while Today offers it on one verse
 * (`todayBackSeen`): when Today stops offering it, or offers it on another
 * verse, its state is dropped, as the current footer drops `MoveBack`. Each
 * tap of the control (`todayBackOpen`) makes a new ask, its own object
 * with its own number; the ask's `Move back` (`todayBackMove`) runs the
 * garden's step back from the stage the ask was opened at once for that
 * ask, however often it is pressed, and every press is given the first
 * answer; the answer lands (`todayBackAnswered`) only for the latest ask.
 */

import { backOf, type BackAnswer, type BackAsk, type Stage } from '@manna/heartseed/garden';
import {
  alertLine,
  askLine,
  barAfter,
  IDLE,
  movedLine,
  NAMED,
  type Bar,
  type Happened,
} from '@manna/heartseed/garden/bar';
import type { FileStorage } from '@manna/exact-kit/storage';
import { Option } from 'effect';

/** What Today's control draws: the verse it stands on, whether a stage lies below it, its state, the number of its ask, and its words (each '' when not shown). */
export interface BackView {
  reference: string;
  offers: boolean;
  status: string;
  ask: number;
  askLine: string;
  moved: string;
  alert: string;
}

/** The step back's answer to one press, by the number of its ask. */
export interface BackMoved {
  ask: number;
  answer: string;
}

/** Exact's `Store` argument, as much of it as names it: the control keeps nothing there. */
interface ExactStore {
  readonly forget: (name: string) => void;
}

/** The garden's source the step back runs through, one at a time behind every garden call before it. */
export interface BackGarden {
  readonly gardenBackFrom: (
    args: readonly [string, string, number, number, number],
    store: ExactStore,
    storage: FileStorage,
  ) => Promise<{ answer: string }>;
}

/** The stage Contract's `text` names; none for any other text. */
const stageOf = (text: string): Option.Option<Stage> =>
  Option.liftPredicate(text, (each): each is Stage => Object.hasOwn(NAMED, each));

/** The answer as the bar takes it: anything but `Moved` failed. */
const answerOf = (text: string): BackAnswer => {
  if (text === 'Moved') return 'Moved';
  return 'Failed';
};

/** The ask's words while `bar` asks, for a verse whose step back lands at `landing`. */
const askLineOf = (bar: Bar, reference: string, landing: Option.Option<Stage>) => {
  if (bar.status !== 'Asking') return '';
  return Option.match(landing, {
    onNone: () => '',
    onSome: (to) => askLine(reference, to),
  });
};

const movedOf = (bar: Bar) => {
  if (bar.status !== 'Moved') return '';
  return movedLine(bar.stage);
};

const alertOf = (bar: Bar, reference: string) => {
  if (bar.status !== 'Refused') return '';
  return alertLine(reference);
};

const askOf = (bar: Bar, numberOf: (ask: BackAsk) => number) => {
  if (bar.status === 'Idle') return 0;
  return numberOf(bar.ask);
};

/** What `bar` draws on the verse at `reference`, standing at `stage`, its ask numbered by `numberOf`. */
export const backView = (
  bar: Bar,
  reference: string,
  stage: string,
  numberOf: (ask: BackAsk) => number,
): BackView => {
  const landing = Option.flatMap(stageOf(stage), backOf);
  return {
    reference,
    offers: Option.isSome(landing),
    status: bar.status,
    ask: askOf(bar, numberOf),
    askLine: askLineOf(bar, reference, landing),
    moved: movedOf(bar),
    alert: alertOf(bar, reference),
  };
};

/** Today's Move back sources over the garden's `garden`, the control's state living the launch. */
export const backSources = (garden: BackGarden) => {
  let bar: Bar = IDLE;
  let reference = '';
  let stage = '';
  let made = 0;
  const numbers = new WeakMap<BackAsk, number>();
  const asks = new Map<number, BackAsk>();
  const settled = new Map<number, Promise<BackMoved>>();

  const numberOf = (ask: BackAsk) =>
    Option.getOrElse(Option.fromUndefinedOr(numbers.get(ask)), () => 0);
  const shown = (): BackView => backView(bar, reference, stage, numberOf);
  const happen = (happened: Happened) => {
    bar = barAfter(bar, happened);
    return shown();
  };

  /** The garden's step back for `ask`, numbered `number`, and its answer. */
  const stepBack = async (
    number: number,
    ask: BackAsk,
    call: readonly [number, number, number],
    store: ExactStore,
    storage: FileStorage,
  ): Promise<BackMoved> => {
    const [now, offset, seed] = call;
    const { answer } = await garden
      .gardenBackFrom([ask.reference, ask.from, now, offset, seed], store, storage)
      .catch(() => ({ answer: 'Failed' }));
    return { ask: number, answer: answerOf(answer) };
  };

  /** The answer to a press of an ask this launch never opened. */
  const unknown = async (number: number): Promise<BackMoved> => ({ ask: number, answer: 'Failed' });

  return {
    todayBackBoot: (): BackView => shown(),
    todayBackSeen: ([at, standing, offered]: readonly [string, string, boolean]): BackView => {
      if (!offered || at !== reference) bar = IDLE;
      reference = '';
      if (offered) reference = at;
      stage = standing;
      return shown();
    },
    todayBackOpen: ([at, standing]: readonly [string, string]): BackView =>
      Option.match(
        Option.filter(stageOf(standing), (from) => at === reference && Option.isSome(backOf(from))),
        {
          onNone: () => shown(),
          onSome: (from) => {
            made += 1;
            const ask: BackAsk = { reference: at, from };
            numbers.set(ask, made);
            asks.set(made, ask);
            stage = standing;
            return happen({ type: 'opened', ask });
          },
        },
      ),
    todayBackKeep: (): BackView => happen({ type: 'kept' }),
    todayBackMove: (
      [number, now, offset, seed]: readonly [number, number, number, number],
      store: ExactStore,
      storage: FileStorage,
    ): Promise<BackMoved> =>
      Option.match(Option.fromUndefinedOr(settled.get(number)), {
        onSome: (first) => first,
        onNone: () =>
          Option.match(Option.fromUndefinedOr(asks.get(number)), {
            onNone: () => unknown(number),
            onSome: (ask) => {
              const first = stepBack(number, ask, [now, offset, seed], store, storage);
              settled.set(number, first);
              return first;
            },
          }),
      }),
    todayBackAnswered: ([number, answer]: readonly [number, string]): BackView =>
      Option.match(Option.fromUndefinedOr(asks.get(number)), {
        onNone: () => shown(),
        onSome: (ask) => happen({ type: 'answered', ask, answer: answerOf(answer) }),
      }),
  };
};
