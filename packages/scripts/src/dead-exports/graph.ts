import { Array as Arr, Equivalence, Option, Order } from 'effect';
import {
  type ExportExportName,
  type ExportImportName,
  type ImportName,
  type Program,
  Visitor,
  parseSync,
} from 'oxc-parser';

interface Take {
  readonly from: string;
  readonly names: Option.Option<ReadonlyArray<string>>;
}

interface Reexport {
  readonly from: string;
  readonly imported: Option.Option<string>;
  readonly name: string;
}

export interface ModuleRecord {
  readonly exports: ReadonlyArray<string>;
  readonly takes: ReadonlyArray<Take>;
  readonly reexports: ReadonlyArray<Reexport>;
  readonly stars: ReadonlyArray<string>;
}

type Parsed = ReturnType<typeof parseSync>['module'];

const nameOf = (entry: ImportName | ExportImportName | ExportExportName): Option.Option<string> => {
  if (entry.kind === 'Default') return Option.some('default');
  return Option.fromNullishOr(entry.name);
};

type StaticImport = Parsed['staticImports'][number];
type ImportEntry = StaticImport['entries'][number];
type ExportEntry = Parsed['staticExports'][number]['entries'][number];

const namesOnly = (statement: Program['body'][number]): boolean => {
  if (statement.type === 'ImportDeclaration') return true;
  if (statement.type === 'ExportNamedDeclaration')
    return Option.isNone(Option.fromNullishOr(statement.declaration));
  if (statement.type === 'ExportDefaultDeclaration')
    return statement.declaration.type === 'Identifier';
  return false;
};

const mentionsOf = (program: Program): ReadonlySet<string> => {
  const found = new Set<string>();
  new Visitor({
    Identifier: (node) => void found.add(node.name),
    JSXIdentifier: (node) => void found.add(node.name),
  }).visit({ ...program, body: program.body.filter((statement) => !namesOnly(statement)) });
  return found;
};

const passesBinding = (i: StaticImport, entry: ImportEntry, exported: ExportEntry): boolean =>
  Option.match(Option.fromNullishOr(exported.moduleRequest), {
    onNone: () => exported.localName.name === entry.localName.value,
    onSome: (request) =>
      request.value === i.moduleRequest.value &&
      entry.importName.kind !== 'NamespaceObject' &&
      Option.makeEquivalence(Equivalence.String)(
        nameOf(exported.importName),
        nameOf(entry.importName),
      ),
  });

const mentionsFor = (parsed: ReturnType<typeof parseSync>): ReadonlySet<string> => {
  const exported = parsed.module.staticExports.flatMap((e) => e.entries);
  const passes = parsed.module.staticImports.some((i) =>
    i.entries.some((entry) => exported.some((e) => passesBinding(i, entry, e))),
  );
  if (!passes) return new Set();
  return mentionsOf(parsed.program);
};

const importTake = (
  i: StaticImport,
  exported: ReadonlyArray<ExportEntry>,
  mentions: ReadonlySet<string>,
): Take => {
  const used = i.entries.filter(
    (entry) =>
      !exported.some((e) => passesBinding(i, entry, e)) || mentions.has(entry.localName.value),
  );
  if (used.some((e) => e.importName.kind === 'NamespaceObject'))
    return { from: i.moduleRequest.value, names: Option.none() };
  return {
    from: i.moduleRequest.value,
    names: Option.some(used.flatMap((e) => Option.toArray(nameOf(e.importName)))),
  };
};

const forwardsOf = (
  imports: ReadonlyArray<StaticImport>,
  exported: ReadonlyArray<ExportEntry>,
): ReadonlyArray<Reexport> =>
  exported
    .filter((e) => Option.isNone(Option.fromNullishOr(e.moduleRequest)))
    .flatMap((e) =>
      imports.flatMap((i) =>
        i.entries
          .filter((entry) => passesBinding(i, entry, e))
          .flatMap((entry) =>
            Option.toArray(
              Option.map(nameOf(e.exportName), (name): Reexport => ({
                from: i.moduleRequest.value,
                imported: nameOf(entry.importName),
                name,
              })),
            ),
          ),
      ),
    );

const reexportOf = (
  e: Parsed['staticExports'][number]['entries'][number],
): ReadonlyArray<Reexport> =>
  Option.toArray(
    Option.flatMap(
      Option.filter(
        Option.fromNullishOr(e.moduleRequest),
        () => e.importName.kind !== 'AllButDefault',
      ),
      (request) =>
        Option.map(nameOf(e.exportName), (name): Reexport => ({
          from: request.value,
          imported: nameOf(e.importName),
          name,
        })),
    ),
  );

const langOf = (file: string): 'ts' | 'tsx' => {
  if (file.endsWith('.tsx')) return 'tsx';
  return 'ts';
};

