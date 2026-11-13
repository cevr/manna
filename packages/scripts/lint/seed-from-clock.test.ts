import * as BunServices from '@effect/platform-bun/BunServices';
import { describe, expect, it } from 'effect-bun-test';
import { Effect, FileSystem, Option, Path, Predicate } from 'effect';
import { Testing } from 'oxlint-plugin-effect/rule-bindings';
import { type Node, parseSync, visitorKeys } from 'oxc-parser';
import { seedFromClock } from './seed-from-clock.ts';

/** Whether a value read off a node is a node: an object with a string `type`. */
const isNode = (value: unknown): value is Node =>
  Predicate.hasProperty(value, 'type') && Predicate.isString(value.type);

/** The child nodes of `node`, in source order, by the parser's own visitor keys. */
const childrenOf = (node: Node): ReadonlyArray<Node> =>
  (visitorKeys[node.type] ?? []).flatMap((key) => {
    const value: unknown = Reflect.get(node, key);
    if (Array.isArray(value)) return value.filter(isNode);
    return Option.toArray(Option.liftPredicate(value, isNode));
  });

/** Every node under `node`, outer first, each given its `parent` as oxlint gives it. */
const nodesOf = (node: Node): ReadonlyArray<Node> =>
  childrenOf(node).flatMap((child) => {
    Reflect.set(child, 'parent', node);
    return [child, ...nodesOf(child)];
  });

/** The 1-based line of each offset in `text`. */
const lineOf = (text: string, offset: number) => text.slice(0, offset).split('\n').length;

/** The lines the rule reports in a source, run on the parser's tree as oxlint walks it. */
const reportedLines = (file: string, text: string) => {
  const nodes = nodesOf(parseSync(file, text).program);
  const diagnostics = Testing.runRuleMulti(
    seedFromClock,
    nodes
      .filter((node) => node.type === 'MemberExpression' || node.type === 'NewExpression')
      .map((node) => [node.type, node] as const),
    { filename: file, sourceText: text },
  );
  return diagnostics.map(({ diagnostic }) =>
    lineOf(text, Number(Reflect.get(Reflect.get(diagnostic, 'node') ?? {}, 'start'))),
  );
};

/** The lines of `lines`, one statement each, the rule reports. */
const reportedOf = (lines: ReadonlyArray<string>) =>
  new Set(reportedLines('rows.test.ts', lines.join('\n')).map((n) => lines[n - 1] ?? ''));

/** The lines whose report is not what each expects: missed when it should be reported, extra when not. */
const wrongOf = (cases: ReadonlyArray<{ readonly line: string; readonly reported: boolean }>) => {
  const reported = reportedOf(cases.map(({ line }) => line));
  return cases.filter(({ line, reported: expected }) => reported.has(line) !== expected);
};

/** The lines a fixture marks RED for the rule. */
const markedLines = (text: string) =>
  text
    .split('\n')
    .flatMap((line, i) => [i + 1].filter(() => line.includes('RED manna/seed-from-clock')));

/** The `i`th of `items`, cycling. */
const nth = <A>(items: ReadonlyArray<A>, i: number): A => items[i % items.length] as A;

/** The clock and random sources a seed must not take. */
const SOURCES = [
  'Date.now()',
  'Math.random()',
  'performance.now()',
  'new Date().getTime()',
  'new Date().valueOf()',
  '+new Date()',
  'process.hrtime()[1]',
  'process.hrtime.bigint()',
  'crypto.getRandomValues(bytes)[0]',
  'crypto.randomUUID()',
  'Clock.currentTimeMillis',
];

