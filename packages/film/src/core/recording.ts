import { Array as Arr, Option } from 'effect';
import {
  type Pcm,
  concat,
  fadeEdges,
  gain,
  levels,
  silence,
  slice,
  toMono,
  windowPowers,
} from './audio.ts';

export const TAKE_LEVEL = { speech: -17.1, ceiling: -1 } as const;

export const TAKE_PAD = { lead: 0.07, tail: 0 } as const;

const TAKE_WINDOW_S = 0.01;

const TAKE_GATE_DB_UNDER_LOUDEST = 40;

const TAKE_FLOOR_DBFS = -60;

const TAKE_MIN_SPEECH_S = 0.1;

const TAKE_HOLD_S = 0.25;

const TAKE_FADE_S = 0.005;

export const speechLevel = (pcm: Pcm): number => {
  const window = Math.max(1, Math.round(TAKE_WINDOW_S * pcm.rate));
  const powers = [...windowPowers(toMono(pcm), window)].map((db) => 10 ** (db / 10));
  const db = (p: number) => 10 * Math.log10(p);
  const meanOf = (ps: ReadonlyArray<number>) =>
    ps.reduce((sum, p) => sum + p, 0) / Math.max(1, ps.length);
  const loud = powers.filter((p) => db(p) > -70);
  const relative = db(meanOf(loud)) - 10;
  const gated = loud.filter((p) => db(p) > relative);
  if (gated.length === 0) return Number.NEGATIVE_INFINITY;
  return db(meanOf(gated));
};

interface Run {
  readonly from: number;
  readonly to: number;
}

const speechRuns = (
  level: ReadonlyArray<number>,
  gate: number,
  hold: number,
  min: number,
): ReadonlyArray<Run> => {
  const runs: Array<Run> = [];
  for (const [w, l] of level.entries()) {
    if (!(l >= gate)) continue;
    const open = Arr.last(runs).pipe(Option.filter((r) => w - r.to < hold));
    if (Option.isSome(open)) runs[runs.length - 1] = { from: open.value.from, to: w + 1 };
    else runs.push({ from: w, to: w + 1 });
  }
  return runs.filter((r) => r.to - r.from >= min);
};

const speechBounds = (
  mono: Pcm,
): Option.Option<{ readonly onset: number; readonly end: number }> => {
  const window = Math.max(1, Math.round(TAKE_WINDOW_S * mono.rate));
  const level = [...windowPowers(mono, window)];
  const hold = Math.round(TAKE_HOLD_S / TAKE_WINDOW_S);
  const min = Math.round(TAKE_MIN_SPEECH_S / TAKE_WINDOW_S);
  const loudest = Math.max(
    ...speechRuns(level, TAKE_FLOOR_DBFS, hold, min).flatMap((r) => level.slice(r.from, r.to)),
  );
  if (!(loudest >= TAKE_FLOOR_DBFS)) return Option.none();
  const runs = speechRuns(level, loudest - TAKE_GATE_DB_UNDER_LOUDEST, hold, min);
  return Option.zipWith(Arr.head(runs), Arr.last(runs), (first, last) => ({
    onset: first.from * window,
    end: Math.min(mono.frames, last.to * window),
  }));
};

export const TAKE_TAIL_SLACK = 0.1;

export const trimTail = (take: Pcm): Option.Option<Pcm> =>
  Option.flatMap(speechBounds(toMono(take)), ({ end }) => {
    const to = Math.min(take.frames, end + Math.round(TAKE_PAD.tail * take.rate));
    if (take.frames - to <= TAKE_TAIL_SLACK * take.rate) return Option.none();
    return Option.some(fadeEdges(slice(take, 0, to), TAKE_FADE_S));
  });

export const withGaps = (
  take: Pcm,
  edits: ReadonlyArray<{ readonly at: number; readonly by: number }>,
): Option.Option<Pcm> => {
  if (edits.length === 0) return Option.none();
  return Option.some(edits.reduce(withGap, take));
};

const spliced = (pcm: Pcm, from: number, to: number, put: number): Pcm =>
  concat(pcm.rate, pcm.channels.length, [
    fadeEdges(slice(pcm, 0, from), TAKE_FADE_S),
    silence(pcm.rate, put, pcm.channels.length),
    fadeEdges(slice(pcm, to, pcm.frames - to), TAKE_FADE_S),
  ]);

const withGap = (pcm: Pcm, edit: { readonly at: number; readonly by: number }): Pcm => {
  const at = Math.min(pcm.frames, Math.max(0, Math.round(edit.at * pcm.rate)));
  const by = Math.round(Math.abs(edit.by) * pcm.rate);
  if (edit.by > 0) return spliced(pcm, at, at, by);
  const from = Math.max(0, at - Math.floor(by / 2));
  return spliced(pcm, from, Math.min(pcm.frames, from + by), 0);
};

export const prepareTake = (recording: Pcm): Option.Option<Pcm> => {
  const mono = toMono(recording);
  const bounds = speechBounds(mono);
  if (Option.isNone(bounds)) return Option.none();
  const { onset, end } = bounds.value;
  const lead = Math.round(TAKE_PAD.lead * mono.rate);
  const tail = Math.round(TAKE_PAD.tail * mono.rate);
  const from = Math.max(0, onset - lead);
  const to = Math.min(mono.frames, end + tail);
  const trimmed = fadeEdges(
    concat(mono.rate, 1, [
      silence(mono.rate, from - (onset - lead), 1),
      slice(mono, from, to - from),
      silence(mono.rate, end + tail - to, 1),
    ]),
    TAKE_FADE_S,
  );
  return Option.some(gain(trimmed, takeLift(trimmed)));
};

export const takeLift = (take: Pcm): number => {
  const lift = Math.min(
    TAKE_LEVEL.speech - speechLevel(take),
    TAKE_LEVEL.ceiling - levels(take).peak,
  );
  if (!Number.isFinite(lift)) return 0;
  return lift;
};
