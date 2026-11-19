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
 * How each host lays a run out from its face's file. The web (Chrome) gives a run's width to a hundredth of a
 * pixel and its height as its ascent and descent each rounded to a whole pixel; iOS gives a frame in thirds of a
 * point, its height the line's.
 */
const HOSTS = {
  web: { width: 0.03, height: (a: number, d: number) => Math.round(a) + Math.round(d), tall: 0 },
  ios: { width: 0.34, height: (a: number, d: number) => a + d, tall: 1 },
} as const;

/** A host whose runs the drive reads. */
export type DrawnHost = keyof typeof HOSTS;

/** The run `text` in the face `file` at `size` as `host` lays it out: its width, by its tabular figures, and its height, by its ascent and descent. */
export const runOf = (file: FaceFile, text: string, size: number, host: DrawnHost): DrawnRun => ({
  w: [...text].reduce((sum, char) => sum + file.tabular(char), 0) * size,
  h: HOSTS[host].height(file.ascent * size, file.descent * size),
  size,
});

/** Whether `drawn` is the run its file draws on `host`: as wide as its figures and as tall as its ascent and descent, within the host's rounding. */
export const drawsFile = (file: FaceFile, text: string, drawn: DrawnRun, host: DrawnHost) => {
  const want = runOf(file, text, drawn.size, host);
  return (
    Math.abs(drawn.w - want.w) <= HOSTS[host].width &&
    Math.abs(drawn.h - want.h) <= HOSTS[host].tall
  );
};

/** Whether two runs of one text differ on `host`: in width past its rounding, or in height by a whole pixel. */
export const drawnApart = (one: DrawnRun, other: DrawnRun, host: DrawnHost) =>
  Math.abs(one.w - other.w) > HOSTS[host].width || Math.abs(one.h - other.h) >= 1;

/** The fallback by a font's kind, San Francisco for any kind it does not name. */
const FALLBACKS: ReadonlyMap<string, string> = new Map([['Serif', 'newyork']]);

/** The system face a bundled font's chain falls back to when its file is not drawn: New York under a serif, San Francisco under the rest. */
export const fallbackOf = (font: TypeFont): string => FALLBACKS.get(font.kind) ?? 'sf';
