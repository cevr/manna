/* oxlint-disable effect/noGlobals, effect/noNullish, effect/noTernary, effect/noAsyncFunction, eslint/no-await-in-loop -- a React screen walk and its model: it drives launches of the root in happy-dom through React's promise-based `act`, one generated command after another, over a disk and faults kept in plain maps and sets the commands change, and writes the stored texts' rules out as plain branches over undefined, apart from the app's Option code, so the two cannot share a mistake. */

/**
 * Home's Settings sheet walked against its model, for the walk's parts
 * (`src/settings/walk-*.test.tsx`).
 *
 * The model writes the rules plainly, apart from the app: the minutes read
 * as the stored text when it is exactly `2`, `5`, `10` or `20`, else 5, and
 * 5 when the read fails; the voice the choice key's text when it is `off`,
 * `her` or `him` and read, else Off only for the old switch's text `false`
 * read with no readable choice, else Her; the appearance the stored text
 * when it is exactly `system`, `light` or `dark`, else System; the scheme
 * the appearance's own, System's the system's. A tap shows at once and its
 * write lands unless the store refuses it; a refused choice holds for the
 * launch and the next launch reads the disk. Home's counts line and `Start`
 * follow the plan made at a Minutes tap's instant (the session's model,
 * `src/test/session-model.ts`, and the run's, `src/test/run-model.ts`), the
 * chosen card the plant tapped. Opening and closing write nothing, and
 * leaving home closes the sheet and lets the chosen plant go.
 *
 * A device holds the app's passage and a stored passage of 1-12 verses
 * (Psalm 119), every verse planted three days before the first launch, so
 * every verse is due and 2 min and 20 min make different plans. Each launch
 * goes through the session rig (`src/test/session-rig.tsx`), which mounts the
 * app's root, so every frame holds the root's rule strictly (no `Minutes`
 * and no `Voice` on any screen, Today's included), and every document frame
 * holds the sheet's rule (`src/test/settings-rig.ts`) in the model's scheme.
 * After each command the sheet's checked minutes, `Voice`'s value and the
 * checked appearance, home's counts line, `Start`, the chosen card, the
 * disk's keys and every write equal the model's, with no fault.
 */

import { expect, it } from 'bun:test';
import { act } from 'react';
import passage from 'virtual:heartseed-passage';

import { APPEARANCE_KEY } from '../appearance';
import { versesOf } from '../kjv';
import { sourceWords } from '../matcher/words';
import { passageReference, verseReference } from '../passages';
import type { Recall } from '../sayit';
import { MINUTES_KEY } from '../session/service';
import type { Scheme } from '../theme';
import { CHOICE_KEY, ENABLED_KEY } from '../voice';
import { recallOf } from './field-model';
import { cardOf, selectedPlants } from './field-rig';
import { below, keyOf, pickOf, random } from './garden-model';
import { setSystem } from './look';
import { KEY as PASSAGES_KEY, storedText } from './passages-model';
import { madeModel, NO_RUN, shownModel } from './run-model';
import { cardLineModel } from './home-model';
import { planModel, type ModelPiece } from './session-model';
import {
  choicesOf,
  deviceOf,
  faultsOf,
  launch,
  type Device,
  type Faults,
  type Launch,
} from './session-rig';
import { closeSettings, modalOf, openSettings, tapInSheet, watchSheet } from './settings-rig';
import { hostOffset } from './zone';

const DAY = 86_400_000;

/** The instant of every device's first launch. */
const AT = Date.UTC(2026, 10, 5, 15);

type Minutes = 2 | 5 | 10 | 20;
type Voice = 'off' | 'her' | 'him';
type Look = 'system' | 'light' | 'dark';

const MINUTES: readonly [Minutes, ...Minutes[]] = [2, 5, 10, 20];
const LOOKS: readonly [Look, ...Look[]] = ['system', 'light', 'dark'];
const VOICE_WORDS: Readonly<Record<Voice, string>> = { off: 'Off', her: 'Her', him: 'Him' };
const LOOK_WORDS: Readonly<Record<Look, string>> = {
  system: 'System',
  light: 'Light',
  dark: 'Dark',
};
const NEXT_VOICE: Readonly<Record<Voice, Voice>> = { off: 'her', her: 'him', him: 'off' };

