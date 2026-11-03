import { Array as Arr, Option, Result, Schema } from 'effect';
import {
  DELIVERY,
  type Mark,
  inOrder,
  isPause,
  markAt,
  markOfToken,
  marksMisfit,
  tokenOf,
} from './delivery.ts';
import {
  AlignmentMismatch,
  DeliveryInvalid,
  DuplicateMark,
  type LineError,
  TurnInvalid,
  UnknownVoice,
} from './errors.ts';
import { fnv1a } from './random.ts';
import {
  type TakeSource,
  type TakeWord,
  type Timings,
  type Voice,
  VoiceKey,
  type VoiceTiming,
  type Word,
  isCast,
} from './schema.ts';
import { heardAtOrAfter, justBefore } from './time.ts';
import { unmeasured } from './voiced.ts';

export interface Turn {
  readonly voice: string;
  readonly word: number;
}

export interface Parsed {
  readonly spoken: string;
  readonly marks: ReadonlyMap<string, number>;
  readonly turns: ReadonlyArray<Turn>;
  readonly delivery: ReadonlyArray<Mark>;
}

const TOKEN = /\{(@?)([a-zA-Z0-9_-]+)\}/g;

export const parse = (scene: string, text: string): Result.Result<Parsed, LineError> => {
  const marks = new Map<string, number>();
  const turns: Turn[] = [];
  const words: string[] = [];
  const delivery: Mark[] = [];
  for (const token of text.trim().split(/\s+/)) {
    const said = deliveryIn(scene, token, words.length);
    if (Result.isFailure(said)) return Result.fail(said.failure);
    delivery.push(...said.success);
    for (const [, at, name] of token.matchAll(TOKEN)) {
      if (name === undefined) continue;
      if (at === '@') {
        if (Arr.last(turns).pipe(Option.exists((t) => t.word === words.length)))
          return Result.fail(
            TurnInvalid.make({
              scene,
              voice: name,
              reason: 'follows another turn before any word',
            }),
          );
        turns.push({ voice: name, word: words.length });
        continue;
      }
      if (marks.has(name)) return Result.fail(DuplicateMark.make({ scene, mark: name }));
      marks.set(name, words.length);
    }
    const word = wordOf(scene, token);
    if (Result.isFailure(word)) return Result.fail(word.failure);
    words.push(...word.success);
  }
  return finished(scene, { spoken: words.join(' '), marks, turns, delivery: inOrder(delivery) });
};

const deliveryIn = (
  scene: string,
  token: string,
  at: number,
): Result.Result<ReadonlyArray<Mark>, DeliveryInvalid> =>
  Result.all(
    [...token.matchAll(DELIVERY)].map(([raw, sigil = '', arg]) =>
      Result.fromOption(markOfToken(sigil, Option.fromUndefinedOr(arg), at), () =>
        DeliveryInvalid.make({ scene, mark: raw, reason: 'takes no seconds' }),
      ),
    ),
  );

const wordOf = (
  scene: string,
  token: string,
): Result.Result<ReadonlyArray<string>, DeliveryInvalid> => {
  const rest = token.replace(TOKEN, '').replace(DELIVERY, '');
  return Option.match(Option.fromNullishOr(/\{[^}]*\}?|\}/.exec(rest)), {
    onNone: () => Result.succeed([rest].filter((word) => word.length > 0)),
    onSome: (stray) =>
      Result.fail(
        DeliveryInvalid.make({ scene, mark: stray[0], reason: 'is no cue, turn or delivery mark' }),
      ),
  });
};

const finished = (scene: string, parsed: Parsed): Result.Result<Parsed, LineError> => {
  const words = parsed.spoken.split(' ').filter((w) => w.length > 0).length;
  const last = Arr.last(parsed.turns);
  if (Option.isSome(last) && last.value.word >= words)
    return Result.fail(
      TurnInvalid.make({ scene, voice: last.value.voice, reason: 'has no word after it' }),
    );
  return Option.match(marksMisfit(parsed.delivery, words), {
    onNone: () => Result.succeed(parsed),
    onSome: (misfit) =>
      Result.fail(
        DeliveryInvalid.make({
          scene,
          mark: `${tokenOf(misfit.mark)} at word ${markAt(misfit.mark)}`,
          reason: misfit.reason,
        }),
      ),
  });
};

