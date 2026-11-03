import { Glob, TOML } from 'bun';
import { Effect, FileSystem, Option, Path, Predicate, Schema } from 'effect';
import type * as PlatformError from 'effect/PlatformError';
import { Minimatch, minimatch } from 'minimatch';
import {
  type Expression,
  type ObjectExpression,
  type Program,
  Visitor,
  parseSync,
} from 'oxc-parser';
import { gateFiles } from '../guard/files.ts';
import { andChained, changesShell, commandsOf } from './shell.ts';
import type { UnitTest } from './units.ts';

const isTestFile = (file: string) => /(?:\.test|_test|\.spec|_spec)\.[cm]?[jt]sx?$/.test(file);

const isInert = (value: Expression): boolean => {
  if (value.type === 'Literal') return true;
  if (value.type === 'TemplateLiteral') return value.expressions.length === 0;
  if (value.type === 'ArrayExpression')
    return value.elements.every((element) =>
      Option.match(Option.fromNullOr(element), {
        onNone: () => true,
        onSome: (held) => held.type !== 'SpreadElement' && isInert(held),
      }),
    );
  if (value.type === 'ObjectExpression')
    return value.properties.every(
      (property) =>
        property.type === 'Property' &&
        !property.computed &&
        !property.method &&
        !property.shorthand &&
        property.kind === 'init' &&
        (property.key.type === 'Identifier' || property.key.type === 'Literal') &&
        isInert(property.value),
    );
  return false;
};

const isData = (file: string, text: string) => {
  const parsed = parseSync(file, text);
  if (parsed.errors.length > 0) return false;
  const [only, ...more] = parsed.program.body;
  if (more.length > 0) return false;
  return Option.exists(Option.fromUndefinedOr(only), (statement) => {
    if (statement.type !== 'ExportDefaultDeclaration') return false;
    const value = statement.declaration;
    if (value.type !== 'ObjectExpression' && value.type !== 'ArrayExpression') return false;
    return isInert(value);
  });
};

type Flags = ReadonlyMap<string, boolean>;

const BUN_FLAGS: Flags = new Map([
  ['--timeout', true],
  ['--rerun-each', true],
  ['--retry', true],
  ['--preload', true],
  ['-r', true],
  ['--coverage', false],
  ['--coverage-reporter', true],
  ['--coverage-dir', true],
  ['--reporter', true],
  ['--reporter-outfile', true],
  ['--dots', false],
  ['--only-failures', false],
  ['--path-ignore-patterns', true],
  ['--max-concurrency', true],
  ['--seed', true],
  ['--randomize', false],
  ['--bail', false],
  ['--todo', false],
  ['--concurrent', false],
  ['--pass-with-no-tests', false],
  ['--isolate', false],
  ['--no-isolate', false],
  ['--parallel', false],
  ['--parallel-delay', true],
  ['--timings', true],
  ['--update-timings', false],
  ['--update-snapshots', false],
  ['-u', false],
  ['--no-orphans', false],
  ['--smol', false],
  ['--conditions', true],
]);

const argumentsOf = (words: ReadonlyArray<string>, flags: Flags) => {
  const positionals: Array<string> = [];
  const given: Array<readonly [string, string]> = [];
  for (let at = 0; at < words.length; at++) {
    const word = words[at] ?? '';
    if (!word.startsWith('-')) {
      positionals.push(word);
      continue;
    }
    const [name = '', inline] = word.split(/=(.*)/s);
    const valued = Option.fromUndefinedOr(flags.get(name));
    if (Option.isNone(valued)) return Option.none();
    if (Predicate.isString(inline)) {
      given.push([name, inline]);
      continue;
    }
    if (!valued.value) {
      given.push([name, '']);
      continue;
    }
    const next = words[at + 1] ?? '-';
    if (next.startsWith('-')) return Option.none();
    at++;
    given.push([name, next]);
  }
  return Option.some({ positionals, given });
};

const valuesOf = (
  given: ReadonlyArray<readonly [string, string]>,
  names: ReadonlyArray<string>,
): ReadonlyArray<string> =>
  given.filter(([name]) => names.includes(name)).map(([, value]) => value);

