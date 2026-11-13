/* oxlint-disable effect/noAsyncFunction, effect/noNullish, no-await-in-loop -- a React screen test: it drives the root rig's promise-based taps one after another, each turn waiting on the last, and reads nodes whose absent attributes are null. */

/**
 * Move back a stage as a reader meets it, through the root rig
 * (`src/test/root-rig.tsx`, every frame held to the root's rules): the
 * passage an ear on the disk, a tap on its plant on home opens Today on it
 * with `Move back a stage` in the footer, outside the scroll view; the ask
 * names the verse and the stage below, `Keep` drops it, `Move back` writes
 * one step back and the stage line, the moved line and home's plant say the
 * lower stage, and a relaunch reads it back. A refused write leaves the
 * alert and the stage; a seed offers no control; the plan's own item
 * (Today by `Start`) offers none; a recital waiting for `Next` hides it (no
 * step back can land under a recall not yet written, and the root's rule
 * faults any frame with it beside `Listening`, `Next` or the grades), and
 * after `Your field` it shows again on the unchanged stage; two taps of the ask's `Move back` in one
 * turn move the verse once, with no alert.
 */

import { expect, it } from 'bun:test';
import { act } from 'react';
import passage from 'virtual:heartseed-passage';

import { START } from '../test/clock';
import { below, DAY, MINUTE, random } from '../test/garden-model';
import {
  launchRoot,
  recordOf,
  rootDevice,
  textOf,
  type RootDevice,
  type RootLaunch,
} from '../test/root-rig';

/** The passage an ear: Good at planting, a day on, and ten minutes after that. */
const EAR = [
  recordOf(passage.reference, START - 3 * DAY),
  recordOf(passage.reference, START - 2 * DAY),
  recordOf(passage.reference, START - 2 * DAY + 10 * MINUTE),
] as const;

const one = (rig: RootLaunch, id: string) => rig.host.querySelector(`[data-testid="${id}"]`);

const stage = (rig: RootLaunch) => one(rig, 'stage')?.getAttribute('aria-label') ?? null;

/** Whether `node` lies inside a scroll view. */
const scrolled = (node: Element | null | undefined) => {
  for (let at = node?.parentElement; at !== null && at !== undefined; at = at.parentElement)
    if (/auto|scroll/.test(`${getComputedStyle(at).overflowY} ${getComputedStyle(at).overflow}`))
      return true;
  return false;
};

const backs = (disk: Map<string, string>) =>
  [...disk.keys()].filter((key) => key.startsWith(`heartseed/back/${passage.reference}/`));

/** From home, a tap on the passage's plant, named `<reference>, <stage>` (and `, ready today`), lands on Today on it. */
const openVerse = async (rig: RootLaunch, shown: string) => {
  expect(
    await rig.until(() =>
      rig.names().some((name) => name.startsWith(`${passage.reference}, ${shown}`)),
    ),
  ).toBe(true);
  const label = rig.names().find((name) => name.startsWith(`${passage.reference}, ${shown}`)) ?? '';
  await rig.tap(label);
  expect(await rig.until(() => rig.headings().join('|') === 'Today' && rig.has('Say it'))).toBe(
    true,
  );
};

it('moves a tapped ear back to a blade after the ask, kept through a relaunch, then to a seed, which offers no control', async () => {
  const device = rootDevice([...EAR]);
  const rig = await launchRoot(device, { now: START + DAY });
  await openVerse(rig, 'ear');
  expect([stage(rig), rig.has('Move back a stage')]).toEqual(['Stage: ear', true]);
  const control = rig.host.querySelector('[aria-label="Move back a stage"]');
  expect(scrolled(control)).toBe(false);

  await rig.tap('Move back a stage');
  expect(await rig.until(() => one(rig, 'back-ask') !== null)).toBe(true);
  expect([
    textOf(one(rig, 'back-ask')),
    rig.has('Move back'),
    rig.has('Keep'),
    rig.has('Move back a stage'),
  ]).toEqual([
    `Move ${passage.reference} back to a blade? It comes due again soon.`,
    true,
    true,
    false,
  ]);
  await rig.tap('Keep');
  expect(await rig.until(() => rig.has('Move back a stage'))).toBe(true);
  expect([one(rig, 'back-ask'), backs(device.disk), stage(rig)]).toEqual([null, [], 'Stage: ear']);

  await rig.tap('Move back a stage');
  await rig.tap('Move back');
  expect(await rig.until(() => stage(rig) === 'Stage: blade')).toBe(true);
  expect(await rig.until(() => one(rig, 'moved') !== null)).toBe(true);
  expect([
    textOf(one(rig, 'moved')),
    rig.has('Move back a stage'),
    backs(device.disk).length,
  ]).toEqual(['Moved back to a blade.', true, 1]);

  await rig.tap('Your field');
  expect(
    await rig.until(() =>
      rig.names().some((name) => name.startsWith(`${passage.reference}, blade`)),
    ),
  ).toBe(true);
  expect(rig.faults).toEqual([]);
  await rig.leave();

  const again = await launchRoot(device, { now: START + DAY + MINUTE });
  await openVerse(again, 'blade');
  expect(stage(again)).toBe('Stage: blade');
  await again.tap('Move back a stage');
  await again.tap('Move back');
  expect(await again.until(() => stage(again) === 'Stage: seed')).toBe(true);
  expect(await again.until(() => one(again, 'moved') !== null)).toBe(true);
  expect([
    textOf(one(again, 'moved')),
    again.has('Move back a stage'),
    backs(device.disk).length,
  ]).toEqual(['Moved back to a seed.', false, 2]);
  expect(again.faults).toEqual([]);
  await again.leave();
});

