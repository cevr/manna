/* oxlint-disable effect/noNodeBuiltinImport, effect/noNullish -- the guard reads the app's own source files from disk, synchronously, and parses them; a parsed node's absent parts are null. */

/**
 * The rules no unit run can see, read from the app's sources:
 *
 * - A release build never hears a scripted recital. `src/app.ts` reads
 *   `__DEV__` once, in its `dev` line, and nothing from the environment; it
 *   asks `sourceKind({ dev, simulator })` for the kind, and calls
 *   `replaySource` only in the branch where that kind is `'replay'`. The rule
 *   itself (`src/sayit/source.ts`) reads neither `__DEV__` nor the
 *   environment, and the probe's plan reaches no screen but through it.
 * - The app builds one Dictation: only `src/app.ts` (and the development
 *   probe) build the service, and Today reaches it only through
 *   `src/app.ts`.
 * - Say it reads no word aloud: Today and Say it name no voice, speech
 *   synthesis or announcement.
 * - A word lit is felt by a soft tick: the app's one call of One's haptics
 *   is `impact('soft')`, in Say it's live parts.
 *
 * The scans read tracked files only: One writes `app/routes.d.ts` and
 * `.one-native-source.*` (both gitignored).
 */

import { describe, expect, it } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { parseSync, Visitor } from 'oxc-parser';

const APP = join(import.meta.dir, '..', '..');

const generated = (path: string) =>
  path === 'app/routes.d.ts' ||
  path.split('/').some((part) => part.startsWith('.one-native-source.'));

