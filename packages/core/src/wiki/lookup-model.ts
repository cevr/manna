import { Option, Schema } from 'effect';

import { VerseReference } from '../bible/model.js';
import { StrongsLexiconEntry } from '../study/model.js';
import { TopicSlug, TopicStatus } from './model.js';
import { isWhitespace } from './normalize.js';

const LookupContext = VerseReference;
type LookupContext = typeof LookupContext.Type;

export class LookupInput extends Schema.Class<LookupInput>('Wiki/LookupInput')({
  text: Schema.NonEmptyString,
  context: Schema.Option(LookupContext),
}) {}

const collapse = (raw: string): string => {
  let text = '';
  let pending = false;
  for (const codePoint of raw) {
    if (isWhitespace(codePoint)) {
      if (text.length > 0) pending = true;
      continue;
    }
    if (pending) {
      text += ' ';
      pending = false;
    }
    text += codePoint;
  }
  return text;
};

export const lookupInputOf = (input: {
  readonly text: string;
  readonly context: Option.Option<LookupContext>;
}): Option.Option<LookupInput> => {
  const text = collapse(input.text);
  if (text.length === 0) return Option.none();
  return Option.some(LookupInput.make({ text, context: input.context }));
};

const TopicMatchKind = Schema.Literals(['exact', 'fuzzy']);
type TopicMatchKind = typeof TopicMatchKind.Type;

export class LookupTopicMatch extends Schema.Class<LookupTopicMatch>('Wiki/LookupTopicMatch')({
  slug: TopicSlug,
  display: Schema.NonEmptyString,
  alias: Schema.NonEmptyString,
  kind: TopicMatchKind,
  canonical: Schema.Boolean,
}) {}

export class LookupStrongsHit extends Schema.Class<LookupStrongsHit>('Wiki/LookupStrongsHit')({
  word: Schema.NonEmptyString,
  entry: Schema.Option(StrongsLexiconEntry),
}) {}

export class LookupVerseHit extends Schema.Class<LookupVerseHit>('Wiki/LookupVerseHit')({
  reference: VerseReference,
  label: Schema.NonEmptyString,
  text: Schema.String,
}) {}

export class LookupWritingsHit extends Schema.Class<LookupWritingsHit>('Wiki/LookupWritingsHit')({
  refcode: Schema.NonEmptyString,
  bookCode: Schema.NonEmptyString,
  bookTitle: Schema.NonEmptyString,
  author: Schema.NonEmptyString,
  snippet: Schema.String,
}) {}

export class LookupCatalogMatch extends Schema.Class<LookupCatalogMatch>('Wiki/LookupCatalogMatch')(
  {
    slug: TopicSlug,
    name: Schema.NonEmptyString,
    status: TopicStatus,
  },
) {}

export class LookupResult extends Schema.Class<LookupResult>('Wiki/LookupResult')({
  text: Schema.NonEmptyString,
  topics: Schema.Array(LookupTopicMatch),
  strongs: Schema.Array(LookupStrongsHit),
  verses: Schema.Array(LookupVerseHit),
  writings: Schema.Array(LookupWritingsHit),
  catalog: Schema.Array(LookupCatalogMatch),
  lonePeek: Schema.Boolean,
}) {}

export const LookupResultJson = LookupResult;
export type LookupResultJson = typeof LookupResultJson.Encoded;

export const LOOKUP_HIT_LIMIT = 8;

export const LOOKUP_TOPIC_LIMIT = 5;
