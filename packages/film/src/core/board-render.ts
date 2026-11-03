import { Array as Arr, Boolean as Bool, Data, Option, Order, Predicate } from 'effect';
import { type BoardFile, shownTry } from './board.ts';
import { RenderVariantName } from './catalogue.ts';
import { type Placed, beatTime } from './layout.ts';
import { Shot, shotsOf } from './animatic.ts';
import { clockBeat, timedBeat } from './film-timeline.ts';
import { CLOCK_EPSILON, TICKS_PER_FRAME, frameAtOrBefore, ticksAt } from './time.ts';

export type Picture = Data.TaggedEnum<{
  Scenes: { readonly review: boolean };
  Board: { readonly review: boolean };
}>;
export const Picture = Data.taggedEnum<Picture>();

export const pictureParams = (picture: Picture): ReadonlyArray<string> =>
  Picture.$match(picture, {
    Scenes: ({ review }) => Arr.filter(['review'], () => review),
    Board: ({ review }) => ['board', ...Arr.filter(['review'], () => review)],
  });

export const pictureOn = (params: URLSearchParams): Picture =>
  Bool.match(params.has('board'), {
    onTrue: () => Picture.Board({ review: params.has('review') }),
    onFalse: () => Picture.Scenes({ review: params.has('review') }),
  });

export const boardVariant = (review: boolean): RenderVariantName =>
  RenderVariantName.make(
    Bool.match(review, { onTrue: () => 'board-review', onFalse: () => 'board' }),
  );

export const pictureVariant = (picture: Picture): Option.Option<RenderVariantName> =>
  Picture.$match(picture, {
    Scenes: ({ review }) =>
      Option.map(
        Option.liftPredicate(review, (r) => r),
        () => RenderVariantName.make('review'),
      ),
    Board: ({ review }) => Option.some(boardVariant(review)),
  });

export const boardUrls = (id: string) => ({
  record: `/films/${encodeURIComponent(id)}/board.json`,
  image: (file: string) => `/films/${encodeURIComponent(id)}/board/${encodeURIComponent(file)}`,
});

type Motion = Data.TaggedEnum<{
  Still: {};
  PushIn: {};
  Pan: { readonly dir: 1 | -1 };
}>;
const Motion = Data.taggedEnum<Motion>();

const PUSH = 0.06;
const PAN = 0.04;
const PAN_HOLD = 0.042;
const DISSOLVE_S = 0.5;

const hashOf = (id: string): number =>
  [...id].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0, 2166136261);

const MOVES: ReadonlyArray<Motion> = [
  Motion.PushIn(),
  Motion.Pan({ dir: 1 }),
  Motion.Pan({ dir: -1 }),
];

const motionOf = (shot: Shot): Motion =>
  Shot.$match(shot, {
    Unboarded: () => Motion.Still(),
    Boarded: ({ panel }) =>
      Bool.match(Predicate.isUndefined(panel.text), {
        onTrue: () =>
          Option.getOrElse(Arr.get(MOVES, hashOf(panel.id) % MOVES.length), () => Motion.Still()),
        onFalse: () => Motion.Still(),
      }),
  });

export interface Framing {
  readonly scale: number;
  readonly dx: number;
}

const framingAt = (motion: Motion, p: number): Framing => {
  const k = Math.max(0, Math.min(1, p));
  return Motion.$match(motion, {
    Still: () => ({ scale: 1, dx: 0 }),
    PushIn: () => ({ scale: 1 + PUSH * k, dx: 0 }),
    Pan: ({ dir }) => ({ scale: 1 + PAN_HOLD, dx: dir * PAN * (k - 0.5) }),
  });
};

export interface Layer {
  readonly shot: Shot;
  readonly alpha: number;
  readonly motion: Motion;
  readonly framing: Framing;
  readonly mark: number;
}

interface BoardFrame {
  readonly shown: Shot;
  readonly layers: ReadonlyArray<Layer>;
}

interface BoardClock {
  readonly fps: number;
  readonly shots: ReadonlyArray<Shot>;
  readonly from: ReadonlyArray<number>;
  readonly mark: ReadonlyArray<number>;
  readonly end: number;
}

export const boardClock = (
  shots: ReadonlyArray<Shot>,
  placed: ReadonlyArray<Placed>,
  duration: number,
  fps: number,
): BoardClock => {
  const beats = new Map(placed.map((p) => [p.spec.id, p]));
  const tickIn = (p: Option.Option<Placed>, t: number): number =>
    Option.match(p, {
      onNone: () => ticksAt(t, fps),
      onSome: (beat) => beat.frame * TICKS_PER_FRAME + ticksAt(t - beat.start, fps),
    });
  return {
    fps,
    shots,
    from: shots.map((s) => tickIn(Option.fromUndefinedOr(beats.get(s.beat)), s.from)),
    mark: shots.map((s) =>
      tickIn(
        Option.fromUndefinedOr(beats.get(s.beat)),
        Shot.$match(s, { Unboarded: ({ from }) => from, Boarded: ({ at }) => at }),
      ),
    ),
    end: tickIn(Arr.last(placed), duration),
  };
};

