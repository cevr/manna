import type { Film, RenderOptions } from './film.ts';
import { scenesBurnIn } from '../core/board-render.ts';

const BURN_IN = { font: '500 24px ui-monospace, Menlo, monospace', inset: 24, pad: 10, h: 38 };

export const paintBurnIn = (ctx: CanvasRenderingContext2D, text: string, h: number) => {
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

export const scenesReview = (film: Film): Film => ({
  ...film,
  filmTimed: () => true,
  render: (ctx: CanvasRenderingContext2D, T: number, opts?: RenderOptions) => {
    film.render(ctx, T, opts);
    paintBurnIn(ctx, scenesBurnIn(T, film.sceneAt(T), film.cardAt?.(T) === true), film.height);
  },
});
