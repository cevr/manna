import { Match, Option, Schema } from 'effect';

import {
  BlockquoteBlock,
  CitationInline,
  EmphasisInline,
  HeadingBlock,
  LinkInline,
  ListBlock,
  ParagraphBlock,
  ScriptureInline,
  StrongInline,
  TextInline,
  type Block,
  type Inline,
} from '@manna/core/wiki';

const OPEN = '\u0001';
const CLOSE = '\u0002';

const CITATION = /\{\{([^|{}]+)\|([^{}]*)\}\}/gu;
const SCRIPTURE = /\[\[([^|\]]+)(?:\|([^\]]+))?\]\]/gu;
const MARK = '\u001f';
const HTML_COMMENT = /<!--[\s\S]*?-->/gu;

interface BlankCitation {
  readonly refcode: string;
  readonly quote: string;
}

interface Substituted {
  readonly text: string;
  readonly nodes: readonly Inline[];
  readonly blank: readonly BlankCitation[];
}

const isEscaped = (text: string, position: number): boolean => {
  let backslashes = 0;
  let index = position - 1;
  while (index >= 0 && text[index] === '\\') {
    backslashes += 1;
    index -= 1;
  }
  return backslashes % 2 === 1;
};

const QUOTES_TEXT = /[\p{L}\p{N}]/u;

const quotesText = (quote: string): boolean => QUOTES_TEXT.test(quote);

interface Span {
  readonly start: number;
  readonly end: number;
}

const FENCE = /^ {0,3}(`{3,}|~{3,})[^\n]*$/u;
const INDENTED = /^(?: {4}|\t)/u;
const BLANK_LINE = /^[ \t]*$/u;

interface OpenFence {
  readonly marker: string;
  readonly start: number;
}

const fenceOpener = (line: string): Option.Option<string> =>
  Option.fromNullishOr(FENCE.exec(line)).pipe(
    Option.flatMap((match) => Option.fromNullishOr(match[1])),
  );

const closesFence = (line: string, marker: string): boolean => {
  const closer = line.trim();
  return (
    closer.length >= marker.length && [...closer].every((character) => character === marker[0])
  );
};

const blockCodeSpans = (body: string): Span[] => {
  const spans: Span[] = [];
  let fence = Option.none<OpenFence>();
  let indentedStart = Option.none<number>();
  const closeIndented = (end: number): void => {
    if (Option.isNone(indentedStart)) return;
    spans.push({ start: indentedStart.value, end });
    indentedStart = Option.none();
  };
  let offset = 0;
  for (const line of body.split('\n')) {
    const lineStart = offset;
    const lineEnd = offset + line.length;
    offset = lineEnd + 1;
    if (Option.isSome(fence)) {
      if (closesFence(line, fence.value.marker)) {
        spans.push({ start: fence.value.start, end: lineEnd });
        fence = Option.none();
      }
      continue;
    }
    const opener = fenceOpener(line);
    if (Option.isSome(opener)) {
      fence = Option.some({ marker: opener.value, start: lineStart });
      closeIndented(lineStart);
      continue;
    }
    if (INDENTED.test(line)) {
      if (Option.isNone(indentedStart)) indentedStart = Option.some(lineStart);
      continue;
    }
    if (!BLANK_LINE.test(line)) closeIndented(lineStart);
  }
  if (Option.isSome(fence)) spans.push({ start: fence.value.start, end: body.length });
  closeIndented(body.length);
  return spans;
};

const backtickRunEnd = (body: string, from: number, end: number): number => {
  let run = from;
  while (run < end && body[run] === '`') run += 1;
  return run;
};

const findCloser = (
  body: string,
  from: number,
  end: number,
  length: number,
): Option.Option<number> => {
  let search = from;
  while (search < end) {
    if (body[search] !== '`') {
      search += 1;
      continue;
    }
    const candidate = backtickRunEnd(body, search, end);
    if (candidate - search === length) return Option.some(candidate);
    search = candidate;
  }
  return Option.none();
};

