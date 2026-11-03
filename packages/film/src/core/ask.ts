import {
  Array as Arr,
  Boolean as Bool,
  Match,
  Option,
  Order,
  Predicate,
  Record,
  Result,
  Schema,
  SchemaParser,
  SchemaTransformation,
} from 'effect';
import { Event, Machine, State } from 'effect-machine';
import { repoJson } from './schema.ts';
import { Segment } from './segment.ts';

const ASK_LIMITS = { steps: 12, blocks: 12, next: 12, options: 12 } as const;

const Text = (max: number) =>
  Schema.String.check(
    Schema.makeFilter((text) => text.trim().length > 0 || 'not blank'),
    Schema.isMaxLength(max, { message: `at most ${max} characters` }),
  );

export const AskName = Segment.check(
  Schema.isPattern(/^[a-z][a-z0-9_-]{0,39}$/, {
    message: 'a name of lowercase letters, digits, - and _, a letter first, at most 40',
  }),
);
export type AskName = typeof AskName.Type;

const LabPath = Schema.String.check(
  Schema.isPattern(/^\/api\/(?!.*\.\.)[A-Za-z0-9_.~%/=&?+-]+$/, {
    message: "a path the lab serves, starting /api/ (a board try's image, a set's file)",
  }),
);

export const BoardTryRef = Schema.Struct({
  film: Schema.String,
  panel: Schema.String,
  try: Schema.Int,
});
export type BoardTryRef = typeof BoardTryRef.Type;

export const AskImage = Schema.Struct({
  src: Schema.optionalKey(LabPath),
  board: Schema.optionalKey(BoardTryRef),
  caption: Schema.optionalKey(Text(300)),
});
export type AskImage = typeof AskImage.Type;

const LabName = Schema.String.check(
  Schema.isPattern(/^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/, {
    message: 'a name as the lab lists it (letters, digits, - _ .), never a path',
  }),
);

const OUTCOMES = ['keep', 'revise', 'other'] as const;

const AskKeeps = Schema.Struct({
  film: LabName,
  scenes: Schema.Array(
    Schema.Struct({
      scene: Text(80),
      figures: Schema.optionalKey(Schema.Array(Text(80))),
    }),
  ),
});
export type AskKeeps = typeof AskKeeps.Type;

const AskOption = Schema.Struct({
  value: Text(80),
  label: Text(200),
  image: Schema.optionalKey(AskImage),
  recommended: Schema.optionalKey(Schema.Boolean),
  why: Schema.optionalKey(
    Text(200).annotate({
      description:
        'Why the asker recommends this option, in one line: only on the recommended one.',
    }),
  ),
  outcome: Schema.optionalKey(
    Schema.Literals(OUTCOMES).annotate({
      description:
        "What the answer does: 'keep' (keeps, locks or goes on with what the ask shows), 'revise' (more work), 'other'.",
    }),
  ),
  keeps: Schema.optionalKey(
    AskKeeps.annotate({
      description:
        'On a keep: the film, and each scene with the figures it keeps (scenes: [] for a script, a concept or a Board).',
    }),
  ),
});
type AskOption = typeof AskOption.Type;

export const optionsShown = (options: ReadonlyArray<AskOption>): ReadonlyArray<AskOption> => [
  ...options.filter((o) => o.recommended === true),
  ...options.filter((o) => o.recommended !== true),
];

const Heading = Schema.Struct({ kind: Schema.Literal('heading'), text: Text(200) });
const Prose = Schema.Struct({ kind: Schema.Literal('prose'), text: Text(4000) });
const Picture = Schema.Struct({ kind: Schema.Literal('image'), image: AskImage });
const Choose = Schema.Struct({
  kind: Schema.Literal('choose'),
  id: AskName,
  label: Text(300),
  options: Schema.Array(AskOption),
});
const FreeText = Schema.Struct({
  kind: Schema.Literal('free_text'),
  id: AskName,
  label: Text(300),
  placeholder: Schema.optionalKey(Text(200)),
  required: Schema.optionalKey(
    Schema.Boolean.annotate({
      description:
        'true: the owner must write something before Send (refused on a step with a choose). Left out, the field is optional and the page says so.',
    }),
  ),
});

const ReviewRef = Schema.String.check(
  Schema.isPattern(/^[A-Za-z0-9_][^/\\\0?#]*(\/[A-Za-z0-9_][^/\\\0?#]*)+$/, {
    message:
      'a review ref: its root, then its path under the root (`p5/<folder>/<file>`), as `sets` and the review list them',
  }),
);

const BeatId = Text(80);

const Document = Schema.Struct({
  kind: Schema.Literal('document'),
  ref: ReviewRef,
  caption: Schema.optionalKey(Text(300)),
});
const none = Schema.optionalKey(Schema.Never);

