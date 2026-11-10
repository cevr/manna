/* oxlint-disable effect/noNodeBuiltinImport -- the test reads the app's listed sources, and writes a scratch repository in the system's temp folder, from disk, synchronously, as `parts.test.ts` does. */

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
 * screen, not a prop. The files read are git's listing of the package
 * (tracked or untracked, never ignored: the set `test:infra` hashes), each
 * `.ts` or `.tsx` file under `src` or `app` once, a listed file gone from
 * disk skipped. A listing that fails, or lacks `app/index.tsx`, fails.
 */

import * as BunServices from '@effect/platform-bun/BunServices';
import { describe, expect, it } from 'bun:test';
import { it as effectIt } from 'effect-bun-test';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { Effect, FileSystem, Option } from 'effect';

import {
  DECLARATION,
  docComments,
  faultsIn,
  listing,
  rootPropFaults,
  rootProps,
  sources,
} from './root-props.ts';

const APP = join(import.meta.dir, '..');

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

/** What a drawn file of a world is: a listed source, a listed file outside the sources, a listed file gone from disk, or an ignored one on disk. */
type Kind = 'source' | 'outside' | 'gone' | 'ignored';
/** What its one doc comment says: nothing of a prop, a prop the root lacks, or a prop of something else. */
type Body = 'clean' | 'fault' | 'aside';

interface Drawn {
  readonly path: string;
  readonly kind: Kind;
  readonly drawnAs: string;
  readonly body: Body;
  readonly name: string;
  readonly line: number;
}

const FOLDERS = ['home', 'first', 'test', 'probe', 'deep', '.cache'];
const SOURCE_ENDINGS = ['.ts', '.tsx', '.d.ts'];
const OTHER_ENDINGS = ['.md', '.json', '.js', '.mts', '.tsx.txt', '.ts.snap', '.css'];
const OTHER_TOPS = ['scripts', 'srcs', 'apple', 'vite', 'apps', 'source', 'infra'];

/** Zero to three folders under a top, each ending in `/`. */
const folders = (draw: Draw) =>
  Array.from({ length: draw(4) }, () => `${pick(draw, FOLDERS)}/`).join('');

/** A path of `kind`, unique by `stem`, and the class it was drawn in. */
const pathOf = (draw: Draw, kind: Kind, stem: string) => {
  if (kind !== 'outside') {
    const ending = pick(draw, SOURCE_ENDINGS);
    const under = folders(draw);
    const depth = under.split('/').length - 1;
    return {
      path: `${pick(draw, ['src', 'app'])}/${under}${stem}${ending}`,
      drawnAs: `${kind} ${ending} depth ${Math.min(depth, 2)}`,
    };
  }
  const where = pick(draw, ['ending', 'top', 'root']);
  if (where === 'ending')
    return {
      path: `${pick(draw, ['src', 'app'])}/${folders(draw)}${stem}${pick(draw, OTHER_ENDINGS)}`,
      drawnAs: 'outside ending',
    };
  if (where === 'top')
    return {
      path: `${pick(draw, OTHER_TOPS)}/${folders(draw)}${stem}${pick(draw, SOURCE_ENDINGS)}`,
      drawnAs: 'outside top',
    };
  return {
    path: `${pick(draw, ['', 'src', 'app'])}${stem}${pick(draw, SOURCE_ENDINGS)}`,
    drawnAs: 'outside root',
  };
};

/** A file's text: its doc comment after `blank` empty lines. */
const textOf = (body: Body, name: string, blank: number) => {
  const prose = {
    clean: 'The root renders home.',
    fault: `The root renders without \`${name}\`.`,
    aside: `The screen renders without \`${name}\`.`,
  }[body];
  return `${'\n'.repeat(blank)}/** ${prose} */\nexport {};\n`;
};

/** One world: one to twelve files of drawn kinds and bodies, in a drawn listing order. */
const world = (draw: Draw, index: number): ReadonlyArray<Drawn> =>
  Array.from({ length: 1 + draw(12) }, (_, at) => {
    const kind = pick<Kind>(draw, ['source', 'source', 'outside', 'gone', 'ignored']);
    const { path, drawnAs } = pathOf(draw, kind, `f${index}x${at}`);
    const blank = draw(3);
    return {
      path,
      kind,
      drawnAs,
      body: pick<Body>(draw, ['clean', 'fault', 'aside']),
      name: `ghost${index}x${at}`,
      line: blank + 1,
    };
  });

/** A read over `contents` that logs each file it is asked for in `asked`. */
const reader = (contents: ReadonlyMap<string, string>, asked: Array<string>) => (file: string) => {
  asked.push(file);
  return Option.fromUndefinedOr(contents.get(file));
};

/** A read of `folder`'s files from disk: none for a file gone from it. */
const fromDisk = (folder: string) => (file: string) =>
  Option.map(Option.liftPredicate(join(folder, file), existsSync), (path) =>
    readFileSync(path, 'utf8'),
  );

/** Runs git in `folder`, its output dropped, and answers its exit code. */
const git = (folder: string, args: ReadonlyArray<string>) =>
  /* oxlint-disable-next-line effect/noGlobals -- the test builds a scratch repository with git, synchronously, before it lists it. */
  Bun.spawnSync(['git', ...args], { cwd: folder, stdout: 'pipe', stderr: 'pipe' }).exitCode;

