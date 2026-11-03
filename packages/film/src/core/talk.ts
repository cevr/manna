import { Array as Arr, Option, Order, Record as Rec, Result, Schema } from 'effect';
import { PartId } from './address-schema.ts';
import { Segment } from './segment.ts';
import { DuplicateScene } from './errors.ts';
import {
  FOOTAGE_RECIPES,
  type FootageLock,
  type FootageTranscript,
  sourceFile,
  sourceOf,
} from './footage.ts';
import type { Placed } from './layout.ts';
import { hashText } from './narration.ts';
import { type Phrase, phrasesOf } from './phrases.ts';
import { SAFE_ZONES, SHORT_LAYOUT, roomAcross, safeRect } from './shorts.ts';
import {
  Knobs,
  Seconds,
  type TakeWord,
  type Timed,
  Timeline,
  type Timings,
  type VoiceTiming,
} from './schema.ts';
import { frameAtOrAfter, frameAtOrBefore, secondsAt } from './time.ts';
import { heard, voicedAt } from './voiced.ts';

const TalkFormat = Schema.Literals(['question', 'episode']);
type TalkFormat = typeof TalkFormat.Type;

interface Between {
  readonly min: number;
  readonly max: number;
}

export const TALK_FORMATS = {
  question: {
    title: 'One Question',
    seconds: { min: 45, max: 65 },
    speaker: { min: 0.4, max: 0.55 },
  },
  episode: { title: 'Episode', seconds: { min: 135, max: 170 }, speaker: { min: 0.2, max: 0.3 } },
} as const satisfies Record<
  TalkFormat,
  { readonly title: string; readonly seconds: Between; readonly speaker: Between }
>;

export const TALK_FPS = FOOTAGE_RECIPES.mezzanine.fps;

const ROOM = safeRect(SAFE_ZONES.platforms);

const CAPTION_LIFT = 120;

const HOOK_ACROSS = roomAcross(SAFE_ZONES.platforms, 2 * SHORT_LAYOUT.hook.y - ROOM.top);

const CAPTION_ACROSS = roomAcross(SAFE_ZONES.platforms, ROOM.bottom);

export const TALK_LAYOUT = {
  centre: SHORT_LAYOUT.centre,
  hook: {
    y: SHORT_LAYOUT.hook.y,
    width:
      2 * Math.min(SHORT_LAYOUT.centre - HOOK_ACROSS.left, HOOK_ACROSS.right - SHORT_LAYOUT.centre),
  },
  caption: {
    centre: (CAPTION_ACROSS.left + CAPTION_ACROSS.right) / 2,
    y: ROOM.bottom - CAPTION_LIFT,
    width: CAPTION_ACROSS.right - CAPTION_ACROSS.left,
  },
};

const DEFAULT_GAPS = 0.25;

const WordIndex = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0));

const Strike = Schema.Tuple([WordIndex, WordIndex]);
type Strike = typeof Strike.Type;

const CaptionWord = Schema.String.check(
  Schema.isPattern(/^[^\s{}]+$/, { message: 'a fix is one word, with no space and no { or }' }),
);

const MarkName = Segment.check(
  Schema.isPattern(/^[a-zA-Z0-9_-]+$/, { message: 'a mark is letters, digits, _ and -' }),
);

const keptAt = (index: number, from: number, to: number, cut: ReadonlyArray<Strike>) =>
  index >= from && index <= to && !cut.some(([a, b]) => index >= a && index <= b);

