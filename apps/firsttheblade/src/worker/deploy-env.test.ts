import { BunServices } from '@effect/platform-bun';
import { describe, expect, it } from 'effect-bun-test';
import { Effect, FileSystem, Path } from 'effect';

import { WORKER_NAME } from '../site.ts';
import type * as Domain from './domain.ts';

/**
 * The names the stack may read from the deployer's environment: the films
 * lab's address (`kit/`) alone. Every secret, the contact inbox among them,
 * is a store secret (`./store-secret.ts`).
 */
const ALLOWED = ['FILM_LAB_URL'];

/** A `Config` constructor called with a name; its combinators take a default or a text, not a name. */
const CONFIG_CALL =
  /\bConfig\s*\.\s*(?!withDefault\b|withDescription\b|succeed\b|fail\b|map\w*\b|orElse\w*\b|option\b|validate\b|nested\b|all\b)[A-Za-z]+\s*\(\s*(['"`])([^'"`]+)\1/g;
const ENV_DOT = /\b(?:process\.env|Bun\.env|import\.meta\.env)\s*\.\s*([A-Za-z_$][\w$]*)/g;
const ENV_INDEX = /\b(?:process\.env|Bun\.env|import\.meta\.env)\s*\[\s*(['"`])([^'"`]+)\1\s*\]/g;
const ENV_WHOLE =
  /\b(?:process\.env|Bun\.env|import\.meta\.env)\b(?!\s*(?:\.|\[))|\bConfigProvider\s*\.\s*fromEnv\b/;

const loaderOf = (file: string): 'ts' | 'tsx' => {
  if (file.endsWith('.tsx')) return 'tsx';
  return 'ts';
};

/**
 * Every name the code reads from the environment, `*` for a whole read. The
 * code is read as Bun runs it, types and comments gone, so a comment that
 * names a read is no read.
 */
const readsIn = (code: string, file = 'x.ts'): ReadonlyArray<string> => {
  const text = new Bun.Transpiler({
    loader: loaderOf(file),
    trimUnusedImports: false,
  }).transformSync(code);
  const names = new Set<string>();
  for (const match of text.matchAll(CONFIG_CALL)) names.add(String(match[2]));
  for (const match of text.matchAll(ENV_DOT)) names.add(String(match[1]));
  for (const match of text.matchAll(ENV_INDEX)) names.add(String(match[2]));
  if (ENV_WHOLE.test(text)) names.add('*');
  return [...names].sort();
};

const EXTENSIONS = ['', '.ts', '.tsx', '/index.ts', '/index.tsx'];

/** The modules a relative import may name, when they are source files of the app. */
const candidatesOf = (path: Path.Path, root: string, from: string, spec: string) =>
  EXTENSIONS.map((extension) => path.join(path.dirname(from), spec) + extension).filter(
    (file) => spec.startsWith('.') && file.startsWith(`${root}/`) && /\.tsx?$/.test(file),
  );

/**
 * Every module of the app the stack's entry reaches by relative imports, the
 * entry included, with its code. The app's root is found from this file, so
 * a copy of the app reads the copy.
 */
const graphOf = Effect.fn('Test.graphOf')(function* (entry: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const root = path.resolve(import.meta.dir, '../..');
  const seen = new Map<string, string>();
  const todo = [path.join(root, entry)];
  while (todo.length > 0) {
    const file = todo.pop() ?? entry;
    if (seen.has(file)) continue;
    const code = yield* fs.readFileString(file);
    seen.set(file, code);
    for (const { path: spec } of new Bun.Transpiler({ loader: loaderOf(file) }).scanImports(code)) {
      for (const candidate of candidatesOf(path, root, file, spec)) {
        if (yield* fs.exists(candidate)) {
          todo.push(candidate);
          break;
        }
      }
    }
  }
  return [...seen].map(([file, code]) => ({ file: path.relative(root, file), code }));
});

const random = (seed: number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const pick = <A>(next: () => number, items: ReadonlyArray<A>) =>
  items[Math.floor(next() * items.length)] ?? items[0]!;

const CONSTRUCTORS = [
  'Redacted',
  'String',
  'Boolean',
  'Number',
  'Port',
  'Url',
  'NonEmptyString',
  'Integer',
];
const QUOTES = ["'", '"', '`'];

const nameOf = (next: () => number) =>
  `${pick(next, ['MAIL', 'EGW', 'STRIPE', 'X', 'TOKEN'])}_${Math.floor(next() * 1e4)}`;

/** A line that reads `name`, in one of the forms a read takes. */
const readLine = (next: () => number, name: string) => {
  const q = pick(next, QUOTES);
  const n = Math.floor(next() * 1e6);
  return pick(next, [
    `const a${n} = yield* Config.${pick(next, CONSTRUCTORS)}(${q}${name}${q});`,
    `const b${n} = yield* Config.${pick(next, CONSTRUCTORS)}( ${q}${name}${q} ).pipe(Config.withDefault('x'));`,
    `const c${n} = process.env.${name};`,
    `const d${n} = process.env[${q}${name}${q}];`,
    `const e${n} = Bun.env.${name} ?? '';`,
    `const f${n} = import.meta.env[${q}${name}${q}];`,
  ]);
};

/** A line that names `name` and reads nothing. */
const noiseLine = (next: () => number, name: string) => {
  const n = Math.floor(next() * 1e6);
  return pick(next, [
    `// Config.Redacted('${name}') was read here once`,
    `/** Reads \`process.env.${name}\` at deploy. */\nconst g${n} = 1;`,
    `const h${n} = { ${name}: 'value' };`,
    `type T${n} = { readonly ${name}: string };`,
    `const i${n} = Config.withDefault('${name}');`,
    `const ${name.toLowerCase()} = 3;`,
    `/* process.env['${name}'] */ const j${n} = 2;`,
  ]);
};

/** A generated source and the names it reads. */
const sourceOf = (seed: number) => {
  const next = random(seed);
  const want = new Set<string>();
  const lines = [
    "import { Config, ConfigProvider, Effect } from 'effect';",
    'export const run = Effect.gen(function* () {',
  ];
  for (let n = 0; n < 1 + Math.floor(next() * 10); n += 1) {
    const name = nameOf(next);
    if (next() < 0.5) {
      want.add(name);
      lines.push(readLine(next, name));
    } else {
      lines.push(noiseLine(next, name));
    }
  }
  if (next() < 0.1) {
    want.add('*');
    lines.push(pick(next, ['const all = process.env;', 'const p = ConfigProvider.fromEnv();']));
  }
  lines.push('});');
  return { source: lines.join('\n'), want: [...want].sort() };
};

describe('the deploy reads from the environment', () => {
  it.effect('only the allowed names, over every module the stack reaches', () =>
    Effect.gen(function* () {
      const graph = yield* graphOf('alchemy.run.ts');
      expect(graph.map(({ file }) => file)).toContain('src/worker/store-secret.ts');
      expect(graph.map(({ file }) => file)).toContain('src/mail/contact.ts');
      const outside = graph.flatMap(({ file, code }) =>
        readsIn(code, file)
          .filter((name) => !ALLOWED.includes(name))
          .map((name) => `${file}: ${name}`),
      );
      expect(outside).toEqual([]);
    }).pipe(Effect.provide(BunServices.layer)),
  );

  it.effect('the reader finds exactly the generated reads, over 100 sources', () =>
    Effect.sync(() => {
      for (let seed = 1; seed <= 100; seed += 1) {
        const { source, want } = sourceOf(seed);
        expect({ seed, source, found: readsIn(source) }).toEqual({ seed, source, found: want });
      }
    }),
  );
});

/** The Site Worker's name written down, handed to `mailDomain`: a type error that `typecheck` holds, never run (the module loads Alchemy). */
const writtenDown = (mailDomain: typeof Domain.mailDomain) =>
  // @ts-expect-error -- the Contact rule takes the Site's output, never the Worker's name written down
  mailDomain(WORKER_NAME);

/** Code as Bun runs it, types and comments gone. */
const codeOf = (source: string) =>
  new Bun.Transpiler({ loader: 'ts', trimUnusedImports: false }).transformSync(source);

/** The value of every worker action of an Email rule, as Bun's output writes it. */
const WORKER_ACTION = /type:\s*"worker",\s*value:\s*\[([^\]]*)\]/g;

/** What is wrong with a module's Email rules: a worker action naming anything but the parameter `workerName`, or a rule with no worker action. */
const ruleProblems = (source: string): ReadonlyArray<string> => {
  const code = codeOf(source);
  const values = Array.from(code.matchAll(WORKER_ACTION), ([, value = '']) => value.trim());
  const rules = code.split('Email.Rule(').length - 1;
  const wrong = values.filter((value) => value !== 'workerName').map((value) => `worker ${value}`);
  if (values.length === rules) return wrong;
  return [...wrong, `${rules} rule(s), ${values.length} worker action(s)`];
};

/** Worker values other than the parameter: the name, written or as a literal, another name, a list of two, and the Site's output read where the rule is made. */
const WRONG_WORKERS = [
  'WORKER_NAME',
  "'firsttheblade'",
  '"firsttheblade"',
  '`firsttheblade`',
  'NAME',
  'workerName, WORKER_NAME',
  'site.workerName',
];

/** A generated module of Email rules, some with a wrong worker in a line comment, and whether each worker action names the parameter alone. */
const rulesOf = (seed: number) => {
  const next = random(seed);
  const lines = [
    "import * as Cloudflare from '@alchemy.run/cloudflare';",
    'export const rules = (workerName: string) => [',
  ];
  let right = true;
  for (let n = 0; n < 1 + Math.floor(next() * 3); n += 1) {
    const value = pick(next, [...WRONG_WORKERS.map(() => 'workerName'), ...WRONG_WORKERS]);
    right &&= value === 'workerName';
    if (next() < 0.3) lines.push(`  // value: [${pick(next, WRONG_WORKERS)}] was the worker once`);
    lines.push(
      `  Cloudflare.Email.Rule('R${n}', { name: 'R${n}', actions: [{ type: 'worker', value: [${value}] }] }),`,
    );
  }
  lines.push('];');
  return { source: lines.join('\n'), right };
};

describe('the Contact rule', () => {
  it.effect('takes the Site Worker by its workerName output, in the stack and in every rule', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = path.resolve(import.meta.dir, '../..');
      const stack = codeOf(yield* fs.readFileString(path.join(root, 'alchemy.run.ts')));
      expect(stack).toMatch(/const site = yield\* Site;/);
      expect(stack).toMatch(/mailDomain\(site\.workerName\)/);
      const domain = yield* fs.readFileString(path.join(root, 'src/worker/domain.ts'));
      expect(ruleProblems(domain)).toEqual([]);
    }).pipe(Effect.provide(BunServices.layer)),
  );

  it.effect('refuses the Worker name written down, by type', () =>
    Effect.sync(() => {
      expect(writtenDown).toBeTypeOf('function');
    }),
  );

  it.effect('the reader finds exactly the generated wrong worker actions, over 100 modules', () =>
    Effect.sync(() => {
      for (let seed = 1; seed <= 100; seed += 1) {
        const { source, right } = rulesOf(seed);
        expect({ seed, source, right: ruleProblems(source).length === 0 }).toEqual({
          seed,
          source,
          right,
        });
      }
    }),
  );
});