/** The files of `files` git ignores in `folder`, by `git check-ignore`. */
const ignoredOf = (folder: string, files: ReadonlyArray<string>) =>
  /* oxlint-disable-next-line effect/noGlobals -- the test asks git which listed files it ignores, synchronously. */
  Bun.spawnSync(['git', 'check-ignore', '--stdin', '-z'], {
    cwd: folder,
    stdin: Buffer.from(files.join('\0')),
    stdout: 'pipe',
    stderr: 'pipe',
  })
    .stdout.toString()
    .split('\0')
    .filter(Boolean);

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

  it('reads each doc comment by the line it starts on, its prose as one line', () => {
    expect(docComments('const a = 1;\n\n/**\n * The root\n * renders.\n */\n/* not */')).toEqual([
      { line: 3, prose: 'The root renders. ' },
    ]);
  });

  it('every doc comment under src and app names only props Root declares, each fault by file:line and name', () => {
    const { code, files } = listing(APP);
    expect(code).toBe(0);
    expect(files).toContain('app/index.tsx');
    expect(ignoredOf(APP, files)).toEqual([]);
    expect(sources(files).length).toBeGreaterThan(300);
    const index = readFileSync(join(APP, 'app/index.tsx'), 'utf8');
    expect(index).toMatch(DECLARATION);
    expect(faultsIn(files, fromDisk(APP), rootProps(index))).toEqual([]);
  });
});

describe('the files root-props reads', () => {
  it('over 240 generated worlds, reads each listed source once, in order, and nothing else, and faults exactly theirs', () => {
    const draw = random(0x11_57);
    const seen = new Map<string, number>();
    const count = (key: string) => seen.set(key, (seen.get(key) ?? 0) + 1);
    const got: Array<unknown> = [];
    const want: Array<unknown> = [];
    for (let run = 0; run < 240; run += 1) {
      const files = world(draw, run);
      files.forEach(({ drawnAs, body, kind }) => {
        count(drawnAs);
        count(`${kind} ${body}`);
      });
      const listed = files.filter(({ kind }) => kind !== 'ignored');
      const contents = new Map(
        files
          .filter(({ kind }) => kind !== 'gone')
          .map((each) => [each.path, textOf(each.body, each.name, each.line - 1)]),
      );
      const declared = files
        .filter(({ body }) => body === 'fault' && draw(4) === 0)
        .map(({ name }) => name);
      const faultOf = ({ path, name, line }: Drawn) => `${path}:${line} \`${name}\``;
      const wantFaults = listed
        .filter(
          ({ kind, body, name }) =>
            kind === 'source' && body === 'fault' && !declared.includes(name),
        )
        .map(faultOf);
      const asked: Array<string> = [];
      const paths = listed.map(({ path }) => path);
      got.push({ run, asked, faults: faultsIn(paths, reader(contents, asked), declared) });
      want.push({
        run,
        asked: listed
          .filter(({ kind }) => kind === 'source' || kind === 'gone')
          .map(({ path }) => path),
        faults: wantFaults,
      });
      for (const ignored of files.filter(({ kind }) => kind === 'ignored').slice(0, 1)) {
        count('ignored turned');
        const turned = { ...ignored, body: 'fault' as const, name: `${ignored.name}turned` };
        contents.set(turned.path, textOf('fault', turned.name, turned.line - 1));
        got.push({
          run,
          unlisted: faultsIn(paths, reader(contents, []), declared),
          listed: faultsIn([...paths, turned.path], reader(contents, []), declared),
        });
        want.push({ run, unlisted: wantFaults, listed: [...wantFaults, faultOf(turned)] });
      }
    }
    expect(got).toEqual(want);
    const floors = [
      ...['source', 'gone', 'ignored'].flatMap((kind) =>
        SOURCE_ENDINGS.flatMap((ending) =>
          [0, 1, 2].map((depth) => `${kind} ${ending} depth ${depth}`),
        ),
      ),
      'outside ending',
      'outside top',
      'outside root',
      ...['source', 'outside', 'gone', 'ignored'].flatMap((kind) =>
        ['clean', 'fault', 'aside'].map((body) => `${kind} ${body}`),
      ),
      'ignored turned',
    ];
    expect(floors.filter((key) => (seen.get(key) ?? 0) < 10)).toEqual([]);
  });

  effectIt.effect(
    "reads git's listing of a scratch repository: its tracked and untracked sources, never an ignored one or one gone from disk",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const folder = yield* fs.makeTempDirectoryScoped({ prefix: 'root-props-' });
        const write = (file: string, name: string) =>
          Effect.andThen(
            fs.makeDirectory(dirname(join(folder, file)), { recursive: true }),
            fs.writeFileString(
              join(folder, file),
              `/** The root renders without \`${name}\`. */\nexport {};\n`,
            ),
          );
        expect(git(folder, ['init', '-q'])).toBe(0);
        yield* fs.writeFileString(join(folder, '.gitignore'), 'app/routes.d.ts\n.cache/\n');
        yield* write('app/index.tsx', 'tracked');
        yield* write('src/gone.tsx', 'gone');
        expect(git(folder, ['add', 'app/index.tsx', 'src/gone.tsx'])).toBe(0);
        yield* fs.remove(join(folder, 'src/gone.tsx'));
        yield* write('src/home/untracked.ts', 'untracked');
        yield* write('app/routes.d.ts', 'routes');
        yield* write('src/.cache/generated.ts', 'generated');
        const { code, files } = listing(folder);
        expect(code).toBe(0);
        expect(files.toSorted()).toEqual([
          '.gitignore',
          'app/index.tsx',
          'src/gone.tsx',
          'src/home/untracked.ts',
        ]);
        expect(faultsIn(files, fromDisk(folder), []).toSorted()).toEqual([
          'app/index.tsx:1 `tracked`',
          'src/home/untracked.ts:1 `untracked`',
        ]);
      }).pipe(Effect.scoped, Effect.provide(BunServices.layer)),
  );
});
