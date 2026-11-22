/* oxlint-disable effect/noNodeBuiltinImport, effect/noGlobals, effect/noNullish, effect/noAsyncFunction, effect/noUnknownParameters, typescript/no-explicit-any, effect/noKnownValueWidening, effect/noTernary, effect/noRuntimeTypeof -- Exact's app folder cannot import effect (docs/exact.md): a host script that drives the built app through `bun run exact agent`, reads its untyped JSON replies by the fields it checks, and tells its steps' ops from its named reads by a plain branch. */

/**
 * The first minute and the tour, live (features/first.contract), on the
 * host named (`bun tools/drive-first.ts web|ios`), the whole way a reader
 * goes on a fresh store, against the substitute `@exact/speech-recognition`
 * ships for the agent (its `heard` the shipped first verse as a recognizer
 * writes it, read from the app's own passage at run time; none is written
 * here):
 *
 * 1. a fresh launch at the root shows the welcome and its growing seed;
 *    Begin shows how a verse grows; Plant your first verse shows hear
 *    under the full text; Listen reads; Next stops the voice and shows
 *    letters under the first letters;
 * 2. a recital said in letters moves on to alone under no cue and keeps
 *    nothing; one said there is kept in the garden, and Planted follows;
 * 3. Continue shows home holding the first verse, the home the current
 *    app's readers first see, with its tips (the card's and Add a list's:
 *    no list, so none under a first furrow) and Got it, which ends them;
 * 4. How Heartseed works replays the welcome with no first-verse line; its
 *    Begin, then See your field, shows home with its tips; the Settings
 *    sheet's Show the welcome again replays the welcome, and its Skip ends
 *    the tour on home;
 * 5. a relaunch on the store opens home, the first verse in it, no tips;
 * 6. on a store of its own at a phone's width: `tree --ax` reads the
 *    welcome, the second screen, hear and letters in their order, each
 *    control a button by its name and the growing seed hidden; dark follows
 *    the scheme; at the largest text (53 px on the web) each control is
 *    whole on screen; under reduced motion the screens stand still. The
 *    welcome's two schemes and hear at the largest text are kept in
 *    `.exact/shots`.
 *
 * Exits 1 on a failed check.
 */

import { join } from 'node:path';

import { makeDrive } from '@manna/exact-kit/drive';
import { readPassage } from '@manna/heartseed/passage';

const host = process.argv[2] ?? 'web';
const app = join(import.meta.dir, '..');
const drive = makeDrive({ name: 'drive-first', host, appDir: app });
const store = `first-${host}-${Date.now().toString(36)}`;
const HEARD: Readonly<Record<string, string>> = { thee: 'the', thy: 'thigh', yea: 'yeah' };

/** The shipped passage as a recognizer writes it: lowercase words, archaic ones as heard. */
const spokenOf = (text: string) =>
  text
    .split(/\s+/u)
    .map((word) => word.toLowerCase().replace(/[^\p{L}\p{N}]/gu, ''))
    .filter((word) => word !== '')
    .map((word) => HEARD[word] ?? word)
    .join(' ');

const passage = readPassage();
const spoken = spokenOf(passage.text);
const has = (tree: unknown, id: string) => JSON.stringify(tree ?? '').includes(`"${id}"`);

/** A step: an op, or a read named by the key its reply is found under. */
type Step = string | readonly [key: string, op: string];

/** Runs `steps` in one launch; each named read's reply by its key. */
const runOf = async (
  flags: 'launch' | 'relaunch',
  steps: readonly Step[],
  on: { readonly store: string; readonly size: readonly string[] } = { store, size: [] },
) => {
  const ops = steps.map((step) => (typeof step === 'string' ? step : step[1]));
  const kept = flags === 'launch' ? '--reset-storage' : '--keep-storage';
  const replies = await drive.run([...on.size, '--storage', on.store, kept], ops);
  const read = new Map<string, any>();
  steps.forEach((step, at) => {
    if (typeof step !== 'string') read.set(step[0], replies[at]);
  });
  return (key: string): any => read.get(key);
};

const recite: readonly Step[] = [
  'prefer extension speech-recognition.heard=""',
  'tap first-say',
  'clock settle',
  `prefer extension speech-recognition.heard=${JSON.stringify(spoken)}`,
  'clock +15000',
  'clock settle',
  'tap first-say',
  'clock data',
  'clock settle',
  'clock +1000',
  'clock data',
  'clock settle',
];

