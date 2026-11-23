import { Option } from 'effect';

const parentDir = (path: string): string => path.slice(0, Math.max(0, path.lastIndexOf('/')));

/** The running process: its executable, and whether it is a Bun-compiled
 *  binary, whose bundled modules live under Bun's embedded `/$bunfs/` root. */
interface CliProcess {
  readonly executablePath: string;
  readonly compiled: boolean;
}

const runningProcess = (): CliProcess => ({
  executablePath: process.execPath,
  compiled: import.meta.dir.startsWith('/$bunfs/'),
});

/** The root of a compiled binary that sits at `<root>/bin/manna`; absent when
 *  the CLI runs from source.
 *
 *  Resolved at run time from the executable's own path, so a binary built in
 *  one checkout and installed into another finds the checkout it sits in, not
 *  the one it was built in. Bun reports `process.execPath` with symlinks
 *  resolved, so `~/.bun/bin/manna` linking to `<root>/bin/manna` resolves to
 *  `<root>`. */
const installRoot = (cli: CliProcess): Option.Option<string> =>
  Option.some(cli.executablePath).pipe(
    Option.filter(() => cli.compiled),
    Option.map((executablePath) => parentDir(parentDir(executablePath))),
  );

const sourceRoot = (): string => {
  const sourceSuffix = '/src/lib';
  if (import.meta.dir.endsWith(sourceSuffix)) {
    return import.meta.dir.slice(0, -sourceSuffix.length);
  }
  return import.meta.dir;
};

export const getCliRoot = (cli: CliProcess = runningProcess()): string =>
  Option.getOrElse(installRoot(cli), sourceRoot);

export const getOutputsPath = (...segments: string[]): string =>
  [getCliRoot(), 'outputs', ...segments].join('/');

/** The install-owned data slot, derived from the CLI root the same way
 *  `getOutputsPath` and the chime asset are. A caller's `process.cwd()` is not
 *  a location the CLI owns — an installed binary is run from anywhere — so a
 *  bundled artifact must be addressed relative to the binary's own root. Kept
 *  pure and parameterised on `cliRoot` so the derivation is unit-testable. */
export const getDataPath = (cliRoot: string, ...segments: string[]): string =>
  [cliRoot, 'data', ...segments].join('/');

/** Where a compiled binary's bundled assets are: beside the executable first,
 *  then in its install root's `data/`.
 *
 *  Exe-adjacent wins, because a binary that ships its own `data/` must use that
 *  copy. The install root (`<root>/bin/manna` → `<root>/data/`) is the
 *  fallback, for the package's own data slot. From source there is no install
 *  root, and `process.execPath` is the Bun binary itself. */
interface DataResolution {
  /** Directory of the running executable — `path.dirname(process.execPath)`. */
  readonly executableDir: string;
  /** The installed binary's root, absent when running from source. */
  readonly installRoot: Option.Option<string>;
  /** Whether a candidate directory holds the asset. Injected so the ordering
   *  rule is testable without touching a filesystem. */
  readonly exists: (candidate: string) => boolean;
}

/** The candidate data paths for one asset, in resolution order. Pure, so the
 *  order is a fact a test can assert rather than a behaviour only a packaged
 *  install could reveal. */
export const dataCandidates = (
  resolution: Pick<DataResolution, 'executableDir' | 'installRoot'>,
  ...segments: string[]
): readonly string[] => [
  getDataPath(resolution.executableDir, ...segments),
  ...Option.match(resolution.installRoot, {
    onNone: (): readonly string[] => [],
    onSome: (root) => [getDataPath(root, ...segments)],
  }),
];

/** The first candidate that exists, or the exe-adjacent path when none does —
 *  so a caller reporting a missing artifact names the location an install is
 *  expected to carry it. */
export const resolveDataPath = (resolution: DataResolution, ...segments: string[]): string => {
  const candidates = dataCandidates(resolution, ...segments);
  return Option.getOrElse(
    Option.fromNullishOr(candidates.find(resolution.exists)),
    () => candidates[0] ?? getDataPath(resolution.executableDir, ...segments),
  );
};

/** The candidates for one packaged asset in the running process, in resolution
 *  order. The caller decides which exists — this module stays free of a
 *  filesystem so the ordering rule is a pure, tested fact. */
export const packagedDataCandidates = (...segments: string[]): readonly string[] =>
  dataCandidates(
    { executableDir: parentDir(process.execPath), installRoot: installRoot(runningProcess()) },
    ...segments,
  );

/** How to start this same CLI again, as a spawnable command.
 *
 *  A compiled binary IS the CLI, so it re-invokes itself; from source the
 *  running executable is Bun, and the entrypoint travels as the first
 *  argument. Derived from `process.execPath` because that is the one path
 *  guaranteed to name the currently running executable — a `manna` found on
 *  `PATH` could be a different install than the one the user just ran. */
interface SelfInvocation {
  readonly command: string;
  readonly args: readonly string[];
}

export const selfInvocation = (): SelfInvocation =>
  Option.match(installRoot(runningProcess()), {
    onSome: (): SelfInvocation => ({ command: process.execPath, args: [] }),
    onNone: (): SelfInvocation => ({
      command: process.execPath,
      args: [`${getCliRoot()}/src/main.ts`],
    }),
  });
