/* oxlint-disable effect/noAsyncFunction, effect/noNullish, no-await-in-loop -- a React screen test: it drives the root rig's promise-based taps one after another, each turn waiting on the last, and reads nodes whose absent attributes are null. */

/**
 * Move back a stage over generated asks, through the root rig
 * (`src/test/root-rig.tsx`, every frame held to the root's rules): from a
 * tapped ear, each ask's taps (`Move back` once or twice, then `Keep`, or
 * `Keep`) land in one turn with its first save kept, refused or slow, and
 * after every ask the disk holds at most one more step back, and the line
 * or alert and the stage line say what it holds.
 */

import { expect, it } from 'bun:test';
import { act } from 'react';
import passage from 'virtual:heartseed-passage';

import { backs, EAR, one, openVerse, stage } from '../test/back-rig';
import { START } from '../test/clock';
import { below, DAY, MINUTE, random } from '../test/garden-model';
import { launchRoot, rootDevice, textOf, type RootDevice, type RootLaunch } from '../test/root-rig';

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
