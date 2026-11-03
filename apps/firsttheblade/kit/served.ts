import { Effect, FileSystem, Option, Path, Predicate, Schema } from 'effect';
import { transform } from 'lightningcss';
import { type ESTree, parseSync, Visitor } from 'vite';

export const IMAGE =
  /\.(?:webp|a?png|jpe?g|jfif|pjpeg|pjp|avifs?|gif|svgz?|ico|cur|bmp|jxl|tiff?|heic|heif|jp2)$/i;

export const SERVED_FOLDERS = ['public', 'src'] as const;

export interface Outside {
  readonly image: string;
  readonly why: string;
}

const EMBLEM = 'a series mark: fine lines drawn as markup, not a painting';
const ICON = 'an icon `bun run kit` draws from the wheat on the night, not from a painting';

export const OUTSIDE: ReadonlyArray<Outside> = [
  { image: 'public/apple-touch-icon.png', why: ICON },
  { image: 'public/favicon.ico', why: ICON },
  { image: 'public/icon-192.png', why: ICON },
  { image: 'public/icon-512.png', why: ICON },
  { image: 'src/art/emblem-land.svg', why: EMBLEM },
  { image: 'src/art/emblem-path.svg', why: EMBLEM },
  {
    image: 'src/art/emblem-remedies.svg',
    why: 'a series mark: the healing leaf the owner picked on ask ab7bf68d1be, in fine lines drawn as markup, not a painting',
  },
  { image: 'src/art/emblem-taught.svg', why: EMBLEM },
  {
    image: 'src/art/wheat.svg',
    why: 'the bare wheat: the lockup’s one shape, a traced vector laid in the page as markup, not a painting',
  },
];

const SCRIPT = /\.(?:[cm]?[jt]sx?)$/;

const bare = (specifier: string) => specifier.replace(/[?#].*$/s, '');

const stringOf = (node: ESTree.Expression | ESTree.Argument) =>
  Option.liftPredicate(
    node,
    (given): given is ESTree.StringLiteral =>
      given.type === 'Literal' && Predicate.isString(given.value),
  ).pipe(Option.map((literal) => literal.value));

const isMetaUrl = (node: ESTree.Argument) =>
  node.type === 'MemberExpression' &&
  node.object.type === 'MetaProperty' &&
  node.property.type === 'Identifier' &&
  node.property.name === 'url';

class ScriptUnread extends Schema.TaggedError<ScriptUnread>()('ScriptUnread', {
  file: Schema.String,
  reason: Schema.String,
}) {}

const scriptNames = Effect.fn('Served.scriptNames')(function* (file: string, code: string) {
  const { program, errors } = parseSync(file, code);
  if (errors.length > 0)
    return yield* ScriptUnread.make({
      file,
      reason: errors.map(({ message }) => message).join('; '),
    });
  const found: Array<string> = [];
  const add = (name: Option.Option<string>) => Option.map(name, (given) => found.push(given));
  new Visitor({
    ImportDeclaration: (node) => {
      if (node.importKind !== 'type') found.push(node.source.value);
    },
    ExportAllDeclaration: (node) => {
      if (node.exportKind !== 'type') found.push(node.source.value);
    },
    ExportNamedDeclaration: (node) => {
      if (node.exportKind !== 'type') add(Option.flatMap(Option.fromNullOr(node.source), stringOf));
    },
    ImportExpression: (node) => {
      add(stringOf(node.source));
    },
    NewExpression: (node) => {
      if (
        node.callee.type === 'Identifier' &&
        node.callee.name === 'URL' &&
        Option.exists(Option.fromUndefinedOr(node.arguments[1]), isMetaUrl)
      )
        add(Option.flatMap(Option.fromUndefinedOr(node.arguments[0]), stringOf));
    },
  }).visit(program);
  return found;
});

const styleNames = (file: string, code: string) =>
  (
    transform({
      filename: file,
      code: new TextEncoder().encode(code),
      analyzeDependencies: true,
    }).dependencies ?? []
  )
    .filter((dependency) => dependency.type === 'url' || dependency.type === 'import')
    .map((dependency) => dependency.url);

const isModule = (file: string) =>
  (SCRIPT.test(file) || file.endsWith('.css')) &&
  !file.includes('.test.') &&
  !file.endsWith('.d.ts');

const readNames = (file: string, code: string) =>
  Effect.suspend(() => {
    if (file.endsWith('.css')) return Effect.succeed(styleNames(file, code));
    return scriptNames(file, code);
  });

const read = new Map<string, { readonly code: string; readonly names: ReadonlyArray<string> }>();

const named = Effect.fn('Served.named')(function* (file: string, code: string) {
  const known = read.get(file);
  if (known?.code === code) return known.names;
  const names = yield* readNames(file, code);
  read.set(file, { code, names });
  return names;
});

const fileOf = (app: string, module: string, specifier: string) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    if (specifier.startsWith('/')) return path.join(app, 'public', specifier);
    if (specifier.startsWith('.')) return path.join(path.dirname(module), specifier);
    return Bun.resolveSync(specifier, path.dirname(module));
  });

const servedFiles = Effect.fn('Served.files')(function* (app: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const files: Array<{ readonly folder: string; readonly file: string }> = [];
  for (const folder of SERVED_FOLDERS) {
    const root = path.join(app, folder);
    if (!(yield* fs.exists(root))) continue;
    for (const entry of yield* fs.readDirectory(root, { recursive: true }))
      files.push({ folder, file: path.join(root, entry) });
  }
  return files;
});

const namedImages = Effect.fn('Served.namedImages')(function* (app: string, module: string) {
  const fs = yield* FileSystem.FileSystem;
  const names = yield* named(module, yield* fs.readFileString(module));
  const images: Array<string> = [];
  for (const specifier of names.map(bare).filter((name) => IMAGE.test(name))) {
    const file = yield* fileOf(app, module, specifier);
    if (yield* fs.exists(file)) images.push(file);
  }
  return images;
});

export const servedImages = Effect.fn('Served.images')(function* (app: string) {
  const path = yield* Path.Path;
  const fromApp = (file: string) => path.relative(app, file).split(path.sep).join('/');
  const files = yield* servedFiles(app);
  const modules = files.filter(({ folder, file }) => folder === 'src' && isModule(file));
  const named = yield* Effect.forEach(modules, ({ file }) => namedImages(app, file));
  const found = new Set([
    ...files.filter(({ file }) => IMAGE.test(file)).map(({ file }) => fromApp(file)),
    ...named.flat().map(fromApp),
  ]);
  return [...found].toSorted();
});
