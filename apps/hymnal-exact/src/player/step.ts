/* oxlint-disable effect/noNullish, effect/noTernary, effect/noKnownValueWidening, eslint/complexity -- Exact's data module cannot import effect (docs/exact.md), so no Option or Match: a held hymn and a command are absent as undefined, as Exact's option is null on the wire, and each rule branches plainly. */

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
 * Time is the recording's, in seconds, as the device tells it, and is held
 * under the length. The view shows it as sung time under the hymn's stanza
 * choice (`score.ts`). A seek moves it: each seek has a serial, and the
 * device's `time` and `seeked` name the serial they follow, so one from
 * before a seek is inert. The position bar's rules are the current app's
 * (`scrub-rules.ts`): a drag shows the move, not the place, and is sent
 * once, at its release, only when it ends on another second; a sent place
 * is held until the device reaches it, says it has, or the settle passes.
 * While a hymn sounds, a place in a span its stanza choice leaves out is
 * sought across at once, at the tick that finds it there or at the
 * runner's clock's `due` that sees it coming.
 */

import { nudged, placeAt, reached, sends } from '@manna/hymnal-app/player/scrub-rules';
import { titleGoes } from '@manna/hymnal-app/player/title';

import type { Choice, Score, Span } from './score.ts';

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

/** The reader's drag on the position bar, in sung seconds: from where the bar showed as it began, to the thumb. */
export interface Drag {
  readonly from: number;
  readonly to: number;
}

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
  /** The serial of the load's last seek; 0 before its first. */
  readonly seek: number;
  /** Where the last seek sent the device, in the recording's seconds. */
  readonly sought: number;
  /** The place sent is held: the device has not yet reached it. */
  readonly holding: boolean;
  /** The reader's drag on the bar, while one is held. */
  readonly drag: Drag | undefined;
  /** A buffering wait online has run `WAIT` long: Retry shows beside Pause, as the current app's `Buffering` `retry`. */
  readonly waited: boolean;
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
  /** The last seek serial issued. */
  readonly seeks: number;
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
  | { readonly _tag: 'dragStart' }
  | { readonly _tag: 'dragTo'; readonly seconds: number }
  | { readonly _tag: 'dragEnd' }
  | { readonly _tag: 'nudge'; readonly way: 1 | -1 }
  | { readonly _tag: 'seekTo'; readonly seconds: number }
  | { readonly _tag: 'stanzaPlace'; readonly stanza: number }
  | { readonly _tag: 'loaded'; readonly id: number; readonly duration: number }
  | {
      readonly _tag: 'time';
      readonly id: number;
      readonly serial: number;
      readonly seconds: number;
    }
  | { readonly _tag: 'seeked'; readonly id: number; readonly serial: number }
  | { readonly _tag: 'settle'; readonly id: number; readonly serial: number }
  | { readonly _tag: 'due'; readonly id: number; readonly serial: number; readonly seconds: number }
  | { readonly _tag: 'waiting'; readonly id: number }
  | { readonly _tag: 'waited'; readonly id: number }
  | { readonly _tag: 'played'; readonly id: number }
  | { readonly _tag: 'playing'; readonly id: number }
  | { readonly _tag: 'paused'; readonly id: number }
  | { readonly _tag: 'ended'; readonly id: number }
  | { readonly _tag: 'failed'; readonly id: number; readonly why: Why }
  | { readonly _tag: 'interrupted' }
  | { readonly _tag: 'remote'; readonly action: 'play' | 'pause' }
  | { readonly _tag: 'remoteSeek'; readonly seconds: number }
  | { readonly _tag: 'remoteSkip'; readonly way: 1 | -1 }
  | { readonly _tag: 'screen'; readonly stack: ReadonlyArray<string> }
  | { readonly _tag: 'restore'; readonly choices: Readonly<Record<string, Choice>> };

/** What the device should be doing: nothing, or one load's recording, playing or paused, at its last seek. */
export interface Device {
  readonly load: number;
  readonly url: string;
  readonly from: number;
  readonly paused: boolean;
  readonly seek: number;
  readonly to: number;
}

export type Command =
  | { readonly _tag: 'load'; readonly url: string; readonly id: number; readonly from: number }
  | { readonly _tag: 'play' }
  | { readonly _tag: 'pause' }
  | { readonly _tag: 'unload' }
  | {
      readonly _tag: 'seek';
      readonly id: number;
      readonly seconds: number;
      readonly serial: number;
      /** A span the stanza choice leaves out sought across, not the reader's or the platform's seek. */
      readonly skip: boolean;
    };

