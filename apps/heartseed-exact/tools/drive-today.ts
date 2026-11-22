/* oxlint-disable effect/noNodeBuiltinImport, effect/noGlobals, effect/noNullish, effect/noAsyncFunction, effect/noAs, effect/noTernary, effect/noUnknownParameters, effect/noRuntimeTypeof -- Exact's app folder cannot import effect (docs/exact.md): a host script that picks its size by host, drives the built app through `bun run exact agent`, and reads its untyped JSON replies by the fields it checks. */

/**
 * Today's hold while the voice reads, driven through `@manna/exact-kit/drive`
 * on the host named (`bun tools/drive-today.ts web|ios`), under the full
 * text: a hold on the fifth word dragged to the eighth reads on from the
 * eighth, every word keeping its name for the screen reader; at the largest
 * text (root 53 px) a hold on the verse's last word, brought into view,
 * reads on from it and nothing of Today is clipped; under Reduce Motion a
 * hold on the fifth word reads on from it. On the web a held drag is driven
 * by the mouse, since a touch dragged after its hold is the browser's
 * (README, Today); on iOS it is the host's own finger.
 */

import { join } from 'node:path';

import { makeDrive } from '@manna/exact-kit/drive';

const host = process.argv[2] ?? 'web';
const app = join(import.meta.dir, '..');
const drive = makeDrive({ name: 'drive-today', host, appDir: app });

const pointer = host === 'web' ? ' mouse' : '';
const size = host === 'web' ? ['--size', '390x844'] : [];
const flagsOf = (name: string) => [
  '--storage',
  `today-hold-${name}-${host}-${Date.now().toString(36)}`,
  '--reset-storage',
  '--url',
  '/cue/full',
  ...size,
];
const SETTLE = ['clock data', 'clock settle'];
const HEAR = ['tap hear', 'clock +600', 'clock data'];
const holdOn = (word: number) => `tap word-${word} drag 1 0${pointer} press 400 over 16 hold 16`;
/** The lift's ask is acted on a commit later and the read on spoken once the stop lands. */
const LANDED = ['clock data', 'clock +1', 'clock data', 'clock +1', 'clock data'];

/** Runs `ops`; the reply to `op`, its `nth` time. */
const run = async (flags: readonly string[], ops: readonly string[]) => {
  const replies = await drive.run(flags, ops);
  return (op: string, nth = 0) => {
    let seen = -1;
    return replies[ops.findIndex((each) => each === op && ++seen === nth)];
  };
};

interface Element {
  readonly testId?: string;
  readonly role?: string;
  readonly name?: string;
}
const namesOf = (reply: unknown) =>
  ((reply as { ax?: { elements?: ReadonlyArray<Element> } } | undefined)?.ax?.elements ?? [])
    .filter((each) => /^word-\d+$/u.test(each.testId ?? '') && each.role !== 'StaticText')
    .map((each) => each.name ?? '');

const clipsOf = (reply: unknown): ReadonlyArray<string> => {
  const found: string[] = [];
  const walk = (at: unknown) => {
    if (Array.isArray(at)) at.forEach(walk);
    else if (typeof at === 'object' && at !== null) {
      const it = at as { kind?: string; id?: string | null };
      if (it.kind === 'clipped') found.push(it.id ?? '');
      else Object.values(at).forEach(walk);
    }
  };
  walk(reply);
  return found;
};

/** The read on from word `k`: the second utterance, its words lit from `k` and at most two past it. */
const readsOnFrom = (k: number, reply: (op: string, nth?: number) => unknown) => {
  const lit = reply('state today.lit');
  const seen = { lit, utterance: reply('state todayUtterance'), ask: reply('state today.ask') };
  const ok =
    typeof lit === 'number' &&
    lit >= k &&
    lit <= k + 2 &&
    seen.utterance === 'utterance-2' &&
    seen.ask === 'seek';
  return { ok, seen };
};
const READ = ['state today.lit', 'state todayUtterance', 'state today.ask'];

