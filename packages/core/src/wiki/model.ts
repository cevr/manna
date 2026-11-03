import { Schema } from 'effect';

import { BookNumber, ChapterNumber, VerseNumber } from '../bible/model.js';
import { TOPICS_SCHEMA_MAJOR } from '../corpus-supply/file-artifact.js';
import { CorpusScope } from '../writings/corpus-scope.js';

export const TopicSlug = Schema.NonEmptyString.pipe(Schema.brand('Wiki/TopicSlug'));
export type TopicSlug = typeof TopicSlug.Type;

export const topicSlug = Schema.decodeSync(TopicSlug);

export { TOPICS_SCHEMA_MAJOR };

export class TextInline extends Schema.TaggedClass<TextInline>('Wiki/TextInline')('text', {
  text: Schema.String,
}) {}

export class EmphasisInline extends Schema.TaggedClass<EmphasisInline>('Wiki/EmphasisInline')(
  'emphasis',
  { text: Schema.String },
) {}

export class StrongInline extends Schema.TaggedClass<StrongInline>('Wiki/StrongInline')('strong', {
  text: Schema.String,
}) {}

export class ScriptureInline extends Schema.TaggedClass<ScriptureInline>('Wiki/ScriptureInline')(
  'scripture',
  { text: Schema.String, reference: Schema.NonEmptyString },
) {}

export class CitationInline extends Schema.TaggedClass<CitationInline>('Wiki/CitationInline')(
  'citation',
  { text: Schema.NonEmptyString, refcode: Schema.NonEmptyString },
) {}

export class LinkInline extends Schema.TaggedClass<LinkInline>('Wiki/LinkInline')('link', {
  text: Schema.String,
  href: Schema.NonEmptyString,
}) {}

export const Inline = Schema.Union([
  TextInline,
  EmphasisInline,
  StrongInline,
  ScriptureInline,
  CitationInline,
  LinkInline,
]);
export type Inline = typeof Inline.Type;

export class ParagraphBlock extends Schema.TaggedClass<ParagraphBlock>('Wiki/ParagraphBlock')(
  'paragraph',
  { content: Schema.Array(Inline) },
) {}

export class HeadingBlock extends Schema.TaggedClass<HeadingBlock>('Wiki/HeadingBlock')('heading', {
  level: Schema.Finite.pipe(
    Schema.check(Schema.isInt(), Schema.isBetween({ minimum: 2, maximum: 4 })),
  ),
  content: Schema.Array(Inline),
}) {}

export class BlockquoteBlock extends Schema.TaggedClass<BlockquoteBlock>('Wiki/BlockquoteBlock')(
  'blockquote',
  { content: Schema.Array(Inline) },
) {}

export class ListBlock extends Schema.TaggedClass<ListBlock>('Wiki/ListBlock')('list', {
  ordered: Schema.Boolean,
  items: Schema.Array(Schema.Array(Inline)),
}) {}

export const Block = Schema.Union([ParagraphBlock, HeadingBlock, BlockquoteBlock, ListBlock]);
export type Block = typeof Block.Type;

export const BlocksJson = Schema.fromJsonString(Schema.Array(Block));

export const TopicStatus = Schema.Literals(['flagship', 'catalog']);
export type TopicStatus = typeof TopicStatus.Type;

export class TopicAlias extends Schema.Class<TopicAlias>('Wiki/TopicAlias')({
  alias: Schema.NonEmptyString,
  display: Schema.NonEmptyString,
  canonical: Schema.Boolean,
}) {}

export const TopicEdgeKind = Schema.Literals(['authored', 'backlink']);
export type TopicEdgeKind = typeof TopicEdgeKind.Type;

export class TopicEdge extends Schema.Class<TopicEdge>('Wiki/TopicEdge')({
  slug: TopicSlug,
  kind: TopicEdgeKind,
}) {}

