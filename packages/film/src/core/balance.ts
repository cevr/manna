import { Array as Arr } from 'effect';
import { type Pcm, SPEECH_GATE, windowPowers } from './audio.ts';
import { MASTER, type Placement, repitch } from './mix.ts';

export const BALANCE = {
  master: MASTER.loudness,
  tolerance: 3,
  hot: 3,
  hotWindow: 0.05,
  around: 1,
  speaking: 0.25,
} as const;

const levelsOver = (pcm: Pcm, from: number, to: number, window: number): Array<number> => [
  ...windowPowers(
    pcm,
    Math.round(window * pcm.rate),
    Math.round(from * pcm.rate),
    Math.round(to * pcm.rate),
  ),
];

const percentile = (values: ReadonlyArray<number>, p: number): number => {
  const sorted = values.toSorted((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) * p)] ?? Number.NEGATIVE_INFINITY;
};

interface HotEffect {
  readonly name: string;
  readonly at: number;
  readonly over: number;
}

export const hotEffects = (
  voice: Pcm,
  effects: ReadonlyArray<Placement<Pcm>>,
): ReadonlyArray<HotEffect> =>
  Arr.flatMap(effects, (fx) => {
    const sound = repitch(fx.sound, fx.pitch);
    const secs = sound.frames / sound.rate;
    const heard = levelsOver(sound, 0, secs, BALANCE.hotWindow);
    const loudest = Math.max(...heard) + 20 * Math.log10(fx.gain);
    const around = levelsOver(
      voice,
      fx.at - BALANCE.around,
      fx.at + secs + BALANCE.around,
      BALANCE.hotWindow,
    ).filter((db) => db > SPEECH_GATE);
    if (around.length * BALANCE.hotWindow < BALANCE.speaking) return [];
    const over = loudest - percentile(around, 0.7);
    if (over <= -BALANCE.hot) return [];
    return [{ name: fx.name, at: fx.at, over }];
  });