/** What the system's Now Playing shows. */
export interface Session {
  readonly title: string;
  readonly number: number;
  readonly duration: number;
  readonly playing: boolean;
}

export const SHEET = '/player';

/** The stack's path for the Settings sheet and what it pushes. */
export const SETTINGS = '/settings';

/** Whether a sheet (the full player, Settings) is on top of the stack. */
export const sheetUp = (state: State): boolean => {
  const top = state.stack.at(-1);
  return top === SHEET || top === SETTINGS;
};

/**
 * How long a buffering wait online runs before Retry shows beside Pause, in
 * milliseconds: the current app's `giveUpAfter` (`player.ts`, held there by
 * `bar.model.test.ts`), counted by `features/player.contract`'s `playerWait`
 * from the element's `waiting`, while the page is online.
 */
export const WAIT = 15000;

/** How far ahead of a span's start the runner's clock watches for it, in seconds: one tick and some. */
export const LEAD = 0.5;

export const initial: State = {
  held: undefined,
  loads: 0,
  seeks: 0,
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
  return {
    load: held.load,
    url: held.track.url,
    from: held.from,
    paused: held.wants === 'pause',
    seek: held.seek,
    to: held.sought,
  };
};

/** The one command that takes the device from `before` to `after`, if they differ. */
export const commandOf = (
  before: Device | undefined,
  after: Device | undefined,
  skip = false,
): Command | undefined => {
  if (after === undefined) return before === undefined ? undefined : { _tag: 'unload' };
  if (before === undefined || before.load !== after.load)
    return { _tag: 'load', url: after.url, id: after.load, from: after.from };
  if (before.seek !== after.seek)
    return { _tag: 'seek', id: after.load, seconds: after.to, serial: after.seek, skip };
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
    held: {
      track,
      load,
      phase,
      wants: 'play',
      owed: [],
      at: from,
      length: 0,
      from,
      why,
      seek: 0,
      sought: from,
      holding: false,
      drag: undefined,
      waited: false,
    },
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

/** The held hymn's choice. */
const choiceHeld = (state: State, held: Held): Choice => choiceOf(state, held.track.number);

/** The held hymn's length in sung seconds; 0 while the device has not said it. */
const totalOf = (state: State, held: Held): number =>
  held.length > 0 ? held.track.score.sung(choiceHeld(state, held), held.length) : 0;

/** What the position bar shows, in sung seconds: the drag while one is held, else the place. */
export const shownOf = (state: State, held: Held): number => {
  const total = totalOf(state, held);
  if (held.drag !== undefined) return Math.min(held.drag.to, total);
  const sung = held.track.score.sung(choiceHeld(state, held), held.at);
  return total > 0 ? Math.min(sung, total) : sung;
};

/** Whether the held hymn's place can move: a recording the device holds, of a length it has said. */
const seekable = (state: State): Held | undefined => {
  const { held } = state;
  if (held === undefined || deviceOf(state) === undefined || held.length <= 0) return undefined;
  return held;
};

/** The span of `choice`'s skips that `at` stands in, if any. */
export const spanAt = (skips: ReadonlyArray<Span>, at: number): Span | undefined =>
  skips.find((span) => span.from <= at && at < span.to);

/** The held hymn's spans its choice leaves out. */
const skipsOf = (state: State, held: Held) => held.track.score.skips(choiceHeld(state, held));

/**
 * The device sent to `seconds` of the recording, with a new serial: the
 * place moves there at once and is held until the device reaches it. A seek
 * neither plays nor pauses; an ended hymn is paused where it was sent.
 */
const seekRecording = (state: State, held: Held, seconds: number): State => {
  const place = Math.min(Math.max(seconds, 0), held.length);
  const serial = state.seeks + 1;
  return {
    ...state,
    seeks: serial,
    held: {
      ...held,
      seek: serial,
      sought: place,
      at: place,
      holding: true,
      phase: held.phase === 'ended' ? 'paused' : held.phase,
    },
  };
};

/** The device sent to `sung` seconds of the cut, the recording's place inside a kept line. */
const seekSung = (state: State, held: Held, sung: number): State =>
  seekRecording(state, held, held.track.score.recording(choiceHeld(state, held), sung));

/** Past a span the choice leaves out, when the held hymn stands in one: to its end. */
const across = (state: State, held: Held, at: number): State => {
  const span = spanAt(skipsOf(state, held), at);
  return span === undefined ? state : seekRecording(state, held, span.to);
};

/** The drag `held` holds, its thumb at `to`. */
const dragged = (state: State, held: Held, to: number): State => ({
  ...state,
  held: { ...held, drag: { from: held.drag?.from ?? shownOf(state, held), to } },
});

/**
 * A place the reader asks for at once (a key's or a screen reader's step,
 * the lock screen's skip): sent when it is on another second than the bar
 * shows; a drag under way goes on from it.
 */
const stepTo = (state: State, held: Held, to: number): State => {
  if (!sends(shownOf(state, held), to)) return state;
  const sent = seekSung(state, held, to);
  const moved = sent.held;
  if (moved === undefined || held.drag === undefined) return sent;
  return { ...sent, held: { ...moved, drag: { from: to, to } } };
};

/** `seconds` held to the bar's range, as the current app places a value along it. */
const onBar = (state: State, held: Held, seconds: number) => {
  const total = totalOf(state, held);
  return placeAt(seconds, total, total);
};

const seeking = (state: State, input: Input): State => {
  const held = seekable(state);
  if (held === undefined) return state;
  switch (input._tag) {
    case 'dragStart':
      return held.drag === undefined ? dragged(state, held, shownOf(state, held)) : state;
    case 'dragTo':
      return Number.isFinite(input.seconds)
        ? dragged(state, held, onBar(state, held, input.seconds))
        : state;
    case 'dragEnd': {
      const { drag } = held;
      if (drag === undefined) return state;
      const free = { ...state, held: { ...held, drag: undefined } };
      return sends(drag.from, drag.to)
        ? seekSung(free, { ...held, drag: undefined }, drag.to)
        : free;
    }
    case 'nudge':
    case 'remoteSkip':
      return stepTo(state, held, nudged(shownOf(state, held), totalOf(state, held), input.way));
    case 'seekTo':
      return Number.isFinite(input.seconds)
        ? stepTo(state, held, onBar(state, held, input.seconds))
        : state;
    case 'stanzaPlace': {
      const place = held.track.score.stanzaAt(choiceHeld(state, held), input.stanza);
      return place === undefined ? state : seekSung(state, held, place);
    }
    case 'remoteSeek': {
      if (!Number.isFinite(input.seconds)) return state;
      const place = Math.min(Math.max(input.seconds, 0), held.length);
      const span = spanAt(skipsOf(state, held), place);
      return seekRecording(state, held, span === undefined ? place : span.to);
    }
    default:
      return state;
  }
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

/** A new stanza choice: the place stays when its line is still sung, else goes on to the next one sung. */
const chosen = (state: State, stanza: number): State => {
  const { held } = state;
  if (held === undefined) return state;
  const key = `${held.track.number}`;
  const choice = held.track.score.toggle(choiceOf(state, held.track.number), stanza);
  const next = { ...state, choices: { ...state.choices, [key]: choice } };
  const movable = seekable(next);
  if (movable === undefined || movable.phase === 'ended' || movable.drag !== undefined) return next;
  return across(next, movable, movable.at);
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
    case 'retry': {
      const { held } = state;
      if (held?.phase === 'buffering' && held.waited) return loaded(state, held.track, held.at);
      return held?.phase === 'failed' ? resume(state) : state;
    }
    case 'chooseStanza':
      return chosen(state, input.stanza);
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
      return seeking(state, input);
  }
};

/** A device event that follows seek `serial` of the held load: one from before the last seek is inert. */
const current = (held: Held, serial: number) => serial === held.seek;

/** The held hymn after a `time` of `seconds`: held while a sent place is not yet reached, else the device's. */
const timed = (held: Held, seconds: number): Held => {
  if (held.holding && !reached(seconds, held.sought)) return held;
  const at = held.holding ? seconds : Math.max(held.at, seconds);
  return {
    ...held,
    holding: false,
    at: held.length > 0 ? Math.min(Math.max(at, 0), held.length) : Math.max(at, 0),
  };
};

/** While the held hymn sounds, a place in a span its choice leaves out is sought across. */
const skipping = (state: State, at: number): State => {
  const { held } = state;
  if (held === undefined || !sounding(held) || held.wants !== 'play' || held.holding) return state;
  if (seekable(state) === undefined) return state;
  return across(state, held, at);
};

const device = (state: State, input: Input): State => {
  switch (input._tag) {
    case 'loaded':
      return onLoad(state, input.id, (held) => {
        if (!Number.isFinite(input.duration) || input.duration <= 0) return held;
        return { ...held, length: Math.max(input.duration, held.at) };
      });
    case 'time': {
      const { held } = state;
      if (
        held === undefined ||
        held.load !== input.id ||
        held.phase === 'failed' ||
        held.phase === 'ended' ||
        !current(held, input.serial) ||
        !Number.isFinite(input.seconds)
      )
        return state;
      const after = timed(held, input.seconds);
      return skipping({ ...state, held: after }, after.at);
    }
    case 'seeked':
    case 'settle':
      return onLoad(state, input.id, (held) =>
        held.holding && current(held, input.serial) ? { ...held, holding: false } : held,
      );
    case 'due': {
      const { held } = state;
      if (
        held === undefined ||
        held.load !== input.id ||
        held.phase !== 'playing' ||
        !current(held, input.serial) ||
        !Number.isFinite(input.seconds) ||
        input.seconds < held.at ||
        input.seconds > held.at + LEAD
      )
        return state;
      return skipping(state, input.seconds);
    }
    case 'waiting':
      return onLoad(state, input.id, (held) =>
        held.phase === 'playing' ? { ...held, phase: 'buffering' } : held,
      );
    case 'waited':
      return onLoad(state, input.id, (held) =>
        held.phase === 'buffering' && held.wants === 'play' ? { ...held, waited: true } : held,
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
              holding: false,
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
      return unwaited(device(reader(state, input), input));
  }
};

/** A wait is over once the held hymn no longer buffers, or no longer wants to be heard. */
const unwaited = (state: State): State => {
  const { held } = state;
  if (held === undefined || !held.waited) return state;
  if (held.phase === 'buffering' && held.wants === 'play') return state;
  return { ...state, held: { ...held, waited: false } };
};

/** The inputs that seek only to cross a span the choice leaves out. */
const SKIPS: ReadonlySet<Input['_tag']> = new Set(['time', 'due', 'chooseStanza']);

/** The state after `input`, and the one command it gives the device, if any. */
export const step = (
  state: State,
  input: Input,
): { readonly state: State; readonly command: Command | undefined } => {
  const moved = { ...next(state, input), steps: state.steps + 1 };
  const command = commandOf(deviceOf(state), deviceOf(moved), SKIPS.has(input._tag));
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

/**
 * The inputs whose plays and pauses the element reports once: the
 * reader's, which it echoes, and the platform's told to the player apart
 * from the element (`remote`, `interrupted`), whose own report of the same
 * act is on its way.
 */
const READER: ReadonlySet<Input['_tag']> = new Set([
  'remote',
  'interrupted',
  'play',
  'pause',
  'resume',
  'stop',
  'retry',
  'chooseStanza',
  'openSheet',
  'closeSheet',
  'titlePressed',
  'dragStart',
  'dragTo',
  'dragEnd',
  'nudge',
  'seekTo',
  'stanzaPlace',
]);

/** The hymn page shown, when the stack's top (under the sheet, when it is up) is one. */
export const pageOf = (state: State): number | undefined => {
  const top = state.stack.at(-1) ?? '/';
  if (top === SHEET) return hymnOf(state.stack.at(-2) ?? '/');
  return hymnOf(top);
};

/** The held hymn's place (the bar's: a drag while one is held) and length in sung seconds, under its stanza choice. */
export const timesOf = (state: State): { readonly elapsed: number; readonly total: number } => {
  const { held } = state;
  if (held === undefined) return { elapsed: 0, total: 0 };
  return { elapsed: shownOf(state, held), total: totalOf(state, held) };
};

/** The next span the held hymn's choice leaves out that starts within `LEAD` of its place while it plays: its start, in the recording's seconds. */
export const skipAheadOf = (state: State): number | undefined => {
  const { held } = state;
  if (held === undefined || held.phase !== 'playing' || held.holding || held.wants !== 'play')
    return undefined;
  const span = skipsOf(state, held).find(
    (each) => each.from >= held.at && each.from - held.at <= LEAD,
  );
  return span?.from;
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
