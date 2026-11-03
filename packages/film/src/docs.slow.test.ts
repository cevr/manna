import * as BunFileSystem from '@effect/platform-bun/BunFileSystem';
import * as BunPath from '@effect/platform-bun/BunPath';
import * as BunServices from '@effect/platform-bun/BunServices';
import { describe, expect, it } from 'effect-bun-test';
import { Effect, FileSystem, Layer, Option, Path, Predicate, Schema } from 'effect';
import type { PlatformError } from 'effect/PlatformError';
import { JSONC, TOML } from 'bun';
import { type Node, type Program, Visitor, parseSync } from 'oxc-parser';
import { LabHttpApi, pageAt } from './core/api.ts';
import { declares as declaresRoute, routesOf } from './core/testing.ts';
import { fieldsOf } from './tools/lab-fields.ts';
import { allCommands } from './tools/lab-commands.ts';
import {
  ANOTHER_REPO,
  type Anchor,
  DESIGN_LANGUAGE,
  type Doc,
  type DocPlace,
  FILM_SRC,
  type Line,
  type Markdown,
  anchorsIn,
  docPlaces,
  firstGroup,
  group,
  markdownOf,
  matches,
  readDoc,
} from './fixtures/doc-anchors.ts';

interface Code {
  readonly routes: ReadonlySet<string>;
  readonly registered: ReadonlySet<string>;
  readonly enabled: ReadonlySet<string>;
  readonly entries: ReadonlySet<string>;
  readonly bins: ReadonlySet<string>;
  readonly scripts: ReadonlySet<string>;
  readonly scriptsAt: ReadonlyMap<string, ReadonlySet<string>>;
  readonly filmCommands: ReadonlySet<string>;
  readonly commands: ReadonlySet<string>;
  readonly flags: ReadonlySet<string>;
  readonly tags: ReadonlySet<string>;
  readonly names: ReadonlySet<string>;
  readonly written: ReadonlySet<string>;
}

const declaredPath = (written: string) =>
  written
    .replace(/\[?\?.*$/, '')
    .replaceAll('<ref>', '*')
    .replace(/<(\w+)>/g, ':$1');

const pathAfter = (before: string, written: string) => {
  if (written.startsWith('…/')) return `${before}${written.slice(1)}`;
  if (/^\/[^/]+$/.test(written) && before !== '')
    return `${before.slice(0, before.lastIndexOf('/'))}${written}`;
  return written;
};

const routesInCell = (cell: string): ReadonlyArray<string> => {
  const out: Array<string> = [];
  let method = '';
  let path = '';
  for (const span of matches(cell, /`([^`]+)`/g).map(firstGroup))
    for (const parts of Option.toArray(
      Option.fromNullOr(/^(?:(GET|POST|PUT|DELETE) )?(\S+)$/.exec(span.trim())),
    )) {
      method = group(parts, 1) || method;
      path = pathAfter(path, group(parts, 2));
      out.push(`${method} ${declaredPath(path)}`);
    }
  return out;
};

const documentedRoutes = (markdown: Markdown): ReadonlyArray<string> =>
  matches(proseOf(markdown), /^\| *(`(?:GET|POST|PUT|DELETE) [^|]*)\|/gm).flatMap((m) =>
    routesInCell(firstGroup(m)),
  );

const routeDrift = (markdown: Markdown, code: Code) =>
  documentedRoutes(markdown)
    .filter((route) => !code.routes.has(route))
    .map((route) => `route ${route} is declared by no API`);

const API_PATH = /^\/(?:api|review)\/|^\/lab\/(?:<film>|:film)\//;

const spanDrift = (markdown: Markdown, code: Code) => {
  const paths = new Set(Array.from(code.routes).map((route) => route.replace(/^\S+ /, '')));
  return matches(proseOf(markdown), SPAN).flatMap((m) =>
    Option.toArray(
      Option.fromNullOr(/^(?:(GET|POST|PUT|DELETE) )?(\/\S+)$/.exec(group(m, 2).trim())),
    ).flatMap((parts) => {
      const method = group(parts, 1);
      const path = declaredPath(group(parts, 2));
      if (!API_PATH.test(path)) return [];
      if (method === '') {
        const prefix = path.replace(/\*$/, '');
        if (
          paths.has(path) ||
          (prefix.endsWith('/') && [...paths].some((p) => p.startsWith(prefix)))
        )
          return [];
        return [`path ${path} is no route of the API`];
      }
      if (code.routes.has(`${method} ${path}`)) return [];
      return [`route ${method} ${path} is declared by no API`];
    }),
  );
};

const PAGE_PATH = /^\/(?:films|sets|series|folders|productions|asks|studio)\/\S*$/;
const SERVED_BESIDE = /^\/films\/[^/]+\/(?:narration\/[^/]+|board\.json|board\/[^/]+)$/;

const pageDrift = (markdown: Markdown) =>
  matches(proseOf(markdown), SPAN).flatMap((m) => {
    const span = group(m, 2).trim();
    if (!PAGE_PATH.test(span)) return [];
    const path = span.replace(/[?#].*$/, '').replace(/<[^>]+>|:[a-z]+/g, 'x');
    if (Option.isSome(pageAt(path)) || SERVED_BESIDE.test(path)) return [];
    return [`page ${span} is no page of the lab`];
  });

const ruleDrift = (markdown: Markdown, code: Code) =>
  matches(proseOf(markdown), /`film\/([a-z]+(?:-[a-z]+)*)`/g)
    .map(firstGroup)
    .filter((rule) => !code.registered.has(rule) && !code.entries.has(rule))
    .map((rule) => `rule film/${rule} is not registered`);

const VALUED = '--cwd|--filter|-F|--env-file|--config|-c|--preload|-r';

const BUN_RUN = new RegExp(
  `\\bbun run((?:\\s+(?:(?:${VALUED})[= ]\\S+|--?[a-z][\\w-]*))*)\\s+((?:\\.{1,2}/)?[a-z][\\w.:/-]*)([^#\`\\n]*)`,
  'g',
);

interface Run {
  readonly cwd: Option.Option<string>;
  readonly script: string;
  readonly rest: string;
}

const runsIn = (text: string): ReadonlyArray<Run> =>
  matches(text, BUN_RUN).map((m) => ({
    cwd: Option.map(Option.fromNullOr(/--cwd[= ](\S+)/.exec(group(m, 1))), (cwd) =>
      group(cwd, 1)
        .replace(/^\.(?:\/|$)/, '')
        .replace(/\/$/, ''),
    ),
    script: group(m, 2).replace(/[.:]+$/, ''),
    rest: group(m, 3),
  }));

const scriptsFor = (run: Run, code: Code): ReadonlySet<string> =>
  Option.match(run.cwd, {
    onNone: () => code.scripts,
    onSome: (cwd) => code.scriptsAt.get(cwd) ?? new Set<string>(),
  });

const scriptDrift = (markdown: Markdown, code: Code) =>
  runsIn(markdown.lines.map((line) => line.text).join('\n'))
    .filter(
      (run) =>
        !scriptsFor(run, code).has(run.script) &&
        !code.bins.has(run.script) &&
        !/[./]/.test(run.script),
    )
    .map((run) => `bun run ${run.script}: no such script`);

const proseOf = (markdown: Markdown) =>
  markdown.lines
    .filter((line) => !line.code)
    .map((line) => line.text)
    .join('\n');

const SPAN = /(`+) ?(.*?) ?\1/g;

interface Found {
  readonly anchor: Anchor;
  readonly ours: boolean;
  readonly file: Option.Option<string>;
  readonly text: Option.Option<string>;
}

const uncommented = (text: string) => text.replace(/\/\*[\s\S]*?\*\/|(?<![:'"`\w])\/\/.*$/gm, '');

