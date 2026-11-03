import type { Pcm } from '../audio.ts';

interface Seam {
  readonly db: number;
  readonly click: number;
}

const SEAM_DB = 1;
const SEAM_CLICK = 8;
const QUIET_STEP = 1e-9;

const power = (pcm: Pcm, from: number, to: number): number => {
  let sum = 0;
  for (const plane of pcm.channels) for (let i = from; i < to; i++) sum += (plane[i] ?? 0) ** 2;
  return sum / Math.max(1, (to - from) * pcm.channels.length);
};

const db = (p: number) => 10 * Math.log10(Math.max(p, 1e-12));

const clickOf = (pcm: Pcm): number => {
  let worst = 0;
  const stride = Math.max(1, Math.floor(pcm.frames / 4096));
  for (const plane of pcm.channels) {
    const steps: Array<number> = [];
    for (let i = 1; i < pcm.frames; i += stride)
      steps.push(Math.abs((plane[i] ?? 0) - (plane[i - 1] ?? 0)));
    steps.sort((a, b) => a - b);
    const typical = Math.max(steps[Math.floor(steps.length / 2)] ?? 0, QUIET_STEP);
    worst = Math.max(worst, Math.abs((plane[0] ?? 0) - (plane[pcm.frames - 1] ?? 0)) / typical);
  }
  return worst;
};

export const loopSeam = (pcm: Pcm): Seam => {
  const window = Math.min(Math.floor(pcm.frames / 2), Math.round(3 * pcm.rate));
  return {
    db: Math.abs(db(power(pcm, pcm.frames - window, pcm.frames)) - db(power(pcm, 0, window))),
    click: clickOf(pcm),
  };
};

export const seamHeard = (seam: Seam): boolean => seam.db > SEAM_DB || seam.click > SEAM_CLICK;

export const seamScore = (seam: Seam): number => seam.db + Math.max(0, seam.click - SEAM_CLICK);
