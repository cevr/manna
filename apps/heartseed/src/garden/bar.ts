/**
 * Move back a stage's own state, as Today's footer keeps it (`back.tsx`):
 * the control at rest, its ask, the ask kept, the verse moved or the step
 * back refused, and the rule each happening changes it by. Each ask is its
 * own object, and an answer lands only for the latest one.
 */

import { Option } from 'effect';

import { backOf, type BackAnswer, type BackAsk, type Stage } from '../garden';

/** Each stage as the ask and the moved line name it. */
export const NAMED: Readonly<Record<Stage, string>> = {
  seed: 'a seed',
  blade: 'a blade',
  ear: 'an ear',
  'full corn': 'full corn',
};

/** The control's state: at rest with no ask yet, asking `ask`, `ask` kept (at rest), `ask` moved the verse to `stage`, or `ask` was refused. */
export type Bar =
  | { readonly status: 'Idle' }
  | { readonly status: 'Asking'; readonly ask: BackAsk }
  | { readonly status: 'Kept'; readonly ask: BackAsk }
  | { readonly status: 'Moved'; readonly ask: BackAsk; readonly stage: Stage }
  | { readonly status: 'Refused'; readonly ask: BackAsk };

/** What happened to the control: its tap opening `ask`, the ask's `Keep`, or the garden's answer to `ask`. */
export type Happened =
  | { readonly type: 'opened'; readonly ask: BackAsk }
  | { readonly type: 'kept' }
  | { readonly type: 'answered'; readonly ask: BackAsk; readonly answer: BackAnswer };

export const IDLE: Bar = { status: 'Idle' };

/** The ask's words, for the verse of `reference` whose step back lands at `landing`. */
export const askLine = (reference: string, landing: Stage) =>
  `Move ${reference} back to ${NAMED[landing]}? It comes due again soon.`;

/** The line a step back that moved the verse to `stage` leaves. */
export const movedLine = (stage: Stage) => `Moved back to ${NAMED[stage]}.`;

/** The alert a refused step back of the verse of `reference` leaves. */
export const alertLine = (reference: string) => `${reference} was not moved back. Try again.`;

/** What Today's footer knows of the verse it shows when it offers Move back: whether a recital listens, is held or shown (`recital`), is done, whether Show all was taken on it, and whether a tap started it (the session's visit holds it). */
export interface BackOffer {
  readonly listening: boolean;
  readonly recital: boolean;
  readonly done: boolean;
  readonly shownAll: boolean;
  readonly visited: boolean;
}

/** Whether Today's footer offers Move back on a planted verse: at rest (no recital listening, held or done, no Show all on it) on a verse a tap started. */
export const offersBack = (at: BackOffer) =>
  !at.listening && !at.recital && !at.done && !at.shownAll && at.visited;

/** The state after `happened`: a tap opens a new ask, `Keep` drops the ask shown, and an answer lands whenever it answers the latest ask (kept or not), so the line or alert shown always says what the garden kept for it. */
export const barAfter = (bar: Bar, happened: Happened): Bar => {
  switch (happened.type) {
    case 'opened':
      return { status: 'Asking', ask: happened.ask };
    case 'kept':
      if (bar.status !== 'Asking') return bar;
      return { status: 'Kept', ask: bar.ask };
    case 'answered': {
      if (bar.status === 'Idle' || bar.ask !== happened.ask) return bar;
      const { ask } = happened;
      if (happened.answer === 'Failed') return { status: 'Refused', ask };
      return { status: 'Moved', ask, stage: Option.getOrElse(backOf(ask.from), () => ask.from) };
    }
  }
  happened satisfies never;
  return bar;
};
