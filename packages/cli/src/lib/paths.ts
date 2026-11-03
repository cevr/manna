import { Option } from 'effect';

type CliBuildGlobals = { readonly __MANNA_CLI_ROOT__?: string };

const buildRoot = (): Option.Option<string> =>
  Option.fromNullishOr((globalThis as CliBuildGlobals).__MANNA_CLI_ROOT__);

const sourceRoot = (): string => {
  const sourceSuffix = '/src/lib';
  if (import.meta.dir.endsWith(sourceSuffix)) {
    return import.meta.dir.slice(0, -sourceSuffix.length);
  }
  return import.meta.dir;
};

export const getCliRoot = (): string => Option.getOrElse(buildRoot(), sourceRoot);

export const getOutputsPath = (...segments: string[]): string =>
  [getCliRoot(), 'outputs', ...segments].join('/');

export const getDataPath = (cliRoot: string, ...segments: string[]): string =>
  [cliRoot, 'data', ...segments].join('/');

interface DataResolution {
  readonly executableDir: string;
  readonly buildRoot: Option.Option<string>;
  readonly exists: (candidate: string) => boolean;
}

export const dataCandidates = (
  resolution: Pick<DataResolution, 'executableDir' | 'buildRoot'>,
  ...segments: string[]
): readonly string[] => [
  getDataPath(resolution.executableDir, ...segments),
  ...Option.match(resolution.buildRoot, {
    onNone: (): readonly string[] => [],
    onSome: (root) => [getDataPath(root, ...segments)],
  }),
];

export const resolveDataPath = (resolution: DataResolution, ...segments: string[]): string => {
  const candidates = dataCandidates(resolution, ...segments);
  return Option.getOrElse(
    Option.fromNullishOr(candidates.find(resolution.exists)),
    () => candidates[0] ?? getDataPath(resolution.executableDir, ...segments),
  );
};

const executableDir = (): string =>
  process.execPath.slice(0, Math.max(0, process.execPath.lastIndexOf('/')));

export const packagedDataCandidates = (...segments: string[]): readonly string[] =>
  dataCandidates({ executableDir: executableDir(), buildRoot: buildRoot() }, ...segments);

interface SelfInvocation {
  readonly command: string;
  readonly args: readonly string[];
}

export const selfInvocation = (): SelfInvocation =>
  Option.match(buildRoot(), {
    onSome: (): SelfInvocation => ({ command: process.execPath, args: [] }),
    onNone: (): SelfInvocation => ({
      command: process.execPath,
      args: [`${getCliRoot()}/src/main.ts`],
    }),
  });