const subcommandAt = (words: ReadonlyArray<string>) => {
  let at = 1;
  while ((words[at] ?? '').startsWith('-')) {
    const word = words[at] ?? '';
    const valued = !word.includes('=') && BUN_FLAGS.get(word) === true;
    at += 1;
    if (valued && !(words[at] ?? '-').startsWith('-')) at += 1;
  }
  return at;
};

type Run =
  | {
      readonly kind: 'bunTest';
      readonly filters: ReadonlyArray<string>;
      readonly ignores: ReadonlyArray<string>;
    }
  | {
      readonly kind: 'playwright';
      readonly takes: (file: string, text: string) => boolean;
    };

const bareIgnore = (pattern: string) => pattern.replace(/^(?:\.\/)+/, '').replace(/\/+$/, '');

const PLAIN_SEGMENT = /^(?!\.{1,2}$)[A-Za-z0-9._-]+$/;

const NAME_IGNORE = /^\*\*\/\*([A-Za-z0-9._-]+)\*$/;

const isPlainIgnore = (pattern: string) => {
  if (NAME_IGNORE.test(pattern)) return true;
  const bare = bareIgnore(pattern);
  return (
    bare === '' || bare === '.' || bare.split('/').every((segment) => PLAIN_SEGMENT.test(segment))
  );
};

const PATH_FILTER = /^(?:\.{1,2}(?:\/|$)|\/)/;

const bunTestOf = (words: ReadonlyArray<string>): ReadonlyArray<Run> =>
  Option.match(argumentsOf(words, BUN_FLAGS), {
    onNone: () => [],
    onSome: ({ positionals, given }) => {
      const ignores = valuesOf(given, ['--path-ignore-patterns']);
      const paths = positionals.some((filter) => PATH_FILTER.test(filter));
      if (paths && !positionals.every((filter) => filter.startsWith('./'))) return [];
      if (!ignores.every(isPlainIgnore)) return [];
      return [{ kind: 'bunTest', filters: positionals, ignores }];
    },
  });

const skips = (pattern: string, file: string) => {
  const name = Option.fromNullishOr(NAME_IGNORE.exec(pattern)?.[1]);
  if (Option.isSome(name))
    return (file.split('/').at(-1) ?? '').toLowerCase().includes(name.value.toLowerCase());
  const at = bareIgnore(pattern).toLowerCase();
  const path = file.toLowerCase();
  return at === '' || at === '.' || path === at || path.startsWith(`${at}/`);
};

const BUNFIG_TEST_KEYS = new Set([
  'preload',
  'smol',
  'timeout',
  'retry',
  'rerunEach',
  'randomize',
  'seed',
  'concurrentTestGlob',
  'onlyFailures',
  'reporter',
  'coverage',
  'coverageThreshold',
  'coverageReporter',
  'coverageDir',
  'coverageSkipTestFiles',
  'coveragePathIgnorePatterns',
  'coverageIgnoreSourcemaps',
]);

const BUNFIG_TABLES = new Set(['test', 'install']);

const Table = Schema.Record(Schema.String, Schema.Unknown);

const Bunfig = Schema.StructWithRest(Schema.Struct({ test: Schema.optionalKey(Table) }), [Table]);

const bunfigNarrows = (text: string) =>
  Option.match(
    Option.flatMap(Option.liftThrowable(TOML.parse)(text), Schema.decodeUnknownOption(Bunfig)),
    {
      onNone: () => true,
      onSome: ({ test = {}, ...tables }) =>
        Object.keys(tables).some((table) => !BUNFIG_TABLES.has(table)) ||
        Object.keys(test).some((key) => !BUNFIG_TEST_KEYS.has(key)),
    },
  );

const pathOf = (filter: string): Option.Option<string> => {
  if (filter.startsWith('/') || filter.split('/').includes('..')) return Option.none();
  return Option.some(
    filter
      .split('/')
      .filter((part) => part !== '.' && part !== '')
      .join('/'),
  );
};

const BUN_EXTENSION = /\.(?:[cm]?[jt]s|[jt]sx)$/;

const isBunTestName = (file: string) =>
  /(?:\.test|_test|\.spec|_spec)\.[^./]+$/.test(file) && BUN_EXTENSION.test(file);