const TalkSection = Schema.Struct({
  id: PartId,
  take: Schema.String,
  from: WordIndex,
  to: WordIndex,
  cut: Schema.optionalKey(Schema.Array(Strike)),
  marks: Schema.optionalKey(Schema.Record(MarkName, WordIndex)),
  timeline: Schema.optionalKey(Timeline),
  knobs: Schema.optionalKey(Knobs),
}).check(
  Schema.makeFilter((section) => {
    const issues: Array<Schema.FilterIssue> = [];
    if (section.from > section.to)
      issues.push({
        path: ['to'],
        issue: `ends at word ${section.to}, before its first, ${section.from}`,
      });
    for (const [i, [a, b]] of (section.cut ?? []).entries())
      if (a > b || a < section.from || b > section.to)
        issues.push({
          path: ['cut', i],
          issue: `strikes words ${a}–${b}, which are not inside ${section.from}–${section.to}`,
        });
    for (const [name, index] of Object.entries(section.marks ?? {}))
      if (!keptAt(index, section.from, section.to, section.cut ?? []))
        issues.push({
          path: ['marks', name],
          issue: `marks word ${index}, which the section does not play`,
        });
    return issues;
  }),
);
type TalkSection = typeof TalkSection.Type;

const TalkQuote = Schema.Struct({ take: Schema.String, from: WordIndex, to: WordIndex });

export const Talk = Schema.Struct({
  title: Schema.String,
  format: TalkFormat,
  hook: Schema.optionalKey(Schema.String),
  takes: Schema.Record(Schema.String, Schema.String),
  gaps: Schema.optionalKey(Seconds),
  fixes: Schema.optionalKey(
    Schema.Record(Schema.String, Schema.Record(Schema.String, CaptionWord)),
  ),
  quotes: Schema.optionalKey(Schema.Array(TalkQuote)),
  outline: Schema.optionalKey(Schema.Array(Schema.String)),
  sections: Schema.NonEmptyArray(TalkSection),
}).check(
  Schema.makeFilter((talk) => {
    const takes = Object.keys(talk.takes);
    const issues: Array<Schema.FilterIssue> = [];
    const unknown = (take: string) => !takes.includes(take);
    for (const [i, section] of talk.sections.entries())
      if (unknown(section.take))
        issues.push({
          path: ['sections', i, 'take'],
          issue: `plays take "${section.take}", which the talk's takes (${takes.join(', ')}) do not name`,
        });
    for (const take of Object.keys(talk.fixes ?? {}))
      if (unknown(take))
        issues.push({
          path: ['fixes', take],
          issue: `fixes take "${take}", which the talk does not name`,
        });
    for (const [i, quote] of (talk.quotes ?? []).entries()) {
      if (unknown(quote.take))
        issues.push({
          path: ['quotes', i, 'take'],
          issue: `quotes take "${quote.take}", which the talk does not name`,
        });
      if (quote.from > quote.to)
        issues.push({
          path: ['quotes', i, 'to'],
          issue: `ends at word ${quote.to}, before its first, ${quote.from}`,
        });
    }
    for (const [key, fixes] of Object.entries(talk.fixes ?? {}))
      for (const index of Object.keys(fixes))
        if (!/^\d+$/.test(index))
          issues.push({ path: ['fixes', key, index], issue: `"${index}" is no word index` });
    return issues;
  }),
);
export type Talk = typeof Talk.Type;

export interface TalkTake {
  readonly source: string;
  readonly words: ReadonlyArray<TakeWord>;
  readonly envelope: ReadonlyArray<number>;
  readonly width: number;
  readonly height: number;
}

class TalkTakeUnready extends Schema.TaggedError<TalkTakeUnready>()('TalkTakeUnready', {
  take: Schema.String,
  footage: Schema.String,
  reason: Schema.String,
}) {
  override get message() {
    return `talk: take "${this.take}" plays footage "${this.footage}", ${this.reason}`;
  }
}

export const talkTranscripts = (talk: Talk, lock: FootageLock): ReadonlyArray<string> =>
  Arr.dedupe(
    Object.values(talk.takes).flatMap((name) =>
      Option.toArray(
        Option.flatMap(Rec.get(lock.footage, name), (entry) =>
          Option.fromUndefinedOr(entry.transcript),
        ),
      ),
    ),
  );

