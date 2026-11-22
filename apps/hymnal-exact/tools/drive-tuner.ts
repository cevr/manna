/* oxlint-disable effect/noNodeBuiltinImport, effect/noGlobals, effect/noAs, effect/noNullish, effect/noAsyncFunction, effect/noUnknownParameters, effect/noTernary -- a host script that drives the built app through `bun run exact agent` and reads its untyped JSON replies by the fields it checks. */

/**
 * The tuner's live checks a `.test.contract` cannot hold: what the screen
 * reader is given, how often the reading's words change, the largest text
 * and Reduce Motion. Through `@manna/exact-kit/drive` on the host named
 * (`bun tools/drive-tuner.ts web|ios`), the microphone granted and the ear
 * fed a low E 12 cents flat (the current app's `?feed=`), never a real
 * microphone:
 *
 * - `tree --ax`: Done is a button named Done, Auto a switch, checked; the
 *   six strings are buttons named as the current app's `stringLabel` names
 *   them; the reading is one status node, named the current app's
 *   `labelOf` of the tone once its first label has passed; the hint is the
 *   current app's `hintOf`;
 * - a string picked is selected, Auto unchecked, and its hint the current
 *   app's `BACK_TO_AUTO` (the web's `aria-description`);
 * - the reading's name changes at most once a `LABEL_EVERY`, read every
 *   250 ms of the agent's clock over three seconds after a pick changes
 *   its words;
 * - at the largest text (the web's root font at 53 px) the six strings,
 *   Done and the reading are still there, and Done's box is still a
 *   target;
 * - under Reduce Motion the needle still stands where the reading puts it.
 *
 * Exits 1 on any failed check.
 */

import { join } from 'node:path';

import { makeDrive } from '@manna/exact-kit/drive';

import { BACK_TO_AUTO, LABEL_EVERY } from '@manna/hymnal-app/tuner/screen';
import {
  hintOf,
  labelOf,
  needleOf,
  NEEDLE_CENTS,
  stringLabel,
} from '@manna/hymnal-app/tuner/session';
import { readingOn, STRINGS, type StringId } from '@manna/hymnal-app/tuner/tuning';

const host = process.argv[2] ?? 'web';
const drive = makeDrive({ name: 'drive-tuner', host, appDir: join(import.meta.dir, '..') });

interface AxElement {
  readonly role?: string;
  readonly name?: string;
  readonly description?: string;
  readonly testId?: string;
  readonly states?: { readonly checked?: boolean; readonly selected?: boolean };
  readonly frame?: { readonly w: number; readonly h: number };
}

/** The accessibility elements a `tree --ax` reply holds. */
const elementsOf = (reply: unknown): ReadonlyArray<AxElement> =>
  (reply as { ax?: { elements?: ReadonlyArray<AxElement> } } | undefined)?.ax?.elements ?? [];

/** The element of `testId` in a `tree --ax` reply. */
const byId = (reply: unknown, testId: string) =>
  elementsOf(reply).find((element) => element.testId === testId && element.role !== 'StaticText');

/** The words a `tree --ax` reply's node of `testId` shows. */
const wordsOf = (reply: unknown, testId: string) =>
  elementsOf(reply).find((element) => element.testId === testId && element.role === 'StaticText')
    ?.name;

const FED: StringId = 'E2';
const CENTS = -12;
const hzOf = (string: StringId, cents: number) =>
  (STRINGS.find((each) => each.id === string)?.hz ?? 0) * 2 ** (cents / 1200);
const heard = { _tag: 'Some', value: readingOn(hzOf(FED, CENTS), FED) } as Parameters<
  typeof labelOf
>[0];
const auto = { _tag: 'None' } as Parameters<typeof hintOf>[0];

const store = (name: string) => `tuner-${name}-${host}-${Date.now().toString(36)}`;
const flags = ['--permission', 'microphone=granted'];
const open = [`type root /tuner?feed=${FED}:${CENTS}`, 'clock settle', 'clock data'];
const launch = (name: string, ops: ReadonlyArray<string>) =>
  drive.run([...flags, '--storage', store(name), '--reset-storage'], ops);