const FilmScript = Schema.Struct({
  kind: Schema.Literal('script'),
  film: LabName,
  series: none,
  draft: none,
  beats: Schema.optionalKey(Schema.Array(BeatId)),
});
const DraftScript = Schema.Struct({
  kind: Schema.Literal('script'),
  series: LabName,
  draft: LabName,
  film: none,
  beats: Schema.optionalKey(Schema.Array(BeatId)),
});
const ScriptBlock = Schema.Union([FilmScript, DraftScript]);
type ScriptBlock = typeof ScriptBlock.Type;

type ScriptSource =
  | { readonly _tag: 'Film'; readonly film: string }
  | { readonly _tag: 'Draft'; readonly series: string; readonly draft: string };

const isFilmScript = (block: ScriptBlock): block is typeof FilmScript.Type =>
  Predicate.isNotUndefined(block.film);

export const scriptSource = (block: ScriptBlock): ScriptSource => {
  if (isFilmScript(block)) return { _tag: 'Film', film: block.film };
  return { _tag: 'Draft', series: block.series, draft: block.draft };
};
const BoardBlock = Schema.Struct({
  kind: Schema.Literal('board'),
  film: LabName,
  panels: Schema.optionalKey(Schema.Array(BeatId)),
});
const Video = Schema.Struct({
  kind: Schema.Literal('video'),
  ref: ReviewRef,
  at: Schema.optionalKey(Schema.Finite.check(Schema.isGreaterThanOrEqualTo(0))),
  caption: Schema.optionalKey(Text(300)),
});
const Audio = Schema.Struct({
  kind: Schema.Literal('audio'),
  film: LabName,
  beat: BeatId,
  attempt: Schema.optionalKey(Text(200)),
  caption: Schema.optionalKey(Text(300)),
});

export const AskBlock = Schema.Union([
  Heading,
  Prose,
  Picture,
  Choose,
  FreeText,
  Document,
  ScriptBlock,
  BoardBlock,
  Video,
  Audio,
]);
export type AskBlock = typeof AskBlock.Type;

export type Material = Extract<
  AskBlock,
  { readonly kind: 'document' | 'script' | 'board' | 'video' | 'audio' }
>;

const MATERIAL: ReadonlySet<AskBlock['kind']> = new Set([
  'document',
  'script',
  'board',
  'video',
  'audio',
]);

const isMaterial = (block: AskBlock): block is Material => MATERIAL.has(block.kind);

const VIDEO_FILE = /\.(mp4|webm|mov|m4v)$/i;

const problemIf = (wrong: boolean, problem: string): ReadonlyArray<string> =>
  Bool.match(wrong, { onFalse: () => [], onTrue: () => [problem] });

const materialProblems = (where: string, block: Material): ReadonlyArray<string> =>
  Match.value(block).pipe(
    Match.discriminatorsExhaustive('kind')({
      document: (d) =>
        problemIf(
          !d.ref.endsWith('.md'),
          `${where}: document ${d.ref} is not a Markdown file (.md)`,
        ),
      script: (s) => namedProblems(where, 'beats', Option.fromUndefinedOr(s.beats)),
      board: (b) => namedProblems(where, 'panels', Option.fromUndefinedOr(b.panels)),
      video: (v) =>
        problemIf(
          !VIDEO_FILE.test(v.ref),
          `${where}: video ${v.ref} is not a video (.mp4, .webm, .mov, .m4v)`,
        ),
      audio: () => [],
    }),
  );

const namedProblems = (
  where: string,
  what: string,
  named: Option.Option<ReadonlyArray<string>>,
): ReadonlyArray<string> =>
  Option.match(named, {
    onNone: () => [],
    onSome: (list) => [
      ...problemIf(list.length === 0, `${where}: ${what} names none: leave it out for all`),
      ...problemIf(new Set(list).size !== list.length, `${where}: ${what} names one twice`),
    ],
  });

export const materialsIn = (
  ask: Ask,
): ReadonlyArray<{ readonly step: AskName; readonly block: Material }> =>
  Record.toEntries(ask.steps).flatMap(([step, s]) =>
    blocksOf(s)
      .filter(isMaterial)
      .map((block) => ({ step, block })),
  );

export type Asking = Extract<AskBlock, { readonly id: string }>;

export const requiredOf = (block: Asking): boolean =>
  Match.value(block).pipe(
    Match.discriminatorsExhaustive('kind')({
      choose: () => true,
      free_text: (t) => t.required === true,
    }),
  );

const AskNext = Schema.Struct({
  to: AskName,
  when: Schema.optionalKey(Schema.Struct({ answer: AskName, is: Schema.Array(Text(80)) })),
});

