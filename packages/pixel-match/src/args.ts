/* oxlint-disable effect/noNullish, effect/noTernary -- a command line's flags are there or not: plain TypeScript as the harness's other host tools. */

/**
 * The command line of `bun run pixel`, read before anything runs: the
 * command, its words and its flags. A flag that takes a value and has none,
 * or a value no cell of the matrix has (a scheme, a text size or a
 * viewport), refuses with its reason, so a mistyped run never passes as a
 * run that took nothing.
 */

import { IOS, WEB } from './model.ts';

/** What `pixel` was asked, once every flag is known good. */
interface Asked {
  readonly _tag: 'Asked';
  readonly command: string;
  readonly words: ReadonlyArray<string>;
  readonly scheme: string | undefined;
  readonly size: string | undefined;
  readonly unit: string | undefined;
  readonly web: boolean;
  readonly repin: boolean;
}

/** A command line refused, and why. */
interface Refused {
  readonly _tag: 'Refused';
  readonly reason: string;
}

const VALUED = ['--scheme', '--size', '--unit'] as const;
const SWITCHES = ['--web', '--repin'] as const;

const isValued = (word: string): word is (typeof VALUED)[number] =>
  VALUED.some((flag) => flag === word);
const isSwitch = (word: string) => SWITCHES.some((flag) => flag === word);

const refused = (reason: string): Refused => ({ _tag: 'Refused', reason });

/** The values a host's cells take for `--size`: the iOS text sizes or the web viewports. */
const sizesOf = (web: boolean): ReadonlyArray<string> =>
  web ? WEB.viewports : [IOS.size, ...IOS.sweepSizes];

/** Reads `argv` (after `pixel`): what was asked, or why it is refused. */
export const parseArgs = (argv: ReadonlyArray<string>): Asked | Refused => {
  const [command = '', ...rest] = argv;
  const words: string[] = [];
  const values = new Map<string, string>();
  for (let i = 0; i < rest.length; i++) {
    const word = rest[i] ?? '';
    if (isValued(word)) {
      const value = rest[i + 1] ?? '';
      if (value.trim() === '' || value.startsWith('--')) return refused(`${word} needs a value`);
      values.set(word, value);
      i += 1;
    } else if (isSwitch(word)) values.set(word, 'on');
    else if (word.startsWith('--')) return refused(`${word}: no such flag`);
    else words.push(word);
  }
  const web = values.has('--web');
  const scheme = values.get('--scheme');
  if (scheme !== undefined && !IOS.schemes.some((each) => each === scheme))
    return refused(`--scheme ${scheme}: light or dark`);
  const size = values.get('--size');
  if (size !== undefined && !sizesOf(web).includes(size))
    return refused(
      `--size ${size}: one of ${sizesOf(web).join(', ')}${web ? '' : ' (a viewport with --web)'}`,
    );
  return {
    _tag: 'Asked',
    command,
    words,
    scheme,
    size,
    unit: values.get('--unit'),
    web,
    repin: values.has('--repin'),
  };
};
