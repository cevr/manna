import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Schema } from 'effect';

import { type RuleOptions, ruleKey } from './rule.ts';

const Finding = Schema.Struct({
  /** The item's offset in its file, where the plugin reports it. */
  start: Schema.Finite,
  /** The probability of the rule's reporting label. */
  p: Schema.Finite,
});

/**
 * The file's shape: the day of the run (whole days since 1970, UTC), the
 * store it read its answers from (`settings.judged.store`), the hash of the
 * code that made its items, each rule's signature, and each file's hash and
 * each rule's findings in it.
 */
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

/** A file's text as the findings name it: its sha256. */
export const textHash = (text: string) => createHash('sha256').update(text).digest('hex');

/**
 * What a rule's findings depend on: the model, the rule's words (`ruleKey`),
 * its selector, its reporting label and its threshold. The plugin reads a
 * rule's findings only under the signature it computes from its own options.
 */
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

/** The code that makes the items and their keys, by its files beside this one, and the parser it reads them with. */
const MAKERS = ['sources.ts', 'items.ts', 'store.ts'];

/** The hash of the makers, computed once a process. */
let makers = '';

/**
 * A hash of the code that makes the items and their keys: the makers' texts
 * and the parser's `package.json`. A findings file or an items memo made by
 * other code is read as none.
 */
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

/** The findings file of the checkout at `root`: `checkout` (`settings.judged.checkout`) from its root. */
export const findingsFileOf = (root: string, checkout: string) =>
  join(root, checkout, 'findings.json');