export const talkTakes = (
  talk: Talk,
  lock: FootageLock,
  transcripts: ReadonlyMap<string, FootageTranscript>,
): Result.Result<Readonly<Record<string, TalkTake>>, TalkTakeUnready> =>
  Result.gen(function* () {
    const takes: Record<string, TalkTake> = {};
    for (const [key, name] of Object.entries(talk.takes)) {
      const unready = (reason: string) => () =>
        TalkTakeUnready.make({ take: key, footage: name, reason });
      const entry = yield* Result.fromOption(
        Rec.get(lock.footage, name),
        unready('which the footage library does not have (film footage import)'),
      );
      if (entry.kind !== 'take')
        return yield* Result.fail(
          unready('which is a clip: a talk is cut on a take (film footage import --take)')(),
        );
      const file = yield* Result.fromOption(
        Option.fromUndefinedOr(entry.transcript),
        unready(`which has not been heard (film footage make ${name})`),
      );
      const heard = yield* Result.fromOption(
        Option.fromUndefinedOr(transcripts.get(file)),
        unready(`whose transcript ${file} is not here`),
      );
      const source = sourceOf(name, entry.sha256);
      if (heard.source !== source)
        return yield* Result.fail(
          unready(`whose transcript ${file} was heard from ${heard.source}, not ${source}`)(),
        );
      takes[key] = {
        source,
        words: heard.words,
        envelope: heard.envelope,
        width: entry.probe.picture.width,
        height: entry.probe.picture.height,
      };
    }
    return takes;
  });

export interface Piece {
  readonly from: number;
  readonly to: number;
  readonly at: number;
}

export interface CutSection {
  readonly id: string;
  readonly take: string;
  readonly kept: ReadonlyArray<number>;
  readonly pieces: ReadonlyArray<Piece>;
  readonly seams: ReadonlyArray<number>;
  readonly voice: VoiceTiming;
  readonly timed: Timed;
}

export interface TalkCut {
  readonly sections: ReadonlyArray<CutSection>;
  readonly scenes: ReadonlyArray<Timed>;
  readonly timings: Timings;
}

class TalkWordMissing extends Schema.TaggedError<TalkWordMissing>()('TalkWordMissing', {
  section: Schema.String,
  take: Schema.String,
  index: Schema.Int,
  words: Schema.Int,
}) {
  override get message() {
    return `talk: section "${this.section}" plays word ${this.index} of take "${this.take}", which has ${this.words} words (film talk words)`;
  }
}

class TalkTakeMissing extends Schema.TaggedError<TalkTakeMissing>()('TalkTakeMissing', {
  section: Schema.String,
  take: Schema.String,
}) {
  override get message() {
    return `talk: section "${this.section}" plays take "${this.take}", which has no transcript here (film footage make)`;
  }
}

class TalkSectionSilent extends Schema.TaggedError<TalkSectionSilent>()('TalkSectionSilent', {
  section: Schema.String,
}) {
  override get message() {
    return `talk: section "${this.section}" strikes every word it has, so it plays nothing (restore a word, or remove the section)`;
  }
}

type TalkCutError = TalkWordMissing | TalkTakeMissing | TalkSectionSilent | DuplicateScene;

const STEP = 0.01;

const levelAt = (envelope: ReadonlyArray<number>, t: number): number => {
  const i = frameAtOrBefore(t, 1 / STEP);
  return Arr.match(Arr.getSomes([Arr.get(envelope, i - 1), Arr.get(envelope, i)]), {
    onEmpty: () => 0,
    onNonEmpty: (either) => Math.max(...either),
  });
};

interface Candidate {
  readonly b: number;
  readonly level: number;
  readonly off: number;
}

const QUIETEST: Order.Order<Candidate> = Order.combine(
  Order.mapInput(Order.Number, (c: Candidate) => c.level),
  Order.mapInput(Order.Number, (c: Candidate) => c.off),
);

const quietestIn = (
  envelope: ReadonlyArray<number>,
  from: number,
  to: number,
  toward: number,
): Option.Option<number> => {
  const first = frameAtOrAfter(from, TALK_FPS);
  const last = frameAtOrBefore(to, TALK_FPS);
  const boundaries = Array.from({ length: Math.max(0, last - first + 1) }, (_, k) =>
    secondsAt(first + k, TALK_FPS),
  );
  return Arr.head(
    Arr.sort(
      boundaries.map((b) => ({ b, level: levelAt(envelope, b), off: Math.abs(b - toward) })),
      QUIETEST,
    ).map((c) => c.b),
  );
};

