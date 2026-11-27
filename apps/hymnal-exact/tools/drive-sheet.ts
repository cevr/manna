/* oxlint-disable effect/noNodeBuiltinImport, effect/noGlobals, effect/noAs, effect/noNullish, effect/noAsyncFunction, effect/noUnknownParameters, effect/noTernary, node/no-process-env -- a host script that drives the built app through `bun run exact agent`, reads its untyped JSON replies by the fields it checks, and loads Exact's own accept matcher from the clone `EXACT` names, as the wrapper does. */

/**
 * The player sheet's live checks a `.test.contract` cannot hold: the names
 * the screen reader is given, the page's drawn lines, the largest text and
 * Reduce Motion. Through `@manna/exact-kit/drive` on the host named
 * (`bun tools/drive-sheet.ts web|ios`), on hymn 7 playing with its sheet
 * open:
 *
 * - the sheet's title carries the current FullPlayer's hint "Opens the
 *   hymn's page.", and Reading is the current ReadingSheet's: a group named
 *   "Reading", the dial "Text size" whose value is One's `shareOf` of the
 *   kept step, radio groups "Font" and "Line spacing" whose rows are named
 *   by One's `fontChoices` and `spacingChoices` with the kept one checked,
 *   and a switch "Keep screen on" (`tree --ax`, `tree`);
 * - the group "Recording" holds the title, what is said, the position with
 *   its two times and the play buttons, and nothing else; the Tempo dial,
 *   the group "Stanzas" (its "Go to" row in it), the group "Start", "Chord
 *   settings" and "Reading" follow it as its siblings, in the current
 *   FullPlayer.tsx's order (`tree --ax`);
 * - the first stanza line of the shown page and of the pager's next page,
 *   drawn behind the sheet, grow as the current `readingStyle`'s line
 *   height does, from step 2 to step 5 and then from Normal to Roomy
 *   spacing (their heights' ratios One's within 2%, a line that wraps
 *   counted by its rows), and the shown line
 *   stays where it stood across the page (no jump of the pager, `layout`);
 * - at the largest system text with the largest Reading size, no node of
 *   the sheet is clipped or spills (`check`), every finding on the size
 *   dial's stops is one `app.json` accepts (by Exact's own matcher), and
 *   the sheet scrolls to its last row, Keep screen on, which a tap turns on;
 * - with Reduce Motion on the sheet opens and its choices turn the page.
 *
 * Exits 1 on any failed check.
 */

import { homedir } from 'node:os';
import { join } from 'node:path';

import { defaultReading, readingStyle } from '@manna/hymnal-app/reader/reading';
import { fontChoices, shareOf, spacingChoices } from '@manna/hymnal-app/reader/reading-choices';
import { makeDrive } from '@manna/exact-kit/drive';

const host = process.argv[2] ?? 'web';
const drive = makeDrive({ name: 'drive-sheet', host, appDir: join(import.meta.dir, '..') });
const store = (name: string) => `sheet-${name}-${host}-${Date.now().toString(36)}`;
const LARGEST = 53;

interface Ax {
  readonly i?: number;
  readonly parent?: number;
  readonly via?: string;
  readonly testId?: string;
  readonly role?: string;
  readonly name?: string;
  readonly description?: string;
  readonly states?: { readonly checked?: boolean };
}

interface Box {
  readonly x: number;
  readonly h: number;
}

interface TreeNode {
  readonly id: number;
  readonly props?: { readonly testId?: string; readonly accessibilityValueText?: string };
  readonly children?: ReadonlyArray<number>;
}

interface Finding {
  readonly kind: string;
  readonly id: number;
}

/** The elements of a `tree --ax` reply. */
const axOf = (reply: unknown): ReadonlyArray<Ax> | undefined =>
  (reply as { ax?: { elements?: ReadonlyArray<Ax> } } | undefined)?.ax?.elements;

/** The element the id names, in the first `tree --ax` reply that has it. */
const axAt = (replies: ReadonlyArray<unknown>, id: string): Ax | undefined =>
  replies.flatMap((reply) => axOf(reply) ?? []).find((element) => element.testId === id);