interface Declared {
  readonly name: string;
  readonly at: number;
  readonly spans: Option.Option<{ readonly start: number; readonly end: number }>;
}

const nameOf = (node: Node): ReadonlyArray<string> => {
  if (node.type === 'Identifier') return [node.name];
  if (node.type === 'Literal' && Predicate.isString(node.value)) return [node.value];
  return [];
};

const boundBy = (pattern: Node): ReadonlyArray<string> => {
  if (pattern.type === 'ObjectPattern') return pattern.properties.flatMap(boundBy);
  if (pattern.type === 'Property') return boundBy(pattern.value);
  if (pattern.type === 'ArrayPattern')
    return pattern.elements.flatMap((element) =>
      Option.toArray(Option.fromNullOr(element)).flatMap(boundBy),
    );
  if (pattern.type === 'AssignmentPattern') return boundBy(pattern.left);
  if (pattern.type === 'RestElement') return boundBy(pattern.argument);
  return nameOf(pattern);
};

const declaredIn = (program: Program): ReadonlyArray<Declared> => {
  const out: Array<Declared> = [];
  const add = (names: ReadonlyArray<string>, at: number, spans: Declared['spans']) =>
    names.forEach((name) => out.push({ name, at, spans }));
  const id = (name: Option.Option<Node>, node: { readonly start: number; readonly end: number }) =>
    add(Option.toArray(name).flatMap(nameOf), node.start, Option.some(node));
  const member = (key: Node, computed: boolean, at: number) => {
    if (!computed) add(nameOf(key), at, Option.none());
  };
  new Visitor({
    VariableDeclarator: (node) => add(boundBy(node.id), node.start, Option.some(node)),
    FunctionDeclaration: (node) => id(Option.fromNullOr(node.id), node),
    ClassDeclaration: (node) => id(Option.fromNullOr(node.id), node),
    ClassExpression: (node) => id(Option.fromNullOr(node.id), node),
    TSInterfaceDeclaration: (node) => id(Option.some(node.id), node),
    TSTypeAliasDeclaration: (node) => id(Option.some(node.id), node),
    TSEnumDeclaration: (node) => id(Option.some(node.id), node),
    TSEnumMember: (node) => id(Option.some(node.id), node),
    TSModuleDeclaration: (node) => id(Option.some(node.id), node),
    MethodDefinition: (node) => member(node.key, node.computed, node.start),
    PropertyDefinition: (node) => member(node.key, node.computed, node.start),
    AccessorProperty: (node) => member(node.key, node.computed, node.start),
    TSAbstractMethodDefinition: (node) => member(node.key, node.computed, node.start),
    TSAbstractPropertyDefinition: (node) => member(node.key, node.computed, node.start),
    TSAbstractAccessorProperty: (node) => member(node.key, node.computed, node.start),
    TSPropertySignature: (node) => member(node.key, node.computed, node.start),
    TSMethodSignature: (node) => member(node.key, node.computed, node.start),
    ExportSpecifier: (node) => id(Option.some(node.exported), node),
    ExportAllDeclaration: (node) => id(Option.fromNullOr(node.exported), node),
    ObjectExpression: (node) =>
      node.properties.forEach((p) => {
        if (p.type === 'Property' && !p.computed) add(nameOf(p.key), p.start, Option.none());
      }),
  }).visit(program);
  return out;
};

interface Source {
  readonly text: string;
  readonly declared: Option.Option<ReadonlyArray<Declared>>;
}

const sourceOf = (text: string, file: string): Source => {
  const { program, errors } = parseSync(file, text);
  return {
    text,
    declared: Option.liftPredicate(declaredIn(program), () => errors.length === 0),
  };
};

const declaresIn = (source: Source, symbol: string) => {
  if (symbol.startsWith("'")) {
    const code = uncommented(source.text).replace(
      /^import\s[\s\S]*?\sfrom\s*['"][^'"]+['"];?/gm,
      '',
    );
    return code.includes(symbol);
  }
  const [head = '', ...members] = symbol.replace(/\(.*\)$/, '').split('.');
  return Option.exists(source.declared, (declared) =>
    declared
      .filter((d) => d.name === head)
      .some((d) =>
        Option.exists(d.spans, (span) =>
          members.every((name) =>
            declared.some((m) => m.name === name && span.start <= m.at && m.at < span.end),
          ),
        ),
      ),
  );
};

const declares = (text: string, symbol: string, file = 'code.ts') =>
  declaresIn(sourceOf(text, file), symbol);

const PACKAGE_NAME = /^@[\w-]+\/[\w.-]+/;

const ignoredDirectories = (gitignore: string): ReadonlySet<string> =>
  new Set(
    gitignore
      .split('\n')
      .map((line) =>
        line
          .trim()
          .replace(/^\*\*\//, '')
          .replace(/\/$/, ''),
      )
      .filter((line) => /^[\w.-]+$/.test(line)),
  );

const anchorDrift = (
  found: ReadonlyArray<Found>,
  sourceAt: (file: string, text: string) => Source,
) =>
  found
    .filter(({ anchor, ours }) => ours && !anchor.receipt)
    .flatMap(({ anchor, file, text }) => [
      ...[`${anchor.written}: name a symbol, not a line`].filter(() => anchor.line),
      ...Option.match(file, {
        onNone: () => [`path ${anchor.path} does not exist`],
        onSome: (at) =>
          anchor.symbols
            .filter((symbol) => !Option.exists(text, (t) => declaresIn(sourceAt(at, t), symbol)))
            .map((symbol) => `${at} has no ${symbol}`),
      }),
    ]);

const findAnchors = Effect.fn('test.docs.findAnchors')(function* (root: string, doc: Doc) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const isDirectory = (at: string) =>
    Effect.map(
      Effect.option(fs.stat(path.join(root, at))),
      Option.exists((info) => info.type === 'Directory'),
    );
  const ignored = ignoredDirectories(yield* fs.readFileString(path.join(root, '.gitignore')));
  const elsewhere = (anchor: Anchor, first: string) =>
    Effect.map(
      isDirectory(path.join('node_modules', first)),
      (installed) => installed || PACKAGE_NAME.test(anchor.path) || ignored.has(first),
    );
  return yield* Effect.forEach(anchorsIn(doc), (anchor) =>
    Effect.gen(function* () {
      if (anchor.link) {
        const at = path.join(path.dirname(doc.path), anchor.path);
        const there = yield* fs.exists(path.join(root, at));
        return {
          anchor,
          ours: true,
          file: Option.liftPredicate(at, () => there),
          text: Option.none(),
        } satisfies Found;
      }
      const first = anchor.path.split('/')[0] ?? '';
      const bases = yield* Effect.filter(doc.bases, (base) =>
        Effect.map(isDirectory(path.join(base, first)), (there) => there && !ignored.has(first)),
      );
      const under = yield* Effect.filter(bases, (base) =>
        fs.exists(path.join(root, base, anchor.path)),
      );
      const file = Option.map(Option.fromUndefinedOr(under[0]), (base) =>
        path.join(base, anchor.path),
      );
      const read = Option.filter(file, () => anchor.symbols.length > 0);
      return {
        anchor,
        ours: bases.length > 0 || (doc.whole && !(yield* elsewhere(anchor, first))),
        file,
        text: yield* Option.match(read, {
          onNone: () => Effect.succeed(Option.none<string>()),
          onSome: (at) => Effect.option(fs.readFileString(path.join(root, at))),
        }),
      } satisfies Found;
    }),
  );
});

