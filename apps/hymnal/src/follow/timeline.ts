import { Effect, Option } from 'effect';

export interface TimedLine {
  readonly start: number;
  readonly until: number;
  readonly played: boolean;
  readonly even: boolean;
  readonly syllables: ReadonlyArray<number>;
  readonly words: ReadonlyArray<number>;
}

export interface FirstTempo {
  readonly microsPerQuarter: number;
  readonly numerator: number;
  readonly denominator: number;
}

export interface Timeline {
  readonly tempo: FirstTempo;
  readonly lines: ReadonlyArray<TimedLine>;
  readonly first: number;
  readonly end: number;
}

const count = (text: string): Option.Option<number> => {
  const n = Number(text);
  return Option.liftPredicate(n, (value) => text !== '' && Number.isInteger(value) && value >= 0);
};

const lineOf = (text: string, before: number): Option.Option<TimedLine> => {
  const [flagText = '', startText = '', lengthText = '', ...wordTexts] = text.split(',');
  return Option.gen(function* () {
    const flags = yield* Option.filter(count(flagText), (n) => n <= 3);
    const start = before + (yield* count(startText));
    const until = start + (yield* count(lengthText));
    const syllables: Array<number> = [];
    const words: Array<number> = [];
    let at = start;
    for (const [word, wordText] of wordTexts.entries())
      for (const step of wordText.split('.')) {
        at += yield* count(step);
        syllables.push(at);
        words.push(word);
      }
    return { start, until, played: (flags & 1) === 1, even: (flags & 2) === 2, syllables, words };
  });
};

const positive = (text: string): Option.Option<number> => Option.filter(count(text), (n) => n > 0);

const tempoOf = (text: string): Option.Option<FirstTempo> => {
  const [micros = '', numerator = '', denominator = '', ...rest] = text.split(',');
  return Option.gen(function* () {
    if (rest.length > 0) return yield* Option.none();
    return {
      microsPerQuarter: yield* positive(micros),
      numerator: yield* positive(numerator),
      denominator: yield* positive(denominator),
    };
  });
};

export const timelineOf = (encoded: string): Option.Option<Timeline> =>
  Option.gen(function* () {
    const bar = encoded.indexOf('|');
    if (bar < 0) return yield* Option.none();
    const tempo = yield* tempoOf(encoded.slice(0, bar));
    const lines: Array<TimedLine> = [];
    let before = 0;
    for (const text of encoded.slice(bar + 1).split(';')) {
      const line = yield* lineOf(text, before);
      lines.push(line);
      before = line.start;
    }
    const first = yield* Option.fromUndefinedOr(lines[0]);
    const last = yield* Option.fromUndefinedOr(lines.at(-1));
    return { tempo, lines, first: first.start, end: last.until };
  });

export const timingBook = (bundled: ReadonlyArray<readonly [number, string]>) => {
  const encoded = new Map(bundled);
  const kept = new Map<number, Option.Option<Timeline>>();
  const decode = (number: number): Option.Option<Timeline> => {
    const timeline = Option.flatMap(Option.fromUndefinedOr(encoded.get(number)), timelineOf);
    if (Option.isNone(timeline))
      Effect.runSync(Effect.logWarning(`[follow] timing.decode.failed number=${number}`));
    return timeline;
  };
  return {
    of: (number: number): Option.Option<Timeline> =>
      Option.getOrElse(Option.fromUndefinedOr(kept.get(number)), () => {
        const timeline = decode(number);
        kept.set(number, timeline);
        return timeline;
      }),
  };
};
export type TimingBook = ReturnType<typeof timingBook>;

export interface Place {
  readonly line: number;
  readonly syllable: number;
  readonly word: number;
  readonly nextAt: number;
}

const lastAtOrBefore = (count: number, startOf: (i: number) => number, ms: number): number => {
  let low = 0;
  let high = count;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (startOf(middle) <= ms) low = middle + 1;
    else high = middle;
  }
  return low - 1;
};

const nowhere = (nextAt: number): Place => ({ line: -1, syllable: -1, word: -1, nextAt });

export const placeAt = (timeline: Timeline, ms: number): Place => {
  const { lines } = timeline;
  if (ms >= timeline.end) return nowhere(Infinity);
  if (ms < timeline.first) return nowhere(timeline.first);
  const index = lastAtOrBefore(lines.length, (i) => lines[i]?.start ?? Infinity, ms);
  return Option.match(Option.fromUndefinedOr(lines[index]), {
    onNone: () => nowhere(timeline.first),
    onSome: (line) => {
      if (ms >= line.until) return nowhere(lines[index + 1]?.start ?? Infinity);
      const syllable = lastAtOrBefore(
        line.syllables.length,
        (i) => line.syllables[i] ?? Infinity,
        ms,
      );
      return {
        line: index,
        syllable,
        word: line.words[syllable] ?? -1,
        nextAt: Math.min(line.syllables[syllable + 1] ?? Infinity, line.until),
      };
    },
  });
};