/** The minutes a launch reads: the stored text when it is exactly one of the four, else 5; 5 when the read fails. */
export const minutesRule = (text: string | undefined, failed: boolean): Minutes => {
  if (failed) return 5;
  return MINUTES.find((each) => String(each) === text) ?? 5;
};

/** The voice a launch reads: the choice's text when read and one of the three, else Off only for the old switch read as `false`, else Her. */
export const voiceRule = (
  text: string | undefined,
  failed: boolean,
  old: string | undefined,
  oldFailed: boolean,
): Voice => {
  if (!failed && (text === 'off' || text === 'her' || text === 'him')) return text;
  if (!oldFailed && old === 'false') return 'off';
  return 'her';
};

/** The appearance a launch reads: the stored text when it is exactly one of the three, else System. */
export const lookRule = (text: string | undefined): Look =>
  text === 'system' || text === 'light' || text === 'dark' ? text : 'system';

/** The scheme the screens show: Light and Dark their own, System the system's. */
export const schemeRule = (look: Look, system: Scheme): Scheme =>
  look === 'system' ? system : look;

/** What a stored minutes text is, for the coverage. */
const minutesClass = (text: string | undefined, failed: boolean) => {
  if (failed) return 'failed';
  if (text === undefined) return 'missing';
  return MINUTES.some((each) => String(each) === text) ? 'valid' : 'garbled';
};

/** What a stored voice is, for the coverage: its choice key's text, or the old switch's `false` alone. */
const voiceClass = (
  text: string | undefined,
  failed: boolean,
  old: string | undefined,
  oldFailed: boolean,
) => {
  if (failed) return 'failed';
  if (text === 'off' || text === 'her' || text === 'him') return 'valid';
  if (text !== undefined) return 'garbled';
  if (old === 'false' && !oldFailed) return 'old-false';
  return 'missing';
};

/** What a stored appearance is, for the coverage: one of the words, a near miss of one, another text, or missing. */
const lookClass = (text: string | undefined) => {
  if (text === undefined) return 'missing';
  if (text === 'system' || text === 'light' || text === 'dark') return 'word';
  if (['system', 'light', 'dark'].includes(text.trim().toLowerCase())) return 'near';
  return 'other';
};

/** The texts a disk holds under the settings' keys. */
interface Disk {
  minutes: string | undefined;
  voice: string | undefined;
  old: string | undefined;
  look: string | undefined;
}

/** A device's first launch: its stored texts, the keys whose reads fail, and the system. */
interface Start {
  readonly disk: Disk;
  readonly fail: readonly string[];
  readonly system: Scheme;
}

/** The first launches, zipped so that any five in a row meet every stored class of each key. */
const STARTS: readonly [Start, ...Start[]] = [
  {
    disk: { minutes: '2', voice: 'off', old: undefined, look: 'dark' },
    fail: [],
    system: 'light',
  },
  { disk: { minutes: 'ten', voice: 'Her', old: 'true', look: ' light' }, fail: [], system: 'dark' },
  {
    disk: { minutes: undefined, voice: undefined, old: undefined, look: 'sepia' },
    fail: [],
    system: 'light',
  },
  {
    disk: { minutes: '10', voice: 'him', old: undefined, look: undefined },
    fail: [MINUTES_KEY, CHOICE_KEY],
    system: 'dark',
  },
  {
    disk: { minutes: '20', voice: undefined, old: 'false', look: 'system' },
    fail: [],
    system: 'dark',
  },
  { disk: { minutes: '5', voice: 'her', old: undefined, look: 'light' }, fail: [], system: 'dark' },
  { disk: { minutes: '7', voice: 'loud', old: 'false', look: 'Dark' }, fail: [], system: 'light' },
  {
    disk: { minutes: undefined, voice: undefined, old: 'true', look: '' },
    fail: [],
    system: 'dark',
  },
  {
    disk: { minutes: '5 ', voice: 'off', old: 'false', look: undefined },
    fail: [MINUTES_KEY, CHOICE_KEY, ENABLED_KEY],
    system: 'light',
  },
  {
    disk: { minutes: '20', voice: undefined, old: 'false', look: 'dark' },
    fail: [],
    system: 'light',
  },
];

