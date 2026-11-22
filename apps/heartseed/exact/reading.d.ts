import type { Option } from 'effect';

/** The voice's settings, Off first, in the order the Settings sheet offers them; see `src/voice/reading.ts`. */
export declare const CHOICES: readonly ['off', 'her', 'him'];
/** One of the voice's settings. */
export type Choice = (typeof CHOICES)[number];

// oxlint-disable-next-line effect/noNullish -- the view contract gives an absent verse, range or ending as null, as `src/voice/reading.ts` does.
export type OrNull<A> = A | null;

export type Status = 'idle' | 'reading' | 'paused';

export type Ending = 'finished' | 'stopped' | 'off' | 'interrupted' | 'failed';

/** A native event of the voice, for one utterance. */
export interface VoiceEvent {
  readonly utterance: number;
  readonly kind: 'start' | 'range' | 'finish' | 'cancel' | 'interrupt';
  readonly location: number;
  readonly length: number;
}

/** What the reading shows: where it is, what it lights and how it ended. */
export interface VoiceView {
  readonly choice: Choice;
  readonly enabled: boolean;
  readonly status: Status;
  readonly verse: OrNull<string>;
  readonly words: number;
  readonly lit: number;
  readonly current: OrNull<{ readonly first: number; readonly last: number }>;
  readonly ended: OrNull<Ending>;
}

/** The view, the last utterance id given a `speak`, and where that utterance's text starts in the verse. */
export interface Reading {
  readonly view: VoiceView;
  readonly lastId: number;
  readonly offset: number;
}

export type Input =
  | { readonly _tag: 'Read'; readonly verse: string }
  | { readonly _tag: 'Seek'; readonly word: number }
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

/** The verse's words as the matcher splits them, each as its span. */
export declare const wordSpans: (verse: string) => ReadonlyArray<Span>;

/** The reading at rest under `choice`. */
export declare const initial: (choice: Choice) => Reading;

/** Whether a reading is under way: reading or paused. */
export declare const isActive: (view: VoiceView) => boolean;

/** The next state for one input, and the source call it asks for. */
export declare const step: (reading: Reading, input: Input) => Step;