const fromOf = (clock: BoardClock, i: number): number =>
  Option.getOrElse(Arr.get(clock.from, i), () => clock.end);

const halfAt = (clock: BoardClock, i: number): number =>
  Bool.match(i <= 0 || i >= clock.shots.length, {
    onTrue: () => 0,
    onFalse: () => {
      const cut = fromOf(clock, i);
      const before = cut - fromOf(clock, i - 1);
      const after = fromOf(clock, i + 1) - cut;
      return Math.max(0, Math.floor(Math.min(ticksAt(DISSOLVE_S, clock.fps), before, after) / 2));
    },
  });

const layerOf = (clock: BoardClock, i: number, tick: number, alpha: number): ReadonlyArray<Layer> =>
  Option.match(Arr.get(clock.shots, i), {
    onNone: () => [],
    onSome: (shot) => {
      const seen = fromOf(clock, i) - halfAt(clock, i);
      const gone = fromOf(clock, i + 1) + halfAt(clock, i + 1);
      const p = Bool.match(gone > seen, {
        onTrue: () => (tick - seen) / (gone - seen),
        onFalse: () => 0,
      });
      const motion = motionOf(shot);
      const mark = Option.getOrElse(Arr.get(clock.mark, i), () => seen);
      return [{ shot, alpha, motion, framing: framingAt(motion, p), mark }];
    },
  });

export const boardFrameAt = (clock: BoardClock, tick: number): Option.Option<BoardFrame> => {
  const i = Option.getOrElse(
    Arr.findLastIndex(clock.from, (from) => from <= tick),
    () => 0,
  );
  return Option.map(Arr.get(clock.shots, i), (shown): BoardFrame => {
    const next = halfAt(clock, i + 1);
    const cutNext = fromOf(clock, i + 1);
    const last = halfAt(clock, i);
    const cutLast = fromOf(clock, i);
    if (next > 0 && tick >= cutNext - next)
      return {
        shown,
        layers: [
          ...layerOf(clock, i, tick, 1),
          ...layerOf(clock, i + 1, tick, (tick - (cutNext - next)) / (2 * next)),
        ],
      };
    if (last > 0 && tick < cutLast + last)
      return {
        shown,
        layers: [
          ...layerOf(clock, i - 1, tick, 1),
          ...layerOf(clock, i, tick, (tick - (cutLast - last)) / (2 * last)),
        ],
      };
    return { shown, layers: layerOf(clock, i, tick, 1) };
  });
};

export interface ShotSeen {
  readonly shot: Shot;
  readonly shown: number;
  readonly mark: number;
  readonly seen: number;
  readonly gone: number;
  readonly motion: Motion;
}

export const shotsSeen = (clock: BoardClock, from: number, to: number): ReadonlyArray<ShotSeen> =>
  clock.shots.flatMap((shot, i) => {
    const seen = fromOf(clock, i) - halfAt(clock, i);
    const gone = fromOf(clock, i + 1) + halfAt(clock, i + 1);
    const meets = (i === 0 || seen < to) && gone > from;
    return Arr.filter(
      [
        {
          shot,
          shown: fromOf(clock, i),
          mark: Option.getOrElse(Arr.get(clock.mark, i), () => seen),
          seen,
          gone,
          motion: motionOf(shot),
        },
      ],
      () => meets,
    );
  });

export const boardShots = (placed: ReadonlyArray<Placed>, board: BoardFile): ReadonlyArray<Shot> =>
  shotsOf(
    placed.map((p) => timedBeat(clockBeat(p, false))),
    board,
  );

const tenths = (T: number): string => {
  const t = frameAtOrBefore(Math.max(0, T), 10);
  const m = Math.floor(t / 600);
  const s = (t % 600) / 10;
  return `${m}:${s.toFixed(1).padStart(4, '0')}`;
};

const shotName = (shot: Shot): string =>
  Shot.$match(shot, {
    Boarded: ({ panel }) =>
      Bool.match(Predicate.isUndefined(panel.text), {
        onTrue: () =>
          Option.match(shownTry(panel), {
            onNone: () => `${panel.id} · no try`,
            onSome: (t) => `${panel.id} · try ${t.n}`,
          }),
        onFalse: () => `${panel.id} · card`,
      }),
    Unboarded: () => 'card',
  });

export const burnIn = (T: number, shot: Shot, card: boolean): string =>
  [
    tenths(T),
    shot.beat,
    Bool.match(card, { onTrue: () => 'card', onFalse: () => shotName(shot) }),
  ].join(' · ');

const markPassed = (p: Placed, t: number): string =>
  Option.match(
    Arr.last(
      Arr.sortWith(
        Arr.filter([...p.voice.marks], ([, at]) => p.speechStart + at <= t + CLOCK_EPSILON),
        ([, at]) => at,
        Order.Number,
      ),
    ),
    { onNone: () => 'start', onSome: ([name]) => name },
  );

export const scenesBurnIn = (T: number, p: Placed, card: boolean): string =>
  [
    tenths(T),
    p.spec.id,
    Bool.match(card, { onTrue: () => 'card', onFalse: () => markPassed(p, beatTime(p, T)) }),
  ].join(' · ');
