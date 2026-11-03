import { Clock, Console, Duration, Effect, Option, Predicate, Ref, Result, Schema } from 'effect';
import { type AiError, Decision, DecisionModel } from 'effect/ai';

import { changes, keepAnswers, readCache } from './cache.js';
import type { JudgedRule } from './rule.js';
import { type Verdict, dayOf } from './store.js';

type SkipReason =
  | 'no-key'
  | 'no-credits'
  | 'timeout'
  | 'rate-limit'
  | 'overloaded'
  | 'http'
  | 'incomplete'
  | 'too-big';

interface Limits {
  readonly bound: number;
  readonly budget: number;
  readonly perQuestion: number;
  readonly deadline: Duration.Input;
}

interface Question {
  readonly rule: JudgedRule;
  readonly text: string;
}

export const questionKey = (question: Question) => `${question.rule.id}\0${question.text}`;

interface Asked {
  readonly answers: ReadonlyMap<string, Verdict>;
  readonly unanswered: ReadonlyArray<Question>;
  readonly reason: Option.Option<SkipReason>;
  readonly usage: { readonly inputTokens: number; readonly outputTokens: number };
}

export const LIMITS: Limits = {
  bound: 200,
  budget: 60_000,
  perQuestion: 30_000,
  deadline: '5 seconds',
};

const PARTS_AT_ONCE = 8;

const billing = (reason: AiError.AiError['reason']) =>
  Predicate.hasProperty(reason, 'description') &&
  Predicate.isString(reason.description) &&
  reason.description.includes('billing_error');

const overloaded = (reason: AiError.AiError['reason']) =>
  reason._tag === 'InternalProviderError' && reason.http?.response?.status === 529;

const reasonOf = (error: AiError.AiError): SkipReason => {
  if (billing(error.reason)) return 'no-credits';
  if (overloaded(error.reason)) return 'overloaded';
  switch (error.reason._tag) {
    case 'InvalidRequestError':
      if (
        Option.exists(Option.fromUndefinedOr(error.reason.description), (words) =>
          words.includes('max_tokens_exceeded'),
        )
      )
        return 'too-big';
      return 'http';
    case 'RateLimitError':
    case 'QuotaExhaustedError':
      return 'rate-limit';
    case 'InvalidOutputError':
    case 'StructuredOutputError':
      return 'incomplete';
    case 'AuthenticationError':
      if (error.reason.kind === 'MissingKey') return 'no-key';
      return 'http';
    default:
      return 'http';
  }
};

const Input = Schema.Record(Schema.String, Schema.String);

const instructionsFor = (rule: JudgedRule, id: string) =>
  `Judge the ${rule.subject} under key ${id}. ${rule.instructions}`;

const RETRIES = 3;

const backoff = (n: number) => Duration.millis(250 * 2 ** n);

const retrying = <A, R>(
  request: Effect.Effect<A, AiError.AiError, R>,
  deadline: Duration.Input,
): Effect.Effect<A, AiError.AiError, R> =>
  Effect.flatMap(Clock.currentTimeMillis, (sent) => {
    const end = sent + Duration.toMillis(Duration.fromInputUnsafe(deadline));
    const attempt = (n: number): Effect.Effect<A, AiError.AiError, R> =>
      Effect.catch(request, (error) => {
        if (n >= RETRIES || !(error.reason._tag === 'RateLimitError' || overloaded(error.reason)))
          return Effect.fail(error);
        const wait = Option.getOrElse(Option.fromUndefinedOr(error.retryAfter), () => backoff(n));
        return Effect.flatMap(Clock.currentTimeMillis, (now) => {
          if (now + Duration.toMillis(wait) >= end) return Effect.fail(error);
          return Effect.andThen(Effect.sleep(wait), attempt(n + 1));
        });
      });
    return attempt(0);
  });

