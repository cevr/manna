/* oxlint-disable effect/noNullish, effect/noTernary, effect/noKnownValueWidening -- Exact's data module cannot import effect (docs/exact.md), so no Option or Match: a held hymn and a command are absent as undefined, as Exact's option is null on the wire, and each rule branches plainly. */

/**
 * The player as one pure step: `step(state, input)` answers the next state
 * and at most one command to the device, and `view(state)` what the bar,
 * the full player and the system's Now Playing show.
 *
 * The device is one `audio` element per load. Each load has an id, and
 * every device event names the load it belongs to: an event of another
 * load changes nothing, so a late event of a hymn replaced, retried or
 * stopped is inert. What the device should be doing (`deviceOf`) is a
 * function of the state; the command is the difference it makes, so a
 * command is issued only by the step that changes that, and once.
 *
 * The element says each time it starts or stops (`play`, `pause`), for the
 * app's own commands and for the platform's (the lock screen, Control
 * Center, a headset, an interruption), which play and pause the element
 * and only then tell the app. Each play or pause the reader's input sends
 * is owed one of those (`owed`): an event that pays a debt is an echo, and
 * only one owed nothing is the platform's, a remote play or pause. An echo
 * the element never sends, because the platform had already put it where
 * the command asks, is paid by the platform's own event, which is on its
 * way. So a late echo of a play never undoes a pause (`protocol.qnt`).
 *
 * Time is the recording's, in seconds, as the device tells it: the place
 * only moves on within a load and is held under the length. The view shows
 * it as sung time under the hymn's stanza choice (`score.ts`).
 */

import { titleGoes } from '@manna/hymnal-app/player/title';

import type { Choice, Score } from './score.ts';

/** A hymn the player plays: its number names its recording. */
export interface Track {
  readonly number: number;
  readonly title: string;
  /** Where its recording is; empty when the hymnal has none for it. */
  readonly url: string;
  readonly score: Score;
}

export type Phase = 'none' | 'loading' | 'playing' | 'buffering' | 'paused' | 'ended' | 'failed';

/** Why a load failed: no connection, no recording at its address, or one that would not play. */
export type Why = 'network' | 'missing' | 'decode';

/** The element's event that answers a command: `played` a play, `paused` a pause. */
export type Echo = 'played' | 'paused';

export interface Held {
  readonly track: Track;
  /** The load the device holds for it. */
  readonly load: number;
  readonly phase: Exclude<Phase, 'none'>;
  /** What the reader last asked: to hear it or not. */
  readonly wants: 'play' | 'pause';
  /** The element's `play` and `pause` events the reader's commands are owed, in order. */
  readonly owed: ReadonlyArray<Echo>;
  /** The place, in the recording's seconds. */
  readonly at: number;
  /** The recording's length in seconds; 0 until the device says it. */
  readonly length: number;
  /** Where the load starts, in the recording's seconds. */
  readonly from: number;
  readonly why: Why | '';
}

/** A navigation the view asks of the stack, numbered so each is taken once. */
export interface Go {
  readonly serial: number;
  /** `back` closes the sheet; `push` and `replace` open `path` (after `back` when `close`). */
  readonly kind: '' | 'back' | 'push' | 'replace';
  readonly path: string;
  /** Close the sheet before the push. */
  readonly close: boolean;
}

export interface State {
  readonly held: Held | undefined;
  /** The last load id issued. */
  readonly loads: number;
  /** The stack's paths, the screen shown last. */
  readonly stack: ReadonlyArray<string>;
  /** Each hymn's stanza choice, by number; a hymn not here sings every stanza. */
  readonly choices: Readonly<Record<string, Choice>>;
  readonly go: Go;
  /** How many inputs have been stepped. */
  readonly steps: number;
}

