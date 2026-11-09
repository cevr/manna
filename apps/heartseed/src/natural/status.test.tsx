/* oxlint-disable effect/noGlobals, effect/noNullish, effect/noAsyncFunction, effect/noNewPromise, effect/noFixedWaitInTests, eslint/no-await-in-loop -- a React screen test: it mounts the root in happy-dom through React's promise-based `act`, hands each turn of the runtime's forked work over on the host's clock until the frame a step waits on lands, at most 2 s, over a disk kept in a plain map, and reads a node's absent parent and attributes as null. */

/**
 * The natural voice's line as a reader meets it, in home's Settings sheet
 * under the Voice pill: the root mounted under the app's own layer with a
 * fake natural module whose download events and load answers the test
 * sends, in a release build (`dev: false`), and the sheet opened from
 * home's gear. The line sits after the Voice pill and before the
 * Appearance line, inside the sheet, in ink at AA, and says the download's
 * state in the words written out here; a failure adds one `Try again`
 * button beside the words, never inside them, at least 44 tall, whose tap
 * installs again (or loads again, after a failed load). Every frame checked
 * holds the sheet's own rule (`sheetFaults`). The download starts by itself
 * once per launch, from `MIRROR`, and never while Off; a crash launch
 * stores the fuse blown and says so until a Voice tap, which stores it
 * clear; a later launch with the fuse blown says nothing; the platform's
 * own module, which refuses, shows no line at all.
 */

import { RegistryProvider } from '@effect/atom-react';
import { describe, expect, it } from 'bun:test';
import { Deferred, Effect, Exit, Layer } from 'effect';
import * as KeyValueStore from 'effect/persistence/KeyValueStore';
import { act } from 'react';
import { createRoot } from 'react-dom/client';

import Root from '../../app/index';
import { appLayer, runtime } from '../app';
import { DictationSource } from '../dictation';
import { CHAIN } from '../dictation/attempt';
import { Chime } from '../garden';
import { Haptics, type Recall } from '../sayit';
import { AA, contrastOf } from '../test/contrast';
import { keyOf } from '../test/garden-model';
import { systemScheme } from '../test/look';
import { modalOf, openSettings, sheetFaults } from '../test/settings-rig';
import { CHOICE_KEY, VoiceSource } from '../voice';
import { FILES, MIRROR, TOTAL_BYTES } from './manifest';
import { NaturalModule, NaturalUnavailable, type InstallEvent } from './module';
import { FUSE_KEY } from './service';

const DAY = 86_400_000;

const LINES = {
  crash: 'The natural voice stopped unexpectedly, so the system voice reads for now.',
  network: 'Natural voice could not download.',
  check: 'Natural voice could not be checked.',
  space: 'Not enough space for the natural voice (83 MB).',
  load: 'Natural voice could not start.',
  waiting: 'Natural voice: waiting for a connection',
  ready: 'Natural voice: getting ready',
  downloading: (percent: number) => `Natural voice: downloading, ${percent}%`,
} as const;

const recall: Recall = {
  reference: 'Made 1:1',
  startedAt: Date.now() - 3 * DAY,
  offset: 0,
  grade: 3,
  suggested: 3,
  words: 4,
  missed: 0,
  peeked: 0,
  extra: 0,
};

/** A disk with a planted verse, so home opens, and `entries`. */
const diskOf = (entries: readonly (readonly [string, string])[] = []) =>
  new Map<string, string>([[keyOf(recall), JSON.stringify(recall)], ...entries]);

const recognizer = Layer.succeed(
  DictationSource,
  DictationSource.of({
    engines: () => Effect.succeed(CHAIN.map((engine) => ({ engine, status: 'ready' as const }))),
    listen: () => Effect.void,
    finish: Effect.void,
    cancel: Effect.void,
    subscribe: () => Effect.void,
  }),
);

