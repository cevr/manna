import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import { Schema } from 'effect';

import { SELECTORS } from './items.ts';

export const RuleOptions = Schema.Struct({
  selector: Schema.Literals(SELECTORS),
  subject: Schema.String,
  instructions: Schema.String,
  criteria: Schema.Record(Schema.String, Schema.String),
  reports: Schema.String,
  threshold: Schema.Finite.check(Schema.isBetween({ minimum: 0, maximum: 1 })),
  message: Schema.String,
  charsPerToken: Schema.optionalKey(Schema.Finite.check(Schema.isGreaterThan(0))),
}).check(
  Schema.makeFilter(
    (options) =>
      Object.hasOwn(options.criteria, options.reports) ||
      `reports names ${options.reports}, which is none of the criteria's labels`,
  ),
);

export type RuleOptions = typeof RuleOptions.Type;

export interface JudgedRule extends RuleOptions {
  readonly id: string;
  readonly severity: 'warn' | 'error';
}

export const Settings = Schema.Struct({
  model: Schema.String,
  store: Schema.String,
  checkout: Schema.String,
});

export type Settings = typeof Settings.Type;

export const ruleKey = (rule: Pick<RuleOptions, 'subject' | 'instructions' | 'criteria'>) =>
  bytesToHex(
    sha256(
      utf8ToBytes(
        [
          rule.subject,
          rule.instructions,
          ...Object.entries(rule.criteria)
            .toSorted(([a], [b]) => a.localeCompare(b))
            .flatMap(([label, words]) => [label, words]),
        ].join('\0'),
      ),
    ),
  );

export const cacheModel = (model: string) => `typesafe/${model}`;
