import { Array as Arr, Boolean as Bool, Data, Option, Predicate, Result } from 'effect';
import { type CardWord, cardWords, fullCard, verse } from './card.ts';
import type { Film, RenderOptions } from './film.ts';
import type { Hand } from './ink.ts';
import { paintBurnIn } from './review.ts';
import { type BoardFile, PANEL_START, type PanelText, shownTry } from '../core/board.ts';
import { Shot } from '../core/animatic.ts';
import {
  type Framing,
  type Layer,
  boardClock,
  boardFrameAt,
  boardShots,
  burnIn,
} from '../core/board-render.ts';
import { type Placed, beatTime } from '../core/layout.ts';
import { secondsOfTicks, ticksAt } from '../core/time.ts';

const STILL_HAND = (key: string | number): Hand => ({
  boil: 0,
  seed: Predicate.isNumber(key) ? key : [...key].reduce((n, c) => n * 31 + c.charCodeAt(0), 7),
});

const SWEEP_S = 1.2;

const paintText = (
  ctx: CanvasRenderingContext2D,
  film: Film,
  p: Placed,
  text: PanelText,
  mark: string,
  t: number,
  since: number,
): Result.Result<void, string> => {
  const { width: w, height: h } = film;
  return Option.match(Option.fromUndefinedOr(film.look.card), {
    onNone: () => Result.fail(`${film.title} sets no card style (FilmSpec.card)`),
    onSome: (look) => {
      const voice = Bool.match(mark === PANEL_START && !p.voice.marks.has(PANEL_START), {
        onTrue: () => ({
          ...p.voice,
          marks: new Map([...p.voice.marks, [PANEL_START, Number.NEGATIVE_INFINITY]]),
        }),
        onFalse: () => p.voice,
      });
      if (text._tag === 'Card')
        return Result.map(
          cardWords(p.spec.id, voice, p.speechStart, {
            from: mark,
            payoff: text.payoff,
            ...Option.match(Option.fromUndefinedOr(text.to), {
              onNone: () => ({}),
              onSome: (to) => ({ to }),
            }),
          }),
          (words: ReadonlyArray<CardWord>) =>
            fullCard({ ctx, w, h, t, hand: STILL_HAND }, words, look.style),
        );
      return Option.match(Option.fromUndefinedOr(look.verse), {
        onNone: () => Result.fail(`${film.title} sets no verse style (FilmSpec.card.verse)`),
        onSome: (style) => {
          ctx.save();
          if (Predicate.isString(look.style.ground)) {
            ctx.fillStyle = look.style.ground;
            ctx.fillRect(0, 0, w, h);
          } else look.style.ground(ctx, w, h);
          verse(
            ctx,
            { text: text.text, phrase: text.phrase },
            style,
            { x: w * 0.14, y: h * 0.36, highlight: Math.max(0, Math.min(1, since / SWEEP_S)) },
            STILL_HAND('verse'),
          );
          ctx.restore();
          return Result.succeed(undefined);
        },
      });
    },
  });
};

const BOARD_PAPER = '#f3ede0';

export type BoardImage = CanvasImageSource & { readonly width: number; readonly height: number };

const paintFramed = (
  ctx: CanvasRenderingContext2D,
  image: BoardImage,
  w: number,
  h: number,
  framing: Framing,
) => {
  const scale = Math.max(w / image.width, h / image.height) * framing.scale;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingQuality = 'high';
  ctx.translate(w / 2 + framing.dx * w, h / 2);
  ctx.scale(scale, scale);
  ctx.drawImage(image, -image.width / 2, -image.height / 2);
  ctx.restore();
};

type Painted = Data.TaggedEnum<{
  Text: {
    readonly id: string;
    readonly beat: string;
    readonly text: PanelText;
    readonly mark: string;
    readonly said: number;
  };
  Picture: { readonly image: BoardImage };
}>;
const Painted = Data.taggedEnum<Painted>();

