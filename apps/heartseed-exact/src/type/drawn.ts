import type { TypeFont } from './choices';

/** A face's measures as its file states them, in ems: its ascent and descent, and a character's advance among its tabular figures. */
export interface FaceFile {
  readonly ascent: number;
  readonly descent: number;
  readonly tabular: (char: string) => number;
}

/** A run of text as the host laid it out: its width and height, and the font size it was drawn at, in the host's points or pixels. */
export interface DrawnRun {
  readonly w: number;
  readonly h: number;
  readonly size: number;
}

/** The verse whose number the drive measures: three tabular figures, so a face's advance shows three times over. */
export const DRAWN_VERSE = 100;

/**
 * How far a run's width may stray from its file's advances: both hosts report an inline run's width to a hundredth
 * (measured: every bundled face within 0.01 of its file, Chrome at 10.5035 px and iOS at 11.16 pt).
 */
const WIDTH_SLACK = 0.03;

/** The run `text` in the face `file` at `size`: its width, by its tabular figures, and its height, its ascent and descent each rounded to a whole pixel or point, as Chrome and iOS both lay an inline run out. */
export const runOf = (file: FaceFile, text: string, size: number): DrawnRun => ({
  w: [...text].reduce((sum, char) => sum + file.tabular(char), 0) * size,
  h: Math.round(file.ascent * size) + Math.round(file.descent * size),
  size,
});

/** Whether `drawn` is the run its file draws: as wide as its figures and as tall as its rounded ascent and descent. */
export const drawsFile = (file: FaceFile, text: string, drawn: DrawnRun) => {
  const want = runOf(file, text, drawn.size);
  return Math.abs(drawn.w - want.w) <= WIDTH_SLACK && Math.abs(drawn.h - want.h) < 0.5;
};

/** Whether two runs of one text differ: in width past the hosts' rounding, or in height by a whole pixel. */
export const drawnApart = (one: DrawnRun, other: DrawnRun) =>
  Math.abs(one.w - other.w) > WIDTH_SLACK || Math.abs(one.h - other.h) >= 1;

/** The fallback by a font's kind, San Francisco for any kind it does not name. */
const FALLBACKS: ReadonlyMap<string, string> = new Map([['Serif', 'newyork']]);

/** The system face a bundled font's chain falls back to when its file is not drawn: New York under a serif, San Francisco under the rest. */
export const fallbackOf = (font: TypeFont): string => FALLBACKS.get(font.kind) ?? 'sf';