export type Input =
  | { readonly _tag: 'play'; readonly track: Track }
  | { readonly _tag: 'pause' }
  | { readonly _tag: 'resume' }
  | { readonly _tag: 'stop' }
  | { readonly _tag: 'chooseStanza'; readonly stanza: number }
  | { readonly _tag: 'openSheet' }
  | { readonly _tag: 'closeSheet' }
  | { readonly _tag: 'titlePressed' }
  | { readonly _tag: 'retry' }
  | { readonly _tag: 'loaded'; readonly id: number; readonly duration: number }
  | { readonly _tag: 'time'; readonly id: number; readonly seconds: number }
  | { readonly _tag: 'waiting'; readonly id: number }
  | { readonly _tag: 'played'; readonly id: number }
  | { readonly _tag: 'playing'; readonly id: number }
  | { readonly _tag: 'paused'; readonly id: number }
  | { readonly _tag: 'ended'; readonly id: number }
  | { readonly _tag: 'failed'; readonly id: number; readonly why: Why }
  | { readonly _tag: 'interrupted' }
  | { readonly _tag: 'remote'; readonly action: 'play' | 'pause' }
  | { readonly _tag: 'screen'; readonly stack: ReadonlyArray<string> }
  | { readonly _tag: 'restore'; readonly choices: Readonly<Record<string, Choice>> };

/** What the device should be doing: nothing, or one load's recording, playing or paused. */
export interface Device {
  readonly load: number;
  readonly url: string;
  readonly from: number;
  readonly paused: boolean;
}

export type Command =
  | { readonly _tag: 'load'; readonly url: string; readonly id: number; readonly from: number }
  | { readonly _tag: 'play' }
  | { readonly _tag: 'pause' }
  | { readonly _tag: 'unload' };

/** What the system's Now Playing shows. */
export interface Session {
  readonly title: string;
  readonly number: number;
  readonly duration: number;
  readonly playing: boolean;
}

export const SHEET = '/player';

export const initial: State = {
  held: undefined,
  loads: 0,
  stack: ['/'],
  choices: {},
  go: { serial: 0, kind: '', path: '', close: false },
  steps: 0,
};

/** Whether the held hymn is making, or about to make, sound. */
export const sounding = (held: Held | undefined): boolean =>
  held !== undefined &&
  (held.phase === 'loading' || held.phase === 'playing' || held.phase === 'buffering');

/** The device for `state`: a failed or let-go hymn holds nothing. */
export const deviceOf = (state: State): Device | undefined => {
  const { held } = state;
  if (held === undefined || held.phase === 'failed' || held.track.url === '') return undefined;
  return { load: held.load, url: held.track.url, from: held.from, paused: held.wants === 'pause' };
};

/** The one command that takes the device from `before` to `after`, if they differ. */
export const commandOf = (
  before: Device | undefined,
  after: Device | undefined,
): Command | undefined => {
  if (after === undefined) return before === undefined ? undefined : { _tag: 'unload' };
  if (before === undefined || before.load !== after.load)
    return { _tag: 'load', url: after.url, id: after.load, from: after.from };
  if (before.paused === after.paused) return undefined;
  return after.paused ? { _tag: 'pause' } : { _tag: 'play' };
};

/** The choice the hymn numbered `number` sings. */
export const choiceOf = (state: State, number: number): Choice => state.choices[`${number}`] ?? [];

/** A new load of `track` from `from` seconds, wanting to hear it. */
const loaded = (state: State, track: Track, from: number): State => {
  const load = state.loads + 1;
  const phase = track.url === '' ? 'failed' : 'loading';
  const why = track.url === '' ? 'missing' : '';
  return {
    ...state,
    loads: load,
    held: { track, load, phase, wants: 'play', owed: [], at: from, length: 0, from, why },
  };
};

/** The held hymn changed by `change`, when the event names its load and it has not failed. */
const onLoad = (state: State, id: number, change: (held: Held) => Held): State => {
  const { held } = state;
  if (held === undefined || held.load !== id || held.phase === 'failed') return state;
  return { ...state, held: change(held) };
};

const paused = (held: Held): Held => ({ ...held, phase: 'paused', wants: 'pause' });

/** A pause: only a hymn the reader wants to hear pauses. */
const pause = (state: State): State => {
  const { held } = state;
  if (held === undefined || held.wants === 'pause' || !sounding(held)) return state;
  return { ...state, held: paused(held) };
};

/**
 * `held` after the element's `event`, when it is the echo owed first.
 * Otherwise none: one element's events come in order, so an echo still
 * owed would have come before it, and the element never sends it (the
 * platform had put it where the command asked); every debt is let go and
 * the event is the platform's.
 */
