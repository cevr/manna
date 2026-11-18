/* oxlint-disable effect/noNullish, effect/noTernary, effect/noKnownValueWidening, eslint/complexity -- Exact's data module cannot import effect (docs/exact.md), so no Option or Match: what is absent is undefined, as Exact's option is null on the wire; `viewOf` is one record of every field the view reads, each chosen plainly. */

/**
 * What the player shows, from its state alone: the device's element (its
 * source, load and whether it is paused), the docked bar, the hymn page's
 * own Play, the full player and the system's Now Playing. The bar's rule is
 * the current app's (`bar.ts`'s `dockedBar`), written over this state and
 * held to it by `rules.test.ts`: docked while the player holds a hymn; on a
 * hymn page it acts on the page's hymn unless another hymn is sounding,
 * then it shows the sounding hymn and a compact Play for the page's.
 */

import { clock } from '@manna/hymnal-app/player/time';

import type { Choice } from './score.ts';
import {
  type Command,
  type Go,
  type Held,
  type Phase,
  type State,
  choiceOf,
  deviceOf,
  pageOf,
  sessionOf,
  sheetUp,
  skipAheadOf,
  sounding,
  timesOf,
} from './step.ts';

/** What a bar's or page's button does: Play, Pause, Try again, or nothing. */
export type Toggle = 'play' | 'pause' | 'retry' | '';

/** A hymn as the bar shows it: its number and title, and the player as that hymn sees it. */
export interface BarView {
  readonly shown: boolean;
  readonly number: number;
  readonly title: string;
  readonly phase: Phase;
  readonly said: string;
  readonly toggle: Toggle;
  /** The page's hymn, when another hymn sounds over it: the compact Play's; 0 when none. */
  readonly page: number;
}

export interface Chip {
  readonly stanza: number;
  readonly chosen: boolean;
}

export interface PlayerView {
  /** How many steps the data module has taken: the latest of two answers is the one with more. */
  readonly serial: number;
  /** The element's source; empty while the device holds nothing. */
  readonly src: string;
  readonly load: number;
  readonly from: number;
  readonly paused: boolean;
  readonly held: boolean;
  readonly number: number;
  readonly title: string;
  readonly phase: Phase;
  readonly said: string;
  /** The full player's line under its title (`captionOf`); empty while nothing is held. */
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
  /** Every stanza choice, as kept between launches (`encodeChoices`). */
  readonly kept: string;
  /** The command the step gave the device, for a test to read. */
  readonly command: string;
}

/** What the player says of a hymn in `phase` (failed for `why`). */
export const saidOf = (phase: Phase, why: Held['why']): string => {
  if (phase === 'loading' || phase === 'buffering') return 'Loading the recording…';
  if (phase === 'paused') return 'Paused';
  if (phase === 'ended') return 'Played to the end';
  if (phase !== 'failed') return '';
  if (why === 'network') return 'The recording needs a connection.';
  if (why === 'missing') return 'This hymn has no recording.';
  return 'The recording could not be played.';
};

/**
 * The line under the full player's title, as the current app's sheet says
 * it (`FullPlayer.tsx` `caption`): what `saidOf` says, `Playing` while the
 * hymn plays, and `Recording` before it has played.
 */
export const captionOf = (phase: Phase, why: Held['why']): string => {
  if (phase === 'playing') return 'Playing';
  return saidOf(phase, why) || 'Recording';
};

/** What the button offers a hymn in `phase`: nothing for a hymn with no recording. */
export const toggleOf = (phase: Phase, why: Held['why']): Toggle => {
  if (phase === 'loading' || phase === 'playing' || phase === 'buffering') return 'pause';
  if (phase !== 'failed') return 'play';
  return why === 'missing' ? '' : 'retry';
};

const hidden: BarView = {
  shown: false,
  number: 0,
  title: '',
  phase: 'none',
  said: '',
  toggle: '',
  page: 0,
};

/** The held hymn as the bar shows it, with the page's hymn beside it (0 for none). */
const heldBar = (held: Held, page: number): BarView => ({
  shown: true,
  number: held.track.number,
  title: held.track.title,
  phase: held.phase,
  said: saidOf(held.phase, held.why),
  toggle: toggleOf(held.phase, held.why),
  page,
});

/**
 * The docked bar: hidden while the player holds no hymn. Over a hymn page
 * it shows the page's hymn (`titleOf` names it), as the player sees it,
 * unless another hymn is sounding: then that hymn, and the page's beside it.
 */
export const barOf = (state: State, titleOf: (number: number) => string): BarView => {
  const { held } = state;
  if (held === undefined) return hidden;
  const page = pageOf(state);
  if (page === undefined) return heldBar(held, 0);
  if (held.track.number !== page && sounding(held)) return heldBar(held, page);
  if (held.track.number === page) return heldBar(held, 0);
  return { ...hidden, shown: true, number: page, title: titleOf(page), toggle: 'play' };
};

/** Stanza choices as kept: `n:1.3` for each hymn with a choice, `,` between them. */
export const encodeChoices = (choices: Readonly<Record<string, Choice>>): string =>
  Object.entries(choices)
    .filter(([, choice]) => choice.length > 0)
    .map(([number, choice]) => `${number}:${choice.join('.')}`)
    .join(',');

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
    places:
      score === undefined || held === undefined || held.length <= 0
        ? []
        : chosen.filter((stanza) => score.stanzaAt(choice, stanza) !== undefined),
  };
};

/** The bars' part of the view: the docked bar, the page's own, the page shown and its button. */
const barsView = (state: State, titleOf: (number: number) => string) => {
  const { held } = state;
  const page = pageOf(state);
  const bar = barOf(state, titleOf);
  const up = sheetUp(state);
  return {
    dock: bar.shown && !up,
    pageBar: held === undefined && page !== undefined && !up,
    onPage: page ?? 0,
    bar,
    pageToggle:
      held !== undefined && page === held.track.number
        ? toggleOf(held.phase, held.why)
        : ('play' as const),
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
    load: device?.load ?? 0,
    from: device?.from ?? 0,
    paused: device?.paused ?? true,
    held: held !== undefined,
    number: held?.track.number ?? 0,
    title: held?.track.title ?? '',
    phase: held?.phase ?? 'none',
    said: held === undefined ? '' : saidOf(held.phase, held.why),
    caption: held === undefined ? '' : captionOf(held.phase, held.why),
    toggle: held === undefined ? '' : toggleOf(held.phase, held.why),
    at: elapsed,
    length: total,
    elapsed: clock(elapsed),
    total: total > 0 ? clock(total) : '–:––',
    ...seekView(state, chosen),
    ...barsView(state, titleOf),
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
    kept: encodeChoices(state.choices),
    command: commandText(command),
  };
};