const runsFile = (run: Run, file: string, text: string) => {
  if (file.split('/').includes('node_modules')) return false;
  if (run.kind === 'playwright') return run.takes(file, text);
  const parts = file.split('/');
  if (run.ignores.some((pattern) => skips(pattern, file)) || !BUN_EXTENSION.test(file))
    return false;
  const scanned = isBunTestName(file) && !parts.slice(0, -1).some((part) => part.startsWith('.'));
  if (run.filters.length === 0) return scanned;
  return run.filters.some((filter) => {
    const asPath = Option.liftPredicate(filter, (f) => f.startsWith('./'));
    return Option.match(Option.flatMap(asPath, pathOf), {
      onNone: () => scanned && file.includes(filter),
      onSome: (at) =>
        (at === '' && scanned) || file === at || (scanned && file.startsWith(`${at}/`)),
    });
  });
};

const PLAYWRIGHT_FLAGS: Flags = new Map([
  ['--config', true],
  ['-c', true],
  ['--workers', true],
  ['-j', true],
  ['--reporter', true],
  ['--timeout', true],
  ['--retries', true],
  ['--repeat-each', true],
  ['--max-failures', true],
  ['-x', false],
  ['--output', true],
  ['--global-timeout', true],
  ['--trace', true],
  ['--browser', true],
  ['--headed', false],
  ['--forbid-only', false],
  ['--fully-parallel', false],
  ['--pass-with-no-tests', false],
  ['--quiet', false],
  ['--ignore-snapshots', false],
  ['--fail-on-flaky-tests', false],
]);

const PLAYWRIGHT_SETTINGS = new Set([
  'testDir',
  'testMatch',
  'testIgnore',
  'respectGitIgnore',
  'timeout',
  'retries',
  'workers',
  'reporter',
  'use',
  'webServer',
  'fullyParallel',
  'forbidOnly',
  'outputDir',
  'expect',
  'globalSetup',
  'globalTeardown',
  'globalTimeout',
  'maxFailures',
  'preserveOutput',
  'quiet',
  'reportSlowTests',
  'snapshotDir',
  'snapshotPathTemplate',
  'updateSnapshots',
  'updateSourceMethod',
  'ignoreSnapshots',
  'metadata',
  'name',
  'build',
  'captureGitInfo',
  'failOnFlakyTests',
  'repeatEach',
]);

const PLAYWRIGHT_CONFIGS = ['ts', 'js', 'mts', 'mjs', 'cts', 'cjs'].map(
  (ext) => `playwright.config.${ext}`,
);

const PLAYWRIGHT_MATCH = '**/*.@(spec|test).?(c|m)[jt]s?(x)';

const globMatcher = (pattern: string) => {
  let glob = pattern;
  if (!glob.startsWith('**/')) glob = `**/${glob}`;
  return (file: string) => minimatch(file, glob, { nocase: true, dot: true });
};

const PLAYWRIGHT_MODULES = ['@playwright/test', 'playwright/test'];

type TopLevel = Program['body'][number];

type Binding = 'playwright' | 'other';

const importedBindings = (
  node: Extract<TopLevel, { type: 'ImportDeclaration' }>,
): ReadonlyArray<Binding> =>
  node.specifiers
    .filter((specifier) => specifier.local.name === 'defineConfig')
    .map((specifier): Binding => {
      if (specifier.type !== 'ImportSpecifier' || !PLAYWRIGHT_MODULES.includes(node.source.value))
        return 'other';
      const { imported } = specifier;
      if (imported.type === 'Identifier' && imported.name === 'defineConfig') return 'playwright';
      if (imported.type === 'Literal' && imported.value === 'defineConfig') return 'playwright';
      return 'other';
    });

const declarationOf = (node: TopLevel): Option.Option<TopLevel | Expression> => {
  if (node.type === 'ExportNamedDeclaration') return Option.fromNullOr(node.declaration);
  if (node.type === 'ExportDefaultDeclaration') return Option.some(node.declaration);
  return Option.some(node);
};

const bindsDefineConfig = (declared: TopLevel | Expression) => {
  if (declared.type === 'FunctionDeclaration' || declared.type === 'ClassDeclaration')
    return Option.match(Option.fromNullOr(declared.id), {
      onNone: () => false,
      onSome: (id) => id.name === 'defineConfig',
    });
  if (declared.type !== 'VariableDeclaration') return false;
  return declared.declarations.some(
    ({ id }) => id.type !== 'Identifier' || id.name === 'defineConfig',
  );
};

