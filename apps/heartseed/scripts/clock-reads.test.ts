/* oxlint-disable effect/noNodeBuiltinImport -- the test reads the package's files from disk, synchronously, as `parts.test.ts` does. */

/**
 * No test, test helper or tool of the package reads the host's clock outside
 * the three named boundaries (`clock-reads.ts`). The reader is held to
 * generated sources whose every line is a fragment with its verdict written
 * here, to the boundary table and its edges, and to its domain over
 * generated paths; then every file git lists in the package, tracked or
 * untracked but not ignored, is read and must hold no fault. A listing that
 * fails, or that lacks a file every listing holds, fails the test, so an
 * empty or wrong listing cannot pass.
 */

import { describe, expect, it } from 'bun:test';
import { Array as Arr, Option } from 'effect';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { BOUNDARIES, declares, type Fault, hostReads, inDomain, type Kind } from './clock-reads';

const APP = join(import.meta.dir, '..');

/** A fragment's verdict: the fault its line is, or `clean`. */
type Verdict = Kind | 'clean';

/** A line of source naming `v#`, its verdict, and where it may stand: anywhere, only in a `.tsx` file, or only at the top of a file. */
type Fragment = readonly [text: string, verdict: Verdict, place: 'any' | 'tsx' | 'top'];

const FRAGMENTS: ReadonlyArray<Fragment> = [
  ['const v# = new Date(1_767_225_600_000);', 'clean', 'any'],
  ['const v# = new Date(at.getTime() + 1);', 'clean', 'any'],
  ['const v# = new Date(2026, 10, 10);', 'clean', 'any'],
  ['const v# = Date.UTC(2026, 10, 10, 15);', 'clean', 'any'],
  ["const v# = Date.parse('2026-11-10T15:00:00Z');", 'clean', 'any'],
  ['const v# = at instanceof Date;', 'clean', 'any'],
  ['const v#: Date | number = 0;', 'clean', 'any'],
  ['const v# = at satisfies Date;', 'clean', 'any'],
  ['type V# = ReturnType<typeof Date.now>;', 'clean', 'top'],
  ['interface V# extends Date { readonly now: number }', 'clean', 'top'],
  ['const v# = 1; // Date.now() and performance.now() in a comment', 'clean', 'top'],
  ["const v# = 'new Date() and Date.now()';", 'clean', 'any'],
  ['const v# = `${at} performance.now() new Date()`;', 'clean', 'any'],
  ['const v# = /new Date\\(\\)|Date\\.now/u;', 'clean', 'any'],
  ['const v# = record.Date + record.performance;', 'clean', 'any'],
  ['const v# = { Date: at, performance: 1, clockWith: 2 };', 'clean', 'any'],
  ['const v# = time.now;', 'clean', 'any'],
  ['const v# = { now: 1 }.now;', 'clean', 'any'],
  ['const v# = Clock.currentTimeMillis;', 'clean', 'any'],
  ['const v# = Clock.monotonicTimeNanos;', 'clean', 'any'],
  ['const v# = Effect.map(Clock.currentTimeMillis, (at) => at + 1);', 'clean', 'any'],
  [
    'const v# = { currentTimeMillisUnsafe: () => at, monotonicTimeNanosUnsafe: () => 0n };',
    'clean',
    'any',
  ],
  ['class V# { currentTimeMillisUnsafe() { return 0; } }', 'clean', 'top'],
  ['const v# = Effect.runSync(Effect.succeed(Date.UTC(2026, 0, 1)));', 'clean', 'any'],
  [
    'const v# = Effect.runSync(Clock.currentTimeMillis.pipe(Effect.provide(layer)));',
    'clean',
    'any',
  ],
  ['const v# = <Text>Date.now() new Date() performance</Text>;', 'clean', 'tsx'],
  ['const v# = <T,>(value: T) => value;', 'clean', 'tsx'],
  ['const v# = Date.now();', 'host', 'any'],
  ['const v# = Date.now;', 'host', 'any'],
  ['const v# = Date?.now();', 'host', 'any'],
  ['const v# = new Date();', 'host', 'any'],
  ['const v# = new Date;', 'host', 'any'],
  ['const v# = new Date().toISOString();', 'host', 'any'],
  ['const v# = Date();', 'host', 'any'],
  ['const v# = globalThis.Date.now();', 'host', 'any'],
  ['const v# = self.Date.now();', 'host', 'any'],
  ['const v# = new window.Date();', 'host', 'any'],
  ["const v# = globalThis['Date'].now();", 'host', 'any'],
  ['const v# = DateTime.nowUnsafe();', 'host', 'any'],
  ['const v# = Date;', 'refused', 'any'],
  ['const { now: v# } = Date;', 'refused', 'any'],
  ["const v# = Date['now']();", 'refused', 'any'],
  ["const v# = Reflect.get(Date, 'now');", 'refused', 'any'],
  ['const v# = new Date(...parts);', 'refused', 'any'],
  ['const v# = (Date as DateConstructor).now();', 'refused', 'any'],
  ['const v# = Date!.now();', 'refused', 'any'],
  ['const v# = { Date };', 'refused', 'any'],
  ['const v# = globalThis.Date;', 'refused', 'any'],
  ['const v# = Date.prototype.getTime;', 'refused', 'any'],
  ['const v# = (Date: number) => 1;', 'refused', 'any'],
  ['class V# extends Date {}', 'refused', 'top'],
  ['const v# = performance.now();', 'monotonic', 'any'],
  ['const v# = globalThis.performance.now();', 'monotonic', 'any'],
  ['const { now: v# } = performance;', 'monotonic', 'any'],
  ['const v# = process.hrtime.bigint();', 'monotonic', 'any'],
  ['const v# = Bun.nanoseconds();', 'monotonic', 'any'],
  ['const v# = held.monotonicTimeNanosUnsafe();', 'monotonic', 'any'],
  ['const v# = held.currentTimeMillisUnsafe();', 'held', 'any'],
  ['const v# = held.currentTimeNanos;', 'held', 'any'],
  ['const v# = Clock.clockWith((clock) => Effect.succeed(clock));', 'held', 'any'],
  ['const v# = clockWith((clock) => Effect.succeed(clock));', 'held', 'any'],
  ['const v# = Effect.runSync(Clock.currentTimeMillis);', 'unprovided', 'any'],
  ['const v# = Effect.runPromise(Clock.currentTimeNanos);', 'unprovided', 'any'],
  ['const v# = Effect.runFork(DateTime.now);', 'unprovided', 'any'],
];