const inlineCodeSpans = (body: string, region: Span): readonly Span[] => {
  const spans: Span[] = [];
  let index = region.start;
  while (index < region.end) {
    if (body[index] === '\\') {
      index += 2;
      continue;
    }
    if (body[index] !== '`') {
      index += 1;
      continue;
    }
    const run = backtickRunEnd(body, index, region.end);
    const closed = findCloser(body, run, region.end, run - index);
    if (Option.isNone(closed)) {
      index = run;
      continue;
    }
    spans.push({ start: index, end: closed.value });
    index = closed.value;
  }
  return spans;
};

const openSpans = (body: string, guarded: readonly Span[]): readonly Span[] => {
  const open: Span[] = [];
  let cursor = 0;
  for (const span of guarded) {
    if (span.start > cursor) open.push({ start: cursor, end: span.start });
    cursor = Math.max(cursor, span.end);
  }
  if (cursor < body.length) open.push({ start: cursor, end: body.length });
  return open;
};

const byStart = (a: Span, b: Span): number => a.start - b.start;

const protectedSpans = (body: string): readonly Span[] => {
  const blockSpans = blockCodeSpans(body);
  const inlineSpans = openSpans(body, [...blockSpans].sort(byStart)).flatMap((region) =>
    inlineCodeSpans(body, region),
  );
  return [...blockSpans, ...inlineSpans].sort(byStart);
};

const substitute = (body: string): Substituted => {
  const nodes: Inline[] = [];
  const blank: BlankCitation[] = [];
  const placeholder = (node: Inline): string => {
    nodes.push(node);
    return `${MARK}${String(nodes.length - 1)}${MARK}`;
  };
  const substituteRegion = (region: string): string =>
    region
      .replace(CITATION, (match, refcode: string, quoted: string, position: number) => {
        if (isEscaped(region, position)) return match;
        const trimmed = quoted.trim();
        if (!quotesText(trimmed)) {
          blank.push({ refcode: refcode.trim(), quote: quoted });
          return match;
        }
        return placeholder(CitationInline.make({ refcode: refcode.trim(), text: trimmed }));
      })
      .replace(SCRIPTURE, (...args: readonly unknown[]) => {
        const match = String(args[0]);
        const position = Number(args[3]);
        if (isEscaped(region, position)) return match;
        const reference = String(args[1]).trim();
        const label = Option.fromNullishOr(args[2]).pipe(
          Option.map((value) => String(value).trim()),
          Option.filter((value) => value.length > 0),
        );
        return placeholder(
          ScriptureInline.make({
            reference,
            text: Option.getOrElse(label, () => reference),
          }),
        );
      });

  const guarded = protectedSpans(body);
  const open = openSpans(body, guarded);
  const parts: string[] = [];
  let cursor = 0;
  for (const region of open) {
    if (region.start > cursor) parts.push(body.slice(cursor, region.start));
    parts.push(substituteRegion(body.slice(region.start, region.end)));
    cursor = region.end;
  }
  if (cursor < body.length) parts.push(body.slice(cursor));
  return { text: parts.join(''), nodes, blank } satisfies Substituted;
};

const EncodedText = Schema.Struct({ kind: Schema.Literal('text'), value: Schema.String });
const EncodedInline = Schema.Struct({
  kind: Schema.Literals(['emphasis', 'strong']),
  children: Schema.String,
});
const EncodedLink = Schema.Struct({
  kind: Schema.Literal('link'),
  href: Schema.String,
  children: Schema.String,
});
const EncodedParagraph = Schema.Struct({
  kind: Schema.Literal('paragraph'),
  children: Schema.String,
});
const EncodedHeading = Schema.Struct({
  kind: Schema.Literal('heading'),
  level: Schema.Finite,
  children: Schema.String,
});
const EncodedBlockquote = Schema.Struct({
  kind: Schema.Literal('blockquote'),
  children: Schema.String,
});
const EncodedList = Schema.Struct({
  kind: Schema.Literal('list'),
  ordered: Schema.Boolean,
  children: Schema.String,
});
const EncodedListItem = Schema.Struct({
  kind: Schema.Literal('listItem'),
  children: Schema.String,
});

