/* oxlint-disable effect/noGlobals, effect/noNullish, effect/noTernary, effect/noAsyncFunction, effect/noNewPromise, effect/noFixedWaitInTests, eslint/no-await-in-loop -- the root's screen rig: it mounts the root route in happy-dom's document through React's promise-based `act`, handing each turn over until the frame a test waits on lands, at most 3 s; the disk is a plain map a test reads between steps, and a parsed node's absent attributes are null. */

/**
 * Home and Today as a reader and a screen reader meet them, for the home
 * walk and the screens' look: the root route (it takes
 * no props, so a launch on a read garden opens home) mounted in happy-dom
 * (react-native-web) under the app's own layer teaching `promises`
 * (`TAUGHT` unless the test leaves the part out), over a disk in a plain
 * map that outlives launches and whose listings can fail every attempt (an
 * unread garden), a recognizer that recites the app's promise at once on
 * every listen (so a recital of any other verse is heard short, and still
 * kept), a voice that never speaks, a silent chime and haptics, a host
 * that reports the app `active` until the launch's `wake` sends a
 * `background` then an `active` (a return to the foreground), and
 * Effect's `Clock` frozen where the test sets it.
 *
 * Every frame (each DOM mutation batch) is held to the root's frame rule
 * (`rootFaults`, over the garden read or not), to the look's rule, and to
 * the screens' rules: at most one heading; `Listening` only on Today; and
 * any check the launch is given (the home walk's `homeFaults` on the
 * field). Each fault is kept with the frame's heading.
 */

import { RegistryProvider } from '@effect/atom-react';
import { Effect, Layer, Logger, Option, Queue, Stream } from 'effect';
import * as KeyValueStore from 'effect/persistence/KeyValueStore';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import passage from 'virtual:heartseed-passage';

import Root from '../../app/index';
import { appLayer, runtime } from '../app';
import { recite, scriptedSource } from '../dictation/script';
import { Foreground } from '../foreground';
import { Chime } from '../garden';
import { TAUGHT } from '../promises';
import { Haptics, type Recall } from '../sayit';
import { VoiceSource, VoiceUnavailable } from '../voice';
import { clockOf, type Time } from './clock';
import { deadline } from './elapsed';
import { keyOf } from './garden-model';
import { lookFaults } from './look';
import { END, rootFaults } from './root-rule';

const CONTROLS = '[role="button"],[role="radio"],[role="switch"],[role="checkbox"],input,a[href]';

/** The device's disk, which outlives every launch, and whether every listing fails (an unread garden). */
export interface RootDevice {
  readonly disk: Map<string, string>;
  unread: boolean;
}

const failure = (method: string, key: string) =>
  new KeyValueStore.KeyValueStoreError({ message: `test: ${method}`, method, key });

const storeOf = (device: RootDevice) =>
  Layer.succeed(
    KeyValueStore.KeyValueStore,
    KeyValueStore.makeStringOnly({
      get: (key) => Effect.sync(() => device.disk.get(key)),
      set: (key, value) => Effect.sync(() => void device.disk.set(key, value)),
      remove: (key) => Effect.fail(failure('remove', key)),
      clear: Effect.fail(failure('clear', '')),
      size: Effect.sync(() => device.disk.size),
      keys: Effect.suspend(() => {
        if (device.unread) return Effect.fail(failure('keys', ''));
        return Effect.succeed([...device.disk.keys()]);
      }),
    }),
  );

const silentVoice = Layer.succeed(
  VoiceSource,
  VoiceSource.of({
    voices: Effect.succeed([]),
    speak: () => Effect.fail(VoiceUnavailable.make({ reason: 'test: no voice' })),
    pause: Effect.void,
    resume: Effect.void,
    stop: Effect.void,
    subscribe: () => Effect.void,
  }),
);

/** A Good recall of `reference` at `startedAt` as the store holds it: its key and its text. */
export const recordOf = (reference: string, startedAt: number): readonly [string, string] => {
  const recall: Recall = {
    reference,
    startedAt,
    offset: 0,
    grade: 3,
    suggested: 3,
    words: 10,
    missed: 0,
    peeked: 0,
    extra: 0,
  };
  return [keyOf(recall), JSON.stringify(recall)];
};

/** A device over `entries`, its listings read. */
export const rootDevice = (entries: readonly (readonly [string, string])[]): RootDevice => ({
  disk: new Map(entries),
  unread: false,
});

/** Text as a reader sees it: whitespace collapsed. */
export const textOf = (node: Element | null | undefined) =>
  (node?.textContent ?? '').replace(/\s+/g, ' ').trim();

/** A node's name: its label, else its text. */
const nameOf = (node: Element) => node.getAttribute('aria-label') ?? textOf(node);

/** What one frame shows wrong of the screens' rules (above). */
export const screenFaults = (host: Element): string[] => {
  const headings = [...host.querySelectorAll('[role="heading"]')].map(textOf);
  const names = [...host.querySelectorAll(CONTROLS)].map(nameOf);
  const out: string[] = [];
  if (headings.length > 1) out.push(`${headings.length} headings: ${headings.join('|')}`);
  if (names.includes('Listening') && !headings.includes('Today')) out.push('Listening off Today');
  return out;
};

/** The host's side of the foreground: the subscription's queue once it starts, the states offered to it, and the pulls it made. */
interface Host {
  live: Option.Option<Queue.Queue<string>>;
  offered: number;
  pulls: number;
}

