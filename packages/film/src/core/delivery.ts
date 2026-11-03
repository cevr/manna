import { Array as Arr, Match, Option, Schema } from 'effect';
import { toMs } from './time.ts';

export const HOLD_DEFAULT = 0.6;

const HOLD_SECONDS = { min: 0.4, max: 3, step: 0.1 } as const;

const BREATH_SECONDS = 0.3;

const PACE = { min: 150, max: 165, aim: 155 } as const;

export const Mark = Schema.Union([
  Schema.TaggedStruct('Stress', { word: Schema.Int }),
  Schema.TaggedStruct('Breath', { before: Schema.Int }),
  Schema.TaggedStruct('Hold', { before: Schema.Int, seconds: Schema.Finite }),
]);
export type Mark = typeof Mark.Type;

type MarkKind = Mark['_tag'];

type Pause = Extract<Mark, { readonly _tag: 'Breath' | 'Hold' }>;

export const isPause = (mark: Mark): mark is Pause => mark._tag !== 'Stress';

export const markAt: (mark: Mark) => number = Match.type<Mark>().pipe(
  Match.tagsExhaustive({
    Stress: (m) => m.word,
    Breath: (m) => m.before,
    Hold: (m) => m.before,
  }),
);

const holdSeconds = (seconds: number): number => Math.round(seconds * 10) / 10;

export const DELIVERY = /\{(\*|\/\/?)(\d+(?:\.\d+)?)?\}/g;

export const markOfToken = (
  sigil: string,
  arg: Option.Option<string>,
  at: number,
): Option.Option<Mark> => {
  if (sigil === '//')
    return Option.some({
      _tag: 'Hold',
      before: at,
      seconds: holdSeconds(Option.getOrElse(Option.map(arg, Number), () => HOLD_DEFAULT)),
    });
  if (Option.isSome(arg)) return Option.none();
  if (sigil === '*') return Option.some({ _tag: 'Stress', word: at });
  return Option.some({ _tag: 'Breath', before: at });
};

const holdToken = (seconds: number): string => {
  if (holdSeconds(seconds) === HOLD_DEFAULT) return '{//}';
  return `{//${holdSeconds(seconds)}}`;
};

export const tokenOf: (mark: Mark) => string = Match.type<Mark>().pipe(
  Match.tagsExhaustive({
    Stress: () => '{*}',
    Breath: () => '{/}',
    Hold: (m) => holdToken(m.seconds),
  }),
);

interface Misfit {
  readonly mark: Mark;
  readonly reason: string;
}

export const marksMisfit = (marks: ReadonlyArray<Mark>, words: number): Option.Option<Misfit> =>
  Arr.findFirst(marks, (mark, i) =>
    Option.map(misfit(mark, marks.slice(0, i), words), (reason) => ({ mark, reason })),
  );

export const LineRead = Schema.Struct({ spoken: Schema.String, marks: Schema.Array(Mark) });
export type LineRead = typeof LineRead.Type;

export const sameMarks = Schema.toEquivalence(Schema.Array(Mark));

export const marksRefusal = (
  marks: ReadonlyArray<Mark>,
  now: LineRead,
  read: Option.Option<LineRead>,
): Option.Option<string> => {
  if (Option.isNone(read))
    return Option.some('this page is older than the lab: reload it, then mark again');
  if (now.spoken !== read.value.spoken)
    return Option.some(
      `its words changed since the page read them (it says "${now.spoken}" now): read it again and mark it there`,
    );
  if (!sameMarks(now.marks, read.value.marks))
    return Option.some(
      'its marks changed since the page read them (marked elsewhere): read it again and mark it there',
    );
  const words = now.spoken.split(' ').filter((w) => w !== '').length;
  return Option.map(marksMisfit(marks, words), (m) => m.reason);
};

const stressMisfit = (at: number, before: ReadonlyArray<Mark>, words: number) => {
  if (at < 0 || at >= words) return Option.some('stresses no word');
  if (before.some((m) => m._tag === 'Stress' && m.word === at))
    return Option.some('stresses a word twice');
  return Option.none();
};