const quietVoice = Layer.succeed(
  VoiceSource,
  VoiceSource.of({
    voices: Effect.succeed([]),
    speak: () => Effect.void,
    pause: Effect.void,
    resume: Effect.void,
    stop: Effect.void,
    subscribe: () => Effect.void,
  }),
);

/** A natural module holding `present` files, its crash marker `crashed`: it records each install's base and each load's voice, holds each load until the test answers it, and sends the install events the test sends. */
const moduleOf = (present: number, crashed: boolean) => {
  const installs: string[] = [];
  const voices: string[] = [];
  const loads: Deferred.Deferred<number, NaturalUnavailable>[] = [];
  const listeners = new Set<(event: InstallEvent) => void>();
  const module = NaturalModule.of({
    status: (revision) =>
      Effect.succeed({
        revision,
        files: present,
        bytes: 0,
        excluded: true,
        crashed,
        loaded: false,
        installing: false,
        footprint: 0,
        peak: 0,
      }),
    install: (base) => Effect.sync(() => void installs.push(base)),
    cancelInstall: Effect.die('the app never cancels the download'),
    remove: Effect.die('the app never removes the download'),
    load: (_revision, _files, voice) =>
      Effect.suspend(() => {
        voices.push(voice);
        const answer = Deferred.makeUnsafe<number, NaturalUnavailable>();
        loads.push(answer);
        return Deferred.await(answer);
      }),
    prosody: () => Effect.fail(NaturalUnavailable.make({ reason: 'test' })),
    render: () => Effect.fail(NaturalUnavailable.make({ reason: 'test' })),
    play: () => Effect.void,
    pause: Effect.void,
    resume: Effect.void,
    stop: Effect.void,
    subscribe: () => Effect.void,
    subscribeInstall: (listener) =>
      Effect.asVoid(
        Effect.acquireRelease(
          Effect.sync(() => listeners.add(listener)),
          () => Effect.sync(() => listeners.delete(listener)),
        ),
      ),
  });
  const emit = (event: Partial<InstallEvent> & Pick<InstallEvent, 'kind'>) =>
    act(async () => {
      for (const listener of listeners)
        listener({ bytes: 0, total: TOTAL_BYTES, reason: '', ...event });
    });
  /** Answers the oldest load still held: loaded, or refused with `reason`. */
  const answer = (reason?: string) =>
    act(async () => {
      const held = loads.shift();
      if (held === undefined) return;
      if (reason === undefined) Deferred.doneUnsafe(held, Exit.succeed(1));
      else Deferred.doneUnsafe(held, Exit.fail(NaturalUnavailable.make({ reason })));
    });
  return { layer: Layer.succeed(NaturalModule, module), installs, voices, emit, answer };
};

type Fake = ReturnType<typeof moduleOf>;

/** The text a node holds, its runs of white space as one space. */
const textOf = (node: Element | null | undefined) =>
  (node?.textContent ?? '').replace(/\s+/g, ' ').trim();

/** The app's natural parts for `fake` in a release build; none when no fake is given, so the app's defaults hold. */
const naturalParts = (fake?: Fake): Pick<Parameters<typeof appLayer>[0], 'natural' | 'dev'> => {
  if (fake === undefined) return {};
  return { natural: fake.layer, dev: false };
};