const echoed = (held: Held, event: Echo): { readonly echo: boolean; readonly held: Held } =>
  held.owed[0] === event
    ? { echo: true, held: { ...held, owed: held.owed.slice(1) } }
    : { echo: false, held: { ...held, owed: [] } };

/** Play on: a paused hymn plays on where it is, an ended one from the start, a failed one where it was. */
const resume = (state: State): State => {
  const { held } = state;
  if (held === undefined) return state;
  if (held.phase === 'paused')
    return { ...state, held: { ...held, phase: 'loading', wants: 'play' } };
  if (held.phase === 'ended') return loaded(state, held.track, 0);
  if (held.phase === 'failed' && held.why !== 'missing') return loaded(state, held.track, held.at);
  return state;
};

const play = (state: State, track: Track): State => {
  const { held } = state;
  if (held === undefined || held.track.number !== track.number) return loaded(state, track, 0);
  return resume(state);
};

/** The hymn page a path shows, by number; none for any other path. */
const hymnOf = (path: string): number | undefined => {
  const found = /^\/hymns\/([1-9]\d*)$/u.exec(path);
  return found === null ? undefined : Number(found[1]);
};

const going = (state: State, go: Omit<Go, 'serial'>): State => ({
  ...state,
  go: { ...go, serial: state.go.serial + 1 },
});

/** A stack path as the current app's stack names its screen: a hymn's page by its route file. */
const routeOf = (path: string) => {
  const hymn = hymnOf(path);
  if (hymn === undefined) return { name: path };
  return { name: 'hymns/[number]', params: { number: `${hymn}` } };
};

/**
 * Where a press on the full player's title goes, as the current app's
 * `titleGoes` says (`title.ts`): only back when the hymn's page is right
 * under the sheet; back, then the page pushed, over any other screen; the
 * page in the sheet's place when no screen is under it.
 */
export const titleGo = (stack: ReadonlyArray<string>, hymn: number): Omit<Go, 'serial'> => {
  const go = titleGoes({ routes: stack.map(routeOf), index: stack.length - 1 }, hymn);
  const path = `/hymns/${hymn}`;
  if (go._tag === 'Close') return { kind: 'back', path: '', close: false };
  if (go._tag === 'Open') return { kind: 'push', path, close: true };
  return { kind: 'replace', path, close: false };
};

const reader = (state: State, input: Input): State => {
  switch (input._tag) {
    case 'play':
      return play(state, input.track);
    case 'pause':
      return pause(state);
    case 'resume':
      return resume(state);
    case 'stop':
      return { ...state, held: undefined };
    case 'retry':
      return state.held?.phase === 'failed' ? resume(state) : state;
    case 'chooseStanza': {
      const { held } = state;
      if (held === undefined) return state;
      const key = `${held.track.number}`;
      const choice = held.track.score.toggle(choiceOf(state, held.track.number), input.stanza);
      return { ...state, choices: { ...state.choices, [key]: choice } };
    }
    case 'openSheet':
      if (state.held === undefined || state.stack.at(-1) === SHEET) return state;
      return going(state, { kind: 'push', path: SHEET, close: false });
    case 'closeSheet':
      if (state.stack.at(-1) !== SHEET) return state;
      return going(state, { kind: 'back', path: '', close: false });
    case 'titlePressed':
      if (state.held === undefined || state.stack.at(-1) !== SHEET) return state;
      return going(state, titleGo(state.stack, state.held.track.number));
    default:
      return state;
  }
};

