import { TOPICS_SCHEMA_MAJOR, TOPICS_SCHEMA_MINOR } from '@manna/core/corpus-supply';
import { isBoundaryAt, normalizeAlias, type Block, type CitationInline } from '@manna/core/wiki';
import { Effect, Option, Schema } from 'effect';

import { blocksToText, collectCitations, parseBody, type ParsedBody } from './markdown.js';
import type { TopicSource } from './source.js';

class DuplicateAliasError extends Schema.TaggedError<DuplicateAliasError>()('DuplicateAliasError', {
  alias: Schema.String,
  slugs: Schema.Array(Schema.String),
}) {}

class DuplicateSlugError extends Schema.TaggedError<DuplicateSlugError>()('DuplicateSlugError', {
  slug: Schema.String,
  files: Schema.Array(Schema.String),
}) {}

class OverlayAmbiguityError extends Schema.TaggedError<OverlayAmbiguityError>()(
  'OverlayAmbiguityError',
  { slug: Schema.String, name: Schema.String, catalogIds: Schema.Array(Schema.String) },
) {}

class CitationUnverifiedError extends Schema.TaggedError<CitationUnverifiedError>()(
  'CitationUnverifiedError',
  { slug: Schema.String, refcode: Schema.String, quote: Schema.String, reason: Schema.String },
) {}

class UnknownRelatedSlugError extends Schema.TaggedError<UnknownRelatedSlugError>()(
  'UnknownRelatedSlugError',
  { slug: Schema.String, related: Schema.String },
) {}

export interface ParagraphLookup {
  readonly paragraphsFor: (refcode: string) => Effect.Effect<readonly string[]>;
}

export interface CatalogLookup {
  readonly revision: string;
  readonly idsForName: (name: string) => Effect.Effect<readonly string[]>;
}

interface CompiledTopic {
  readonly slug: string;
  readonly title: string;
  readonly thesis: readonly Block[];
  readonly body: readonly Block[];
  readonly position: number;
}

interface CompiledAlias {
  readonly alias: string;
  readonly display: string;
  readonly slug: string;
  readonly canonical: boolean;
}

interface CompiledEdge {
  readonly from: string;
  readonly to: string;
  readonly kind: 'authored' | 'backlink';
  readonly position: number;
}

interface CompiledCatalogKey {
  readonly slug: string;
  readonly catalogId: string;
  readonly matchedBy: 'override' | 'name';
}

export interface CompiledTopics {
  readonly topics: readonly CompiledTopic[];
  readonly aliases: readonly CompiledAlias[];
  readonly edges: readonly CompiledEdge[];
  readonly catalogKeys: readonly CompiledCatalogKey[];
  readonly bibleDbRevision: string;
  readonly sourceDigest: string;
  readonly schemaMajor: number;
  readonly schemaMinor: number;
}

const normalizeQuote = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[‘’‛′]/gu, "'")
    .replace(/[“”‟″]/gu, '"')
    .replace(/[‐-―−]/gu, '-')
    .replace(/\s+/gu, ' ')
    .trim();

const QUOTES_TEXT = /[\p{L}\p{N}]/u;

const quotesText = (quote: string): boolean => QUOTES_TEXT.test(quote);

interface DigestFields {
  readonly slug: string;
  readonly title: string;
  readonly status: string;
  readonly aliases: readonly string[];
  readonly related: readonly string[];
  readonly catalog: string;
  readonly body: string;
}

const digestFields = (source: TopicSource): DigestFields => {
  const frontmatter = source.frontmatter;
  return {
    slug: frontmatter.slug,
    title: frontmatter.title,
    status: frontmatter.status,
    aliases: frontmatter.aliases ?? [],
    related: frontmatter.related ?? [],
    catalog: Option.getOrElse(Option.fromNullishOr(frontmatter.catalog), () => ''),
    body: source.body,
  };
};

const hashScalar = (hasher: Bun.CryptoHasher, name: string, value: string): void => {
  hasher.update(`${name}:${String(value.length)}:${value}`);
};

const hashList = (hasher: Bun.CryptoHasher, name: string, values: readonly string[]): void => {
  hasher.update(`${name}[${String(values.length)}]:`);
  for (const value of values) hasher.update(`${String(value.length)}:${value}`);
};

const sortBySlug = (sources: readonly TopicSource[]): readonly TopicSource[] =>
  [...sources].sort((a, b) => a.frontmatter.slug.localeCompare(b.frontmatter.slug));

const sourceDigest = (sources: readonly TopicSource[]): Effect.Effect<string> =>
  Effect.sync(() => {
    const hasher = new Bun.CryptoHasher('sha256');
    for (const source of sortBySlug(sources)) {
      const fields = digestFields(source);
      hashScalar(hasher, 'slug', fields.slug);
      hashScalar(hasher, 'title', fields.title);
      hashScalar(hasher, 'status', fields.status);
      hashList(hasher, 'aliases', fields.aliases);
      hashList(hasher, 'related', fields.related);
      hashScalar(hasher, 'catalog', fields.catalog);
      hashScalar(hasher, 'body', fields.body);
    }
    return hasher.digest('hex');
  });