it('leaves the alert and the stage when the write is refused, and offers nothing on the plan’s own item', async () => {
  const device = rootDevice([...EAR]);
  const rig = await launchRoot(device, { now: START + DAY });
  await openVerse(rig, 'ear');
  device.refuse = 1;
  await rig.tap('Move back a stage');
  await rig.tap('Move back');
  expect(await rig.until(() => one(rig, 'back-alert') !== null)).toBe(true);
  expect([
    textOf(one(rig, 'back-alert')),
    stage(rig),
    backs(device.disk),
    rig.has('Move back a stage'),
  ]).toEqual([`${passage.reference} was not moved back. Try again.`, 'Stage: ear', [], true]);
  expect(rig.faults).toEqual([]);
  await rig.leave();

  const due = await launchRoot(rootDevice([...EAR]), { now: START + 30 * DAY });
  expect(await due.until(() => due.has('Start'))).toBe(true);
  await due.tap('Start');
  expect(await due.until(() => due.headings().join('|') === 'Today' && due.has('Say it'))).toBe(
    true,
  );
  expect([due.references(), due.has('Move back a stage')]).toEqual([[passage.reference], false]);
  expect(due.faults).toEqual([]);
  await due.leave();
});

it('hides Move back a stage while a recital waits for Next, and offers it again on the unchanged stage after Your field', async () => {
  const device = rootDevice([...EAR]);
  const recalls = () =>
    [...device.disk.keys()].filter((key) => key.startsWith('heartseed/recall/'));
  const before = recalls();
  const rig = await launchRoot(device, { now: START + DAY });
  await openVerse(rig, 'ear');
  expect(rig.has('Move back a stage')).toBe(true);
  await rig.tap('Say it');
  expect(await rig.until(() => rig.has('Listening'))).toBe(true);
  await rig.tap('Listening');
  expect(await rig.until(() => rig.has('Next'))).toBe(true);
  expect([rig.has('Move back a stage'), one(rig, 'back-ask')]).toEqual([false, null]);
  await rig.tap('Your field');
  await openVerse(rig, 'ear');
  expect([stage(rig), rig.has('Move back a stage'), backs(device.disk), recalls()]).toEqual([
    'Stage: ear',
    true,
    [],
    before,
  ]);
  expect(rig.faults).toEqual([]);
  await rig.leave();
});

/** A turn's taps of the ask, all delivered before the screen draws again: `Move back` once or twice, `Move back` then `Keep`, or `Keep`. */
type Answer = 'once' | 'twice' | 'then-keep' | 'keep';

/** What the ask's first save does: lands, is refused, or takes a while before it lands or is refused. */
type Save = 'ok' | 'refused' | 'slow' | 'slow-refused';

/** One ask: the reader's taps and its first save. */
interface Ask {
  readonly answer: Answer;
  readonly save: Save;
}

const ANSWERS: readonly Answer[] = ['once', 'twice', 'then-keep', 'keep'];
const SAVES: readonly Save[] = ['ok', 'refused', 'slow', 'slow-refused'];
const LADDER = ['ear', 'blade', 'seed'] as const;
const NAMED = { ear: 'an ear', blade: 'a blade', seed: 'a seed' } as const;

/** The asks of run `seed`: two to four, each answer and save drawn at random. */
const asksOf = (seed: number): readonly Ask[] => {
  const next = random(seed * 7919 + 13);
  return Array.from({ length: 2 + below(next, 3) }, () => ({
    answer: ANSWERS[below(next, ANSWERS.length)] ?? 'once',
    save: SAVES[below(next, SAVES.length)] ?? 'ok',
  }));
};

