/* oxlint-disable effect/noNodeBuiltinImport, effect/noGlobals, effect/noAs, effect/noNullish, effect/noAsyncFunction, effect/noUnknownParameters, effect/noTernary, effect/noRuntimeTypeof -- a host script that drives the built app through `bun run exact agent` and reads its untyped JSON replies by the fields it checks. */

/**
 * The hymn page's follow's live checks a `.test.contract` cannot hold:
 * the names the screen reader is given, Reduce Motion, the largest text and
 * the work ten seconds of play cost. Through `@manna/exact-kit/drive` on the
 * host named (`bun tools/drive-follow.ts web|ios`), on hymn 2 with Sound
 * off (the silent clock, on the agent's clock):
 *
 * - the count-in is a progress bar named "Count-in" whose value reads
 *   "Beat <k> of 4", the current `CountIn.tsx`'s; the sung line is current;
 *   after a wheel on the page the button "Resume follow" shows, the current
 *   `ResumeFollow.tsx`'s name; with the held seek taken (a mouse held still
 *   350 ms on the words, then moved a line step up) the status line says
 *   the choice as the current `SeekStatus` says it (`spoken`), a word is
 *   chosen on hymn 2's word-timed line with no "Line timing only", and
 *   after the lift the pager's page has not changed and the player sings a
 *   line on (`tree --ax`, `state`); on hymn 663, which the current app
 *   times by lines alone, the held seek shows "Line timing only";
 * - with Reduce Motion on, the newly lit count-in mark has no animation, and
 *   the page is placed at a sung line far down the hymn at once: the line
 *   stands a third of the way down the page (`layout`);
 * - at the largest system text with the largest Reading size the sung
 *   line's top is in the page and nothing in the page's lines is clipped
 *   (`check`, on the nodes under `hymn-words`);
 * - ten seconds of play: the work in the page's words (each plan site's
 *   counts under `hymn-words`, `perf`, before and after), the presented
 *   frames' health where the host observes it (`perf frames health`), and
 *   the data module's follow answers per second (the follow's `serial`).
 *
 * Exits 1 on any failed check.
 */

import { join } from 'node:path';

import { makeDrive } from '@manna/exact-kit/drive';

const host = process.argv[2] ?? 'web';
const drive = makeDrive({ name: 'drive-follow', host, appDir: join(import.meta.dir, '..') });
const store = (name: string) => `follow-${name}-${host}-${Date.now().toString(36)}`;
const LARGEST = 53;

interface Ax {
  readonly testId?: string;
  readonly role?: string;
  readonly name?: string;
  readonly value?: string;
  readonly valueText?: string;
  readonly states?: { readonly selected?: boolean };
}

interface TreeNode {
  readonly id: number;
  readonly props?: { readonly testId?: string };
  readonly children?: ReadonlyArray<number>;
}

interface Finding {
  readonly kind: string;
  readonly id: number;
}