const got = await runOf('launch', [
  'prefer permission.microphone granted',
  'prefer permission.speech-recognition granted',
  'clock data',
  'clock settle',
  ['welcome', 'state first'],
  ['welcomeTree', 'tree'],
  'tap first-begin',
  'clock settle',
  ['grows', 'state first.phase'],
  'tap first-on',
  'clock data',
  'clock settle',
  ['hear', 'state first.phase'],
  ['hearCue', 'state today.cue'],
  'tap first-listen',
  'clock +1000',
  ['reading', 'state today.phase'],
  'tap first-next',
  'clock data',
  'clock settle',
  ['letters', 'state first.phase'],
  ['lettersCue', 'state today.cue'],
  ['stopped', 'state todaySpoken.state'],
  ...recite,
  ['alone', 'state first.phase'],
  ['aloneCue', 'state today.cue'],
  ['keptBefore', 'state gardenRecalled'],
  ...recite.slice(0, 7),
  ['suggested', 'state today.pending'],
  ...recite.slice(7),
  ['kept', 'state gardenRecalled'],
  ['planted', 'state first.phase'],
  ['plantedTree', 'tree'],
  'tap first-continue',
  'clock data',
  'clock settle',
  ['tips', 'state first.tour'],
  ['home', 'state homeShown.singles'],
  ['tipsTree', 'tree'],
  'tap home-got-it',
  'clock settle',
  ['gotIt', 'state first.tour'],
  ['gotItTree', 'tree'],
  'tap home-how',
  'clock settle',
  ['replay', 'state first'],
  ['replayTree', 'tree'],
  'tap first-begin',
  'clock settle',
  ['replayGrows', 'state first.tour'],
  'tap first-on',
  'clock data',
  'clock settle',
  ['seen', 'state first.tour'],
  ['seenTree', 'tree'],
  'tap gear',
  'clock settle',
  'tap settings-welcome',
  'clock data',
  'clock settle',
  ['again', 'state first.tour'],
  ['againTree', 'tree'],
  'tap first-skip',
  'clock data',
  'clock settle',
  ['skipped', 'state first.tour'],
  ['skippedTree', 'tree'],
]);

const welcome = got('welcome');
drive.check(
  'a fresh launch at the root shows the welcome and its growing seed',
  welcome?.phase === 'welcome' &&
    welcome.tour === 'off' &&
    has(got('welcomeTree'), 'first-welcome') &&
    has(got('welcomeTree'), 'growing'),
  welcome,
);
drive.check('Begin shows how a verse grows', got('grows') === 'grows', got('grows'));
drive.check(
  'Plant your first verse shows hear under the full text',
  got('hear') === 'hear' && got('hearCue') === 'full',
  [got('hear'), got('hearCue')],
);
drive.check('Listen reads', got('reading') === 'reading', got('reading'));
drive.check(
  'Next stops the voice and shows letters under the first letters',
  got('letters') === 'letters' && got('lettersCue') === 'initials' && got('stopped') === 'ended',
  [got('letters'), got('lettersCue'), got('stopped')],
);
drive.check(
  'a recital said in letters moves on to alone under no cue and keeps nothing',
  got('alone') === 'alone' && got('aloneCue') === 'none' && got('keptBefore') === null,
  [got('alone'), got('aloneCue'), got('keptBefore')],
);
const kept = got('kept');
const suggested = got('suggested')?.recall?.suggested;
drive.check(
  "alone's recital is kept in the garden at its suggested grade (Good, every word said), and Planted follows",
  kept?.answer === 'Kept' &&
    kept.verse?.reference === passage.reference &&
    kept.verse.recalls === 1 &&
    suggested === 3 &&
    kept.verse.lastGrade === suggested &&
    got('planted') === 'planted' &&
    has(got('plantedTree'), 'planted-seed'),
  { kept, suggested, planted: got('planted') },
);
const home = got('home');
drive.check(
  'Continue shows home holding the first verse, with the card and Add a list tips and Got it',
  got('tips') === 'tips' &&
    Array.isArray(home) &&
    home.some((single: any) => single?.reference === passage.reference) &&
    has(got('tipsTree'), 'tip-1') &&
    !has(got('tipsTree'), 'tip-2') &&
    has(got('tipsTree'), 'tip-3') &&
    has(got('tipsTree'), 'home-got-it') &&
    !has(got('tipsTree'), 'first'),
  { tour: got('tips'), home },
);
drive.check(
  'Got it ends the tips',
  got('gotIt') === 'off' &&
    !has(got('gotItTree'), 'tip-1') &&
    !has(got('gotItTree'), 'home-got-it'),
  got('gotIt'),
);
drive.check(
  'How Heartseed works replays the welcome, with no first-verse line',
  got('replay')?.tour === 'welcome' &&
    has(got('replayTree'), 'first-welcome') &&
    !has(got('replayTree'), '"reference"'),
  got('replay'),
);
drive.check(
  'the replay: Begin, then See your field, shows home with its tips',
  got('replayGrows') === 'grows' && got('seen') === 'tips' && has(got('seenTree'), 'tip-1'),
  [got('replayGrows'), got('seen')],
);
drive.check(
  "Settings' Show the welcome again replays the welcome, and Skip ends the tour on home",
  got('again') === 'welcome' &&
    has(got('againTree'), 'first-welcome') &&
    got('skipped') === 'off' &&
    !has(got('skippedTree'), 'first-welcome') &&
    has(got('skippedTree'), 'home'),
  [got('again'), got('skipped')],
);