const askPart = (questions: ReadonlyArray<Question>, deadline: Duration.Input) => {
  const ids = questions.map((_, i) => `c${i}`);
  const definition = Decision.make({
    input: Input,
    decisions: Object.fromEntries(
      questions.map(({ rule }, i): [string, Decision.Classify<string>] => [
        `c${i}`,
        Decision.classify({
          instructions: instructionsFor(rule, `c${i}`),
          criteria: rule.criteria,
        }),
      ]),
    ),
  });
  const input = Object.fromEntries(ids.map((id, i) => [id, questions[i]?.text ?? '']));
  return retrying(DecisionModel.decide(definition, { input }), deadline).pipe(
    Effect.timeoutOption(deadline),
    Effect.result,
    Effect.map((result) =>
      Result.match(result, {
        onFailure: (error) => Result.fail(reasonOf(error)),
        onSuccess: Option.match({
          onNone: () => Result.fail<SkipReason>('timeout'),
          onSome: ({ answers, usage }) =>
            Result.succeed({
              answers: questions.flatMap((question, i) =>
                Option.toArray(
                  Option.map(
                    Option.fromUndefinedOr(answers[`c${i}`]),
                    (answer): [string, Verdict] => [
                      questionKey(question),
                      { label: answer.label, probabilities: { ...answer.probabilities } },
                    ],
                  ),
                ),
              ),
              inputTokens: usage.inputTokens ?? 0,
              outputTokens: usage.outputTokens ?? 0,
            }),
        }),
      }),
    ),
  );
};

const WIDE = 1.3;

const RULE_CHARS_PER_TOKEN = 3.2;

const KEY_TOKENS = 9;

const tokensOf = ({ rule, text }: Question) => {
  const criteria = Object.entries(rule.criteria).reduce(
    (n, [label, words]) => n + label.length + String(words).length,
    0,
  );
  const wide = text.split('').filter((unit) => unit.charCodeAt(0) > 0x7f).length;
  const perToken = rule.charsPerToken ?? RULE_CHARS_PER_TOKEN;
  return {
    state: Math.ceil((text.length - wide) / perToken + wide * WIDE) + KEY_TOKENS,
    question: Math.ceil((instructionsFor(rule, 'c000').length + criteria) / RULE_CHARS_PER_TOKEN),
  };
};

export const partsOf = (
  questions: ReadonlyArray<Question>,
  limits: Pick<Limits, 'bound' | 'budget' | 'perQuestion'>,
) => {
  const parts: Array<Array<Question>> = [];
  let part: Array<Question> = [];
  let state = 0;
  let asked = 0;
  let longest = 0;
  for (const question of questions) {
    const cost = tokensOf(question);
    const full =
      part.length >= limits.bound ||
      state + cost.state + asked + cost.question > limits.budget ||
      state + cost.state + Math.max(longest, cost.question) > limits.perQuestion;
    if (part.length > 0 && full) {
      parts.push(part);
      part = [];
      state = 0;
      asked = 0;
      longest = 0;
    }
    part.push(question);
    state += cost.state;
    asked += cost.question;
    longest = Math.max(longest, cost.question);
  }
  if (part.length > 0) parts.push(part);
  return parts;
};

type PartResult = Result.Result<
  {
    readonly answers: ReadonlyArray<readonly [string, Verdict]>;
    readonly inputTokens: number;
    readonly outputTokens: number;
  },
  { readonly reason: SkipReason; readonly questions: ReadonlyArray<Question> }
>;

const RUN_WIDE: ReadonlySet<SkipReason> = new Set([
  'no-key',
  'no-credits',
  'rate-limit',
  'overloaded',
  'timeout',
]);