/** The app's non-test TypeScript sources under `folder`, as paths from the app. */
const sourcesUnder = (folder: string): ReadonlyArray<string> =>
  readdirSync(join(APP, folder), { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => relative(APP, join(entry.parentPath, entry.name)))
    .filter(
      (path) =>
        /\.tsx?$/.test(path) &&
        !/\.test\.tsx?$/.test(path) &&
        !path.startsWith('src/test/') &&
        !generated(path),
    )
    .toSorted();

const SOURCES = [...sourcesUnder('app'), ...sourcesUnder('src')];

const read = (path: string) => readFileSync(join(APP, path), 'utf8');

/** A source with its comments blanked, so a doc comment's words count for nothing. */
const code = (path: string) => {
  const text = read(path);
  const { comments } = parseSync(path, text, { sourceType: 'module' });
  return comments.reduce(
    (out, comment) =>
      out.slice(0, comment.start) +
      ' '.repeat(comment.end - comment.start) +
      out.slice(comment.end),
    text,
  );
};

/** The module specifiers a source imports, with the names it takes from each. */
const importsOf = (path: string) => {
  const found: Array<{ readonly from: string; readonly names: ReadonlyArray<string> }> = [];
  new Visitor({
    ImportDeclaration: (node) =>
      void found.push({
        from: node.source.value,
        names: (node.specifiers ?? []).flatMap((specifier) => {
          if (specifier.type !== 'ImportSpecifier' || specifier.imported.type !== 'Identifier')
            return [];
          return [specifier.imported.name];
        }),
      }),
  }).visit(parseSync(path, read(path), { sourceType: 'module' }).program);
  return found;
};

describe('the source a build hears', () => {
  const path = 'src/app.ts';
  const text = read(path);
  const program = parseSync(path, text, { sourceType: 'module' }).program;
  const slice = (node: { readonly start: number; readonly end: number }) =>
    text.slice(node.start, node.end).replace(/\s+/g, ' ');
  const declared = new Map<string, string>();
  const replayBranches: Array<{ readonly start: number; readonly end: number }> = [];
  const replayCalls: number[] = [];
  const devReads: number[] = [];
  new Visitor({
    VariableDeclarator: (node) => {
      if (node.id.type === 'Identifier' && node.init !== null)
        declared.set(node.id.name, slice(node.init));
    },
    IfStatement: (node) => {
      if (slice(node.test) === "kind === 'replay'") replayBranches.push(node.consequent);
    },
    CallExpression: (node) => {
      if (node.callee.type === 'Identifier' && node.callee.name === 'replaySource')
        replayCalls.push(node.start);
    },
    Identifier: (node) => {
      if (node.name === '__DEV__') devReads.push(node.start);
    },
  }).visit(program);

  it('takes dev from __DEV__ alone, and the kind from sourceKind over dev and the device info', () => {
    expect(declared.get('dev')).toBe("typeof __DEV__ !== 'undefined' && __DEV__");
    expect(declared.get('kind')).toBe('sourceKind({ dev, simulator })');
    expect(declared.get('simulator')).toBe('yield* onSimulator');
    expect(declared.get('onSimulator')).toMatch(
      /^Effect\.tryPromise\(\(\) => One\.Device\.getInfo\(\)\)\.pipe\( Effect\.map\(\(info\) => info\.isSimulator\),.* Effect\.orElseSucceed\(\(\) => false\),? \)$/,
    );
    const dev = text.indexOf('const dev = ');
    expect(devReads.length).toBe(2);
    expect(devReads.every((at) => at > dev && at < text.indexOf(';', dev))).toBe(true);
    expect(code(path)).not.toMatch(/process\.env|import\.meta\.env|\bdev\s*:/);
  });

  it('calls replaySource only where the kind is the replay, with the simulator plan', () => {
    expect(replayCalls.length).toBe(1);
    expect(
      replayCalls.every((at) =>
        replayBranches.some((branch) => at > branch.start && at < branch.end),
      ),
    ).toBe(true);
    expect(code(path)).toContain('replaySource(recite(passage.text, SIMULATOR_PLAN))');
  });

  it('decides by a rule that reads no build flag or environment, whose plan reaches no screen but through src/app.ts', () => {
    expect(code('src/sayit/source.ts')).not.toMatch(/__DEV__|process\.env|import\.meta\.env/);
    const planners = SOURCES.filter((source) =>
      importsOf(source).some(({ names }) => names.includes('SIMULATOR_PLAN')),
    );
    expect(planners).toEqual(['src/app.ts']);
    const replayers = SOURCES.filter((source) => /\breplaySource\b/.test(code(source)));
    expect(replayers).toEqual([
      'app/probe/dictation.tsx',
      'src/app.ts',
      'src/dictation/source.ios.ts',
      'src/dictation/source.ts',
    ]);
  });
});

describe('the one Dictation', () => {
  it('is built only in src/app.ts and the development probe, and Today reaches it through src/app.ts', () => {
    const builders = SOURCES.filter(
      (source) =>
        !source.startsWith('src/dictation') &&
        importsOf(source).some(
          ({ from, names }) => /(^|\/)dictation$/.test(from) && names.includes('layer'),
        ),
    );
    expect(builders).toEqual(['app/probe/dictation.tsx', 'src/app.ts']);
    const today = importsOf('app/index.tsx').map(({ from }) => from);
    expect(today).toContain('../src/app');
    expect(today.filter((from) => from.includes('dictation'))).toEqual([]);
  });
});

describe('Say it aloud', () => {
  it('reads no word aloud: Today and Say it name no voice, speech synthesis or announcement', () => {
    const files = SOURCES.filter(
      (source) =>
        source === 'app/index.tsx' ||
        source === 'src/app.ts' ||
        source === 'src/sayit.ts' ||
        source.startsWith('src/sayit/'),
    );
    expect(files.length).toBeGreaterThanOrEqual(6);
    const speaking = files.filter((source) =>
      /voice|Voice|SpeechSynthesis|One\.Speech|announceForAccessibility|AccessibilityInfo/.test(
        code(source),
      ),
    );
    expect(speaking).toEqual([]);
  });
});

describe('the tick', () => {
  it('is soft: the app’s one call of One’s haptics is impact("soft"), in Say it’s live parts', () => {
    const calls = SOURCES.flatMap((source) =>
      [...code(source).matchAll(/One\.Haptics\.(\w+)\(([^)]*)\)/g)].map(
        (match) => `${source} ${match[1]}(${match[2]})`,
      ),
    );
    expect(calls).toEqual(["src/sayit/live.ts impact('soft')"]);
  });
});
