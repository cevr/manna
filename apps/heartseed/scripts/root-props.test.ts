/* oxlint-disable effect/noNodeBuiltinImport -- the test reads the app's `src` and `app` sources from disk, synchronously, as `parts.test.ts` does. */

/**
 * No doc comment names a prop the root does not take. A sentence of a
 * `/** *\/` comment that holds the word `root` and gives a camelCase name in
 * one of the forms ``no `x` ``, ``without `x` ``, `` `x` prop `` or
 * `<Root x` names `x` as a prop of the root, and `x` must be one that
 * `app/index.tsx`'s `export default function Root(…)` destructures. A
 * capitalised name (`Begin`, `Minutes`) is a label on screen, not a prop.
 */

import { describe, expect, it } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const APP = join(import.meta.dir, '..');

/** The four forms in one pattern, so a sentence's names come in the order they stand. */
const FORM = /\bno `([a-z]\w*)`|\bwithout `([a-z]\w*)`|`([a-z]\w*)` prop\b|<Root ([a-z]\w*)/gu;

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

/** The prop names that the sentences of `prose` naming the root give it, and `declared` lacks. */
const rootPropFaults = (prose: string, declared: ReadonlyArray<string>): ReadonlyArray<string> =>
  prose
    .split(/(?<=[.;])\s+/u)
    .filter((sentence) => /\broot\b/iu.test(sentence))
    .flatMap((sentence) => [...sentence.matchAll(FORM)].map((match) => match.slice(1).join('')))
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

const NAMES = ['opening', 'pending', 'seed', 'onDone', 'firstShow', 'planModel', 'garden', 'held'];
const LABELS = ['Begin', 'Minutes', 'Listen', 'Continue', 'Your field'];
const WRAPS: ReadonlyArray<(name: string) => string> = [
  (name) => `no \`${name}\``,
  (name) => `without \`${name}\``,
  (name) => `the \`${name}\` prop`,
  (name) => `\`<Root ${name} />\``,
];
/** The first three name the root; no other word drawn here holds `root`. */
const SUBJECTS = ['The root renders', 'the root route', 'Root takes', 'The screen', 'A walk'];
const FILLER = [
  'home shows',
  'a launch on a read garden',
  'Today keeps the plan',
  'the walk reads',
];

/** One drawn mention: its text, and the prop it names (none for a label or a bare name). */
const mention = (draw: (below: number) => number) => {
  const kind = draw(3);
  if (kind === 0) {
    const name = NAMES[draw(NAMES.length)] ?? '';
    return { text: WRAPS[draw(WRAPS.length)]?.(name) ?? '', props: [name] };
  }
  if (kind === 1) {
    const label = LABELS[draw(LABELS.length)] ?? '';
    return { text: `no \`${label}\``, props: [] };
  }
  return { text: `reads \`${NAMES[draw(NAMES.length)] ?? ''}\``, props: [] };
};

/** One drawn sentence: about the root or not, with up to three mentions. */
const sentence = (draw: (below: number) => number) => {
  const mentions = Array.from({ length: draw(4) }, () => mention(draw));
  const subject = draw(SUBJECTS.length);
  const text = [
    SUBJECTS[subject],
    ...mentions.map(({ text: each }) => each),
    FILLER[draw(FILLER.length)],
  ].join(' ');
  const aboutRoot = subject < 3 || mentions.some(({ text: each }) => each.startsWith('`<Root '));
  return {
    text: `${text}.`,
    props: mentions.filter(() => aboutRoot).flatMap(({ props }) => props),
  };
};

describe('the doc comments name only props the root takes', () => {
  it('over 300 generated comments, the faults are exactly the camelCase names a root sentence gives that Root does not declare', () => {
    const draw = random(0x5eed);
    let faulted = 0;
    for (let run = 0; run < 300; run += 1) {
      const declared = NAMES.filter(() => draw(3) === 0);
      const sentences = Array.from({ length: 1 + draw(4) }, () => sentence(draw));
      const prose = sentences.map(({ text }) => text).join([' ', '; '][draw(2)]);
      const want = sentences
        .flatMap(({ props }) => props)
        .filter((name) => !declared.includes(name));
      if (want.length > 0) faulted += 1;
      expect({ prose, declared, faults: rootPropFaults(prose, declared) }).toEqual({
        prose,
        declared,
        faults: want,
      });
    }
    expect(faulted).toBeGreaterThan(50);
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
