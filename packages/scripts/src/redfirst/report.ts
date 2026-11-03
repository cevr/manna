import { Option } from 'effect';
import { type Node, Visitor, parseSync } from 'oxc-parser';

interface Case {
  readonly file: string;
  readonly line: number;
  readonly name: string;
  readonly passed: boolean;
}

const attribute = (tag: string, key: string): string =>
  new RegExp(`\\s${key}="([^"]*)"`).exec(tag)?.[1] ?? '';

const unescapeXml = (text: string): string =>
  text
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&');

export const casesOf = (junit: string, prefix: string): ReadonlyArray<Case> =>
  [...junit.matchAll(/<testcase\b([^>]*?)(\/>|>([\s\S]*?)<\/testcase>)/g)].map((m) => {
    const tag = m[1] ?? '';
    const body = m[3] ?? '';
    const suite = unescapeXml(attribute(tag, 'classname'));
    const name = unescapeXml(attribute(tag, 'name'));
    return {
      file: `${prefix}${attribute(tag, 'file')}`,
      line: Number(attribute(tag, 'line')),
      name: [suite, name].filter((part) => part !== '').join(' > '),
      passed: !/<(failure|error|skipped)\b/.test(body),
    };
  });

interface DiffLines {
  readonly added: ReadonlySet<number>;
  readonly gaps: ReadonlySet<number>;
}

export const diffLines = (diff: string): DiffLines => {
  const added = new Set<number>();
  const gaps = new Set<number>();
  let at = 0;
  for (const line of diff.split('\n')) {
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(line);
    if (hunk) {
      at = Number(hunk[1]);
      if (hunk[2] === '0') at += 1;
      continue;
    }
    if (line.startsWith('+++') || line.startsWith('---')) continue;
    if (line.startsWith('+')) {
      added.add(at);
      at += 1;
    } else if (line.startsWith('-')) gaps.add(at - 1);
    else if (!line.startsWith('\\')) at += 1;
  }
  return { added, gaps };
};

interface Change {
  readonly status: string;
  readonly file: string;
  readonly from: string;
}

export const changesOf = (nameStatus: string): ReadonlyArray<Change> =>
  nameStatus
    .split('\n')
    .filter((line) => line !== '')
    .map((line) => {
      const [code = '', first = '', second] = line.split('\t');
      const status = code.slice(0, 1);
      return { status, file: second ?? first, from: first };
    });

export const isTest = (file: string) => /\.test\.tsx?$/.test(file);
export const isBrowserTier = (file: string) => /\.(dom|pixel)\.test\.ts$/.test(file);

export const skippedOf = (
  statuses: ReadonlyArray<Change>,
): ReadonlyArray<{ readonly file: string; readonly why: string }> =>
  statuses
    .filter((c) => isTest(c.file) || isTest(c.from))
    .flatMap((c) => {
      if (!isTest(c.file))
        return [
          { file: c.from, why: `renamed to ${c.file}, which is no test: its cases are gone` },
        ];
      if (c.status === 'D') return [{ file: c.file, why: 'deleted: its cases are gone' }];
      if (!['A', 'M', 'R'].includes(c.status))
        return [{ file: c.file, why: `git status ${c.status}: not read` }];
      if (isBrowserTier(c.file)) return [{ file: c.file, why: 'a browser tier: run it by hand' }];
      return [];
    });

interface Span {
  readonly from: number;
  readonly to: number;
}

const TEST_RUNNERS: ReadonlySet<string> = new Set(['test', 'it']);

const calleeRoot = (node: Node): string => {
  if (node.type === 'Identifier') return node.name;
  if (node.type === 'MemberExpression') return calleeRoot(node.object);
  if (node.type === 'CallExpression') return calleeRoot(node.callee);
  return '';
};

export const caseSpans = (file: string, text: string): ReadonlyArray<Span> => {
  const starts = [0, ...[...text.matchAll(/\n/g)].map((m) => m.index + 1)];
  const lineOf = (offset: number) => starts.findLastIndex((start) => start <= offset) + 1;
  const spans: Array<Span> = [];
  new Visitor({
    CallExpression: (node) => {
      if (!TEST_RUNNERS.has(calleeRoot(node.callee)) || node.arguments.length < 2) return;
      for (const title of node.arguments.slice(0, 1))
        spans.push({ from: lineOf(title.start), to: lineOf(node.end) });
    },
  }).visit(parseSync(file, text).program);
  return spans;
};

interface FileChange {
  readonly added: ReadonlySet<number>;
  readonly gaps: ReadonlySet<number>;
  readonly spans: ReadonlyArray<Span>;
}

const touched = (c: Case, change: FileChange): boolean => {
  const holding = change.spans
    .filter((span) => span.from <= c.line && c.line <= span.to)
    .toSorted((a, b) => a.to - a.from - (b.to - b.from))[0] ?? { from: c.line, to: c.line };
  return (
    [...change.added].some((line) => holding.from <= line && line <= holding.to) ||
    [...change.gaps].some((gap) => holding.from <= gap && gap + 1 <= holding.to)
  );
};

export const caseKey = (c: Case): string => `${c.file}\u0000${c.name}`;

export const newOrChanged = (
  head: ReadonlyArray<Case>,
  baseKeys: ReadonlySet<string>,
  changes: ReadonlyMap<string, FileChange>,
): ReadonlyArray<Case> =>
  head.filter((c) => {
    if (!baseKeys.has(caseKey(c))) return true;
    return Option.exists(Option.fromUndefinedOr(changes.get(c.file)), (change) =>
      touched(c, change),
    );
  });

export const unloaded = (
  files: ReadonlyArray<string>,
  cases: ReadonlyArray<Case>,
): ReadonlyArray<string> => files.filter((file) => !cases.some((c) => c.file === file));

export const reportLines = (
  range: string,
  cases: ReadonlyArray<Case>,
  files: {
    readonly skipped: ReadonlyArray<{ readonly file: string; readonly why: string }>;
    readonly unloaded: ReadonlyArray<string>;
  },
): ReadonlyArray<string> => {
  const green = cases.filter((c) => c.passed);
  return [
    ...files.skipped.map(({ file, why }) => `redfirst ${file} not run (${why})`),
    ...files.unloaded.map((file) => `redfirst ${file} red whole: no case ran on the base`),
    ...green.map((c) => `redfirst green on base: ${c.file}:${c.line} ${c.name}`),
    `redfirst ${range} cases=${cases.length} red=${cases.length - green.length} green=${green.length}`,
  ];
};