/** The seed bindings: `bind(name, value)` writes one statement holding `value` under `name`. */
const BINDINGS: ReadonlyArray<(name: string, value: string) => string> = [
  (n, v) => `const ${n} = ${v};`,
  (n, v) => `let ${n} = 0; ${n} = ${v};`,
  (n, v) => `let ${n} = 0; ${n} ||= ${v};`,
  (n, v) => `let ${n} = 0; ${n} ??= ${v};`,
  (n, v) => `opts.${n} = ${v};`,
  (n, v) => `process.env['${n}'] = ${v};`,
  (n, v) => `function draw(${n} = ${v}) { return ${n}; }`,
  (n, v) => `const draw = (${n} = ${v}) => ${n};`,
  (n, v) => `class Rig { constructor(readonly ${n} = ${v}) {} }`,
  (n, v) => `const { ${n} = ${v} } = opts;`,
  (n, v) => `const { ${n}: given = ${v} } = opts;`,
  (n, v) => `const [${n} = ${v}] = list;`,
  (n, v) => `use({ ${n}: ${v} });`,
  (n, v) => `use({ '${n}': ${v} });`,
  (n, v) => `class Rig { ${n} = ${v}; }`,
  (n, v) => `class Rig { static ${n} = ${v}; }`,
];

/** Names that say seed. */
const SEED_NAMES = ['seed', 'seeds', 'SEED', 'wheelSeed', 'X_SEED', 'seedRows'];

/** Names that do not: other words, and words that only hold the letters seed. */
const OTHER_NAMES = ['start', 'heartseed', 'seeded', 'at', 'seedless', 'PORT'];

/** The result positions: `wrap(s)` makes a value from `s`, so a clock there is the value's. */
const RESULTS: ReadonlyArray<(s: string) => string> = [
  (s) => s,
  (s) => `Number(${s})`,
  (s) => `parseInt(${s}, 10)`,
  (s) => `parseFloat(${s})`,
  (s) => `Number.parseInt(${s}, 10)`,
  (s) => `String(${s})`,
  (s) => `BigInt(${s})`,
  (s) => `Math.floor(${s})`,
  (s) => `Math.round(${s})`,
  (s) => `Math.trunc(${s})`,
  (s) => `Math.abs(${s})`,
  (s) => `+ ${s}`,
  (s) => `- ${s}`,
  (s) => `~${s}`,
  (s) => `\`run \${${s}}\``,
  (s) => `given ?? ${s}`,
  (s) => `given || ${s}`,
  (s) => `${s} ?? 0`,
  (s) => `${s} || 1`,
  (s) => `ok ? ${s} : 0`,
  (s) => `ok ? 0 : ${s}`,
  (s) => `${s} % 1_000_000`,
  (s) => `2 ** 31 * ${s}`,
  (s) => `${s} | 0`,
  (s) => `${s} >>> 0`,
  (s) => `(${s}).toString()`,
  (s) => `(${s} as number)`,
  (s) => `${s}!`,
  (s) => `(${s})`,
  (s) => `(${s} satisfies number)`,
  (s) => `(() => ${s})()`,
  (s) => `() => ${s}`,
  (s) => `function () { return ${s}; }`,
  (s) => `Effect.sync(() => ${s})`,
  (s) => `Effect.succeed(${s})`,
  (s) => `Effect.gen(function* () { return yield* ${s}; })`,
  (s) => `Effect.gen(function* () { return ${s}; }).pipe(Effect.orDie)`,
  (s) => `((g) => (g !== undefined ? Number(g) : ${s}))(given)`,
];

/** The positions that are no result: the value is not made from `s`, so a clock there is no seed's. */
const NOT_RESULTS: ReadonlyArray<(s: string) => string> = [
  (s) => `use(${s})`,
  (s) => `random(${s})`,
  (s) => `${s} < 5_000`,
  (s) => `${s} === 0`,
  (s) => `ok && ${s}`,
  (s) => `${s} && ok`,
  (s) => `${s} ? 1 : 2`,
  (s) => `[${s}]`,
  (s) => `({ at: ${s} })`,
  (s) => `new Rng(${s})`,
  (s) => `new Date(${s}).getTime()`,
  (s) => `() => { use(${s}); return 1; }`,
  (s) => `typeof ${s}`,
  (s) => `!${s}`,
  (s) => `void ${s}`,
  (s) => `check(() => ${s})`,
  (s) => `tag\`\${${s}}\``,
  (s) => `Array.from({ length: 5 }, () => ${s})`,
  (s) => `Effect.map(${s}, (t) => t)`,
];

/**
 * Every binding and position together, the source, the name and an outer
 * result position taken in turn. The positions outnumber the sources, so
 * each binding meets every source, and so does each position; an outer
 * result position above another is still one.
 */