const device = (state: State, input: Input): State => {
  switch (input._tag) {
    case 'loaded':
      return onLoad(state, input.id, (held) => {
        if (!Number.isFinite(input.duration) || input.duration <= 0) return held;
        return { ...held, length: Math.max(input.duration, held.at) };
      });
    case 'time':
      return onLoad(state, input.id, (held) => {
        if (!Number.isFinite(input.seconds) || held.phase === 'ended') return held;
        const at = Math.max(held.at, input.seconds);
        return { ...held, at: held.length > 0 ? Math.min(at, held.length) : at };
      });
    case 'waiting':
      return onLoad(state, input.id, (held) =>
        held.phase === 'playing' ? { ...held, phase: 'buffering' } : held,
      );
    case 'playing':
      return onLoad(state, input.id, (held) =>
        held.wants === 'play' && (held.phase === 'loading' || held.phase === 'buffering')
          ? { ...held, phase: 'playing' }
          : held,
      );
    case 'played':
      return onLoad(state, input.id, (before) => {
        const { echo, held } = echoed(before, 'played');
        if (echo) return held;
        if (held.phase === 'ended') return { ...held, phase: 'loading', wants: 'play', at: 0 };
        return held.wants === 'pause' && held.phase === 'paused'
          ? { ...held, phase: 'loading', wants: 'play' }
          : held;
      });
    case 'paused':
      return onLoad(state, input.id, (before) => {
        const { echo, held } = echoed(before, 'paused');
        if (echo) return held;
        return held.wants === 'play' && sounding(held) ? paused(held) : held;
      });
    case 'ended':
      return onLoad(state, input.id, (held) =>
        held.owed.includes('played')
          ? held
          : {
              ...held,
              owed: [],
              phase: 'ended',
              wants: 'pause',
              at: held.length > 0 ? held.length : held.at,
            },
      );
    case 'failed':
      return onLoad(state, input.id, (held) => ({ ...held, phase: 'failed', why: input.why }));
    case 'interrupted':
      return pause(state);
    case 'remote':
      return input.action === 'pause' ? pause(state) : resume(state);
    default:
      return state;
  }
};

const next = (state: State, input: Input): State => {
  switch (input._tag) {
    case 'screen':
      return { ...state, stack: input.stack.length === 0 ? ['/'] : input.stack };
    case 'restore':
      return { ...state, choices: { ...input.choices, ...state.choices } };
    default:
      return device(reader(state, input), input);
  }
};

/** The state after `input`, and the one command it gives the device, if any. */
export const step = (
  state: State,
  input: Input,
): { readonly state: State; readonly command: Command | undefined } => {
  const moved = { ...next(state, input), steps: state.steps + 1 };
  const command = commandOf(deviceOf(state), deviceOf(moved));
  const { held } = moved;
  if (held === undefined || command === undefined) return { state: moved, command };
  if (command._tag === 'load')
    return {
      state: { ...moved, held: { ...held, owed: held.wants === 'play' ? ['played'] : [] } },
      command,
    };
  const echo: Echo | undefined =
    command._tag === 'play' ? 'played' : command._tag === 'pause' ? 'paused' : undefined;
  const after =
    READER.has(input._tag) && echo !== undefined
      ? { ...moved, held: { ...held, owed: [...held.owed, echo] } }
      : moved;
  return { state: after, command };
};

/** The inputs that are the reader's: their plays and pauses are echoed by the element. */
const READER: ReadonlySet<Input['_tag']> = new Set([
  'play',
  'pause',
  'resume',
  'stop',
  'retry',
  'chooseStanza',
  'openSheet',
  'closeSheet',
  'titlePressed',
]);

/** The hymn page shown, when the stack's top (under the sheet, when it is up) is one. */
export const pageOf = (state: State): number | undefined => {
  const top = state.stack.at(-1) ?? '/';
  if (top === SHEET) return hymnOf(state.stack.at(-2) ?? '/');
  return hymnOf(top);
};

/** The held hymn's place and length in sung seconds, under its stanza choice. */
export const timesOf = (state: State): { readonly elapsed: number; readonly total: number } => {
  const { held } = state;
  if (held === undefined) return { elapsed: 0, total: 0 };
  const choice = choiceOf(state, held.track.number);
  const { sung } = held.track.score;
  const total = held.length > 0 ? sung(choice, held.length) : 0;
  const elapsed = sung(choice, held.at);
  return { elapsed: total > 0 ? Math.min(elapsed, total) : elapsed, total };
};

/** The system's Now Playing for `state`: the held hymn while the device holds it. */
export const sessionOf = (state: State): Session | undefined => {
  const { held } = state;
  if (held === undefined || deviceOf(state) === undefined) return undefined;
  return {
    title: held.track.title,
    number: held.track.number,
    duration: held.length,
    playing: held.phase === 'playing' || held.phase === 'buffering',
  };
};
