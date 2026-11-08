/* oxlint-disable effect/noGlobals, effect/noNullish, effect/noTernary, effect/noAsyncFunction, effect/noNewPromise, effect/noFixedWaitInTests, eslint/no-await-in-loop -- When I need…'s screen rig: it mounts the root route in happy-dom's document through React's promise-based `act`, handing each turn over until the frame a test waits on lands, at most 3 s; the disk is a plain map a test reads between steps, and a parsed node's absent attributes are null. */

/**
 * When I need… and Today as a reader and a screen reader meet them, for
 * the tests of `src/need`: the root route mounted in happy-dom
 * (react-native-web) under the app's own layer teaching `promises`
 * (`TAUGHT` unless the test leaves the part out), over a disk in a plain
 * map that outlives launches and whose listings can fail every attempt (an
 * unread garden), a recognizer that recites the app's promise at once on
 * every listen (so a recital of any other verse is heard short, and still
 * kept), a voice that never speaks, a silent chime and haptics, and
 * Effect's `Clock` frozen where the test sets it.
 *
 * Every frame (each DOM mutation batch) is held to the screens' rules:
 * - at most one heading;
 * - `Listening` only on Today, and never beside `When I need…`;
 * - on When I need…: no control inside a scroll view but a promise, no
 *   node of Today or the field, the bar's `Today` outside the scroll view,
 *   every control at least 44 tall, every text at AA on what lies behind
 *   it;
 * - on Today: `When I need…` never inside the scroll view, at least 44
 *   tall, and no node of When I need….
 * Each fault is kept with the frame's heading.
 */

import { RegistryProvider } from '@effect/atom-react';
import { Effect, Layer, Logger } from 'effect';
import * as KeyValueStore from 'effect/persistence/KeyValueStore';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import passage from 'virtual:heartseed-passage';

import Root from '../../app/index';
import { appLayer, runtime } from '../app';
import { recite, scriptedSource } from '../dictation/script';
import { Chime } from '../garden';
import { TAUGHT } from '../promises';
import { Haptics, type Recall } from '../sayit';
import { VoiceSource, VoiceUnavailable } from '../voice';
import { clockOf, type Time } from './clock';
import { AA, contrastOf } from './contrast';
import { keyOf } from './garden-model';

const CONTROLS = '[role="button"],[role="radio"],[role="switch"],[role="checkbox"],input,a[href]';

/** The device's disk, which outlives every launch, and whether every listing fails (an unread garden). */
export interface NeedDevice {
  readonly disk: Map<string, string>;
  unread: boolean;
}

const failure = (method: string, key: string) =>
  new KeyValueStore.KeyValueStoreError({ message: `test: ${method}`, method, key });

const storeOf = (device: NeedDevice) =>
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
export const needDevice = (entries: readonly (readonly [string, string])[]): NeedDevice => ({
  disk: new Map(entries),
  unread: false,
});

/** Text as a reader sees it: whitespace collapsed. */
export const textOf = (node: Element | null | undefined) =>
  (node?.textContent ?? '').replace(/\s+/g, ' ').trim();

/** A node's name: its label, else its text. */
const nameOf = (node: Element) => node.getAttribute('aria-label') ?? textOf(node);

const scrolls = (node: Element) => {
  const style = getComputedStyle(node);
  return /auto|scroll/.test(`${style.overflowY} ${style.overflow}`);
};

/** Whether `node` lies inside a scroll view. */
export const inScroll = (node: Element) => {
  for (let at = node.parentElement; at !== null; at = at.parentElement)
    if (scrolls(at)) return true;
  return false;
};

/** Whether `node` is at least 44 tall by its own minimum height. */
const tall = (node: Element) => parseFloat(getComputedStyle(node).minHeight) >= 44;

/** Every node holding text of its own below AA on what lies behind it, by its text. */
const faint = (host: Element) =>
  [...host.querySelectorAll('*')]
    .filter((node) =>
      [...node.childNodes].some(
        (child) => child.nodeType === 3 && (child.textContent ?? '').trim() !== '',
      ),
    )
    .filter((node) => contrastOf(node) < AA)
    .map((node) => textOf(node).slice(0, 24));

const NEED = 'When I need…';

/** What one frame shows wrong of the screens' rules (above). */
export const needFaults = (host: Element): string[] => {
  const headings = [...host.querySelectorAll('[role="heading"]')].map(textOf);
  const controls = [...host.querySelectorAll(CONTROLS)];
  const names = controls.map(nameOf);
  const out: string[] = [];
  if (headings.length > 1) out.push(`${headings.length} headings: ${headings.join('|')}`);
  if (names.includes('Listening') && !headings.includes('Today')) out.push('Listening off Today');
  if (names.includes('Listening') && names.includes(NEED)) out.push(`Listening beside ${NEED}`);
  if (names.includes(NEED) && !headings.includes('Today')) out.push(`${NEED} off Today`);
  if (headings.includes(NEED)) out.push(...onNeedFaults(host, controls));
  if (headings.includes('Today')) out.push(...onTodayFaults(host, controls));
  return out;
};