const bound = (names: ReadonlyArray<string>, positions: ReadonlyArray<(s: string) => string>) =>
  BINDINGS.flatMap((bind) => positions.map((position) => ({ bind, position }))).map(
    ({ bind, position }, i) =>
      bind(nth(names, i), nth(RESULTS, i * 5)(`(${position(nth(SOURCES, i))})`)),
  );

/** The ways a seed's variable is named. */
const VARIABLES = [
  "process.env['X_SEED']",
  'process.env.X_SEED',
  'Bun.env.X_SEED',
  'env.X_SEED',
  'HYMNAL_PROBE_SEED',
  'options.seed',
];

/** The ways its text is taken: as it is, through a method on an optional chain or past `!`, or asserted. */
const TAKES: ReadonlyArray<(x: string) => string> = [
  (x) => x,
  (x) => `${x}?.trim()`,
  (x) => `${x}!.trim()`,
  (x) => `(${x} as string)`,
];

/** The ways a test turns a variable's text into a number. */
const CONVERSIONS: ReadonlyArray<(x: string) => string> = [
  (x) => x,
  (x) => `Number(${x})`,
  (x) => `parseInt(${x}, 10)`,
  (x) => `Math.trunc(${x})`,
  (x) => `+${x}`,
];

/** The ways a fallback is chosen when the variable is unset: `choice(convert)(read, source)`. */
const CHOICES: ReadonlyArray<
  (convert: (x: string) => string) => (read: string, source: string) => string
> = [
  (w) => (r, s) => `${w(r)} ?? ${s}`,
  (w) => (r, s) => w(`${r} ?? ${s}`),
  (w) => (r, s) => `${w(r)} || ${s}`,
  (w) => (r, s) => w(`${r} || ${s}`),
  (w) => (r, s) => `${r} ? ${w(r)} : ${s}`,
  (w) => (r, s) => `${r} === undefined ? ${s} : ${w(r)}`,
  (w) => (r, s) => `!${r} ? ${s} : ${w(r)}`,
  (w) => (r, s) => `${w(r)} > 0 ? ${w(r)} : ${s}`,
];

/** What holds a fallback, under no seed's name: a binding, the seeded generator, an option. */
const HOLDERS: ReadonlyArray<(x: string) => string> = [
  (x) => `const at = ${x};`,
  (x) => `const rng = random(${x});`,
  (x) => `fc.assert(prop, { runs: ${x} });`,
];

/**
 * Every fallback of a seed read by name: each variable, take, conversion
 * and choice together, the source, its result position and the holder
 * taken in turn. `variable` and `source` may be swapped for one not a seed's
 * and a constant.
 */
const fallbacks = (rename: (variable: string) => string, source: (i: number) => string) =>
  VARIABLES.flatMap((variable) =>
    TAKES.flatMap((take) =>
      CONVERSIONS.flatMap((convert) =>
        CHOICES.map((choice) => ({ read: take(rename(variable)), convert, choice })),
      ),
    ),
  ).map(({ read, convert, choice }, i) =>
    nth(HOLDERS, i)(choice(convert)(read, `(${nth(RESULTS, i * 7)(source(i))})`)),
  );

/** The ways a test reads the clock beside a constant seed, its value never the seed's: a timing, a log, a check, a label, a lookup keyed by the seed. */
const BESIDES: ReadonlyArray<(source: string) => string> = [
  (s) => `startTimes.get(seed) ?? ${s}`,
  (s) => `table[seed] ?? ${s}`,
  (s) => `lookup(seed) || ${s}`,
  (s) => `[seed].includes(seed) || ${s}`,
  (s) => `seed > 0 ? \`seed \${seed}\` : \`took \${${s}} ms\``,
  (s) => `seed ? \`seed \${seed}\` : \`run at \${${s}}\``,
  (s) => `seed !== undefined ? ${s} : 0`,
  (s) => `seed === 20261112 ? 'default' : String(${s})`,
  (s) => `(seed ?? 0) + ${s}`,
  (s) => `Math.max(seed, 0) && ${s}`,
  (s) => `String(seed).length > 0 && ${s} > 0`,
  (s) => `seed > 0 && ${s} < 5_000`,
  (s) => `console.log(seed, ${s})`,
  (s) => `check(seed, () => ${s})`,
  (s) => `check(seed, () => { const started = ${s}; return started; })`,
  (s) => `({ seed, at: ${s} })`,
  (s) => `[seed, ${s}]`,
  (s) => `\`seed \${seed} at \${${s}}\``,
  (s) => `Number(process.env['X_SEED'] ?? 20261112) + ${s} * 0`,
  (s) => `expect(${s} - 5).toBeLessThan(seed)`,
];