const importsDefineConfig = (program: Program) => {
  const bindings = program.body.flatMap((node): ReadonlyArray<Binding> => {
    if (node.type === 'ImportDeclaration') return importedBindings(node);
    return Option.match(declarationOf(node), {
      onNone: () => [],
      onSome: (declared): ReadonlyArray<Binding> => {
        if (bindsDefineConfig(declared)) return ['other'];
        return [];
      },
    });
  });
  return bindings.length === 1 && bindings[0] === 'playwright';
};

const CONFIG_VALUES = new Set(['undefined', 'NaN', 'Infinity']);

const CONFIG_CALLS = new Set(['Number', 'String', 'Boolean']);

const isConfigStatement = (node: TopLevel) => {
  if (node.type === 'ImportDeclaration') return PLAYWRIGHT_MODULES.includes(node.source.value);
  if (node.type === 'VariableDeclaration')
    return node.kind === 'const' && node.declarations.every(({ id }) => id.type === 'Identifier');
  return node.type === 'ExportDefaultDeclaration';
};

const boundNames = (program: Program) =>
  new Set(
    program.body.flatMap((node) => {
      if (node.type === 'ImportDeclaration') return node.specifiers.map(({ local }) => local.name);
      if (node.type === 'VariableDeclaration')
        return node.declarations.flatMap(({ id }) => {
          if (id.type === 'Identifier') return [id.name];
          return [];
        });
      return [];
    }),
  );

const buildsOnlyItsExport = (program: Program) => {
  if (!program.body.every(isConfigStatement)) return false;
  let runs = false;
  const read: Array<{ readonly name: string }> = [];
  const named = new Set<object>();
  const env = new Set<object>();
  const called = new Set<object>();
  const defines = importsDefineConfig(program);
  const refuse = () => {
    runs = true;
  };
  new Visitor({
    FunctionDeclaration: refuse,
    FunctionExpression: refuse,
    ArrowFunctionExpression: refuse,
    ClassDeclaration: refuse,
    ClassExpression: refuse,
    AssignmentExpression: refuse,
    UpdateExpression: refuse,
    ThisExpression: refuse,
    ImportExpression: refuse,
    MetaProperty: refuse,
    NewExpression: refuse,
    TaggedTemplateExpression: refuse,
    CallExpression: (node) => {
      const { callee } = node;
      if (callee.type === 'Identifier' && CONFIG_CALLS.has(callee.name)) called.add(callee);
      else if (!(callee.type === 'Identifier' && callee.name === 'defineConfig' && defines))
        refuse();
    },
    UnaryExpression: (node) => {
      if (node.operator === 'delete') refuse();
    },
    Identifier: (node) => {
      if (node.type === 'Identifier') read.push(node);
    },
    Property: (node) => {
      if (!node.computed && !node.shorthand) named.add(node.key);
    },
    MemberExpression: (node) => {
      if (node.computed) return;
      named.add(node.property);
      if (
        node.object.type === 'Identifier' &&
        node.object.name === 'process' &&
        node.property.name === 'env'
      )
        env.add(node.object);
    },
    ImportSpecifier: (node) => {
      named.add(node.imported);
      named.add(node.local);
    },
    ImportDefaultSpecifier: (node) => {
      named.add(node.local);
    },
    ImportNamespaceSpecifier: (node) => {
      named.add(node.local);
    },
    VariableDeclarator: (node) => {
      named.add(node.id);
    },
  }).visit(program);
  const bound = boundNames(program);
  const shadows = [...bound].some(
    (name) => CONFIG_CALLS.has(name) || CONFIG_VALUES.has(name) || name === 'process',
  );
  return (
    !runs &&
    !shadows &&
    read
      .filter((node) => !named.has(node))
      .every(
        (node) =>
          called.has(node) || env.has(node) || bound.has(node.name) || CONFIG_VALUES.has(node.name),
      )
  );
};