const PageStep = Schema.Struct({
  title: Schema.optionalKey(Text(80)),
  blocks: Schema.Array(AskBlock),
  next: Schema.Array(AskNext),
});
const EndStep = Schema.Struct({ end: Schema.Literal(true), text: Schema.optionalKey(Text(400)) });

const AskStep = Schema.Union([PageStep, EndStep]);
type AskStep = typeof AskStep.Type;
type PageStep = typeof PageStep.Type;

const decodeAskName = SchemaParser.decodeUnknownResult(AskName);

const AskSteps = Schema.Record(Schema.String, AskStep)
  .check(
    Schema.makeFilter((steps) =>
      Arr.filterMap(Object.keys(steps), (key) =>
        Result.match(decodeAskName(key), {
          onFailure: (issue) => Result.succeed({ path: [key], issue }),
          onSuccess: () => Result.failVoid,
        }),
      ),
    ),
  )
  .pipe(
    Schema.decodeTo(
      Schema.Record(AskName, Schema.toType(AskStep)),
      SchemaTransformation.passthrough(),
    ),
  );

export const Ask = Schema.Struct({
  start: AskName,
  steps: AskSteps,
});
export type Ask = typeof Ask.Type;

const pageOf = (step: AskStep): Option.Option<PageStep> =>
  Option.liftPredicate(step, (s): s is PageStep => 'blocks' in s);

export const blocksOf = (step: AskStep): ReadonlyArray<AskBlock> =>
  Option.match(pageOf(step), { onNone: () => [], onSome: (page) => page.blocks });

export const titleOf = (step: AskStep): Option.Option<string> =>
  Option.flatMap(pageOf(step), (page) => Option.fromUndefinedOr(page.title));

export const endText = (step: AskStep): Option.Option<string> =>
  Option.flatMap(
    Option.liftPredicate(step, (s): s is typeof EndStep.Type => 'end' in s),
    (end) => Option.fromUndefinedOr(end.text),
  );

export const askedIn = (step: AskStep): ReadonlyArray<Asking> =>
  Option.match(pageOf(step), {
    onNone: () => [],
    onSome: (page) => page.blocks.filter((b): b is Asking => 'id' in b),
  });

const ONE_PAGE = AskName.make('ask');
const ONE_END = AskName.make('done');

export const oneQuestion = (blocks: ReadonlyArray<AskBlock>, thanks?: string): Ask => ({
  start: ONE_PAGE,
  steps: {
    [ONE_PAGE]: { blocks, next: [{ to: ONE_END }] },
    [ONE_END]: {
      end: true,
      ...Option.match(Option.fromUndefinedOr(thanks), {
        onNone: () => ({}),
        onSome: (text) => ({ text }),
      }),
    },
  },
});

const blockImages = (block: AskBlock, f: (image: AskImage) => AskImage): AskBlock =>
  Match.value(block).pipe(
    Match.discriminator('kind')('image', (b): AskBlock => ({ ...b, image: f(b.image) })),
    Match.discriminator('kind')('choose', (b): AskBlock => ({
      ...b,
      options: b.options.map((o) =>
        Option.match(Option.fromUndefinedOr(o.image), {
          onNone: () => o,
          onSome: (image) => ({ ...o, image: f(image) }),
        }),
      ),
    })),
    Match.orElse((b) => b),
  );

export const mapImages = (ask: Ask, f: (image: AskImage) => AskImage): Ask => ({
  ...ask,
  steps: Record.map(ask.steps, (step) =>
    Option.match(pageOf(step), {
      onNone: () => step,
      onSome: (page): AskStep => ({ ...page, blocks: page.blocks.map((b) => blockImages(b, f)) }),
    }),
  ),
});

export const imagesIn = (ask: Ask): ReadonlyArray<AskImage> => {
  const all: Array<AskImage> = [];
  mapImages(ask, (image) => {
    all.push(image);
    return image;
  });
  return all;
};

const onFrom = (ask: Ask, name: AskName): ReadonlyArray<AskName> =>
  Option.match(Option.flatMap(Record.get(ask.steps, name), pageOf), {
    onNone: () => [],
    onSome: (page) => page.next.map((n) => n.to),
  });

const reached = (ask: Ask): ReadonlySet<string> => {
  const seen = new Set<string>();
  const walk = (name: AskName): void => {
    if (seen.has(name) || !Record.has(ask.steps, name)) return;
    seen.add(name);
    onFrom(ask, name).forEach(walk);
  };
  walk(ask.start);
  return seen;
};

