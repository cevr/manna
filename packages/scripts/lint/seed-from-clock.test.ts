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
const wrongOf = <C extends { readonly line: string; readonly reported: boolean }>(
  cases: ReadonlyArray<C>,
) => {
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

/** A word with its first letter capital. */
const capital = (word: string) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`;

/** A word with its first letter small. */
const small = (word: string) => `${word.charAt(0).toLowerCase()}${word.slice(1)}`;

/** The prefixes a name may carry: none, a lower word, or an acronym. */
const PREFIXES = ['', 'rng', 'hymnal', 'RNG', 'PRNG'];

/** The suffixes a name may carry: none, a word, a digit. */
const SUFFIXES = ['', 'value', '2', '1'];

/** The casings a test writes a name in, camel, Pascal, snake and screaming: `write(prefix, core, suffix)`; a digit joins with no separator in each. */
const CASINGS: ReadonlyArray<(prefix: string, core: string, suffix: string) => string> = [
  (p, c, s) => small([p.toLowerCase(), capital(c), capital(s)].join('')),
  (p, c, s) => [capital(p), capital(c), capital(s)].join(''),
  (p, c, s) =>
    [p.toLowerCase(), c, s]
      .filter((part) => part !== '')
      .join('_')
      .replace(/_(\d)$/, '$1'),
  (p, c, s) =>
    [p, c, s]
      .filter((part) => part !== '')
      .join('_')
      .toUpperCase()
      .replace(/_(\d)$/, '$1'),
];

/** Every name of each core: each prefix, suffix and casing (`seed`, `RNGSeed`, `seedValue`, `seed2`, `RNG_SEED`, `HYMNAL_SEEDS1`). */
const namesOf = (cores: ReadonlyArray<string>) => [
  ...new Set(
    cores.flatMap((core) =>
      PREFIXES.flatMap((prefix) =>
        SUFFIXES.flatMap((suffix) => CASINGS.map((write) => write(prefix, core, suffix))),
      ),
    ),
  ),
];

/** Names that say seed. */
const SEED_NAMES = namesOf(['seed', 'seeds']);

/** Names that do not: other words, and words that only hold the letters seed. */
const OTHER_NAMES = [...namesOf(['heartseed', 'seeded', 'seedless']), 'start', 'at', 'PORT'];

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
  (s) => `Config.Int('PORT').pipe(Config.withDefault(${s}))`,
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
  (s) => `Config.withDefault(${s}, 20261112)`,
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

/** The ways its text is taken: as it is, through a method on an optional chain or past `!`, asserted, or awaited. */
const TAKES: ReadonlyArray<(x: string) => string> = [
  (x) => x,
  (x) => `${x}?.trim()`,
  (x) => `${x}!.trim()`,
  (x) => `(${x} as string)`,
  (x) => `(await ${x})`,
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

/** The ways a test reads the clock beside an object named for a seed, never reading the seed: a lookup, an element's field, a member, a length. */
const RECEIVERS: ReadonlyArray<(receiver: string, source: string) => string> = [
  (r, s) => `${r}.get(k) ?? ${s}`,
  (r, s) => `${r}.get(String(seed)) ?? ${s}`,
  (r, s) => `(${r}.get('a') as number) || ${s}`,
  (r, s) => `${r}[0]?.createdAt ?? ${s}`,
  (r, s) => `${r}.at ?? ${s}`,
  (r, s) => `${r}.length || ${s}`,
  (r, s) => `${r}.at(-1) ?? ${s}`,
  (r, s) => `${r}.size + ${s}`,
];

/** Every receiver form beside every object named for a seed, the source taken in turn, each under a binding not a seed's. */
const received = () =>
  SEED_NAMES.flatMap((name) => RECEIVERS.map((receive) => ({ name, receive }))).map(
    ({ name, receive }, i) => `const at = ${receive(name, nth(SOURCES, i))};`,
  );

/** The kinds of config a seed may be read with. */
const CONFIG_KINDS = ['Int', 'Number', 'Integer', 'String'];

/** The ways a config is given a default: piped, piped after a map, data-first, through `pipe`, after an option. */
const CONFIG_DEFAULTS: ReadonlyArray<(config: string, source: string) => string> = [
  (c, s) => `${c}.pipe(Config.withDefault(${s}))`,
  (c, s) => `${c}.pipe(Config.map((x) => x), Config.withDefault(${s}))`,
  (c, s) => `Config.withDefault(${c}, ${s})`,
  (c, s) => `Config.withDefault(${c}.pipe(Config.map((x) => x)), ${s})`,
  (c, s) => `pipe(${c}, Config.withDefault(${s}))`,
  (c, s) => `Config.option(${c}).pipe(Config.withDefault(${s}))`,
];

/** What holds a config, under no seed's name: a binding, an Effect that yields it, a call. */
const CONFIG_HOLDERS: ReadonlyArray<(x: string) => string> = [
  (x) => `const at = ${x};`,
  (x) => `const g = Effect.gen(function* () { return yield* ${x}; });`,
  (x) =>
    `const g = Effect.gen(function* () { const n = yield* ${x}; return random(n); }).pipe(Effect.orDie);`,
  (x) => `use(${x});`,
];

/** Config names that say seed, and names that do not. */
const CONFIG_SEEDS = ['X_SEED', 'TEST_BUDGET_SEED', 'TOPICS_SEED', 'RNGSeed', 'SEED2'];
const CONFIG_OTHERS = ['X_PORT', 'HEARTSEED_PATH', 'SEEDED', 'seedless', 'PORT'];

/** Every config kind, default form and holder together, with the name, the source and its result position taken in turn. */
const configured = (names: ReadonlyArray<string>) =>
  CONFIG_KINDS.flatMap((kind) =>
    CONFIG_DEFAULTS.flatMap((give) => CONFIG_HOLDERS.map((hold) => ({ kind, give, hold }))),
  ).map(({ kind, give, hold }, i) =>
    hold(give(`Config.${kind}('${nth(names, i)}')`, `(${nth(RESULTS, i * 3)(nth(SOURCES, i))})`)),
  );

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

/** A vb-48 probe reported: its line in the verifier's file, and the line. */
const reportedProbe = (name: string, line: string): Probe => ({ name, line, reported: true });

/** A vb-48 probe never reported. */
const quietProbe = (name: string, line: string): Probe => ({ name, line, reported: false });

/** The vb-48 probes: seed names beside an acronym or digit (M1), members of seed-named objects (M2), config defaults (M3), and the verifier's other lines. */
const VB48: ReadonlyArray<Probe> = [
  reportedProbe('names1 RNGSeed', 'export const RNGSeed = Date.now();'),
  reportedProbe('names2 PRNGSeed', 'export const PRNGSeed = Math.random();'),
  reportedProbe('names3 seed1', 'export const seed1 = Date.now();'),
  reportedProbe('names4 SEED2', 'export const SEED2 = Date.now();'),
  reportedProbe('names5 a key seed2', 'export const run = { seed2: Date.now() };'),
  reportedProbe('names6 seed_2', 'export const seed_2 = Date.now();'),
  reportedProbe('names7 rngSeed', 'export const rngSeed = Date.now();'),
  reportedProbe('names8 RNG_SEED', 'export const RNG_SEED = Date.now();'),
  reportedProbe('pos38 seed2', 'export const seed2 = Date.now();'),
  reportedProbe('pos39 HYMNALSeed', 'export const HYMNALSeed = Date.now();'),
  reportedProbe('a seedValue', 'export const seedValue = performance.now();'),
  quietProbe('Heartseed is no seed', 'export const Heartseed = Date.now();'),
  quietProbe('HEARTSEED_AT is no seed', 'export const HEARTSEED_AT = Date.now();'),
  quietProbe(
    'neg6 a lookup on seedTimings',
    "export const t6 = seedTimings.get('a') ?? performance.now();",
  ),
  quietProbe(
    'neg7 an element of seedUsers',
    'export const createdAt7 = seedUsers[0]?.createdAt ?? Date.now();',
  ),
  quietProbe('neg8 a member of seedRows', 'export const at8 = seedRows.at ?? Date.now();'),
  quietProbe('neg9 the length of seeds', 'export const n9 = seeds.length || Date.now();'),
  quietProbe('neg10 a comparison', 'export const ok10 = seed === Date.now();'),
  quietProbe('neg11 a comparison', 'export const old11 = seed < Date.now();'),
  quietProbe('neg12 &&', 'export const x12 = seed && Date.now();'),
  quietProbe('neg13 heartseedAt', 'export const heartseedAt13 = Date.now();'),
  quietProbe('neg14 seeded', 'export const seeded14 = Date.now();'),
  quietProbe('neg15 seedless', 'export const seedless15 = Math.random();'),
  quietProbe(
    'neg16 an option beside seed',
    'fc.assert(prop, { seed, interruptAfterTimeLimit: Date.now() });',
  ),
  quietProbe('neg17 a label', 'export const label17 = `seed ${seed} at ${Date.now()}`;'),
  quietProbe(
    "neg18 decide.md's example with a seed-named map",
    'export const t18 = seedTimings.get(String(seed)) ?? performance.now();',
  ),
  quietProbe('neg19 a check', 'export const c19 = check(seed, () => Date.now());'),
  quietProbe('neg20 a new Date of a sum', 'export const d20 = new Date(Date.now() + seed);'),
  quietProbe(
    'neg21 an asserted lookup',
    "export const t21 = (seedTimings.get('a') as number) || Date.now();",
  ),
  quietProbe('neg22 a size plus a clock', 'export const sum22 = seedTimings.size + Date.now();'),
  reportedProbe(
    'pos2 an assignment in an IIFE',
    'export const p2 = (() => { let seed: number; seed = Math.random(); return seed; })();',
  ),
  reportedProbe('pos3 an array default', 'export const [seed_3 = Date.now()] = [] as number[];'),
  reportedProbe(
    'pos4 a parameter destructuring default',
    'export function f4({ seed = Date.now() } = {} as { seed?: number }) { return seed; }',
  ),
  reportedProbe('pos5 a class field', 'export class A5 { seed = Date.now(); }'),
  reportedProbe('pos6 a static field', 'export class A6 { static seed = Math.random(); }'),
  reportedProbe('pos7 a string key', "export const o7 = { 'seed': Date.now() };"),
  reportedProbe('pos8 a computed string key', "export const o8 = { ['seed']: Date.now() };"),
  reportedProbe('pos9 ?? left', 'export const seed_9 = Date.now() ?? 1;'),
  reportedProbe('pos10 a ?: branch', 'export const seed_10 = Math.random() > 2 ? Date.now() : 1;'),
  reportedProbe('pos11 a minus', 'export const seed_11 = -Date.now();'),
  reportedProbe('pos12 >>>', 'export const seed_12 = Date.now() >>> 0;'),
  reportedProbe('pos13 a template in Number', 'export const seed_13 = Number(`${Date.now()}`);'),
  reportedProbe('pos14 Math.floor', 'export const seed_14 = Math.floor(performance.now());'),
  reportedProbe('pos15 hrtime()[0]', 'export const seed_15 = process.hrtime()[0];'),
  reportedProbe('pos16 hrtime.bigint()', 'export const seed_16 = process.hrtime.bigint();'),
  reportedProbe('pos17 new Date().valueOf()', 'export const seed_17 = new Date().valueOf();'),
  reportedProbe('pos18 satisfies', 'export const seed_18 = Date.now() satisfies number;'),
  reportedProbe("pos19 Date['now']()", "export const seed_19 = Date['now']();"),
  reportedProbe('pos20 % 2 ** 32', 'export const seed_20 = new Date().getTime() % 2 ** 32;'),
  reportedProbe(
    'pos21 parseFloat(String())',
    'export const seed_21 = parseFloat(String(Math.random()));',
  ),
  reportedProbe('pos22 a typed binding', 'export const seed_22: number = Date.now();'),
  reportedProbe('pos23 a default export key', 'export default { seed: Date.now() };'),
  reportedProbe(
    'pos24 SEED24 with a fallback',
    'export const SEED24 = Number(process.env.SEED) || Math.floor(Math.random() * 1e9);',
  ),
  reportedProbe(
    'pos25 .valueOf() on a fallback',
    'export const seed_25 = Number(process.env.X_SEED ?? Date.now()).valueOf();',
  ),
  reportedProbe('pos26 | 0', 'export const seed_26 = Math.random() * 1e9 | 0;'),
  reportedProbe(
    'pos27 this.seed =',
    'export class A27 { seed = 0; reset() { this.seed = Date.now(); } }',
  ),
  reportedProbe('pos28 an Effect clock', 'export const seed_28 = Clock.currentTimeMillis;'),
  reportedProbe(
    'pos29 yield* Clock',
    'export const g29 = Effect.gen(function* () { const seed = yield* Clock.currentTimeMillis; return seed; });',
  ),
  reportedProbe('pos30 toString(36)', 'export const seed_30 = Date.now().toString(36);'),
  reportedProbe(
    'pos31 slice of String',
    'export const seed_31 = Number(String(Date.now()).slice(-6));',
  ),
  reportedProbe(
    'pos32 env SEED fallback',
    "export const x32 = Number(process.env.SEED ?? '') || performance.now();",
  ),
  reportedProbe('pos33 var', 'export var seed_33 = Date.now();'),
  reportedProbe(
    'pos34 a seed key beside seeds',
    'export const run34 = { seeds: [1], seed: Math.trunc(Math.abs(Date.now())) };',
  ),
  quietProbe(
    "pos35 Promise.resolve's argument",
    'export const seed_35 = await Promise.resolve(Date.now());',
  ),
  reportedProbe(
    'pos36 a seed config default',
    "export const g36 = Effect.gen(function* () { const seed = yield* Config.Int('X_SEED').pipe(Config.withDefault(Date.now())); return seed; });",
  ),
  quietProbe(
    "pos37 Option.getOrElse's callback",
    'export const seed_37 = Option.getOrElse(Option.none<number>(), () => Date.now());',
  ),
  quietProbe(
    "pos40 Config.orElse's callback",
    "export const g40 = Effect.gen(function* () { const seed = yield* Config.Int('X_SEED').pipe(Config.orElse(() => Config.succeed(Date.now()))); return seed; });",
  ),
  quietProbe('pos41 globalThis.Date.now', 'export const seed_41 = globalThis.Date.now();'),
  quietProbe("pos42 new Date's argument", 'export const seed_42 = new Date(Date.now()).getTime();'),
  reportedProbe(
    'revert test-budget',
    "const seed = Effect.gen(function* () { return yield* Config.Int('TEST_BUDGET_SEED').pipe(Config.withDefault(Date.now())); }).pipe(Effect.orDie);",
  ),
  reportedProbe(
    'revert topics',
    "it.effect('t', () => Effect.gen(function* () { const seed = yield* Config.Int('TOPICS_SEED').pipe(Config.withDefault(Date.now())); return seed; }));",
  ),
  reportedProbe(
    'a seed config default under a neutral name',
    "const budget = Config.Int('TEST_BUDGET_SEED').pipe(Config.withDefault(Date.now()));",
  ),
  quietProbe(
    "a clock in a seed config's map",
    "const budget = Config.Int('X_SEED').pipe(Config.map((x) => x + Date.now()));",
  ),
  quietProbe(
    "a clock default of a config not a seed's",
    "const timeout = Config.Int('X_TIMEOUT').pipe(Config.withDefault(Date.now()));",
  ),
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
      expect(marked.length).toBe(21);
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
        }).toEqual({ cases: 624, missed: [] });
      }),
  );

  it.effect(
    'property: every name holding the word seed or seeds, in any casing and beside any prefix or suffix, names a seed binding, and the same affixes on heartseed, seeded or seedless do not',
    () =>
      Effect.sync(() => {
        const lines = (names: ReadonlyArray<string>) =>
          names.map((name, i) => nth(BINDINGS, i)(name, nth(SOURCES, i)));
        const seeds = lines(SEED_NAMES);
        const reported = reportedOf(seeds);
        const others = lines(OTHER_NAMES);
        expect({
          cases: [seeds.length, others.length],
          missed: seeds.filter((line) => !reported.has(line)).slice(0, 5),
          reported: [...reportedOf(others)].slice(0, 5),
        }).toEqual({ cases: [SEED_NAMES.length, OTHER_NAMES.length], missed: [], reported: [] });
        expect(SEED_NAMES).toEqual(
          expect.arrayContaining([
            'RNGSeed',
            'PRNGSeed',
            'seed1',
            'SEED2',
            'seedValue',
            'RNG_SEED',
            'hymnal_seeds',
          ]),
        );
        expect(OTHER_NAMES).toEqual(
          expect.arrayContaining(['Heartseed', 'HEARTSEED2', 'rngSeeded']),
        );
      }),
  );

  it.effect(
    "property: a clock or random default given to a seed's config is reported however the default is given and held, and the same default of a config not a seed's is not",
    () =>
      Effect.sync(() => {
        const seeds = configured(CONFIG_SEEDS);
        const reported = reportedOf(seeds);
        const others = configured(CONFIG_OTHERS);
        expect({
          cases: [seeds.length, others.length],
          missed: seeds.filter((line) => !reported.has(line)).slice(0, 5),
          reported: [...reportedOf(others)].slice(0, 5),
        }).toEqual({ cases: [96, 96], missed: [], reported: [] });
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
        }).toEqual({ cases: [624, 320], reported: [] });
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
        }).toEqual({ cases: 1200, missed: [] });
        const constant = fallbacks(
          (variable) => variable,
          () => '20261112',
        );
        const unnamed = fallbacks(
          (variable) => variable.replace('SEED', 'PORT').replace('seed', 'port'),
          (i) => nth(SOURCES, i),
        );
        const anded = VARIABLES.flatMap((variable) => TAKES.map((take) => take(variable))).map(
          (read, i) => `const at = (${read} && ok) || ${nth(SOURCES, i)};`,
        );
        expect([...reportedOf([...constant, ...unnamed, ...anded])].slice(0, 5)).toEqual([]);
      }),
  );

  it.effect(
    'property: a clock or random read beside a seed, its value never the seed taken from the environment, is never reported: a key, a timing, a log, a check, a label, a lookup on an object named for a seed',
    () =>
      Effect.sync(() => {
        const lines = BESIDES.flatMap((beside) =>
          SOURCES.map((source) => `const at = ${beside(source)};`),
        );
        const receivers = received();
        expect({
          cases: [lines.length, receivers.length],
          reported: [...reportedOf([...lines, ...receivers])].slice(0, 5),
        }).toEqual({ cases: [220, SEED_NAMES.length * RECEIVERS.length], reported: [] });
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

  it.effect("each of vb-48's probes is reported as the contract says", () =>
    Effect.sync(() => expect(wrongOf(VB48).map(({ name }) => name)).toEqual([])),
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