export const boardFilm = (
  film: Film,
  board: BoardFile,
  images: ReadonlyMap<string, BoardImage>,
  review: boolean,
): Film => {
  const clock = boardClock(boardShots(film.placed, board), film.placed, film.duration, film.fps);
  const { width: w, height: h, fps } = film;
  const tickOf = (T: number) => ticksAt(T, fps);
  const filmFrame = (ctx: CanvasRenderingContext2D, T: number, opts: RenderOptions) =>
    film.render(ctx, T, { ...opts, captions: false });
  let over = Option.none<HTMLCanvasElement>();
  const overlay = (): HTMLCanvasElement =>
    Option.getOrElse(over, () => {
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      over = Option.some(c);
      return c;
    });

  const paintedOf = (layer: Layer): Option.Option<Painted> =>
    Shot.$match(layer.shot, {
      Unboarded: () => Option.none(),
      Boarded: ({ beat, panel }) =>
        Option.match(Option.fromUndefinedOr(panel.text), {
          onSome: (text) =>
            Option.some(
              Painted.Text({ id: panel.id, beat, text, mark: panel.at, said: layer.mark }),
            ),
          onNone: () =>
            Option.map(
              Option.flatMap(shownTry(panel), (t) => Option.fromUndefinedOr(images.get(t.file))),
              (image) => Painted.Picture({ image }),
            ),
        }),
    });

  const paintLayer = (
    ctx: CanvasRenderingContext2D,
    layer: Layer,
    T: number,
    opts: RenderOptions,
  ): void =>
    Option.match(paintedOf(layer), {
      onNone: () => filmFrame(ctx, T, opts),
      onSome: Painted.$match({
        Text: ({ id, beat, text, mark, said }) => {
          ctx.save();
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.fillStyle = BOARD_PAPER;
          ctx.fillRect(0, 0, w, h);
          ctx.restore();
          const set = Option.match(
            Arr.findFirst(film.placed, (p) => p.spec.id === beat),
            {
              onNone: () => Result.fail(`${film.title} has no beat ${beat}`),
              onSome: (p) =>
                paintText(
                  ctx,
                  film,
                  p,
                  text,
                  mark,
                  beatTime(p, T),
                  secondsOfTicks(tickOf(T) - said, fps),
                ),
            },
          );
          Result.match(set, {
            onFailure: (why) => {
              throw new Error(`board panel ${id}: ${why}`);
            },
            onSuccess: () => undefined,
          });
        },
        Picture: ({ image }) => paintFramed(ctx, image, w, h, layer.framing),
      }),
    });

  const filmTimed = (T: number): boolean => {
    if (review || film.cardAt?.(T) === true) return true;
    return Option.match(boardFrameAt(clock, tickOf(T)), {
      onNone: () => true,
      onSome: (f) => f.layers.some((layer) => Option.isNone(paintedOf(layer))),
    });
  };

  const render = (ctx: CanvasRenderingContext2D, T: number, opts: RenderOptions = {}) => {
    const card = film.cardAt?.(T) === true;
    const frame = boardFrameAt(clock, tickOf(T));
    Bool.match(card || Option.isNone(frame), {
      onTrue: () => filmFrame(ctx, T, opts),
      onFalse: () => {
        const layers = Option.match(frame, { onNone: () => [], onSome: (f) => f.layers });
        for (const [k, layer] of layers.entries()) {
          if (k === 0) {
            paintLayer(ctx, layer, T, opts);
            continue;
          }
          const c = overlay();
          const octx = c.getContext('2d');
          if (octx === null) throw new Error('2d context unavailable');
          paintLayer(octx, layer, T, opts);
          ctx.save();
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.globalAlpha = layer.alpha;
          ctx.drawImage(c, 0, 0);
          ctx.restore();
        }
      },
    });
    if (review)
      for (const f of Option.toArray(frame)) paintBurnIn(ctx, burnIn(T, f.shown, card), h);
  };

  return { ...film, render, filmTimed };
};