/** What a frame of When I need… shows wrong: a control in the scroll view but a promise, one under 44, no bar `Today`, a node of Today or the field, or a faint text. */
const onNeedFaults = (host: Element, controls: readonly Element[]) => {
  const out: string[] = [];
  for (const node of controls) {
    if (inScroll(node) && node.getAttribute('data-testid') !== 'promise')
      out.push(`a control in the scroll view: ${nameOf(node)}`);
    if (!tall(node)) out.push(`a control under 44: ${nameOf(node)}`);
  }
  if (!controls.some((node) => nameOf(node) === 'Today' && !inScroll(node)))
    out.push('no bar Today');
  for (const id of ['session', 'reference', 'row', 'sown'])
    if (host.querySelector(`[data-testid="${id}"]`) !== null) out.push(`a ${id} node on ${NEED}`);
  if (controls.some((node) => ['Say it', 'Next', 'Your field'].includes(nameOf(node))))
    out.push(`a Today control on ${NEED}`);
  for (const text of faint(host)) out.push(`faint: ${text}`);
  return out;
};

/** What a frame of Today shows wrong of When I need…: its way in the scroll view or under 44, or a card of it. */
const onTodayFaults = (host: Element, controls: readonly Element[]) => {
  const out: string[] = [];
  for (const node of controls.filter((each) => nameOf(each) === NEED)) {
    if (inScroll(node)) out.push(`${NEED} in the scroll view`);
    if (!tall(node)) out.push(`${NEED} under 44`);
  }
  if (host.querySelector('[data-testid="need-card"]') !== null) out.push('a need card on Today');
  return out;
};

/** The leave of each launch still mounted: the next launch leaves any a failed test left. */
const mounted = new Set<() => Promise<unknown>>();

/** A launch of the root over `device` at `time.now` on Effect's clock, the layer teaching `promises` (the part left out when null), the recital's words `pace` ms apart. */
export const launchNeed = async (
  device: NeedDevice,
  time: Time,
  promises: readonly string[] | null = TAUGHT,
  pace = 1,
) => {
  for (const left of [...mounted]) await left();
  const parts = {
    source: scriptedSource(recite(passage.text, { every: 5, pace })),
    haptics: Layer.succeed(Haptics, Haptics.of({ tick: Effect.void })),
    store: storeOf(device),
    chime: Layer.succeed(Chime, Chime.of({ grow: () => Effect.void })),
    voice: silentVoice,
  };
  const layer = (promises === null ? appLayer(parts) : appLayer({ ...parts, promises })).pipe(
    Layer.provideMerge(Layer.merge(clockOf(time), Logger.layer([]))),
  );
  const host = document.createElement('div');
  document.body.append(host);
  const faults: string[] = [];
  const frames = { need: 0, today: 0, listening: 0, offer: 0 };
  const headings = () => [...host.querySelectorAll('[role="heading"]')].map(textOf);
  const frame = () => {
    const shown = headings();
    const names = [...host.querySelectorAll(CONTROLS)].map(nameOf);
    if (shown.includes(NEED)) frames.need += 1;
    if (shown.includes('Today')) frames.today += 1;
    if (names.includes('Listening')) frames.listening += 1;
    if (names.includes(NEED)) frames.offer += 1;
    for (const fault of needFaults(host))
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
    const start = Date.now();
    while (!holds()) {
      if (Date.now() - start > ms) return false;
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
  return {
    host,
    faults,
    frames,
    headings,
    until,
    tap,
    has: (label: string) => named(label) !== undefined,
    /** Every control's name, in document order. */
    names: () => controls().map(nameOf),
    /** The references Today shows. */
    references: () => [...host.querySelectorAll('[data-testid="reference"]')].map(textOf),
    /** The counts lines Today shows. */
    counts: () => [...host.querySelectorAll('[data-testid="session"]')].map(textOf),
    /** When I need…'s cards: each title, promise names and to-learn line. */
    cards: () =>
      [...host.querySelectorAll('[data-testid="need-card"]')].map((card) => ({
        title: textOf(card.querySelector('[data-testid="need-title"]')),
        heading: card.querySelector('[role="heading"]') !== null,
        promises: [...card.querySelectorAll('[data-testid="promise"]')].map(nameOf),
        toLearn: [...card.querySelectorAll('[data-testid="to-learn"]')].map(textOf),
      })),
    leave,
  };
};

export type NeedLaunch = Awaited<ReturnType<typeof launchNeed>>;