const settingsOf = (file: string, text: string): Option.Option<ReadonlyMap<string, Expression>> => {
  const parsed = parseSync(file, text);
  if (parsed.errors.length > 0 || !buildsOnlyItsExport(parsed.program)) return Option.none();
  const exported = parsed.program.body.flatMap((node) => {
    if (node.type !== 'ExportDefaultDeclaration') return [];
    return [node.declaration];
  });
  const [declaration, ...more] = exported;
  if (more.length > 0) return Option.none();
  return Option.flatMap(Option.fromUndefinedOr(declaration), (node) => {
    let object = Option.none<ObjectExpression>();
    if (node.type === 'ObjectExpression') object = Option.some(node);
    if (
      node.type === 'CallExpression' &&
      node.callee.type === 'Identifier' &&
      node.callee.name === 'defineConfig' &&
      node.arguments.length === 1 &&
      importsDefineConfig(parsed.program)
    )
      Option.map(Option.fromUndefinedOr(node.arguments[0]), (argument) => {
        if (argument.type === 'ObjectExpression') object = Option.some(argument);
      });
    return Option.flatMap(object, (config) => {
      const settings = new Map<string, Expression>();
      for (const property of config.properties) {
        if (property.type === 'SpreadElement' || property.computed) return Option.none();
        if (property.key.type === 'Identifier') settings.set(property.key.name, property.value);
        else if (property.key.type === 'Literal')
          settings.set(String(property.key.value), property.value);
        else return Option.none();
      }
      return Option.some(settings);
    });
  });
};

const stringOf = (value: Expression): Option.Option<string> => {
  if (value.type !== 'Literal' || !Predicate.isString(value.value)) return Option.none();
  return Option.some(value.value);
};

const booleanOf = (value: Expression): Option.Option<boolean> => {
  if (value.type !== 'Literal' || !Predicate.isBoolean(value.value)) return Option.none();
  return Option.some(value.value);
};

const patternOf = (
  settings: ReadonlyMap<string, Expression>,
  key: string,
  absent: (file: string) => boolean,
): Option.Option<(file: string) => boolean> =>
  Option.match(Option.fromUndefinedOr(settings.get(key)), {
    onNone: () => Option.some(absent),
    onSome: (value) => {
      if (value.type === 'Literal' && 'regex' in value) {
        const match = new RegExp(value.regex.pattern, value.regex.flags);
        return Option.some((file: string) => match.test(file));
      }
      return Option.map(stringOf(value), globMatcher);
    },
  });

interface IgnoreRule {
  readonly dir: string;
  readonly rule: Minimatch;
}

const rulesOf = (dir: string, text: string): ReadonlyArray<IgnoreRule> =>
  text.split(/\r?\n/).flatMap((line) => {
    const pattern = line.trim();
    if (pattern === '') return [];
    const rule = new Minimatch(pattern, { matchBase: true, dot: true, flipNegate: true });
    if (rule.comment) return [];
    return [{ dir, rule }];
  });

type Standing = 'included' | 'ignored' | 'ignored-but-recurse';

const fromDir = (base: string, path: string) => {
  if (base === '') return path;
  return path.slice(base.length + 1);
};

const standingOf = (
  entry: string,
  rules: ReadonlyArray<IgnoreRule>,
  isDirectory: boolean,
  parent: Standing,
): Standing => {
  let standing = parent;
  for (const { dir, rule } of rules) {
    const includes = rule.negate;
    if ((standing === 'included') === includes) continue;
    let matched: Standing = 'ignored';
    if (includes) matched = 'included';
    const relative = fromDir(dir, entry);
    if (rule.match(`/${relative}`) || rule.match(relative)) {
      standing = matched;
    } else if (isDirectory && (rule.match(`/${relative}/`) || rule.match(`${relative}/`))) {
      standing = matched;
    } else if (
      isDirectory &&
      includes &&
      (rule.match(`/${relative}`, true) || rule.match(relative, true))
    ) {
      standing = 'ignored-but-recurse';
    }
  }
  return standing;
};

const walked = (
  testDir: string,
  path: string,
  respectsGit: boolean,
  gitignores: Readonly<Record<string, string>>,
) => {
  const parts = fromDir(testDir, path).split('/');
  const rulesIn = (dir: string) => {
    if (!respectsGit) return [];
    return Option.match(Option.fromUndefinedOr(gitignores[dir]), {
      onNone: () => [],
      onSome: (text) => rulesOf(dir, text),
    });
  };
  let dir = testDir;
  let rules = rulesIn(dir);
  let standing: Standing = 'included';
  for (const [at, part] of parts.entries()) {
    const entry = [dir, part].filter((piece) => piece !== '').join('/');
    const isDirectory = at < parts.length - 1;
    if (isDirectory && part === 'node_modules') return false;
    standing = standingOf(entry, rules, isDirectory, standing);
    if (!isDirectory) return standing === 'included';
    if (standing === 'ignored') return false;
    dir = entry;
    rules = [...rules, ...rulesIn(dir)];
  }
  return false;
};

