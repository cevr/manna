import { type Hymn, PER_BEAT, type Timing, sung } from './hymn.js';

export interface Laying {
  readonly span: { readonly start: number; readonly end: number };
  readonly stanza: number;
  readonly tail: number;
  readonly starts: ReadonlyArray<ReadonlyArray<number>> | undefined;
}

export interface Clock {
  readonly ticksPerBeat: number;
  readonly tempos: ReadonlyArray<{ readonly tick: number; readonly microsPerQuarter: number }>;
  readonly lastTick: number;
}

const DEFAULT_TEMPO = 500_000;

interface Raw {
  readonly start: number;
  readonly next: number;
  readonly syllables: ReadonlyArray<number> | undefined;
  readonly even: boolean;
}

const evenRaw = (from: number, until: number, count: number): Raw[] => {
  const share = (until - from) / Math.max(1, count);
  return Array.from({ length: count }, (_, i) => ({
    start: from + i * share,
    next: from + (i + 1) * share,
    syllables: undefined,
    even: true,
  }));
};

const rawOf = (laying: Laying): Raw[] => {
  const count = laying.stanza + laying.tail;
  const starts = laying.starts;
  if (starts === undefined || starts.length !== count || starts.some((line) => line.length === 0))
    return evenRaw(laying.span.start, laying.span.end, count);
  return starts.map((line, i) => ({
    start: line[0] ?? 0,
    next: starts[i + 1]?.[0] ?? laying.span.end,
    syllables: [...line],
    even: false,
  }));
};

interface Placed {
  readonly laying: Laying;
  readonly lines: Raw[];
  readonly end: number;
}

const place = (layings: ReadonlyArray<Laying>): Placed[] =>
  layings.map((laying) => ({ laying, lines: rawOf(laying), end: laying.span.end }));

type Line = ReturnType<typeof sung>[number];

const sourcesOf = (hymn: Hymn, placed: ReadonlyArray<Placed>) => {
  let stanza = 0;
  return sung(hymn).map((line) => {
    if (line.verse !== 'refrain') stanza = line.verse;
    const at = placed[stanza - 1];
    const index =
      line.verse !== 'refrain'
        ? line.line
        : at?.laying.tail === 0
          ? -1
          : (at?.laying.stanza ?? 0) + line.line;
    const raw = at?.lines[index];
    return { line, at: raw === undefined ? undefined : at, raw };
  });
};

const firstRefrain = (placed: ReadonlyArray<Placed>, count: number, intro: number): Raw[] => {
  const at = placed.find((one) => one.laying.tail > 0);
  const lines = at === undefined ? [] : at.lines.slice(at.laying.stanza);
  const head = lines[0];
  const length =
    at === undefined || head === undefined ? Number.POSITIVE_INFINITY : at.end - head.start;
  if (head === undefined || length > intro || lines.length !== count)
    return evenRaw(length > intro ? 0 : intro - length, intro, count);
  const move = (tick: number) => tick - head.start + intro - length;
  return lines.map((raw) => ({
    start: move(raw.start),
    next: move(raw.next),
    syllables: raw.syllables?.map(move),
    even: raw.even,
  }));
};

const syllablesOf = (line: Line, raw: Raw) => {
  if (line.part._tag === 'Plain') return { syllables: [], even: true };
  const count = line.part.lines[line.line]?.length ?? 0;
  if (!raw.even && raw.syllables !== undefined && raw.syllables.length === count)
    return { syllables: [...raw.syllables], even: false };
  return { syllables: evenRaw(raw.start, raw.next, count).map((one) => one.start), even: true };
};

const fileMicrosAt = (clock: Clock, tick: number): number => {
  let micros = 0;
  let from = 0;
  let tempo = DEFAULT_TEMPO;
  for (const change of clock.tempos) {
    if (change.tick > tick) break;
    micros += ((change.tick - from) * tempo) / clock.ticksPerBeat;
    from = change.tick;
    tempo = change.microsPerQuarter;
  }
  return micros + ((tick - from) * tempo) / clock.ticksPerBeat;
};

const temposOf = (clock: Clock, unit: (tick: number) => number): Array<[number, number]> => {
  const times = [...new Set([0, ...clock.tempos.map((tempo) => unit(tempo.tick))])];
  const last = clock.tempos.at(-1)?.microsPerQuarter ?? DEFAULT_TEMPO;
  const tickOf = (time: number) => (time * clock.ticksPerBeat) / PER_BEAT;
  let micros = 0;
  return times.map((at, i): [number, number] => {
    const next = times[i + 1];
    if (next === undefined) return [at, last];
    const want = fileMicrosAt(clock, tickOf(next)) * PER_BEAT;
    const tempo = Math.max(1, Math.round((want - micros) / (next - at)));
    micros += tempo * (next - at);
    return [at, tempo];
  });
};

export const timingOf = (hymn: Hymn, clock: Clock, layings: ReadonlyArray<Laying>): Timing => {
  const unit = (tick: number) => Math.round((tick * PER_BEAT) / clock.ticksPerBeat);
  const placed = place(layings);
  const sources = sourcesOf(hymn, placed);
  const playedStarts = sources.flatMap(({ at, raw }) =>
    at !== undefined && raw !== undefined ? [raw.start] : [],
  );
  const intro = playedStarts.length === 0 ? 0 : Math.min(...playedStarts);
  const first = firstRefrain(placed, hymn.refrain?.part.lines.length ?? 0, intro);
  const entries = sources.map(({ line, at, raw }) => {
    const from = raw ?? first[line.line] ?? evenRaw(intro, intro, 1)[0];
    const end = at === undefined ? intro : clock.lastTick;
    return {
      start: from?.start ?? intro,
      ...(from === undefined ? { syllables: [], even: true } : syllablesOf(line, from)),
      played: at !== undefined,
      end,
    };
  });
  const lines = entries.map((entry, i) => {
    const start = unit(entry.start);
    return {
      start,
      until: Math.max(start, unit(entries[i + 1]?.start ?? entry.end)),
      syllables: entry.syllables.map(unit),
      played: entry.played,
      even: entry.even,
    };
  });
  return {
    perBeat: PER_BEAT,
    tempos: temposOf(clock, unit),
    intro: unit(intro),
    end: unit(clock.lastTick),
    lines,
  };
};

export const secondsAt =
  (timing: Pick<Timing, 'perBeat' | 'tempos'>) =>
  (time: number): number => {
    let micros = 0;
    let from = 0;
    let tempo = DEFAULT_TEMPO;
    for (const [at, us] of timing.tempos) {
      if (at > time) break;
      micros += (at - from) * tempo;
      from = at;
      tempo = us;
    }
    return (micros + (time - from) * tempo) / 1e6 / timing.perBeat;
  };