/** The root mounted over `disk` and the natural module `fake` (the platform's own when none), with home's Settings sheet opened. */
const mount = async (disk: Map<string, string>, fake?: Fake) => {
  const store = KeyValueStore.makeStringOnly({
    get: (key) => Effect.sync(() => disk.get(key)),
    set: (key, value) => Effect.sync(() => void disk.set(key, value)),
    remove: (key) => Effect.sync(() => void disk.delete(key)),
    clear: Effect.sync(() => disk.clear()),
    size: Effect.sync(() => disk.size),
    keys: Effect.sync(() => [...disk.keys()]),
  });
  const layer = appLayer({
    source: recognizer,
    haptics: Layer.succeed(Haptics, Haptics.of({ tick: Effect.void })),
    store: Layer.succeed(KeyValueStore.KeyValueStore, store),
    chime: Layer.succeed(Chime, Chime.of({ grow: () => Effect.void })),
    voice: quietVoice,
    ...naturalParts(fake),
  });
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  await act(async () =>
    root.render(
      <RegistryProvider initialValues={[[runtime.layer, layer]]}>
        <Root />
      </RegistryProvider>,
    ),
  );
  const until = async (holds: () => boolean, ms = 2000) => {
    const begun = Date.now();
    while (!holds()) {
      if (Date.now() - begun > ms) return false;
      await act(() => new Promise((resolve) => setTimeout(resolve, 1)));
    }
    return true;
  };
  const settle = () => act(() => new Promise((resolve) => setTimeout(resolve, 5)));
  const gear = () =>
    [...host.querySelectorAll('[role="button"]')].some(
      (node) => (node.getAttribute('aria-label') ?? textOf(node)) === 'Settings',
    );
  expect(await until(gear)).toBe(true);
  await openSettings({ host, until });
  const lineNodes = () => [...document.querySelectorAll('[data-testid="natural-status"]')];
  const line = () => {
    const nodes = lineNodes();
    if (nodes.length === 0) return undefined;
    return nodes.map(textOf).join('|');
  };
  const named = (label: string) => [...document.querySelectorAll(`[aria-label="${label}"]`)];
  const tap = async (label: string) => {
    await act(async () => {
      named(label)[0]?.dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }),
      );
    });
    await settle();
  };
  /** What the line shows once it shows `want` (or what it shows at 2 s): its words and the Try again buttons. */
  const shows = async (want: string | undefined) => {
    await until(() => line() === want);
    return { line: line(), retries: named('Try again').length };
  };
  const leave = async () => {
    await act(async () => root.unmount());
    host.remove();
  };
  return { host, until, settle, line, lineNodes, named, tap, shows, leave };
};

type Mounted = Awaited<ReturnType<typeof mount>>;