/** The foreground over `host`: `active` at the subscription first, then each state offered, one pull at a time. */
const foregroundOf = (host: Host) =>
  Layer.succeed(
    Foreground,
    Foreground.of({
      states: Stream.fromPull(
        Effect.map(Queue.unbounded<string>(), (queue) => {
          host.live = Option.some(queue);
          let first = true;
          return Effect.suspend(() => {
            host.pulls += 1;
            if (!first) return Effect.map(Queue.take(queue), (state) => [state] as const);
            first = false;
            return Effect.succeed(['active'] as const);
          });
        }),
      ),
    }),
  );

/** The leave of each launch still mounted: the next launch leaves any a failed test left. */
const mounted = new Set<() => Promise<unknown>>();

/** A launch of the root over `device` at `time.now` on Effect's clock, the layer teaching `promises` (the part left out when null), the recital's words `pace` ms apart, every frame also held to `check` (none by default). */
export const launchRoot = async (
  device: RootDevice,
  time: Time,
  promises: readonly string[] | null = TAUGHT,
  pace = 1,
  check: (host: Element) => readonly string[] = () => [],
) => {
  for (const left of [...mounted]) await left();
  const foreground: Host = { live: Option.none(), offered: 0, pulls: 0 };
  const parts = {
    source: scriptedSource(recite(passage.text, { every: 5, pace })),
    haptics: Layer.succeed(Haptics, Haptics.of({ tick: Effect.void })),
    store: storeOf(device),
    chime: Layer.succeed(Chime, Chime.of({ grow: () => Effect.void })),
    voice: silentVoice,
    foreground: foregroundOf(foreground),
  };
  const layer = (promises === null ? appLayer(parts) : appLayer({ ...parts, promises })).pipe(
    Layer.provideMerge(Layer.merge(clockOf(time), Logger.layer([]))),
  );
  const garden = device.unread ? 'unread' : 'read';
  const host = document.createElement('div');
  document.body.append(host);
  const faults: string[] = [];
  const frames = { today: 0, end: 0, listening: 0 };
  const headings = () => [...host.querySelectorAll('[role="heading"]')].map(textOf);
  const looks = new Map<string, readonly string[]>();
  const frame = () => {
    const shown = headings();
    const names = [...host.querySelectorAll(CONTROLS)].map(nameOf);
    if (shown.includes('Today')) frames.today += 1;
    if (shown.includes(END)) frames.end += 1;
    if (names.includes('Listening')) frames.listening += 1;
    for (const fault of [
      ...rootFaults(host, garden),
      ...screenFaults(host),
      ...lookFaults(host, undefined, looks),
      ...check(host),
    ])
      if (faults.length < 8) faults.push(`${fault} (on ${shown.join('|')})`);
  };
  const watch = new MutationObserver(frame);
  watch.observe(host, { subtree: true, childList: true, attributes: true, characterData: true });
  const root = createRoot(host);
  await act(async () =>
    root.render(
      <RegistryProvider initialValues={[[runtime.layer, layer]]}>
        <Root />
      </RegistryProvider>,
    ),
  );
  frame();
  const until = async (holds: () => boolean, ms = 3000) => {
    const late = deadline(ms);
    while (!holds()) {
      if (late()) return false;
      await act(() => new Promise((resolve) => setTimeout(resolve, 1)));
    }
    return true;
  };
  const controls = () => [...host.querySelectorAll(CONTROLS)];
  const named = (label: string) => controls().find((node) => nameOf(node) === label);
  /** Taps the control named `label`; false when none shows. */
  const tap = async (label: string) => {
    const node = named(label);
    if (node === undefined) return false;
    await act(async () => {
      node.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
    });
    return true;
  };
  const leave = async () => {
    if (!mounted.delete(leave)) return;
    watch.disconnect();
    await act(async () => root.unmount());
    host.remove();
  };
  mounted.add(leave);
  /** Whether the subscription has taken every state offered so far and waits for the next. */
  const taken = () => Option.isSome(foreground.live) && foreground.pulls === foreground.offered + 2;
  /** A return to the foreground: the host sends `background` then `active` once the subscription reads; false when it never took them. */
  const wake = async () => {
    if (!(await until(taken))) return false;
    for (const state of ['background', 'active']) {
      if (Option.isNone(foreground.live)) return false;
      Queue.offerUnsafe(foreground.live.value, state);
      foreground.offered += 1;
    }
    return until(taken);
  };
  return {
    host,
    faults,
    frames,
    headings,
    until,
    tap,
    wake,
    has: (label: string) => named(label) !== undefined,
    /** Every control's name, in document order. */
    names: () => controls().map(nameOf),
    /** The references Today shows. */
    references: () => [...host.querySelectorAll('[data-testid="reference"]')].map(textOf),
    /** The counts lines Today shows. */
    counts: () => [...host.querySelectorAll('[data-testid="session"]')].map(textOf),
    /** The line of what grew at the end of a run (`The field is tended`). */
    grew: () => [...host.querySelectorAll('[data-testid="grew"]')].map(textOf),
    /** Each grown verse's name at the end of a run, `<reference>, <stage>`. */
    grown: () =>
      [...host.querySelectorAll('[data-testid="grown"]')].map(
        (node) => node.getAttribute('aria-label') ?? '',
      ),
    leave,
  };
};

export type RootLaunch = Awaited<ReturnType<typeof launchRoot>>;