const playwrightRun = (
  words: ReadonlyArray<string>,
  workspace: Pick<Workspace, 'configs' | 'absolute' | 'gitignores'>,
): Run => {
  const { configs, absolute, gitignores } = workspace;
  const read = argumentsOf(words, PLAYWRIGHT_FLAGS);
  const filters = Option.match(read, { onNone: () => [], onSome: (a) => a.positionals });
  const located = filters.some((filter) => /^(.*?):(\d+):?(\d+)?$/.test(filter));
  const file = Option.flatMap(read, ({ given }) =>
    Option.match(Option.fromUndefinedOr(valuesOf(given, ['--config', '-c']).at(-1)), {
      onNone: () => Option.fromUndefinedOr(PLAYWRIGHT_CONFIGS.find((name) => name in configs)),
      onSome: pathOf,
    }),
  );
  const takes = Option.flatMap(
    Option.filter(file, () => !located),
    (at) =>
      Option.flatMap(Option.fromUndefinedOr(configs[at]), (text) =>
        Option.flatMap(settingsOf(at, text), (settings) => {
          if ([...settings.keys()].some((key) => !PLAYWRIGHT_SETTINGS.has(key)))
            return Option.none();
          const folder = at.split('/').slice(0, -1);
          const dir = Option.filter(
            Option.match(Option.fromUndefinedOr(settings.get('testDir')), {
              onNone: () => Option.some(''),
              onSome: stringOf,
            }),
            (testDir) => !testDir.startsWith('/'),
          );
          const gitPolicy = Option.match(Option.fromUndefinedOr(settings.get('respectGitIgnore')), {
            onNone: () => Option.map(dir, (testDir) => testDir === ''),
            onSome: booleanOf,
          });
          return Option.flatMap(Option.all([dir, gitPolicy]), ([dir, respectsGit]) =>
            Option.flatMap(
              pathOf([...folder, dir, '.'].filter((part) => part !== '').join('/')),
              (root) =>
                Option.map(
                  Option.all([
                    patternOf(settings, 'testMatch', globMatcher(PLAYWRIGHT_MATCH)),
                    patternOf(settings, 'testIgnore', () => false),
                  ]),
                  ([matches, ignored]) =>
                    (path: string, text: string) => {
                      const under = root === '' || path.startsWith(`${root}/`);
                      const file = `${absolute}/${path}`;
                      const mapped = path.endsWith('.js') && text.includes('sourceMappingURL');
                      const named =
                        filters.length === 0 ||
                        (!mapped && filters.some((f) => argumentMatches(f, file)));
                      return (
                        under &&
                        walked(root, path, respectsGit, gitignores) &&
                        matches(file) &&
                        !ignored(file) &&
                        named
                      );
                    },
                ),
            ),
          );
        }),
      ),
  );
  return {
    kind: 'playwright',
    takes: Option.getOrElse(takes, () => () => false),
  };
};

const argumentMatches = (filter: string, file: string) => {
  const written = /^\/(.*)\/([gi]*)$/.exec(filter);
  const regex = Option.match(Option.fromNullOr(written), {
    onNone: () => new RegExp(filter, 'gi'),
    onSome: ([, pattern = '', flags = '']) => new RegExp(pattern, flags),
  });
  return regex.test(file);
};

const programWords = (words: ReadonlyArray<string>) => {
  if (words[0] === 'bunx' || words[0] === 'npx') return words.slice(1);
  return words;
};

const MOVES = new Set(['cd', 'pushd', 'popd']);

const movesFolder = (words: ReadonlyArray<string>) =>
  words.some(
    (word) => MOVES.has(word) || word.startsWith('(') || /^(?:--cwd|--chdir|-C)(?:=|$)/.test(word),
  );