const appendTo = <V>(map: Map<string, V[]>, key: string, value: V): void => {
  const owned = map.get(key) ?? [];
  owned.push(value);
  map.set(key, owned);
};

const rejectDuplicateSlugs = Effect.fn('TopicsCompiler.rejectDuplicateSlugs')(function* (
  approved: readonly TopicSource[],
) {
  const byslug = new Map<string, string[]>();
  for (const source of approved) appendTo(byslug, source.frontmatter.slug, source.file);
  for (const [slug, files] of byslug) {
    if (files.length > 1) return yield* DuplicateSlugError.make({ slug, files });
  }
});

const compileTopicRows = (ordered: readonly TopicSource[]) => {
  const topics: CompiledTopic[] = [];
  const parsed = new Map<string, ParsedBody>();
  for (const [index, source] of ordered.entries()) {
    const body = parseBody(source.body);
    parsed.set(source.frontmatter.slug, body);
    topics.push({
      slug: source.frontmatter.slug,
      title: source.frontmatter.title,
      thesis: body.thesis,
      body: body.body,
      position: index,
    });
  }
  return { topics, parsed };
};

const sourceAliases = (source: TopicSource): readonly CompiledAlias[] => {
  const slug = source.frontmatter.slug;
  const entries = [
    { display: source.frontmatter.title, canonical: true },
    ...(source.frontmatter.aliases ?? []).map((display) => ({ display, canonical: false })),
  ];
  const seen = new Set<string>();
  const aliases: CompiledAlias[] = [];
  for (const entry of entries) {
    const alias = normalizeAlias(entry.display);
    if (alias.length === 0 || seen.has(alias)) continue;
    seen.add(alias);
    aliases.push({ alias, display: entry.display, slug, canonical: entry.canonical });
  }
  return aliases;
};

const compileAliases = Effect.fn('TopicsCompiler.aliases')(function* (
  ordered: readonly TopicSource[],
) {
  const aliases = ordered.flatMap(sourceAliases);
  const aliasOwners = new Map<string, string[]>();
  for (const alias of aliases) appendTo(aliasOwners, alias.alias, alias.slug);
  for (const [alias, owners] of aliasOwners) {
    if (owners.length > 1) return yield* DuplicateAliasError.make({ alias, slugs: owners });
  }
  return aliases;
});

const compileAuthoredEdges = Effect.fn('TopicsCompiler.authoredEdges')(function* (
  ordered: readonly TopicSource[],
) {
  const slugs = new Set(ordered.map((source) => source.frontmatter.slug));
  const edges: CompiledEdge[] = [];
  for (const source of ordered) {
    const from = source.frontmatter.slug;
    for (const [position, related] of (source.frontmatter.related ?? []).entries()) {
      if (!slugs.has(related)) {
        return yield* UnknownRelatedSlugError.make({ slug: from, related });
      }
      edges.push({ from, to: related, kind: 'authored', position });
    }
  }
  return edges;
});

const edgeKey = (edge: Pick<CompiledEdge, 'from' | 'to' | 'kind'>): string =>
  `${edge.from} ${edge.to} ${edge.kind}`;

const sourceBacklinks = (
  from: string,
  body: ParsedBody,
  aliasBySlug: ReadonlyMap<string, readonly string[]>,
  edgeKeys: Set<string>,
): readonly CompiledEdge[] => {
  const haystack = normalizeAlias(`${blocksToText(body.thesis)} ${blocksToText(body.body)}`);
  const backlinks: CompiledEdge[] = [];
  for (const [target, targetAliases] of aliasBySlug) {
    if (target === from) continue;
    if (!targetAliases.some((alias) => containsPhrase(haystack, alias))) continue;
    const key = edgeKey({ from, to: target, kind: 'backlink' });
    if (edgeKeys.has(edgeKey({ from, to: target, kind: 'authored' })) || edgeKeys.has(key)) {
      continue;
    }
    edgeKeys.add(key);
    backlinks.push({ from, to: target, kind: 'backlink', position: backlinks.length });
  }
  return backlinks;
};

const deriveBacklinks = (
  ordered: readonly TopicSource[],
  parsed: ReadonlyMap<string, ParsedBody>,
  aliases: readonly CompiledAlias[],
  authored: readonly CompiledEdge[],
): readonly CompiledEdge[] => {
  const aliasBySlug = new Map<string, string[]>();
  for (const alias of aliases) appendTo(aliasBySlug, alias.slug, alias.alias);
  const edgeKeys = new Set(authored.map(edgeKey));
  return ordered.flatMap((source) => {
    const from = source.frontmatter.slug;
    return Option.match(Option.fromUndefinedOr(parsed.get(from)), {
      onNone: (): readonly CompiledEdge[] => [],
      onSome: (body) => sourceBacklinks(from, body, aliasBySlug, edgeKeys),
    });
  });
};