const pauseMisfit = (pause: Pause, before: ReadonlyArray<Mark>, words: number) => {
  const at = pause.before;
  if (at <= 0 || at >= words)
    return Option.some('pauses outside the line (its lead and tail are the beat’s)');
  if (before.some((m) => isPause(m) && m.before === at))
    return Option.some('is a second pause in one gap');
  if (
    pause._tag === 'Hold' &&
    (pause.seconds < HOLD_SECONDS.min || pause.seconds > HOLD_SECONDS.max)
  )
    return Option.some(
      `holds ${pause.seconds} s, outside ${HOLD_SECONDS.min}–${HOLD_SECONDS.max} s`,
    );
  return Option.none();
};

const misfit = (mark: Mark, before: ReadonlyArray<Mark>, words: number): Option.Option<string> => {
  if (isPause(mark)) return pauseMisfit(mark, before, words);
  return stressMisfit(mark.word, before, words);
};

export const inOrder = (marks: ReadonlyArray<Mark>): ReadonlyArray<Mark> =>
  marks.toSorted((a, b) => markAt(a) - markAt(b) || Number(isPause(b)) - Number(isPause(a)));

export const wordsAMinute = (words: number, seconds: number): Option.Option<number> =>
  Option.liftPredicate((words * 60) / seconds, () => words > 0 && seconds > 0);

export const paceBand = (wpm: number): 'slow' | 'in' | 'fast' => {
  if (wpm < PACE.min) return 'slow';
  if (wpm > PACE.max) return 'fast';
  return 'in';
};

type Dialect = 'tags' | 'ssml';

const dialectOf = (model: string): Dialect => {
  if (model.startsWith('eleven_v3') || model.startsWith('eleven_v4')) return 'tags';
  return 'ssml';
};

interface MarkSent {
  readonly as: string;
  readonly exact: boolean;
  readonly sent: boolean;
}

const MODEL_MARKS = {
  tags: {
    Stress: { as: 'the word in CAPITALS', exact: false, sent: true },
    Breath: { as: '[pause] in the gap', exact: false, sent: true },
    Hold: { as: '[pause] in the gap, then the gap set to its seconds', exact: true, sent: true },
  },
  ssml: {
    Stress: { as: 'not sent: these models have no emphasis control', exact: false, sent: false },
    Breath: { as: `<break time="${BREATH_SECONDS}s" /> in the gap`, exact: false, sent: true },
    Hold: {
      as: '<break time="…s" /> in the gap, then the gap set to its seconds',
      exact: true,
      sent: true,
    },
  },
} as const satisfies Readonly<Record<Dialect, Readonly<Record<MarkKind, MarkSent>>>>;

const SPEED = { min: 0.7, max: 1.2 } as const;

interface HoldGap {
  readonly before: number;
  readonly seconds: number;
}

export interface Compiled {
  readonly words: ReadonlyArray<string>;
  readonly holds: ReadonlyArray<HoldGap>;
  readonly speed: Option.Option<number>;
  readonly approximate: ReadonlyArray<Mark>;
}

const breakSeconds: (pause: Pause) => number = Match.type<Pause>().pipe(
  Match.tagsExhaustive({
    Breath: () => BREATH_SECONDS,
    Hold: (m) => Math.min(m.seconds, HOLD_SECONDS.max),
  }),
);

const pauseText = (dialect: Dialect, pause: Pause): string => {
  if (dialect === 'tags') return '[pause]';
  return `<break time="${breakSeconds(pause)}s" />`;
};

const speedFor = (model: string, natural: Option.Option<number>): Option.Option<number> =>
  Option.map(
    Option.filter(natural, (wpm) => dialectOf(model) === 'ssml' && wpm > 0),
    (wpm) => Math.round(Math.min(SPEED.max, Math.max(SPEED.min, PACE.aim / wpm)) * 100) / 100,
  );