export class WikiPageSummary extends Schema.Class<WikiPageSummary>('Wiki/PageSummary')({
  slug: TopicSlug,
  title: Schema.NonEmptyString,
  status: TopicStatus,
}) {}

export const TopicsUnavailableReason = Schema.Literals([
  'artifact-not-installed',
  'schema-too-new',
]);
export type TopicsUnavailableReason = typeof TopicsUnavailableReason.Type;

export class AuthoredCore extends Schema.Class<AuthoredCore>('Wiki/AuthoredCore')({
  thesis: Schema.Array(Block),
  body: Schema.Array(Block),
  aliases: Schema.Array(TopicAlias),
  edges: Schema.Array(TopicEdge),
}) {}

export const WikiSectionKind = Schema.Literals([
  'key-verses',
  'egw-statements',
  'commentary',
  'pioneer-witnesses',
  'cross-references',
  'related-topics',
]);
export type WikiSectionKind = typeof WikiSectionKind.Type;

export class WikiVerseRef extends Schema.Class<WikiVerseRef>('Wiki/VerseRef')({
  book: BookNumber,
  chapter: ChapterNumber,
  verse: VerseNumber,
  label: Schema.NonEmptyString,
  text: Schema.Option(Schema.String),
}) {}

export class WikiPassageRef extends Schema.Class<WikiPassageRef>('Wiki/PassageRef')({
  start: WikiVerseRef,
  end: Schema.Option(WikiVerseRef),
  label: Schema.NonEmptyString,
  text: Schema.Option(Schema.String),
}) {}

const WikiSnippetAbsence = Schema.Literals(['not-installed']);
type WikiSnippetAbsence = typeof WikiSnippetAbsence.Type;

export class WikiWritingsHit extends Schema.Class<WikiWritingsHit>('Wiki/WritingsHit')({
  refcode: Schema.NonEmptyString,
  bookCode: Schema.NonEmptyString,
  bookTitle: Schema.NonEmptyString,
  author: Schema.NonEmptyString,
  snippet: Schema.Option(Schema.String),
  absence: Schema.Option(WikiSnippetAbsence),
}) {}

export class WikiCommentaryEntry extends Schema.Class<WikiCommentaryEntry>('Wiki/CommentaryEntry')({
  verse: WikiVerseRef,
  refcode: Schema.NonEmptyString,
  bookCode: Schema.NonEmptyString,
  bookTitle: Schema.NonEmptyString,
  content: Schema.String,
}) {}

export class WikiCrossReference extends Schema.Class<WikiCrossReference>('Wiki/CrossReference')({
  from: WikiVerseRef,
  to: WikiVerseRef,
  source: Schema.Literals(['openbible', 'tske']),
  preview: Schema.Option(Schema.String),
}) {}

export class WikiRelatedTopic extends Schema.Class<WikiRelatedTopic>('Wiki/RelatedTopic')({
  slug: TopicSlug,
  title: Schema.NonEmptyString,
  kind: TopicEdgeKind,
}) {}

export class WikiSearchHandoff extends Schema.Class<WikiSearchHandoff>('Wiki/SearchHandoff')({
  query: Schema.NonEmptyString,
  scope: CorpusScope,
}) {}

export class WikiMissingBook extends Schema.Class<WikiMissingBook>('Wiki/MissingBook')({
  refcode: Schema.NonEmptyString,
  bookCode: Schema.NonEmptyString,
  bookTitle: Schema.NonEmptyString,
  author: Schema.NonEmptyString,
  absence: WikiSnippetAbsence,
}) {}

const OpenOnArrival = Schema.Literal(true);
const CollapsedOnArrival = Schema.Literal(false);

const section = <Item extends Schema.Top, Open extends Schema.Top>(item: Item, open: Open) => ({
  items: Schema.Array(item),
  total: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  defaultOpen: open,
});

export class WikiKeyVersesSection extends Schema.TaggedClass<WikiKeyVersesSection>(
  'Wiki/KeyVersesSection',
)('key-verses', section(WikiPassageRef, OpenOnArrival)) {}