const again = await runOf('relaunch', [
  'clock data',
  'clock settle',
  ['opening', 'state startShown.opening'],
  ['home', 'state homeShown.singles'],
  ['tree', 'tree'],
]);
drive.check(
  'a relaunch opens home, the first verse in it, no tips',
  again('opening') === 'home' &&
    (again('home') ?? []).some((single: any) => single?.reference === passage.reference) &&
    !has(again('tree'), 'first-welcome') &&
    !has(again('tree'), 'tip-1'),
  { opening: again('opening'), home: again('home') },
);

/** An element of `tree --ax`: its role, its name and its test id. */
interface Element {
  readonly role: string;
  readonly name: string;
  readonly testId?: string;
}

/** The elements `tree --ax` read, in reading order. */
const axOf = (tree: any): readonly Element[] => tree?.ax?.elements ?? [];

/** The names of the elements whose name is one of `names`, in reading order, each once. */
const orderOf = (tree: any, names: readonly string[]) => [
  ...new Set(axOf(tree).flatMap((each) => (names.includes(each.name) ? [each.name] : []))),
];

/** Whether a control named `name` reads as a button. */
const button = (tree: any, name: string) =>
  axOf(tree).some((each) => each.role === 'button' && each.name === name);

/** A box the layout read is on screen at its full width: none of it cut at the sides. */
const whole = (layout: any, width: number) => {
  const frame = layout?.node?.space?.viewport;
  return frame !== undefined && frame.w > 0 && frame.x >= 0 && frame.x + frame.w <= width + 0.5;
};

const WIDTH = 390;
const shots = join(app, '.exact/shots');
const looks = await runOf(
  'launch',
  [
    'clock data',
    'clock settle',
    ['welcomeAx', 'tree --ax'],
    ['heading', 'layout first-heading'],
    'prefer prefers-color-scheme dark',
    'clock settle',
    ['dark', 'state homeScheme'],
    `screenshot ${join(shots, `${host}-first-welcome-dark.png`)}`,
    'prefer prefers-color-scheme light',
    'clock settle',
    `screenshot ${join(shots, `${host}-first-welcome-light.png`)}`,
    'prefer root-font-size 53',
    'clock settle',
    ['bigBegin', 'layout first-begin'],
    ['bigSkip', 'layout first-skip'],
    ['bigHeading', 'layout first-heading'],
    'tap first-begin',
    'clock settle',
    ['growsAx', 'tree --ax'],
    ['bigOn', 'layout first-on'],
    'tap first-on',
    'clock data',
    'clock settle',
    ['hearAx', 'tree --ax'],
    ['bigNext', 'layout first-next'],
    ['bigListen', 'layout first-listen'],
    `screenshot ${join(shots, `${host}-first-hear-largest.png`)}`,
    'prefer root-font-size 17',
    'prefer prefers-reduced-motion reduce',
    'clock settle',
    ['still', 'state motionStill'],
    'tap first-next',
    'clock data',
    'clock settle',
    ['lettersAx', 'tree --ax'],
  ],
  { store: `${store}-looks`, size: host === 'web' ? ['--size', `${WIDTH}x844`] : [] },
);