interface KeptWord {
  readonly index: number;
  readonly word: TakeWord;
}

const voicedEndOf = (words: ReadonlyArray<TakeWord>, i: number): number =>
  Option.match(Arr.get(words, i), { onNone: () => 0, onSome: (w) => w.voiced.end });

const voicedStartOf = (words: ReadonlyArray<TakeWord>, i: number, end: number): number =>
  Option.match(Arr.get(words, i), { onNone: () => end, onSome: (w) => w.voiced.start });

interface Run {
  readonly words: Arr.NonEmptyReadonlyArray<KeptWord>;
  readonly piece: Piece;
}

const runsOf = (take: TalkTake, kept: ReadonlyArray<KeptWord>, gaps: number): Array<Run> => {
  const { words, envelope } = take;
  const end = envelope.length * STEP;
  const inBefore = ({ index, word }: KeptWord) =>
    Option.getOrElse(
      quietestIn(
        envelope,
        Math.max(word.voiced.start - gaps / 2, voicedEndOf(words, index - 1)),
        word.voiced.start,
        word.voiced.start,
      ),
      () => secondsAt(frameAtOrBefore(word.voiced.start, TALK_FPS), TALK_FPS),
    );
  const outAfter = ({ index, word }: KeptWord) =>
    Option.getOrElse(
      quietestIn(
        envelope,
        word.voiced.end,
        Math.min(word.voiced.end + gaps / 2, voicedStartOf(words, index + 1, end)),
        word.voiced.end,
      ),
      () => secondsAt(frameAtOrAfter(word.voiced.end, TALK_FPS), TALK_FPS),
    );
  const grouped: Array<Arr.NonEmptyArray<KeptWord>> = [];
  for (const next of kept) {
    const run = Arr.last(grouped);
    const joined = Option.exists(Option.map(run, Arr.lastNonEmpty), (ahead) => {
      const struck = next.index > ahead.index + 1;
      const paused = next.word.voiced.start - ahead.word.voiced.end > gaps;
      return !struck && !paused;
    });
    if (joined && Option.isSome(run)) run.value.push(next);
    else grouped.push([next]);
  }
  const runs: Array<Run> = [];
  let at = 0;
  for (const group of grouped) {
    const from = inBefore(Arr.headNonEmpty(group));
    const to = outAfter(Arr.lastNonEmpty(group));
    runs.push({ words: group, piece: { from, to, at } });
    at += to - from;
  }
  return runs;
};

const onSection = (piece: Piece, t: number) =>
  piece.at + Math.min(piece.to, Math.max(piece.from, t)) - piece.from;

const retimed = (
  runs: ReadonlyArray<Run>,
  spelt: (i: number, text: string) => string,
): Array<TakeWord> =>
  runs.flatMap(({ words, piece }) =>
    words.map(({ index, word }) => {
      const voiced = voicedAt(
        onSection(piece, word.voiced.start),
        onSection(piece, word.voiced.end),
      );
      return {
        text: spelt(index, word.text),
        start: Math.min(voiced.start, onSection(piece, word.start)),
        end: Math.max(voiced.end, onSection(piece, word.end)),
        voiced,
      };
    }),
  );

const keptOf = (section: TalkSection, take: TalkTake): Array<KeptWord> =>
  Arr.getSomes(
    Arr.makeBy(section.to - section.from + 1, (k) => section.from + k).map((index) =>
      Option.map(
        Option.filter(Arr.get(take.words, index), () =>
          keptAt(index, section.from, section.to, section.cut ?? []),
        ),
        (word) => ({ index, word }),
      ),
    ),
  );

