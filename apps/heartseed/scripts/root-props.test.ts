/* oxlint-disable effect/noNodeBuiltinImport -- the test reads the app's `src` and `app` sources from disk, synchronously, as `parts.test.ts` does. */

/**
 * No doc comment names a prop the root does not take. A sentence of a
 * `/** *\/` comment is about the root when it holds the word `root`, or when
 * it opens with `It` or `Its` right after a sentence about the root. Such a
 * sentence names `x` as a prop of the root when it gives a camelCase name in
 * one of the forms ``no `x` ``, ``without `x` ``, ``without a|an|the `x` ``
 * (each may go on as a list: ``, `y` ``, `` or `y` ``, `` and `y` ``),
 * `` `x` prop ``, `` `x` props `` (with a list before it) or `<Root x`, and
 * each such `x` must be one that `app/index.tsx`'s `export default function
 * Root(…)` destructures. A capitalised name (`Begin`, `Minutes`) is a label on
 * screen, not a prop.
 */

import { describe, expect, it } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const APP = join(import.meta.dir, '..');

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

const DECLARATION = /export default function Root\(([^)]*)\)/u;

/** The names `Root` destructures from its props, read from its declaration in `index`. */
const rootProps = (index: string): ReadonlyArray<string> => {
  const params = DECLARATION.exec(index)?.[1] ?? '';
  const inner = /^\s*\{([^}]*)\}/u.exec(params)?.[1] ?? '';
  return inner
    .split(',')
    .map((each) => each.trim().split(/[:=\s]/u)[0] ?? '')
    .filter((name) => name !== '');
};

/** The prop names that the sentences of `prose` about the root give it, and `declared` lacks. */
const rootPropFaults = (prose: string, declared: ReadonlyArray<string>): ReadonlyArray<string> =>
  rootSentences(prose)
    .flatMap(formNames)
    .filter((name) => !declared.includes(name));

/** The doc comments of `text`: the line each starts on, and its prose as one line. */
const docComments = (text: string) =>
  [...text.matchAll(/\/\*\*([\s\S]*?)\*\//gu)].map((match) => ({
    line: text.slice(0, match.index).split('\n').length,
    prose: (match[1] ?? '').replaceAll(/^\s*\*\s?/gmu, '').replaceAll(/\s+/gu, ' '),
  }));

/** Every `.ts`/`.tsx` file under `folder` (a path from the app), skipping `node_modules` and dot folders. */
const sourcesUnder = (folder: string): ReadonlyArray<string> =>
  readdirSync(join(APP, folder), { withFileTypes: true }).flatMap((entry) => {
    const path = `${folder}/${entry.name}`;
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) return [];
      return sourcesUnder(path);
    }
    return [path].filter((file) => /\.tsx?$/u.test(file));
  });

/** A small seeded generator (mulberry32), so each run draws the same sentences. */
const random = (seed: number) => {
  let state = seed;
  return (below: number) => {
    state = (state + 0x6d2b79f5) | 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return Math.floor((((mixed ^ (mixed >>> 14)) >>> 0) / 4_294_967_296) * below);
  };
};

type Draw = (below: number) => number;

const NAMES = ['opening', 'pending', 'seed', 'onDone', 'firstShow', 'planModel', 'garden', 'held'];
const LABELS = ['Begin', 'Minutes', 'Listen', 'Continue', 'Your field'];
const LEADS = ['no', 'without', 'without a', 'without an', 'without the'];
const SEPARATORS = [', ', ' or ', ' and ', ', or ', ', and '];
/** The first three name the root, the next two do not, and the last two open a chained sentence. */
const SUBJECTS = [
  'The root renders',
  'the root route',
  'Root takes',
  'The screen',
  'A walk',
  'It renders',
  'Its view shows',
];
const FILLER = [
  'home shows',
  'a launch on a read garden',
  'Today keeps the plan',
  'the walk reads',
];

const pick = <A>(draw: Draw, from: ReadonlyArray<A>): A => from[draw(from.length)] as A;

/** One to three names, joined as a list by drawn separators. */
const list = (draw: Draw) => {
  const names = Array.from({ length: 1 + draw(3) }, () => pick(draw, NAMES));
  const joins = ['', ...names.slice(1).map(() => pick(draw, SEPARATORS))];
  const text = names.map((name, index) => `${joins[index] ?? ''}\`${name}\``).join('');
  return { names, text };
};

type Form = 'lead' | 'props' | 'root' | 'label' | 'bare';

