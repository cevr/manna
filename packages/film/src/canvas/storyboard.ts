import type { SceneSpec } from './film.ts';
import { rectShape } from './ink.ts';
import { cutout } from './cutout.ts';
import { probePlate } from './probe.ts';
import { type TextStyle, block, wrap, write } from './type.ts';
import { progress } from '../core/time.ts';

const CARD = rectShape(360, 250, 1200, 520);
const BRIEF_WIDTH = 1080;
const BRIEF_HEIGHT = 340;

export interface CardType {
  readonly brief: string;
  readonly label: string;
}

const briefStyle = (ctx: CanvasRenderingContext2D, picture: string, family: string): TextStyle => {
  const at = (size: number): TextStyle => ({
    family,
    size,
    color: '#2a3440',
    leading: 1.35,
  });
  let size = 38;
  while (size > 20 && wrap(ctx, picture, BRIEF_WIDTH, at(size)).length * size * 1.35 > BRIEF_HEIGHT)
    size -= 2;
  return at(size);
};

export const storyboard = (
  id: string,
  picture: string,
  type: CardType,
): Omit<SceneSpec, 'id' | 'say'> => ({
  storyboard: true,
  enter: { kind: 'fade', dur: 0.4 },
  draw: (f) => {
    const { ctx } = f;
    const lift = progress(f.t, 0, 0.6);
    ctx.globalAlpha = lift;
    cutout(
      ctx,
      CARD,
      { color: '#fbf6ea', torn: 3, rim: 0, shadow: 0.6, grain: 0.3 },
      f.hand('card'),
    );
    probePlate(ctx, CARD, () => {
      write(
        ctx,
        `storyboard · ${id}`,
        420,
        330,
        { family: type.label, size: 28, weight: 600, color: '#b5533c', tracking: 0.08 },
        f.hand('id'),
      );
      block(
        ctx,
        picture,
        420,
        400,
        BRIEF_WIDTH,
        briefStyle(ctx, picture, type.brief),
        f.hand('brief'),
        {
          boil: 0.3,
        },
      );
    });
  },
});
