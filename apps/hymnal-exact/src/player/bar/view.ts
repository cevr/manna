/* oxlint-disable effect/noNullish, effect/noTernary -- Exact's data module cannot import effect (docs/exact.md), so no Option or Match: what is absent is undefined, as `step`'s state has it. */

/**
 * The bottom bar as the current app's `bar.ts` and `PlayerBar.tsx` draw it,
 * from the player's state alone: which hymn it shows (`dockedBar`), the
 * player's button for that hymn as the current `buttonsOf` gives it (its
 * kind, the name VoiceOver reads and its mark; a spinner, which asks
 * nothing, while it loads), and the seeker under the buttons while the
 * hymn sounds, with the time gone and the time left. `bar.model.test.ts`
 * holds it to the current app over generated play histories.
 */

import { clock } from '@manna/hymnal-app/player/time';

import { type Held, type Phase, type State, pageOf, sheetUp, sounding, timesOf } from '../step.ts';

/** How far the sounding bar stands over the resting one, in points: the current `bar.ts`'s `RISE` (88 less 56), the seeker's row. */
const RISE = 32;

/** What a bar's or page's button does: Play, Pause, Try again, or nothing. */
export type Toggle = 'play' | 'pause' | 'retry' | '';

/** The bar's button, as the current `button.ts` names its kinds; none for a hymn with no recording. */
type Kind = 'play' | 'pause' | 'again' | 'retry' | 'loading' | '';

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
  /** The player's button for the bar's hymn: its kind, the name VoiceOver reads it by, and its mark's symbol (none while it loads). */
  readonly kind: Kind;
  readonly label: string;
  readonly mark: string;
  /** The seeker shows under the buttons: the bar's hymn sounds. */
  readonly seeker: boolean;
  /** The seeker's time gone and time left (`−0:42`, `–:––` while the length is unknown). */
  readonly gone: string;
  readonly left: string;
  /** How far the bar stands over its resting height, in points: `RISE` while the seeker shows, else 0. The find bar rides it. */
  readonly rise: number;
  /** The place and length as the opener tells VoiceOver (`0:30 of 2:00`, the current `toldPlace`); empty while either is unknown. */
  readonly told: string;
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

/** What the button offers a hymn in `phase`: nothing for a hymn with no recording. */
export const toggleOf = (phase: Phase, why: Held['why']): Toggle => {
  if (phase === 'loading' || phase === 'playing' || phase === 'buffering') return 'pause';
  if (phase !== 'failed') return 'play';
  return why === 'missing' ? '' : 'retry';
};

/** The bar's button for a hymn in `phase`, as the current `buttonsOf` gives it. */
const kindOf = (phase: Phase, why: Held['why']): Kind => {
  if (phase === 'loading') return 'loading';
  if (phase === 'playing' || phase === 'buffering') return 'pause';
  if (phase === 'ended') return 'again';
  if (phase !== 'failed') return 'play';
  return why === 'missing' ? '' : 'retry';
};

/** The name VoiceOver reads the button for hymn `n` by, the current `buttonsOf`'s label. */
const labelOf = (kind: Kind, n: number): string => {
  if (kind === 'pause') return `Pause hymn ${n}`;
  if (kind === 'again') return `Play hymn ${n} again`;
  if (kind === 'retry') return `Retry hymn ${n}`;
  if (kind === 'loading') return `Loading hymn ${n}`;
  if (kind === 'play') return `Play hymn ${n}`;
  return '';
};

/** The SF Symbol a kind's mark draws, as the current `BarMark.ios.tsx`'s `symbolOf`; none for the spinner. */
const MARKS: Readonly<Record<Kind, string>> = {
  play: 'symbol:sf/play.fill',
  pause: 'symbol:sf/pause.fill',
  again: 'symbol:sf/arrow.counterclockwise',
  retry: 'symbol:sf/arrow.clockwise',
  loading: '',
  '': '',
};

const shownAs = (
  number: number,
  title: string,
  phase: Phase,
  why: Held['why'],
  page: number,
  times: { readonly elapsed: number; readonly total: number },
): BarView => {
  const kind = kindOf(phase, why);
  const seeker = phase === 'loading' || phase === 'playing' || phase === 'buffering';
  return {
    shown: true,
    number,
    title,
    phase,
    said: saidOf(phase, why),
    toggle: toggleOf(phase, why),
    page,
    kind,
    label: labelOf(kind, number),
    mark: MARKS[kind],
    seeker,
    gone: clock(times.elapsed),
    left: times.total > 0 ? `−${clock(Math.max(times.total - times.elapsed, 0))}` : '–:––',
    rise: seeker ? RISE : 0,
    told: toldOf(phase, times),
  };
};

/** The current `toldPlace`: a place while playing, buffering or paused, the whole length once ended, each with the length once known. */
const toldOf = (
  phase: Phase,
  { elapsed, total }: { readonly elapsed: number; readonly total: number },
): string => {
  if (total <= 0) return '';
  if (phase === 'ended') return `${clock(total)} of ${clock(total)}`;
  if (phase === 'playing' || phase === 'buffering' || phase === 'paused')
    return `${clock(elapsed)} of ${clock(total)}`;
  return '';
};

const hidden: BarView = {
  shown: false,
  number: 0,
  title: '',
  phase: 'none',
  said: '',
  toggle: '',
  page: 0,
  kind: '',
  label: '',
  mark: '',
  seeker: false,
  gone: '',
  left: '',
  rise: 0,
  told: '',
};

/**
 * The docked bar: hidden while the player holds no hymn. Over a hymn page
 * it shows the page's hymn (`titleOf` names it), as the player sees it,
 * unless another hymn is sounding: then that hymn, and the page's beside it.
 */
export const barOf = (state: State, titleOf: (number: number) => string): BarView => {
  const { held } = state;
  if (held === undefined) return hidden;
  const page = pageOf(state);
  const times = timesOf(state);
  const own = (beside: number) =>
    shownAs(held.track.number, held.track.title, held.phase, held.why, beside, times);
  if (page === undefined) return own(0);
  if (held.track.number !== page && sounding(held)) return own(page);
  if (held.track.number === page) return own(0);
  return shownAs(page, titleOf(page), 'none', '', 0, { elapsed: 0, total: 0 });
};

/** The bars' part of the view: the docked bar, the page's own, the page shown and its button. */
export const barsOf = (state: State, titleOf: (number: number) => string) => {
  const { held } = state;
  const page = pageOf(state);
  const bar = barOf(state, titleOf);
  const up = sheetUp(state);
  return {
    dock: bar.shown && !up,
    pageBar: held === undefined && page !== undefined && !up,
    onPage: page ?? 0,
    bar,
    /** The page's own bar's Play, by the name VoiceOver reads it. */
    pageLabel: page === undefined ? '' : labelOf('play', page),
    pageToggle:
      held !== undefined && page === held.track.number
        ? toggleOf(held.phase, held.why)
        : ('play' as const),
  };
};