const Encoded = Schema.Union([
  EncodedText,
  EncodedInline,
  EncodedLink,
  EncodedParagraph,
  EncodedHeading,
  EncodedBlockquote,
  EncodedList,
  EncodedListItem,
]);
type Encoded = typeof Encoded.Type;

const EncodedJson = Schema.fromJsonString(Encoded);
const decodeNode = Schema.decodeUnknownOption(EncodedJson);
const encodeNode = Schema.encodeSync(EncodedJson);

const encode = (node: Encoded): string => `${OPEN}${encodeNode(node)}${CLOSE}`;

const children = (rendered: string): readonly Encoded[] => {
  const found: Encoded[] = [];
  let rest = rendered;
  while (rest.length > 0) {
    const start = rest.indexOf(OPEN);
    if (start === -1) break;
    const end = rest.indexOf(CLOSE, start);
    if (end === -1) break;
    const literal = rest.slice(0, start);
    if (literal.length > 0) found.push({ kind: 'text', value: literal });
    const node = decodeNode(rest.slice(start + 1, end));
    if (Option.isSome(node)) found.push(node.value);
    rest = rest.slice(end + 1);
  }
  if (rest.length > 0) found.push({ kind: 'text', value: rest });
  return found;
};

const restore = (text: string, nodes: readonly Inline[], into: Inline[]): void => {
  let rest = text;
  for (;;) {
    const start = rest.indexOf(MARK);
    if (start === -1) break;
    const end = rest.indexOf(MARK, start + 1);
    if (end === -1) break;
    const digits = rest.slice(start + 1, end);
    const index = Option.liftPredicate(
      digits,
      (value) =>
        value.length > 0 && [...value].every((character) => character >= '0' && character <= '9'),
    ).pipe(Option.map(Number));
    const node = Option.flatMap(index, (value) => Option.fromNullishOr(nodes[value]));
    if (Option.isNone(node)) {
      const literal = rest.slice(0, start) + digits;
      if (literal.length > 0) into.push(TextInline.make({ text: literal }));
      rest = rest.slice(end + 1);
      continue;
    }
    const before = rest.slice(0, start);
    if (before.length > 0) into.push(TextInline.make({ text: before }));
    into.push(node.value);
    rest = rest.slice(end + 1);
  }
  if (rest.length > 0) into.push(TextInline.make({ text: rest }));
};

const inlines = (rendered: string, nodes: readonly Inline[]): readonly Inline[] => {
  const found: Inline[] = [];
  for (const node of children(rendered)) {
    switch (node.kind) {
      case 'text':
        restore(node.value, nodes, found);
        break;
      case 'emphasis':
      case 'strong': {
        const inner = inlines(node.children, nodes);
        const text = inner.map((child) => child.text).join('');
        if (inner.every((child) => child._tag === 'text')) {
          if (text.length > 0) {
            found.push(
              Match.value(node.kind).pipe(
                Match.when('strong', () => StrongInline.make({ text })),
                Match.orElse((): Inline => EmphasisInline.make({ text })),
              ),
            );
          }
          break;
        }
        found.push(...inner);
        break;
      }
      case 'link': {
        const text = inlines(node.children, nodes)
          .map((child) => child.text)
          .join('');
        if (node.href.length > 0) {
          found.push(LinkInline.make({ text, href: node.href }));
          break;
        }
        if (text.length > 0) found.push(TextInline.make({ text }));
        break;
      }
      case 'paragraph':
      case 'heading':
      case 'blockquote':
      case 'list':
      case 'listItem':
        found.push(...inlines(node.children, nodes));
        break;
    }
  }
  return merge(found);
};

const merge = (nodes: readonly Inline[]): readonly Inline[] => {
  const merged: Inline[] = [];
  for (const node of nodes) {
    const previous = merged[merged.length - 1];
    if (node._tag === 'text' && previous?._tag === 'text') {
      merged[merged.length - 1] = TextInline.make({ text: previous.text + node.text });
      continue;
    }
    merged.push(node);
  }
  return merged;
};