const VERDICTS: ReadonlyArray<Verdict> = [
  'host',
  'refused',
  'monotonic',
  'held',
  'unprovided',
  'clean',
];

/** A seeded generator of whole numbers below a bound. */
const random = (seed: number) => {
  let state = seed >>> 0;
  return (bound: number) => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return Math.floor((state / 4_294_967_296) * bound);
  };
};

/** The item of `items` at `index`, which the caller draws below its length. */
const at = <A>(items: ReadonlyArray<A>, index: number): A =>
  Option.getOrThrow(Arr.get(items, index));

/** How many times `key` is counted in `counts`. */
const countOf = <K>(counts: ReadonlyMap<K, number>, key: K) =>
  Option.getOrElse(Option.fromNullishOr(counts.get(key)), () => 0);

const bump = <K>(counts: Map<K, number>, key: K) => counts.set(key, countOf(counts, key) + 1);

/** One generated source: 1 to 9 fragments, a line each, some in a function, blank lines between; its path, the faults its lines are, and the fragments it drew. */
const source = (draw: (bound: number) => number, run: number) => {
  const tsx = draw(3) === 0;
  const lines: Array<string> = [];
  const want: Array<Fault> = [];
  const drawn: Array<number> = [];
  for (let count = 1 + draw(9); count > 0; count -= 1) {
    const index = draw(FRAGMENTS.length);
    const [text, verdict, place] = at(FRAGMENTS, index);
    if (place !== 'tsx' || tsx) {
      drawn.push(index);
      if (draw(4) === 0) lines.push('');
      const named = text.replaceAll('#', `${run}_${lines.length}`);
      if (place !== 'top' && draw(4) === 0)
        lines.push(`function w${run}_${lines.length}() { ${named} }`);
      else lines.push(named);
      if (verdict !== 'clean') want.push({ line: lines.length, kind: verdict });
    }
  }
  const folder = at(['src/test', 'src/home', 'scripts', 'vite', 'infra'], draw(5));
  const path = `${folder}/made-${run}.${at(['ts', 'tsx'], Number(tsx))}`;
  return { path, text: `${lines.join('\n')}\n`, want, drawn };
};

/** Faults as `<line> <kind>`, in line order, joined, so two lists compare as one string. */
const shown = (faults: ReadonlyArray<Fault>) =>
  faults
    .map(({ line, kind }) => `${line} ${kind}`)
    .toSorted((a, b) => a.localeCompare(b, 'en', { numeric: true }))
    .join(', ');