const named = await launch('names', [
  ...open,
  `clock +${LABEL_EVERY + 400}`,
  'clock data',
  'tree --ax',
  'tap tuner-string-A2',
  'clock settle',
  'tree --ax',
]);
const [first, picked] = [named[open.length + 2], named[open.length + 5]];
const done = byId(first, 'tuner-done');
const switched = byId(first, 'tuner-auto');
drive.check(
  'Done is a button named Done, and Auto a switch named Auto, checked',
  done?.role === 'button' &&
    done.name === 'Done' &&
    switched?.role === 'switch' &&
    switched.name === 'Auto' &&
    switched.states?.checked === true,
  { done, switched },
);
const strings = STRINGS.map(({ id }) => byId(first, `tuner-string-${id}`));
drive.check(
  'the six strings are buttons named as the current app names them',
  strings.every(
    (element, at) =>
      element?.role === 'button' && element.name === stringLabel(STRINGS[at]?.id ?? FED, false),
  ),
  strings,
);
const reading = byId(first, 'tuner-reading');
drive.check(
  'the reading is one status node named the current app’s label of the tone',
  reading?.role === 'status' && reading.name === labelOf(heard),
  { reading, want: labelOf(heard) },
);
drive.check('the hint is the current app’s', wordsOf(first, 'tuner-hint') === hintOf(auto, heard), {
  got: wordsOf(first, 'tuner-hint'),
  want: hintOf(auto, heard),
});
const a = byId(picked, 'tuner-string-A2');
drive.check(
  'a picked string is selected, its hint Goes back to Auto, and Auto unchecked',
  a?.states?.selected === true &&
    a.description === BACK_TO_AUTO &&
    byId(picked, 'tuner-auto')?.states?.checked === false,
  { a, auto: byId(picked, 'tuner-auto') },
);

const STEP = 250;
const samples = Array.from({ length: 12 }, () => [`clock +${STEP}`, 'state tunerLabel']).flat();
const paced = await launch('rate', [
  ...open,
  `clock +${LABEL_EVERY + 400}`,
  'tap tuner-string-A2',
  ...samples,
]);
const labels = paced
  .slice(open.length + 2)
  .filter((_, at) => at % 2 === 1)
  .map((reply) => String(reply));
const changes = labels.flatMap((label, at) =>
  at > 0 && label !== labels[at - 1] ? [at * STEP] : [],
);
drive.check(
  'the reading’s name changes, and at most once a LABEL_EVERY',
  changes.length > 0 &&
    changes.every((at, k) => k === 0 || at - (changes[k - 1] ?? 0) >= LABEL_EVERY),
  { labels, changes },
);

const largest = await launch('largest', [
  'prefer root-font-size 53',
  'clock settle',
  ...open,
  'tree --ax',
]);
const big = largest[open.length + 2];
const bigDone = byId(big, 'tuner-done');
drive.check(
  'at the largest text the six strings, Done and the reading are there, Done still a target',
  STRINGS.every(({ id }) => byId(big, `tuner-string-${id}`) !== undefined) &&
    byId(big, 'tuner-reading') !== undefined &&
    (bigDone?.frame?.w ?? 0) >= 24 &&
    (bigDone?.frame?.h ?? 0) >= 24,
  { done: bigDone, strings: STRINGS.map(({ id }) => byId(big, `tuner-string-${id}`)?.frame) },
);

const still = await launch('still', [
  'prefer prefers-reduced-motion reduce',
  'clock settle',
  ...open,
  `clock +${LABEL_EVERY}`,
  'clock data',
  'state tunerShown.swing',
]);
const swing = still[open.length + 4];
const want = (needleOf(heard) / NEEDLE_CENTS) * 50;
drive.check(
  'under Reduce Motion the needle stands where the reading puts it',
  Math.abs(Number(swing ?? Number.NaN) - want) < 0.01,
  { swing, want },
);

process.exit(drive.finish());
