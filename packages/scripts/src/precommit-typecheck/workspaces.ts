export interface Workspace {
  readonly dir: string;
  readonly name: string;
}

const ROOT_FILES = new Set([
  'tsconfig.json',
  'package.json',
  'bun.lock',
  'bunfig.toml',
  'turbo.json',
]);

const TYPED = /\.([cm]?[jt]sx?|json)$/;

const LEFT_OUT = new Set(['apps/selah']);

export const STAGED_FILES: ReadonlyArray<string> = [
  'diff',
  '--cached',
  '--name-only',
  '--no-renames',
];

export const typecheckedBy = (
  staged: ReadonlyArray<string>,
  workspaces: ReadonlyArray<Workspace>,
): ReadonlyArray<string> => {
  const covered = workspaces.filter((workspace) => !LEFT_OUT.has(workspace.dir));
  if (staged.some((file) => ROOT_FILES.has(file)))
    return covered.map((workspace) => workspace.name).toSorted();
  const touched = covered.filter((workspace) =>
    staged.some((file) => file.startsWith(`${workspace.dir}/`) && TYPED.test(file)),
  );
  return touched.map((workspace) => workspace.name).toSorted();
};