const chunksOf = (text: string): ReadonlyArray<string> => text.trim().split(/(\s+)/);

export const withDelivery = (text: string, marks: ReadonlyArray<Mark>): string => {
  const chunks = chunksOf(text).map((chunk) => chunk.replace(DELIVERY, ''));
  const saying = chunks.flatMap((chunk, i) => {
    if (i % 2 === 1 || chunk.replace(TOKEN, '').length === 0) return [];
    return [i];
  });
  const ordered = inOrder(marks);
  const out = chunks.map((chunk, i) =>
    Option.match(
      Arr.findFirstIndex(saying, (c) => c === i),
      {
        onNone: () => chunk,
        onSome: (word) => markedWord(chunk, word, ordered),
      },
    ),
  );
  return out
    .join('')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
};

const LEADING_TOKENS = /^(?:\{@?[a-zA-Z0-9_-]+\})*/;

const markedWord = (chunk: string, word: number, marks: ReadonlyArray<Mark>): string => {
  const from = Option.getOrElse(
    Option.map(Option.fromNullishOr(LEADING_TOKENS.exec(chunk)), (lead) => lead[0].length),
    () => 0,
  );
  const stress = marks
    .filter((m) => m._tag === 'Stress' && m.word === word)
    .map(tokenOf)
    .join('');
  const pause = marks
    .filter((m) => isPause(m) && m.before === word + 1)
    .map((m) => ` ${tokenOf(m)}`)
    .join('');
  return `${chunk.slice(0, from)}${stress}${chunk.slice(from)}${pause}`;
};

export const takeScript = (parsed: Pick<Parsed, 'spoken' | 'turns'>): string => {
  const turns = new Map(parsed.turns.map((t) => [t.word, t.voice]));
  if (turns.size === 0) return parsed.spoken;
  return parsed.spoken
    .split(' ')
    .map((word, i) => {
      const voice = turns.get(i);
      return voice === undefined ? word : `{@${voice}}${word}`;
    })
    .join(' ');
};

export const Line = Schema.Struct({
  name: Schema.String,
  voiceId: Schema.String,
  text: Schema.String,
});
export type Line = typeof Line.Type;

export const linesOf = (
  scene: string,
  parsed: Pick<Parsed, 'spoken' | 'turns'>,
  voice: Voice,
): Result.Result<ReadonlyArray<Line>, UnknownVoice> => {
  if (parsed.spoken.length === 0) return Result.succeed([]);
  if (!isCast(voice))
    return Arr.match(parsed.turns, {
      onEmpty: () => Result.succeed([{ name: '', voiceId: voice.voiceId, text: parsed.spoken }]),
      onNonEmpty: ([turn]) =>
        Result.fail(UnknownVoice.make({ scene, voice: turn.voice, known: [] })),
    });
  const known = voice.voices.map((v) => v.name);
  const words = parsed.spoken.split(' ');
  const lines: Array<Line> = [];
  let reader = Arr.headNonEmpty(voice.voices);
  let from = 0;
  const readTo = (to: number) => {
    if (to <= from) return;
    const text = words.slice(from, to).join(' ');
    const before = lines.at(-1);
    if (before !== undefined && before.name === reader.name)
      lines[lines.length - 1] = { ...before, text: `${before.text} ${text}` };
    else lines.push({ name: reader.name, voiceId: reader.voiceId, text });
    from = to;
  };
  for (const turn of parsed.turns) {
    const next = voice.voices.find((v) => v.name === turn.voice);
    if (next === undefined)
      return Result.fail(UnknownVoice.make({ scene, voice: turn.voice, known }));
    readTo(turn.word);
    reader = next;
  }
  readTo(words.length);
  return Result.succeed(lines);
};

export const hashText = (s: string): string => fnv1a(s).toString(16).padStart(8, '0');

