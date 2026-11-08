/* oxlint-disable effect/noAsyncFunction, effect/noTernary, effect/noNullish, effect/noGlobals, eslint/no-await-in-loop -- a React screen walk: it drives launches of the root in happy-dom through the bar rig's promise-based `act`, one generated command after another, reads the disk's absent keys as null, and names each disagreement as JSON text. */

/**
 * The reader's appearance as a model-based walk through the bar rig
 * (`src/test/bar-rig.tsx`): the root over the device's store, launched over
 * a stored text (a missing key, each word, a near miss, another text) and
 * either system, then generated commands: a choice on About (landed, or
 * refused by the store), a flip of the system, a relaunch and the field.
 * The model is the stored text, the choice read or made and the system;
 * every frame (each DOM mutation batch) holds the frame oracle
 * (`src/test/look.ts`) for the scheme the model names (System's until the
 * launch's read shows a heading), every commit that holds a new appearance
 * draws the screens in the model's scheme in its layout phase, before it
 * is seen (`commitProbe`), and after each command the screen holds
 * it, About's radios are System, Light and Dark with the model's alone
 * checked, the disk's key is the model's, and the bar rig saw no fault.
 * The part's own seeds reach each command kind, each stored text class and
 * both systems.
 */

import { useAtomValue } from '@effect/atom-react';
import { describe, expect, it } from 'bun:test';
import { Option } from 'effect';
import * as AsyncResult from 'effect/reactivity/AsyncResult';
import { act, useLayoutEffect } from 'react';
import { Appearance } from 'react-native';

import { appearanceView } from '../app';
import { APPEARANCE_KEY, APPEARANCES, appearanceOf, schemeOf, type Choice } from '../appearance';
import { schemeOf as screensOf } from '../look';
import { mountBar } from '../test/bar-rig';
import { labelOf, text } from '../test/chooser-rig';
import { recallOf } from '../test/field-model';
import { record } from '../test/field-rig';
import { below, random } from '../test/garden-model';
import { lookFaults, setSystem, watchLook } from '../test/look';
import { device } from '../test/one';
import type { Scheme } from '../theme';

const LABELS: Readonly<Record<Choice, string>> = { system: 'System', light: 'Light', dark: 'Dark' };

/** The stored texts a launch may find, by class. */
const STORED = [
  { kind: 'missing', text: undefined },
  { kind: 'word', text: 'system' },
  { kind: 'word', text: 'light' },
  { kind: 'word', text: 'dark' },
  { kind: 'near', text: 'Dark' },
  { kind: 'near', text: ' light' },
  { kind: 'other', text: 'sepia' },
  { kind: 'other', text: '' },
] as const;

/** The stored text classes, one launch class a seed in turn. */
const KINDS = ['missing', 'word', 'near', 'other'] as const;

type Command = 'choose' | 'refused' | 'system' | 'relaunch' | 'field';
const COMMANDS: readonly Command[] = ['choose', 'choose', 'refused', 'system', 'relaunch', 'field'];

type Bar = Awaited<ReturnType<typeof mountBar>>;

/** One reader's walk: the model, the root mounted, its frame watch, and what it saw and reached. */
interface Walk {
  readonly seed: number;
  readonly next: () => number;
  readonly model: { stored: string | undefined; system: Scheme; choice: Choice };
  rig: Bar;
  frames: ReturnType<typeof watchLook>;
  readonly report: string[];
  readonly reached: Set<string>;
}

const headingOf = (rig: Bar) => text(rig.host.querySelector('[role="heading"]'));

const radios = (rig: Bar) =>
  [...rig.host.querySelectorAll('[role="radio"]')].filter((node) =>
    Object.values(LABELS).includes(labelOf(node)),
  );

/** A launch over a planted verse, so Today opens, with the voice Off, and the key's text when stored. */
const launchOver = (stored: string | undefined) =>
  device.launch([
    record(recallOf('Made 1:1', Date.UTC(2026, 9, 1), 3, 0)),
    ['heartseed/voice/enabled', 'false'],
    ...(stored === undefined ? [] : [[APPEARANCE_KEY, stored] as const]),
  ]);

/** The scheme the model names for the frame shown: System's until a heading shows, then the choice's. */
const shownOf = (walk: Walk) => (): Scheme =>
  headingOf(walk.rig) === ''
    ? schemeOf('system', walk.model.system)
    : schemeOf(walk.model.choice, walk.model.system);

/** What a commit probe reads and reports to. */
type Watched = Pick<Walk, 'seed' | 'model' | 'report' | 'reached'>;

/**
 * Beside the root under its registry: in the layout phase of each commit
 * that holds a new appearance (after the root's own layout effects, before
 * any passive effect and so before that frame is seen), the scheme every
 * screen reads is held to the one the model names. The launch's first
 * appearance and each later one (a tap) are reached apart.
 */
const commitProbe = (watched: Watched) => {
  let launched = false;
  const Committed = () => {
    const choice = Option.getOrUndefined(AsyncResult.value(useAtomValue(appearanceView)));
    useLayoutEffect(() => {
      if (choice === undefined) return;
      watched.reached.add(launched ? 'commit chosen' : 'commit launch');
      launched = true;
      const screens = screensOf(Appearance.getColorScheme());
      const want = schemeOf(choice, watched.model.system);
      if (screens !== want)
        watched.report.push(
          `seed ${watched.seed} commit ${choice}: screens ${screens}, want ${want}`,
        );
    }, [choice]);
    return null;
  };
  return <Committed />;
};