/** The app's own piece: the passage, its own group. */
const PIECE: ModelPiece = {
  reference: passage.reference,
  words: sourceWords(passage.text).length,
  group: passage.reference,
};

/** The stored passage of `n` verses: Psalm 119:1-n. */
const rangeOf = (n: number) => ({ book: 19, chapter: 119, first: 1, last: n });

/** The pieces the session plans over for a stored passage of `n` verses: the app's own, then each verse. */
const piecesOf = (n: number): ModelPiece[] => {
  const range = rangeOf(n);
  const group = passageReference(range);
  return [
    PIECE,
    ...versesOf(19, 119)
      .slice(0, n)
      .map((text, index) => ({
        reference: verseReference(19, 119, index + 1),
        words: sourceWords(text).length,
        group,
      })),
  ];
};

/** What the model says the screens and the disk hold. */
interface Model {
  disk: Disk;
  minutes: Minutes;
  voice: Voice;
  look: Look;
  system: Scheme;
  open: boolean;
  chosen: string | null;
  /** Each landed write's key, in order. */
  writes: string[];
  /** Whether a Minutes or Voice tap came in this launch. */
  tapped: boolean;
  /** Whether a tap the store refused came in this launch. */
  refused: boolean;
}

/** One device under way: its rig, disk, faults, clock, plants, model, generator, sheet watch and coverage. */
interface Walk {
  app: Launch;
  faults: Faults;
  readonly device: Device;
  readonly time: { now: number };
  readonly plants: ReadonlyMap<string, readonly Recall[]>;
  readonly pieces: readonly ModelPiece[];
  readonly m: Model;
  readonly next: () => number;
  readonly sheet: ReturnType<typeof watchSheet>;
  readonly coverage: Map<string, number>;
  step: string;
}

const cover = (walk: Walk, name: string) =>
  walk.coverage.set(name, (walk.coverage.get(name) ?? 0) + 1);

/** The plan the model makes now, at the clock's instant, over `minutes` (the model's own by default). */
const planNow = (walk: Walk, minutes: Minutes = walk.m.minutes) => {
  const at = walk.time.now;
  return planModel({
    plants: walk.plants,
    pieces: walk.pieces,
    at,
    offset: hostOffset(at),
    minutes,
  }).items;
};

const recallsNowOf = (walk: Walk) => (reference: string) => walk.plants.get(reference)?.length ?? 0;

/** What the screens and the disk show now. */
const seen = (walk: Walk) => {
  const { app, device } = walk;
  const modal = modalOf();
  const look = [
    ...(modal?.querySelectorAll('[role="radiogroup"][aria-label="Appearance"] [role="radio"]') ??
      []),
  ];
  const card = cardOf(app.host);
  const choices = modal === null ? null : choicesOf(modal);
  return {
    sheet:
      modal === null || choices === null
        ? null
        : {
            minutes: choices.checked,
            voice: choices.voices,
            look: look
              .filter((node) => node.getAttribute('aria-checked') === 'true')
              .map((node) => node.getAttribute('aria-label')),
          },
    headings: app.headings(),
    counts: app.homeCounts(),
    begin: app.has('Start'),
    chosen: card.card === 'chosen' ? (card.line.split(' · ')[0] ?? '') : null,
    selected: selectedPlants(app.host).map((name) => name.split(', ')[0]),
    disk: {
      minutes: device.disk.get(MINUTES_KEY),
      voice: device.disk.get(CHOICE_KEY),
      old: device.disk.get(ENABLED_KEY),
      look: device.disk.get(APPEARANCE_KEY),
    },
    writes: device.writes,
    faults: app.faults.slice(0, 3),
    sheetFaults: walk.sheet.faults.slice(0, 3),
  };
};

