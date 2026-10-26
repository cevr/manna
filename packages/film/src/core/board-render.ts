// What a Board render shows at a film second (`film render --board`): the
// animatic's shot there (`shotsOf`, the one rule for when a panel shows),
// dissolved into the next across its cut, each picture panel moving slowly
// over its hold, and the line a review copy burns in. A picture panel's
// motion is a pure function of its id, so the same panel moves the same way
// on every render; a card (a text panel, a beat with no panel) holds still.
// Its times are whole ticks of the Board's clock (`BoardClock`), so a frame
// moved by whole frames with its shots works out the same numbers.
// Pure:the page paints what this decides (`canvas/board.ts`, `boardFilm`).

import { Array as Arr, Boolean as Bool, Data, Option, Predicate } from 'effect';
import { type BoardFile, shownTry } from './board.ts';
import { RenderVariantName } from './catalogue.ts';
import type { Placed } from './layout.ts';
import { Shot, shotsOf } from './animatic.ts';
import { clockBeat, timedBeat } from './film-timeline.ts';
import { frameAtOrBefore, ticksAt } from './time.ts';

/** What a render's frames picture: the film's scenes, or its Board (`review`: with the burn-in). */
export type Picture = Data.TaggedEnum<{
  Scenes: {};
  Board: { readonly review: boolean };
}>;
export const Picture = Data.taggedEnum<Picture>();

/** The export page's query words for `picture`: none for the scenes, `board` (and `review`) for the Board. */
export const pictureParams = (picture: Picture): ReadonlyArray<string> =>
  Picture.$match(picture, {
    Scenes: () => [],
    Board: ({ review }) => ['board', ...Arr.filter(['review'], () => review)],
  });

/** The picture an export page's query asks for (`pictureParams`, read back). */
export const pictureOn = (params: URLSearchParams): Picture =>
  Bool.match(params.has('board'), {
    onTrue: () => Picture.Board({ review: params.has('review') }),
    onFalse: () => Picture.Scenes(),
  });

/** A Board render's catalogue variant when `--variant` names none: `board`, its review copy `board-review`. */
export const boardVariant = (review: boolean): RenderVariantName =>
  RenderVariantName.make(
    Bool.match(review, { onTrue: () => 'board-review', onFalse: () => 'board' }),
  );

/** Where a render page reads film `id`'s Board on its server (`tools/narration-route.ts`, `boardFile`). */
export const boardUrls = (id: string) => ({
  record: `/films/${encodeURIComponent(id)}/board.json`,
  image: (file: string) => `/films/${encodeURIComponent(id)}/board/${encodeURIComponent(file)}`,
});

/** How a shot moves across its hold. */
type Motion = Data.TaggedEnum<{
  /** A card: no motion. */
  Still: {};
  /** A slow push in, from the frame to `PUSH` larger. */
  PushIn: {};
  /** A gentle pan, `PAN` of the frame's width, rightward (`dir` 1) or leftward (-1). */
  Pan: { readonly dir: 1 | -1 };
}>;
const Motion = Data.taggedEnum<Motion>();

/** How much larger a push in ends than it starts. */
const PUSH = 0.06;
/** How far a pan travels, as a share of the frame's width. */
const PAN = 0.04;
/**
 * How much larger a pan holds its image: more than the `PAN` its travel
 * needs, so at either end of it the image still runs past the frame's edge
 * and no edge pixel, smoothed half clear, shows.
 */
const PAN_HOLD = 0.042;
/** How long a dissolve between two shots takes, centred on their cut (less for a short hold). */
const DISSOLVE_S = 0.5;

/** `id`'s FNV-1a hash: the same id, the same number, on every render. */
const hashOf = (id: string): number =>
  [...id].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0, 2166136261);

/** The picture panel motions, one picked by a panel id's hash. */
const MOVES: ReadonlyArray<Motion> = [
  Motion.PushIn(),
  Motion.Pan({ dir: 1 }),
  Motion.Pan({ dir: -1 }),
];

/** How `shot` moves: a picture panel by its id's hash, a card (a text panel, a beat with no panel) not at all. */
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

/** A shot's framing: its scale over the cover-fit frame, and its offset as a share of the frame's width. */
export interface Framing {
  readonly scale: number;
  readonly dx: number;
}

/** `motion`'s framing `p` (0 to 1) through its hold. A pan holds `PAN_HOLD` larger so its travel never shows an edge. */
const framingAt = (motion: Motion, p: number): Framing => {
  const k = Math.max(0, Math.min(1, p));
  return Motion.$match(motion, {
    Still: () => ({ scale: 1, dx: 0 }),
    PushIn: () => ({ scale: 1 + PUSH * k, dx: 0 }),
    Pan: ({ dir }) => ({ scale: 1 + PAN_HOLD, dx: dir * PAN * (k - 0.5) }),
  });
};

/** One shot as a frame draws it: how opaque, how it moves and where that has it now, and the tick its mark is said at. */
export interface Layer {
  readonly shot: Shot;
  readonly alpha: number;
  readonly motion: Motion;
  readonly framing: Framing;
  readonly mark: number;
}