const loopIn = (ask: Ask): Option.Option<ReadonlyArray<string>> => {
  const done = new Set<string>();
  const visit = (
    name: AskName,
    path: ReadonlyArray<string>,
  ): Option.Option<ReadonlyArray<string>> => {
    if (path.includes(name)) return Option.some([...path, name]);
    if (done.has(name)) return Option.none();
    const loop = Option.firstSomeOf(onFrom(ask, name).map((to) => visit(to, [...path, name])));
    done.add(name);
    return loop;
  };
  return Option.firstSomeOf(Record.keys(ask.steps).map((name) => visit(name, [])));
};

const timesAsked = (ids: ReadonlyMap<string, number>, id: string): number =>
  Option.getOrElse(Option.fromUndefinedOr(ids.get(id)), () => 0);

const pageProblems = (name: string, page: PageStep, ids: ReadonlyMap<string, number>) => {
  const problems: Array<string> = [];
  if (page.blocks.length === 0) problems.push(`step ${name} has no blocks`);
  if (page.blocks.length > ASK_LIMITS.blocks)
    problems.push(`step ${name} has ${page.blocks.length} blocks, at most ${ASK_LIMITS.blocks}`);
  if (page.next.length === 0)
    problems.push(`step ${name} has no next: name where it goes, or end it`);
  if (page.next.length > ASK_LIMITS.next)
    problems.push(`step ${name} has ${page.next.length} ways on, at most ${ASK_LIMITS.next}`);
  page.next.forEach((n, i) => {
    const last = i === page.next.length - 1;
    if (n.to === name) problems.push(`step ${name} goes on to itself`);
    Option.match(Option.fromUndefinedOr(n.when), {
      onNone: () => {
        if (!last)
          problems.push(
            `step ${name}: next ${i + 1} has no when, so the ways after it are never taken`,
          );
      },
      onSome: (when) => {
        if (last)
          problems.push(
            `step ${name}: its last next must have no when, so the step always goes on`,
          );
        const choice = Arr.findFirst(
          page.blocks,
          (b): b is typeof Choose.Type => b.kind === 'choose' && b.id === when.answer,
        );
        Option.match(choice, {
          onNone: () =>
            problems.push(
              `step ${name}: when names ${when.answer}, which is not a choice in this step`,
            ),
          onSome: (c) =>
            when.is
              .filter((v) => !c.options.some((o) => o.value === v))
              .forEach((v) => problems.push(`step ${name}: ${v} is not an option of ${c.id}`)),
        });
      },
    });
  });
  const chooses = page.blocks.some((b) => b.kind === 'choose');
  page.blocks.forEach((b) =>
    Match.value(b).pipe(
      Match.discriminatorsExhaustive('kind')({
        heading: () => {},
        prose: () => {},
        document: (m) => problems.push(...materialProblems(`step ${name}`, m)),
        script: (m) => problems.push(...materialProblems(`step ${name}`, m)),
        board: (m) => problems.push(...materialProblems(`step ${name}`, m)),
        video: (m) => problems.push(...materialProblems(`step ${name}`, m)),
        audio: (m) => problems.push(...materialProblems(`step ${name}`, m)),
        free_text: (t) => {
          if (timesAsked(ids, t.id) > 1) problems.push(`the answer ${t.id} is asked twice`);
          if (requiredOf(t) && chooses)
            problems.push(
              `step ${name}: ${t.id} is required beside a choice: leave it optional (drop required), or ask it on a step of its own`,
            );
        },
        image: (p) => problems.push(...imageProblems(`step ${name}'s image`, p.image)),
        choose: (c) => {
          if (timesAsked(ids, c.id) > 1) problems.push(`the answer ${c.id} is asked twice`);
          if (c.options.length < 2)
            problems.push(`${c.id} offers ${c.options.length} option, at least 2`);
          if (c.options.length > ASK_LIMITS.options)
            problems.push(
              `${c.id} offers ${c.options.length} options, at most ${ASK_LIMITS.options}`,
            );
          const values = c.options.map((o) => o.value);
          if (new Set(values).size !== values.length)
            problems.push(`${c.id} offers one value twice`);
          if (c.options.filter((o) => o.recommended === true).length > 1)
            problems.push(`${c.id} recommends more than one option: recommend one`);
          c.options
            .filter((o) => Predicate.isNotUndefined(o.why) && o.recommended !== true)
            .forEach((o) =>
              problems.push(
                `${c.id}'s option ${o.value} says why but is not recommended: why goes on the recommended option`,
              ),
            );
          c.options.forEach((o) =>
            Option.map(Option.fromUndefinedOr(o.image), (image) =>
              problems.push(...imageProblems(`${c.id}'s option ${o.value}`, image)),
            ),
          );
        },
      }),
    ),
  );
  return problems;
};

