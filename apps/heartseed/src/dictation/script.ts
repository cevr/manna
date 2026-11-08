/**
 * The scripted word source: a recital as a recognizer would report it,
 * played with no microphone. `recite` writes the script; `scriptedSource`
 * plays it in TypeScript on Effect's clock, for tests. The native module's
 * `replay` plays the same script by the same rules on the simulator
 * (`source.ios.ts`, `replaySource`).
 */

import { Effect, Fiber, Layer, MutableRef, Option } from 'effect';

import { DictationSource } from '../dictation';
import { hearingsOf, modernOf } from '../matcher/hearings';
import { sourceWords, wordKey } from '../matcher/words';
import { CHAIN, type DictationEvent } from './attempt';
import type { DictationRun } from './words';

/** One scripted result, `at` milliseconds after the listen. */
export interface DictationStep {
  readonly at: number;
  readonly final: boolean;
  readonly runs: readonly DictationRun[];
}

/** How a recital says an archaic word: as a recognizer writes its sound (its first hearing), or modernized (its first modern form). */
export type Saying = 'hearing' | 'modern';

/**
 * Which source words a recital leaves out (by index), how many words a
 * final takes, the milliseconds each word takes, and how it says an
 * archaic word, when not as written.
 */
export interface RecitePlan {
  readonly skip?: readonly number[];
  readonly every?: number;
  readonly pace?: number;
  readonly say?: Saying;
}

const WRITTEN = (): readonly string[] => [];

const SAYINGS: Readonly<Record<Saying | 'written', (key: string) => readonly string[]>> = {
  hearing: hearingsOf,
  modern: modernOf,
  written: WRITTEN,
};

/** A source word as the plan says it: its first hearing or modern form, else as written. */
const sayingOf =
  (say: Saying | 'written') =>
  (text: string): string =>
    SAYINGS[say](wordKey(text))[0] ?? text;

/**
 * A recital of `verse` as a recognizer reports it: its source words but
 * the skipped, spoken word n from n·pace to n·pace + pace/2. After each
 * word a tentative result holds the tail so far; when the tail reaches
 * `every` words, or at the last word, a final result holds it and the tail
 * empties. With `say`, a word with a first hearing (or modern form) is
 * said as that phrase in its own slot, a two-word phrase as one run.
 */
export const recite = (verse: string, plan: RecitePlan = {}): readonly DictationStep[] => {
  const skip = new Set(plan.skip ?? []);
  const every = plan.every ?? 5;
  const pace = plan.pace ?? 150;
  const spoken = sourceWords(verse)
    .filter((_, index) => !skip.has(index))
    .map(sayingOf(plan.say ?? 'written'));
  const steps: DictationStep[] = [];
  let tail: readonly DictationRun[] = [];
  spoken.forEach((text, n) => {
    const at = n * pace + pace / 2;
    tail = [...tail, { text, start: n * pace, end: at }];
    steps.push({ at, final: false, runs: tail });
    if (tail.length >= every || n === spoken.length - 1) {
      steps.push({ at, final: true, runs: tail });
      tail = [];
    }
  });
  return steps;
};

const mark = (session: number, kind: 'start' | 'end'): DictationEvent => ({
  session,
  kind,
  final: false,
  runs: [],
  reason: '',
});

const result = (session: number, step: DictationStep): DictationEvent => ({
  session,
  kind: 'result',
  final: step.final,
  runs: step.runs,
  reason: '',
});

/** The replay the source holds: its session and the index of its next step. */
interface Held {
  readonly session: number;
  readonly next: number;
}

/**
 * A `DictationSource` that answers every listen by playing `steps`: it
 * stops the replay it holds, sends `start`, each step as a result at its
 * `at` after the listen on Effect's clock, then `end`. `finish` sends the
 * remaining steps at once, then `end`; `cancel` stops it with nothing more.
 * Every engine is `ready`.
 */
export const scriptedSource = (steps: readonly DictationStep[]): Layer.Layer<DictationSource> =>
  Layer.effect(
    DictationSource,
    Effect.gen(function* () {
      const scope = yield* Effect.scope;
      const context = yield* Effect.context<never>();
      const listener = MutableRef.make<Option.Option<(event: DictationEvent) => void>>(
        Option.none(),
      );
      const held = MutableRef.make<Option.Option<Held>>(Option.none());
      const player = MutableRef.make<Option.Option<Fiber.Fiber<void>>>(Option.none());
      const emit = (event: DictationEvent) => {
        Option.map(MutableRef.get(listener), (send) => send(event));
      };
      const holds = (session: number) =>
        Option.exists(MutableRef.get(held), (now) => now.session === session);

      /** Lets go of the held replay, so it sends nothing more, and answers its next step. */
      const release = (): Option.Option<Held> => {
        const now = MutableRef.get(held);
        MutableRef.set(held, Option.none());
        return now;
      };

      const stopPlayer = Effect.suspend(() => {
        const fiber = MutableRef.get(player);
        MutableRef.set(player, Option.none());
        return Option.match(fiber, { onNone: () => Effect.void, onSome: Fiber.interrupt });
      });

      const play = (session: number) =>
        Effect.gen(function* () {
          let elapsed = 0;
          for (const [index, next] of steps.entries()) {
            if (next.at > elapsed) {
              yield* Effect.sleep(next.at - elapsed);
              elapsed = next.at;
            }
            if (!holds(session)) return;
            MutableRef.set(held, Option.some({ session, next: index + 1 }));
            emit(result(session, next));
          }
          if (!holds(session)) return;
          release();
          emit(mark(session, 'end'));
        });

      return DictationSource.of({
        engines: () => Effect.succeed(CHAIN.map((engine) => ({ engine, status: 'ready' }))),
        listen: (session) =>
          Effect.gen(function* () {
            release();
            yield* stopPlayer;
            MutableRef.set(held, Option.some({ session, next: 0 }));
            emit(mark(session, 'start'));
            if (!holds(session)) return;
            MutableRef.set(
              player,
              Option.some(
                yield* Effect.forkIn(Effect.provideContext(play(session), context), scope),
              ),
            );
          }),
        finish: Effect.suspend(() =>
          Option.match(release(), {
            onNone: () => Effect.void,
            onSome: (now) =>
              Effect.andThen(
                stopPlayer,
                Effect.sync(() => {
                  for (const rest of steps.slice(now.next)) emit(result(now.session, rest));
                  emit(mark(now.session, 'end'));
                }),
              ),
          }),
        ),
        cancel: Effect.andThen(Effect.sync(release), stopPlayer),
        subscribe: (next) =>
          Effect.asVoid(
            Effect.acquireRelease(
              Effect.sync(() => MutableRef.set(listener, Option.some(next))),
              () => Effect.sync(() => MutableRef.set(listener, Option.none())),
            ),
          ),
      });
    }),
  );