export const voiceKey = (voice: Voice): string => {
  const settings = Schema.encodeSync(VoiceKey)(voice.settings);
  if (!isCast(voice)) return `${voice.voiceId}/${voice.model}/${settings}`;
  const voices = voice.voices.map((v) => `${v.name}=${v.voiceId}`).join(',');
  return `${voices}/${voice.model}/${settings}`;
};

export const TakeStaleReason = Schema.Literals(['missing', 'text changed', 'voice changed']);
export type TakeStaleReason = typeof TakeStaleReason.Type;

export type TakeState =
  | { readonly _tag: 'Recorded' }
  | { readonly _tag: 'Staging' }
  | { readonly _tag: 'Stale'; readonly reason: TakeStaleReason; readonly recorded: boolean };

const deliveryKey = (marks: ReadonlyArray<Mark>): Option.Option<string> =>
  Option.map(
    Option.liftPredicate(inOrder(marks), (m) => m.length > 0),
    (m) => hashText(m.map((mark) => `${markAt(mark)}${tokenOf(mark)}`).join(' ')),
  );

export const deliveredAs = (marks: ReadonlyArray<Mark>): Pick<VoiceTiming, 'delivered'> =>
  Option.match(deliveryKey(marks), {
    onNone: () => ({}),
    onSome: (delivered) => ({ delivered }),
  });

export const takeState = (
  id: string,
  script: string,
  timings: Timings,
  voice: string,
  delivery: ReadonlyArray<Mark> = [],
): TakeState => {
  const take = timings.scenes[id];
  if (take === undefined) return { _tag: 'Stale', reason: 'missing', recorded: false };
  const recorded = take.source === 'recorded';
  if (!recorded && timings.voice !== voice)
    return { _tag: 'Stale', reason: 'voice changed', recorded };
  if (take.hash !== hashText(script)) return { _tag: 'Stale', reason: 'text changed', recorded };
  if (recorded) return { _tag: 'Recorded' };
  const read = Option.getOrElse(Option.fromUndefinedOr(take.delivered), () => '');
  if (read !== Option.getOrElse(deliveryKey(delivery), () => ''))
    return { _tag: 'Stale', reason: 'text changed', recorded };
  return { _tag: 'Staging' };
};

export const estimate = (spoken: string): Word[] => {
  const out: Word[] = [];
  let t = 0;
  for (const w of spoken.split(/\s+/).filter((x) => x.length > 0)) {
    const letters = w.replace(/[^\p{L}\p{N}]/gu, '').length;
    const dur = 0.16 + letters * 0.045;
    out.push({ text: w, start: t, end: t + dur });
    t += dur + 0.05;
    if (endsSentence(w)) t += 0.45;
    else if (endsClause(w)) t += 0.22;
  }
  return out;
};

export const normalizeWords = (s: string): ReadonlyArray<string> =>
  s
    .normalize('NFC')
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 0);

export const readsWord = (text: string, word: string): boolean => {
  const said = normalizeWords(text);
  const want = normalizeWords(word);
  if (want.length === 0) return false;
  for (let i = 0; i + want.length <= said.length; i++)
    if (want.every((w, k) => said[i + k] === w)) return true;
  return false;
};