const imageProblems = (where: string, image: AskImage): ReadonlyArray<string> => {
  const has = [Predicate.isNotUndefined(image.src), Predicate.isNotUndefined(image.board)];
  if (has.every((h) => !h)) return [`${where} names neither a board try (board) nor a path (src)`];
  return [];
};

export const askProblems = (ask: Ask): ReadonlyArray<string> => {
  const names = Record.keys(ask.steps);
  const problems: Array<string> = [];
  if (!Record.has(ask.steps, ask.start))
    problems.push(`start names ${ask.start}, which is not a step`);
  if (names.length > ASK_LIMITS.steps)
    problems.push(`${names.length} steps, at most ${ASK_LIMITS.steps}`);
  const ids = new Map<string, number>();
  names.forEach((name) =>
    Option.map(Record.get(ask.steps, name), (step) =>
      askedIn(step).forEach((b) => ids.set(b.id, timesAsked(ids, b.id) + 1)),
    ),
  );
  const dangling = names.flatMap((name) =>
    onFrom(ask, name)
      .filter((to) => !Record.has(ask.steps, to))
      .map((to) => `step ${name} goes on to ${to}, which is not a step`),
  );
  problems.push(...dangling);
  names.forEach((name) =>
    Option.map(Option.flatMap(Record.get(ask.steps, name), pageOf), (page) =>
      problems.push(...pageProblems(name, page, ids)),
    ),
  );
  if (!names.some((name) => Option.isNone(Option.flatMap(Record.get(ask.steps, name), pageOf))))
    problems.push('no step ends the ask: add one with end: true');
  const scripts = materialsIn(ask).filter((m) => m.block.kind === 'script');
  if (scripts.length > 1)
    problems.push(
      `the ask shows ${scripts.length} scripts (steps ${scripts.map((s) => s.step).join(', ')}): one script per ask; ask about the next in an ask of its own`,
    );
  const seen = reached(ask);
  names
    .filter((name) => !seen.has(name))
    .forEach((name) => problems.push(`step ${name} is never reached from ${ask.start}`));
  Option.map(loopIn(ask), (path) => problems.push(`the steps loop: ${path.join(' → ')}`));
  return [...new Set(problems)];
};

export const unrecommended = (ask: Ask): ReadonlyArray<string> =>
  Record.toEntries(ask.steps).flatMap(([name, step]) =>
    askedIn(step)
      .filter((b): b is typeof Choose.Type => b.kind === 'choose' && b.options.length >= 2)
      .filter((c) => !c.options.some((o) => o.recommended === true))
      .map(
        (c) => `step ${name}: ${c.id} recommends none of its options: mark one recommended: true`,
      ),
  );

export const AskAnswer = Schema.Union([
  Schema.Struct({ kind: Schema.Literal('choose'), value: Schema.String, label: Schema.String }),
  Schema.Struct({ kind: Schema.Literal('free_text'), text: Schema.String }),
  Schema.Struct({ kind: Schema.Literal('skipped') }),
]);
export type AskAnswer = typeof AskAnswer.Type;

const Answers = Schema.Record(Schema.String, AskAnswer);
export type AskAnswers = typeof Answers.Type;

export const givenAnswers = (answers: AskAnswers): AskAnswers =>
  Record.filter(answers, (a) => a.kind !== 'skipped');

export const StepValues = Schema.Record(
  Schema.String,
  Schema.String.check(Schema.isMaxLength(4000)),
);
export type StepValues = typeof StepValues.Type;

export const filled = (values: StepValues): StepValues =>
  Record.filter(values, (v) => v.trim() !== '');

export const AskState = State({
  Asking: { step: AskName, answers: Answers },
  Answered: { step: AskName, answers: Answers },
  Closed: { answers: Answers, why: Schema.String, at: Schema.optionalKey(Schema.String) },
});
export type AskState = typeof AskState.Type;

export const AskEvent = Event({
  Answer: { step: AskName, values: StepValues },
  Close: { why: Schema.String, at: Schema.optionalKey(Schema.String) },
});
export type AskEvent = typeof AskEvent.Type;

export const askStart = (ask: Ask): AskState => AskState.Asking({ step: ask.start, answers: {} });

export const unansweredText = (b: Asking): string => `${b.label} needs ${neededOf(b)}`;

export const neededText = (b: Asking): string => `Needs ${neededOf(b)}`;

const neededOf = (b: Asking): string =>
  Match.value(b).pipe(
    Match.discriminatorsExhaustive('kind')({
      choose: () => 'a choice',
      free_text: () => 'your words',
    }),
  );