/** Mounts the root over the disk as it stands, every frame and every commit held to the model, and waits for Today. */
const mount = async (walk: Walk) => {
  walk.rig = await mountBar(0, false, commitProbe(walk));
  walk.frames = watchLook(walk.rig.host, shownOf(walk));
  await walk.rig.until(() => headingOf(walk.rig) === 'Today');
};

/** Stops the frame watch and keeps its faults. */
const unwatch = (walk: Walk) => {
  walk.frames.stop();
  walk.report.push(...walk.frames.faults.map((fault) => `seed ${walk.seed} frame: ${fault}`));
};

/** The screen once it settles, against the model: the frame, About's radios, the disk and the rig. */
const check = async (walk: Walk, name: string) => {
  const { rig, model } = walk;
  const shown = shownOf(walk);
  await rig.until(() => lookFaults(rig.host, shown()).length === 0, 400);
  const onAbout = headingOf(rig) === 'About';
  const checked = radios(rig).filter((node) => node.getAttribute('aria-checked') === 'true');
  const got = {
    faults: lookFaults(rig.host, shown()),
    radios: onAbout ? radios(rig).map(labelOf) : null,
    checked: onAbout ? checked.map(labelOf) : null,
    disk: device.disk.get(APPEARANCE_KEY) ?? undefined,
    rig: rig.faults.slice(0, 2),
  };
  const want = {
    faults: [],
    radios: onAbout ? ['System', 'Light', 'Dark'] : null,
    checked: onAbout ? [LABELS[model.choice]] : null,
    disk: model.stored,
    rig: [],
  };
  if (JSON.stringify(got) !== JSON.stringify(want))
    walk.report.push(`seed ${walk.seed} ${name}: ${JSON.stringify(got)} ≠ ${JSON.stringify(want)}`);
};

const toField = async (rig: Bar) => {
  if (headingOf(rig) !== 'Your field') await rig.tap('Your field');
  return rig.until(() => headingOf(rig) === 'Your field');
};

/** A tap of a radio on About, the store refusing its write when `refused`; the model takes the choice before the tap, whose frames show it. */
const chooseOn = async (walk: Walk, refused: boolean) => {
  const want = APPEARANCES[below(walk.next, 3)] ?? 'system';
  const { rig } = walk;
  if (headingOf(rig) !== 'About') {
    await toField(rig);
    await rig.tap('About');
  }
  if (!(await rig.until(() => headingOf(rig) === 'About'))) return false;
  if (refused) device.fail('set', 1);
  walk.model.choice = want;
  if (!refused) walk.model.stored = want;
  await rig.tap(LABELS[want]);
  await check(walk, `${refused ? 'refused' : 'choose'} ${want}`);
  return true;
};

const flip = async (walk: Walk) => {
  walk.model.system = walk.model.system === 'light' ? 'dark' : 'light';
  await act(async () => setSystem(walk.model.system));
  await check(walk, `system ${walk.model.system}`);
};

const relaunch = async (walk: Walk) => {
  unwatch(walk);
  await walk.rig.leave();
  device.launch();
  walk.model.choice = appearanceOf(walk.model.stored);
  await mount(walk);
  await check(walk, 'relaunch');
};

/** One command of the walk; false when About could not be reached. */
const perform = async (walk: Walk, command: Command) => {
  walk.reached.add(command);
  if (command === 'choose' || command === 'refused') return chooseOn(walk, command === 'refused');
  if (command === 'system') await flip(walk);
  else if (command === 'relaunch') await relaunch(walk);
  else {
    await toField(walk.rig);
    await check(walk, 'field');
  }
  return true;
};

/** One reader's walk of `steps` commands from a launch of the seed's stored text class; the disagreements it saw. */
const walkOf = async (seed: number, steps: number, reached: Set<string>) => {
  const next = random(seed * 7919);
  const kind = KINDS[(seed - 1) % KINDS.length];
  const ofKind = STORED.filter((each) => each.kind === kind);
  const start = ofKind[below(next, ofKind.length)] ?? STORED[0];
  const system: Scheme = below(next, 2) === 0 ? 'light' : 'dark';
  reached.add(`stored ${start.kind}`);
  reached.add(`system ${system}`);
  launchOver(start.text);
  setSystem(system);
  const watched: Watched = {
    seed,
    model: { stored: start.text, system, choice: appearanceOf(start.text) },
    report: [],
    reached,
  };
  const rig = await mountBar(0, false, commitProbe(watched));
  const walk: Walk = { ...watched, next, rig, frames: watchLook(rig.host, () => system) };
  walk.frames.stop();
  walk.frames = watchLook(rig.host, shownOf(walk));
  await rig.until(() => headingOf(rig) === 'Today');
  await check(walk, 'launch');
  for (let n = 0; n < steps; n++) {
    if (await perform(walk, COMMANDS[below(next, COMMANDS.length)] ?? 'field')) continue;
    walk.report.push(`seed ${seed}: About not reached (${headingOf(walk.rig)})`);
    break;
  }
  unwatch(walk);
  await walk.rig.leave();
  return walk.report;
};

describe('the reader’s appearance, walked', () => {
  it('holds every frame to the scheme the model names, About’s radios and the disk to the model, over generated readers', async () => {
    const reached = new Set<string>();
    const report: string[] = [];
    for (const seed of [1, 2, 3, 4, 5]) report.push(...(await walkOf(seed, 6, reached)));
    setSystem('light');
    expect({ report: report.slice(0, 4), reached: [...reached].toSorted() }).toEqual({
      report: [],
      reached: [
        'choose',
        'commit chosen',
        'commit launch',
        'field',
        'refused',
        'relaunch',
        'stored missing',
        'stored near',
        'stored other',
        'stored word',
        'system',
        'system dark',
        'system light',
      ],
    });
  });
});
