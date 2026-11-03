const isTypeScript = (file: string) => /\.(?:[cm]?ts|tsx)$/.test(file);

const installed = (file: string) => file.split('/').includes('node_modules');

export const isSource = (file: string) => isTypeScript(file) && !installed(file);

const outside = (file: string) => file === '..' || file.startsWith('../');

export const listedFiles = (stdout: string) =>
  stdout
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

interface ListedFile {
  readonly listed: string;
  readonly disk: string;
}

export const uncovered = (files: ReadonlyArray<ListedFile>, program: ReadonlyArray<string>) => {
  const held = new Set(program);
  return files
    .filter(({ disk }) => !held.has(disk))
    .map(({ listed }) => listed)
    .toSorted();
};

const isDeclaration = (spelled: string) => {
  const base = spelled.slice(spelled.lastIndexOf('/') + 1);
  return /\.d\.[cm]?ts$/.test(base) || (base.endsWith('.ts') && base.includes('.d.'));
};

interface ProgramFile {
  readonly spelled: string;
  readonly disk: string;
}

export const declarations = (program: ReadonlyArray<ProgramFile>) => [
  ...new Set(
    program
      .filter(({ spelled, disk }) => isDeclaration(spelled) && !outside(disk) && !installed(disk))
      .map(({ disk }) => disk)
      .toSorted(),
  ),
];
