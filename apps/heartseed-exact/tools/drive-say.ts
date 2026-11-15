/* oxlint-disable effect/noNodeBuiltinImport, effect/noGlobals, effect/noAsyncFunction, effect/noKnownValueWidening, effect/noNewError, effect/noNewPromise, effect/noNullish, effect/noTernary, effect/noThrowStatement, effect/noUnknownParameters, node/no-process-env -- a host script, its shots folder named by SHOTS, that drives the built app through `bun run exact agent`, one process group per drive, reads its JSON replies and prints what it found. */

/**
 * Say it's live checks (spec B), which a `.test.contract` cannot hold at
 * Exact's pin: an authored test has no line that sets a module's permission
 * or the recognizer's `heard`. The same steps run here through the wrapper's
 * `agent`, on the host named (`bun tools/drive-say.ts web|ios`), against the
 * substitute `@exact/speech-recognition` ships for the agent, the cue named
 * by the route `/cue/<cue>`. One store is kept across launches: a clean
 * recital under no cue (suggested Good: the current matcher counts any cue
 * as help, so first letters suggest Hard at best) kept at Next and shown
 * after a relaunch (1), then under first letters a try with one peek
 * (2), one after Show all (3), a peek and a try left before Next that keeps
 * nothing (4); then a refusal in a store of its own (5). The transcript is
 * the shipped passage with `thee`, `thy` and `yea` written as a recognizer
 * hears them. Each check prints one PASS or FAIL line and its time; exits 1
 * on any failed check. With `SHOTS=<dir>`, each step's end screen is kept
 * there, light and dark.
 */

import { join } from 'node:path';

import { writePassage } from './passage';

const host = process.argv[2] ?? 'web';
const app = join(import.meta.dir, '..');
const shots = process.env.SHOTS ?? join(app, '.exact/shots');
const DRIVE_MS = 15 * 60 * 1000;
const HEARD: Readonly<Record<string, string>> = { thee: 'the', thy: 'thigh', yea: 'yeah' };
const PEEKED = 4;

/** The shipped passage as a recognizer writes it: lowercase words, archaic ones as heard. */
const spokenOf = (text: string) =>
  text
    .split(/\s+/u)
    .map((word) => word.toLowerCase().replace(/[^\p{L}\p{N}]/gu, ''))
    .filter((word) => word !== '')
    .map((word) => HEARD[word] ?? word)
    .join(' ');

const run = async (flags: readonly string[], ops: readonly string[]) => {
  const started = performance.now();
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
  console.log(
    `time ${host} launch of ${ops.length} ops: ${Math.round(performance.now() - started)} ms`,
  );
  const got = replies.slice(-ops.length);
  return (op: string) => got[ops.lastIndexOf(op)];
};

