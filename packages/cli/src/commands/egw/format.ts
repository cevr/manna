import { nodesToText, type Schemas as EGWSchemas } from '@manna/core/egw';
import type {
  SearchParagraphHit,
  SearchResult,
  SearchTopicHit,
  VectorAbsenceReason,
} from '@manna/core/search';
import type { Paragraph, Publication, SearchHit } from '@manna/core/writings';
import { Option, Schema, SchemaGetter } from 'effect';

const JsonString = Schema.Unknown.pipe(
  Schema.encodeTo(Schema.String, {
    decode: SchemaGetter.parseJson(),
    encode: SchemaGetter.stringifyJson({ space: 2 }),
  }),
);

export const encodeJson = Schema.encodeUnknownEffect(JsonString);

export const paragraphRefcode = (paragraph: Paragraph): string =>
  Option.getOrElse(paragraph.refcode, () => `[${paragraph.publicationCode}]`);

export const publicationJson = (publication: Publication) => ({
  id: publication.id,
  code: publication.code,
  title: publication.title,
  author: publication.author,
  paragraphCount: Option.getOrNull(publication.paragraphCount),
});

export const SNIPPET_LIMIT = 200;

const snippetOf = (text: string, full: boolean): string => {
  if (text.length === 0) return '(no content)';
  if (full || text.length <= SNIPPET_LIMIT) return text;
  return `${text.slice(0, SNIPPET_LIMIT)}…`;
};

export const formatLocalSearchResult = (hit: SearchHit, index: number, full = false): string => {
  const ref = paragraphRefcode(hit.paragraph);
  let title = '';
  if (hit.publication.title !== hit.publication.code) {
    title = ` (${hit.publication.title})`;
  }
  const snippet = snippetOf(nodesToText(hit.paragraph.nodes), full);
  return `  ${index + 1}. ${ref}${title}\n     ${snippet}`;
};

export const formatRemoteHit = (hit: EGWSchemas.SearchHit, index: number): string => {
  const ref = hit.refcode_short ?? `[${hit.pub_code}]`;
  const author = Option.fromNullishOr(hit.refcode_long?.match(/\(([^)]+)\)\s*$/)?.[1]);
  let authorSuffix = '';
  if (Option.isSome(author)) {
    authorSuffix = ` — ${author.value}`;
  }
  const title = ` (${hit.pub_name}${authorSuffix})`;
  const rawSnippet = Option.fromNullishOr(hit.snippet);
  let snippet = '';
  if (Option.isSome(rawSnippet)) {
    snippet = rawSnippet.value
      .replace(/<[^>]*>/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 240);
  }
  const actionRequired = Option.fromNullishOr(hit.action_required);
  let gated = '';
  if (Option.isSome(actionRequired)) {
    gated = ` [${actionRequired.value}]`;
  }
  return `  ${index + 1}. ${ref}${title}${gated}\n     ${snippet}`;
};

const formatVectorAbsence = (reason: VectorAbsenceReason): string => {
  if (reason === 'absent') {
    return 'lexical only — no vector index installed (build one with `bun run build:vectors`)';
  }
  if (reason === 'fingerprint') {
    return 'lexical only — the installed vector index was built by a different model';
  }
  if (reason === 'embedder') {
    return 'lexical only — the embedding model is not available on this machine';
  }
  if (reason === 'short-circuit') {
    return 'lexical only — the top lexical hit was decisive, so the vector leg was skipped';
  }
  if (reason === 'loading') {
    return 'lexical only — the vector index is still loading';
  }
  return 'lexical only — this query routes straight to the text index';
};

const formatSearchHit = (hit: SearchParagraphHit, index: number, full: boolean): string => {
  const legs: string[] = [];
  if (Option.isSome(hit.lexicalRank)) legs.push(`text #${String(hit.lexicalRank.value)}`);
  if (Option.isSome(hit.vectorRank)) legs.push(`vector #${String(hit.vectorRank.value)}`);
  let provenance = '';
  if (legs.length > 0) {
    provenance = `  [${legs.join(', ')}]`;
  }
  const snippet = snippetOf(hit.snippet, full);
  const refcode = Option.getOrElse(hit.refcode, () => hit.bookCode);
  let kind = '';
  if (hit.isHeading) {
    kind = ' [chapter]';
  }
  if (hit.backMatter) {
    kind = `${kind} [back matter]`;
  }
  return `  ${String(index + 1)}. ${refcode}${kind} (${hit.bookTitle} — ${hit.author})${provenance}\n     ${snippet}`;
};

export const formatSearchResult = (
  result: SearchResult,
  full = false,
  topics: readonly SearchTopicHit[] = [],
): readonly string[] => {
  const lines: string[] = [];

  if (Option.isSome(result.locate)) {
    const target = result.locate.value;
    lines.push(`Reference: ${target.refcode} — ${target.bookTitle} (${target.bookCode})`);
    lines.push('');
  }

  if (topics.length > 0) {
    lines.push(`Topics (${String(topics.length)}):`);
    for (const topic of topics) {
      lines.push(`  • ${topic.title} [${topic.status}] — /wiki/${topic.slug}`);
    }
    lines.push('');
  }

  if (result.paragraphs.length === 0) {
    lines.push(`No results for "${result.query}".`);
  } else {
    lines.push(`Results for "${result.query}" (${String(result.paragraphs.length)}):`);
    lines.push('');
    for (const [index, hit] of result.paragraphs.entries()) {
      lines.push(formatSearchHit(hit, index, full));
    }
  }

  lines.push('');
  if (result.vector._tag === 'ran') {
    lines.push(
      `hybrid — ${String(result.vector.scanned)} vectors scanned (${result.vector.fingerprint})`,
    );
  } else {
    lines.push(formatVectorAbsence(result.vector.reason));
  }
  return lines;
};
