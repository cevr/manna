/* oxlint-disable effect/noNodeBuiltinImport, no-restricted-imports, effect/noTernary, effect/noTryCatch, effect/noAs, effect/noAsyncFunction, no-await-in-loop -- the property builds real link worlds with node:fs and judges the contained host against the OS's own answer (oracle.ts). */
/**
 * The contained host's resolver and tree walk (`host.ts`) against the OS.
 *
 * A world is a real scratch tree: a root (the app, with the state and
 * features beside it), an outside folder, and links whose targets are raw
 * strings, absolute or relative, with `.` and `..` anywhere, chained through
 * other links, dangling, or looping. Each query is a path that starts in the
 * root; the host decides it through a FileSystem call (followed, or the link
 * itself), and the decision and the path the host hands the platform must
 * be the OS's: `realpathSync` for a path that exists, the oracle's component
 * walk for one that does not (`oracle.ts`). A tree world is a generated link
 * graph under the app's native folder: aliases inside the app whose
 * descendants lead out, cycles, dangling links, and CocoaPods' headers,
 * which the prebuild skips; the host must refuse the prebuild and a build
 * into that folder exactly when the oracle's closure finds a link out.
 */
import * as nfs from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import * as BunServices from '@effect/platform-bun/BunServices';
import { Effect, Exit, FileSystem, Path } from 'effect';
import * as PlatformError from 'effect/PlatformError';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';

import { hostError } from '../errors.ts';
import { contain } from '../host.ts';
import { APP } from './contain.ts';
import { land, LOOP, treeEscapes } from './oracle.ts';
import { quickLinks } from './quick-links.ts';

/** The same LCG for every run: world `n` is the same world on every run. */
const random = (seed: number) => {
  let state = seed + 1;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state >>> 8;
  };
};

/** A link: where it lies (from the world's base) and its raw target, `<base>` standing for the base. */
interface Link {
  readonly at: string;
  readonly target: string;
}

/** A path query from the world's base, decided followed (a read) or as the link itself (a remove). */
interface Query {
  readonly path: string;
  readonly follow: boolean;
}

interface World {
  readonly name: string;
  readonly dirs: ReadonlyArray<string>;
  readonly files: ReadonlyArray<string>;
  readonly links: ReadonlyArray<Link>;
  readonly queries: ReadonlyArray<Query>;
}

const DIRS = ['a', 'b', 'c'];
const FILES = ['f', 'g'];
const LINKS = ['L', 'M', 'N'];
const STEPS = [...DIRS, ...FILES, ...LINKS, '..', '.', '..'];

/** World `seed`: folders, files and links in the root and outside, and paths into the root. */
const pathWorld = (seed: number): World => {
  const next = random(seed);
  const pick = <A>(from: ReadonlyArray<A>): A => from[next() % from.length] as A;
  const seq = (from: ReadonlyArray<string>, most: number) =>
    Array.from({ length: 1 + (next() % most) }, () => pick(from));
  const dirs = new Set<string>(['root', 'outside']);
  for (const top of ['root', 'outside'])
    for (let n = 0; n < 2 + (next() % 4); n += 1) dirs.add([top, ...seq(DIRS, 3)].join('/'));
  const holders = [...dirs];
  const files = new Set<string>();
  for (let n = 0; n < 2 + (next() % 4); n += 1) files.add(`${pick(holders)}/${pick(FILES)}`);
  const taken = new Set([...dirs, ...files]);
  const links: Array<Link> = [];
  for (let n = 0; n < 2 + (next() % 5); n += 1) {
    const at = `${pick(holders)}/${pick(LINKS)}`;
    if (taken.has(at) || [...taken].some((each) => each.startsWith(`${at}/`))) continue;
    taken.add(at);
    const form = next() % 4;
    let target = seq(STEPS, 5).join('/');
    if (form === 3)
      target = [...seq(['..', '.'], 2), pick(LINKS), '..', ...seq(STEPS, 2)].join('/');
    if (form === 0) target = `<base>/${pick(holders)}`;
    if (form === 1)
      target = `<base>/${[pick(['root', 'outside', 'root']), ...seq(STEPS, 4)].join('/')}`;
    links.push({ at, target });
  }
  const starts = ['root', ...links.map((link) => link.at).filter((at) => at.startsWith('root/'))];
  const queries = Array.from({ length: 16 }, () => ({
    path: [pick(starts), ...seq(STEPS, 5)].join('/'),
    follow: next() % 3 !== 0,
  }));
  return { name: `path world ${seed}`, dirs: [...dirs], files: [...files], links, queries };
};

