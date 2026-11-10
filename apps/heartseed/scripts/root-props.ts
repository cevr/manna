/**
 * The root-props reader: which doc comments of the package name a prop the
 * root does not take. Its read set is git's listing of the package (tracked
 * or untracked, never ignored), the set `test:infra` hashes: of it, the
 * `.ts` and `.tsx` files under `src` and `app`. It reads a file only through
 * the `read` it is given, so a file gone from disk is skipped there.
 */

import { Option } from 'effect';

const NAME = '[a-z]\\w*';
const SEPARATOR = '(?:,? (?:or|and) |, )';
/** A lead form, its first name, then the list that goes on from it. */
const LEAD = new RegExp(
  `\\b(?:no|without(?: an?| the)?) \`(${NAME})\`((?:${SEPARATOR}\`${NAME}\`)*)`,
  'dgu',
);
/** The list before a `prop` or `props`, then the name right before the word. */
const PROPS = new RegExp(`((?:\`${NAME}\`${SEPARATOR})*)\`(${NAME})\` props?\\b`, 'dgu');
const ROOT_JSX = new RegExp(`<Root (${NAME})`, 'dgu');
const TICKED = new RegExp(`\`(${NAME})\``, 'gu');

/** The names the forms give in `sentence`, each once, in the order they stand. */
const formNames = (sentence: string): ReadonlyArray<string> => {
  const at = new Map<number, string>();
  const named = (match: RegExpExecArray, group: number) =>
    at.set(match.indices?.[group]?.[0] ?? match.index, match[group] ?? '');
  const listed = (match: RegExpExecArray, group: number) => {
    const from = match.indices?.[group]?.[0] ?? match.index;
    for (const ticked of (match[group] ?? '').matchAll(TICKED)) {
      at.set(from + ticked.index + 1, ticked[1] ?? '');
    }
  };
  for (const match of sentence.matchAll(LEAD)) {
    named(match, 1);
    listed(match, 2);
  }
  for (const match of sentence.matchAll(PROPS)) {
    listed(match, 1);
    named(match, 2);
  }
  for (const match of sentence.matchAll(ROOT_JSX)) named(match, 1);
  return [...at.entries()].toSorted(([left], [right]) => left - right).map(([, name]) => name);
};

/** The sentences of `prose` about the root: each holding `root`, and each `It`/`Its` sentence right after one. */
const rootSentences = (prose: string): ReadonlyArray<string> => {
  const about: Array<string> = [];
  let chained = false;
  for (const sentence of prose.split(/(?<=[.;])\s+/u)) {
    chained = /\broot\b/iu.test(sentence) || (chained && /^Its?\b/u.test(sentence));
    if (chained) about.push(sentence);
  }
  return about;
};

/** `Root`'s declaration in `app/index.tsx`, its parameters captured. */
export const DECLARATION = /export default function Root\(([^)]*)\)/u;

/** The names `Root` destructures from its props, read from its declaration in `index`. */
export const rootProps = (index: string): ReadonlyArray<string> => {
  const params = DECLARATION.exec(index)?.[1] ?? '';
  const inner = /^\s*\{([^}]*)\}/u.exec(params)?.[1] ?? '';
  return inner
    .split(',')
    .map((each) => each.trim().split(/[:=\s]/u)[0] ?? '')
    .filter((name) => name !== '');
};

/** The prop names that the sentences of `prose` about the root give it, and `declared` lacks. */
export const rootPropFaults = (
  prose: string,
  declared: ReadonlyArray<string>,
): ReadonlyArray<string> =>
  rootSentences(prose)
    .flatMap(formNames)
    .filter((name) => !declared.includes(name));

/** The doc comments of `text`: the line each starts on, and its prose as one line. */
export const docComments = (text: string) =>
  [...text.matchAll(/\/\*\*([\s\S]*?)\*\//gu)].map((match) => ({
    line: text.slice(0, match.index).split('\n').length,
    prose: (match[1] ?? '').replaceAll(/^\s*\*\s?/gmu, '').replaceAll(/\s+/gu, ' '),
  }));

/** The files of `folder` that git tracks or would track (never one it ignores), from that folder, and git's exit code. */
export const listing = (folder: string) => {
  /* oxlint-disable-next-line effect/noGlobals -- the reader lists the files git tracks or would track, synchronously, before it reads them. */
  const run = Bun.spawnSync(
    ['git', 'ls-files', '-z', '--cached', '--others', '--exclude-standard'],
    { cwd: folder, stdout: 'pipe', stderr: 'pipe' },
  );
  return { code: run.exitCode, files: run.stdout.toString().split('\0').filter(Boolean) };
};

/** The rule's sources among `files`: each `.ts` or `.tsx` file under `src` or `app`, in the order given. */
export const sources = (files: ReadonlyArray<string>): ReadonlyArray<string> =>
  files.filter((file) => /^(?:src|app)\/.+\.tsx?$/u.test(file));

/**
 * Each doc comment's fault in `sources(files)`, as `` <file>:<line> `<name>` ``,
 * in their order: `read` is asked once for each of them and for nothing else,
 * and a file it answers none for is skipped.
 */
export const faultsIn = (
  files: ReadonlyArray<string>,
  read: (file: string) => Option.Option<string>,
  declared: ReadonlyArray<string>,
): ReadonlyArray<string> =>
  sources(files).flatMap((file) =>
    Option.match(read(file), {
      onNone: () => [],
      onSome: (text) =>
        docComments(text).flatMap(({ line, prose }) =>
          rootPropFaults(prose, declared).map((name) => `${file}:${line} \`${name}\``),
        ),
    }),
  );
