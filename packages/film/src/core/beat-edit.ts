import { Array as Arr, Boolean as Bool, Option, Result } from 'effect';
import { membersOf } from './acts.ts';
import { DEFAULT_TAIL, MIN_LEAD, beatLength } from './layout.ts';
import { onTheMs } from './time.ts';
import type { BeatHold } from './timeline-schema.ts';

export type HoldEdge = 'lead' | 'tail';

const HOLD_STEP = 0.1;

const MAX_HOLD = 30;

export type MovedBefore = Option.Option<string>;

export interface PartOn {
  readonly from: string;
  readonly name: string;
}

export const movedOrder = (
  ids: ReadonlyArray<string>,
  beat: string,
  before: MovedBefore,
  parts: ReadonlyArray<ReadonlyArray<PartOn>> = [],
): Result.Result<ReadonlyArray<string>, string> => {
  const at = ids.indexOf(beat);
  if (at < 0) return Result.fail(`the script has no beat "${beat}"`);
  const rest = ids.filter((id) => id !== beat);
  const to = Option.match(before, {
    onNone: () => Result.succeed(rest.length),
    onSome: (b) =>
      Bool.match(b === beat, {
        onTrue: () => Result.fail(`"${beat}" cannot go before itself`),
        onFalse: () =>
          Bool.match(rest.includes(b), {
            onTrue: () => Result.succeed(rest.indexOf(b)),
            onFalse: () => Result.fail(`the script has no beat "${b}"`),
          }),
      }),
  });
  return Result.flatMap(to, (index) => {
    if (index === at) return Result.fail(`"${beat}" is already there`);
    const moved = [...rest.slice(0, index), beat, ...rest.slice(index)];
    return Result.mapBoth(Result.all(parts.map((list) => membersOf(list, moved))), {
      onFailure: (e) => `the move would break the film's parts: ${e.message}`,
      onSuccess: () => moved,
    });
  });
};

const FLOOR = { lead: MIN_LEAD, tail: DEFAULT_TAIL } satisfies Record<HoldEdge, number>;

const SIDE = { lead: 'before', tail: 'after' } satisfies Record<HoldEdge, string>;

const holdFloor = (edge: HoldEdge, now: number): number => Math.min(FLOOR[edge], onTheMs(now));

export const heldWithin = (edge: HoldEdge, asked: number, now: number): number => {
  const floor = holdFloor(edge, now);
  if (onTheMs(asked) <= floor) return floor;
  const snapped = onTheMs(Math.round(asked / HOLD_STEP) * HOLD_STEP);
  return onTheMs(Math.min(MAX_HOLD, Math.max(floor, snapped)));
};

export const holdWritten = (edge: HoldEdge, value: number): Option.Option<number> =>
  Option.liftPredicate(onTheMs(value), (v) => edge === 'lead' || v !== DEFAULT_TAIL);

interface HeldBeat {
  readonly beat: string;
  readonly dur: number;
  readonly speech?: { readonly start: number; readonly end: number };
  readonly hold: BeatHold;
}

const wordsOf = (b: HeldBeat): number =>
  Option.match(Option.fromUndefinedOr(b.speech), {
    onNone: () => 0,
    onSome: (s) => onTheMs(s.end - s.start),
  });

interface Held {
  readonly dur: number;
  readonly hold: BeatHold;
}

export const heldTo = (b: HeldBeat, edge: HoldEdge, to: number): Held => {
  const words = wordsOf(b);
  const lead = Bool.match(edge === 'lead' && words > 0, {
    onTrue: () => to,
    onFalse: () => b.hold.lead,
  });
  const asked = Bool.match(edge === 'tail', { onTrue: () => to, onFalse: () => b.hold.asked });
  const dur = onTheMs(beatLength({ words, lead, tail: asked, min: b.hold.min }));
  return {
    dur,
    hold: {
      ...b.hold,
      lead,
      asked,
      tail: Bool.match(words > 0, {
        onTrue: () => onTheMs(dur - lead - words),
        onFalse: () => dur,
      }),
    },
  };
};

export const holdUnchanged = (b: HeldBeat, edge: HoldEdge, to: number): Option.Option<string> => {
  const words = wordsOf(b);
  if (words === 0)
    return Option.some(
      `${b.beat} has no words to hold: it lasts ${b.dur.toFixed(1)} s, ${Bool.match(
        b.hold.min > 0,
        {
          onTrue: () => 'as its min holds it',
          onFalse: () => 'as a beat with no words does',
        },
      )}`,
    );
  const absorbed =
    edge === 'tail' &&
    b.hold.min > 0 &&
    onTheMs(b.dur) === onTheMs(b.hold.min) &&
    heldTo(b, edge, to).dur === onTheMs(b.dur);
  const over = onTheMs(b.hold.min - b.hold.lead - words).toFixed(1);
  return Option.liftPredicate(
    `${b.beat} is held at ${b.hold.min.toFixed(1)} s by its min: only a tail over ${over} s lengthens it`,
    () => absorbed,
  );
};

interface Seam {
  readonly from: string;
  readonly to: string;
  readonly seconds: number;
}

export const seamsAround = (beats: ReadonlyArray<HeldBeat>, beat: string): ReadonlyArray<Seam> => {
  const at = beats.findIndex((b) => b.beat === beat);
  if (at < 0) return [];
  return [at - 1, at].flatMap((i) =>
    Option.match(
      Option.all([Arr.get(beats, i), Arr.get(beats, i + 1)]).pipe(
        Option.flatMap(([p, q]) =>
          Option.map(
            Option.all([Option.fromUndefinedOr(p.speech), Option.fromUndefinedOr(q.speech)]),
            ([ps, qs]) => ({ from: p.beat, to: q.beat, seconds: onTheMs(qs.start - ps.end) }),
          ),
        ),
      ),
      { onNone: () => [], onSome: (seam) => [seam] },
    ),
  );
};

export const movedWords = (beat: string, before: MovedBefore): string =>
  Option.match(before, {
    onNone: () => `Moved ${beat} to the end.`,
    onSome: (b) => `Moved ${beat} before ${b}.`,
  });

const signedSeconds = (s: number): string => {
  const shown = Math.abs(s).toFixed(1);
  return Bool.match(s < 0, { onTrue: () => `−${shown} s`, onFalse: () => `+${shown} s` });
};

export const heldWords = (beat: string, edge: HoldEdge, from: number, to: number): string =>
  `Held ${beat} ${signedSeconds(to - from)} ${SIDE[edge]} its words.`;

export const heldAlready = (beat: string, edge: HoldEdge, value: number): string =>
  `${beat} already holds ${value.toFixed(1)} s ${SIDE[edge]} its words.`;

export const undone = (words: string): string => `Undone: ${words}`;

export const AGENTS_AFTER = 'Agents re-time and re-check.';

export const workFiled = (said: string): string => `${said} Re-time, re-check seams, re-render.`;
