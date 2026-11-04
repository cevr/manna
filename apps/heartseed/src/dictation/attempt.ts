/**
 * One recital as a pure reducer: each command, each event of the source
 * and each answer of a pending call is an input, and `step` answers the
 * next state and the one source call it asks for, if any. The view changes
 * before its call is made, so no command waits on another's call; an event
 * asks for a call only when it falls back to the next engine of the chain.
 */

import { Match, Option } from 'effect';

import {
  createMatcher,
  matcherView,
  updateMatcher,
  type Cue,
  type MatcherState,
  type MatcherView,
  type SpokenWord,
} from '../matcher';
import { sourceWords } from '../matcher/words';
import { hintsOf, wordsOf, type DictationRun } from './words';

// oxlint-disable-next-line effect/noNullish -- the view contract (hsdictate spec, TypeScript seam) gives a screen an absent engine, verse, matcher or ending as null.
export type OrNull<A> = A | null;

const ABSENT: OrNull<never> = Option.getOrNull(Option.none());

/** The recognizers a listen may ask for, best first: SpeechAnalyzer with SpeechTranscriber, then with DictationTranscriber, then SFSpeechRecognizer on the device. */
export type Engine = 'analyzer' | 'dictation' | 'recognizer';

/** The order a recital tries the engines in. */
export const CHAIN: readonly Engine[] = ['analyzer', 'dictation', 'recognizer'];

/** The one language a recital listens in. */
export const LOCALE = 'en-US';

export type Status = 'idle' | 'listening' | 'finishing';

export type Ending = 'finished' | 'cancelled' | 'denied' | 'unavailable' | 'interrupted' | 'failed';

/** One event of the session the source holds: its start, a result, its end, or a failure with its reason (`denied`, `unavailable`, `interrupted` or `error`). */
export interface DictationEvent {
  readonly session: number;
  readonly kind: 'start' | 'result' | 'end' | 'fail';
  readonly final: boolean;
  readonly runs: readonly DictationRun[];
  readonly reason: string;
}

/** What a screen shows of a recital: its status, the engine it listens with, the verse, the matcher's view and how it ended. */
export interface DictationView {
  readonly status: Status;
  readonly engine: OrNull<Engine>;
  readonly verse: OrNull<string>;
  readonly matcher: OrNull<MatcherView>;
  readonly ended: OrNull<Ending>;
}

/** The view and what the reducer keeps behind it: the current session, the last id given, whether that session was heard, and the words heard so far. */
export interface Attempt {
  readonly view: DictationView;
  readonly session: number;
  readonly lastSession: number;
  readonly heard: boolean;
  readonly matcher: Option.Option<MatcherState>;
  readonly final: readonly SpokenWord[];
  readonly tentative: readonly SpokenWord[];
  readonly revision: number;
}

export type Input =
  | { readonly _tag: 'Start'; readonly verse: string; readonly cue: Cue }
  | { readonly _tag: 'Finish' }
  | { readonly _tag: 'Cancel' }
  | { readonly _tag: 'Peek'; readonly index: number }
  | { readonly _tag: 'Event'; readonly event: DictationEvent }
  | { readonly _tag: 'Refused'; readonly session: number }
  | { readonly _tag: 'Grace'; readonly session: number };

export type Call =
  | {
      readonly _tag: 'Listen';
      readonly session: number;
      readonly engine: Engine;
      readonly locale: string;
      readonly hints: readonly string[];
    }
  | { readonly _tag: 'Finish'; readonly session: number }
  | { readonly _tag: 'Cancel' };

export interface Step {
  readonly attempt: Attempt;
  readonly call: Option.Option<Call>;
}

export const initial: Attempt = {
  view: { status: 'idle', engine: ABSENT, verse: ABSENT, matcher: ABSENT, ended: ABSENT },
  session: 0,
  lastSession: 0,
  heard: false,
  matcher: Option.none(),
  final: [],
  tentative: [],
  revision: -1,
};

/** Whether a recital is under way: listening or finishing. */
export const isActive = (view: DictationView): boolean => view.status !== 'idle';

const stay = (attempt: Attempt): Step => ({ attempt, call: Option.none() });

const withMatcher = (
  attempt: Attempt,
  matcher: Option.Option<MatcherState>,
  view: Partial<DictationView>,
): Attempt => ({
  ...attempt,
  matcher,
  view: { ...attempt.view, ...view, matcher: Option.getOrNull(Option.map(matcher, matcherView)) },
});

/** The attempt ended: idle with its ending, its engine, verse and matcher kept; the matcher finished only when the recital finished. */
const end = (attempt: Attempt, ended: Ending): Attempt => {
  const matcher = Option.map(attempt.matcher, (state) => {
    if (ended !== 'finished') return state;
    return updateMatcher(state, { type: 'finish' });
  });
  return withMatcher(attempt, matcher, { status: 'idle', ended });
};

const listen = (session: number, engine: Engine, verse: string): Call => ({
  _tag: 'Listen',
  session,
  engine,
  locale: LOCALE,
  hints: hintsOf(verse),
});

/** How a failure ends a recital that does not fall back. */
const endingOf = (reason: string, heard: boolean): Ending => {
  if (reason === 'denied') return 'denied';
  if (reason === 'interrupted') return 'interrupted';
  if (reason === 'unavailable' && !heard) return 'unavailable';
  return 'failed';
};