/** Tree world `seed`: a link graph under the app's native folder `root/ios`, and around it. */
const treeWorld = (seed: number): World => {
  const next = random(seed + 7919);
  const pick = <A>(from: ReadonlyArray<A>): A => from[next() % from.length] as A;
  const seq = (from: ReadonlyArray<string>, most: number) =>
    Array.from({ length: 1 + (next() % most) }, () => pick(from));
  const dirs = new Set<string>([
    'root/ios',
    'root/ios/Pods/Headers/Public',
    'root/shared',
    'outside',
  ]);
  for (const top of ['root/ios', 'root/ios', 'root/shared', 'outside'])
    for (let n = 0; n < 1 + (next() % 3); n += 1) dirs.add([top, ...seq(DIRS, 3)].join('/'));
  const holders = [...dirs];
  const files = new Set<string>();
  for (let n = 0; n < 1 + (next() % 4); n += 1) files.add(`${pick(holders)}/${pick(FILES)}`);
  const taken = new Set([...dirs, ...files]);
  const targets = [...dirs, ...files, 'root/nowhere', 'outside/nowhere', 'root', 'root/ios'];
  const links: Array<Link> = [];
  const sites = [...holders.filter((dir) => dir !== 'outside' && !dir.startsWith('outside/'))];
  for (let n = 0; n < 1 + (next() % 5); n += 1) {
    const at = `${pick(sites)}/${pick(LINKS)}`;
    if (taken.has(at) || [...taken].some((each) => each.startsWith(`${at}/`))) continue;
    taken.add(at);
    const target = next() % 3 === 0 ? seq(STEPS, 4).join('/') : `<base>/${pick(targets)}`;
    links.push({ at, target });
  }
  return { name: `tree world ${seed}`, dirs: [...dirs], files: [...files], links, queries: [] };
};

/** Make `world` under `base`, which must not exist yet. */
const build = (base: string, world: World) => {
  for (const top of ['root', 'state', 'features', 'outside'])
    nfs.mkdirSync(join(base, top), { recursive: true });
  for (const dir of world.dirs) nfs.mkdirSync(join(base, dir), { recursive: true });
  for (const file of world.files) {
    if (nfs.existsSync(join(base, file))) continue;
    nfs.writeFileSync(join(base, file), file);
  }
  for (const link of world.links) {
    const at = join(base, link.at);
    nfs.mkdirSync(join(at, '..'), { recursive: true });
    if (nfs.existsSync(at)) continue;
    nfs.symlinkSync(link.target.replace('<base>', base), at);
  }
};

const under = (file: string, dir: string) => file === dir || file.startsWith(`${dir}/`);

/** The platform the host is built over: the real one's looks (its link reads the kernel's at once, `quick-links.ts`), and a recorder for each call it is handed. */
const platform = (seen: Array<string>) =>
  Effect.gen(function* () {
    const real = quickLinks(yield* FileSystem.FileSystem);
    const fs: FileSystem.FileSystem = {
      ...real,
      readFileString: (file) => Effect.sync(() => void seen.push(file)).pipe(Effect.as('')),
      remove: (file) => Effect.sync(() => void seen.push(file)),
    };
    const spawner = ChildProcessSpawner.make(() =>
      Effect.fail(PlatformError.badArgument({ module: 'Stand-in', method: 'spawn' })),
    );
    return { fs, spawner, path: yield* Path.Path };
  }).pipe(Effect.provide(BunServices.layer));