const catalogKeyFor = Effect.fn('TopicsCompiler.catalogKey')(function* (
  source: TopicSource,
  catalog: CatalogLookup,
) {
  const slug = source.frontmatter.slug;
  const override = Option.fromNullishOr(source.frontmatter.catalog);
  const name = Option.getOrElse(override, () => source.frontmatter.title);
  const ids = yield* catalog.idsForName(name);
  if (ids.length > 1) {
    return yield* OverlayAmbiguityError.make({ slug, name, catalogIds: ids });
  }
  return Option.map(Option.fromNullishOr(ids[0]), (catalogId): CompiledCatalogKey => ({
    slug,
    catalogId,
    matchedBy: Option.match(override, {
      onNone: (): CompiledCatalogKey['matchedBy'] => 'name',
      onSome: () => 'override',
    }),
  }));
});

const compileCatalogKeys = Effect.fn('TopicsCompiler.catalogKeys')(function* (
  ordered: readonly TopicSource[],
  catalog: CatalogLookup,
) {
  const catalogKeys: CompiledCatalogKey[] = [];
  for (const source of ordered) {
    const key = yield* catalogKeyFor(source, catalog);
    if (Option.isSome(key)) catalogKeys.push(key.value);
  }
  return catalogKeys;
});

const citationFailure = Effect.fn('TopicsCompiler.citationFailure')(function* (
  citation: CitationInline,
  paragraphs: ParagraphLookup,
) {
  const quote = normalizeQuote(citation.text);
  if (!quotesText(quote)) return Option.some('citation quotes no text');
  const found = yield* paragraphs.paragraphsFor(citation.refcode);
  if (found.length === 0) {
    return Option.some('refcode resolves to no paragraph in the local writings database');
  }
  if (!found.some((paragraph) => normalizeQuote(paragraph).includes(quote))) {
    return Option.some('quoted text does not appear in the cited paragraph');
  }
  return Option.none<string>();
});

const verifySourceCitations = Effect.fn('TopicsCompiler.verifySourceCitations')(function* (
  slug: string,
  body: ParsedBody,
  paragraphs: ParagraphLookup,
) {
  for (const malformed of body.blankCitations) {
    return yield* CitationUnverifiedError.make({
      slug,
      refcode: malformed.refcode,
      quote: malformed.quote,
      reason: 'citation quotes no text',
    });
  }
  for (const citation of [...collectCitations(body.thesis), ...collectCitations(body.body)]) {
    const failure = yield* citationFailure(citation, paragraphs);
    if (Option.isSome(failure)) {
      return yield* CitationUnverifiedError.make({
        slug,
        refcode: citation.refcode,
        quote: citation.text,
        reason: failure.value,
      });
    }
  }
});

const verifyCitations = Effect.fn('TopicsCompiler.verifyCitations')(function* (
  ordered: readonly TopicSource[],
  parsed: ReadonlyMap<string, ParsedBody>,
  paragraphs: ParagraphLookup,
) {
  for (const source of ordered) {
    const slug = source.frontmatter.slug;
    const body = Option.fromUndefinedOr(parsed.get(slug));
    if (Option.isSome(body)) yield* verifySourceCitations(slug, body.value, paragraphs);
  }
});

export const compileTopics = Effect.fn('TopicsCompiler.compile')(function* (input: {
  readonly sources: readonly TopicSource[];
  readonly paragraphs: ParagraphLookup;
  readonly catalog: CatalogLookup;
}) {
  const approved = input.sources.filter((source) => source.frontmatter.status === 'approved');
  yield* rejectDuplicateSlugs(approved);

  const ordered = sortBySlug(approved);
  const { topics, parsed } = compileTopicRows(ordered);
  const aliases = yield* compileAliases(ordered);
  const authored = yield* compileAuthoredEdges(ordered);
  const edges = [...authored, ...deriveBacklinks(ordered, parsed, aliases, authored)];
  const catalogKeys = yield* compileCatalogKeys(ordered, input.catalog);
  yield* verifyCitations(ordered, parsed, input.paragraphs);

  return {
    topics,
    aliases,
    edges,
    catalogKeys,
    bibleDbRevision: input.catalog.revision,
    sourceDigest: yield* sourceDigest(approved),
    schemaMajor: TOPICS_SCHEMA_MAJOR,
    schemaMinor: TOPICS_SCHEMA_MINOR,
  } satisfies CompiledTopics;
});

const containsPhrase = (haystack: string, phrase: string): boolean => {
  if (phrase.length === 0) return false;
  let from = 0;
  for (;;) {
    const index = haystack.indexOf(phrase, from);
    if (index === -1) return false;
    if (isBoundaryAt(haystack, index - 1) && isBoundaryAt(haystack, index + phrase.length)) {
      return true;
    }
    from = index + 1;
  }
};
