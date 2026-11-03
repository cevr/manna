import { type Box, drawing } from '@manna/film/canvas';
import { lookOf } from '../looks/index.ts';

export const job = drawing({
  timeline: {
    page: { at: 'start', dur: 0.4, track: 'verse' },
    sweep: { at: 'speech', until: { cue: 'flood', edge: 'start' }, track: 'verse' },
    flood: { mark: 'job', dur: 0.45, ends: true, track: 'verse' },
    card: { mark: 'job', until: { at: 'end' }, track: 'card' },
    payoff: { mark: 'job', word: 'just', dur: 0.35, track: 'card' },
  },
  draw: (f): Box => lookOf().job(f),
  light: () => lookOf().light ?? { color: '#ffffff', amount: 0 },
  cards: [
    {
      cue: 'card',
      from: 'job',
      payoff: 'just',
      flood: {
        cue: 'flood',
        mask: (ctx, box, at, f) => {
          const edge = lookOf().floodEdge;
          if (edge === undefined) ctx.fillRect(box.x, box.y, box.w, box.h);
          else edge(ctx, box, at, f);
        },
      },
      draw: (f, words) => lookOf().card(f, words),
    },
  ],
});

/** What a look draws Job's verse and the card with. */
export type JobFrame = Parameters<typeof job.draw>[0];