drive.check(
  'the welcome reads its heading, its line, its first verse, then Begin and Skip as buttons',
  JSON.stringify(
    orderOf(looks('welcomeAx'), [
      'Heartseed',
      'Plant a verse. Say it from memory. Watch it grow.',
      'Your first verse',
      passage.reference,
      'Begin',
      'Skip',
    ]),
  ) ===
    JSON.stringify([
      'Heartseed',
      'Plant a verse. Say it from memory. Watch it grow.',
      'Your first verse',
      passage.reference,
      'Begin',
      'Skip',
    ]) &&
    button(looks('welcomeAx'), 'Begin') &&
    button(looks('welcomeAx'), 'Skip') &&
    !axOf(looks('welcomeAx')).some((each) => each.testId === 'growing'),
  orderOf(looks('welcomeAx'), ['Heartseed', 'Begin', 'Skip', passage.reference]),
);
drive.check(
  'how a verse grows reads its heading, its stages, its line, Mark 4:28, then its one button',
  button(looks('growsAx'), 'Plant your first verse') &&
    JSON.stringify(
      orderOf(looks('growsAx'), [
        'Every verse is a plant',
        'seed',
        'full corn',
        'Mark 4:28',
        'Plant your first verse',
      ]),
    ) ===
      JSON.stringify([
        'Every verse is a plant',
        'seed',
        'full corn',
        'Mark 4:28',
        'Plant your first verse',
      ]),
  orderOf(looks('growsAx'), ['Every verse is a plant', 'Plant your first verse']),
);
drive.check(
  'hear reads its heading, the reference, then Listen and Next as buttons',
  button(looks('hearAx'), 'Listen') &&
    button(looks('hearAx'), 'Next') &&
    JSON.stringify(orderOf(looks('hearAx'), ['Hear it', passage.reference, 'Listen', 'Next'])) ===
      JSON.stringify(['Hear it', passage.reference, 'Listen', 'Next']),
  orderOf(looks('hearAx'), ['Hear it', passage.reference, 'Listen', 'Next']),
);
drive.check(
  'letters reads its heading and Say it as a button',
  button(looks('lettersAx'), 'Say it') &&
    orderOf(looks('lettersAx'), ['Say it with help', 'Say it'])[0] === 'Say it with help',
  orderOf(looks('lettersAx'), ['Say it with help', 'Say it']),
);
drive.check('dark: the screens follow the scheme', looks('dark') === 'dark', looks('dark'));
drive.check(
  'at the largest text, every control of the welcome, the second screen and hear is whole on screen',
  host !== 'web' ||
    ['bigBegin', 'bigSkip', 'bigHeading', 'bigOn', 'bigNext', 'bigListen'].every((key) =>
      whole(looks(key), WIDTH),
    ),
  ['bigBegin', 'bigSkip', 'bigHeading', 'bigOn', 'bigNext', 'bigListen'].map((key) => [
    key,
    looks(key)?.node?.space?.viewport,
  ]),
);
/** The height of a box the layout read, in px. */
const heightOf = (layout: any): number => layout?.node?.space?.viewport?.h ?? 0;
/** One's title size at the default root, and verify's largest root: the welcome's title in px. */
const [TITLE, TITLE_LARGEST] = [34, 106];
drive.check(
  "the welcome's title is one line at One's 34 pt, and at the largest text it takes a second line (Heart-, seed) rather than spill",
  host !== 'web' ||
    (heightOf(looks('heading')) > 0 &&
      heightOf(looks('heading')) < TITLE * 1.5 &&
      heightOf(looks('bigHeading')) > TITLE_LARGEST * 1.5),
  [heightOf(looks('heading')), heightOf(looks('bigHeading'))],
);
drive.check(
  "the welcome's title is named Heartseed, its soft hyphen read by no one",
  axOf(looks('welcomeAx')).some(
    (each) => each.testId === 'first-heading' && each.name === 'Heartseed',
  ) && !JSON.stringify(looks('welcomeAx')).includes('\u00ad'),
  axOf(looks('welcomeAx')).filter((each) => each.testId === 'first-heading'),
);
drive.check(
  'under reduced motion the screens stand still',
  looks('still') === true,
  looks('still'),
);

process.exit(drive.finish());