/** What the model says `seen` must be. */
const wanted = (walk: Walk): ReturnType<typeof seen> => {
  const { m } = walk;
  const items = planNow(walk);
  const recallsNow = recallsNowOf(walk);
  const unchosen = m.chosen === null;
  return {
    sheet: m.open
      ? {
          minutes: [`${m.minutes} min`],
          voice: [`Voice:${VOICE_WORDS[m.voice]}`],
          look: [LOOK_WORDS[m.look]],
        }
      : null,
    headings: ['Your field'],
    counts: unchosen ? [cardLineModel(items, recallsNow)] : [],
    begin: unchosen && shownModel(madeModel(NO_RUN, items, false), recallsNow) !== null,
    chosen: m.chosen,
    selected: unchosen ? [] : [m.chosen ?? ''],
    disk: { ...m.disk },
    writes: m.writes,
    faults: [],
    sheetFaults: [],
  };
};

/** Holds the screens and the disk to the model once they caught up with the last command. */
const check = async (walk: Walk, at: string) => {
  const want = wanted(walk);
  await walk.app.until(() => JSON.stringify(seen(walk)) === JSON.stringify(want), 1000);
  expect({ at: `${walk.step} ${at}`, ...seen(walk) }).toEqual({
    at: `${walk.step} ${at}`,
    ...want,
  });
};

const ensureOpen = async (walk: Walk) => {
  if (walk.m.open) return;
  await openSettings(walk.app);
  walk.m.open = true;
};

const ensureClosed = async (walk: Walk) => {
  if (!walk.m.open) return;
  expect(await closeSettings(walk.app, 'Done')).toBe(true);
  walk.m.open = false;
};

/** One choice the sheet offers: its kind, its key, the label tapped, and what the model takes (the value shown and the text a landed write stores). */
interface Tap {
  readonly kind: 'minutes' | 'voice' | 'appearance';
  readonly key: string;
  readonly label: string;
  readonly take: () => void;
  readonly store: (disk: Disk) => void;
}

/** A tap in the sheet, opened first, whose write the store refuses one time in five: the model takes the choice before the tap, whose frames show it, and the write when it lands. */
const choiceTap = async (walk: Walk, tap: Tap) => {
  await ensureOpen(walk);
  const refused = walk.next() < 0.2;
  if (refused) walk.faults.refuse.add(tap.key);
  tap.take();
  if (!refused) {
    tap.store(walk.m.disk);
    walk.m.writes.push(tap.key);
  }
  expect(await tapInSheet(tap.label)).toBe(true);
  if (refused) {
    walk.m.refused = true;
    cover(walk, `${tap.kind}:refused`);
    await walk.app.until(() => false, 5);
  }
  await check(walk, `${tap.kind} ${tap.label}${refused ? ' refused' : ''}`);
  walk.faults.refuse.delete(tap.key);
};

/** The references of the plan made now over `minutes`, as one text. */
const planned = (walk: Walk, minutes?: Minutes) =>
  JSON.stringify(planNow(walk, minutes).map((item) => item.reference));

/** The minutes a tap takes: any of the four, or, half the time while no tap has changed the plan, one whose plan differs from the plan now when there is one. */
const minutesPick = (walk: Walk): Minutes => {
  const any = pickOf(walk.next, MINUTES);
  if (walk.coverage.has('minutes:plan-changed') || walk.next() < 0.5) return any;
  const now = planned(walk);
  return MINUTES.find((each) => planned(walk, each) !== now) ?? any;
};

const minutesCommand = async (walk: Walk) => {
  const n = minutesPick(walk);
  const before = planned(walk);
  walk.m.tapped = true;
  await choiceTap(walk, {
    kind: 'minutes',
    key: MINUTES_KEY,
    label: `${n} min`,
    take: () => {
      walk.m.minutes = n;
    },
    store: (disk) => {
      disk.minutes = String(n);
    },
  });
  if (planned(walk) !== before) cover(walk, 'minutes:plan-changed');
};

const voiceCommand = async (walk: Walk) => {
  const next = NEXT_VOICE[walk.m.voice];
  walk.m.tapped = true;
  await choiceTap(walk, {
    kind: 'voice',
    key: CHOICE_KEY,
    label: 'Voice',
    take: () => {
      walk.m.voice = next;
    },
    store: (disk) => {
      disk.voice = next;
    },
  });
};

