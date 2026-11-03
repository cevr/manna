import type { TalkTake } from '../talk.ts';
import { voicedAt } from '../voiced.ts';

export const SYNTHETIC_SOURCE = 'take.why/0123456789ab';

const VOICED = 0.3;

export const syntheticTake = (
  texts: ReadonlyArray<string>,
  pauses: ReadonlyArray<number> = [],
  source: string = SYNTHETIC_SOURCE,
  size: { readonly width: number; readonly height: number } = { width: 1080, height: 1920 },
): TalkTake => {
  let t = 0.3;
  const words = texts.map((text, i) => {
    const before = t;
    const start = before + (pauses[i] ?? 0.1);
    const end = start + VOICED;
    t = end;
    return { text, start: before, end, voiced: voicedAt(start, end) };
  });
  const seconds = t + 0.5;
  const envelope = Array.from({ length: Math.ceil(seconds / 0.01) }, (_, k) => {
    const at = k * 0.01 + 0.005;
    return [-80, -20][Number(words.some((w) => at > w.voiced.start && at < w.voiced.end))] ?? -80;
  });
  return { source, words, envelope, ...size };
};