export const SENTENCE = /[.?!][”’"')\]]*$/;
export const CLAUSE = /[,—–;:…][”’"')\]]*$/;

export const endsSentence = (text: string): boolean => SENTENCE.test(text);
export const endsClause = (text: string): boolean => CLAUSE.test(text);

export const wordAfter = (
  words: ReadonlyArray<Word>,
  from: number,
  word: string,
): Option.Option<number> =>
  Option.map(
    Arr.findFirst(words, (w) => heardAtOrAfter(w, from) && readsWord(w.text, word)),
    (w) => w.start,
  );

export const cardSaid = <W extends { readonly text: string; readonly start: number }>(
  scene: string,
  words: ReadonlyArray<W>,
  marks: ReadonlyMap<string, number>,
  card: { readonly from: string; readonly to?: string; readonly payoff: string },
): Result.Result<{ readonly said: ReadonlyArray<W>; readonly payoff: number }, string> => {
  const markAt = (name: string) =>
    Result.fromOption(
      Option.fromUndefinedOr(marks.get(name)),
      () => `scene ${scene}: its card starts or ends at {${name}}, which its line does not mark`,
    );
  const to = Option.match(Option.fromUndefinedOr(card.to), {
    onNone: () => Result.succeed(Infinity),
    onSome: markAt,
  });
  return Result.flatMap(markAt(card.from), (from) =>
    Result.flatMap(to, (until) => {
      const said = words.filter((w) => heardAtOrAfter(w, from) && w.start < justBefore(until));
      if (said.length === 0)
        return Result.fail(`scene ${scene}: its card from {${card.from}} sets no words`);
      const payoff = said.findIndex((w) => readsWord(w.text, card.payoff));
      if (payoff < 0)
        return Result.fail(
          `scene ${scene}: its card's payoff "${card.payoff}" is none of its words (${said.map((w) => w.text).join(' ')})`,
        );
      return Result.succeed({ said, payoff });
    }),
  );
};

export const wordsFromAlignment = (
  spoken: string,
  chars: ReadonlyArray<string>,
  starts: ReadonlyArray<number>,
  ends: ReadonlyArray<number>,
  breaks: ReadonlyArray<number> = [],
): Result.Result<Word[], AlignmentMismatch> => {
  const out: Word[] = [];
  const lineStarts = new Set(breaks);
  let start = -1;
  let end = 0;
  let text = '';
  const flush = () => {
    if (text.length > 0) out.push({ text, start, end });
    text = '';
    start = -1;
  };
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i] ?? '';
    if (lineStarts.has(i)) flush();
    if (/\s/.test(c)) {
      flush();
      continue;
    }
    if (start < 0) start = starts[i] ?? 0;
    end = ends[i] ?? end;
    text += c;
  }
  flush();
  const expected = spoken.split(/\s+/).filter((x) => x.length > 0).length;
  if (out.length !== expected)
    return Result.fail(AlignmentMismatch.make({ spoken, words: out.length, expected }));
  return Result.succeed(out);
};

export const heldInside = (words: ReadonlyArray<Word>, duration: number): Word[] =>
  words.map((w) => {
    const start = Math.min(Math.max(0, w.start), duration);
    return { text: w.text, start, end: Math.min(Math.max(start, w.end), duration) };
  });

export interface SceneVoice {
  readonly spoken: string;
  readonly words: ReadonlyArray<TakeWord>;
  readonly duration: number;
  readonly marks: ReadonlyMap<string, number>;
  readonly turns: ReadonlyArray<Turn>;
  readonly delivery: ReadonlyArray<Mark>;
  readonly file: string | undefined;
  readonly recorded: boolean;
  readonly source: TakeSource | undefined;
}

export const lastVoiced = (voice: SceneVoice): number =>
  Math.min(
    voice.duration,
    Option.getOrElse(
      Arr.last(voice.words.map((w) => w.voiced.end).toSorted((a, b) => a - b)),
      () => voice.duration,
    ),
  );

export const voiceFor = (
  id: string,
  text: string,
  timings: Timings | undefined,
): Result.Result<SceneVoice, LineError> =>
  Result.map(parse(id, text), (parsed): SceneVoice => {
    const { spoken, marks, turns, delivery } = parsed;
    if (spoken.length === 0)
      return {
        spoken,
        words: [],
        duration: 0,
        marks: new Map(),
        turns: [],
        delivery: [],
        file: undefined,
        recorded: false,
        source: undefined,
      };
    const take = timings?.scenes[id];
    const recorded = take !== undefined && take.hash === hashText(takeScript(parsed));
    const words = recorded ? take.words : unmeasured(estimate(spoken));
    const duration = recorded ? take.duration : (words[words.length - 1]?.end ?? 0);
    const times = new Map<string, number>();
    for (const [name, index] of marks) {
      const w = words[index] ?? words[words.length - 1];
      times.set(name, index >= words.length ? duration : (w?.start ?? 0));
    }
    return {
      spoken,
      words,
      duration,
      marks: times,
      turns,
      delivery,
      file: recorded ? take.file : undefined,
      recorded,
      source: recorded ? take.source : undefined,
    };
  });