const undeclaredFlags = (words: string, code: Code) =>
  matches(words, /(?:^|\s|\[)--([a-z][a-z\d-]*)/g)
    .map(firstGroup)
    .filter((flag) => !code.flags.has(flag.replace(/^no-/, '')));

const FILM_BIN = /(?:^|[\s(])film ([a-z][\w-]*)([^#]*)/g;

const AT_BIN = /^\s*(?:\$\s+)?film /;

const commandsIn = (line: Line): ReadonlyArray<string> => {
  if (line.code)
    return line.text
      .replace(/(?:^|\s)#.*$/, '')
      .split(/&&|\|\|?|;/)
      .filter((command) => AT_BIN.test(command));
  const spans = matches(line.text, SPAN).map((m) => group(m, 2));
  const head = line.text.split('`')[0] ?? '';
  if (!AT_BIN.test(head) || /;|,\s/.test(head)) return spans;
  return [head, ...spans];
};

const flagDrift = (line: Line, code: Code) => [
  ...runsIn(line.text)
    .filter((run) => code.filmCommands.has(run.script))
    .flatMap((run) =>
      undeclaredFlags(run.rest, code).map(
        (flag) => `bun run ${run.script} --${flag}: no command declares the flag`,
      ),
    ),
  ...commandsIn(line)
    .flatMap((command) => matches(command, FILM_BIN))
    .filter((m) => code.commands.has(firstGroup(m)))
    .flatMap((m) =>
      undeclaredFlags(group(m, 2), code).map(
        (flag) => `film ${firstGroup(m)} --${flag}: no command declares the flag`,
      ),
    ),
];

const FINDING = /\b([A-Z][a-z]+(?:[A-Z][a-z]+)+)\b/g;

const findingDrift = (line: string, code: Code) => {
  const commandLine = /^\s*(?:bun run|film) check\b/.test(line);
  if (!commandLine && !/`(?:bun run|film) check\b/.test(line)) return [];
  return matches(line, FINDING)
    .filter((m) => commandLine || /`$/.test(line.slice(0, m.index)))
    .map(firstGroup)
    .filter((name) => !code.tags.has(name) && (commandLine || !code.names.has(name)))
    .map((name) => `${name} is no finding`);
};

const BARE = /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*(?:\([^()]*\))?$/;

const FILE_NAME =
  /\.(?:md|[cm]?[jt]sx?|json|jsonc|toml|ya?ml|riv|rml|css|html|svg|png|jpe?g|webp|wav|mp3|mp4|vtt|txt|lock|sh)$/;

const CODE_NAME =
  /^(?:[a-z][a-z\d]*[A-Z][A-Za-z\d]*|[A-Z][a-z\d]+(?:[A-Z][a-z\d]*)+|[A-Z]{2,}[A-Z][a-z]+(?:[A-Z][a-z]+)*|[A-Z][A-Z\d]*(?:_[A-Z\d]+)+|[A-Z][A-Z\d]{4,})$/;

const AT_COMMIT = /^\s+at\s+`(?=[0-9a-f]*[a-f])[0-9a-f]{7,40}`/;

const bareNameDrift = (text: string, written: ReadonlySet<string>) =>
  markdownOf(text, 'local')
    .lines.filter((line) => !line.code && !ANOTHER_REPO.test(line.text))
    .flatMap((line) =>
      matches(line.text, SPAN)
        .filter((m) => !AT_COMMIT.test(line.text.slice(m.index + m[0].length)))
        .map((m) => group(m, 2)),
    )
    .filter((span) => BARE.test(span) && !FILE_NAME.test(span))
    .flatMap((span) =>
      span
        .replace(/\(.*\)$/, '')
        .split('.')
        .filter((part) => CODE_NAME.test(part) && !written.has(part))
        .map((part) => `\`${span}\`: the code writes no ${part}`),
    );

const drift = (doc: Doc, code: Code): ReadonlyArray<string> => {
  const markdown = markdownOf(doc.text);
  return [
    ...routeDrift(markdown, code),
    ...spanDrift(markdown, code),
    ...pageDrift(markdown),
    ...ruleDrift(markdown, code),
    ...scriptDrift(markdown, code),
    ...markdown.lines.flatMap((line) => [
      ...flagDrift(line, code),
      ...findingDrift(line.text, code),
    ]),
    ...bareNameDrift(doc.text, code.written),
  ].map((what) => `${doc.path}: ${what}`);
};

const undocumented = (docs: ReadonlyArray<Doc>, code: Code): ReadonlyArray<string> => {
  const documented = new Set(docs.flatMap((doc) => documentedRoutes(markdownOf(doc.text))));
  return Array.from(code.routes).filter((route) => !documented.has(route));
};

const Scripts = Schema.fromJsonString(
  Schema.Struct({ scripts: Schema.Record(Schema.String, Schema.String) }),
);

const workspacesIn = (root: string, parent: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const names = yield* fs.readDirectory(path.join(root, parent));
    return yield* Effect.filter(names.map((name) => `${parent}/${name}`).toSorted(), (dir) =>
      Effect.flatMap(fs.stat(path.join(root, dir)), (info) =>
        Effect.map(
          Effect.when(
            fs.exists(path.join(root, dir, 'package.json')),
            Effect.succeed(info.type === 'Directory'),
          ),
          Option.getOrElse(() => false),
        ),
      ),
    );
  });

const CODE_FILE = /\.tsx?$/;

const CONFIG_FILE = /\.(?:jsonc?|toml)$/;

const ONE_NAME = /^[A-Za-z_$][\w$]*$/;

const TEST_RUNNERS: ReadonlySet<string> = new Set(['describe', 'it', 'test', 'bench']);

const calleeRoot = (node: Node): string => {
  if (node.type === 'MemberExpression') return calleeRoot(node.object);
  if (node.type === 'CallExpression') return calleeRoot(node.callee);
  if (node.type === 'Identifier') return node.name;
  return '';
};

const isJsonObject = (value: Schema.Json): value is Schema.JsonObject =>
  Predicate.isObject(value) && !Array.isArray(value);

const configWords = (value: Schema.Json, values: boolean): ReadonlyArray<string> => {
  if (Array.isArray(value)) return value.flatMap((v: Schema.Json) => configWords(v, values));
  if (isJsonObject(value))
    return Object.entries(value).flatMap(([key, v]) => [key, ...configWords(v, values)]);
  if (values && Predicate.isString(value) && ONE_NAME.test(value)) return [value];
  return [];
};

const decodeJson = Schema.decodeUnknownSync(Schema.Json);

const pathWords = (source: Option.Option<Node>): ReadonlyArray<string> =>
  Option.toArray(source).flatMap((node) => {
    if (node.type !== 'Literal' || !Predicate.isString(node.value)) return [];
    return matches(node.value, /[A-Za-z_$][\w$]*/g).map((m) => m[0]);
  });

const wordsOf = (file: string, text: string): ReadonlyArray<string> => {
  if (/\.jsonc?$/.test(file)) return configWords(decodeJson(JSONC.parse(text)), true);
  if (file.endsWith('.toml')) return configWords(decodeJson(TOML.parse(text)), false);
  const words: Array<string> = [];
  const strings: Array<{ readonly at: number; readonly value: string }> = [];
  const titles = new Set<number>();
  const fromPath = (source: Option.Option<Node>) => words.push(...pathWords(source));
  new Visitor({
    Identifier: (node) => words.push(node.name),
    PrivateIdentifier: (node) => words.push(node.name),
    JSXIdentifier: (node) => words.push(node.name),
    Literal: (node) => {
      if (Predicate.isString(node.value)) strings.push({ at: node.start, value: node.value });
    },
    CallExpression: (node) => {
      if (TEST_RUNNERS.has(calleeRoot(node.callee)))
        node.arguments.slice(0, 1).forEach((title) => titles.add(title.start));
    },
    ImportDeclaration: (node) => fromPath(Option.some(node.source)),
    ImportExpression: (node) => fromPath(Option.some(node.source)),
    ExportNamedDeclaration: (node) => fromPath(Option.fromNullOr(node.source)),
    ExportAllDeclaration: (node) => fromPath(Option.some(node.source)),
  }).visit(parseSync(file, text).program);
  return [
    ...words,
    ...strings.filter((s) => !titles.has(s.at) && ONE_NAME.test(s.value)).map((s) => s.value),
  ];
};

const WRITTEN_CACHE = 'packages/film/node_modules/.cache/film-docs/written.json';

const WALK = 32;

const WrittenCache = Schema.fromJsonString(
  Schema.Struct({
    reader: Schema.String,
    files: Schema.Record(
      Schema.String,
      Schema.Struct({ hash: Schema.String, words: Schema.Array(Schema.String) }),
    ),
  }),
);

const keptWords = (cache: string, reader: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const held = yield* Effect.option(
      Effect.flatMap(fs.readFileString(cache), Schema.decodeUnknownEffect(WrittenCache)),
    );
    return new Map(
      Option.match(
        Option.filter(held, (h) => h.reader === reader),
        {
          onNone: () => [],
          onSome: (h) => Object.entries(h.files),
        },
      ),
    );
  });

const keepWords = (cache: string, written: typeof WrittenCache.Type) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    yield* fs.makeDirectory(path.dirname(cache), { recursive: true });
    const beside = `${cache}.${process.pid}`;
    yield* fs.writeFileString(beside, yield* Schema.encodeEffect(WrittenCache)(written));
    yield* fs.rename(beside, cache);
  });

const writtenIn = Effect.fn('test.docs.writtenIn')(function* (
  root: string,
  workspaces: ReadonlyArray<string>,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const ignored = ignoredDirectories(yield* fs.readFileString(path.join(root, '.gitignore')));
  const self = path.relative(root, import.meta.path);
  const filesIn = (
    dir: string,
    top: boolean,
    deep: boolean,
  ): Effect.Effect<ReadonlyArray<string>, PlatformError> =>
    Effect.flatMap(fs.readDirectory(path.join(root, dir)), (names) =>
      Effect.map(
        Effect.forEach(
          names.filter((name) => name !== 'node_modules' && !ignored.has(name)),
          (name) =>
            Effect.flatMap(fs.stat(path.join(root, dir, name)), (info) => {
              const at = path.join(dir, name);
              if (info.type === 'Directory' && deep) return filesIn(at, false, deep);
              const read =
                info.type !== 'Directory' &&
                at !== self &&
                (CODE_FILE.test(name) || (top && CONFIG_FILE.test(name)));
              return Effect.succeed([at].filter(() => read));
            }).pipe(
              Effect.catchIf(
                (error) => error.reason._tag === 'NotFound',
                () => Effect.succeed([]),
              ),
            ),
          { concurrency: WALK },
        ),
        (each) => each.flat(),
      ),
    );
  const files = [
    ...(yield* filesIn('', true, false)),
    ...(yield* Effect.forEach(workspaces, (dir) => filesIn(dir, true, true))).flat(),
  ];
  const cache = path.join(root, WRITTEN_CACHE);
  const reader = Bun.hash(
    [
      yield* fs.readFileString(import.meta.path),
      yield* fs.readFileString(path.join(import.meta.dir, 'fixtures/doc-anchors.ts')),
      yield* fs.readFileString(path.join(root, 'bun.lock')),
      Bun.version,
    ].join('\u0000'),
  ).toString(36);
  const kept = yield* keptWords(cache, reader);
  const read = yield* Effect.forEach(
    files,
    (file) =>
      Effect.map(fs.readFileString(path.join(root, file)), (text) => {
        const hash = Bun.hash(text).toString(36);
        return Option.getOrElse(
          Option.filter(Option.fromUndefinedOr(kept.get(file)), (held) => held.hash === hash),
          () => ({ hash, words: [...new Set(wordsOf(file, text))] }),
        );
      }),
    { concurrency: WALK },
  );
  const fresh = read.some((each, i) => kept.get(files[i] ?? '') !== each);
  if (fresh || kept.size !== files.length)
    yield* keepWords(cache, {
      reader,
      files: Object.fromEntries(files.map((file, i) => [file, read[i] ?? { hash: '', words: [] }])),
    });
  return new Set(read.flatMap((each) => each.words));
});

const readCode = Effect.fn('test.docs.readCode')(function* (root: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const at = (...parts: ReadonlyArray<string>) => path.join(root, ...parts);
  const read = (...parts: ReadonlyArray<string>) => fs.readFileString(at(...parts));
  const sources = (dir: string) =>
    Effect.flatMap(fs.readDirectory(at(dir), { recursive: true }), (files) =>
      Effect.forEach(
        files.filter((f) => /\.tsx?$/.test(f) && !f.includes('node_modules')),
        (f) => read(dir, f),
      ),
    );
  const entriesOf = (dir: string) =>
    Effect.map(Effect.option(fs.readDirectory(at(dir))), (names) =>
      Option.getOrElse(names, (): ReadonlyArray<string> => []),
    );
  const scriptsOf = (dir: string) =>
    Effect.flatMap(read(dir, 'package.json'), Schema.decodeUnknownEffect(Scripts));
  const workspaces = yield* Effect.forEach(['apps', 'packages'], (parent) =>
    workspacesIn(root, parent),
  );
  const scriptsAt = new Map(
    yield* Effect.forEach(['', ...workspaces.flat()], (dir) =>
      Effect.map(scriptsOf(dir), (p) => [dir, new Set(Object.keys(p.scripts))] as const),
    ),
  );
  const packages = yield* Effect.forEach(['', 'apps/animations', 'packages/film'], scriptsOf);
  const scripts = packages.flatMap((p) => Object.entries(p.scripts));
  const plugin = yield* read('packages/film/lint/plugin.ts');
  const oxlintrc = yield* read('.oxlintrc.json');
  const tools = (yield* sources('packages/film/src/tools')).join('\n');
  const srcFiles = yield* sources('packages/film/src');
  const src = srcFiles.join('\n');
  const srcCode = srcFiles.map(uncommented).join('\n');
  const entries = yield* Effect.forEach(['packages/film', FILM_SRC], entriesOf);
  const bins = yield* Effect.forEach(['', ...workspaces.flat()], (dir) =>
    entriesOf(path.join(dir, 'node_modules', '.bin')),
  );
  return {
    routes: new Set(routesOf(LabHttpApi).map((r) => `${r.method} ${r.path}`)),
    registered: new Set(matches(plugin, /^ {4}'([a-z-]+)': /gm).map(firstGroup)),
    enabled: new Set(matches(oxlintrc, /"film\/([a-z-]+)": "error"/g).map(firstGroup)),
    entries: new Set(entries.flat()),
    bins: new Set(bins.flat()),
    scripts: new Set(scripts.map(([name]) => name)),
    scriptsAt,
    filmCommands: new Set(
      scripts.filter(([, run]) => run.startsWith('bun cli.ts ')).map(([name]) => name),
    ),
    commands: new Set(
      scripts.flatMap(([, run]) =>
        Option.toArray(Option.fromNullOr(/^bun cli\.ts ([a-z][\w-]*)/.exec(run))).map(firstGroup),
      ),
    ),
    flags: new Set([
      ...matches(tools, /Flag\.\w+\(\s*'([a-z][a-z-]*)'/g).map(firstGroup),
      ...allCommands.flatMap((command) => fieldsOf(command.tool).map((field) => field.name)),
    ]),
    tags: new Set(matches(src, /TaggedError<(\w+)>/g).map(firstGroup)),
    names: new Set(
      [
        ...matches(srcCode, /\b(?:interface|type|class|const|enum|function)\s+([A-Z]\w*)/g),
        ...matches(srcCode, /\.([A-Z]\w*)\b/g),
        ...matches(srcCode, /^import\s+(?:type\s+)?(?:\w+\s*,\s*)?\{([^}]*)\}/gm).flatMap((m) =>
          matches(firstGroup(m), /(?:^|[\s,])(?:type\s+)?([A-Z]\w*)/g),
        ),
        ...matches(srcCode, /^import\s+(?:type\s+)?(?:\w+\s*,\s*)?\*\s+as\s+([A-Z]\w*)/gm),
        ...matches(srcCode, /^import\s+(?:type\s+)?([A-Z]\w*)\s*(?:,|from\b)/gm),
      ].map(firstGroup),
    ),
    written: yield* writtenIn(root, workspaces.flat()),
  } satisfies Code;
});

const parsed = new Map<string, { readonly text: string; readonly source: Source }>();

const sourceAt = (file: string, text: string) =>
  Option.getOrElse(
    Option.filter(Option.fromUndefinedOr(parsed.get(file)), (held) => held.text === text),
    () => {
      const held = { text, source: sourceOf(text, file) };
      parsed.set(file, held);
      return held;
    },
  ).source;

const anchorsDrift = (root: string, docs: ReadonlyArray<Doc>) =>
  Effect.map(
    Effect.forEach(docs, (doc) =>
      Effect.map(findAnchors(root, doc), (found) =>
        anchorDrift(found, sourceAt).map((what) => `${doc.path}: ${what}`),
      ),
    ),
    (each) => each.flat(),
  );

const ROOT = Effect.map(Path.Path, (path) => path.join(import.meta.dir, '..', '..', '..'));

const PLACES = docPlaces(`${import.meta.dir}/../../..`);

const codeRead = Effect.runPromiseExit(
  Effect.flatMap(ROOT, readCode).pipe(Effect.provide(BunServices.layer)),
);

const repoCode = Effect.flatten(Effect.promise(() => codeRead));

const TOKENS_CSS = 'packages/film/src/player/tokens.css';

const tokenBlock = (doc: string) => {
  let section = '';
  const blocks: Array<string> = [];
  Bun.markdown.render(doc, {
    heading: (children, { level }) => {
      if (level === 2) section = children;
      return children;
    },
    code: (children, meta) => {
      if (section === '3. Tokens' && meta?.language === 'css') blocks.push(children);
      return children;
    },
  });
  return blocks[0] ?? '';
};

const declaredTokens = (sheet: string) => {
  const start = sheet.indexOf(':root {');
  const end = sheet.indexOf('/* The ground every page');
  return `${sheet.slice(start, end).trimEnd()}\n`;
};

const CITED_ROUTE = /\b(GET|HEAD|POST|PUT|PATCH|DELETE|OPTIONS)\s+`?(?=\/api\/[a-z$<:])/g;

const OPENER = { ')': '(', ']': '[', '}': '{' } as const;

const closes = (c: string): c is keyof typeof OPENER => c in OPENER;

const endsPath = (c: string, open: ReadonlyArray<string>) =>
  /[\s'"`]/.test(c) || (closes(c) && open.at(-1) !== OPENER[c]);

