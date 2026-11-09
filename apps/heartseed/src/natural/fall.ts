import { Option } from 'effect';

/** A point above this many Hz is voiced: the vocoder's own voicing threshold. */
export const VOICED_HZ = 10;
/** A voiced point at most this many semitones under the middle is pitched; the lower ones are Kokoro's consonant dips, ramps and creak. */
export const PITCH_FLOOR = 6;
/** The fall's window in pitch points of 12.5 ms: 450 ms. */
export const FALL_WINDOW = 36;
/** The fall's target, in semitones under the phrase's middle (the owner's Gentle fall). */
export const FALL_DROP = 2;

const semitones = (hz: number, reference: number) => 12 * Math.log2(hz / reference);

const medianOf = (values: ReadonlyArray<number>) => {
  const sorted = values.toSorted((a, b) => a - b);
  const half = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[half] ?? 0;
  return ((sorted[half - 1] ?? 0) + (sorted[half] ?? 0)) / 2;
};

/** Where the fall acts on a curve: the median of its voiced points, the target under it, and the window, its last pitched indices within 36 of the last one. */
interface Reach {
  readonly middle: number;
  readonly target: number;
  readonly window: ReadonlyArray<number>;
}

const reachOf = (f0: ReadonlyArray<number>): Option.Option<Reach> => {
  const voiced = f0.filter((hz) => hz > VOICED_HZ);
  const middle = medianOf(voiced);
  const floor = middle * 2 ** (-PITCH_FLOOR / 12);
  const pitched = [...f0.keys()].filter((at) => {
    const hz = f0[at] ?? 0;
    return hz > VOICED_HZ && hz >= floor;
  });
  const last = pitched.at(-1) ?? 0;
  if (voiced.length === 0 || pitched.length === 0) return Option.none();
  return Option.some({
    middle,
    target: middle * 2 ** (-FALL_DROP / 12),
    window: pitched.filter((at) => at > last - FALL_WINDOW),
  });
};

/** How far along the window's glide a point lies, 0 at its first point and 1 at its last; a one-point window is all the way. */
const partOf = (at: number, first: number, last: number) => {
  if (last === first) return 1;
  return (at - first) / (last - first);
};

/**
 * A phrase's pitch curve, as Kokoro's Prosody stage gives it (Hz, two points
 * a 25 ms frame), with its last 450 ms of pitched points held from rising
 * and capped by a glide even in semitones from the window's first point down
 * to 2 semitones under the middle; every other point as given. A new array
 * of the same length, no point raised, so the vocoder's audio keeps its
 * length.
 */
export const fallOf = (f0: ReadonlyArray<number>): ReadonlyArray<number> => {
  const out = [...f0];
  Option.map(reachOf(f0), ({ target, window }) => {
    const first = window[0] ?? 0;
    const last = window.at(-1) ?? 0;
    const from = f0[first] ?? 0;
    let held = Number.POSITIVE_INFINITY;
    for (const at of window) {
      held = Math.min(held, f0[at] ?? 0);
      out[at] = Math.min(held, from * (target / from) ** partOf(at, first, last));
    }
  });
  return out;
};

/** How a curve sent ends against the prosody's own: its window's last point in semitones under the original's middle, and the largest rise inside the window; none when the original has no voiced point. */
export const fallMeasure = (
  f0: ReadonlyArray<number>,
  curve: ReadonlyArray<number>,
): Option.Option<{ readonly end: number; readonly climb: number }> =>
  Option.map(reachOf(f0), ({ middle, window }) => {
    let low = Number.POSITIVE_INFINITY;
    let climb = 0;
    for (const at of window) {
      const hz = curve[at] ?? 0;
      low = Math.min(low, hz);
      climb = Math.max(climb, semitones(hz, low));
    }
    return { end: semitones(curve[window.at(-1) ?? 0] ?? 0, middle), climb };
  });

/** Whether a curve sent ends its window at least `FALL_DROP` semitones under the prosody's middle (to a millionth of a semitone). */
export const hasFallen = (f0: ReadonlyArray<number>, curve: ReadonlyArray<number>): boolean =>
  Option.exists(fallMeasure(f0, curve), ({ end }) => end <= -FALL_DROP + 1e-6);
