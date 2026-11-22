/* oxlint-disable effect/noNullish, effect/noTernary, effect/noKnownValueWidening, eslint/complexity -- Exact's data module cannot import effect (docs/exact.md), so no Option or Match: what is absent is undefined, as Exact's option is null on the wire; `viewOf` is one record of every field the view reads, each chosen plainly. */

/**
 * What the player shows, from its state alone: the device's element (its
 * source, load and whether it is paused), the docked bar, the hymn page's
 * own Play, the full player and the system's Now Playing. The bar's part
 * is `bar/view.ts`'s.
 */

import { captionOf } from '@manna/hymnal-app/player/caption';
import {
  DEFAULT_TEMPO,
  beatOf,
  bpmAt,
  bpmOf,
  saidOf as percentOf,
  STOPS,
  stopAt,
  stopIndexOf,
} from '@manna/hymnal-app/player/tempo';
import { clock } from '@manna/hymnal-app/player/time';

import { TEMPO_PLACES } from '../tempo/places.ts';
import { type BarView, type Toggle, barsOf, saidOf, toggleOf } from './bar/view.ts';
import type { Choice } from './score.ts';
import {
  type Command,
  type Go,
  type Held,
  type Phase,
  type State,
  choiceOf,
  countingOf,
  deviceOf,
  rateFor,
  sessionOf,
  skipAheadOf,
  tempoOf,
  timesOf,
} from './step.ts';

/** The tempo dial of the held hymn, as the current `TempoDial.tsx` reads it out. */
const tempoView = (state: State): PlayerView['tempo'] => {
  const { held } = state;
  const percent = held === undefined ? DEFAULT_TEMPO : tempoOf(state, held.track.number);
  const first = held?.track.score.tempo;
  const beat = first === undefined ? undefined : beatOf(first);
  const bpm = first === undefined ? 0 : bpmAt(bpmOf(first), percent);
  const note = beat?.note ?? 4;
  return {
    at: stopIndexOf(percent),
    percent,
    said: percentOf(percent),
    away: percent !== DEFAULT_TEMPO,
    stops: STOPS.map((stop, at) => ({ at, percent: stop })),
    places: TEMPO_PLACES,
    timed: beat !== undefined,
    bpmSaid: beat === undefined ? '' : `${beat.name} = ${bpm}`,
    bpm,
    note,
    dotted: beat?.dotted ?? false,
    open: note <= 2,
    stem: note >= 2,
    flags: Array.from({ length: FLAGS[note] ?? 0 }, (_, flag) => flag),
  };
};

/** Flags on a note's stem, by the denominator that writes it, as the current `TempoDial.tsx`'s `FLAGS`. */
const FLAGS: Readonly<Record<number, number>> = { 8: 1, 16: 2 };

/** The count-in as the current `scoreClock`'s `beatAt` and `toNextBeat` read it, in the host's ms. */
const countView = (state: State): PlayerView['count'] => {
  const { held } = state;
  const count = held?.count;
  if (held === undefined || count === undefined || !countingOf(state, held))
    return { on: false, beats: 0, beat: 0, left: 0, next: 0 };
  const rate = rateFor(state, held.track.number);
  const slack = 1e-6 * rate;
  const index = count.beats - Math.ceil((count.left - slack) / count.beatMs);
  const beat = Math.min(Math.max(index, 0), count.beats - 1);
  return {
    on: true,
    beats: count.beats,
    beat,
    left: count.left / rate,
    next: (count.left - (count.beats - beat - 1) * count.beatMs) / rate,
  };
};

export interface Chip {
  readonly stanza: number;
  readonly chosen: boolean;
}