const runsOf = (
  workspace: Pick<
    Workspace,
    'scripts' | 'configs' | 'absolute' | 'gitignores' | 'bunfig' | 'wrappers'
  >,
  name: string,
  seen: ReadonlySet<string> = new Set(),
): ReadonlyArray<Run> => {
  const { scripts, configs, absolute, gitignores } = workspace;
  if (seen.has(name)) return [];
  const script = Option.fromUndefinedOr(scripts[name]);
  if (Option.isNone(script)) return [];
  const within = new Set([...seen, name]);
  const commands = commandsOf(script.value);
  if (!andChained(script.value) || changesShell(script.value) || commands.some(movesFolder))
    return [];
  return commands.flatMap((command): ReadonlyArray<Run> => {
    const words = programWords(command);
    if (words[0] === 'playwright' && words[1] === 'test')
      return [playwrightRun(words.slice(2), { configs, absolute, gitignores })];
    if (words[0] !== 'bun') return [];
    const at = subcommandAt(words);
    const sub = words[at] ?? '';
    const next = words[at + 1] ?? '';
    if (Option.isNone(argumentsOf(words.slice(1, at), BUN_FLAGS))) return [];
    if (sub === 'run' && Option.isSome(Option.fromUndefinedOr(scripts[next]))) {
      if (words.length > at + 2) return [];
      return runsOf(workspace, next, within);
    }
    if (bunfigNarrows(workspace.bunfig)) return [];
    if (sub === 'test' || workspace.wrappers.includes(Option.getOrElse(pathOf(sub), () => '')))
      return bunTestOf([...words.slice(1, at), ...words.slice(at + 1)]);
    return [];
  });
};

const reachOf = (workspace: Workspace, file: string, text: string): Reach => {
  const units = workspace.units.filter((name) =>
    runsOf(workspace, name).some((run) => run.kind === 'bunTest' && runsFile(run, file, text)),
  );
  const by = Option.orElse(Option.fromUndefinedOr(units[0]), () =>
    Option.fromUndefinedOr(
      Object.keys(workspace.scripts)
        .filter((name) => name.startsWith('test:') && !workspace.units.includes(name))
        .find((name) => runsOf(workspace, name).some((run) => runsFile(run, file, text))),
    ),
  );
  return { by, units };
};

interface Reach {
  readonly by: Option.Option<string>;
  readonly units: ReadonlyArray<string>;
}

interface Workspace {
  readonly dir: string;
  readonly absolute: string;
  readonly scripts: Readonly<Record<string, string>>;
  readonly units: ReadonlyArray<string>;
  readonly configs: Readonly<Record<string, string>>;
  readonly gitignores: Readonly<Record<string, string>>;
  readonly bunfig: string;
  readonly wrappers: ReadonlyArray<string>;
}

const BUN_TEST_WRAPPERS = ['packages/film/src/lab/fixtures/run-suite.ts'];

interface Source {
  readonly file: string;
  readonly text: string;
  readonly link: boolean;
}

export const reachesIn = (
  workspaces: ReadonlyArray<Workspace>,
  files: ReadonlyArray<Source>,
): ReadonlyArray<Reach & { readonly file: string }> =>
  files
    .filter(({ file, text }) => isTestFile(file) && !isData(file, text))
    .map(({ file, text, link }) => {
      const reach = Option.map(
        Option.filter(
          Option.fromUndefinedOr(
            workspaces
              .filter(({ dir }) => file.startsWith(`${dir}/`))
              .toSorted((a, b) => b.dir.length - a.dir.length)[0],
          ),
          () => !link,
        ),
        (workspace) => reachOf(workspace, file.slice(workspace.dir.length + 1), text),
      );
      return {
        file,
        by: Option.flatMap(reach, ({ by }) => by),
        units: Option.match(reach, { onNone: () => [], onSome: ({ units }) => units }),
      };
    });

const playwrightConfigs = <E, R>(
  dir: string,
  scripts: Readonly<Record<string, string>>,
  read: (file: string) => Effect.Effect<Option.Option<string>, E, R>,
) => {
  const named = Object.values(scripts).flatMap((script) =>
    commandsOf(script)
      .map(programWords)
      .filter((words) => words[0] === 'playwright')
      .flatMap((words) =>
        words.flatMap((word, at) => {
          const [name = '', inline] = word.split(/=(.*)/s);
          if (name !== '--config' && name !== '-c') return [];
          return Option.toArray(
            Option.flatMap(
              Option.orElse(Option.fromUndefinedOr(inline), () =>
                Option.fromUndefinedOr(words[at + 1]),
              ),
              pathOf,
            ),
          );
        }),
      ),
  );
  return Effect.map(
    Effect.forEach([...new Set([...named, ...PLAYWRIGHT_CONFIGS])], (file) =>
      Effect.map(read(file), (text) => Option.map(text, (t) => [file, t] as const)),
    ),
    (found) => Object.fromEntries(found.flatMap(Option.toArray)),
  );
};