/** The engine after `engine` in the chain, if any. */
const nextEngine = (engine: OrNull<Engine>): Option.Option<Engine> =>
  Option.flatMap(Option.fromNullishOr(engine), (held) =>
    Option.fromNullishOr(CHAIN[CHAIN.indexOf(held) + 1]),
  );

/**
 * A failure of the current session: while listening, before anything was
 * heard, `unavailable` falls back to the next engine under a new session;
 * anything else ends the recital with the matcher unfinished.
 */
const failed = (attempt: Attempt, reason: string): Step => {
  const fallback = Option.filter(
    Option.all({
      engine: nextEngine(attempt.view.engine),
      verse: Option.fromNullishOr(attempt.view.verse),
    }),
    () => attempt.view.status === 'listening' && reason === 'unavailable' && !attempt.heard,
  );
  return Option.match(fallback, {
    onNone: () => stay(end(attempt, endingOf(reason, attempt.heard))),
    onSome: ({ engine, verse }) => {
      const session = attempt.lastSession + 1;
      return {
        attempt: { ...attempt, session, lastSession: session, view: { ...attempt.view, engine } },
        call: Option.some(listen(session, engine, verse)),
      };
    },
  });
};

const onStart = (attempt: Attempt, verse: string, cue: Cue): Step => {
  if (sourceWords(verse).length === 0) return stay(attempt);
  const session = attempt.lastSession + 1;
  const matcher = createMatcher(verse, cue);
  return {
    attempt: {
      view: {
        status: 'listening',
        engine: 'analyzer',
        verse,
        matcher: matcherView(matcher),
        ended: ABSENT,
      },
      session,
      lastSession: session,
      heard: false,
      matcher: Option.some(matcher),
      final: [],
      tentative: [],
      revision: -1,
    },
    call: Option.some(listen(session, 'analyzer', verse)),
  };
};

/** The start of the last final word: no word of a later result starts before it. */
const floorOf = (words: readonly SpokenWord[]) => words.at(-1)?.start ?? 0;

/** The attempt with `final` and `tentative` as its words, under the next revision, fed to the matcher. */
const recognized = (
  attempt: Attempt,
  final: readonly SpokenWord[],
  tentative: readonly SpokenWord[],
): Step => {
  const revision = attempt.revision + 1;
  const matcher = Option.map(attempt.matcher, (state) =>
    updateMatcher(state, {
      type: 'recognition',
      revision,
      finalWords: final,
      tentativeWords: tentative,
    }),
  );
  return stay(withMatcher({ ...attempt, heard: true, final, tentative, revision }, matcher, {}));
};

/** A result: a final one appends its words to the final words and empties the tail; any other is the whole tail. */
const onResult = (attempt: Attempt, event: DictationEvent): Step => {
  const words = wordsOf(event.runs, floorOf(attempt.final));
  if (event.final) return recognized(attempt, [...attempt.final, ...words], []);
  return recognized(attempt, attempt.final, words);
};

/** An event changes the attempt only while it is active and only for the current session. */
const onEvent = (attempt: Attempt, event: DictationEvent): Step => {
  if (!isActive(attempt.view) || event.session !== attempt.session) return stay(attempt);
  switch (event.kind) {
    case 'start':
      return stay({ ...attempt, heard: true });
    case 'result':
      return onResult(attempt, event);
    case 'end':
      return stay(end(attempt, 'finished'));
    case 'fail':
      return failed(attempt, event.reason);
  }
};

const onPeek = (attempt: Attempt, index: number): Step =>
  Option.match(attempt.matcher, {
    onNone: () => stay(attempt),
    onSome: (state) => {
      const next = updateMatcher(state, { type: 'peek', index });
      if (next === state) return stay(attempt);
      return stay(withMatcher(attempt, Option.some(next), {}));
    },
  });

/** The next state for one input, and the source call it asks for. */
export const step = (attempt: Attempt, input: Input): Step => {
  const { view } = attempt;
  return Match.type<Input>().pipe(
    Match.tagsExhaustive({
      Start: ({ verse, cue }) => onStart(attempt, verse, cue),
      Finish: (): Step => {
        if (view.status !== 'listening') return stay(attempt);
        return {
          attempt: { ...attempt, view: { ...view, status: 'finishing' } },
          call: Option.some({ _tag: 'Finish', session: attempt.session }),
        };
      },
      Cancel: (): Step => {
        if (!isActive(view)) return stay(attempt);
        return { attempt: end(attempt, 'cancelled'), call: Option.some({ _tag: 'Cancel' }) };
      },
      Peek: ({ index }) => onPeek(attempt, index),
      Event: ({ event }) => onEvent(attempt, event),
      Refused: ({ session }) => {
        if (!isActive(view) || session !== attempt.session) return stay(attempt);
        return failed(attempt, 'unavailable');
      },
      Grace: ({ session }): Step => {
        if (view.status !== 'finishing' || session !== attempt.session) return stay(attempt);
        return { attempt: end(attempt, 'finished'), call: Option.some({ _tag: 'Cancel' }) };
      },
    }),
  )(input);
};
