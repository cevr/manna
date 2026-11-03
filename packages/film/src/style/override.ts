import { DateTime, Option, Predicate, Schema } from 'effect';
import type { Decided } from '../core/production.ts';
import { holding } from './decode.ts';
import type { RULES, RuleId } from './rules.ts';

type Freeable = {
  readonly [R in RuleId]: (typeof RULES)[R]['way'] extends 'override' ? R : never;
}[RuleId];

export const Words = Schema.String.check(Schema.isTrimmed(), Schema.isNonEmpty());

const CARRIED = { place: Words, reason: Words };

const Answer = Schema.Struct({ ask: Words, question: Words, value: Words });

export const overrideOf = <R extends Freeable, const F extends Schema.Struct.Fields>(
  rule: R,
  own: F,
) =>
  Schema.Union([
    Schema.Struct({ rule: Schema.Literal(rule), ...CARRIED, quote: Words, ...own }),
    Schema.Struct({ rule: Schema.Literal(rule), ...CARRIED, answer: Answer, ...own }),
  ]).annotate(holding(rule));

const AnyOverride = Schema.Union([
  Schema.Struct({ rule: Schema.String, ...CARRIED, quote: Words }),
  Schema.Struct({ rule: Schema.String, ...CARRIED, answer: Answer }),
]);
type Override = typeof AnyOverride.Type;
const isOverride = Schema.is(AnyOverride);

export const overridesIn = <T>(laid: T): ReadonlyArray<Override> => {
  if (isOverride(laid)) return [laid];
  if (Predicate.isObjectOrArray(laid)) return Object.values(laid).flatMap(overridesIn);
  return [];
};

export const citedBy = (override: Override): string =>
  'quote' in override
    ? `"${override.quote}"`
    : `his pick "${override.answer.value}" for ${override.answer.question} on ask ${override.answer.ask}`;

export interface Laid {
  readonly item: string;
  readonly override: Override;
  readonly since?: number;
}

const pointOn = (item: string) => `item:${item}`;

const cites = (override: Override, decision: Decided): boolean =>
  'quote' in override
    ? Option.contains(decision.quote, override.quote)
    : Option.contains(decision.ask, override.answer.ask) &&
      Option.exists(
        decision.picks,
        (picks) => picks[override.answer.question] === override.answer.value,
      );

const allows = ({ item, override, since }: Laid, decision: Decided): boolean =>
  Option.contains(decision.point, pointOn(item)) &&
  (since === undefined || decision.at > since) &&
  cites(override, decision);

export const whyUnbacked = (
  laid: Laid,
  decisions: ReadonlyArray<Decided>,
): Option.Option<string> => {
  if (decisions.some((decision) => allows(laid, decision))) return Option.none();
  const { item, override, since } = laid;
  const point = pointOn(item);
  const where = `at the point ${point}${since === undefined ? '' : `, filed after his lock (${DateTime.formatIso(DateTime.makeUnsafe(since))})`}`;
  const broken = `${item}'s override of ${override.rule} at ${override.place} is broken`;
  if ('quote' in override)
    return Option.some(
      `${broken}: no decision on his production's ledger ${where} says "${override.quote}": file his words as a decision there (\`film production decide\` with \`--quote\`, \`--set\` and \`--point ${point}\`), then quote them verbatim`,
    );
  const { ask, question, value } = override.answer;
  return Option.some(
    `${broken}: no decision on his production's ledger ${where} answers ask ${ask} with "${value}" for ${question}: ask him with the point ${point} (the lab's \`ask\`, with its \`production\`, \`set\` and \`point\`), then cite the pick his answer files`,
  );
};

export const unbacked = (laid: ReadonlyArray<Laid>, decisions: ReadonlyArray<Decided>) =>
  laid.flatMap((l) =>
    Option.toArray(Option.map(whyUnbacked(l, decisions), (why) => ({ ...l, why }))),
  );
