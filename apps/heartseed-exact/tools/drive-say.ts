/* oxlint-disable effect/noNodeBuiltinImport, effect/noGlobals, effect/noAsyncFunction, effect/noKnownValueWidening, effect/noNewError, effect/noNewPromise, effect/noNullish, effect/noTernary, effect/noThrowStatement, effect/noUnknownParameters -- Exact's app folder cannot import effect (docs/exact.md): a host script that drives the built app through `bun run exact agent`, one process group per drive, reads its JSON replies and prints what it found. */

/**
 * Say it's live checks (spec B3-B5), which a `.test.contract` cannot hold at
 * Exact's pin: an authored test has no line that sets a module's permission
 * or the recognizer's `heard`, nor one that answers a permission ticket. The
 * same steps run here through the wrapper's `agent`, on the host named
 * (`bun tools/drive-say.ts web|ios`), against the substitute
 * `@exact/speech-recognition` ships for the agent. The transcript is the
 * shipped passage with `thee`, `thy` and `yea` written as a recognizer hears
 * them and `dismayed` left out. Exits 1 on any failed check.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const host = process.argv[2] ?? 'web';
const app = join(import.meta.dir, '..');
const DRIVE_MS = 15 * 60 * 1000;
const HEARD: Readonly<Record<string, string>> = { thee: 'the', thy: 'thigh', yea: 'yeah' };
const LEFT_OUT = 'dismayed';

/** The shipped passage as a recognizer writes it: lowercase words, archaic ones as heard, one left out. */
const spokenOf = (text: string) =>
  text
    .split(/\s+/u)
    .map((word) => word.toLowerCase().replace(/[^\p{L}\p{N}]/gu, ''))
    .filter((word) => word !== '' && word !== LEFT_OUT)
    .map((word) => HEARD[word] ?? word)
    .join(' ');

const run = async (flags: readonly string[], ops: readonly string[]) => {
  const child = Bun.spawn(['bun', 'run', 'exact', 'agent', host, '--json', ...flags, ...ops], {
    cwd: app,
    stdout: 'pipe',
    stderr: 'pipe',
    detached: true,
  });
  const timer = setTimeout(() => process.kill(-child.pid, 'SIGTERM'), DRIVE_MS);
  const [out, err, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  clearTimeout(timer);
  const replies = out
    .split('\n')
    .filter(
      (line) =>
        line.startsWith('{') ||
        line.startsWith('[') ||
        line === 'null' ||
        line.startsWith('"') ||
        /^[-\d]|^true$|^false$/u.test(line),
    )
    .map((line) => JSON.parse(line));
  if (code !== 0 || replies.length < ops.length)
    throw new Error(
      `agent ${host} exited ${code} with ${replies.length} of ${ops.length} replies\n${err.slice(-2000)}`,
    );
  return replies.slice(-ops.length);
};

let failed = 0;
const check = (name: string, ok: boolean, got: unknown) => {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${host} ${name}${ok ? '' : `: ${JSON.stringify(got)}`}`);
};
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

const passage = JSON.parse(readFileSync(join(app, 'src', 'passage', 'today.json'), 'utf8'));
const spoken = spokenOf(passage.text);
const store = `say-${host}-${Date.now().toString(36)}`;
const shot = (name: string) => `screenshot .exact/shots/${host}-${name}.png`;

const restOps = [
  'clock data',
  shot('rest-light'),
  'prefer prefers-color-scheme dark',
  'clock settle',
  shot('rest-dark'),
  'prefer prefers-color-scheme light',
  'tap hear',
  ...Array.from({ length: 12 }, () => 'clock +2000'),
  'clock settle',
  'state today.lit',
  shot('heard-light'),
  'prefer prefers-color-scheme dark',
  'clock settle',
  shot('heard-dark'),
];
const rest = await run(['--storage', `${store}-rest`, '--reset-storage'], restOps);
const lit = rest[restOps.indexOf('state today.lit')];
check(
  'the end screens of B1 and B2 are drawn, every word lit',
  lit === passage.text.split(' ').length,
  lit,
);

const said = await run(
  ['--storage', store, '--reset-storage'],
  [
    'prefer permission.microphone granted',
    'prefer permission.speech-recognition granted',
    'clock data',
    'tap say',
    'clock settle',
    `prefer extension speech-recognition.heard=${JSON.stringify(spoken)}`,
    'clock +15000',
    'clock settle',
    'tap finish',
    'clock settle',
    'state today.result',
    'state today.last',
    'state today.words',
    'state todayListening',
    shot('said-light'),
    'prefer prefers-color-scheme dark',
    'clock settle',
    shot('said-dark'),
  ],
);
const [result, last, words, listening] = said.slice(10, 14);
check(
  'B3 the result counts the words said right of all',
  same(result, { right: 36, total: 37 }),
  result,
);
check('B3 the recall is kept as the last', same(last, result), last);
const misses = words.filter((word: { mark: string }) => word.mark !== 'matched');
check(
  'B3 the left-out word alone is missed',
  same(
    misses.map((word: { index: number; mark: string }) => [word.index, word.mark]),
    [[10, 'miss']],
  ),
  misses,
);
check('B3 the recognition ran on the device', listening?.leavesDevice === false, listening);

const relaunched = await run(
  ['--storage', store, '--keep-storage'],
  [
    'clock data',
    'state today.last',
    'state today.result',
    shot('relaunch-light'),
    'prefer prefers-color-scheme dark',
    'clock settle',
    shot('relaunch-dark'),
  ],
);
check(
  'B4 a relaunch shows the same last recall',
  same(relaunched[1], { right: 36, total: 37 }),
  relaunched[1],
);
check('B4 and no result of its own', relaunched[2] === null, relaunched[2]);

const refused = await run(
  ['--storage', `${store}-refused`, '--reset-storage'],
  [
    'prefer permission.microphone granted',
    'prefer permission.speech-recognition denied',
    'clock data',
    'tap say',
    'clock settle',
    'state today.refused',
    'state today.result',
    'state today.last',
    shot('refused-light'),
    'prefer prefers-color-scheme dark',
    'clock settle',
    shot('refused-dark'),
    'tap hear',
    'clock +1000',
    'state today.phase',
    'state today.lit',
  ],
);
check('B5 the refusal is shown', refused[5] === true, refused[5]);
check(
  'B5 no result and no last recall',
  refused[6] === null && refused[7] === null,
  refused.slice(6, 8),
);
check(
  'B5 Hear it still reads',
  refused[14] === 'reading' && refused[15] >= 1,
  refused.slice(14, 16),
);

console.log(`${failed === 0 ? 'ok' : 'FAILED'}: drive-say ${host}, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