const answerOf = (b: Asking, value: Option.Option<string>): Result.Result<AskAnswer, string> =>
  Match.value(b).pipe(
    Match.discriminatorsExhaustive('kind')({
      free_text: (t): Result.Result<AskAnswer, string> =>
        Option.match(value, {
          onNone: () =>
            Bool.match(requiredOf(t), {
              onTrue: () => Result.fail(unansweredText(t)),
              onFalse: () => Result.succeed({ kind: 'skipped' }),
            }),
          onSome: (text) => Result.succeed({ kind: 'free_text', text: text.trim() }),
        }),
      choose: (c): Result.Result<AskAnswer, string> =>
        Option.match(value, {
          onNone: () => Result.fail(unansweredText(c)),
          onSome: (v) =>
            Option.match(
              Arr.findFirst(c.options, (o) => o.value === v),
              {
                onNone: () => Result.fail(`${v} is not an option of ${c.id}`),
                onSome: (o) => Result.succeed({ kind: 'choose', value: o.value, label: o.label }),
              },
            ),
        }),
    }),
  );

const typedIn = (
  step: AskStep,
  values: StepValues,
): Result.Result<AskAnswers, ReadonlyArray<string>> => {
  const asked = askedIn(step);
  const unknown = Record.keys(values)
    .filter((k) => !asked.some((b) => b.id === k))
    .map((k) => `this step asks no ${k}`);
  const given = filled(values);
  const typed = asked.map((b) =>
    Result.map(answerOf(b, Record.get(given, b.id)), (a) => [b.id, a] as const),
  );
  const problems = [
    ...unknown,
    ...typed.flatMap((r) => Result.match(r, { onSuccess: () => [], onFailure: (p) => [p] })),
  ];
  if (problems.length > 0) return Result.fail(problems);
  return Result.succeed(
    Record.fromEntries(
      typed.flatMap((r) => Result.match(r, { onSuccess: (e) => [e], onFailure: () => [] })),
    ),
  );
};

const stepOf = (ask: Ask, name: AskName): Option.Option<AskStep> => Record.get(ask.steps, name);

export const answerRefusal = (
  ask: Ask,
  state: AskState,
  step: AskName,
  values: StepValues,
): Option.Option<string> =>
  Match.value(state).pipe(
    Match.tagsExhaustive({
      Answered: () => Option.some('the ask is answered'),
      Closed: (s) => Option.some(`the ask is closed: ${s.why}`),
      Asking: (s) => {
        if (s.step !== step) return Option.some(`the ask is at step ${s.step}, not ${step}`);
        return Option.match(stepOf(ask, step), {
          onNone: () => Option.some(`the ask has no step ${step}`),
          onSome: (at) =>
            Result.match(typedIn(at, values), {
              onSuccess: () => Option.none(),
              onFailure: (problems) => Option.some(problems.join('; ')),
            }),
        });
      },
    }),
  );

const wayOn = (page: PageStep, answers: AskAnswers): Option.Option<AskName> =>
  Option.map(
    Arr.findFirst(page.next, (n) =>
      Option.match(Option.fromUndefinedOr(n.when), {
        onNone: () => true,
        onSome: (when) =>
          Option.exists(
            Record.get(answers, when.answer),
            (a) => a.kind === 'choose' && when.is.includes(a.value),
          ),
      }),
    ),
    (n) => n.to,
  );

const isChoose = (b: AskBlock): b is typeof Choose.Type => b.kind === 'choose';

interface Recommended {
  readonly step: AskName;
  readonly choose: string;
  readonly option: AskOption;
}

export const recommendedPath = (ask: Ask): ReadonlyArray<Recommended> => {
  const walk = (
    name: AskName,
    answers: AskAnswers,
    seen: ReadonlySet<AskName>,
  ): ReadonlyArray<Recommended> =>
    Option.match(
      Option.filter(Option.flatMap(stepOf(ask, name), pageOf), () => !seen.has(name)),
      {
        onNone: () => [],
        onSome: (page) => {
          const here = page.blocks
            .filter(isChoose)
            .flatMap((c) =>
              c.options
                .filter((o) => o.recommended === true)
                .map((option): Recommended => ({ step: name, choose: c.id, option })),
            );
          const next: AskAnswers = {
            ...answers,
            ...Object.fromEntries(
              here.map((r): readonly [string, AskAnswer] => [
                r.choose,
                { kind: 'choose', value: r.option.value, label: r.option.label },
              ]),
            ),
          };
          return [
            ...here,
            ...Option.match(wayOn(page, next), {
              onNone: () => [],
              onSome: (to) => walk(to, next, new Set([...seen, name])),
            }),
          ];
        },
      },
    );
  return walk(ask.start, {}, new Set());
};

const showsFigures = (ask: Ask): boolean =>
  imagesIn(ask).length > 0 ||
  materialsIn(ask).some(({ block }) => block.kind === 'video' || block.kind === 'board');