/** The host's answer: the path it hands the platform, or the refusal's resolved path. */
type Decision = { readonly refused: boolean; readonly resolved: string };

const decide = async (
  where: Parameters<typeof contain>[0],
  run: Effect.Effect<
    unknown,
    PlatformError.PlatformError,
    FileSystem.FileSystem | ChildProcessSpawner.ChildProcessSpawner
  >,
): Promise<Decision> => {
  const seen: Array<string> = [];
  const host = await Effect.runPromise(platform(seen));
  const exit = await Effect.runPromiseExit(
    contain(where)(run).pipe(
      Effect.provideService(FileSystem.FileSystem, host.fs),
      Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, host.spawner),
      Effect.provideService(Path.Path, host.path),
    ),
  );
  if (Exit.isSuccess(exit)) return { refused: false, resolved: seen[0] ?? '' };
  const error = Exit.findErrorOption(exit);
  if (error._tag === 'Some') {
    const host = hostError(error.value);
    if (host._tag === 'Escaped') return { refused: true, resolved: host.resolved };
    return { refused: false, resolved: seen[0] ?? `host failed: ${host.message}` };
  }
  return { refused: false, resolved: `defect: ${String(exit.cause)}` };
};

const decideSpawn = (
  where: Parameters<typeof contain>[0],
  command: string,
  args: ReadonlyArray<string>,
) =>
  decide(
    where,
    Effect.gen(function* () {
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
      yield* Effect.scoped(
        spawner.spawn(ChildProcess.make(command, args, { forceKillAfter: '1 second' })),
      );
    }),
  ).then((decision) => decision.refused);

const whereOf = (base: string) => ({
  app: join(base, 'root'),
  state: join(base, 'state'),
  features: join(base, 'features'),
  config: APP,
});

/** Every disagreement between the host and the OS on `world`'s queries. */
const checkPaths = async (world: World): Promise<Array<string>> => {
  const scratch = nfs.mkdtempSync(join(tmpdir(), 'sim-differential-'));
  const base = join(scratch, 'w');
  const found: Array<string> = [];
  try {
    build(base, world);
    const where = whereOf(base);
    const realBase = nfs.realpathSync.native(base);
    const roots = [where.app, where.state, where.features].map((root) => ({
      lexical: root,
      canonical: nfs.realpathSync.native(root),
    }));
    for (const query of world.queries) {
      const raw = `${base}/${query.path}`;
      const lexical = resolve(raw);
      const held = roots.filter(
        (root) => under(lexical, root.lexical) || under(lexical, root.canonical),
      );
      const real = land(raw, query.follow);
      const allowed =
        real !== LOOP && held.length > 0 && held.every((root) => under(real, root.canonical));
      const host = await decide(
        where,
        Effect.flatMap(FileSystem.FileSystem, (fs) =>
          query.follow ? fs.readFileString(raw) : fs.remove(raw),
        ),
      );
      const said = `${world.name}: ${query.follow ? 'read' : 'remove'} ${query.path} (links ${world.links.map((link) => `${link.at} -> ${link.target}`).join(', ')})`;
      if (host.refused === allowed)
        found.push(
          `${said}: host ${host.refused ? 'refused' : 'allowed'} ${host.resolved}, the OS lands at ${real}`,
        );
      else if (under(real, realBase) && host.resolved !== real)
        found.push(`${said}: host resolved ${host.resolved}, the OS lands at ${real}`);
    }
  } finally {
    nfs.rmSync(scratch, { recursive: true, force: true });
  }
  return found;
};