const lookCommand = async (walk: Walk) => {
  const look = pickOf(walk.next, LOOKS);
  await choiceTap(walk, {
    kind: 'appearance',
    key: APPEARANCE_KEY,
    label: LOOK_WORDS[look],
    take: () => {
      walk.m.look = look;
    },
    store: (disk) => {
      disk.look = look;
    },
  });
};

/** A flip of the system, the sheet opened first half the time, so the sheet is seen re-themed while it shows. */
const systemCommand = async (walk: Walk) => {
  if (walk.next() < 0.5) await ensureOpen(walk);
  walk.m.system = walk.m.system === 'light' ? 'dark' : 'light';
  await act(async () => setSystem(walk.m.system));
  await check(walk, `system ${walk.m.system}`);
  if (walk.m.open && schemeRule(walk.m.look, walk.m.system) === 'dark')
    cover(walk, 'system:dark-sheet');
};

/** About from the sheet, then About's way back: home with the sheet closed and no plant chosen. */
const aboutCommand = async (walk: Walk) => {
  await ensureOpen(walk);
  expect(await tapInSheet('About')).toBe(true);
  expect(await walk.app.until(() => walk.app.headings().join('|') === 'About')).toBe(true);
  walk.m.open = false;
  walk.m.chosen = null;
  expect({ at: walk.step, modal: modalOf(), faults: walk.app.faults }).toEqual({
    at: walk.step,
    modal: null,
    faults: [],
  });
  await walk.app.tap('Your field');
  await check(walk, 'about and back');
};

/** The plants home shows, by name. */
const plantNames = (walk: Walk) =>
  [...walk.app.host.querySelectorAll('[data-testid="field-plant"]')].map(
    (node) => node.getAttribute('aria-label') ?? '',
  );

/** A tap on a plant, the sheet closed first: it chooses its verse, or lets the chosen one go. */
const tapPlant = async (walk: Walk, name: string) => {
  const reference = name.split(', ')[0] ?? '';
  walk.m.chosen = walk.m.chosen === reference ? null : reference;
  await walk.app.tap(name);
  await check(walk, `plant ${reference}`);
};

const plantCommand = async (walk: Walk) => {
  await ensureClosed(walk);
  const names = plantNames(walk);
  const chosen = names.find((name) => name.startsWith(`${walk.m.chosen}, `));
  const name =
    chosen !== undefined && walk.next() < 0.3
      ? chosen
      : (names[below(walk.next, names.length)] ?? '');
  await tapPlant(walk, name);
};

/** `Start`, the sheet closed and any plant let go first: Today shows no choice and no `Settings`; then back to home. */
const beginCommand = async (walk: Walk) => {
  await ensureClosed(walk);
  const chosen = plantNames(walk).find((name) => name.startsWith(`${walk.m.chosen}, `));
  if (chosen !== undefined) await tapPlant(walk, chosen);
  if (!wanted(walk).begin) return;
  await walk.app.tap('Start');
  expect(await walk.app.until(() => walk.app.headings().includes('Today'))).toBe(true);
  expect({
    at: walk.step,
    choices: choicesOf(walk.app.host),
    settings: walk.app.has('Settings'),
    faults: walk.app.faults,
  }).toEqual({
    at: walk.step,
    choices: { groups: 0, names: [], checked: [], voices: [] },
    settings: false,
    faults: [],
  });
  if (walk.m.tapped) cover(walk, 'begin:today-bare');
  await walk.app.tap('Your field');
  await check(walk, 'begin and back');
};

/** The keys a launch's reads fail: the first launch's own, else each settings key one time in seven. */
const failuresOf = (walk: Pick<Walk, 'next'>, start: Start | null) => {
  if (start !== null) return new Set(start.fail);
  return new Set([MINUTES_KEY, CHOICE_KEY, ENABLED_KEY].filter(() => walk.next() < 1 / 7));
};