export const untypedKeeps = (ask: Ask): ReadonlyArray<string> =>
  Bool.match(showsFigures(ask), {
    onFalse: () => [],
    onTrue: () =>
      Record.toEntries(ask.steps).flatMap(([name, step]) =>
        askedIn(step)
          .filter(isChoose)
          .flatMap((c) =>
            c.options.flatMap((o) => [
              ...problemIf(
                Predicate.isUndefined(o.outcome),
                `step ${name}: ${c.id} option ${o.value} has no outcome: the ask shows scenes or figures (a video, an image, a Board), so give each option outcome: 'keep' | 'revise' | 'other'`,
              ),
              ...problemIf(
                o.outcome === 'keep' && Predicate.isUndefined(o.keeps),
                `step ${name}: ${c.id} option ${o.value} is a keep that names nothing kept: give it keeps: { film, scenes: [{ scene, figures }] } (scenes: [] for a script, a concept or a Board)`,
              ),
            ]),
          ),
      ),
  });

const answered = (
  ask: Ask,
  state: AskState & { readonly _tag: 'Asking' },
  values: StepValues,
): AskState => {
  const page = Option.flatMap(stepOf(ask, state.step), pageOf);
  const typed = Option.flatMap(stepOf(ask, state.step), (step) =>
    Result.getSuccess(typedIn(step, values)),
  );
  const answers = { ...state.answers, ...Option.getOrElse(typed, () => ({})) };
  const to = Option.flatMap(page, (p) => wayOn(p, answers));
  return Option.match(
    Option.filter(to, (t) => Option.isSome(Option.flatMap(stepOf(ask, t), pageOf))),
    {
      onNone: () => AskState.Answered({ step: Option.getOrElse(to, () => state.step), answers }),
      onSome: (step) => AskState.Asking({ step, answers }),
    },
  );
};

export interface Section {
  readonly name: AskName;
  readonly step: AskStep;
  readonly values: StepValues;
}

const chosenIn = (step: AskStep, draft: StepValues): AskAnswers =>
  Record.fromEntries(
    askedIn(step).flatMap((b) =>
      Match.value(b).pipe(
        Match.discriminatorsExhaustive('kind')({
          choose: (c): ReadonlyArray<readonly [string, AskAnswer]> =>
            Option.toArray(
              Option.flatMap(Record.get(draft, c.id), (v) =>
                Option.map(
                  Arr.findFirst(c.options, (o) => o.value === v),
                  (o) => [c.id, { kind: 'choose', value: o.value, label: o.label }] as const,
                ),
              ),
            ),
          free_text: () => [],
        }),
      ),
    ),
  );

export const sectionsOf = (
  ask: Ask,
  state: AskState,
  draft: StepValues,
): ReadonlyArray<Section> => {
  const sections: Array<Section> = [];
  let at = Match.value(state).pipe(
    Match.tag('Asking', (s) => Option.some({ step: s.step, answers: s.answers })),
    Match.orElse(() => Option.none<{ readonly step: AskName; readonly answers: AskAnswers }>()),
  );
  while (Option.isSome(at) && sections.length < Record.size(ask.steps)) {
    const { step: name, answers } = at.value;
    const page = Option.flatMap(stepOf(ask, name), pageOf);
    if (Option.isNone(page)) break;
    const values = Record.filter(draft, (_, id) => askedIn(page.value).some((b) => b.id === id));
    sections.push({ name, step: page.value, values });
    const reached = { ...answers, ...chosenIn(page.value, draft) };
    at = Option.map(
      Option.filter(wayOn(page.value, reached), (to) => !sections.some((s) => s.name === to)),
      (step) => ({ step, answers: reached }),
    );
  }
  return sections;
};

export interface Question {
  readonly step: AskName;
  readonly block: Asking;
  readonly answered: boolean;
}

export const questionsOf = (sections: ReadonlyArray<Section>): ReadonlyArray<Question> =>
  sections.flatMap((s) =>
    askedIn(s.step)
      .filter(requiredOf)
      .map((block) => ({
        step: s.name,
        block,
        answered: Option.isSome(Record.get(filled(s.values), block.id)),
      })),
  );

export const pageRefusal = (
  ask: Ask,
  state: AskState,
  sections: ReadonlyArray<{ readonly step: AskName; readonly values: StepValues }>,
): Option.Option<string> => {
  let run = state;
  for (const section of sections) {
    const why = answerRefusal(ask, run, section.step, filled(section.values));
    if (Option.isSome(why))
      return Option.some(
        Option.match(Option.flatMap(stepOf(ask, section.step), titleOf), {
          onNone: () => why.value,
          onSome: (title) => `${title}: ${why.value}`,
        }),
      );
    if (run._tag !== 'Asking') return Option.none();
    run = answered(ask, run, filled(section.values));
  }
  return Option.none();
};