/** A probe a verifier planted: its name, its line, and whether a seed there is the clock's under the rule's contract. */
interface Probe {
  readonly name: string;
  readonly line: string;
  readonly reported: boolean;
}

/** The vb-42 probes: a seed read by name falling back to the clock, wrapped or chosen by `?:`. */
const VB42: ReadonlyArray<Probe> = [
  {
    name: 'a1 Number(R) || clock',
    line: "export const a1 = Number(process.env['HYMNAL_PROBE_SEED']) || Date.now();",
    reported: true,
  },
  {
    name: 'a2 Number(R ?? clock)',
    line: "export const a2 = Number(process.env['HYMNAL_PROBE_SEED'] ?? Date.now());",
    reported: true,
  },
  {
    name: 'a3 R ? Number(R) : clock',
    line: "export const a3 = process.env['HYMNAL_PROBE_SEED'] ? Number(process.env['HYMNAL_PROBE_SEED']) : Date.now();",
    reported: true,
  },
  {
    name: 'a4 random(Number(R) || clock)',
    line: "export const a4 = random(Number(process.env['HYMNAL_PROBE_SEED']) || Date.now());",
    reported: true,
  },
  {
    name: "a5 parseInt(R ?? '', 10) || Math.floor(random)",
    line: "export const a5 = parseInt(process.env['HYMNAL_PROBE_SEED'] ?? '', 10) || Math.floor(Math.random() * 1e6);",
    reported: true,
  },
  {
    name: "a6 random(clock): a call's argument, no seed binding",
    line: 'export const a6 = random(Date.now());',
    reported: false,
  },
];

/** The vb-44 probes: aliases, destructuring and helpers (b), and clock reads beside a constant seed (c, d). */
const VB44: ReadonlyArray<Probe> = [
  {
    name: 'b1 an env alias',
    line: 'export const b1 = Number(env.HYMNAL_PROBE_SEED) || Date.now();',
    reported: true,
  },
  {
    name: 'b1b an env alias, computed',
    line: "export const b1b = Number(env['HYMNAL_PROBE_SEED'] ?? Date.now());",
    reported: true,
  },
  {
    name: 'b2 a destructured variable',
    line: 'export const b2 = Number(HYMNAL_PROBE_SEED) || Date.now();',
    reported: true,
  },
  {
    name: 'b3 a renamed destructured variable is not followed',
    line: 'export const b3 = Number(raw) || Date.now();',
    reported: false,
  },
  {
    name: 'b4 a clock helper is not followed',
    line: "export const b4 = Number(process.env['HYMNAL_PROBE_SEED'] ?? now());",
    reported: false,
  },
  {
    name: "b5 a function declaration's name is no binding",
    line: 'function clockSeed() { return Date.now(); }',
    reported: false,
  },
  {
    name: 'b6 a template fallback',
    line: "export const b6 = Number(process.env['HYMNAL_PROBE_SEED'] ?? `${Date.now()}`);",
    reported: true,
  },
  {
    name: 'b7 a % fallback',
    line: "export const b7 = Number(process.env['HYMNAL_PROBE_SEED'] ?? Date.now() % 1000);",
    reported: true,
  },
  {
    name: 'b8 a & fallback',
    line: "export const b8 = Number(process.env['HYMNAL_PROBE_SEED']) || (Date.now() & 0xffff);",
    reported: true,
  },
  {
    name: 'c1 a timing in a check beside a seed',
    line: 'check(seed, () => { const started = performance.now(); void started; });',
    reported: false,
  },
  {
    name: 'c2 a timing in a function',
    line: 'export const c2 = (given: number) => { const t0 = performance.now(); return t0 + given; };',
    reported: false,
  },
  { name: 'c3 a log beside a seed', line: 'console.log(seed, Date.now());', reported: false },
  {
    name: 'c4 an object beside a seed',
    line: 'export const c4 = { seed, at: Date.now() };',
    reported: false,
  },
  {
    name: 'c5 a template beside a seed',
    line: 'export const c5 = `seed ${seed} at ${Date.now()}`;',
    reported: false,
  },
  {
    name: "c6 a label chosen by a seed's comparison",
    line: 'export const c6 = seed > 0 ? `seed ${seed}` : `took ${performance.now()} ms`;',
    reported: false,
  },
  {
    name: 'c7 a constant seed plus a clock',
    line: "export const c7 = Number(process.env['HYMNAL_PROBE_SEED'] ?? 20261112) + Date.now() * 0;",
    reported: false,
  },
  {
    name: 'c8 an array beside a seed',
    line: 'export const c8 = [seed, Date.now()];',
    reported: false,
  },
  {
    name: 'd1 && after a seed',
    line: 'export const d1 = seed > 0 && performance.now() < 5_000;',
    reported: false,
  },
  {
    name: "d2 && after a seed's length",
    line: 'export const d2 = String(seed).length > 0 && Date.now() > 0;',
    reported: false,
  },
  {
    name: 'M2 a method on an optional read',
    line: "export const e1 = Number(process.env['X_SEED']?.trim()) || Date.now();",
    reported: true,
  },
  {
    name: 'M2 a method past ! inside ??',
    line: 'export const e2 = Number(process.env.X_SEED!.trim() ?? Date.now());',
    reported: true,
  },
];