const templateEnd = (text: string, at: number): number => {
  let depth = 0;
  for (let i = at + 1; i < text.length; i += 1) {
    depth += Number(text.charAt(i) === '{') - Number(text.charAt(i) === '}');
    if (depth === 0) return i + 1;
  }
  return text.length;
};

interface Cited {
  readonly written: string;
  readonly read: string;
}

const citedPath = (text: string): Cited => {
  const open: Array<string> = [];
  let read = '';
  let at = 0;
  while (at < text.length && !endsPath(text.charAt(at), open)) {
    const c = text.charAt(at);
    if (text.startsWith('${', at)) {
      at = templateEnd(text, at);
      read += '${}';
    } else {
      if (closes(c)) open.pop();
      if ('([{'.includes(c)) open.push(c);
      read += c;
      at += 1;
    }
  }
  const stops = read.length - read.replace(/[.,;:]+$/, '').length;
  return {
    written: text.slice(0, at - stops),
    read: read.slice(0, read.length - stops),
  };
};

const pathOf = (read: string) =>
  read
    .replace(/\$\{\}|<[^>\s]+>|(?<=\/):\w+/g, 'x')
    .split(/[?#]/)
    .at(0) ?? '';

const CITED_PATH = /(?<![\w/.:-])(?=\/api\/[a-z$<:])/g;

const AFTER_METHOD = /\b(?:GET|HEAD|POST|PUT|PATCH|DELETE|OPTIONS)\s+`?$/;

interface Api {
  readonly has: (method: string, pathname: string) => boolean;
  readonly reaches: (pathname: string) => boolean;
}

const leads = (pathname: string, route: string) => {
  const cited = pathname.split('/');
  const declared = route.split('/');
  return cited.every(
    (segment, i) =>
      declared.slice(0, i + 1).includes('*') ||
      declared[i] === segment ||
      (declared[i] ?? '').startsWith(':'),
  );
};

const apiOf = (api: typeof LabHttpApi): Api => {
  const routes = routesOf(api);
  return {
    has: declaresRoute(api),
    reaches: (pathname) => routes.some((route) => leads(pathname, route.path)),
  };
};

const commentRouteDrift = (file: string, text: string, api: Api): ReadonlyArray<string> => {
  const parsed = parseSync(file, text);
  if (parsed.errors.length > 0) return [`${file}: the parser cannot read it`];
  const parts: Array<string> = [];
  let after = 0;
  for (const comment of parsed.comments) {
    parts.push(text.slice(after, comment.start));
    after = comment.end;
  }
  parts.push(text.slice(after));
  const code = parts.join('');
  const lineAt = (comment: { readonly start: number }, at: number) =>
    text.slice(0, comment.start + 2 + at).split('\n').length;
  return parsed.comments.flatMap((comment) => [
    ...matches(comment.value, CITED_ROUTE).flatMap((m) => {
      const method = firstGroup(m);
      const cited = citedPath(comment.value.slice(m.index + m[0].length));
      return Array.of(
        `${file}:${lineAt(comment, m.index)}: ${method} ${cited.written} is declared by no API`,
      ).filter(() => !api.has(method, pathOf(cited.read)));
    }),
    ...matches(comment.value, CITED_PATH)
      .filter((m) => !AFTER_METHOD.test(comment.value.slice(0, m.index)))
      .flatMap((m) => {
        const cited = citedPath(comment.value.slice(m.index));
        const pathname = pathOf(cited.read);
        return Array.of(
          `${file}:${lineAt(comment, m.index)}: ${cited.written} is declared by no API`,
        ).filter(
          () =>
            !api.reaches(pathname.replace(/\/\*?$/, '')) &&
            !code.includes(pathname.replace(/\/$/, '')),
        );
      }),
  ]);
};

describe('the docs', () => {
  it.effect.layer(BunServices.layer)(
    'let no comment in the film package, its browser tests or the app name a route the API does not declare',
    () =>
      Effect.gen(function* () {
        const root = yield* ROOT;
        const fs = yield* FileSystem.FileSystem;
        const api = apiOf(LabHttpApi);
        const files = (yield* Effect.forEach(
          [FILM_SRC, 'packages/film/e2e', 'apps/animations/src'],
          (dir) =>
            Effect.map(fs.readDirectory(`${root}/${dir}`, { recursive: true }), (found) =>
              found
                .filter((f) => /\.tsx?$/.test(f) && !f.includes('node_modules'))
                .map((f) => `${dir}/${f}`),
            ),
        )).flat();
        expect(files.length).toBeGreaterThan(600);
        const drift = yield* Effect.forEach(files, (file) =>
          Effect.map(fs.readFileString(`${root}/${file}`), (text) =>
            commentRouteDrift(file, text, api),
          ),
        );
        expect(drift.flat()).toEqual([]);
        expect(
          commentRouteDrift(
            'red.ts',
            [
              '// POST /api/films/<film>/choices/level moved a knob',
              '/**',
              ' * GET /api/review/gone',
              ' */',
              '// POST /api/films/<film>/script/marks and GET /api/review/index',
              "const url = 'GET /api/nowhere';",
              'const a = 1; // POST /api/films/:film/choices/level after code',
              '/*',
              '  GET /api/review/also-gone',
              '*/',
              '// HEAD /api/review/index, OPTIONS /api/films/<film>/notes',
              '// GET /api/films/${encodeURIComponent(film)}/board/stale, GET /api/films/:film/board/files/:file.',
              '// GET /api/films/${encodeURIComponent({ name: film }.name)}/board/stale (GET /api/review/index).',
              '// `POST /api/films/<film>/script/marks(extra)` takes no mark',
              '// polls `/api/review/gone?since=` for a build, and /api/films/<film>/gone/too.',
              '// reads /api/review/index?fresh, under /api/films/probe, every route under /api/ and its own /api/own',
              "const own = new URL('/api/own', 'http://lab');",
              'const doc = `',
              '// GET /api/nowhere/in/a/string',
              ' * POST /api/never',
              '`;',
            ].join('\n'),
            api,
          ),
        ).toEqual([
          'red.ts:1: POST /api/films/<film>/choices/level is declared by no API',
          'red.ts:3: GET /api/review/gone is declared by no API',
          'red.ts:7: POST /api/films/:film/choices/level is declared by no API',
          'red.ts:9: GET /api/review/also-gone is declared by no API',
          'red.ts:11: HEAD /api/review/index is declared by no API',
          'red.ts:11: OPTIONS /api/films/<film>/notes is declared by no API',
          'red.ts:14: POST /api/films/<film>/script/marks(extra) is declared by no API',
          'red.ts:15: /api/review/gone?since= is declared by no API',
          'red.ts:15: /api/films/<film>/gone/too is declared by no API',
        ]);
        expect(commentRouteDrift('broken.ts', 'const = ;', api)).toEqual([
          'broken.ts: the parser cannot read it',
        ]);
      }),
  );

  it.effect('read every doc the framework, the runbook and the packages keep', () =>
    Effect.sync(() => {
      expect(PLACES.filter((place) => place.role === 'framework').length).toBeGreaterThan(10);
      expect(
        PLACES.filter((place) => place.role === 'spanned' || place.role === 'anchored').length,
      ).toBe(9);
      expect(PLACES.filter((place) => place.role === 'verify').length).toBeGreaterThan(5);
    }),
  );

  it.effect.layer(BunServices.layer)(
    'document every declared route, and turn every registered rule on',
    () =>
      Effect.gen(function* () {
        const root = yield* ROOT;
        const [code, docs] = yield* Effect.all([
          repoCode,
          Effect.forEach(
            PLACES.filter((place) => place.role === 'framework'),
            (place) => readDoc(root, place),
          ),
        ]);
        expect(undocumented(docs, code)).toEqual([]);
        expect(Array.from(code.registered).filter((rule) => !code.enabled.has(rule))).toEqual([]);
      }),
  );

  it.effect.layer(BunServices.layer)(
    "read as workspaces only the folders holding a package.json: Finder's .DS_Store beside them is none",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const root = yield* fs.makeTempDirectoryScoped();
        yield* fs.makeDirectory(`${root}/packages/kept`, { recursive: true });
        yield* fs.makeDirectory(`${root}/packages/bare`);
        yield* fs.writeFileString(`${root}/packages/kept/package.json`, '{}');
        yield* fs.writeFileString(`${root}/packages/.DS_Store`, 'Bud1');
        expect(yield* workspacesIn(root, 'packages')).toEqual(['packages/kept']);
      }).pipe(Effect.scoped),
  );

  it.effect.layer(BunServices.layer)('fail a doc that names what the code no longer has', () =>
    Effect.gen(function* () {
      const root = yield* ROOT;
      const code = yield* repoCode;
      const stale: Doc = {
        path: 'stale.md',
        bases: ['', FILM_SRC],
        whole: false,
        text: [
          '| `GET /index.json` | the old index |',
          'Mute a take with `film/no-such-rule`, then `bun run nothing`.',
          'See `packages/film/src/tools/gone.ts`.',
          'bun run render <film> --tag p7   # render a tagged variant',
          'bun run check <film>             # warns VoiceLevel, SeamLong',
          'Its frame is `/review/frame`; say it with `POST /review/project/<film>/say`.',
          'Hand him `/films/<film>/project` or `/sets/<folder>`, never `/asks/<ask>` nor `/films/<film>/export?build=<kept>` nor `/films/<film>/narration/<file>`.',
          'Served beside the pages: `/films/in-its-order/narration/full.wav`, `/films/in-its-order/board.json`, `/films/in-its-order/board/open.start.1.png`.',
          'Every page a Place (`packages/film/src/core/api.ts` `Places`, `pageHrefs`).',
          'The review is read by `tools/review.ts` `Review.write`, the bar at `lab/page-shell.tsx:346`.',
          'A request is made in `lab/api.ts` `uniqueId`, which it imports and calls.',
          'Mistyped (`pacakges/film/src/core/time.ts` `frameAtOrAfter`), in a doc that is not whole.',
          'Gone with its links (`player/lookbook.ts` deleted, `packages/ui/src/tabs/TabsRoot.tsx:101` at `4a471dae`).',
          '| `cgwire/kitsu` | its routes in `packages/kitsu/src/router.js` |',
          'Mute it with `film/frobnicate`, after `bun run --cwd apps/animations nothing-here`.',
          '`film check <film> --frobnicate --json`  # the film bin, as `bun run --cwd apps/animations lab` runs it',
          'After a mix, `bun run check <film> --sound` adds `NoSuchFinding`.',
          'See [the gone tool](tools/gone.ts), [a gone reference](reference/none.md#its-part),',
          'and [the README](packages/film/README.md#the-lab), [a site](https://example.com), [here](#here).',
          'Then `bun run --watch nothing-bin`, and read `xs[0](y)` in [the gone guide](guide/gone.md).',
          '```sh',
          'film check <film> --frob-fence',
          '```',
          '$ film check <film> --frob-prompt',
          '- film check <film> --frob-item',
          '````md',
          '```ts',
          'handlers[i](event);',
          '```',
          '````',
          'Read [the gone page](guide/gone-too.md) after the block.',
          '',
          '> film check <film> --frob-quote',
          '',
          '1) film check <film> --frob-paren',
          '',
          '```sh',
          'cd apps/animations && film check <film> --frob-cd',
          '```',
          '',
          '- Run:',
          '  ```sh',
          '  film check <film> --frob-listed',
          '  ```',
          '',
          '> ```sh',
          '> $ film check <film> --frob-quoted',
          '> ```',
          '',
          '````sh',
          'film check <film> --frob-4',
          '````',
          '',
          '| `x` | [the gone table](guide/gone-table.md) | `y(z)` |',
          '| --- | --- | --- |',
          '',
          '~~~md',
          '```',
          'x',
          '```',
          '~~~',
          'Read [the gone tilde](guide/gone-tilde.md).',
          '',
          '```',
          'Write the rule in `packages/film/src/gone-fenced.ts`.',
          '```',
          '',
          '```sh',
          'bun run lint',
          '```',
          '',
          '```sh',
          'bun run nothing-fenced',
          '```',
          '',
          '## Test',
          '',
          '```sh',
          'bun run nothing-headed',
          'bun run nothing-next',
          '```',
        ].join('\n'),
      };
      expect(drift(stale, code)).toEqual([
        'stale.md: route GET /index.json is declared by no API',
        'stale.md: path /review/frame is no route of the API',
        'stale.md: route POST /review/project/:film/say is declared by no API',
        'stale.md: page /films/<film>/project is no page of the lab',
        'stale.md: page /sets/<folder> is no page of the lab',
        'stale.md: rule film/no-such-rule is not registered',
        'stale.md: rule film/frobnicate is not registered',
        'stale.md: bun run nothing: no such script',
        'stale.md: bun run nothing-here: no such script',
        'stale.md: bun run nothing-bin: no such script',
        'stale.md: bun run nothing-fenced: no such script',
        'stale.md: bun run nothing-headed: no such script',
        'stale.md: bun run nothing-next: no such script',
        'stale.md: bun run render --tag: no command declares the flag',
        'stale.md: VoiceLevel is no finding',
        'stale.md: film check --frobnicate: no command declares the flag',
        'stale.md: NoSuchFinding is no finding',
        'stale.md: film check --frob-fence: no command declares the flag',
        'stale.md: film check --frob-prompt: no command declares the flag',
        'stale.md: film check --frob-item: no command declares the flag',
        'stale.md: film check --frob-quote: no command declares the flag',
        'stale.md: film check --frob-paren: no command declares the flag',
        'stale.md: film check --frob-cd: no command declares the flag',
        'stale.md: film check --frob-listed: no command declares the flag',
        'stale.md: film check --frob-quoted: no command declares the flag',
        'stale.md: film check --frob-4: no command declares the flag',
        'stale.md: `pageHrefs`: the code writes no pageHrefs',
        'stale.md: `NoSuchFinding`: the code writes no NoSuchFinding',
      ]);
      expect(yield* anchorsDrift(root, [stale])).toEqual([
        'stale.md: path packages/film/src/tools/gone.ts does not exist',
        'stale.md: packages/film/src/core/api.ts has no pageHrefs',
        'stale.md: packages/film/src/tools/review.ts has no Review.write',
        'stale.md: lab/page-shell.tsx:346: name a symbol, not a line',
        'stale.md: packages/film/src/lab/api.ts has no uniqueId',
        'stale.md: path packages/film/src/gone-fenced.ts does not exist',
        'stale.md: path tools/gone.ts does not exist',
        'stale.md: path reference/none.md does not exist',
        'stale.md: path guide/gone.md does not exist',
        'stale.md: path guide/gone-too.md does not exist',
        'stale.md: path guide/gone-table.md does not exist',
        'stale.md: path guide/gone-tilde.md does not exist',
      ]);
      const correct: Doc = {
        path: 'correct.md',
        bases: ['', FILM_SRC],
        whole: false,
        text: [
          'The rules live in `film/lint`, the lab in `film/lab`.',
          'Build with `bun run --bun vite build`.',
          'Watch it: `bun run --watch cli.ts lab`.',
          '```ts',
          'handlers[i](event);',
          '```',
          'Index it with `xs[0](y)`.',
          'After `bun run check <film>`, the `PageShell` shows `DeadAir`.',
          '`film check <film>` reports each finding as a `TaggedError`.',
          'The film render pass has no bearing on --fix, which belongs to oxlint.',
          '```ts',
          '// the film render pass ignores --fix; oxlint owns it',
          '```',
          '````md',
          '```ts',
          'handlers[i](event);',
          '```',
          '````',
          'After `film check <film>`, `UrlAtom` exposes the selected route.',
          '`bun run --cwd . lint` lints the repo.',
          'A film check run with --frob is not a command here.',
          'film check reads `--static` from its flags.',
          '`bun run lint -- --fix` fixes what it can; run `bun run --filter @manna/film test` first.',
          '',
          '- film render writes stills; Vite takes --host, not the CLI.',
          '- film render writes stills, and Vite takes --host, not the CLI.',
          '',
          '```sh',
          'bun run check <film>  # warns; film check --frob is wrong',
          '```',
          '',
          '> ```ts',
          '> handlers[i](event);',
          '> ```',
          '',
          '- ```ts',
          '  handlers[i](event);',
          '  ```',
          '',
          '| `film check <film> --static` | the static checks |',
          '| --- | --- |',
          '',
          '<!-- See [the draft](guide/draft.md). -->',
          '',
          '```ts',
          'a',
          '```ts',
          'Read [the gone guide](guide/gone.md).',
        ].join('\n'),
      };
      expect(drift(correct, code)).toEqual([]);
      expect(yield* anchorsDrift(root, [correct])).toEqual([]);
      expect(
        [
          ['const run = () => {\n  frobnicate(1);\n};\n', 'frobnicate'],
          ['use({ frobnicate: 1 });\n', 'frobnicate'],
          ['export const api = { read: 1 };\nuse({ write: 2 });\n', 'api.write'],
          ['const { frobnicate } = use();\n', 'frobnicate'],
          ['export class Review {\n  static read() {}\n}\n', 'Review.read'],
          ['interface Api {\n  readonly read: number;\n}\n', 'Api.read'],
          ['export const api = { read: 1, write };\n', 'api.write'],
          ['export const Store = Schema.Struct({ mtime: Schema.Number });\n', 'Store.mtime'],
          [
            'interface Deps {\n  readonly Review: unknown;\n}\nexport class Review {\n  static read() {}\n}\n',
            'Review.read',
          ],
          [
            'const f = () => {\n  const Review = 1;\n};\nexport class Review {\n  static read() {}\n}\n',
            'Review.read',
          ],
          [
            'interface Deps {\n  readonly Review: { read: 1 };\n}\nexport class Review {}\n',
            'Review.read',
          ],
          ['use({ Review: { read: 1 } });\n', 'Review.read'],
        ].map(([text = '', symbol = '']) => declares(text, symbol)),
      ).toEqual([false, false, false, true, true, true, true, true, true, true, false, false]);
      const whole: Doc = {
        path: 'whole.md',
        bases: ['', FILM_SRC],
        whole: true,
        text: 'Its time (`pacakges/film/src/core/time.ts` `frameAtOrAfter`), through `@manna/url-state`, `effect/Schema` and `tmp/logs/latest`.',
      };
      expect(yield* anchorsDrift(root, [whole])).toEqual([
        'whole.md: path pacakges/film/src/core/time.ts does not exist',
      ]);
    }),
  );

  it.effect('read the names code writes as a rename reads them, and a bare name against them', () =>
    Effect.sync(() => {
      const code = [
        "import { a } from './dir/pathWord.ts';",
        "export * from 'pkg/exportWord';",
        "describe('titleGone', () => { it.effect.layer(x)('layeredTitleGone', () => {}); });",
        "const tag = 'TagWord';",
        "const prose = 'a sentence naming proseGone';",
        'const tpl = `templateGone`;',
        '// commentGone',
        '/* blockGone */',
        'const obj = { keyWord: 1 };',
        'class K { #privateWord = 1; }',
      ].join('\n');
      const written = new Set([
        ...wordsOf('code.ts', code),
        ...wordsOf('view.tsx', 'export const v = <PanelWord />;'),
        ...wordsOf(
          'config.json',
          '{ "files": ["**/*.ts"], // a comment\n "jsPluginsWord": ["ValueWord", "a sentence"], "laterKey": 1 }',
        ),
        ...wordsOf('bunfig.toml', '# tomlCommentGone\n[test]\nconcurrentTestGlob = "x"\n'),
      ]);
      expect(
        [
          ...['a', 'pathWord', 'exportWord', 'tag', 'TagWord', 'keyWord', 'privateWord'],
          ...['PanelWord', 'jsPluginsWord', 'ValueWord', 'laterKey', 'test', 'concurrentTestGlob'],
        ].filter((name) => !written.has(name)),
      ).toEqual([]);
      expect(
        [
          ...['titleGone', 'layeredTitleGone', 'proseGone', 'templateGone', 'commentGone'],
          ...['blockGone', 'tomlCommentGone'],
        ].filter((name) => written.has(name)),
      ).toEqual([]);
      const known = new Set(['drawRig', 'loadRigs', 'KNOBS', 'drawImage', 'RiveEngine']);
      expect(
        bareNameDrift(
          [
            'Loads with `loadRigsGone`, `Effect.runPoseGone` and `drawRigGone(rig)`; seconds in `TIMELINES_GONE`, `KNOBSGONE`.',
            'Parsed by `DOMParserGone` over `HTTPServerGone`.',
            'Linked to our file: [`linkedGone`](../canvas/rive.ts).',
            'Its budget is `16777216` bytes, held by `budgetGone`.',
            '',
            '- `rigGone` at `acb1daca`, then `loadRigsGone2`.',
          ].join('\n'),
          known,
        ),
      ).toEqual([
        '`loadRigsGone`: the code writes no loadRigsGone',
        '`Effect.runPoseGone`: the code writes no runPoseGone',
        '`drawRigGone(rig)`: the code writes no drawRigGone',
        '`TIMELINES_GONE`: the code writes no TIMELINES_GONE',
        '`KNOBSGONE`: the code writes no KNOBSGONE',
        '`DOMParserGone`: the code writes no DOMParserGone',
        '`HTTPServerGone`: the code writes no HTTPServerGone',
        '`linkedGone`: the code writes no linkedGone',
        '`budgetGone`: the code writes no budgetGone',
        '`loadRigsGone2`: the code writes no loadRigsGone2',
      ]);
      expect(
        bareNameDrift(
          [
            'The rig is `loadRigs()` over `KNOBS`; `drawRig` draws with `drawImage`, typed `RiveEngine`.',
            'Run `clear`, then `Look` at the `GET` from `RIVE`, on `XZoom`, in `PLH0Szn1yYNefD9pHcnyRivKRGpYGc2yfB`.',
            'Read `NORTH_STAR.md` and `rigs[key].memberGone`.',
            'Motion Canvas waits with [`waitUntilGone`](https://motioncanvas.io/api/core/flow).',
            'The rejected `atBeginGone` at `acb1daca` pair.',
            '',
            '| `motion-canvas/motion-canvas` | `rowGone` |',
            '| --- | --- |',
            '',
            '```ts',
            'blockSketchGone(ctx);',
            '```',
          ].join('\n'),
          known,
        ),
      ).toEqual([]);
    }),
  );

  it.effect.layer(BunServices.layer)(
    'keep the names of a file read before and unchanged since, and read a changed file anew',
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* fs.makeTempDirectoryScoped({ prefix: 'docs-written-' });
        const write = (file: string, text: string) =>
          fs.writeFileString(path.join(root, file), text);
        yield* write('.gitignore', '');
        yield* write('bun.lock', '{}');
        yield* write('kept.ts', 'export const keptName = 1;\n');
        yield* write('changed.ts', 'export const nameBefore = 1;\n');
        expect([...(yield* writtenIn(root, []))]).toEqual(
          expect.arrayContaining(['keptName', 'nameBefore']),
        );
        const cache = path.join(root, WRITTEN_CACHE);
        const held = yield* Effect.flatMap(
          fs.readFileString(cache),
          Schema.decodeUnknownEffect(WrittenCache),
        );
        const kept = held.files['kept.ts'] ?? { hash: '', words: [] };
        yield* keepWords(cache, {
          ...held,
          files: { ...held.files, 'kept.ts': { ...kept, words: ['plantedName'] } },
        });
        yield* write('changed.ts', 'export const nameAfter = 1;\n');
        const again = [...(yield* writtenIn(root, []))];
        expect(again).toEqual(expect.arrayContaining(['plantedName', 'nameAfter']));
        expect(again).not.toContain('nameBefore');
        expect(again).not.toContain('keptName');
      }).pipe(Effect.scoped),
  );

  it.effect.layer(BunServices.layer)(
    "show the design language's tokens as the player's sheet declares them",
    () =>
      Effect.gen(function* () {
        const root = yield* ROOT;
        const fs = yield* FileSystem.FileSystem;
        const [doc, sheet] = yield* Effect.all([
          fs.readFileString(`${root}/${DESIGN_LANGUAGE}`),
          fs.readFileString(`${root}/${TOKENS_CSS}`),
        ]);
        expect(tokenBlock(doc)).toEqual(declaredTokens(sheet));
        expect(tokenBlock(doc).length).toBeGreaterThan(0);
      }),
  );
});

const NAMES_DRIFT: Record<DocPlace['role'], (doc: Doc, code: Code) => ReadonlyArray<string>> = {
  framework: drift,
  spanned: (doc, code) =>
    spanDrift(markdownOf(doc.text), code).map((what) => `${doc.path}: ${what}`),
  anchored: () => [],
  verify: (doc, code) =>
    scriptDrift(markdownOf(doc.text), code).map((what) => `${doc.path}: ${what}`),
};

const DOC_SERVICES = Layer.merge(BunFileSystem.layer, BunPath.layer);

describe.concurrent('each doc', () => {
  for (const place of PLACES) {
    it.effect.layer(DOC_SERVICES)(
      `${place.path}: name only routes, rules, scripts, paths, symbols, flags and findings the code has`,
      () =>
        Effect.gen(function* () {
          const root = yield* ROOT;
          const [code, doc] = yield* Effect.all([repoCode, readDoc(root, place)]);
          expect([
            ...NAMES_DRIFT[place.role](doc, code),
            ...(yield* anchorsDrift(root, [doc])),
          ]).toEqual([]);
        }),
    );
  }
});