/** Every disagreement between the host's tree rule and the oracle's closure, for the prebuild and a build into the native folder. */
const checkTree = async (world: World): Promise<Array<string>> => {
  const scratch = nfs.mkdtempSync(join(tmpdir(), 'sim-tree-'));
  const base = join(scratch, 'w');
  const found: Array<string> = [];
  try {
    build(base, world);
    const where = whereOf(base);
    const native = join(where.app, 'ios');
    const inside = [nfs.realpathSync.native(where.app)];
    const links = world.links.map((link) => `${link.at} -> ${link.target}`).join(', ');
    const cases = [
      {
        tool: 'prebuild',
        escapes: treeEscapes(native, inside, ['Pods/Headers']),
        refused: await decideSpawn(where, 'bun', ['run', 'prebuild:native']),
      },
      {
        tool: 'xcodebuild',
        escapes: treeEscapes(native, inside),
        refused: await decideSpawn(where, 'xcodebuild', ['-derivedDataPath', native, 'build']),
      },
    ];
    for (const each of cases)
      if (each.refused !== each.escapes.length > 0)
        found.push(
          `${world.name}: ${each.tool} ${each.refused ? 'refused' : 'allowed'}, the closure finds [${each.escapes.join('; ')}] (links ${links})`,
        );
  } finally {
    nfs.rmSync(scratch, { recursive: true, force: true });
  }
  return found;
};

/** The verifier's round-1 receipts (M2: a link target's `..` after a link; M1: aliases whose descendants lead out), kept as fixed worlds. */
export const receipts: ReadonlyArray<{ readonly kind: 'path' | 'tree'; readonly world: World }> = [
  {
    kind: 'path',
    world: {
      name: 'dotdot-link-target',
      dirs: ['root/ios/Hymnal', 'outside/deep'],
      files: ['root/ios/Trap.plist', 'outside/Trap.plist'],
      links: [
        { at: 'root/ios/Hop', target: '<base>/outside/deep' },
        { at: 'root/ios/Hymnal/Info.plist', target: '../Hop/../Trap.plist' },
      ],
      queries: [
        { path: 'root/ios/Hymnal/Info.plist', follow: true },
        { path: 'root/ios/Hop/../Trap.plist', follow: true },
        { path: 'root/ios/Hop/../Trap.plist', follow: false },
      ],
    },
  },
  {
    kind: 'tree',
    world: {
      name: 'alias-build-tree',
      dirs: ['root/ios/build/dd', 'root/SharedBuild/Intermediates.noindex', 'outside/object'],
      files: ['outside/object/untouched'],
      links: [
        {
          at: 'root/SharedBuild/Intermediates.noindex/Hymnal.build',
          target: '<base>/outside/object',
        },
        { at: 'root/ios/build/dd/Build', target: '<base>/root/SharedBuild' },
      ],
      queries: [],
    },
  },
  {
    kind: 'tree',
    world: {
      name: 'alias-prebuild-tree',
      dirs: ['root/ios', 'root/SharedWorkspace'],
      files: ['outside/workspace.txt'],
      links: [
        {
          at: 'root/SharedWorkspace/contents.xcworkspacedata',
          target: '<base>/outside/workspace.txt',
        },
        { at: 'root/ios/Hymnal.xcworkspace', target: '<base>/root/SharedWorkspace' },
      ],
      queries: [],
    },
  },
];

/** Every disagreement on one receipt. */
export const checkReceipt = (receipt: (typeof receipts)[number]) =>
  receipt.kind === 'path' ? checkPaths(receipt.world) : checkTree(receipt.world);

/** Every disagreement on `count` generated worlds of each kind from `first`. */
export const differential = async (first: number, count: number): Promise<Array<string>> => {
  const found: Array<string> = [];
  for (let seed = first; seed < first + count; seed += 1) {
    found.push(...(await checkPaths(pathWorld(seed))));
    found.push(...(await checkTree(treeWorld(seed))));
  }
  return found;
};