/** The vb-46 probes: seed bindings with defaults (positive) and reads keyed by a constant seed (negative). */
const VB46: ReadonlyArray<Probe> = [
  {
    name: 'pos2 a parameter default',
    line: 'export function draw(seed = Date.now()) { return random(seed); }',
    reported: true,
  },
  {
    name: "pos3 an arrow's parameter default",
    line: 'export const run = (seed = Math.random()) => random(seed);',
    reported: true,
  },
  {
    name: 'pos4 a renamed destructuring default',
    line: 'export const { seed: s0 = Date.now() } = {} as { seed?: number };',
    reported: true,
  },
  {
    name: 'pos5 a shorthand destructuring default',
    line: 'export const { seed = performance.now() } = {} as { seed?: number };',
    reported: true,
  },
  {
    name: 'pos6 a parameter property default',
    line: 'export class Rig { constructor(readonly seed = Date.now()) {} }',
    reported: true,
  },
  {
    name: 'pos7 ||= to a seed',
    line: 'let wheelSeed = Number(process.env.X_SEED); wheelSeed ||= Date.now();',
    reported: true,
  },
  {
    name: "pos8 a ?: whose test compares the seed's read",
    line: 'export const s7 = Number(process.env.X_SEED) > 0 ? Number(process.env.X_SEED) : Date.now();',
    reported: true,
  },
  {
    name: "pos9 a clock in a ?:'s test",
    line: 'export const seedValue = Math.random() < 0.5 ? 1 : 2;',
    reported: false,
  },
  {
    name: 'pos10 a ?: inside a call',
    line: 'export const rng = random(process.env.X_SEED === undefined ? Date.now() : Number(process.env.X_SEED));',
    reported: true,
  },
  {
    name: 'pos11 | after ||',
    line: "export const rng2 = random(Number(process.env.X_SEED ?? '') || Date.now() | 0);",
    reported: true,
  },
  {
    name: 'pos12 an option named seed',
    line: 'fc.assert(prop, { seed: Date.now() });',
    reported: true,
  },
  {
    name: 'pos13 an option named seed, with a fallback',
    line: 'fc.assert(prop, { seed: Number(process.env.X_SEED) || Date.now() });',
    reported: true,
  },
  {
    name: 'pos14 +R : +new Date()',
    line: 'export const s13 = process.env.X_SEED ? +process.env.X_SEED : +new Date();',
    reported: true,
  },
  {
    name: "pos15 a clock's method",
    line: 'export const s14 = Number(process.env.X_SEED || Date.now().toString());',
    reported: true,
  },
  {
    name: 'pos16 an asserted read',
    line: 'export const s15 = (process.env.X_SEED as string | undefined) ?? Date.now();',
    reported: true,
  },
  {
    name: 'pos17 random bytes',
    line: 'export const s16 = Number(process.env.X_SEED ?? crypto.getRandomValues(new Uint32Array(1))[0]);',
    reported: true,
  },
  {
    name: "pos18 a callback's clock is not followed",
    line: 'export const seeds = Array.from({ length: 5 }, () => Math.random());',
    reported: false,
  },
  {
    name: 'pos19 an env variable assigned the clock',
    line: 'if (!process.env.X_SEED) process.env.X_SEED = String(Date.now());',
    reported: true,
  },
  {
    name: "pos20 Effect.map's argument is not followed",
    line: 'export const g = Effect.gen(function* () { const seed = yield* Effect.map(Clock.currentTimeMillis, (t) => t % 1000); return seed; });',
    reported: false,
  },
  {
    name: 'pos21 % after ||',
    line: 'export const s21 = Number(process.env.X_SEED) || Date.now() % 1_000_000;',
    reported: true,
  },
  {
    name: 'pos22 String inside Number.parseInt',
    line: 'export const s22 = Number.parseInt(process.env.X_SEED ?? String(Date.now()), 10);',
    reported: true,
  },
  {
    name: 'pos23 Math.round inside random',
    line: "export const s23 = random(Number(process.env['X_SEED'] ?? '') || Math.round(Math.random() * 2 ** 31));",
    reported: true,
  },
  {
    name: 'pos24 a seed key with a fallback',
    line: 'export const s24 = { runs: 100, seed: Number(Bun.env.X_SEED ?? Date.now()) };',
    reported: true,
  },
  {
    name: 'pos25 || after ?.trim()',
    line: 'export const s25 = Number(process.env.X_SEED?.trim() || Date.now());',
    reported: true,
  },
  {
    name: 'neg3 a map keyed by the seed',
    line: 'export const t0 = startTimes.get(seed) ?? performance.now();',
    reported: false,
  },
  {
    name: 'neg4 a table indexed by the seed',
    line: 'export const t1 = ({} as Record<number, number>)[seed] ?? Date.now();',
    reported: false,
  },
  {
    name: 'neg5 a timing compared to the seed',
    line: 'expect(Date.now() - 5).toBeLessThan(seed);',
    reported: false,
  },
  {
    name: 'neg6 an object beside a seed',
    line: 'export const r = { seed, took: Date.now() - 5 };',
    reported: false,
  },
  {
    name: "neg7 a ?: whose other branch is no seed's read",
    line: 'export const ok = seed !== undefined ? performance.now() : 0;',
    reported: false,
  },
  {
    name: "neg8 a label: the other branch is a template, no seed's read",
    line: 'export const label = seed ? `seed ${seed}` : `run at ${Date.now()}`;',
    reported: false,
  },
  {
    name: "neg9 a function declaration's return",
    line: 'export function seedRows(rows: number[]) { const t = Date.now(); rows.sort(); return Date.now() - t; }',
    reported: false,
  },
  {
    name: 'neg10 an object beside a seed',
    line: 'export const stats = { seed, ms: performance.now() };',
    reported: false,
  },
  {
    name: 'neg11 a sum beside a seed',
    line: 'export const deadline = (seed ?? 0) + Date.now();',
    reported: false,
  },
  {
    name: "neg12 || after a seed's use",
    line: 'export const x = [seed].includes(seed) || Date.now() > 0;',
    reported: false,
  },
  {
    name: 'neg13 two statements',
    line: 'export const rows = random(seed); export const started = Date.now();',
    reported: false,
  },
  {
    name: 'neg14 an async timing in a check',
    line: 'check(seed, async () => { const t = performance.now(); await Promise.resolve(); return performance.now() - t; });',
    reported: false,
  },
  {
    name: 'neg15 a timing around a draw',
    line: 'export const timed = (seed: number) => { const t = Date.now(); random(seed)(); return Date.now() - t; };',
    reported: false,
  },
  {
    name: 'neg16 && after Math.max(seed)',
    line: 'export const elapsed = Math.max(seed, 0) && performance.now();',
    reported: false,
  },
  { name: 'neg17 a comparison', line: 'export const seedOk = seed > 0;', reported: false },
  {
    name: 'neg18 a note',
    line: 'export const note = `seed=${seed} at=${new Date().toISOString()}`;',
    reported: false,
  },
  {
    name: 'neg19 a pair',
    line: 'export const pair = [seed, Math.random()] as const;',
    reported: false,
  },
  {
    name: 'neg20 a tag chosen by a comparison with a constant',
    line: "export const tag = seed === 20261112 ? 'default' : String(Date.now());",
    reported: false,
  },
];