const sentWord = (dialect: Dialect, marks: ReadonlyArray<Mark>, word: string, i: number) => {
  const stressed = marks.some((m) => m._tag === 'Stress' && m.word === i);
  const said = Option.getOrElse(
    Option.map(
      Option.liftPredicate(word, () => stressed && MODEL_MARKS[dialect].Stress.sent),
      (w) => w.toUpperCase(),
    ),
    () => word,
  );
  return Option.match(
    Arr.findFirst(marks, (m): m is Pause => isPause(m) && m.before === i),
    {
      onNone: () => said,
      onSome: (pause) => `${pauseText(dialect, pause)} ${said}`,
    },
  );
};

export const compileDelivery = (
  words: ReadonlyArray<string>,
  marks: ReadonlyArray<Mark>,
  model: string,
  natural: Option.Option<number> = Option.none(),
): Compiled => {
  const dialect = dialectOf(model);
  return {
    words: words.map((word, i) => sentWord(dialect, marks, word, i)),
    holds: marks
      .filter((m): m is Extract<Mark, { readonly _tag: 'Hold' }> => m._tag === 'Hold')
      .map((m) => ({ before: m.before, seconds: m.seconds })),
    speed: speedFor(model, natural),
    approximate: marks.filter((m) => !MODEL_MARKS[dialect][m._tag].exact),
  };
};

export const sentText = (compiled: Compiled, from = 0, to = compiled.words.length): string =>
  compiled.words.slice(from, to).join(' ');

interface Alignment {
  readonly chars: ReadonlyArray<string>;
  readonly starts: ReadonlyArray<number>;
  readonly ends: ReadonlyArray<number>;
  readonly breaks: ReadonlyArray<number>;
}

const spokenIndices = (chars: ReadonlyArray<string>): ReadonlyArray<number> =>
  chars.reduce<{ readonly kept: ReadonlyArray<number>; readonly closing: Option.Option<string> }>(
    (acc, c, i) =>
      Option.match(acc.closing, {
        onSome: (close) => ({
          kept: acc.kept,
          closing: Option.liftPredicate(close, () => c !== close),
        }),
        onNone: () => {
          if (c === '[') return { kept: acc.kept, closing: Option.some(']') };
          if (c === '<') return { kept: acc.kept, closing: Option.some('>') };
          return { kept: [...acc.kept, i], closing: Option.none() };
        },
      }),
    { kept: [], closing: Option.none() },
  ).kept;

export const spokenAlignment = (
  chars: ReadonlyArray<string>,
  starts: ReadonlyArray<number>,
  ends: ReadonlyArray<number>,
  breaks: ReadonlyArray<number> = [],
): Alignment => {
  const kept = spokenIndices(chars);
  const at = <A>(values: ReadonlyArray<A>, empty: A) =>
    kept.map((i) => Option.getOrElse(Arr.get(values, i), () => empty));
  return {
    chars: at(chars, ''),
    starts: at(starts, 0),
    ends: at(ends, 0),
    breaks: breaks.flatMap((b) => Option.toArray(Arr.findFirstIndex(kept, (k) => k >= b))),
  };
};

interface GapEdit {
  readonly at: number;
  readonly by: number;
}

interface Span {
  readonly start: number;
  readonly end: number;
}

const gapEdit = (before: Span, after: Span, seconds: number): ReadonlyArray<GapEdit> => {
  const gap = Math.max(0, after.start - before.end);
  const by = seconds - gap;
  if (Math.abs(by) < 0.01) return [];
  return [{ at: before.end + gap / 2, by }];
};

export const holdsIn = (
  words: ReadonlyArray<Span>,
  holds: ReadonlyArray<HoldGap>,
): ReadonlyArray<GapEdit> =>
  holds
    .flatMap((hold) =>
      Option.getOrElse(
        Option.zipWith(
          Arr.get(words, hold.before - 1),
          Arr.get(words, hold.before),
          (before, after) => gapEdit(before, after, hold.seconds),
        ),
        () => [],
      ),
    )
    .toSorted((a, b) => b.at - a.at);

export const shiftedBy = <W extends Span>(
  words: ReadonlyArray<W>,
  edits: ReadonlyArray<GapEdit>,
): ReadonlyArray<W> =>
  words.map((w) => {
    const by = edits.filter((e) => e.at <= w.start).reduce((sum, e) => sum + e.by, 0);
    return { ...w, start: toMs(w.start + by), end: toMs(w.end + by) };
  });