/** Whether `node` comes after `before` in the document. */
const follows = (before: Element | undefined, node: Element) =>
  before !== undefined &&
  (before.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;

/** The sheet's Appearance line, which the natural line must precede. */
const appearanceLine = () =>
  [...(modalOf()?.querySelectorAll('*') ?? [])].find(
    (node) => node.children.length === 0 && textOf(node) === 'Appearance',
  );

/** Where the line and its button sit: in the sheet, after the Voice pill and before the Appearance line, in ink at AA; each Try again a button in the sheet, outside the line's text, at least 44 tall; and the sheet's own rule holds. */
const placeOf = (app: Mounted) => {
  const voice = app.named('Voice')[0];
  const appearance = appearanceLine();
  const lines = app.lineNodes();
  const retries = app.named('Try again');
  const sheet = modalOf();
  return {
    lines: lines.length,
    inSheet: lines.every((node) => sheet?.contains(node) === true),
    afterVoice: lines.every((node) => follows(voice, node)),
    beforeAppearance: lines.every((node) => appearance !== undefined && follows(node, appearance)),
    lineAA: lines.every((node) => contrastOf(node) >= AA),
    retries: retries.map((node) => ({
      role: node.getAttribute('role'),
      inSheet: sheet?.contains(node) === true,
      inLine: lines.some((line) => line.contains(node)),
      tall: parseFloat(getComputedStyle(node).minHeight) >= 44,
      text: textOf(node),
    })),
    faults: sheetFaults(document, systemScheme()),
  };
};

const placed = (retries: number) => ({
  lines: 1,
  inSheet: true,
  afterVoice: true,
  beforeAppearance: true,
  lineAA: true,
  retries: Array.from({ length: retries }, () => ({
    role: 'button',
    inSheet: true,
    inLine: false,
    tall: true,
    text: 'Try again',
  })),
  faults: [],
});

/** A fresh launch with Voice on and no files: the download starts by itself, from `MIRROR`. */
const fresh = async () => {
  const fake = moduleOf(0, false);
  const app = await mount(diskOf(), fake);
  expect(await app.until(() => app.named('Voice').length > 0)).toBe(true);
  expect(await app.shows(LINES.downloading(0))).toEqual({
    line: LINES.downloading(0),
    retries: 0,
  });
  expect(fake.installs).toEqual([MIRROR]);
  return { fake, app };
};

describe('The natural voice’s line in the Settings sheet', () => {
  it('says the download’s progress, its wait, its failure with Try again, getting ready, and nothing once ready, under the Voice pill', async () => {
    const { fake, app } = await fresh();
    expect(placeOf(app)).toEqual(placed(0));
    await fake.emit({ kind: 'progress', bytes: 41_666_256 });
    expect(await app.shows(LINES.downloading(49))).toEqual({
      line: LINES.downloading(49),
      retries: 0,
    });
    await fake.emit({ kind: 'progress', bytes: TOTAL_BYTES - 1 });
    expect(await app.shows(LINES.downloading(99))).toEqual({
      line: LINES.downloading(99),
      retries: 0,
    });
    await fake.emit({ kind: 'waiting', total: 0 });
    expect(await app.shows(LINES.waiting)).toEqual({ line: LINES.waiting, retries: 0 });
    await fake.emit({ kind: 'failed', reason: 'network' });
    expect(await app.shows(LINES.network)).toEqual({ line: LINES.network, retries: 1 });
    expect(placeOf(app)).toEqual(placed(1));
    await app.tap('Try again');
    expect(await app.shows(LINES.downloading(0))).toEqual({
      line: LINES.downloading(0),
      retries: 0,
    });
    expect(fake.installs).toEqual([MIRROR, MIRROR]);
    await fake.emit({ kind: 'done', bytes: TOTAL_BYTES });
    expect(await app.shows(LINES.ready)).toEqual({ line: LINES.ready, retries: 0 });
    expect(placeOf(app)).toEqual(placed(0));
    await fake.answer();
    expect(await app.shows(undefined)).toEqual({ line: undefined, retries: 0 });
    expect(fake.voices).toEqual(['af_heart.bin']);
    await app.tap('Voice');
    await app.tap('Voice');
    await app.settle();
    expect({ line: app.line(), installs: fake.installs.length }).toEqual({
      line: undefined,
      installs: 2,
    });
    await app.leave();
  });

  it('says each failure in its own words with one Try again, which installs again, or loads again after a failed load', async () => {
    for (const reason of ['network', 'check', 'space'] as const) {
      const { fake, app } = await fresh();
      await fake.emit({ kind: 'failed', reason });
      expect({ reason, ...(await app.shows(LINES[reason])) }).toEqual({
        reason,
        line: LINES[reason],
        retries: 1,
      });
      expect({ reason, place: placeOf(app) }).toEqual({ reason, place: placed(1) });
      await app.tap('Try again');
      expect({ reason, ...(await app.shows(LINES.downloading(0))) }).toEqual({
        reason,
        line: LINES.downloading(0),
        retries: 0,
      });
      expect({ reason, installs: fake.installs }).toEqual({ reason, installs: [MIRROR, MIRROR] });
      await app.leave();
    }
    const fake = moduleOf(FILES.length, false);
    const app = await mount(diskOf([[CHOICE_KEY, 'him']]), fake);
    expect(await app.shows(LINES.ready)).toEqual({ line: LINES.ready, retries: 0 });
    await fake.answer('engine refused');
    expect(await app.shows(LINES.load)).toEqual({ line: LINES.load, retries: 1 });
    expect(placeOf(app)).toEqual(placed(1));
    await app.tap('Try again');
    expect(await app.shows(LINES.ready)).toEqual({ line: LINES.ready, retries: 0 });
    await fake.answer();
    expect(await app.shows(undefined)).toEqual({ line: undefined, retries: 0 });
    expect({ voices: fake.voices, installs: fake.installs }).toEqual({
      voices: ['bm_george.bin', 'bm_george.bin'],
      installs: [],
    });
    await app.leave();
  });

  it('shows nothing while Off, starts the download at the first tap on, and keeps a failure for the launch across Off', async () => {
    const fake = moduleOf(3, false);
    const app = await mount(diskOf([[CHOICE_KEY, 'off']]), fake);
    expect(await app.until(() => app.named('Voice').length > 0)).toBe(true);
    await app.settle();
    expect({ line: app.line(), installs: fake.installs }).toEqual({
      line: undefined,
      installs: [],
    });
    await app.tap('Voice');
    expect(await app.shows(LINES.downloading(0))).toEqual({
      line: LINES.downloading(0),
      retries: 0,
    });
    expect(fake.installs).toEqual([MIRROR]);
    await fake.emit({ kind: 'failed', reason: 'space' });
    expect(await app.shows(LINES.space)).toEqual({ line: LINES.space, retries: 1 });
    await app.tap('Voice');
    expect(await app.shows(LINES.space)).toEqual({ line: LINES.space, retries: 1 });
    await app.tap('Voice');
    expect(await app.shows(undefined)).toEqual({ line: undefined, retries: 0 });
    await app.tap('Voice');
    expect(await app.shows(LINES.space)).toEqual({ line: LINES.space, retries: 1 });
    expect(fake.installs).toEqual([MIRROR]);
    await app.leave();
  });

  it('says a crash once: the crash launch stores the fuse blown and keeps the line once ready, a tap clears both, and a later blown launch says nothing', async () => {
    const disk = diskOf([[CHOICE_KEY, 'her']]);
    const fake = moduleOf(FILES.length, true);
    const app = await mount(disk, fake);
    expect(await app.shows(LINES.crash)).toEqual({ line: LINES.crash, retries: 0 });
    expect(placeOf(app)).toEqual(placed(0));
    expect(disk.get(FUSE_KEY)).toBe('blown');
    await fake.answer();
    await app.settle();
    expect(await app.shows(LINES.crash)).toEqual({ line: LINES.crash, retries: 0 });
    await app.leave();

    const again = moduleOf(FILES.length, false);
    const later = await mount(disk, again);
    expect(await later.shows(LINES.ready)).toEqual({ line: LINES.ready, retries: 0 });
    await again.answer();
    expect(await later.shows(undefined)).toEqual({ line: undefined, retries: 0 });
    expect(disk.get(FUSE_KEY)).toBe('blown');
    await later.tap('Voice');
    expect({ line: later.line(), fuse: disk.get(FUSE_KEY) }).toEqual({
      line: undefined,
      fuse: 'clear',
    });
    await later.leave();

    const crashed = moduleOf(FILES.length, true);
    const third = await mount(disk, crashed);
    expect(await third.shows(LINES.crash)).toEqual({ line: LINES.crash, retries: 0 });
    await third.tap('Voice');
    expect({ line: third.line(), fuse: disk.get(FUSE_KEY) }).toEqual({
      line: undefined,
      fuse: 'clear',
    });
    await third.leave();
  });

  it('shows no line over the platform’s own module, which refuses the download, and writes no natural key', async () => {
    const disk = diskOf([[CHOICE_KEY, 'her']]);
    const app = await mount(disk);
    expect(await app.until(() => app.named('Voice').length > 0)).toBe(true);
    await app.settle();
    expect(app.line()).toBeUndefined();
    await app.tap('Voice');
    await app.tap('Voice');
    expect({
      line: app.line(),
      keys: [...disk.keys()].filter((key) => key.startsWith('heartseed/natural/')),
    }).toEqual({ line: undefined, keys: [] });
    await app.leave();
  });
});