export interface PlayerView {
  /** How many steps the data module has taken: the latest of two answers is the one with more. */
  readonly serial: number;
  /** The element's source; empty while the device holds nothing. */
  readonly src: string;
  /** The device's load, or the silent clock's while it holds the place; 0 for none. */
  readonly load: number;
  readonly from: number;
  readonly paused: boolean;
  readonly held: boolean;
  readonly number: number;
  readonly title: string;
  readonly phase: Phase;
  readonly said: string;
  /** The full player's line under its title (`captionAt`); empty while nothing is held. */
  readonly caption: string;
  readonly toggle: Toggle;
  /** The place the position bar shows (a drag while one is held) and the length, in sung seconds, and as a clock reads them. */
  readonly at: number;
  readonly length: number;
  readonly elapsed: string;
  readonly total: string;
  /** The device's last seek: its serial (0 for none) and where it sent the device, in the recording's seconds. */
  readonly seek: number;
  readonly seekTo: number;
  /** A sent place is held: the settle's timer runs. */
  readonly holding: boolean;
  /** The reader holds the position bar. */
  readonly dragging: boolean;
  /** The place in the recording's seconds, as the device last told it. */
  readonly place: number;
  /** The start of a span the choice leaves out within a tick or so of the place, in the recording's seconds; -1 for none. */
  readonly skipAt: number;
  /** The silent clock plays: the contract's `playerClock` ticks it, under `load`. */
  readonly ticking: boolean;
  /** The bar is docked: it shows, and no sheet is up over the stack. */
  readonly dock: boolean;
  /**
   * The hymn page shown draws the bar as its own (the current app's
   * `pageBar`): the player holds no hymn, a hymn page is on top and no sheet
   * is up over it. Its button plays the page's hymn.
   */
  readonly pageBar: boolean;
  /** The hymn page shown, under a sheet too; 0 off a hymn page. The bar names its hymn only when it is not this one. */
  readonly onPage: number;
  readonly bar: BarView;
  /** The page's own bar's Play, by the name VoiceOver reads it. */
  readonly pageLabel: string;
  /** The hymn page shown's own button: Pause while its hymn sounds, else what the player offers it. */
  readonly pageToggle: Toggle;
  readonly chips: Array<Chip>;
  /** The stanzas a press can seek to the start of: those the choice sings, with a timed place. */
  readonly places: Array<number>;
  readonly session: {
    readonly title: string;
    readonly artist: string;
    readonly duration: number;
    readonly playing: boolean;
  };
  readonly go: Go;
  /** Every stanza choice and tempo, as kept between launches (`encodeKept`). */
  readonly kept: string;
  /** The rate the device plays at: the held hymn's tempo; 1 while nothing is held. */
  readonly rate: number;
  /** A choice is made: the `All` chip shows. */
  readonly some: boolean;
  /** The held hymn's tempo dial: its stop's place, its percent read out, and whether it is off 100 %. */
  readonly tempo: {
    readonly at: number;
    readonly percent: number;
    readonly said: string;
    readonly away: boolean;
    /** The dial's stops, each its place on the row and its percent. */
    readonly stops: Array<{ readonly at: number; readonly percent: number }>;
    /** The dial's measures (`TEMPO_PLACES`). */
    readonly places: typeof TEMPO_PLACES;
    /** The hymn is timed: its bpm read-out and `Tap` show. */
    readonly timed: boolean;
    /** The read-out as VoiceOver reads it, `<beat> = <bpm>`, and its parts as drawn. */
    readonly bpmSaid: string;
    readonly bpm: number;
    /** The beat's note: its denominator, dotted or not, an open head (a half or whole), a stem (all but the whole), a flag per eighth's halving. */
    readonly note: number;
    readonly dotted: boolean;
    readonly open: boolean;
    readonly stem: boolean;
    readonly flags: Array<number>;
  };
  /** The silent clock's count-in while it counts: its beats, the beat reached from 0, the host's ms left and to the next beat. */
  readonly count: {
    readonly on: boolean;
    readonly beats: number;
    readonly beat: number;
    readonly left: number;
    readonly next: number;
  };
  /** The recording plays in the printed key: the key its play asked for has none (`recording-key-fallback`). */
  readonly fellBack: boolean;
  /** The key the recording plays in, in semitones from the printed key's: the heard key, or 0 once it fell back. */
  readonly offset: number;
  /** The command the step gave the device, for a test to read. */
  readonly command: string;
}

/** The current app's player state each phase but a failure's is drawn as, for its caption. */
const CAPTIONED = {
  none: 'Idle',
  loading: 'Loading',
  playing: 'Playing',
  buffering: 'Buffering',
  paused: 'Paused',
  ended: 'Ended',
} as const;

/**
 * The line under the full player's title: the current app's `captionOf`
 * for the state it would be in, and for a hymn with no recording, which
 * the current app never holds, what `saidOf` says.
 */
const captionAt = (phase: Phase, why: Held['why']): string => {
  if (phase !== 'failed') return captionOf({ _tag: CAPTIONED[phase] });
  if (why === 'missing') return saidOf(phase, why);
  return captionOf({ _tag: 'Failed', offline: why === 'network' });
};

/** Stanza choices as kept: `n:1.3` for each hymn with a choice, `,` between them. */
export const encodeChoices = (choices: Readonly<Record<string, Choice>>): string =>
  Object.entries(choices)
    .filter(([, choice]) => choice.length > 0)
    .map(([number, choice]) => `${number}:${choice.join('.')}`)
    .join(',');

/** Tempos as kept: `n@80` for each hymn off 100 %, `,` between them, after the choices. */
export const encodeKept = (state: State): string =>
  [
    encodeChoices(state.choices),
    ...Object.entries(state.tempos)
      .filter(([, tempo]) => tempo !== DEFAULT_TEMPO)
      .map(([number, tempo]) => `${number}@${tempo}`),
  ]
    .filter((part) => part !== '')
    .join(',');

