// What a Board panel paints on a canvas the film's size: a picture panel's
// try (`paintImage`: the image, covering the frame as the film's 16:9
// picture crops it), and a card or a verse panel set by the engine's own
// card code (`fullCard`, `verse`, in the film's card style: the words
// exactly as spoken, CRAFT rule 1; never lettering an image route drew).
// The Board's viewer sets its cards with it.
// A Board render (`boardFilm`) draws the whole film so: each frame the
// shots `core/board-render.ts` decides, a picture moving across its hold, a
// card set by the film's own code.

import { Array as Arr, Boolean as Bool, Data, Option, Predicate, Result } from 'effect';
import { type CardWord, cardWords, fullCard, verse } from './card.ts';
import type { Film, RenderOptions } from './film.ts';
import type { Hand } from './ink.ts';
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

/** A seed for a card's hands: the board's cards never boil, so one hand is all they need. */
const STILL_HAND = (key: string | number): Hand => ({
  boil: 0,
  seed: Predicate.isNumber(key) ? key : [...key].reduce((n, c) => n * 31 + c.charCodeAt(0), 7),
});

/** How long a verse panel's highlight takes to sweep its phrase, from its mark. */
const SWEEP_S = 1.2;

/**
 * Text panel `text` of beat `p`, in the film's card style, at a frame `t`
 * seconds into the beat and `since` seconds after its mark is said (each
 * from whole ticks, `beatTime`, `BoardClock`): a card's words rising in as
 * they are heard, a verse with its phrase swept. Why not, when the film
 * declares no card style or its words do not read (a mark its line lacks).
 */
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
      // A panel held from the beat's start sets its card from the line's first word: `start` is the board's, not a mark
      // the line says (a line that does mark a `{start}` keeps its own).
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

/** The board's paper: what a frame with no picture yet is painted on. */
const BOARD_PAPER = '#f3ede0';

/** A board image as a page decodes it. */
export type BoardImage = CanvasImageSource & { readonly width: number; readonly height: number };

/** `image` covering the `w` × `h` frame from its middle, `framing.scale` larger and `framing.dx` of the width across. */
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

/** The review copy's burn-in: small, on a dark plate, in the bottom-left corner. */
const BURN_IN = { font: '500 24px ui-monospace, Menlo, monospace', inset: 24, pad: 10, h: 38 };

const paintBurnIn = (ctx: CanvasRenderingContext2D, text: string, h: number) => {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.font = BURN_IN.font;
  ctx.textBaseline = 'middle';
  const top = h - BURN_IN.inset - BURN_IN.h;
  ctx.globalAlpha = 0.62;
  ctx.fillStyle = '#000000';
  ctx.fillRect(BURN_IN.inset, top, ctx.measureText(text).width + 2 * BURN_IN.pad, BURN_IN.h);
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#ffffff';
  ctx.fillText(text, BURN_IN.inset + BURN_IN.pad, top + BURN_IN.h / 2);
  ctx.restore();
};

/**
 * What a Board layer paints of its own (`boardFilm`): its text panel's card,
 * set from its beat's line, or its picture panel's try. A layer that paints
 * neither (a beat with no panel, a picture panel with no try yet) is the
 * film's own frame.
 */
type Painted = Data.TaggedEnum<{
  Text: {
    readonly id: string;
    readonly beat: string;
    readonly text: PanelText;
    readonly mark: string;
    /** The tick its mark is said at (`Layer.mark`). */
    readonly said: number;
  };
  Picture: { readonly image: BoardImage };
}>;
const Painted = Data.taggedEnum<Painted>();

/**
 * `film` drawn as its Board (`film render --board`): each frame the shot
 * the animatic holds there (`boardFrameAt`), dissolving into the next across
 * its cut. A picture panel is its kept try (of `images`, by file) covering
 * the frame as it moves; a card or verse panel is set by the film's card code
 * (`paintText`); a beat with no panel, a picture panel with no try yet, and
 * a full-screen card the film's scenes declare (`Film.cardAt`) are drawn by
 * the film itself (`Film.render`: its storyboard card, its card). No
 * captions: the narration's words are on its cards (CRAFT rule 1), the line
 * in the captions file beside the video. `review` burns in the time, the
 * beat and the panel with its try (`burnIn`).
 *
 * A frame whose layers are all panels painted here reads only its shots'
 * times, so it is not `filmTimed`; one the film draws, or a review copy's
 * (its burn-in says the film's seconds), is.
 */
export const boardFilm = (
  film: Film,
  board: BoardFile,
  images: ReadonlyMap<string, BoardImage>,
  review: boolean,
): Film => {
  const clock = boardClock(boardShots(film.placed, board), film.placed, film.duration, film.fps);
  const { width: w, height: h, fps } = film;
  /** Frame `T` on the Board's clock: whole ticks, so a frame moved by whole frames reads the same numbers. */
  const tickOf = (T: number) => ticksAt(T, fps);
  /** The film's own frame at `T`, its captions off. */
  const filmFrame = (ctx: CanvasRenderingContext2D, T: number, opts: RenderOptions) =>
    film.render(ctx, T, { ...opts, captions: false });
  /** Where a dissolve's incoming shot is drawn before it is laid over the outgoing one. */
  // Scratch only, made once and painted over whole each use: a frame's output depends on T alone.
  let over = Option.none<HTMLCanvasElement>();
  const overlay = (): HTMLCanvasElement =>
    Option.getOrElse(over, () => {
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      over = Option.some(c);
      return c;
    });

  /** What `layer` paints of its own (`Painted`); none where the film draws it. */
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
                  beatTime(p, T, fps),
                  secondsOfTicks(tickOf(T) - said, fps),
                ),
            },
          );
          // A card the engine cannot set fails the frame, and the render with it: never a card left blank.
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

  /**
   * Whether frame `T` reads the film's seconds (`Film.filmTimed`): the
   * burn-in says them, or the film draws the frame or a layer of it (a card
   * its scenes set there, no shot, a layer with nothing of its own to paint),
   * as `render` decides.
   */
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