export const talkCut = (
  talk: Talk,
  takes: Readonly<Record<string, TalkTake>>,
): Result.Result<TalkCut, TalkCutError> =>
  Result.gen(function* () {
    const gaps = talk.gaps ?? DEFAULT_GAPS;
    const ids = new Set<string>();
    const sections: Array<CutSection> = [];
    for (const section of talk.sections) {
      if (ids.has(section.id))
        return yield* Result.fail(DuplicateScene.make({ scene: section.id }));
      ids.add(section.id);
      const given = Rec.get(takes, section.take);
      if (Option.isNone(given))
        return yield* Result.fail(
          TalkTakeMissing.make({ section: section.id, take: section.take }),
        );
      const take = given.value;
      if (section.to >= take.words.length)
        return yield* Result.fail(
          TalkWordMissing.make({
            section: section.id,
            take: section.take,
            index: section.to,
            words: take.words.length,
          }),
        );
      const kept = keptOf(section, take);
      if (kept.length === 0)
        return yield* Result.fail(TalkSectionSilent.make({ section: section.id }));
      const runs = runsOf(take, kept, gaps);
      const pieces = runs.map((run) => run.piece);
      const fixes = Option.flatMap(Option.fromUndefinedOr(talk.fixes), (all) =>
        Rec.get(all, section.take),
      );
      const spelt = (i: number, text: string) =>
        Option.getOrElse(
          Option.flatMap(fixes, (fixed) => Rec.get(fixed, String(i))),
          () => text,
        );
      const words = retimed(runs, spelt);
      const marksOn = (i: number) =>
        Object.entries(section.marks ?? {}).flatMap(([name, at]) =>
          Option.toArray(Option.liftPredicate(name, () => at === i)),
        );
      const say = kept
        .map(({ index: i }, k) =>
          [...marksOn(i).map((m) => `{${m}}`), words[k]?.text ?? ''].join(''),
        )
        .join(' ');
      const spoken = words.map((w) => w.text).join(' ');
      const duration = pieces.reduce((sum, p) => sum + (p.to - p.from), 0);
      const voice: VoiceTiming = {
        hash: hashText(spoken),
        file: sourceFile(take.source, 'voice.flac'),
        duration,
        words,
        source: 'recorded',
      };
      const timed: Timed = {
        id: section.id,
        say,
        lead: 0,
        tail: 0,
        ...Option.match(Option.fromUndefinedOr(section.timeline), {
          onNone: () => ({}),
          onSome: (timeline) => ({ timeline }),
        }),
        ...Option.match(Option.fromUndefinedOr(section.knobs), {
          onNone: () => ({}),
          onSome: (knobs) => ({ knobs }),
        }),
      };
      sections.push({
        id: section.id,
        take: section.take,
        kept: kept.map((k) => k.index),
        pieces,
        seams: pieces.slice(1).map((p) => p.at),
        voice,
        timed,
      });
    }
    return {
      sections,
      scenes: sections.map((s) => s.timed),
      timings: { voice: '', scenes: Object.fromEntries(sections.map((s) => [s.id, s.voice])) },
    };
  });

const quotedAt = (talk: Talk, take: string, index: number) =>
  (talk.quotes ?? []).some((q) => q.take === take && index >= q.from && index <= q.to);

export const talkPhrases = (
  talk: Talk,
  cut: TalkCut,
  placed: ReadonlyArray<Placed>,
): ReadonlyArray<Phrase> =>
  cut.sections.flatMap((section) =>
    Option.match(
      Arr.findFirst(placed, (p) => p.spec.id === section.id),
      {
        onNone: () => [],
        onSome: (p) => {
          const offset = p.start + p.speechStart;
          const end = p.start + p.dur;
          const local = heard(p.voice.words).map((w) => ({
            text: w.text,
            start: w.start + offset,
            end: w.end + offset,
          }));
          const quoted = section.kept.map((index) => quotedAt(talk, section.take, index));
          return phrasesOf(local, new Set(), quoted).map((phrase) => ({
            ...phrase,
            end: Math.min(phrase.end, end),
          }));
        },
      },
    ),
  );
