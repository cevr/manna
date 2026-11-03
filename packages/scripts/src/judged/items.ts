import { Option, Predicate } from 'effect';
import { type Comment, type Node, type Program, parseSync, visitorKeys } from 'oxc-parser';

export const SELECTORS = [
  'comments',
  'commentedCode',
  'testCases',
  'functions',
  'scriptBeats',
] as const;

export type Selector = (typeof SELECTORS)[number];

export interface Item {
  readonly line: number;
  readonly end: number;
  readonly start: number;
  readonly text: string;
  readonly key: string;
}

interface Source {
  readonly file: string;
  readonly text: string;
  readonly program: Program;
  readonly comments: ReadonlyArray<Comment>;
}

export const parse = (file: string, text: string): Source => {
  const { program, comments } = parseSync(file, text);
  return { file, text, program, comments };
};

const CODE_LINES = 80;

const FUNCTION_LINES = 120;

const TEST = /\.(?:test|spec)\.[cm]?tsx?$/;
const NOT_SOURCE = /(?:^|\/)(?:fixtures|e2e|testing)(?:\/|\.ts$)/;
const FILM_SCRIPT = /(?:^|\/)apps\/animations\/src\/films\/.+\/script\.ts$/;
const SERIES_SCRIPT = /(?:^|\/)apps\/animations\/series\/.+\/scripts\/[^/]+\.md$/;

export const selects = (selector: Selector, file: string): boolean => {
  switch (selector) {
    case 'comments':
    case 'commentedCode':
      return !file.endsWith('.md');
    case 'testCases':
      return TEST.test(file);
    case 'functions':
      return !file.endsWith('.md') && !TEST.test(file) && !NOT_SOURCE.test(file);
    case 'scriptBeats':
      return FILM_SCRIPT.test(file) || SERIES_SCRIPT.test(file);
  }
};

export const readByOxlint = (file: string) => !file.endsWith('.md');

const lineReader = (text: string) => {
  const starts = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === '\n') starts.push(i + 1);
  return {
    lineOf: (offset: number) => {
      let low = 0;
      let high = starts.length - 1;
      while (low < high) {
        const mid = Math.ceil((low + high) / 2);
        if ((starts[mid] ?? 0) <= offset) low = mid;
        else high = mid - 1;
      }
      return low + 1;
    },
    startOf: (line: number) => starts[line - 1] ?? 0,
  };
};

const wordsOf = (type: Comment['type'], value: string) => {
  if (type === 'Line') return value.replace(/^ /, '').trimEnd();
  return value
    .split('\n')
    .map((line) => line.replace(/^\s*\*? ?/, '').trimEnd())
    .join('\n')
    .trim();
};

interface Block {
  readonly line: number;
  readonly end: number;
  readonly start: number;
  readonly close: number;
  readonly text: string;
  readonly alone: boolean;
}

const commentBlocks = (source: Source): ReadonlyArray<Block> => {
  const { lineOf, startOf } = lineReader(source.text);
  const blocks: Array<{
    line: number;
    end: number;
    start: number;
    close: number;
    words: Array<string>;
    run: boolean;
    alone: boolean;
  }> = [];
  for (const comment of source.comments) {
    const line = lineOf(comment.start);
    const end = lineOf(comment.end);
    const alone = source.text.slice(startOf(line), comment.start).trim() === '';
    const run = comment.type === 'Line' && alone;
    const last = blocks.at(-1);
    const words = wordsOf(comment.type, comment.value);
    if (run && last?.run === true && last.end === line - 1) {
      last.end = end;
      last.close = comment.end;
      last.words.push(words);
    } else
      blocks.push({
        line,
        end,
        start: comment.start,
        close: comment.end,
        words: [words],
        run,
        alone,
      });
  }
  return blocks
    .map((b) => ({ ...b, text: b.words.join('\n').trim() }))
    .filter((b) => b.text !== '');
};

const isNode = (value: unknown): value is Node =>
  Predicate.hasProperty(value, 'type') && Predicate.isString(value.type);

const childrenOf = (node: Node): ReadonlyArray<Node> =>
  (visitorKeys[node.type] ?? []).flatMap((key) => {
    const value: unknown = Reflect.get(node, key);
    if (Array.isArray(value)) return value.filter(isNode);
    return Option.toArray(Option.liftPredicate(value, isNode));
  });

const walk = (node: Node, visit: (node: Node) => boolean) => {
  if (!visit(node)) return;
  for (const child of childrenOf(node)) walk(child, visit);
};

const foldProse = (text: string) => text.replace(/\s+/g, ' ').trim();

const quoted = (text: string) => `"${text.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`;

const PLACE = new Set(['type', 'start', 'end', 'range', 'loc', 'parent']);

const leftOut = (type: string, key: string) =>
  PLACE.has(key) || (type === 'Literal' && key === 'raw');

const PARSED = new WeakMap<object, string>();