/** A Board render's frame: the shot held there (`shown`), and its layers bottom first (two inside a dissolve). */
interface BoardFrame {
  readonly shown: Shot;
  readonly layers: ReadonlyArray<Layer>;
}

/**
 * A Board's shots (in play order) on its clock (`ticksAt`, core/time.ts) at
 * `fps`: the tick each starts at and its mark is said at, and the tick the
 * film ends at. Each is its beat's first frame in ticks plus its time into
 * the beat (`tickIn`), so a shot moved with its beat by whole frames moves by
 * exactly those frames' ticks. Every time a Board frame paints from is worked
 * out here in whole ticks, so a moved frame reads the very numbers it read
 * before, and paints what a segment key over those numbers (`shotsSeen`)
 * says it paints.
 */
interface BoardClock {
  readonly fps: number;
  readonly shots: ReadonlyArray<Shot>;
  /** Each shot's start, by index, in ticks. */
  readonly from: ReadonlyArray<number>;
  /** Each shot's mark (a beat's card, its start), by index, in ticks. */
  readonly mark: ReadonlyArray<number>;
  /** The film's end, in ticks. */
  readonly end: number;
}

/**
 * `shots` (in play order) of the beats `placed` (laid at `fps`), a film
 * `duration` seconds long, on a Board's clock.
 */
export const boardClock = (
  shots: ReadonlyArray<Shot>,
  placed: ReadonlyArray<Placed>,
  duration: number,
  fps: number,
): BoardClock => {
  const beats = new Map(placed.map((p) => [p.spec.id, p]));
  /** Film second `t` of beat `p` in ticks: its start's (its first frame's, laid at `fps`), plus its time into the beat. */
  const tickIn = (p: Option.Option<Placed>, t: number): number =>
    Option.match(p, {
      onNone: () => ticksAt(t, fps),
      onSome: (beat) => ticksAt(beat.start, fps) + ticksAt(t - beat.start, fps),
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

/** Where shot `i` starts, in ticks: the film's end after the last. */
const fromOf = (clock: BoardClock, i: number): number =>
  Option.getOrElse(Arr.get(clock.from, i), () => clock.end);

/** Half the dissolve at the cut into shot `i`, in ticks: at most half of either hold beside it, none before the first. */
const halfAt = (clock: BoardClock, i: number): number =>
  Bool.match(i <= 0 || i >= clock.shots.length, {
    onTrue: () => 0,
    onFalse: () => {
      const cut = fromOf(clock, i);
      const before = cut - fromOf(clock, i - 1);
      const after = fromOf(clock, i + 1) - cut;
      return Math.max(0, Math.min(ticksAt(DISSOLVE_S, clock.fps) / 2, before / 2, after / 2));
    },
  });

/** Shot `i` as a layer at tick `tick`: its motion through the span it is seen, its dissolves in and out within it. */
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

/**
 * The frame at tick `tick` of `clock`: the shot held there, alone, or
 * dissolving across the cut nearest it (the outgoing one under, the incoming
 * over it at the share of the dissolve passed). None for a film with no shot.
 */
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

/**
 * A shot as the frames of a span read it, in ticks: the shot, where it is
 * held from, where it is seen from and gone by (its dissolves in and out
 * included), which time its motion and its alpha across each dissolve, and
 * the motion itself.
 */
export interface ShotSeen {
  readonly shot: Shot;
  readonly shown: number;
  readonly mark: number;
  readonly seen: number;
  readonly gone: number;
  readonly motion: Motion;
}

/**
 * The shots of `clock` a Board frame between ticks `from` and `to` draws:
 * each whose seen span meets `[from, to)`, the first held from the film's
 * start. What a frame there paints of the Board (`boardFrameAt`) is a
 * function of these and its tick alone, so a key over them changes when such
 * a frame would.
 */
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

/** `board`'s shots on `placed`'s clock: the animatic's rule (`shotsOf`) over the beats as the studio's Board lane times them (`clockBeat`, `timedBeat`). */
export const boardShots = (placed: ReadonlyArray<Placed>, board: BoardFile): ReadonlyArray<Shot> =>
  shotsOf(
    placed.map((p) => timedBeat(clockBeat(p, false))),
    board,
  );

/** Film seconds as the burn-in says them: `m:ss.f`, the tenth cut down, never rounded up into the next second. */
const tenths = (T: number): string => {
  const t = frameAtOrBefore(Math.max(0, T), 10);
  const m = Math.floor(t / 600);
  const s = (t % 600) / 10;
  return `${m}:${s.toFixed(1).padStart(4, '0')}`;
};

/** What `shot` is named by in the burn-in: a panel and the try it shows, a card panel, or the beat's card. */
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

/**
 * The review copy's burn-in at `T` for `shot`, the one held there: the film
 * time, the beat, and the panel with its try (`0:41.3 · name · name.sets ·
 * try 5`), so a frame of a screen capture names where it is. `card` names a
 * full-screen card the film's scenes set over the shot.
 */
export const burnIn = (T: number, shot: Shot, card: boolean): string =>
  [
    tenths(T),
    shot.beat,
    Bool.match(card, { onTrue: () => 'card', onFalse: () => shotName(shot) }),
  ].join(' · ');