const headingLevel = (level: number): 2 | 3 | 4 => {
  if (level <= 2) return 2;
  if (level === 3) return 3;
  return 4;
};

const blocks = (rendered: string, nodes: readonly Inline[]): readonly Block[] => {
  const found: Block[] = [];
  for (const node of children(rendered)) {
    switch (node.kind) {
      case 'paragraph': {
        const content = inlines(node.children, nodes);
        if (content.length > 0) found.push(ParagraphBlock.make({ content }));
        break;
      }
      case 'heading':
        found.push(
          HeadingBlock.make({
            level: headingLevel(node.level),
            content: inlines(node.children, nodes),
          }),
        );
        break;
      case 'blockquote': {
        const content = inlines(node.children, nodes);
        if (content.length > 0) found.push(BlockquoteBlock.make({ content }));
        break;
      }
      case 'list': {
        const items = children(node.children)
          .filter((item) => item.kind === 'listItem')
          .map((item) => inlines(item.children, nodes));
        if (items.length > 0) found.push(ListBlock.make({ ordered: node.ordered, items }));
        break;
      }
      case 'text':
      case 'emphasis':
      case 'strong':
      case 'link':
      case 'listItem':
        break;
    }
  }
  return found;
};

const render = (source: string): string =>
  Bun.markdown.render(source, {
    text: (value: string) => encode({ kind: 'text', value }),
    emphasis: (kids: string) => encode({ kind: 'emphasis', children: kids }),
    strong: (kids: string) => encode({ kind: 'strong', children: kids }),
    link: (kids: string, meta: { readonly href?: string }) =>
      encode({ kind: 'link', href: meta.href ?? '', children: kids }),
    paragraph: (kids: string) => encode({ kind: 'paragraph', children: kids }),
    heading: (kids: string, meta: { readonly level: number }) =>
      encode({ kind: 'heading', level: meta.level, children: kids }),
    blockquote: (kids: string) => encode({ kind: 'blockquote', children: kids }),
    list: (kids: string, meta: { readonly ordered: boolean }) =>
      encode({ kind: 'list', ordered: meta.ordered, children: kids }),
    listItem: (kids: string) => encode({ kind: 'listItem', children: kids }),
    codespan: (kids: string) => kids,
    code: (kids: string) => encode({ kind: 'paragraph', children: kids }),
    image: () => '',
  });

export interface ParsedBody {
  readonly thesis: readonly Block[];
  readonly body: readonly Block[];
  readonly blankCitations: readonly BlankCitation[];
}

export const parseBody = (body: string): ParsedBody => {
  const cleaned = body
    .replace(HTML_COMMENT, '')
    .replaceAll(OPEN, '')
    .replaceAll(CLOSE, '')
    .replaceAll(MARK, '');
  const { text, nodes, blank } = substitute(cleaned);
  const parsed = blocks(render(text), nodes);
  const firstHeading = parsed.findIndex((block) => block._tag === 'heading');
  if (firstHeading === -1) return { thesis: parsed, body: [], blankCitations: blank };
  return {
    thesis: parsed.slice(0, firstHeading),
    body: parsed.slice(firstHeading),
    blankCitations: blank,
  };
};

export const collectCitations = (blocks: readonly Block[]): readonly CitationInline[] => {
  const found: CitationInline[] = [];
  const walk = (content: readonly Inline[]): void => {
    for (const node of content) {
      if (node._tag === 'citation') found.push(node);
    }
  };
  for (const block of blocks) {
    if (block._tag === 'list') {
      for (const item of block.items) walk(item);
      continue;
    }
    walk(block.content);
  }
  return found;
};

export const blocksToText = (blocks: readonly Block[]): string => {
  const parts: string[] = [];
  const walk = (content: readonly Inline[]): void => {
    for (const node of content) parts.push(node.text);
  };
  for (const block of blocks) {
    if (block._tag === 'list') {
      for (const item of block.items) walk(item);
      continue;
    }
    walk(block.content);
  }
  return parts.join(' ');
};