// oxlint-disable-next-line effect/noUnknownParameters -- a parser's fields, whatever their kind, walked whole
const parsedOf = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(parsedOf).join(',')}]`;
  if (Predicate.isString(value)) return quoted(value);
  if (!Predicate.isObject(value)) return String(value);
  const known = PARSED.get(value);
  if (known) return known;
  const type = String(Reflect.get(value, 'type') ?? '');
  const fields = Object.keys(value)
    .filter((key) => !leftOut(type, key))
    .map((key) => `${key}:${parsedOf(Reflect.get(value, key))}`);
  const parsed = `${type}{${fields.join(',')}}`;
  PARSED.set(value, parsed);
  return parsed;
};

const keyOfNode = (source: Source, node: Node, from = node.start) =>
  [
    ...source.comments
      .filter((comment) => comment.start >= from && comment.end <= node.end)
      .map((comment) => `/*${foldProse(wordsOf(comment.type, comment.value))}*/`),
    parsedOf(node),
  ].join('\n');

const capped = (source: Source, node: Node) => {
  const text = source.text.slice(node.start, node.end);
  const lines = text.split('\n');
  const key = keyOfNode(source, node);
  if (lines.length <= CODE_LINES) return { text, key };
  return {
    text: `${lines.slice(0, CODE_LINES).join('\n')}\n[… ${lines.length - CODE_LINES} more lines]`,
    key,
  };
};

const nodeAt = (program: Program, offset: number): Option.Option<Node> => {
  let found = Option.none<Node>();
  walk(program, (node) => {
    if (Option.isSome(found) || node.end <= offset || node.start > offset) return false;
    if (node.start === offset && node.type !== 'Program') {
      found = Option.some(node);
      return false;
    }
    return true;
  });
  return found;
};

const commentedCode = (source: Source): ReadonlyArray<Item> => {
  const { lineOf, startOf } = lineReader(source.text);
  return commentBlocks(source)
    .filter((block) => block.alone)
    .flatMap((block) => {
      const next = startOf(block.end + 1);
      const first =
        next + (source.text.slice(next).length - source.text.slice(next).trimStart().length);
      if (lineOf(first) !== block.end + 1) return [];
      return Option.toArray(
        Option.map(nodeAt(source.program, first), (node) => {
          const code = capped(source, node);
          return {
            line: block.line,
            end: lineOf(node.end),
            start: block.start,
            text: `Comment:\n${block.text}\n\nCode it sits on:\n${code.text}`,
            key: `Comment:\n${foldProse(block.text)}\n\nCode it sits on:\n${code.key}`,
          };
        }),
      );
    });
};

const rootName = (node: Node): Option.Option<string> => {
  if (node.type === 'Identifier') return Option.some(node.name);
  if (node.type === 'MemberExpression') return rootName(node.object);
  if (node.type === 'CallExpression') return rootName(node.callee);
  return Option.none();
};

const FUNCTIONS = new Set(['ArrowFunctionExpression', 'FunctionExpression']);

const isCase = (node: Node) =>
  node.type === 'CallExpression' &&
  Option.exists(rootName(node.callee), (name) => name === 'it' || name === 'test') &&
  Option.exists(Option.fromUndefinedOr(node.arguments[0]), (name) =>
    ['Literal', 'TemplateLiteral'].includes(name.type),
  ) &&
  node.arguments.some((argument) => FUNCTIONS.has(argument.type));

const testCases = (source: Source): ReadonlyArray<Item> => {
  const { lineOf } = lineReader(source.text);
  const statements = source.program.body.filter(
    (statement) => statement.type === 'ImportDeclaration',
  );
  const imports = statements
    .map((statement) => source.text.slice(statement.start, statement.end))
    .join('\n');
  const importsKey = statements.map((statement) => keyOfNode(source, statement)).join('\n');
  const items: Array<Item> = [];
  walk(source.program, (node) => {
    if (!isCase(node)) return true;
    const test = capped(source, node);
    items.push({
      line: lineOf(node.start),
      end: lineOf(node.end),
      start: node.start,
      text: `Imports:\n${imports}\n\nTest:\n${test.text}`,
      key: `Imports:\n${importsKey}\n\nTest:\n${test.key}`,
    });
    return false;
  });
  return items;
};

const makesFunction = (node: Node): boolean =>
  FUNCTIONS.has(node.type) ||
  (node.type === 'CallExpression' &&
    (node.arguments.some((argument) => FUNCTIONS.has(argument.type)) ||
      makesFunction(node.callee)));

const isNamedFunction = (node: Node) => {
  switch (node.type) {
    case 'FunctionDeclaration':
      return Option.isSome(Option.fromNullOr(node.id));
    case 'VariableDeclarator':
      return (
        node.id.type === 'Identifier' &&
        Option.exists(Option.fromNullOr(node.init), (init) => makesFunction(init))
      );
    case 'MethodDefinition':
      return true;
    case 'Property':
      return !node.shorthand && FUNCTIONS.has(node.value.type);
    default:
      return false;
  }
};

const functions = (source: Source): ReadonlyArray<Item> => {
  const { lineOf, startOf } = lineReader(source.text);
  const above = new Map(
    commentBlocks(source)
      .filter((block) => block.alone)
      .map((block) => [block.end + 1, block]),
  );
  const items: Array<Item> = [];
  walk(source.program, (node) => {
    if (!isNamedFunction(node)) return true;
    const line = lineOf(node.start);
    const end = lineOf(node.end);
    if (end - line + 1 > FUNCTION_LINES) return true;
    const doc = Option.fromUndefinedOr(above.get(line));
    const first = Option.match(doc, { onNone: () => line, onSome: (block) => block.line });
    items.push({
      line,
      end,
      start: node.start,
      text: source.text.slice(startOf(first), node.end),
      key: keyOfNode(source, node, startOf(first)),
    });
    return false;
  });
  return items;
};

const keyOf = (node: Node): Option.Option<string> => {
  if (node.type === 'Identifier') return Option.some(node.name);
  if (node.type === 'Literal' && Predicate.isString(node.value)) return Option.some(node.value);
  return Option.none();
};

const wordsOfString = (source: Source, node: Node): Option.Option<string> => {
  if (node.type === 'Literal' && Predicate.isString(node.value)) return Option.some(node.value);
  if (node.type === 'TemplateLiteral')
    return Option.some(source.text.slice(node.start + 1, node.end - 1));
  return Option.none();
};

const BEAT_KEYS = new Set(['say', 'picture']);

const scriptBeats = (source: Source): ReadonlyArray<Item> => {
  const { lineOf } = lineReader(source.text);
  const items: Array<Item> = [];
  walk(source.program, (node) => {
    if (node.type !== 'Property') return true;
    const key = keyOf(node.key).pipe(Option.filter((name) => BEAT_KEYS.has(name)));
    const words = Option.flatMap(key, () => wordsOfString(source, node.value));
    Option.map(Option.all([key, words]), ([name, text]) =>
      items.push({
        line: lineOf(node.start),
        end: lineOf(node.end),
        start: node.start,
        text: `${name}: ${text}`,
        key: `${name}: ${foldProse(text)}`,
      }),
    );
    return Option.isNone(words);
  });
  return items;
};

export const itemsOf = (selector: Selector, source: Source): ReadonlyArray<Item> => {
  switch (selector) {
    case 'comments':
      return commentBlocks(source).map((b) => ({
        line: b.line,
        end: b.end,
        start: b.start,
        text: b.text,
        key: foldProse(b.text),
      }));
    case 'commentedCode':
      return commentedCode(source);
    case 'testCases':
      return testCases(source);
    case 'functions':
      return functions(source);
    case 'scriptBeats':
      return scriptBeats(source);
  }
};

const cellsOf = (row: string) =>
  row
    .trim()
    .replace(/^\||\|$/g, '')
    .split('|')
    .map((cell) => cell.trim());

const columnOf = (header: ReadonlyArray<string>, names: ReadonlyArray<string>) =>
  Option.liftPredicate(
    header.findIndex((cell) => names.some((name) => cell.startsWith(name))),
    (at) => at >= 0,
  );

const PARAGRAPH = /^\*\*(say|picture):\*\*\s*(.*)$/i;

const ENDS_PARAGRAPH = /^\s*$|^\*\*|^\s*\||^#/;

export const markdownBeats = (text: string): ReadonlyArray<Item> => {
  const items: Array<Item> = [];
  let columns = Option.none<{ readonly say: number; readonly picture: number }>();
  let paragraph = Option.none<{
    name: string;
    line: number;
    start: number;
    words: Array<string>;
  }>();
  const close = () => {
    Option.map(paragraph, ({ name, line, start, words }) => {
      const said = words.join(' ').trim();
      if (said !== '')
        items.push({
          line,
          end: line + words.length - 1,
          start,
          text: `${name}: ${said}`,
          key: `${name}: ${foldProse(said)}`,
        });
    });
    paragraph = Option.none();
  };
  let offset = 0;
  text.split('\n').forEach((row, i) => {
    const start = offset;
    offset += row.length + 1;
    if (Option.isSome(paragraph) && !ENDS_PARAGRAPH.test(row)) {
      paragraph.value.words.push(row.trim());
      return;
    }
    close();
    const opened = PARAGRAPH.exec(row);
    if (opened) {
      paragraph = Option.some({
        name: (opened[1] ?? '').toLowerCase(),
        line: i + 1,
        start,
        words: [opened[2] ?? ''],
      });
      return;
    }
    if (!row.trim().startsWith('|')) {
      columns = Option.none();
      return;
    }
    const cells = cellsOf(row);
    if (cells.every((cell) => /^:?-+:?$/.test(cell))) return;
    if (Option.isNone(columns)) {
      columns = Option.all({
        say: columnOf(cells, ['Say', 'Spoken']),
        picture: columnOf(cells, ['Picture', 'On screen']),
      });
      return;
    }
    for (const [name, at] of Object.entries(columns.value)) {
      const words = cells[at] ?? '';
      if (words !== '')
        items.push({
          line: i + 1,
          end: i + 1,
          start,
          text: `${name}: ${words}`,
          key: `${name}: ${foldProse(words)}`,
        });
    }
  });
  close();
  return items;
};