/** Every run: the probe (two presses, the first save refused, then `Try again` that lands), then generated ones. */
const RUNS: readonly (readonly Ask[])[] = [
  [
    { answer: 'twice', save: 'refused' },
    { answer: 'once', save: 'ok' },
  ],
  [
    { answer: 'then-keep', save: 'slow' },
    { answer: 'twice', save: 'slow-refused' },
  ],
  ...Array.from({ length: 5 }, (_, k) => asksOf(k + 1)),
];

const click = (node: Element | null | undefined) =>
  node?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));

/** What an ask leaves when its first save `save` is its only save: a step back and its line, or the alert. */
const LEFT: Readonly<Record<Save, 'moved' | 'alert'>> = {
  ok: 'moved',
  refused: 'alert',
  slow: 'moved',
  'slow-refused': 'alert',
};

/** The records an ask should write, and the line and alert Today should then show, the verse standing at `stored`. */
const expectedOf = (ask: Ask, stored: (typeof LADDER)[number]) => {
  if (ask.answer === 'keep') return { wrote: 0, moved: '', alert: '' };
  if (LEFT[ask.save] === 'alert')
    return { wrote: 0, moved: '', alert: `${passage.reference} was not moved back. Try again.` };
  return { wrote: 1, moved: `Moved back to ${NAMED[stored]}.`, alert: '' };
};

/** Whether a step back is still running: one of the control's taps shows as disabled. */
const answering = (rig: RootLaunch) =>
  ['Move back', 'Keep', 'Move back a stage'].some(
    (label) =>
      rig.host.querySelector(`[aria-label="${label}"]`)?.getAttribute('aria-disabled') === 'true',
  );

/** Opens an ask, delivers its taps in one turn with its first save set, waits for every save to settle, and gives what the disk and Today then hold. */
const answerAsk = async (rig: RootLaunch, device: RootDevice, ask: Ask) => {
  expect(await rig.until(() => one(rig, 'back-ask') !== null)).toBe(true);
  const before = backs(device.disk).length;
  device.refuse = Number(ask.save.endsWith('refused'));
  device.slow = Number(ask.save.startsWith('slow'));
  const confirm = one(rig, 'back-ask')?.parentElement?.querySelector('[aria-label="Move back"]');
  const keep = rig.host.querySelector('[aria-label="Keep"]');
  await act(async () => {
    if (ask.answer !== 'keep') click(confirm);
    if (ask.answer === 'twice') click(confirm);
    if (ask.answer === 'then-keep' || ask.answer === 'keep') click(keep);
  });
  expect(await rig.until(() => !answering(rig) && one(rig, 'back-ask') === null)).toBe(true);
  expect(await rig.until(() => false, 30)).toBe(false);
  device.refuse = 0;
  device.slow = 0;
  const stored = LADDER[backs(device.disk).length] ?? 'seed';
  return {
    stored,
    seen: {
      wrote: backs(device.disk).length - before,
      moved: textOf(one(rig, 'moved')),
      alert: textOf(one(rig, 'back-alert')),
      stage: stage(rig),
    },
  };
};

it('moves the verse at most one stage per ask, whatever its taps and saves, and always says what was saved', async () => {
  const kinds = new Set<string>();
  for (const asks of RUNS) {
    const device = rootDevice([...EAR]);
    const time = { now: START + DAY };
    const rig = await launchRoot(device, time);
    await openVerse(rig, 'ear');
    for (const ask of asks) {
      if (!(await rig.tap('Move back a stage'))) break;
      const { stored, seen } = await answerAsk(rig, device, ask);
      time.now += MINUTE;
      kinds.add(`${ask.answer}/${ask.save}`);
      expect({ ask, ...seen }).toEqual({
        ask,
        ...expectedOf(ask, stored),
        stage: `Stage: ${stored}`,
      });
    }
    expect(rig.faults).toEqual([]);
    await rig.leave();
  }
  expect(
    ['twice/refused', 'twice/slow-refused', 'then-keep/slow'].filter((kind) => !kinds.has(kind)),
  ).toEqual([]);
});

it('moves the verse once for two taps of the ask’s Move back in one turn, with no alert', async () => {
  const device = rootDevice([...EAR]);
  const rig = await launchRoot(device, { now: START + DAY });
  await openVerse(rig, 'ear');
  await rig.tap('Move back a stage');
  const confirm = rig.host.querySelector('[aria-label="Move back"]');
  await act(async () => {
    for (const _ of [1, 2])
      confirm?.dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }),
      );
  });
  expect(await rig.until(() => one(rig, 'moved') !== null)).toBe(true);
  expect(await rig.until(() => false, 50)).toBe(false);
  expect([
    stage(rig),
    textOf(one(rig, 'moved')),
    one(rig, 'back-alert'),
    backs(device.disk).length,
  ]).toEqual(['Stage: blade', 'Moved back to a blade.', null, 1]);
  expect(rig.faults).toEqual([]);
  await rig.leave();
});
