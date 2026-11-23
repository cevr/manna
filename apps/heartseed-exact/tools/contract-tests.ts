/* oxlint-disable effect/noNodeBuiltinImport, effect/noGlobals, effect/noAsyncFunction, effect/noAs, effect/noNullish, effect/noNewPromise, node/no-process-env -- a host script for the Bun tests: it runs the Exact clone's own compiler, which no data module reaches, and types its JSON as the compiler writes it (an unlimited refusal's `times` is null). */

/**
 * A contract test file as Exact's own compiler parses it: `contract test <file>`
 * of the clone `EXACT` names (else `~/Developer/vendor/exact`), the JSON its
 * driver reads, each test's steps with the file's launch lines leading them.
 * A check that reads this judges what Exact runs, whatever spaces or escapes
 * the file's text holds.
 */

import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/** One step of a test, as the compiler writes it: its `op`, its line and the fields of that op. */
export interface ParsedStep {
  readonly op: string;
  readonly line: number;
  readonly prefix?: string;
  readonly times?: number | null;
}

/** One test of a file, as the compiler writes it. */
export interface ParsedTest {
  readonly name: string;
  readonly steps: ReadonlyArray<ParsedStep>;
}

/** The file's tests, or why the compiler gave none. */
export type Parsed = { readonly tests: ReadonlyArray<ParsedTest> } | { readonly refused: string };

/** The clone's compiler, which every `bun run exact` builds at the pin. */
const compiler = join(
  process.env['EXACT'] ?? join(homedir(), 'Developer', 'vendor', 'exact'),
  'target',
  'debug',
  'contract',
);

/** How long one parse may take: it takes about 20 ms. */
const PARSE_MS = 10_000;

/** The tests of the file at `path`, or of `text` handed on stdin when `path` is `/dev/stdin`. */
const parse = async (path: string, text = ''): Promise<Parsed> => {
  if (!existsSync(compiler))
    return {
      refused: `no Exact compiler at ${compiler}: run any \`bun run exact contract build app.contract --json\` in the app to build it`,
    };
  const child = Bun.spawn([compiler, 'test', path], {
    stdin: new TextEncoder().encode(text),
    stdout: 'pipe',
    stderr: 'pipe',
    timeout: PARSE_MS,
  });
  const [out, err, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (code !== 0) return { refused: `contract test ${path} exited ${code}: ${err.trim()}` };
  return { tests: (JSON.parse(out) as { tests: ReadonlyArray<ParsedTest> }).tests };
};

/** The tests of the contract test file at `path`. */
export const parsedFile = (path: string): Promise<Parsed> => parse(path);

/** The tests of a contract test file whose text is `text`. */
export const parsedText = (text: string): Promise<Parsed> => parse('/dev/stdin', text);