const gitignoresUnder = Effect.fn('reach.gitignoresUnder')(function* (dir: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const found: Array<readonly [string, string]> = [];
  const visit = (at: string): Effect.Effect<void, PlatformError.PlatformError> =>
    Effect.flatMap(fs.readDirectory(path.join(dir, at)), (names) =>
      Effect.forEach(
        names,
        (name) =>
          Effect.gen(function* () {
            const entry = path.join(at, name);
            const full = path.join(dir, entry);
            if (name === 'node_modules' || Option.isSome(yield* Effect.option(fs.readLink(full))))
              return;
            const { type } = yield* fs.stat(full);
            if (type === 'Directory') return yield* visit(entry);
            if (type === 'File' && name === '.gitignore')
              found.push([at, yield* fs.readFileString(full)]);
          }),
        { discard: true },
      ),
    );
  yield* visit('');
  return Object.fromEntries(found);
});

const RootManifest = Schema.fromJsonString(
  Schema.Struct({ workspaces: Schema.optionalKey(Schema.Array(Schema.String)) }),
);
const Manifest = Schema.fromJsonString(
  Schema.Struct({ scripts: Schema.optionalKey(Schema.Record(Schema.String, Schema.String)) }),
);

export const repoTests = Effect.fn('reach.repoTests')(function* (
  root: string,
  units: ReadonlyArray<Pick<UnitTest, 'directory' | 'task'>>,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const read = (file: string) => fs.readFileString(path.join(root, file));
  const { workspaces: globs = [] } = yield* Schema.decodeEffect(RootManifest)(
    yield* read('package.json'),
  );
  const named = globs.map((glob) => new Glob(`${glob.replace(/\/+$/, '')}/package.json`));
  const files = yield* gateFiles(root);
  const workspaces = yield* Effect.forEach(
    files.filter((file) => named.some((glob) => glob.match(file))),
    (manifest) =>
      Effect.gen(function* () {
        const { scripts = {} } = yield* Effect.flatMap(
          read(manifest),
          Schema.decodeEffect(Manifest),
        );
        const dir = path.dirname(manifest);
        const configs = yield* playwrightConfigs(dir, scripts, (file) =>
          Effect.option(read(path.join(dir, file))),
        );
        let gitignores: Readonly<Record<string, string>> = {};
        if (Object.keys(configs).length > 0)
          gitignores = yield* gitignoresUnder(path.join(root, dir));
        const bunfig = Option.getOrElse(
          yield* Effect.option(read(path.join(dir, 'bunfig.toml'))),
          () => '',
        );
        const wrappers = BUN_TEST_WRAPPERS.filter((file) => file.startsWith(`${dir}/`)).map(
          (file) => file.slice(dir.length + 1),
        );
        return {
          dir,
          absolute: path.join(root, dir),
          scripts,
          units: units.filter((unit) => unit.directory === dir).map((unit) => unit.task),
          configs,
          gitignores,
          bunfig,
          wrappers,
        } satisfies Workspace;
      }),
    { concurrency: 16 },
  );
  const testFiles = files.filter(isTestFile);
  const ancestry = (file: string) => {
    const parts = file.split('/');
    return parts.map((_, at) => parts.slice(0, at + 1).join('/'));
  };
  const linked = new Set(
    yield* Effect.filter(
      [...new Set(testFiles.flatMap(ancestry))],
      (at) => Effect.map(Effect.option(fs.readLink(path.join(root, at))), Option.isSome),
      { concurrency: 16 },
    ),
  );
  const tests = yield* Effect.forEach(
    testFiles,
    (file) =>
      Effect.gen(function* () {
        const link = ancestry(file).some((at) => linked.has(at));
        const text = yield* read(file);
        return { file, text, link } satisfies Source;
      }),
    { concurrency: 16 },
  );
  return { workspaces, tests };
});
