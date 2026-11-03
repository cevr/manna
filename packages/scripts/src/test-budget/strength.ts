import { Option } from 'effect';
import { bunTests } from './shell.ts';

/** bun's own timeout for a test that names none, in milliseconds. */
const BUN_DEFAULT_MS = 5_000;

/** The flags that run a test less, by their long and short spellings. */
const WEAKENING = new Map([
  ['--retry', 'retries a failing test until it passes'],
  ['--only', 'runs only the tests marked .only'],
  ['--test-name-pattern', 'runs only the tests whose names match'],
  ['-t', 'runs only the tests whose names match'],
]);

/**
 * A flag's name and its value: `--timeout=20000`, or `--timeout 20000` (the
 * next word); a short flag's value may be attached (`-tfast`).
 */
const flagAt = (words: ReadonlyArray<string>, at: number) => {
  const word = words[at] ?? '';
  if (/^-[^-]./.test(word)) return { name: word.slice(0, 2), value: word.slice(2) };
  const [name = '', inline] = word.split(/=(.*)/s);
  return { name, value: inline ?? words[at + 1] ?? '' };
};

/** What weakens the tests in a workspace's `test` script, a line each: none when it runs them at full strength. */
export const weakeningFlags = (script: string): ReadonlyArray<string> =>
  bunTests(script).flatMap((words) =>
    words.flatMap((word, at) => {
      if (!word.startsWith('-')) return [];
      const { name, value } = flagAt(words, at);
      if (name === '--timeout') {
        const ms = Number(value);
        if (Number.isFinite(ms) && ms > 0 && ms <= BUN_DEFAULT_MS) return [];
        return [
          `--timeout ${value} gives every test more than bun's 5 s (0 sets none): make the slow tests fast, and give a test that spawns its own spawn budget`,
        ];
      }
      return Option.toArray(
        Option.map(
          Option.fromUndefinedOr(WEAKENING.get(name)),
          (why) => `${name} ${why}: run every test, every time`,
        ),
      );
    }),
  );