describe('the reader of the host’s clock', () => {
  it('over 600 generated sources, faults exactly the lines that read the host’s clock, hold or rename Date, read monotonic time, read a held clock or run a clock read with none given, each by its kind', () => {
    const draw = random(0x0c_10_c4);
    const draws = new Map<number, number>();
    const sources = new Map<Verdict, number>();
    const wrong: Array<string> = [];
    for (let run = 0; run < 600; run += 1) {
      const made = source(draw, run);
      for (const index of made.drawn) bump(draws, index);
      const verdicts = new Set(made.want.map((fault): Verdict => fault.kind));
      if (verdicts.size === 0) verdicts.add('clean');
      for (const verdict of verdicts) bump(sources, verdict);
      const got = shown(hostReads(made.text, made.path));
      if (got !== shown(made.want)) wrong.push(`${made.path}\n${made.text}got ${got}`);
    }
    expect(wrong).toEqual([]);
    expect(FRAGMENTS.filter((_, index) => countOf(draws, index) < 10)).toEqual([]);
    expect(VERDICTS.filter((verdict) => countOf(sources, verdict) < 30)).toEqual([]);
  });

  it('judges each fragment alone by its verdict, in a .ts and a .tsx file', () => {
    const wrong = FRAGMENTS.flatMap(([text, verdict, place]) =>
      ['ts', 'tsx']
        .filter((extension) => place !== 'tsx' || extension === 'tsx')
        .flatMap((extension) => {
          const got = shown(
            hostReads(`${text.replaceAll('#', '0')}\n`, `src/test/one.${extension}`),
          );
          const want = [verdict]
            .filter((each) => each !== 'clean')
            .map((each) => `1 ${each}`)
            .join(', ');
          return [`${extension}: ${text} → ${got}`].filter(() => got !== want);
        }),
    );
    expect(wrong).toEqual([]);
  });

  it('refuses a file that does not parse', () => {
    expect(shown(hostReads('const = ;\n', 'src/test/broken.ts'))).toBe('1 refused');
    expect(
      hostReads('const v = 1;\nDate.now(\n', 'scripts/broken.ts').map(({ kind }) => kind),
    ).toContain('refused');
  });
});

describe('the boundaries of the host’s clock', () => {
  const MONOTONIC =
    'export const deadline = (ms: number) => {\n  const start = performance.now();\n  return () => performance.now() - start >= ms;\n};\n';
  const HELD =
    'const hostClock = Effect.runSync(Clock.clockWith((clock) => Effect.succeed(clock)));\nconst late = hostClock.currentTimeMillisUnsafe();\n';
  const ASKED =
    'export const hostAsked = (held: Held) => {\n  const answer = held.currentTimeMillisUnsafe;\n  return answer;\n};\nconst other = held.currentTimeMillisUnsafe;\n';

  it('are the three named declarations, each for its own kinds, each a declaration of its file', () => {
    expect(
      BOUNDARIES.map(
        ({ file, within, kinds }) => `${file} ${within} ${kinds.toSorted().join('+')}`,
      ).toSorted(),
    ).toEqual([
      'src/test/clock.ts hostClock held+monotonic',
      'src/test/elapsed.ts deadline monotonic',
      'src/test/setup.ts hostAsked held',
    ]);
    expect(
      BOUNDARIES.filter(
        ({ file, within }) => !declares(readFileSync(join(APP, file), 'utf8'), file, within),
      ),
    ).toEqual([]);
    expect(shown(hostReads(MONOTONIC, 'src/test/elapsed.ts'))).toBe('');
    expect(shown(hostReads(HELD, 'src/test/clock.ts'))).toBe('2 held');
    expect(shown(hostReads(ASKED, 'src/test/setup.ts'))).toBe('5 held');
  });

  it('hold nothing for the same text in another file, under another name, of another kind, or nested in another declaration', () => {
    const cases: ReadonlyArray<readonly [text: string, file: string, want: string]> = [
      [MONOTONIC, 'src/test/field-rig.tsx', '2 monotonic, 3 monotonic'],
      [MONOTONIC, 'src/test/clock.ts', '2 monotonic, 3 monotonic'],
      [MONOTONIC.replace('deadline', 'until'), 'src/test/elapsed.ts', '2 monotonic, 3 monotonic'],
      [
        MONOTONIC.replaceAll('performance.now()', 'Date.now()'),
        'src/test/elapsed.ts',
        '2 host, 3 host',
      ],
      [
        MONOTONIC.replaceAll('performance.now()', 'held.currentTimeMillisUnsafe()'),
        'src/test/elapsed.ts',
        '2 held, 3 held',
      ],
      [
        `const outer = () => {\n${MONOTONIC.replace('export ', '')}};\n`,
        'src/test/elapsed.ts',
        '3 monotonic, 4 monotonic',
      ],
      [HELD, 'src/test/bar-rig.tsx', '1 held, 2 held'],
      [HELD.replace('const hostClock', 'const heldClock'), 'src/test/clock.ts', '1 held, 2 held'],
      [`${HELD}const now = hostClock.currentTimeMillis;\n`, 'src/test/clock.ts', '2 held, 3 held'],
      [
        HELD.replace('Clock.clockWith', 'Date.now() && Clock.clockWith'),
        'src/test/clock.ts',
        '1 host, 2 held',
      ],
      [
        ASKED.replace('held.currentTimeMillisUnsafe;', 'Date.now();'),
        'src/test/setup.ts',
        '2 host, 5 held',
      ],
      [ASKED, 'src/test/clock.ts', '2 held, 5 held'],
    ];
    expect(
      cases.flatMap(([text, file, want]) => {
        const got = shown(hostReads(text, file));
        return [`${file}: ${got} for\n${text}`].filter(() => got !== want);
      }),
    ).toEqual([]);
  });
});