const fixture = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const file = path.join(import.meta.dir, 'fixtures', 'seed-from-clock.ts');
  return { file, text: yield* fs.readFileString(file) };
}).pipe(Effect.provide(BunServices.layer));

describe('manna/seed-from-clock', () => {
  it.effect('reports each seed its fixture marks RED, and nothing else', () =>
    Effect.gen(function* () {
      const { file, text } = yield* fixture;
      const marked = markedLines(text);
      expect(marked.length).toBe(18);
      expect(reportedLines(file, text)).toEqual(marked);
    }),
  );

  it.effect(
    'property: a clock or random source in a result position of a seed binding is reported, for every binding kind, result position and source',
    () =>
      Effect.sync(() => {
        const lines = bound(SEED_NAMES, RESULTS);
        const reported = reportedOf(lines);
        expect({
          cases: lines.length,
          missed: lines.filter((line) => !reported.has(line)).slice(0, 5),
        }).toEqual({ cases: 608, missed: [] });
      }),
  );

  it.effect(
    'property: the same values held by a name not a seed, or a source out of a result position under a seed name, are never reported',
    () =>
      Effect.sync(() => {
        const unnamed = bound(OTHER_NAMES, RESULTS);
        const placed = bound(SEED_NAMES, NOT_RESULTS);
        expect({
          cases: [unnamed.length, placed.length],
          reported: [...reportedOf([...unnamed, ...placed])].slice(0, 5),
        }).toEqual({ cases: [608, 304], reported: [] });
      }),
  );

  it.effect(
    'property: a clock or random fallback of a seed read by name is reported under any holder, and the same line with a constant or a variable not a seed is not',
    () =>
      Effect.sync(() => {
        const named = fallbacks(
          (variable) => variable,
          (i) => nth(SOURCES, i),
        );
        const reported = reportedOf(named);
        expect({
          cases: named.length,
          missed: named.filter((line) => !reported.has(line)).slice(0, 5),
        }).toEqual({ cases: 960, missed: [] });
        const constant = fallbacks(
          (variable) => variable,
          () => '20261112',
        );
        const unnamed = fallbacks(
          (variable) => variable.replace('SEED', 'PORT').replace('seed', 'port'),
          (i) => nth(SOURCES, i),
        );
        expect([...reportedOf([...constant, ...unnamed])].slice(0, 5)).toEqual([]);
      }),
  );

  it.effect(
    'property: a clock or random read beside a seed, its value never the seed taken from the environment, is never reported: a key, a timing, a log, a check, a label',
    () =>
      Effect.sync(() => {
        const lines = BESIDES.flatMap((beside) =>
          SOURCES.map((source) => `const at = ${beside(source)};`),
        );
        expect({ cases: lines.length, reported: [...reportedOf(lines)].slice(0, 5) }).toEqual({
          cases: 220,
          reported: [],
        });
      }),
  );

  it.effect("each of vb-42's probes is reported as the contract says", () =>
    Effect.sync(() => expect(wrongOf(VB42)).toEqual([])),
  );

  it.effect("each of vb-44's probes is reported as the contract says", () =>
    Effect.sync(() => expect(wrongOf(VB44)).toEqual([])),
  );

  it.effect("each of vb-46's probes is reported as the contract says", () =>
    Effect.sync(() => expect(wrongOf(VB46)).toEqual([])),
  );

  it.effect(
    'leaves a clock read held by a name that only holds the letters seed, or in a title that says seed',
    () =>
      Effect.sync(() => {
        const text = [
          'const heartseedLaunch = Date.now();',
          'const seeded = mulberry(performance.now());',
          "it('draws the seed', () => Math.random());",
        ].join('\n');
        expect(reportedLines('rows.test.ts', text)).toEqual([]);
      }),
  );
});
