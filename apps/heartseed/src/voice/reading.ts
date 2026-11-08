/**
 * The voice's reading as a pure reducer: each command and each native event
 * is an input, and `step` answers the next state and the one source call it
 * asks for, if any. The view changes before its call is made, so no command
 * waits on another's call; an event never asks for a call.
 */

import { Match, Option } from 'effect';

// oxlint-disable-next-line effect/noNullish -- the view contract (hsvoice spec, TypeScript seam) gives the screen an absent verse, current range or ending as null.
export type OrNull<A> = A | null;

const ABSENT: OrNull<never> = Option.getOrNull(Option.none());

export type Status = 'idle' | 'reading' | 'paused';

export type Ending = 'finished' | 'stopped' | 'off' | 'interrupted' | 'failed';

/** The voice's setting, in the order a tap on Voice cycles it. */
export const CHOICES = ['off', 'her', 'him'] as const;

export type Choice = (typeof CHOICES)[number];

/** The choice after `choice` in `CHOICES`, wrapping from the last to the first. */
export const nextChoice = (choice: Choice): Choice =>
  CHOICES[(CHOICES.indexOf(choice) + 1) % CHOICES.length] ?? 'off';

export interface VoiceEvent {
  readonly utterance: number;
  readonly kind: 'start' | 'range' | 'finish' | 'cancel' | 'interrupt';
  readonly location: number;
  readonly length: number;
}

export interface VoiceView {
  readonly choice: Choice;
  /** Whether the voice reads at all: `choice !== 'off'`. */
  readonly enabled: boolean;
  readonly status: Status;
  readonly verse: OrNull<string>;
  readonly words: number;
  readonly lit: number;
  readonly current: OrNull<{ readonly first: number; readonly last: number }>;
  readonly ended: OrNull<Ending>;
}

/** The view and the last utterance id this service gave a `speak`. */
export interface Reading {
  readonly view: VoiceView;
  readonly lastId: number;
}

export type Input =
  | { readonly _tag: 'Read'; readonly verse: string }
  | { readonly _tag: 'Pause' }
  | { readonly _tag: 'Resume' }
  | { readonly _tag: 'Stop' }
  | { readonly _tag: 'Choose'; readonly choice: Choice }
  | { readonly _tag: 'Failed'; readonly utterance: number }
  | { readonly _tag: 'Event'; readonly event: VoiceEvent };

export type Call =
  | { readonly _tag: 'Speak'; readonly utterance: number; readonly text: string }
  | { readonly _tag: 'Pause' }
  | { readonly _tag: 'Resume' }
  | { readonly _tag: 'Stop' };

export interface Step {
  readonly reading: Reading;
  readonly call: Option.Option<Call>;
}

/** A source word's UTF-16 span `[start, end)` in its verse. */
export interface Span {
  readonly start: number;
  readonly end: number;
}

const WORD = /[\p{L}\p{N}]/u;

/** The verse's words as the matcher's `sourceWords` splits them (whitespace runs holding a letter or number), each as its UTF-16 span. */
export const wordSpans = (verse: string): ReadonlyArray<Span> =>
  Array.from(verse.matchAll(/\S+/gu))
    .filter((run) => WORD.test(run[0]))
    .map((run) => ({ start: run.index, end: run.index + run[0].length }));

export const initial = (choice: Choice): Reading => ({
  view: {
    choice,
    enabled: choice !== 'off',
    status: 'idle',
    verse: ABSENT,
    words: 0,
    lit: 0,
    current: ABSENT,
    ended: ABSENT,
  },
  lastId: 0,
});

/** Whether a reading is under way: reading or paused. */
export const isActive = (view: VoiceView): boolean =>
  view.status === 'reading' || view.status === 'paused';

const stay = (reading: Reading): Step => ({ reading, call: Option.none() });

const to = (reading: Reading, view: VoiceView, call: Option.Option<Call>): Step => ({
  reading: { ...reading, view },
  call,
});

/** How many words an ending leaves lit: all of them when it finished, else as many as were. */
const litAt = (view: VoiceView, ending: Ending) => {
  if (ending === 'finished') return view.words;
  return view.lit;
};