/** The places a generated path may stand, each a tool's place or not. */
const FOLDERS: ReadonlyArray<readonly [folder: string, tool: boolean]> = [
  ['src/test', true],
  ['src/test/deep', true],
  ['scripts', true],
  ['scripts/handbook', true],
  ['vite', true],
  ['infra', true],
  ['src', false],
  ['src/home', false],
  ['app', false],
  ['native', false],
  ['assets', false],
];

/** The endings a generated path may have, each a test, a source, or neither. */
const ENDINGS: ReadonlyArray<readonly [ending: string, is: 'test' | 'source' | 'other']> = [
  ['.test.ts', 'test'],
  ['.test.tsx', 'test'],
  ['.slow.test.ts', 'test'],
  ['.property.test.tsx', 'test'],
  ['.ts', 'source'],
  ['.tsx', 'source'],
  ['.d.ts', 'other'],
  ['.js', 'other'],
  ['.test.js', 'other'],
  ['.json', 'other'],
  ['.md', 'other'],
  ['.ts.snap', 'other'],
];

describe('the domain of the rule', () => {
  it('over 400 generated paths, takes each test, each helper under src/test and each tool, and no product source, declaration or other file', () => {
    const draw = random(0xd0_ae);
    const wrong: Array<string> = [];
    const seen = new Set<string>();
    for (let run = 0; run < 400; run += 1) {
      const [folder, tool] = at(FOLDERS, draw(FOLDERS.length));
      const [ending, is] = at(ENDINGS, draw(ENDINGS.length));
      const file = `${folder}/made-${run}${ending}`;
      const want = is === 'test' || (is === 'source' && tool);
      seen.add(`${String(tool)} ${is}`);
      if (inDomain(file) !== want) wrong.push(`${file} ${String(want)}`);
    }
    expect(wrong).toEqual([]);
    expect(seen.size).toBe(6);
  });

  it('reads every listed file of the package in it, and none of them holds a fault', () => {
    /* oxlint-disable-next-line effect/noGlobals -- the test lists the files git tracks or would track, synchronously, before it reads them. */
    const run = Bun.spawnSync(
      ['git', 'ls-files', '-z', '--cached', '--others', '--exclude-standard'],
      { cwd: APP, stdout: 'pipe', stderr: 'pipe' },
    );
    const files = run.stdout.toString().split('\0').filter(Boolean);
    expect(run.exitCode).toBe(0);
    expect(
      ['scripts/clock-reads.ts', 'src/test/elapsed.ts', 'src/clock.test.ts'].filter(
        (file) => !files.includes(file),
      ),
    ).toEqual([]);
    const domain = files.filter(inDomain);
    expect(domain.length).toBeGreaterThan(350);
    expect(
      domain.flatMap((file) =>
        hostReads(readFileSync(join(APP, file), 'utf8'), file).map(
          ({ line, kind }) => `${file}:${line} ${kind}`,
        ),
      ),
    ).toEqual([]);
  });
});
