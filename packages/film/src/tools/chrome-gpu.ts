export const GPU_FLAG = '--enable-gpu';

const DISABLE_GPU = '--disable-gpu';

export const throughGpuLauncher = (platform: string, argv: ReadonlyArray<string>): boolean =>
  platform === 'darwin' && argv.includes(GPU_FLAG);

const shellWord = (text: string) => `'${text.replaceAll("'", `'\\''`)}'`;

export const gpuLauncher = (chrome: string): string =>
  [
    '#!/bin/sh',
    'for arg do',
    '  shift',
    `  [ "$arg" = ${DISABLE_GPU} ] || set -- "$@" "$arg"`,
    'done',
    `exec ${shellWord(chrome)} "$@"`,
    '',
  ].join('\n');
