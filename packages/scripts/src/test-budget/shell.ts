import { Predicate } from 'effect';

const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;

const programOf = (words: ReadonlyArray<string>) => {
  const at = words.findIndex((word) => word !== 'env' && !ASSIGNMENT.test(word));
  if (at < 0) return [];
  return words.slice(at);
};

const TOKEN = /(&&|\|\||[;&|\n])|((?:\\[\s\S]|[^\s'";&|\\]+|'[^']*'|"(?:[^"\\]|\\[\s\S])*")+)/g;

const JOIN = /^(?:\\\n)+$/;

const unquoted = (word: string) =>
  word.replace(/'([^']*)'|"((?:[^"\\]|\\[\s\S])*)"|\\([\s\S])/g, (_, single, double, bare) => {
    if (Predicate.isString(single)) return single;
    if (Predicate.isString(double))
      return double.replace(/\\\n/g, '').replace(/\\([$`"\\])/g, '$1');
    if (bare === '\n') return '';
    return String(bare);
  });

const bareOf = (word: string) => word.replace(/'[^']*'|"(?:[^"\\]|\\[\s\S])*"|\\[\s\S]/g, '');

const EXPANDS = /[*?[\]{}~]/;

const readOf = (script: string) => {
  const commands: Array<Array<string>> = [[]];
  const separators: Array<string> = [];
  let comment = false;
  let expands = false;
  for (const [, separator, word = ''] of script.matchAll(TOKEN)) {
    if (separator === '\n') comment = false;
    if (comment) continue;
    if (separator) {
      separators.push(separator);
      commands.push([]);
    } else if (word.startsWith('#')) comment = true;
    else if (!JOIN.test(word)) {
      expands ||= EXPANDS.test(bareOf(word));
      commands[commands.length - 1]?.push(unquoted(word));
    }
  }
  return { commands, separators, expands };
};

export const commandsOf = (script: string): ReadonlyArray<ReadonlyArray<string>> =>
  readOf(script).commands.map(programOf);

const SHELL_CHANGES = new Set([
  'exit',
  'return',
  'logout',
  'break',
  'continue',
  'export',
  'readonly',
  'declare',
  'typeset',
  'local',
  'set',
  'unset',
  'shopt',
  'setopt',
  'alias',
  'unalias',
  'hash',
  'enable',
  'builtin',
  'command',
  'eval',
  'exec',
  'source',
  '.',
  'trap',
  'umask',
  'ulimit',
  'read',
  'getopts',
  'let',
  'shift',
  'cd',
  'pushd',
  'popd',
  'kill',
]);

const RESERVED = new Set([
  '!',
  '{',
  '}',
  '[[',
  ']]',
  'case',
  'do',
  'done',
  'elif',
  'else',
  'esac',
  'fi',
  'for',
  'function',
  'if',
  'in',
  'select',
  'then',
  'time',
  'coproc',
  'until',
  'while',
]);

export const changesShell = (script: string) => {
  const read = readOf(script);
  return (
    /[^\x20-\x7E\t]/.test(script) ||
    /[$`<>]/.test(script) ||
    read.expands ||
    read.commands.some((words) => {
      const program = words[0] ?? '';
      return (
        program === 'env' ||
        ASSIGNMENT.test(program) ||
        SHELL_CHANGES.has(program) ||
        RESERVED.has(program)
      );
    })
  );
};

export const andChained = (script: string) =>
  readOf(script).separators.every((separator) => separator === '&&');

export const bunTests = (script: string): ReadonlyArray<ReadonlyArray<string>> =>
  commandsOf(script)
    .filter((words) => words[0] === 'bun' && words.includes('test'))
    .map((words) => words.slice(words.indexOf('test') + 1));
