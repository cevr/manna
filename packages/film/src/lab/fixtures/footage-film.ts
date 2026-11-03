import { Option } from 'effect';
import { type Film, createFilm } from '../../canvas/film.ts';
import { CLIP_H, CLIP_W } from './numbered-frames.ts';

export const FOOTAGE = 'footage';

export const FOOTAGE_SOURCE = 'clip.numbered/0123456789ab';

export const FOOTAGE_FPS = 30;

const FOOTAGE_FRAMES = 120;

const SEAM = 60;
const JUMP = 30;

export const FOOTAGE_CLIP_FRAMES = FOOTAGE_FRAMES + JUMP;

export const sourceFrameOf = (i: number): number => i + JUMP * Number(i >= SEAM);

export const footageFilm = (): Film => {
  const base = createFilm({
    title: 'Footage',
    width: CLIP_W,
    height: CLIP_H,
    fps: FOOTAGE_FPS,
    paper: { base: '#f4ecd8', tone: '#2a2520', seed: 1 },
    shade: '#000',
    scenes: [{ id: 'take', say: 'A take.', draw: () => {}, drift: 0 }],
  });
  const readAt = (T: number) => ({
    source: FOOTAGE_SOURCE,
    at: (sourceFrameOf(Math.round(T * FOOTAGE_FPS)) + 0.5) / FOOTAGE_FPS,
  });
  return {
    ...base,
    duration: FOOTAGE_FRAMES / FOOTAGE_FPS,
    footageAt: (T) => [readAt(T)],
    render: (ctx, T, opts) =>
      Option.match(Option.fromUndefinedOr(opts?.footage?.frame(readAt(T))), {
        onNone: () => {
          ctx.fillStyle = '#fff';
          ctx.fillRect(0, 0, CLIP_W, CLIP_H);
        },
        onSome: (frame) => ctx.drawImage(frame, 0, 0, CLIP_W, CLIP_H),
      }),
  };
};
