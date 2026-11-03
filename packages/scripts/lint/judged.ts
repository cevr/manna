import { readFileSync } from 'node:fs';
import { relative } from 'node:path';
import { Clock, Effect, Option, Schema } from 'effect';
import { Diagnostic, Plugin, Rule, RuleContext, Visitor } from 'oxlint-plugin-effect/rule-bindings';

import {
  Findings,
  findingsFileOf,
  makersHash,
  ruleSignature,
  textHash,
} from '../src/judged/findings.ts';
import { SELECTORS, itemsOf, parse, selects } from '../src/judged/items.ts';
import { RuleOptions, Settings, cacheModel, ruleKey } from '../src/judged/rule.ts';
import {
  type Answer,
  MAX_AGE_DAYS,
  Store,
  cacheKey,
  dayOf,
  storeFileOf,
} from '../src/judged/store.ts';

type Source = ReturnType<typeof parse>;

export const RULE_IDS = [
  'historyComment',
  'commentClaimsCode',
  'testOracle',
  'silentDrop',
  'scriptSpeech',
] as const;

const SharedSettings = Schema.Struct({ judged: Settings });

type Kept = ReadonlyMap<string, Answer>;

const stores = new Map<string, Option.Option<Kept>>();

const storeAt = (file: string): Option.Option<Kept> =>
  Option.getOrElse(Option.fromUndefinedOr(stores.get(file)), () => readStore(file));

const readStore = (file: string): Option.Option<Kept> => {
  const read = Effect.runSync(
    Effect.try(() => readFileSync(file, 'utf8')).pipe(
      Effect.flatMap(Schema.decodeEffect(Store)),
      Effect.option,
    ),
  );
  const kept = Option.filter(
    Option.map(read, (store): Kept => new Map(Object.entries(store.answers))),
    (answers) => answers.size > 0,
  );
  stores.set(file, kept);
  return kept;
};

let parsed = Option.none<Source>();

const sourceOf = (file: string, text: string): Source => {
  if (Option.isSome(parsed) && parsed.value.file === file && parsed.value.text === text)
    return parsed.value;
  const source = parse(file, text);
  parsed = Option.some(source);
  return source;
};

const OPTIONS_SCHEMA = [
  {
    type: 'object',
    properties: {
      selector: { type: 'string', enum: SELECTORS },
      subject: { type: 'string' },
      instructions: { type: 'string' },
      criteria: { type: 'object', additionalProperties: { type: 'string' } },
      reports: { type: 'string' },
      threshold: { type: 'number', minimum: 0, maximum: 1 },
      message: { type: 'string' },
      charsPerToken: { type: 'number', exclusiveMinimum: 0 },
    },
    required: [
      'selector',
      'subject',
      'instructions',
      'criteria',
      'reports',
      'threshold',
      'message',
    ],
    additionalProperties: false,
  },
];

const findingsFiles = new Map<string, Option.Option<Findings>>();

const findingsAt = (file: string): Option.Option<Findings> =>
  Option.getOrElse(Option.fromUndefinedOr(findingsFiles.get(file)), () => {
    const read = Effect.runSync(
      Effect.try(() => readFileSync(file, 'utf8')).pipe(
        Effect.flatMap(Schema.decodeEffect(Findings)),
        Effect.option,
      ),
    );
    findingsFiles.set(file, read);
    return read;
  });

let hashed = Option.none<{ readonly file: string; readonly text: string; readonly hash: string }>();

const hashOf = (file: string, text: string) => {
  if (Option.isSome(hashed) && hashed.value.file === file && hashed.value.text === text)
    return hashed.value.hash;
  const hash = textHash(text);
  hashed = Option.some({ file, text, hash });
  return hash;
};

interface Reported {
  readonly start: number;
  readonly p: number;
}

const lastRunOf = (
  cwd: string,
  settings: Settings,
  id: string,
  options: RuleOptions,
  file: string,
  text: string,
): Option.Option<ReadonlyArray<Reported>> =>
  findingsAt(findingsFileOf(cwd, settings.checkout)).pipe(
    Option.filter(
      (findings) =>
        findings.store === settings.store &&
        findings.makers === makersHash() &&
        dayOf(Effect.runSync(Clock.currentTimeMillis)) - findings.day <= MAX_AGE_DAYS,
    ),
    Option.filter(
      (findings) => findings.rules[id] === ruleSignature(cacheModel(settings.model), options),
    ),
    Option.flatMap((findings) => Option.fromUndefinedOr(findings.files[file])),
    Option.filter((entry) => entry.hash === hashOf(file, text)),
    Option.flatMap((entry) => Option.fromUndefinedOr(entry.rules[id])),
  );

const keptOf = (
  cwd: string,
  settings: Settings,
  options: RuleOptions,
  file: string,
  text: string,
): ReadonlyArray<Reported> =>
  Option.match(storeAt(storeFileOf(cwd, settings.store)), {
    onNone: () => [],
    onSome: (kept) => {
      const model = cacheModel(settings.model);
      const rule = ruleKey(options);
      return itemsOf(options.selector, sourceOf(file, text)).flatMap((item) =>
        Option.toArray(
          Option.filter(
            Option.map(
              Option.fromUndefinedOr(kept.get(cacheKey(rule, model, item.key))),
              (answer): Reported => ({
                start: item.start,
                p: answer.probabilities[options.reports] ?? 0,
              }),
            ),
            (found) => found.p >= options.threshold,
          ),
        ),
      );
    },
  });

const judgedRule = (id: string) =>
  Rule.define({
    name: id,
    meta: Rule.meta({
      type: 'suggestion',
      description:
        "A judged rule's kept answers (bun run lint:judged asks the model), reported at their lines.",
      schema: OPTIONS_SCHEMA,
    }),
    options: RuleOptions,
    create: function* (options) {
      const context = yield* RuleContext;
      const file = relative(context.cwd, context.filename);
      const settings = Schema.decodeUnknownOption(SharedSettings)(context.settings);
      if (Option.isNone(settings) || !selects(options.selector, file))
        return Visitor.on('Program', () => Effect.void);
      const { judged } = settings.value;
      return Visitor.on('Program', () => {
        const text = context.sourceCode.text;
        const reported = Option.getOrElse(
          lastRunOf(context.cwd, judged, id, options, file, text),
          () => keptOf(context.cwd, judged, options, file, text),
        );
        return Effect.forEach(
          reported,
          ({ start, p }) =>
            context.report(
              Diagnostic.make({
                node: { range: [start, start] },
                message: `${options.message} p=${p.toFixed(2)}`,
              }),
            ),
          { discard: true },
        );
      });
    },
  });

export default Plugin.define({
  name: 'judged',
  rules: Object.fromEntries(RULE_IDS.map((id) => [id, judgedRule(id)])),
});