const dynamicTake = (source: string, d: Parsed['dynamicImports'][number]): ReadonlyArray<Take> =>
  Option.toArray(
    Option.map(
      Option.fromNullishOr(
        /^['"`]([^'"`]*)['"`]$/.exec(source.slice(d.moduleRequest.start, d.moduleRequest.end))?.[1],
      ),
      (from): Take => ({ from, names: Option.none() }),
    ),
  );

export const recordOf = (file: string, source: string): ModuleRecord => {
  const parsed = parseSync(file, source, { lang: langOf(file), sourceType: 'module' });
  const { module } = parsed;
  const entries = module.staticExports.flatMap((e) => e.entries);
  const mentions = mentionsFor(parsed);
  return {
    exports: entries.flatMap((e) => Option.toArray(nameOf(e.exportName))),
    takes: [
      ...module.staticImports.map((i) => importTake(i, entries, mentions)),
      ...module.dynamicImports.flatMap((d) => dynamicTake(source, d)),
    ],
    reexports: [...entries.flatMap(reexportOf), ...forwardsOf(module.staticImports, entries)],
    stars: entries.flatMap((e) =>
      Option.toArray(
        Option.filter(
          Option.map(Option.fromNullishOr(e.moduleRequest), (r) => r.value),
          () => e.importName.kind === 'AllButDefault',
        ),
      ),
    ),
  };
};

const WHOLE = '*';

export type Resolve = (user: string, from: string) => Option.Option<string>;

export interface Workspace {
  readonly records: ReadonlyMap<string, ModuleRecord>;
  readonly resolve: Resolve;
  readonly consumes: (file: string) => boolean;
  readonly checked: (file: string) => boolean;
  readonly roots: ReadonlySet<string>;
}

const reachesFrom = (workspace: Workspace, file: string): ReadonlyArray<string> => {
  const { records, resolve, consumes } = workspace;
  return Option.match(Option.fromUndefinedOr(records.get(file)), {
    onNone: () => [],
    onSome: (record) => {
      if (!consumes(file)) return [];
      return [
        ...record.takes.map((t) => t.from),
        ...record.reexports.map((r) => r.from),
        ...record.stars,
      ].flatMap((from) => Option.toArray(resolve(file, from)));
    },
  });
};

const reachable = (workspace: Workspace): ReadonlySet<string> => {
  const reached = new Set<string>();
  const visit = (file: string): void => {
    if (reached.has(file)) return;
    reached.add(file);
    for (const module of reachesFrom(workspace, file)) visit(module);
  };
  for (const root of workspace.roots) visit(root);
  return reached;
};

const passedOn = (
  { records, resolve }: Workspace,
  module: string,
  name: string,
): ReadonlyArray<readonly [module: string, name: string]> =>
  Option.match(Option.fromUndefinedOr(records.get(module)), {
    onNone: () => [],
    onSome: (record) => [
      ...record.stars.flatMap((star) =>
        Option.toArray(Option.map(resolve(module, star), (behind) => [behind, name] as const)),
      ),
      ...record.reexports
        .filter((reexport) => name === WHOLE || reexport.name === name)
        .flatMap((reexport) =>
          Option.toArray(
            Option.map(
              resolve(module, reexport.from),
              (behind) => [behind, Option.getOrElse(reexport.imported, () => WHOLE)] as const,
            ),
          ),
        ),
    ],
  });

const importsOf = (
  workspace: Workspace,
  reached: ReadonlySet<string>,
): ReadonlyArray<readonly [module: string, name: string]> =>
  [...workspace.records]
    .filter(([user]) => reached.has(user) && workspace.consumes(user))
    .flatMap(([user, record]) =>
      record.takes.flatMap(({ names, from }) =>
        Option.toArray(workspace.resolve(user, from))
          .filter((module) => module !== user)
          .flatMap((module) =>
            Option.getOrElse(names, () => [WHOLE]).map((name) => [module, name] as const),
          ),
      ),
    );

const takenNames = (workspace: Workspace): ReadonlySet<string> => {
  const { consumes, checked, roots } = workspace;
  const used = new Set<string>();
  const mark = (module: string, name: string): void => {
    const key = `${module}#${name}`;
    if (used.has(key)) return;
    used.add(key);
    for (const [behind, taken] of passedOn(workspace, module, name)) mark(behind, taken);
  };
  for (const root of roots) if (consumes(root) && !checked(root)) mark(root, WHOLE);
  for (const [module, name] of importsOf(workspace, reachable(workspace))) mark(module, name);
  return used;
};

export const deadExports = (workspace: Workspace): ReadonlyArray<string> => {
  const { records, checked } = workspace;
  const used = takenNames(workspace);
  return Arr.sort(
    [...records]
      .filter(([file]) => checked(file))
      .flatMap(([file, record]) =>
        record.exports
          .filter((name) => !used.has(`${file}#${name}`) && !used.has(`${file}#${WHOLE}`))
          .map((name) => `${file} ${name}`),
      ),
    Order.String,
  );
};