/** A launch over the disk as it stands, the model reading it as the rules say; it waits for home. */
const launchOver = async (walk: Walk, start: Start | null) => {
  const failGet = failuresOf(walk, start);
  walk.faults = faultsOf({ failGet });
  const { m } = walk;
  const failed = (key: string) => failGet.has(key);
  m.minutes = minutesRule(m.disk.minutes, failed(MINUTES_KEY));
  m.voice = voiceRule(m.disk.voice, failed(CHOICE_KEY), m.disk.old, failed(ENABLED_KEY));
  m.look = lookRule(m.disk.look);
  m.open = false;
  m.chosen = null;
  m.tapped = false;
  m.refused = false;
  cover(walk, `stored:minutes:${minutesClass(m.disk.minutes, failed(MINUTES_KEY))}`);
  cover(
    walk,
    `stored:voice:${voiceClass(m.disk.voice, failed(CHOICE_KEY), m.disk.old, failed(ENABLED_KEY))}`,
  );
  cover(walk, `stored:appearance:${lookClass(m.disk.look)}`);
  walk.app = await launch(walk.device, walk.faults, walk.time);
  expect(
    await walk.app.until(
      () => walk.app.headings().includes('Your field') && walk.app.homeCounts().length > 0,
    ),
  ).toBe(true);
  await check(walk, 'launch');
};

/** The next morning: the clock a day on, a fresh launch over the disk, the sheet closed. */
const relaunchCommand = async (walk: Walk) => {
  const { m } = walk;
  const shown = JSON.stringify([m.minutes, m.voice, m.look]);
  const refused = m.refused;
  await walk.app.leave();
  walk.time.now += DAY;
  await launchOver(walk, null);
  if (refused && JSON.stringify([m.minutes, m.voice, m.look]) !== shown)
    cover(walk, 'relaunch:refused-forgotten');
};

const COMMANDS = [
  'open',
  'done',
  'escape',
  'escape',
  'minutes',
  'minutes',
  'voice',
  'voice',
  'appearance',
  'system',
  'about',
  'plant',
  'plant',
  'begin',
  'relaunch',
] as const;

type Command = (typeof COMMANDS)[number];

/** Each floor of a walk part: every command, every stored class of each key, and the named reaches. */
export const FLOORS: Readonly<Record<string, number>> = Object.fromEntries([
  ...[...new Set(COMMANDS)].map((command) => [command, 1] as const),
  ...['valid', 'garbled', 'missing', 'failed'].map(
    (kind) => [`stored:minutes:${kind}`, 1] as const,
  ),
  ...['valid', 'garbled', 'missing', 'failed', 'old-false'].map(
    (kind) => [`stored:voice:${kind}`, 1] as const,
  ),
  ...['word', 'near', 'other', 'missing'].map((kind) => [`stored:appearance:${kind}`, 1] as const),
  ...[
    'minutes:plan-changed',
    'minutes:refused',
    'voice:refused',
    'appearance:refused',
    'relaunch:refused-forgotten',
    'escape:plant-kept',
    'system:dark-sheet',
    'begin:today-bare',
  ].map((name) => [name, 1] as const),
]);

const perform = async (walk: Walk, command: Command) => {
  cover(walk, command);
  if (command === 'open') {
    await ensureClosed(walk);
    await ensureOpen(walk);
    await check(walk, 'open');
  } else if (command === 'done' || command === 'escape') {
    await ensureOpen(walk);
    const kept = walk.m.chosen;
    expect(await closeSettings(walk.app, command === 'done' ? 'Done' : 'Escape')).toBe(true);
    walk.m.open = false;
    await check(walk, command);
    if (command === 'escape' && kept !== null) cover(walk, 'escape:plant-kept');
  } else if (command === 'minutes') await minutesCommand(walk);
  else if (command === 'voice') await voiceCommand(walk);
  else if (command === 'appearance') await lookCommand(walk);
  else if (command === 'system') await systemCommand(walk);
  else if (command === 'about') await aboutCommand(walk);
  else if (command === 'plant') await plantCommand(walk);
  else if (command === 'begin') await beginCommand(walk);
  else await relaunchCommand(walk);
};