/** One drawn mention: its text, the props it names (none for a label or a bare name), and its form. */
const mention = (draw: Draw) => {
  const form = pick<Form>(draw, ['lead', 'props', 'root', 'label', 'bare']);
  if (form === 'lead') {
    const lead = pick(draw, LEADS);
    const { names, text } = list(draw);
    return {
      text: `${lead} ${text}`,
      props: names,
      list: names.length > 1,
      article: lead.includes(' '),
      plural: false,
    };
  }
  if (form === 'props') {
    const { names, text } = list(draw);
    const plural = names.length > 1 || draw(2) === 0;
    return {
      text: `the ${text} ${['prop', 'props'][Number(plural)] ?? ''}`,
      props: names,
      list: names.length > 1,
      article: false,
      plural,
    };
  }
  const plain = { list: false, article: false, plural: false };
  if (form === 'root') {
    const name = pick(draw, NAMES);
    return { text: `\`<Root ${name} />\``, props: [name], ...plain };
  }
  if (form === 'label') return { text: `no \`${pick(draw, LABELS)}\``, props: [], ...plain };
  return { text: `reads \`${pick(draw, NAMES)}\``, props: [], ...plain };
};

/** One drawn sentence after one about the root or not: its text, whether it is about the root, and its mentions. */
const sentence = (draw: Draw, afterRoot: boolean) => {
  const mentions = Array.from({ length: draw(4) }, () => mention(draw));
  const subject = draw(SUBJECTS.length);
  const text = [
    SUBJECTS[subject],
    ...mentions.map(({ text: each }) => each),
    FILLER[draw(FILLER.length)],
  ].join(' ');
  const chained = subject >= 5;
  const aboutRoot =
    subject < 3 ||
    mentions.some(({ text: each }) => each.startsWith('`<Root ')) ||
    (chained && afterRoot);
  return { text: `${text}.`, aboutRoot, chained, mentions };
};

/** One to four drawn sentences, each drawn knowing whether the one before is about the root. */
const comment = (draw: Draw) => {
  const sentences: Array<ReturnType<typeof sentence>> = [];
  for (let count = 1 + draw(4); sentences.length < count;) {
    sentences.push(sentence(draw, sentences.at(-1)?.aboutRoot ?? false));
  }
  return sentences;
};

/** Counts in `seen` each new form a comment's sentences draw where it names a prop of the root, or must not. */
const tally = (
  seen: Record<'plural' | 'list' | 'article' | 'chained' | 'unchained', number>,
  sentences: ReadonlyArray<ReturnType<typeof sentence>>,
) => {
  sentences.forEach((each, index) => {
    const afterRoot = sentences[index - 1]?.aboutRoot ?? false;
    const named = each.mentions.some(({ props }) => props.length > 0);
    if (named && afterRoot && each.chained) seen.chained += 1;
    if (named && afterRoot && !each.aboutRoot) seen.unchained += 1;
    const counted = each.mentions.filter(() => each.aboutRoot);
    seen.plural += counted.filter(({ plural }) => plural).length;
    seen.list += counted.filter(({ list: listed }) => listed).length;
    seen.article += counted.filter(({ article }) => article).length;
  });
};

describe('the doc comments name only props the root takes', () => {
  it('over 300 generated comments, the faults are exactly the camelCase names that a sentence about the root, or an It sentence chained to one, gives in any form and Root does not declare', () => {
    const draw = random(0x5eed);
    let faulted = 0;
    const seen = { plural: 0, list: 0, article: 0, chained: 0, unchained: 0 };
    for (let run = 0; run < 300; run += 1) {
      const declared = NAMES.filter(() => draw(3) === 0);
      const sentences = comment(draw);
      tally(seen, sentences);
      const prose = sentences.map(({ text }) => text).join(pick(draw, [' ', '; ']));
      const want = sentences
        .filter(({ aboutRoot }) => aboutRoot)
        .flatMap(({ mentions }) => mentions.flatMap(({ props }) => props))
        .filter((name) => !declared.includes(name));
      if (want.length > 0) faulted += 1;
      expect({ prose, declared, faults: rootPropFaults(prose, declared) }).toEqual({
        prose,
        declared,
        faults: want,
      });
    }
    expect(faulted).toBeGreaterThan(50);
    expect(Object.entries(seen).filter(([, count]) => count < 10)).toEqual([]);
  });

  it("reads Root's props from its declaration", () => {
    expect(rootProps('export default function Root() {')).toEqual([]);
    expect(rootProps('export default function Root({ opening, seed = 1 }: Props) {')).toEqual([
      'opening',
      'seed',
    ]);
    expect(rootProps('function Home() {}')).toEqual([]);
  });

  it('every doc comment under src and app names only props Root declares, each fault by file:line and name', () => {
    const index = readFileSync(join(APP, 'app/index.tsx'), 'utf8');
    expect(index).toMatch(DECLARATION);
    const declared = rootProps(index);
    const faults = [...sourcesUnder('src'), ...sourcesUnder('app')].flatMap((file) =>
      docComments(readFileSync(join(APP, file), 'utf8')).flatMap(({ line, prose }) =>
        rootPropFaults(prose, declared).map((name) => `${file}:${line} \`${name}\``),
      ),
    );
    expect(faults).toEqual([]);
  });
});
