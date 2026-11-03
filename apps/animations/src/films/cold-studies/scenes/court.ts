import { drawing } from '@manna/film/canvas';
import { lookOf } from '../looks/index.ts';

export const court = drawing({
  timeline: {
    build: { at: 'speech', until: 'evidence', track: 'room' },
    drop: { mark: 'evidence', dur: 1.4, ease: 'inCubic', stagger: 0.857, track: 'evidence' },
    bow: { mark: 'did', dur: 0.35, track: 'accused' },
    lean: { mark: 'judge', dur: 0.4, track: 'judge' },
    gavel: { mark: 'righteous', offset: -0.37, dur: 0.59, track: 'judge' },
    stamp: { mark: 'righteous', offset: -0.03, dur: 0.2, ease: 'outBack', track: 'verdict' },
    lift: { mark: 'righteous', offset: 0.1, dur: 0.37, track: 'accused' },
  },
  rigs: lookOf().rigs,
  draw: (f): void => lookOf().court(f),
  light: () => lookOf().light ?? { color: '#ffffff', amount: 0 },
});

export type CourtFrame = Parameters<typeof court.draw>[0];