/** Kept tempos read back, each on the dial's stops as the current `tempo.<n>` setting decodes it: one off them reads 100. */
export const decodeTempos = (text: string): Readonly<Record<string, number>> => {
  const tempos: Record<string, number> = {};
  for (const part of text.split(',')) {
    const found = /^([1-9]\d{0,2})@(\d{1,3})$/u.exec(part);
    if (found === null) continue;
    tempos[found[1] ?? ''] = stopAt(stopIndexOf(Number(found[2])));
  }
  return tempos;
};

/** Kept choices read back: anything `encodeChoices` would not write is left out. */
export const decodeChoices = (text: string): Readonly<Record<string, Choice>> => {
  const choices: Record<string, Choice> = {};
  for (const part of text.split(',')) {
    const found = /^([1-9]\d{0,2}):([1-9]\d?(?:\.[1-9]\d?)*)$/u.exec(part);
    if (found === null) continue;
    const stanzas = (found[2] ?? '').split('.').map(Number);
    if (stanzas.every((n, i) => i === 0 || n > (stanzas[i - 1] ?? 0)))
      choices[found[1] ?? ''] = stanzas;
  }
  return choices;
};

const commandText = (command: Command | undefined): string => {
  if (command === undefined) return '';
  if (command._tag === 'load') return `load ${command.id}`;
  if (command._tag === 'seek') return command.skip ? 'skip' : 'seek';
  return command._tag;
};

/** The seek's part of the view: the device's last seek, the hold, the drag, and the stanzas with a place. */
const seekView = (state: State, chosen: ReadonlyArray<number>) => {
  const { held } = state;
  const device = deviceOf(state);
  const score = held?.track.score;
  const choice = held === undefined ? [] : choiceOf(state, held.track.number);
  return {
    seek: device?.seek ?? 0,
    seekTo: device?.to ?? 0,
    holding: held?.holding ?? false,
    dragging: held?.drag !== undefined,
    place: held?.at ?? 0,
    skipAt: skipAheadOf(state) ?? -1,
    ticking: held?.silent === true && held.phase === 'playing',
    places:
      score === undefined || held === undefined || held.length <= 0
        ? []
        : chosen.filter((stanza) => score.stanzaAt(choice, stanza) !== undefined),
  };
};

/** The tempo's part of the view: the rate, the dial, the count-in, the key the recording plays in, and whether a choice is made. */
const pace = (state: State, choice: Choice) => {
  const { held } = state;
  return {
    rate: held === undefined ? 1 : rateFor(state, held.track.number),
    some: choice.length > 0,
    tempo: tempoView(state),
    count: countView(state),
    fellBack: held !== undefined && held.offset !== held.heard,
    offset: held?.heard ?? 0,
  };
};

/** The view of `state`, after the step that gave `command`. */
export const viewOf = (
  state: State,
  command: Command | undefined,
  titleOf: (number: number) => string,
): PlayerView => {
  const { held } = state;
  const device = deviceOf(state);
  const session = sessionOf(state);
  const { elapsed, total } = timesOf(state);
  const score = held?.track.score;
  const choice = held === undefined ? [] : choiceOf(state, held.track.number);
  const chosen = score?.chosen(choice) ?? [];
  return {
    serial: state.steps,
    src: device?.url ?? '',
    load: device?.load ?? (held?.silent === true ? held.load : 0),
    from: device?.from ?? 0,
    paused: device?.paused ?? true,
    held: held !== undefined,
    number: held?.track.number ?? 0,
    title: held?.track.title ?? '',
    phase: held?.phase ?? 'none',
    said: held === undefined ? '' : saidOf(held.phase, held.why),
    caption: held === undefined ? '' : captionAt(held.phase, held.why),
    toggle: held === undefined ? '' : toggleOf(held.phase, held.why),
    at: elapsed,
    length: total,
    elapsed: clock(elapsed),
    total: total > 0 ? clock(total) : '–:––',
    ...seekView(state, chosen),
    ...barsOf(state, titleOf),
    chips: Array.from({ length: score?.count ?? 0 }, (_, index) => ({
      stanza: index + 1,
      chosen: chosen.includes(index + 1),
    })),
    session: {
      title: session?.title ?? '',
      artist: session === undefined ? '' : `Hymn ${session.number}`,
      duration: session?.duration ?? 0,
      playing: session?.playing ?? false,
    },
    go: state.go,
    kept: encodeKept(state),
    command: commandText(command),
    ...pace(state, choice),
  };
};