const askSplitting = (
  questions: ReadonlyArray<Question>,
  deadline: Duration.Input,
  halt: Ref.Ref<Option.Option<SkipReason>>,
): Effect.Effect<ReadonlyArray<PartResult>, never, DecisionModel.DecisionModel> =>
  Effect.flatMap(Ref.get(halt), (halted) => {
    if (Option.isSome(halted))
      return Effect.succeed([Result.fail({ reason: halted.value, questions })]);
    return Effect.flatMap(askPart(questions, deadline), (result) => {
      if (Result.isFailure(result) && result.failure === 'too-big' && questions.length > 1) {
        const half = Math.ceil(questions.length / 2);
        return Effect.map(
          Effect.forEach(
            [questions.slice(0, half), questions.slice(half)],
            (part) => askSplitting(part, deadline, halt),
            { concurrency: 2 },
          ),
          (halves) => halves.flat(),
        );
      }
      const failed = Result.mapError(result, (reason) => ({ reason, questions }));
      if (Result.isFailure(result) && RUN_WIDE.has(result.failure))
        return Effect.as(Ref.set(halt, Option.some(result.failure)), [failed]);
      return Effect.succeed([failed]);
    });
  });

export const ask = Effect.fn('judged.ask')(function* (
  questions: ReadonlyArray<Question>,
  limits: Limits,
) {
  const parts = partsOf(questions, limits);
  const halt = yield* Ref.make(Option.none<SkipReason>());
  const results = yield* Effect.forEach(
    parts,
    (part) => askSplitting(part, limits.deadline, halt),
    { concurrency: PARTS_AT_ONCE },
  );
  const answers = new Map<string, Verdict>();
  const unanswered: Array<Question> = [];
  const reasons: Array<SkipReason> = [];
  let inputTokens = 0;
  let outputTokens = 0;
  for (const result of results.flat())
    Result.match(result, {
      onFailure: (failed) => {
        reasons.push(failed.reason);
        unanswered.push(...failed.questions);
      },
      onSuccess: (part) => {
        for (const [key, answer] of part.answers) answers.set(key, answer);
        inputTokens += part.inputTokens;
        outputTokens += part.outputTokens;
      },
    });
  const asked: Asked = {
    answers,
    unanswered,
    reason: Option.fromUndefinedOr(reasons[0]),
    usage: { inputTokens, outputTokens },
  };
  return asked;
});

const TaggedReason = Schema.Struct({ reason: Schema.Struct({ _tag: Schema.String }) });

export const detailOf = (error: { readonly _tag: string }) =>
  Option.match(Schema.decodeUnknownOption(TaggedReason)(error), {
    onNone: () => error._tag,
    onSome: ({ reason }) => `${error._tag}.${reason._tag}`,
  });

interface RuleItem {
  readonly rule: JudgedRule;
  readonly file: string;
  readonly line: number;
  readonly start: number;
  readonly key: string;
}

interface Finding {
  readonly file: string;
  readonly line: number;
  readonly start: number;
  readonly p: number;
  readonly kept: boolean;
}

interface Outcome {
  readonly rule: JudgedRule;
  readonly findings: ReadonlyArray<Finding>;
  readonly items: number;
  readonly cached: number;
  readonly asked: number;
  readonly skip: Option.Option<{ readonly reason: SkipReason; readonly items: number }>;
  readonly unkept: ReadonlySet<string>;
}

interface Judging<E> extends Limits {
  readonly model: string;
  readonly storeFile: string;
  readonly textsOf: (items: ReadonlyArray<RuleItem>) => Effect.Effect<ReadonlyArray<string>, E>;
}

