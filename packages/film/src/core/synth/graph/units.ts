export const SYNTH_RATE = 44100;

export const SYNTH_PEAK = -1;

export const MAX_CODE_SECS = 120;

export const MAX_CODE_WORK = 3600;

export const CONTROL = 32;

export const framesOf = (secs: number): number => Math.max(0, Math.round(secs * SYNTH_RATE));

export const poissonCap = (rate: number, secs: number): number => Math.ceil(2 * rate * secs) + 16;