let failed = 0;
const check = (name: string, ok: boolean, got: unknown) => {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${host} ${name}${ok ? '' : `: ${JSON.stringify(got)}`}`);
};
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

const passage = writePassage();
const spoken = spokenOf(passage.text);
const store = `say-${host}-${Date.now().toString(36)}`;
const shot = (name: string) => [
  'prefer prefers-color-scheme light',
  'clock settle',
  `screenshot ${join(shots, `${host}-${name}-light.png`)}`,
  'prefer prefers-color-scheme dark',
  'clock settle',
  `screenshot ${join(shots, `${host}-${name}-dark.png`)}`,
  'prefer prefers-color-scheme light',
];
const granted = [
  'prefer permission.microphone granted',
  'prefer permission.speech-recognition granted',
];
const recite = [
  'tap say',
  'clock settle',
  `prefer extension speech-recognition.heard=${JSON.stringify(spoken)}`,
  'clock +15000',
  'clock settle',
  'tap finish',
  'clock settle',
];
const enabledOf = (grades: readonly { grade: number; enabled: boolean }[] | undefined) =>
  (grades ?? []).filter((grade) => grade.enabled).map((grade) => grade.grade);
const cued = ['--url', '/cue/initials'];

const clean = await run(
  ['--storage', store, '--reset-storage', '--url', '/cue/none'],
  [
    ...granted,
    'clock data',
    'clock settle',
    'state today.cue',
    ...recite,
    'state today.suggested',
    'state today.grades',
    'state today.pending',
    'state todayListening',
    'tap grade-4',
    'clock settle',
    'state today.grades.3.chosen',
    'tap grade-3',
    'clock settle',
    'state today.grades.2.chosen',
    'tap next',
    'clock settle',
    'state today.last',
    ...shot('clean'),
  ],
);
check('B1 the cue is none', clean('state today.cue') === 'none', clean('state today.cue'));
check(
  'B1 a clean recital under no cue: suggested Good',
  clean('state today.suggested') === 'Suggested: Good',
  clean('state today.suggested'),
);
check(
  'B1 all four grades offered',
  same(enabledOf(clean('state today.grades')), [1, 2, 3, 4]),
  clean('state today.grades'),
);
check(
  'B1 every word said',
  clean('state today.pending')?.recall?.missed === 0,
  clean('state today.pending')?.recall,
);
check(
  'B1 the recognition ran on the device',
  clean('state todayListening')?.leavesDevice === false,
  clean('state todayListening'),
);
check(
  'B1 Easy can be chosen',
  clean('state today.grades.3.chosen') === true,
  clean('state today.grades.3.chosen'),
);
check(
  'B1 then Good chosen',
  clean('state today.grades.2.chosen') === true,
  clean('state today.grades.2.chosen'),
);
const kept1 = clean('state today.last');
check('B1 Next keeps it, Good, no help', kept1?.recall?.grade === 3 && kept1?.help === null, kept1);

const relaunched = await run(
  ['--storage', store, '--keep-storage', ...cued],
  ['clock data', 'clock settle', 'state today.last', 'state today.pending'],
);
check(
  'B1 a relaunch shows it as last',
  same(relaunched('state today.last'), kept1),
  relaunched('state today.last'),
);
check(
  'B1 and nothing pending',
  relaunched('state today.pending') === null,
  relaunched('state today.pending'),
);

const peeked = await run(
  ['--storage', store, '--keep-storage', ...cued],
  [
    ...granted,
    'clock data',
    'clock settle',
    `tap word-${PEEKED}`,
    'clock settle',
    `state today.words.${PEEKED}.label`,
    'clock +1500',
    'clock settle',
    `state today.words.${PEEKED}.label`,
    ...recite,
    'state today.grades',
    'state today.suggested',
    'tap next',
    'clock settle',
    'state today.last',
    ...shot('peeked'),
  ],
);
const peekedLabel = peeked(`state today.words.${PEEKED}.label`);
check('B2 the peek ended after its moment', peekedLabel?.length === 1, peekedLabel);
check(
  'B2 grades above Hard disabled',
  same(enabledOf(peeked('state today.grades')), [1, 2]),
  peeked('state today.grades'),
);
check(
  'B2 the suggestion is Hard at best',
  peeked('state today.suggested') === 'Suggested: Hard',
  peeked('state today.suggested'),
);
const kept2 = peeked('state today.last');
check(
  'B2 Next keeps Hard at best, the help naming the word',
  kept2?.recall?.grade <= 2 && same(kept2?.help?.peeked, [PEEKED]) && kept2?.recall?.peeked === 1,
  kept2,
);

const shown = await run(
  ['--storage', store, '--keep-storage', ...cued],
  [
    ...granted,
    'clock data',
    'clock settle',
    'tap show-all',
    'clock settle',
    'state today.helpLine',
    'state today.cap',
    ...recite,
    'state today.grades',
    'state today.moveBack',
    ...shot('shown-all'),
    'tap next',
    'clock settle',
    'state today.last',
  ],
);
check(
  'B3 only the capped grades enabled',
  same(enabledOf(shown('state today.grades')), [1, 2]),
  shown('state today.grades'),
);
check(
  'B3 the result says move back',
  shown('state today.moveBack') === true &&
    String(shown('state today.helpLine')).includes('moves back a stage'),
  shown('state today.helpLine'),
);
const kept3 = shown('state today.last');
check(
  'B3 Next keeps the help with its Show all',
  Number.isFinite(kept3?.help?.shownAt) && kept3?.recall?.grade <= 2,
  kept3,
);

const left = await run(
  ['--storage', store, '--keep-storage', ...cued],
  [
    ...granted,
    'clock data',
    'clock settle',
    'tap word-2',
    'clock settle',
    ...recite,
    'state today.canNext',
  ],
);
check(
  'B4 a peeked try is graded',
  left('state today.canNext') === true,
  left('state today.canNext'),
);
const back = await run(
  ['--storage', store, '--keep-storage', ...cued],
  ['clock data', 'clock settle', 'state today.last', 'state today.help'],
);
check(
  'B4 leaving before Next keeps nothing new',
  same(back('state today.last'), kept3),
  back('state today.last'),
);
check('B4 and lets the help go', back('state today.help') === null, back('state today.help'));

const refused = await run(
  ['--storage', `${store}-refused`, '--reset-storage'],
  [
    'prefer permission.microphone granted',
    'prefer permission.speech-recognition denied',
    'clock data',
    'tap say',
    'clock settle',
    'state today.refused',
    'state today.pending',
    'state today.last',
    ...shot('refused'),
    'tap hear',
    'clock +1000',
    'state today.phase',
    'state today.lit',
  ],
);
check(
  'B5 the refusal is shown',
  refused('state today.refused') === true,
  refused('state today.refused'),
);
check(
  'B5 nothing kept',
  refused('state today.pending') === null && refused('state today.last') === null,
  [refused('state today.pending'), refused('state today.last')],
);
check(
  'B5 Hear it still reads',
  refused('state today.phase') === 'reading' && refused('state today.lit') >= 1,
  [refused('state today.phase'), refused('state today.lit')],
);

console.log(`${failed === 0 ? 'ok' : 'FAILED'}: drive-say ${host}, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