/** The view of a reading that ended: idle, no current word, its verse, words and lit kept. */
const ended = (view: VoiceView, ending: Ending): VoiceView => ({
  ...view,
  status: 'idle',
  current: ABSENT,
  lit: litAt(view, ending),
  ended: ending,
});

/** The words a well-formed range overlaps, first and last, or none. */
const rangeWords = (verse: string, location: number, length: number) => {
  const wellFormed =
    Number.isInteger(location) &&
    Number.isInteger(length) &&
    location >= 0 &&
    length >= 1 &&
    location + length <= verse.length;
  const hit = wordSpans(verse).flatMap((span, index) => {
    if (span.start < location + length && location < span.end) return [index];
    return [];
  });
  if (!wellFormed || hit.length === 0) return Option.none();
  return Option.some({ first: Math.min(...hit), last: Math.max(...hit) });
};

const onRange = (reading: Reading, event: VoiceEvent): Step => {
  const { view } = reading;
  const verse = Option.getOrElse(Option.fromNullishOr(view.verse), () => '');
  return Option.match(rangeWords(verse, event.location, event.length), {
    onNone: () => stay(reading),
    onSome: (current) => {
      if (current.last + 1 < view.lit) return stay(reading);
      return to(reading, { ...view, lit: current.last + 1, current }, Option.none());
    },
  });
};

/** An event changes the view only while a reading is active and only for the current id. */
const onEvent = (reading: Reading, event: VoiceEvent): Step => {
  if (!isActive(reading.view) || event.utterance !== reading.lastId) return stay(reading);
  switch (event.kind) {
    case 'start':
      return stay(reading);
    case 'finish':
      return to(reading, ended(reading.view, 'finished'), Option.none());
    case 'cancel':
    case 'interrupt':
      return to(reading, ended(reading.view, 'interrupted'), Option.none());
    case 'range':
      return onRange(reading, event);
  }
};

const onRead = (reading: Reading, verse: string): Step => {
  const words = wordSpans(verse).length;
  if (!reading.view.enabled || words === 0) return stay(reading);
  const utterance = reading.lastId + 1;
  return {
    reading: {
      lastId: utterance,
      view: {
        ...reading.view,
        status: 'reading',
        verse,
        words,
        lit: 0,
        current: ABSENT,
        ended: ABSENT,
      },
    },
    call: Option.some({ _tag: 'Speak', utterance, text: verse }),
  };
};

/** A choice changes the view only, but Off ends a reading under way and asks to stop it. */
const onChoose = (reading: Reading, choice: Choice): Step => {
  const next = { ...reading.view, choice, enabled: choice !== 'off' };
  if (choice !== 'off' || !isActive(reading.view)) return to(reading, next, Option.none());
  return to(reading, ended(next, 'off'), Option.some({ _tag: 'Stop' }));
};

/** The next state for one input, and the source call it asks for. */
export const step = (reading: Reading, input: Input): Step => {
  const { view } = reading;
  return Match.type<Input>().pipe(
    Match.tagsExhaustive({
      Read: ({ verse }) => onRead(reading, verse),
      Pause: () => {
        if (view.status !== 'reading') return stay(reading);
        return to(reading, { ...view, status: 'paused' }, Option.some({ _tag: 'Pause' }));
      },
      Resume: () => {
        if (view.status !== 'paused') return stay(reading);
        return to(reading, { ...view, status: 'reading' }, Option.some({ _tag: 'Resume' }));
      },
      Stop: () => {
        if (!isActive(view)) return stay(reading);
        return to(reading, ended(view, 'stopped'), Option.some({ _tag: 'Stop' }));
      },
      Choose: ({ choice }) => onChoose(reading, choice),
      Failed: ({ utterance }) => {
        if (!isActive(view) || utterance !== reading.lastId) return stay(reading);
        return to(reading, ended(view, 'failed'), Option.none());
      },
      Event: ({ event }) => onEvent(reading, event),
    }),
  )(input);
};