interface Viewport {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

const axOf = (reply: unknown): ReadonlyArray<Ax> =>
  (reply as { ax?: { elements?: ReadonlyArray<Ax> } } | undefined)?.ax?.elements ?? [];

const axAt = (replies: ReadonlyArray<unknown>, id: string): Ax | undefined =>
  replies.flatMap(axOf).find((element) => element.testId === id);

const boxOf = (reply: unknown): Viewport | undefined =>
  (reply as { node?: { space?: { viewport?: Viewport } } } | undefined)?.node?.space?.viewport;

interface StateReply {
  readonly resources?: object;
  readonly derives?: object;
  readonly slots?: object;
}

/** The value at `path` (dot separated) of the app's state, from a bare `state` reply: its slots, derives and resources. */
const slotOf = (reply: unknown, path: string): unknown => {
  const record = (reply ?? {}) as StateReply;
  const bag = { ...record.resources, ...record.derives, ...record.slots };
  return path
    .split('.')
    .reduce<unknown>(
      (value, key) => (value as Map<string, unknown> | undefined)?.[key as never],
      bag,
    );
};

/** The replies of a drag's `during` reads, in order. */
const duringOf = (reply: unknown): ReadonlyArray<unknown> =>
  (reply as { during?: ReadonlyArray<unknown> } | undefined)?.during ?? [];

/** The ids of the nodes under the one whose testId is `id`, from a `tree` reply. */
const under = (reply: unknown, id: string) => {
  const nodes = (reply as { nodes?: ReadonlyArray<TreeNode> } | undefined)?.nodes ?? [];
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const found = new Set<number>();
  const take = (at: number) => {
    if (found.has(at)) return;
    found.add(at);
    for (const child of byId.get(at)?.children ?? []) take(child);
  };
  for (const node of nodes) if (node.props?.testId === id) take(node.id);
  return found;
};

const findingsOf = (reply: unknown): ReadonlyArray<Finding> =>
  (
    (reply as { check?: ReadonlyArray<{ findings?: ReadonlyArray<Finding> }> } | undefined)
      ?.check ?? []
  ).flatMap((run) => run.findings ?? []);

/** Each numeric count a `perf` reply's sites carry, summed by its name. */
const workOf = (reply: unknown) => {
  const sum: Record<string, number> = {};
  const sites = (reply as { sites?: ReadonlyArray<object> } | undefined)?.sites ?? [];
  for (const site of sites)
    for (const [key, value] of Object.entries(site))
      if (typeof value === 'number' && key !== 'site') sum[key] = (sum[key] ?? 0) + value;
  return sum;
};

const playing = [
  'clock data',
  'tap gear',
  'clock settle',
  'tap settings-feel',
  'clock settle',
  'tap settings-done',
  'clock settle',
  'tap hymn-2',
  'clock settle',
  'clock data',
  'tap bar-sound',
  'clock settle',
  'clock data',
  'tap play',
  'clock data',
  'clock settle',
];

const named = await drive.launch(store('names'), [
  ...playing,
  'tree count-in',
  'clock +2500',
  'clock data',
  'tree sung-0',
  'tap hymn-words wheel 0 300',
  'clock data',
  'clock settle',
  'tree --ax resume-follow',
  'tap resume-follow',
  'clock data',
  'clock settle',
  'tap hymn-words drag 0 -48 press 400 from 200 300 mouse during "tree --ax reader-seek-status" "tree reader-seek" "state"',
  'clock data',
  'clock settle',
  'state',
]);
const count = JSON.stringify(named[playing.length] ?? '');
drive.check(
  'the count-in is a progress bar named "Count-in", read "Beat <k> of 4"',
  count.includes('progressbar') && count.includes('Count-in') && /Beat [1-4] of 4/u.test(count),
  count.slice(0, 600),
);
const sung = JSON.stringify(named[playing.length + 3] ?? '');
drive.check(
  'the sung line is current (its aria-selected is bound to the same condition)',
  /accessibilityCurrent"?\s*:\s*"true"/iu.test(sung),
  sung.slice(0, 600),
);
const resume = axAt(named, 'resume-follow');
drive.check(
  'a wheel shows the button "Resume follow"',
  resume?.name === 'Resume follow' && resume.role === 'button',
  resume,
);
const [statusTree, onlyTree, held] = duringOf(named.at(-4));
const status = axAt([statusTree], 'reader-seek-status');
const said = slotOf(held, 'followNow.holdSaid');
drive.check(
  'the held choice is said on the status line as the current SeekStatus says it',
  typeof said === 'string' &&
    said.startsWith('Line ') &&
    JSON.stringify(status ?? {}).includes(said),
  { status, said },
);
drive.check(
  'on hymn 2, whose words’ times are read at its first use, the hold chooses a word and "Line timing only" does not show',
  Number(slotOf(held, 'followNow.holdWord')) >= 0 &&
    JSON.stringify(onlyTree ?? '').includes('reader-seek-marker') &&
    !JSON.stringify(onlyTree ?? '').includes('Line timing only'),
  { word: slotOf(held, 'followNow.holdWord'), tree: JSON.stringify(onlyTree ?? '').slice(0, 300) },
);
const after = named.at(-1);
drive.check(
  'after the lift the page is still hymn 2, and the player sings a line on',
  slotOf(after, 'hymnOpen') === '2' && Number(slotOf(after, 'player.at')) > 28.4,
  { open: slotOf(after, 'hymnOpen'), at: slotOf(after, 'player.at') },
);

const whole = await drive.launch(store('whole'), [
  'clock data',
  'tap gear',
  'clock settle',
  'tap settings-feel',
  'clock settle',
  'tap settings-done',
  'clock settle',
  'tap find-search',
  'clock settle',
  'clock data',
  'type search 663',
  'clock settle',
  'clock data',
  'tap hymn-663',
  'clock settle',
  'clock data',
  'tap bar-sound',
  'clock settle',
  'clock data',
  'tap play',
  'clock data',
  'clock settle',
  'clock +2500',
  'clock data',
  'tap hymn-words drag 0 -48 press 400 from 200 300 mouse during "tree reader-seek-line-only" "state"',
]);
const [wholeTree, wholeHeld] = duringOf(whole.at(-1));
drive.check(
  '"Line timing only" shows on a line timed whole (hymn 663, which the current hymnal times by lines alone)',
  slotOf(wholeHeld, 'followNow.holding') === true &&
    JSON.stringify(wholeTree ?? '').includes('Line timing only'),
  {
    holding: slotOf(wholeHeld, 'followNow.holding'),
    tree: JSON.stringify(wholeTree ?? '').slice(0, 300),
  },
);

const FAR = 7;
const reduced = await drive.launch(store('reduced'), [
  'prefer prefers-reduced-motion reduce',
  'clock settle',
  ...playing,
  'tree count-in-mark',
  'clock +2500',
  'clock data',
  'clock +52000',
  'clock data',
  'clock settle',
  'state',
  `layout sung-${FAR}`,
  `layout sung-${FAR + 1}`,
  'layout hymn-words',
]);
const marks = JSON.stringify(
  reduced.find((reply) => JSON.stringify(reply ?? '').includes('count-in-mark')) ?? '',
);
drive.check(
  'under Reduce Motion no count-in mark pulses',
  marks.length > 2 && !marks.includes('hy-pulse'),
  marks.slice(0, 400),
);
const far = slotOf(reduced.at(-4), 'followNow.line');
const [line, page] = [boxOf(reduced.at(far === FAR ? -3 : -2)), boxOf(reduced.at(-1))];
const third = line !== undefined && page !== undefined ? (line.y - page.y) / page.h : Number.NaN;
drive.check(
  `under Reduce Motion sung line ${FAR} or ${FAR + 1} stands a third of the way down at once`,
  (far === FAR || far === FAR + 1) && Math.abs(third - 1 / 3) < 0.02,
  { line, page, third, sung: far },
);

const largest = await drive.launch(store('largest'), [
  `prefer root-font-size ${LARGEST}`,
  'clock settle',
  ...playing,
  'clock +2500',
  'clock data',
  'tap bar-title',
  'clock settle',
  'tap dial-size-stop-7',
  'clock data',
  'clock settle',
  'tap player-title',
  'clock data',
  'clock settle',
  'clock +6300',
  'clock data',
  'clock settle',
  'layout sung-1',
  'layout hymn-words',
  'tree',
  'check',
]);
const [big, words] = [boxOf(largest.at(-4)), boxOf(largest.at(-3))];
const inPage = under(largest.at(-2), 'hymn-words');
const clipped = findingsOf(largest.at(-1)).filter(
  (finding) => finding.kind === 'clipped' && inPage.has(finding.id),
);
drive.check(
  'at the largest text and Reading size the sung line’s top is in the page, nothing in it clipped',
  big !== undefined &&
    words !== undefined &&
    big.y >= words.y &&
    big.y < words.y + words.h &&
    clipped.length === 0,
  { big, words, clipped },
);

const worked = await drive.launch(store('work'), [
  ...playing,
  'clock +2500',
  'clock data',
  'state',
  'perf hymn-words',
  'clock +10000',
  'clock data',
  'perf hymn-words',
  'state',
]);
const [before, done] = [workOf(worked.at(-5)), workOf(worked.at(-2))];
const work = Object.fromEntries(
  Object.entries(done).map(([key, value]) => [key, value - (before[key] ?? 0)]),
);
const answers =
  (Number(slotOf(worked.at(-1), 'followNow.serial')) -
    Number(slotOf(worked.at(-6), 'followNow.serial'))) /
  10;
console.log(`ten seconds of play, the work under hymn-words: ${JSON.stringify(work)}`);
console.log(`the data module's follow answers per second: ${answers}`);
drive.check(
  'ten seconds of play move the line on, the follow answering a few times a second',
  slotOf(worked.at(-1), 'followNow.line') === 1 && answers > 0 && answers < 30,
  { answers, line: slotOf(worked.at(-1), 'followNow.line') },
);

const frames = await drive.launch(store('frames'), [
  ...playing,
  'clock +2500',
  'clock data',
  'perf frames health scroll during "clock +10000" "clock data"',
]);
console.log(
  `ten seconds of play, the frames: ${JSON.stringify(frames.at(-1) ?? '').slice(0, 800)}`,
);

process.exit(drive.finish());
