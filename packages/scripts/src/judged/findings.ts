import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Schema } from 'effect';

import { type RuleOptions, ruleKey } from './rule.ts';

const Finding = Schema.Struct({
  start: Schema.Finite,
  p: Schema.Finite,
});

export const Findings = Schema.fromJsonString(
  Schema.Struct({
    day: Schema.Finite,
    store: Schema.String,
    makers: Schema.String,
    rules: Schema.Record(Schema.String, Schema.String),
    files: Schema.Record(
      Schema.String,
      Schema.Struct({
        hash: Schema.String,
        rules: Schema.Record(Schema.String, Schema.Array(Finding)),
      }),
    ),
  }),
);

export type Findings = typeof Findings.Type;

export const textHash = (text: string) => createHash('sha256').update(text).digest('hex');

export const ruleSignature = (
  model: string,
  rule: Pick<
    RuleOptions,
    'subject' | 'instructions' | 'criteria' | 'selector' | 'reports' | 'threshold'
  >,
) =>
  createHash('sha256')
    .update([model, ruleKey(rule), rule.selector, rule.reports, String(rule.threshold)].join('\0'))
    .digest('hex');

const MAKERS = ['sources.ts', 'items.ts', 'store.ts'];

let makers = '';

export const makersHash = () => {
  if (makers !== '') return makers;
  const here = dirname(fileURLToPath(import.meta.url));
  const parser = createRequire(import.meta.url).resolve('oxc-parser/package.json');
  makers = textHash(
    [...MAKERS.map((file) => join(here, file)), parser]
      .map((file) => textHash(readFileSync(file, 'utf8')))
      .join('\0'),
  );
  return makers;
};

export const findingsFileOf = (root: string, checkout: string) =>
  join(root, checkout, 'findings.json');