export const askMachine = (ask: Ask, from: AskState = askStart(ask)) =>
  Machine.make({ state: AskState, event: AskEvent, initial: from })
    .when(
      AskState.Asking,
      AskEvent.Answer,
      ({ state, event }) => Option.isNone(answerRefusal(ask, state, event.step, event.values)),
      ({ state, event }) => answered(ask, state, event.values),
    )
    .on([AskState.Asking, AskState.Answered], AskEvent.Close, ({ state, event }) =>
      AskState.Closed({
        answers: state.answers,
        why: event.why,
        ...Option.match(Option.fromUndefinedOr(event.at), {
          onNone: () => ({}),
          onSome: (at) => ({ at }),
        }),
      }),
    )
    .final(AskState.Closed);

export const answeredToEnd = (record: Pick<AskRecord, 'ask' | 'answered'>): boolean =>
  record.answered.reduce((state: AskState, a) => {
    if (state._tag !== 'Asking') return state;
    if (Option.isSome(answerRefusal(record.ask, state, a.step, a.values))) return state;
    return answered(record.ask, state, a.values);
  }, askStart(record.ask))._tag === 'Answered';

export const askStatus = (state: AskState): 'asking' | 'answered' | 'closed' =>
  Match.value(state).pipe(
    Match.tagsExhaustive({
      Asking: () => 'asking' as const,
      Answered: () => 'answered' as const,
      Closed: () => 'closed' as const,
    }),
  );

const AskStepAnswer = Schema.Struct({
  step: AskName,
  values: StepValues,
  at: Schema.String,
});

export const AskRecord = Schema.Struct({
  id: AskName,
  title: Text(200),
  why: Text(2000),
  by: Text(80),
  film: Schema.optionalKey(Schema.String),
  production: Schema.optionalKey(Schema.String),
  set: Schema.optionalKey(Schema.String),
  point: Schema.optionalKey(Schema.String),
  override: Schema.optionalKey(Schema.Struct({ quote: Text(4000) })),
  page: Schema.optionalKey(AskName),
  created: Schema.String,
  deadline: Schema.optionalKey(Schema.String),
  ask: Ask,
  shown: Schema.optionalKey(Schema.Record(Schema.String, Schema.String)),
  state: AskState,
  answered: Schema.Array(AskStepAnswer),
});
export type AskRecord = typeof AskRecord.Type;

export const AskRecordJson = repoJson(AskRecord);

export const pageIdOf = (record: Pick<AskRecord, 'id' | 'page'>): AskName =>
  Option.getOrElse(Option.fromUndefinedOr(record.page), () => record.id);

export const NEW_PAGE = 'new';

export const AsksPage = Schema.Struct({ page: AskName, asks: Schema.Array(AskRecord) });
export type AsksPage = typeof AsksPage.Type;

export const asksOnPage = <R extends Pick<AskRecord, 'id' | 'page' | 'created'>>(
  all: ReadonlyArray<R>,
  page: string,
): ReadonlyArray<R> =>
  Arr.sort(
    all.filter((r) => pageIdOf(r) === page),
    Order.combine(
      Order.mapInput(Order.String, (r: R) => r.created),
      Order.mapInput(Order.Boolean, (r: R) => r.id !== page),
    ),
  );

const waiting = (record: Pick<AskRecord, 'state'>): boolean => record.state._tag === 'Asking';

interface PageCount {
  readonly answered: number;
  readonly of: number;
}

export const pageCount = (
  asks: ReadonlyArray<Pick<AskRecord, 'ask' | 'state' | 'answered'>>,
): PageCount => {
  const asked = asks.filter((r) => r.state._tag !== 'Closed' || answeredToEnd(r));
  return { answered: asked.filter((r) => !waiting(r)).length, of: asked.length };
};

export const pageCountText = (count: PageCount): string =>
  `${count.answered} of ${count.of} answered`;

export const nextAsking = (asks: ReadonlyArray<AskRecord>): Option.Option<AskRecord> =>
  Arr.findFirst(asks, waiting);

export const pageOpen = (asks: ReadonlyArray<Pick<AskRecord, 'state'>>): boolean =>
  asks.some(waiting);

export const answersLine = (answers: AskAnswers): string =>
  Record.toEntries(answers)
    .map(([id, a]) =>
      Match.value(a).pipe(
        Match.discriminatorsExhaustive('kind')({
          choose: (c) => `${id}: ${c.label}`,
          free_text: (t) => `${id}: ${t.text}`,
          skipped: () => `${id}: (skipped)`,
        }),
      ),
    )
    .join(' · ');
