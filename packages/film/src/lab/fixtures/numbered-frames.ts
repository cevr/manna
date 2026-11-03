export const BITS = 10;
export const CLIP_W = 320;
export const CLIP_H = 180;

export const numberOf = (bars: ReadonlyArray<number>): number =>
  bars.reduce((n, luma) => n * 2 + Number(luma > 128), 0);
