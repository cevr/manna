import type { Box, CardWord, Light, Verse } from '@manna/film/canvas';
import type { accusedProp, handProp, judgeProp } from './looks/rive/rigs.ts';
import type { CourtFrame } from './scenes/court.ts';
import type { JobFrame } from './scenes/job.ts';

export interface Look {
  readonly court: (f: CourtFrame) => void;
  readonly rigs?: {
    readonly accused?: ReturnType<typeof accusedProp>;
    readonly judge?: ReturnType<typeof judgeProp>;
    readonly hand?: ReturnType<typeof handProp>;
  };
  readonly job: (f: JobFrame) => Box;
  readonly card: (f: JobFrame, words: ReadonlyArray<CardWord>) => void;
  readonly floodEdge?: (ctx: CanvasRenderingContext2D, box: Box, at: number, f: JobFrame) => void;
  readonly light?: Light;
}

interface CitedVerse extends Verse {
  readonly ref: string;
}

export const VERSE: CitedVerse = {
  ref: 'Job 9:2',
  text: 'I know it is so of a truth: but how should man be just with God?',
  phrase: 'how should man be just with God?',
};