export class WikiEgwStatementsSection extends Schema.TaggedClass<WikiEgwStatementsSection>(
  'Wiki/EgwStatementsSection',
)('egw-statements', {
  ...section(WikiWritingsHit, CollapsedOnArrival),
  handoff: Schema.Option(WikiSearchHandoff),
  missingBooks: Schema.Array(WikiMissingBook),
}) {}

export class WikiCommentarySection extends Schema.TaggedClass<WikiCommentarySection>(
  'Wiki/CommentarySection',
)('commentary', section(WikiCommentaryEntry, CollapsedOnArrival)) {}

export class WikiPioneerWitnessesSection extends Schema.TaggedClass<WikiPioneerWitnessesSection>(
  'Wiki/PioneerWitnessesSection',
)('pioneer-witnesses', {
  ...section(WikiWritingsHit, CollapsedOnArrival),
  handoff: Schema.Option(WikiSearchHandoff),
  missingBooks: Schema.Array(WikiMissingBook),
}) {}

export class WikiCrossReferencesSection extends Schema.TaggedClass<WikiCrossReferencesSection>(
  'Wiki/CrossReferencesSection',
)('cross-references', section(WikiCrossReference, CollapsedOnArrival)) {}

export class WikiRelatedTopicsSection extends Schema.TaggedClass<WikiRelatedTopicsSection>(
  'Wiki/RelatedTopicsSection',
)('related-topics', section(WikiRelatedTopic, CollapsedOnArrival)) {}

export const WikiSection = Schema.Union([
  WikiKeyVersesSection,
  WikiEgwStatementsSection,
  WikiCommentarySection,
  WikiPioneerWitnessesSection,
  WikiCrossReferencesSection,
  WikiRelatedTopicsSection,
]);
export type WikiSection = typeof WikiSection.Type;

export const WikiSectionLineup = Schema.Tuple([
  WikiKeyVersesSection,
  WikiEgwStatementsSection,
  WikiCommentarySection,
  WikiPioneerWitnessesSection,
  WikiCrossReferencesSection,
  WikiRelatedTopicsSection,
]);
export type WikiSectionLineup = typeof WikiSectionLineup.Type;

export const WikiSectionsUnavailableReason = Schema.Literals(['sources-not-wired']);
export type WikiSectionsUnavailableReason = typeof WikiSectionsUnavailableReason.Type;

export class WikiPage extends Schema.Class<WikiPage>('Wiki/Page')({
  slug: TopicSlug,
  title: Schema.NonEmptyString,
  status: TopicStatus,
  core: Schema.Option(AuthoredCore),
  sections: WikiSectionLineup,
  unavailable: Schema.Option(TopicsUnavailableReason),
  sectionsUnavailable: Schema.Option(WikiSectionsUnavailableReason),
}) {}

export const WikiPageJson = WikiPage;
export type WikiPageJson = typeof WikiPageJson.Encoded;

export const WikiPageSummaryJson = Schema.Array(WikiPageSummary);
export type WikiPageSummaryJson = typeof WikiPageSummaryJson.Encoded;

export class PhraseDictionaryEntry extends Schema.Class<PhraseDictionaryEntry>(
  'Wiki/PhraseDictionaryEntry',
)({
  alias: Schema.NonEmptyString,
  display: Schema.NonEmptyString,
  slug: TopicSlug,
  canonical: Schema.Boolean,
}) {}

export class PhraseDictionary extends Schema.Class<PhraseDictionary>('Wiki/PhraseDictionary')({
  entries: Schema.Array(PhraseDictionaryEntry),
  unavailable: Schema.Option(TopicsUnavailableReason),
}) {}

export const WikiListInput = Schema.Struct({
  query: Schema.optional(Schema.String),
  letter: Schema.optional(Schema.String),
});
export type WikiListInput = typeof WikiListInput.Type;
