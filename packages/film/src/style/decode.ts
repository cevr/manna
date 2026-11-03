import { Data, Match, Predicate, Result, Schema, type SchemaIssue } from 'effect';
import { RULES, type RuleId, type Way } from './rules.ts';

const WAY_OUT: Readonly<Record<Way, string>> = {
  none: 'nothing frees it',
  owner: 'no part carries an override of it: only the owner may change it, so ask him first',
  override: "only an override citing the owner's decision on the figure frees it",
};

class StyleRefused extends Data.TaggedError('StyleRefused')<{
  readonly part: string;
  readonly rule: RuleId | undefined;
  readonly why: string;
}> {
  override get message() {
    if (this.rule === undefined) return `${this.part} refused: ${this.why}`;
    const rule = RULES[this.rule];
    return `${this.part} refused by ${this.rule}, ${rule.says} (${rule.source}; ${WAY_OUT[rule.way]}): ${this.why}`;
  }
}

export const holding = (rule: RuleId) => ({ rule });

const isRuleId = (u: unknown): u is RuleId => Predicate.isString(u) && Object.hasOwn(RULES, u);

const heldIn = (annotations: Schema.Annotations.Annotations | undefined): RuleId | undefined => {
  const rule = annotations?.['rule'];
  return isRuleId(rule) ? rule : undefined;
};

export const ruleCheck = <T>(rule: RuleId, holds: (input: T) => true | string) =>
  Schema.makeFilter(holds, holding(rule));

interface Refuses {
  readonly any?: RuleId;
  readonly fields?: Readonly<Record<string, RuleId>>;
}

export const decoder = <S extends Schema.ConstraintDecoder<unknown>>(
  schema: S,
  refuses: Refuses = {},
) => {
  const decode = Schema.decodeUnknownResult(schema, { onExcessProperty: 'error' });
  const byField = new Map<PropertyKey | undefined, RuleId>(Object.entries(refuses.fields ?? {}));
  const firstIn = (issues: ReadonlyArray<SchemaIssue.Issue>, at: PropertyKey | undefined) =>
    issues.reduce<RuleId | undefined>((found, issue) => found ?? ruleOf(issue, at), undefined);
  const ruleOf = (issue: SchemaIssue.Issue, at: PropertyKey | undefined): RuleId | undefined =>
    Match.valueTags(issue, {
      Filter: (i) => heldIn(i.filter.annotations) ?? ruleOf(i.issue, at),
      Pointer: (i) => ruleOf(i.issue, i.path.at(-1) ?? at),
      Encoding: (i) => ruleOf(i.issue, at),
      Composite: (i) => firstIn(i.issues, at),
      AnyOf: (i) => firstIn(i.issues, at) ?? heldIn(i.ast.annotations),
      UnexpectedKey: () => byField.get(at) ?? refuses.any,
      MissingKey: () => undefined,
      InvalidType: () => undefined,
      InvalidValue: () => undefined,
      Forbidden: () => undefined,
      OneOf: () => undefined,
    });
  return (input: S['Encoded'], part: string): S['Type'] =>
    Result.getOrThrowWith(
      decode(input),
      ({ issue, message }) =>
        new StyleRefused({ part, rule: ruleOf(issue, undefined), why: message }),
    );
};