/** The command that leads toward each reach of the walk, given the model now. */
const TOWARD = new Map<string, (m: Model) => Command>([
  ['minutes:plan-changed', () => 'minutes'],
  ['minutes:refused', () => 'minutes'],
  ['voice:refused', () => 'voice'],
  ['appearance:refused', () => 'appearance'],
  ['system:dark-sheet', () => 'system'],
  ['begin:today-bare', (m) => (m.tapped ? 'begin' : 'minutes')],
  ['escape:plant-kept', (m) => (m.chosen === null ? 'plant' : 'escape')],
  ['relaunch:refused-forgotten', (m) => (m.refused ? 'relaunch' : 'voice')],
]);

/** A lean of the generator toward what the walk has not reached yet: seven times in ten, a command toward one unmet floor, drawn from those unmet; else none, and the command is drawn from all. */
const steer = (walk: Walk): Command | undefined => {
  if (walk.next() < 0.3) return undefined;
  const unmet = Object.keys(FLOORS).filter((name) => !walk.coverage.has(name));
  const toward = unmet.flatMap((name): Command[] => {
    const lead = TOWARD.get(name);
    if (lead !== undefined) return [lead(walk.m)];
    return COMMANDS.filter((command) => command === name);
  });
  if (toward.length === 0) return undefined;
  return toward[below(walk.next, toward.length)];
};

/** One device: its stored passage of 1-12 verses, every verse planted three days before its first launch, then `steps` generated commands. */
const deviceRun = async (
  next: () => number,
  d: number,
  steps: number,
  coverage: Map<string, number>,
) => {
  const start = STARTS[d % STARTS.length] ?? STARTS[0];
  const n = 1 + below(next, 12);
  const pieces = piecesOf(n);
  const recalls = pieces.map((piece) => recallOf(piece.reference, AT - 3 * DAY, 3, 0));
  const entries: (readonly [string, string])[] = [
    [PASSAGES_KEY, storedText([rangeOf(n)])],
    ...recalls.map((recall) => [keyOf(recall), JSON.stringify(recall)] as const),
  ];
  const { disk } = start;
  if (disk.minutes !== undefined) entries.push([MINUTES_KEY, disk.minutes]);
  if (disk.voice !== undefined) entries.push([CHOICE_KEY, disk.voice]);
  if (disk.old !== undefined) entries.push([ENABLED_KEY, disk.old]);
  if (disk.look !== undefined) entries.push([APPEARANCE_KEY, disk.look]);
  setSystem(start.system);
  const m: Model = {
    disk: { ...disk },
    minutes: 5,
    voice: 'her',
    look: 'system',
    system: start.system,
    open: false,
    chosen: null,
    writes: [],
    tapped: false,
    refused: false,
  };
  const walk: Walk = {
    app: undefined as unknown as Launch,
    faults: faultsOf(),
    device: deviceOf(entries),
    time: { now: AT },
    plants: new Map(recalls.map((recall) => [recall.reference, [recall]])),
    pieces,
    m,
    next,
    sheet: watchSheet(() => schemeRule(m.look, m.system)),
    coverage,
    step: `device ${d} (${n} verses)`,
  };
  await launchOver(walk, start);
  for (let c = 0; c < steps; c += 1) {
    const command = steer(walk) ?? pickOf(next, COMMANDS);
    walk.step = `device ${d} (${n} verses) command ${c} ${command}`;
    await perform(walk, command);
  }
  walk.sheet.stop();
  await walk.app.leave();
  setSystem('light');
};

/** One part's case of the sheet's walk: `devices` from `seed`, `steps` commands each, every floor met. */
export const settingsCase = (seed: number, devices: readonly number[], steps: number) =>
  it(`over generated devices ${devices.join(',')}, opens, chooses, closes and leaves the Settings sheet by the rules`, async () => {
    const coverage = new Map<string, number>();
    const next = random(seed);
    for (const d of devices) await deviceRun(next, d, steps, coverage);
    console.log(`coverage ${JSON.stringify(Object.fromEntries(coverage))}`);
    expect(
      Object.entries(FLOORS).filter(([name, floor]) => (coverage.get(name) ?? 0) < floor),
    ).toEqual([]);
  });