/** The node box of each `layout` reply, in order. */
const boxesOf = (replies: ReadonlyArray<unknown>): ReadonlyArray<Box> =>
  replies.flatMap((reply) => {
    const seen = (
      reply as { node?: { space?: { viewport?: { x: number; h: number } } } } | undefined
    )?.node?.space?.viewport;
    return seen === undefined ? [] : [{ x: seen.x, h: seen.h }];
  });

/** The nodes of each `tree` reply, in order. */
const treesOf = (replies: ReadonlyArray<unknown>): ReadonlyArray<ReadonlyArray<TreeNode>> =>
  replies.flatMap((reply) => {
    const nodes = (reply as { nodes?: ReadonlyArray<TreeNode> } | undefined)?.nodes;
    return nodes === undefined ? [] : [nodes];
  });

/** The findings of each `check` reply, flattened. */
const findingsOf = (replies: ReadonlyArray<unknown>): ReadonlyArray<Finding> =>
  replies.flatMap((reply) =>
    (
      (reply as { check?: ReadonlyArray<{ findings?: ReadonlyArray<Finding> }> } | undefined)
        ?.check ?? []
    ).flatMap((run) => run.findings ?? []),
  );

/** The ids of the node whose testId is `id` and of every node under it. */
const under = (nodes: ReadonlyArray<TreeNode>, id: string) => {
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

const opened = [
  'clock data',
  'tap gear',
  'clock settle',
  'tap settings-feel',
  'clock settle',
  'tap settings-done',
  'clock settle',
  'tap hymn-7',
  'clock settle',
  'clock data',
  'tap play',
  'clock data',
  'clock settle',
  'tap bar-title',
  'clock settle',
  'clock data',
];
const lines = ['layout line-stanza-1-1', 'layout line-stanza-1-1-8'];
const named = await drive.launch(store('names'), [
  ...opened,
  'tree --ax player-title',
  'tree --ax reading',
  'tree --ax player',
  'tree dial-size-value',
  ...lines,
  'tap dial-size-stop-5',
  'clock data',
  'clock settle',
  'tree dial-size-value',
  ...lines,
  'tap reading-spacing-roomy',
  'clock data',
  'clock settle',
  ...lines,
]);

const hint = axAt(named, 'player-title');
drive.check(
  'the sheet’s title carries the current hint "Opens the hymn’s page."',
  hint?.description === 'Opens the hymn’s page.' || hint?.description === "Opens the hymn's page.",
  hint,
);
const group = axAt(named, 'reading');
drive.check('Reading is a group named "Reading"', group?.name === 'Reading', group);
const size = axAt(named, 'dial-size-value');
drive.check('its dial is named "Text size"', size?.name === 'Text size', size);
const values = treesOf(named).map((nodes) => nodes[0]?.props?.accessibilityValueText);
drive.check(
  'the dial’s value is the current share of the kept step, at step 2 and step 5',
  values[0] === shareOf(2) && values[1] === shareOf(5),
  values,
);
for (const [id, label, rows, kept] of [
  ['reading-font', 'Font', fontChoices, 'system'],
  ['reading-spacing', 'Line spacing', spacingChoices, 'normal'],
] as const) {
  const choices = axAt(named, id);
  drive.check(`"${label}" is a radio group named so`, choices?.name === label, choices);
  for (const row of rows) {
    const at = axAt(named, `${id}-${row.value}`);
    drive.check(
      `its row ${row.value} is a radio named "${row.label}", checked when kept`,
      at?.role === 'radio' &&
        at.name === row.label &&
        (at.states?.checked === true) === (row.value === kept),
      at,
    );
  }
}
const awake = axAt(named, 'reading-awake');
drive.check(
  'Keep screen on is a switch named so',
  awake?.name === 'Keep screen on' && (awake.role === 'switch' || awake.role === 'checkbox'),
  awake,
);

const whole = named.map(axOf).findLast((elements) => elements?.some((e) => e.testId === 'player'));
const own = (whole ?? []).filter((element) => element.via === 'self');
const recording = own.find((element) => element.role === 'group' && element.name === 'Recording');
const ancestors = (element: Ax): ReadonlyArray<number> => {
  const up = own.find((each) => each.i === element.parent);
  return up === undefined ? [] : [up.i ?? -1, ...ancestors(up)];
};
const inRecording = new Set(
  own
    .filter(
      (element) => element.testId !== undefined && ancestors(element).includes(recording?.i ?? -1),
    )
    .map((element) => element.testId),
);
const RECORDING = ['player-title', 'player-said', 'position', 'elapsed', 'total', 'toggle'];
const RECORDING_MAY = ['sheet-page-play', 'retry', 'recording-key-fallback'];
drive.check(
  'the group "Recording" holds the title, what is said, the position, its two times and Play, and nothing else',
  recording !== undefined &&
    RECORDING.every((id) => inRecording.has(id)) &&
    [...inRecording].every(
      (id) => RECORDING.includes(id ?? '') || RECORDING_MAY.includes(id ?? ''),
    ),
  [...inRecording],
);
const siblings = ['dial-tempo', 'stanzas', 'start', 'chord-settings', 'reading'].map((id) =>
  own.find((element) => element.testId === id),
);
drive.check(
  'Tempo, "Stanzas", "Start", "Chord settings" and "Reading" follow "Recording" as its siblings, in the current order',
  recording !== undefined &&
    siblings.every((element) => element !== undefined && element.parent === recording.parent) &&
    [recording, ...siblings].every(
      (element, at, all) => at === 0 || (all[at - 1]?.i ?? Infinity) < (element?.i ?? -Infinity),
    ),
  siblings.map((element) => [element?.testId, element?.parent, element?.i]),
);
const stanzas = own.find((element) => element.testId === 'stanzas');
const goTo = own.find((element) => element.testId === 'stanza-place-1');
drive.check(
  'the port-only "Go to" row stays in the group "Stanzas"',
  stanzas?.name === 'Stanzas' && goTo !== undefined && ancestors(goTo).includes(stanzas.i ?? -1),
  goTo,
);

const lineOf = (step: number, spacing: 'normal' | 'roomy') =>
  readingStyle({ ...defaultReading, size: step, spacing }, 1).words.lineHeight;
const near = (got: number, want: number) => Math.abs(got / want - 1) < 0.02;
const [shownTwo, nextTwo, shownFive, nextFive, shownRoomy, nextRoomy] = boxesOf(named);
for (const [which, two, five, roomy] of [
  ['shown page', shownTwo, shownFive, shownRoomy],
  ['next page', nextTwo, nextFive, nextRoomy],
] as const) {
  const rows = (box: Box | undefined, step: number, spacing: 'normal' | 'roomy') =>
    Math.max(
      1,
      Math.round(
        (box?.h ?? Number.NaN) /
          ((two?.h ?? Number.NaN) * (lineOf(step, spacing) / lineOf(2, 'normal'))),
      ),
    );
  const grew = (five?.h ?? Number.NaN) / rows(five, 5, 'normal') / (two?.h ?? Number.NaN);
  const spaced =
    (roomy?.h ?? Number.NaN) /
    rows(roomy, 5, 'roomy') /
    ((five?.h ?? Number.NaN) / rows(five, 5, 'normal'));
  drive.check(
    `from step 2 to step 5 the ${which}’s line grows as the current line height does`,
    near(grew, lineOf(5, 'normal') / lineOf(2, 'normal')),
    { two, five, grew, want: lineOf(5, 'normal') / lineOf(2, 'normal') },
  );
  drive.check(
    `from Normal to Roomy spacing the ${which}’s line grows as the current line height does`,
    near(spaced, lineOf(5, 'roomy') / lineOf(5, 'normal')),
    { five, roomy, spaced, want: lineOf(5, 'roomy') / lineOf(5, 'normal') },
  );
}
drive.check(
  'the shown page’s line stays where it stood as Reading turns (no pager jump)',
  shownTwo !== undefined && shownTwo.x === shownFive?.x && shownTwo.x === shownRoomy?.x,
  { shownTwo, shownFive, shownRoomy },
);

const largest = await drive.launch(store('largest'), [
  `prefer root-font-size ${LARGEST}`,
  'clock settle',
  ...opened,
  'tap dial-size-stop-7',
  'clock data',
  'clock settle',
  'tree',
  'check',
  'tap reading-awake',
  'clock data',
  'clock settle',
  'state readingAwake',
]);
const sheet = under(treesOf(largest)[0] ?? [], 'player');
const spilled = findingsOf(largest).filter(
  (finding) => (finding.kind === 'clipped' || finding.kind === 'overflow') && sheet.has(finding.id),
);
drive.check(
  'at the largest text and Reading size no node of the sheet is clipped or spills',
  sheet.size > 0 && spilled.length === 0,
  { nodes: sheet.size, spilled },
);

/** Exact's own matcher of `verify.accept`, from the clone `bun run exact` runs. */
const { accepts } = (await import(
  join(process.env.EXACT ?? join(homedir(), 'Developer/vendor/exact'), 'scripts/agent-check.mjs')
)) as {
  accepts: (
    entries: ReadonlyArray<{ finding: string; node: string }>,
    finding: Finding,
    nodes: ReadonlyMap<number, TreeNode>,
  ) => unknown;
};
const listed = (
  (await Bun.file(join(import.meta.dir, '..', 'app.json')).json()) as {
    verify: { accept: ReadonlyArray<{ finding: string; node: string }> };
  }
).verify.accept;
/** Every finding of each `check` reply, those the agent counts and those it took as accepted. */
const judgedOf = (replies: ReadonlyArray<unknown>): ReadonlyArray<Finding> =>
  replies.flatMap((reply) =>
    (
      (
        reply as
          | {
              check?: ReadonlyArray<{
                findings?: ReadonlyArray<Finding>;
                accepted?: ReadonlyArray<Finding>;
              }>;
            }
          | undefined
      )?.check ?? []
    ).flatMap((run) => [...(run.findings ?? []), ...(run.accepted ?? [])]),
  );
/** The phone size `exact verify web` reads the largest text at (its `WEB_SIZES[0]`), where the dial's end stops lie across its edge. */
const VERIFY_SIZE = '390x844';
const sized = await drive.run(
  ['--storage', store('largest-size'), '--reset-storage', '--size', VERIFY_SIZE],
  [
    `prefer root-font-size ${LARGEST}`,
    'clock settle',
    ...opened,
    `tap dial-size-stop-${defaultReading.size}`,
    'clock data',
    'clock settle',
    'tree',
    'check',
  ],
);
const largestNodes = new Map((treesOf(sized)[0] ?? []).map((node) => [node.id, node]));
const sizeShown = [...largestNodes.values()].some((node) => node.props?.testId === 'dial-size');
const onSizeStops = judgedOf(sized).filter((finding) =>
  (largestNodes.get(finding.id)?.props?.testId ?? '').startsWith('dial-size-stop-'),
);
const sizeUnaccepted = onSizeStops.filter(
  (finding) => accepts(listed, finding, largestNodes) === undefined,
);
drive.check(
  'at the largest text, with the Reading size dial shown, every finding on its stops is one app.json accepts, as the key, capo and tempo dials’ are',
  sizeShown && onSizeStops.length > 0 && sizeUnaccepted.length === 0,
  { shown: sizeShown, found: onSizeStops.length, unaccepted: sizeUnaccepted },
);
drive.check(
  'at the largest text the sheet scrolls to Keep screen on, which a tap turns on',
  largest.at(-1) === true,
  largest.at(-1),
);

const reduced = await drive.launch(store('reduced'), [
  'prefer prefers-reduced-motion reduce',
  'clock settle',
  ...opened,
  'tree --ax reading',
  'tap reading-font-serif',
  'clock data',
  'state readingFont',
]);
drive.check(
  'with Reduce Motion on the sheet opens and Font turns the page',
  axAt(reduced, 'reading')?.name === 'Reading' && reduced.at(-1) === 'serif',
  reduced.at(-1),
);

process.exit(drive.finish());
