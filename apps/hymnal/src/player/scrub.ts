import { Data, Duration, Effect, Fiber, Option } from 'effect';
import { useEffect, useRef, useState } from 'react';

import { clock } from './time';

export interface ScrubberProps {
  readonly at: number;
  readonly length: Option.Option<number>;
  readonly onSeek: (seconds: number) => void;
}

type Hand = Data.TaggedEnum<{
  Free: {};
  Pressed: { readonly by: number };
  Moving: { readonly by: Option.Option<number>; readonly from: number; readonly to: number };
}>;
const Hand = Data.taggedEnum<Hand>();

const holder: (hand: Hand) => Option.Option<number> = Hand.$match({
  Free: () => Option.none(),
  Pressed: ({ by }) => Option.some(by),
  Moving: ({ by }) => by,
});

export const useCommitAtRest = (scrub: ReturnType<typeof useScrub>, rest: Duration.Input) =>
  useEffect(() => {
    if (!scrub.dragging) return;
    const resting = Effect.runFork(
      Effect.sleep(rest).pipe(Effect.andThen(Effect.sync(scrub.release))),
    );
    return () => {
      Effect.runFork(Fiber.interrupt(resting));
    };
  }, [scrub.dragging, scrub.value]);

const settleFor = Duration.seconds(2);

const reached = (at: number, sent: number) => Math.abs(at - sent) < 1;

const second = Math.floor;

export const useScrub = (
  { at, length, onSeek }: ScrubberProps,
  settle: Duration.Input = settleFor,
) => {
  const [hand, setHand] = useState<Hand>(Hand.Free());
  const now = useRef(hand);
  const [sent, setSent] = useState(Option.none<number>());
  useEffect(() => {
    if (Option.exists(sent, (to) => reached(at, to))) setSent(Option.none());
  }, [at, sent]);
  useEffect(() => {
    if (Option.isNone(sent)) return;
    const waiting = Effect.runFork(
      Effect.sleep(settle).pipe(Effect.andThen(Effect.sync(() => setSent(Option.none())))),
    );
    return () => {
      Effect.runFork(Fiber.interrupt(waiting));
    };
  }, [sent]);
  const max = Option.getOrElse(length, () => 0);
  const resting = Option.getOrElse(sent, () => Math.min(Math.max(at, 0), max));
  const value = Hand.$match(hand, {
    Moving: ({ to }) => to,
    Pressed: () => resting,
    Free: () => resting,
  });
  const rest = useRef(resting);
  rest.current = resting;
  const shown = () =>
    Hand.$match(now.current, {
      Moving: ({ to }) => to,
      Pressed: () => rest.current,
      Free: () => rest.current,
    });

  const become = (next: Hand) => {
    now.current = next;
    setHand(next);
  };
  const send = (to: number) => {
    onSeek(to);
    rest.current = to;
    setSent(Option.some(to));
  };
  const drag = (to: number) =>
    become(
      Hand.Moving({
        by: holder(now.current),
        from: Hand.$match(now.current, {
          Moving: ({ from }) => from,
          Pressed: () => rest.current,
          Free: () => rest.current,
        }),
        to,
      }),
    );
  const step = (to: number) => {
    if (second(to) === second(shown())) return;
    send(to);
    const was = now.current;
    if (Hand.$is('Moving')(was)) become(Hand.Moving({ by: was.by, from: to, to }));
  };
  const holds = (pointer: number) => Option.contains(holder(now.current), pointer);
  const letGo = () => {
    const was = now.current;
    become(Hand.Free());
    if (Hand.$is('Moving')(was) && second(was.to) !== second(was.from)) send(was.to);
  };
  return {
    value,
    max,
    still: Option.isNone(length),
    dragging: Hand.$is('Moving')(hand),
    said: `${clock(value)} of ${clock(max)}`,
    press: (pointer: number) => {
      if (Hand.$is('Free')(now.current)) become(Hand.Pressed({ by: pointer }));
    },
    move: (to: number) => {
      if (Hand.$is('Free')(now.current)) step(to);
      else drag(to);
    },
    step,
    lift: (pointer: number) => {
      if (holds(pointer)) letGo();
    },
    drop: (pointer: number) => {
      if (holds(pointer)) become(Hand.Free());
    },
    change: drag,
    release: () => {
      if (Hand.$is('Moving')(now.current)) letGo();
    },
  };
};

export const placeAt = (x: number, width: number, max: number) =>
  Option.match(
    Option.liftPredicate(width, (measured) => measured > 0),
    {
      onNone: () => 0,
      onSome: (measured) => Math.min(Math.max(x / measured, 0), 1) * max,
    },
  );

export const NUDGE = 10;

export const nudged = (value: number, max: number, way: 1 | -1) =>
  Math.min(Math.max(value + way * NUDGE, 0), max);