export const judge = Effect.fn('judged.judge')(function* <E>(
  rules: ReadonlyArray<JudgedRule>,
  items: ReadonlyArray<RuleItem>,
  judging: Judging<E>,
) {
  const cache = yield* readCache(judging.storeFile);
  const day = dayOf(yield* Clock.currentTimeMillis);
  const isCached = (item: RuleItem) => cache.has(item.key);
  const fresh = [
    ...new Map(items.filter((item) => !isCached(item)).map((item) => [item.key, item])).values(),
  ];
  const texts = yield* judging.textsOf(fresh);
  if (texts.length !== fresh.length)
    return yield* Effect.die(`textsOf read ${texts.length} texts of ${fresh.length} items`);
  const questions = fresh.map((item, at) => ({ item, rule: item.rule, text: texts[at] ?? '' }));
  const asked = yield* ask(questions, judging);
  const answered = new Map(
    questions.flatMap((question) =>
      Option.toArray(
        Option.map(
          Option.fromUndefinedOr(asked.answers.get(questionKey(question))),
          (answer): [string, Verdict] => [question.item.key, answer],
        ),
      ),
    ),
  );
  const keeping = { fresh: answered, read: new Set(items.map((item) => item.key)), day };
  let store: Option.Option<ReadonlyMap<string, Verdict>> = Option.some(cache);
  if (changes(cache, keeping))
    store = yield* keepAnswers(judging.storeFile, keeping).pipe(
      Effect.asSome,
      Effect.catch((error) =>
        Console.error(
          `[judged] answers not kept rule=${[...new Set(items.map((item) => item.rule.id))].join(',')} detail=${detailOf(error)}`,
        ).pipe(Effect.as(Option.none<ReadonlyMap<string, Verdict>>())),
      ),
    );
  const held = Option.getOrElse(store, () => cache);
  const renewed = Option.isSome(store);
  const answerOf = (item: RuleItem): Option.Option<{ answer: Verdict; kept: boolean }> =>
    Option.orElse(
      Option.map(Option.fromUndefinedOr(held.get(item.key)), (answer) => ({ answer, kept: true })),
      () =>
        Option.map(
          Option.orElse(Option.fromUndefinedOr(answered.get(item.key)), () =>
            Option.fromUndefinedOr(cache.get(item.key)),
          ),
          (answer) => ({ answer, kept: false }),
        ),
    );
  const keyOfQuestion = new Map(questions.map((question) => [questionKey(question), question]));
  const unanswered = new Set(
    asked.unanswered.flatMap((question) =>
      Option.toArray(
        Option.map(
          Option.fromUndefinedOr(keyOfQuestion.get(questionKey(question))),
          (asking) => asking.item.key,
        ),
      ),
    ),
  );
  const outcomes = rules.map((rule): Outcome => {
    const own = items.filter((item) => item.rule.id === rule.id);
    const left = own.filter((item) => unanswered.has(item.key));
    return {
      rule,
      findings: own.flatMap((item) =>
        Option.toArray(
          Option.flatMap(answerOf(item), ({ answer, kept }) =>
            Option.liftPredicate(
              {
                file: item.file,
                line: item.line,
                start: item.start,
                p: answer.probabilities[rule.reports] ?? 0,
                kept,
              },
              (finding) => finding.p >= rule.threshold,
            ),
          ),
        ),
      ),
      items: own.length,
      cached: own.filter(isCached).length,
      asked: own.filter((item) => !isCached(item)).length,
      skip: Option.flatMap(asked.reason, (reason) =>
        Option.liftPredicate({ reason, items: left.length }, () => left.length > 0),
      ),
      unkept: new Set(
        own
          .filter((item) => !renewed || !Option.exists(answerOf(item), ({ kept }) => kept))
          .map((item) => item.file),
      ),
    };
  });
  return { outcomes, usage: asked.usage, day };
});

const weightOf = (rule: JudgedRule) => {
  if (rule.severity === 'error') return 'error';
  return 'warning';
};

export const findingLine = (rule: JudgedRule, finding: Finding) =>
  `${finding.file}:${finding.line} ${weightOf(rule)} judged(${rule.id}): ${rule.message} p=${finding.p.toFixed(2)}`;

export const runLine = (outcome: Outcome) =>
  Option.match(outcome.skip, {
    onSome: (skip) =>
      `[judged] skipped rule=${outcome.rule.id} reason=${skip.reason} items=${skip.items}`,
    onNone: () =>
      `[judged] rule=${outcome.rule.id} items=${outcome.items} cached=${outcome.cached} asked=${outcome.asked} findings=${outcome.findings.length}`,
  });