const touch = host === 'web' ? [] : ['--touch', 'platform'];
const proof = await run(
  [...flagsOf('proof'), ...touch],
  [
    ...SETTLE,
    ...HEAR,
    'tap word-4 drag 0 40 press 400 over 200 hold 16',
    ...LANDED,
    'state today.ask',
    'state todayUtterance',
    'tap stop',
    ...SETTLE,
    ...HEAR,
    'tap word-4 drag 0 0 press 400',
    ...LANDED,
    'state today.ask',
    'state todayUtterance',
    'tap stop',
    ...SETTLE,
    ...HEAR,
    'state today.askKey',
    'state todayUtterance',
    'tap word-4 drag 0 120 over 120',
    ...LANDED,
    'state today.askKey',
    'state todayUtterance',
  ],
);
const touchDragged = { ask: proof('state today.ask'), utterance: proof('state todayUtterance') };
drive.check(
  host === 'web'
    ? 'proof: a touch dragged 40 pt after its hold is taken by the browser, and the reading resumes (a named lack)'
    : 'proof: a finger dragged 40 pt after its hold keeps it, and the reading goes on from the word it ends on',
  host === 'web'
    ? touchDragged.ask === 'resume' && touchDragged.utterance === 'utterance-1'
    : touchDragged.ask === 'seek',
  touchDragged,
);
const stillHeld = { ask: proof('state today.ask', 1), utterance: proof('state todayUtterance', 1) };
drive.check(
  'proof: a still hold lifted where it pressed reads on from the word',
  stillHeld.ask === 'seek',
  stillHeld,
);
const swiped = {
  asks: [proof('state today.askKey'), proof('state today.askKey', 1)],
  utterances: [proof('state todayUtterance', 2), proof('state todayUtterance', 3)],
};
drive.check(
  'proof: a drag begun before the hold scrolls and holds nothing',
  swiped.asks[0] === swiped.asks[1] && swiped.utterances[0] === swiped.utterances[1],
  swiped,
);

const dragged = await run(flagsOf('drag'), [
  ...SETTLE,
  'state today.words.length',
  'tree --ax',
  ...HEAR,
  `tap word-4 drag to word-7${pointer} press 400 over 160 hold 16`,
  ...LANDED,
  ...READ,
  'tree --ax',
]);
const words = Number(dragged('state today.words.length') ?? 0);
const last = Math.max(0, words - 1);
drive.check(`the passage has more than eight words (${words})`, words > 8, words);
const fromEighth = readsOnFrom(7, dragged);
drive.check(
  'a hold on the fifth word dragged to the eighth reads on from the eighth',
  fromEighth.ok,
  fromEighth.seen,
);
const before = namesOf(dragged('tree --ax'));
const after = namesOf(dragged('tree --ax', 1));
drive.check(
  'tree --ax: every word keeps its name through a hold',
  before.length === words && before.join('|') === after.join('|'),
  { before: before.slice(0, 10), after: after.slice(0, 10) },
);

const largest = await run(flagsOf('largest'), [
  'prefer root-font-size 53',
  ...SETTLE,
  ...HEAR,
  holdOn(last),
  ...LANDED,
  ...READ,
  'check',
]);
const fromLast = readsOnFrom(last, largest);
drive.check(
  "largest text: a hold on the verse's last word, brought into view, reads on from it",
  fromLast.ok,
  { ...fromLast.seen, last },
);
const clipped = clipsOf(largest('check'));
drive.check('largest text: `check` finds nothing of Today clipped', clipped.length === 0, clipped);

const still = await run(flagsOf('still'), [
  'prefer prefers-reduced-motion reduce',
  ...SETTLE,
  ...HEAR,
  holdOn(4),
  ...LANDED,
  ...READ,
]);
const fromFifth = readsOnFrom(4, still);
drive.check(
  'Reduce Motion: a hold on the fifth word reads on from it',
  fromFifth.ok,
  fromFifth.seen,
);

process.exit(drive.finish());
