/* oxlint-disable effect/noGlobals, effect/noNullish, effect/noAsyncFunction, effect/noNewPromise, effect/noFixedWaitInTests, eslint/no-await-in-loop -- the session's screen rig: it mounts the root route in happy-dom's document through React's promise-based `act`; the runtime's forked Effect work runs on the host's clock, so each turn is handed over in `act` until the frame a test waits on lands, at most 3 s; the disk and the faults are plain maps and sets a test changes between steps, and a parsed node's absent attributes are null. */

/**
 * The daily session as a reader and a screen reader meet it, for the
 * session's screen tests: the root route mounted in happy-dom
 * (react-native-web) under the app's own layer over a store in memory (a
 * disk that outlives launches), a recognizer whose recitals the test
 * holds open and finishes, a voice source with no voice, a silent chime
 * and haptics, and Effect's `Clock` provided under the app's layer, its
 * instant frozen where the test sets it (its sleeps are the host's).
 *
 * Every frame (each DOM mutation batch) is held to the screen's rules and
 * each fault kept: the Minutes group, its radios, the Voice switch and the
 * counts line show only under Today's heading, never in a pending or a
 * first-minute frame; on Today the group holds the four radios `2 min`,
 * `5 min`, `10 min` and `20 min` in that order, exactly one checked, beside
 * at most one `Voice` switch; neither lies inside a scroll view, and the
 * scroll view holds no control but a missed word's mark to peek at (the
 * action button and the grades sit in the footer under it). At most one
 * counts line shows, at the top
 * of the scroll view above the reference, in the line's form and named as
 * it reads.
 */

import { RegistryProvider } from '@effect/atom-react';
import { expect } from 'bun:test';
import { Effect, Layer, MutableRef, Option } from 'effect';
import * as KeyValueStore from 'effect/persistence/KeyValueStore';
import type * as Atom from 'effect/reactivity/Atom';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import passage from 'virtual:heartseed-passage';

import Root from '../../app/index';
import { appLayer, runtime } from '../app';
import { DictationSource, DictationUnavailable } from '../dictation';
import { CHAIN, type DictationEvent } from '../dictation/attempt';
import { recite } from '../dictation/script';
import { Chime } from '../garden';
import { Haptics } from '../sayit';
import { VoiceSource, VoiceUnavailable } from '../voice';
import { clockOf } from './clock';

/** The four radios' names, in the order the group shows them. */
export const MINUTE_NAMES = ['2 min', '5 min', '10 min', '20 min'] as const;

/** The session's nodes, which only Today shows. */
const SESSION_NODES =
  '[role="radiogroup"][aria-label="Minutes"],[role="radio"][aria-label$=" min"],[role="switch"],[data-testid="session"]';

/** The device's disk, which outlives every launch, and each write it took, in order. */
export interface Device {
  readonly disk: Map<string, string>;
  readonly writes: string[];
}

export const deviceOf = (entries: Iterable<readonly [string, string]> = []): Device => ({
  disk: new Map(entries),
  writes: [],
});

/** How a launch's store fails: its listings (`unread`: every one fails; `held`: each waits for `release`), the keys whose reads throw, and the keys whose writes throw now. */
export interface Faults {
  readonly listing: 'ok' | 'unread' | 'held';
  readonly failGet: ReadonlySet<string>;
  readonly refuse: Set<string>;
}

export const faultsOf = (faults: Partial<Faults> = {}): Faults => ({
  listing: faults.listing ?? 'ok',
  failGet: faults.failGet ?? new Set(),
  refuse: faults.refuse ?? new Set(),
});

const failure = (method: string, key: string) =>
  new KeyValueStore.KeyValueStoreError({ message: `test: ${method} ${key}`, method, key });

/** The store over `device` with `faults`; `gate` holds a held launch's listings. */
const storeOf = (device: Device, faults: Faults, gate: Promise<void>) =>
  Layer.succeed(
    KeyValueStore.KeyValueStore,
    KeyValueStore.makeStringOnly({
      get: (key) =>
        Effect.suspend(() => {
          if (faults.failGet.has(key)) return Effect.fail(failure('get', key));
          return Effect.succeed(device.disk.get(key));
        }),
      set: (key, value) =>
        Effect.suspend(() => {
          if (faults.refuse.has(key)) return Effect.fail(failure('set', key));
          device.disk.set(key, value);
          device.writes.push(key);
          return Effect.void;
        }),
      remove: (key) => Effect.fail(failure('remove', key)),
      clear: Effect.fail(failure('clear', '')),
      size: Effect.sync(() => device.disk.size),
      keys: Effect.andThen(
        Effect.suspend(() => {
          if (faults.listing === 'held') return Effect.promise(() => gate);
          return Effect.void;
        }),
        Effect.suspend(() => {
          if (faults.listing === 'unread') return Effect.fail(failure('keys', ''));
          return Effect.succeed([...device.disk.keys()]);
        }),
      ),
    }),
  );

/** How the next recital is heard: open until finished, with the words of `skip` unsaid; open until the recognizer fails at the finish, unheard (`dropped`); or refused at its listen. */
export type Hearing =
  | { readonly kind: 'heard'; readonly skip: readonly number[] }
  | { readonly kind: 'dropped' }
  | { readonly kind: 'refused' };

/** A recognizer that opens each listen and sends nothing more until `finish`, which sends the recital whole (less `skip`) and its end, or a dropped recital's failure; a refused listen fails. */
const recognizerOf = (plan: MutableRef.MutableRef<Hearing>) => {
  const listener = MutableRef.make<Option.Option<(event: DictationEvent) => void>>(Option.none());
  const open = MutableRef.make<Option.Option<number>>(Option.none());
  const emit = (event: DictationEvent) => {
    Option.map(MutableRef.get(listener), (send) => send(event));
  };
  const event = (session: number, kind: DictationEvent['kind']): DictationEvent => ({
    session,
    kind,
    final: false,
    runs: [],
    reason: '',
  });
  return Layer.succeed(
    DictationSource,
    DictationSource.of({
      engines: () => Effect.succeed(CHAIN.map((engine) => ({ engine, status: 'ready' }))),
      listen: (session) =>
        Effect.suspend(() => {
          const hearing = MutableRef.get(plan);
          if (hearing.kind === 'refused')
            return Effect.fail(DictationUnavailable.make({ reason: 'test: refused' }));
          MutableRef.set(open, Option.some(session));
          emit(event(session, 'start'));
          return Effect.void;
        }),
      finish: Effect.sync(() => {
        const session = MutableRef.get(open);
        MutableRef.set(open, Option.none());
        if (Option.isNone(session)) return;
        const hearing = MutableRef.get(plan);
        if (hearing.kind !== 'heard') {
          emit({ ...event(session.value, 'fail'), reason: 'test: dropped' });
          return;
        }
        for (const step of recite(passage.text, { skip: hearing.skip, every: 5, pace: 1 }))
          emit({ ...event(session.value, 'result'), final: step.final, runs: step.runs });
        emit(event(session.value, 'end'));
      }),
      cancel: Effect.sync(() => MutableRef.set(open, Option.none())),
      subscribe: (next) =>
        Effect.asVoid(
          Effect.acquireRelease(
            Effect.sync(() => MutableRef.set(listener, Option.some(next))),
            () => Effect.sync(() => MutableRef.set(listener, Option.none())),
          ),
        ),
    }),
  );
};

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

/** Text as a reader sees it: whitespace collapsed. */
export const text = (node: Element | null | undefined) =>
  (node?.textContent ?? '').replace(/\s+/g, ' ').trim();

/** The scroll view `node` lies inside: its nearest ancestor that scrolls its overflow, none when it is fixed on screen. */
const scrollerOf = (node: Element): Element | null => {
  for (let at = node.parentElement; at !== null; at = at.parentElement) {
    const style = getComputedStyle(at);
    if (/auto|scroll/.test(`${style.overflowY} ${style.overflow}`)) return at;
  }
  return null;
};

export const scrolled = (node: Element) => scrollerOf(node) !== null;

const CONTROLS = '[role="button"],[role="radio"],[role="switch"],[role="checkbox"],input,a[href]';

/** Whether a control in Today's scroll view is the one kind allowed there: a missed word's mark, to peek at. */
const recitals = (node: Element) => node.closest('[data-testid^="word-"]') !== null;

/** The choices as a frame shows them: the radios' names in order and the one checked, and the switch's state; none for a control not shown. */
export const choicesOf = (host: Element) => {
  const groups = host.querySelectorAll('[role="radiogroup"][aria-label="Minutes"]');
  const radios = [...(groups[0]?.querySelectorAll('[role="radio"]') ?? [])];
  const switches = [...host.querySelectorAll('[role="switch"]')];
  return {
    groups: groups.length,
    names: radios.map((radio) => radio.getAttribute('aria-label')),
    checked: radios
      .filter((radio) => radio.getAttribute('aria-checked') === 'true')
      .map((radio) => radio.getAttribute('aria-label')),
    switches: switches.map(
      (each) => `${each.getAttribute('aria-label')}:${each.getAttribute('aria-checked')}`,
    ),
  };
};

/** The counts line's form: what is left to tend, the new piece and the minutes, or nothing left; never a backlog or a word for late. */
const COUNTS_FORM =
  /^(Nothing to tend now|(?:[1-9]\d* to tend · )?(?:1 new · )?about [1-9]\d* min)$/;

/** The counts lines a frame shows, each as it reads. */
export const countsIn = (host: Element) =>
  [...host.querySelectorAll('[data-testid="session"]')].map(text);

/** What one Today frame shows wrong of the counts line: more than one, another form, named otherwise than it reads, or not at the top of the scroll view above the reference (the done state shows none, and the line alone). */
const countsFaults = (host: Element): string[] => {
  const nodes = [...host.querySelectorAll('[data-testid="session"]')];
  if (nodes.length > 1) return [`${nodes.length} counts lines`];
  const out: string[] = [];
  const reference = host.querySelector('[data-testid="reference"]');
  for (const node of nodes) {
    if (!COUNTS_FORM.test(text(node))) out.push(`the counts read ${text(node)}`);
    const label = node.getAttribute('aria-label');
    if (label !== null && label !== text(node)) out.push(`the counts named ${label}`);
    if (!scrolled(node)) out.push('the counts outside the scroll view');
    const following = Node.DOCUMENT_POSITION_FOLLOWING;
    if (reference === null) {
      if (text(node) !== 'Nothing to tend now')
        out.push('a counts line left to tend with no reference');
      continue;
    }
    if ((node.compareDocumentPosition(reference) & following) !== following)
      out.push('the counts not above the reference');
  }
  return out;
};

/** What one frame shows wrong of the session's controls. */
const frameFaults = (host: Element): string[] => {
  const headings = [...host.querySelectorAll('[role="heading"]')].map(text);
  if (!headings.includes('Today')) {
    if (host.querySelector(SESSION_NODES) !== null)
      return [`the session's nodes under ${headings.join('|') || 'no heading'}`];
    return [];
  }
  const out: string[] = [];
  const shown = choicesOf(host);
  if (shown.groups > 1) out.push(`${shown.groups} Minutes groups`);
  if (shown.groups === 1) {
    if (JSON.stringify(shown.names) !== JSON.stringify(MINUTE_NAMES))
      out.push(`radios ${shown.names.join(',')}`);
    if (shown.checked.length !== 1) out.push(`${shown.checked.length} minutes checked`);
  }
  if (shown.switches.length > 1) out.push(`${shown.switches.length} switches`);
  if (shown.switches.some((each) => !/^Voice:(true|false)$/.test(each)))
    out.push(`a switch ${shown.switches.join(',')}`);
  out.push(...countsFaults(host));
  for (const node of host.querySelectorAll(CONTROLS)) {
    if (!scrolled(node) || recitals(node)) continue;
    out.push(`a control in the scroll view: ${node.getAttribute('aria-label') ?? text(node)}`);
  }
  return out;
};

/** The leave of each launch still mounted: the next launch leaves any a failed test left. */
const mounted = new Set<() => Promise<void>>();

/**
 * A launch of the root over `device` with `faults`, at `time.now` on
 * Effect's clock, its registry given `seeded` atoms' values beside the
 * app's layer. Every frame is held to the screen's rules; the faults found
 * are kept in `faults`, and `frames` counts the frames seen by what they
 * showed.
 */
export const launch = async (
  device: Device,
  faults: Faults,
  time: { now: number | null },
  seeded: readonly (readonly [Atom.Atom<unknown>, unknown, Atom.InitialValueOptions])[] = [],
) => {
  for (const left of [...mounted]) await left();
  const gate = Promise.withResolvers<void>();
  const hearing = MutableRef.make<Hearing>({ kind: 'heard', skip: [] });
  const layer = appLayer({
    source: recognizerOf(hearing),
    haptics: Layer.succeed(Haptics, Haptics.of({ tick: Effect.void })),
    store: storeOf(device, faults, gate.promise),
    chime: Layer.succeed(Chime, Chime.of({ grow: () => Effect.void })),
    voice: silentVoice,
  }).pipe(Layer.provide(clockOf(time)));
  const host = document.createElement('div');
  document.body.append(host);
  const found: string[] = [];
  const frames = { pending: 0, today: 0, first: 0, listening: 0, shown: 0, counts: 0 };
  /** Each change of the checked radio and of the switch over the launch's frames, in order: the first entry is what the first frame showing it showed. */
  const seen = { minutes: [] as string[], voice: [] as string[] };
  const note = (into: string[], value: string | undefined) => {
    if (value !== undefined && into.at(-1) !== value) into.push(value);
  };
  const headings = () => [...host.querySelectorAll('[role="heading"]')].map(text);
  const buttonNamed = (label: string) =>
    [...host.querySelectorAll(CONTROLS)].find((node) => node.getAttribute('aria-label') === label);
  const frame = () => {
    const shown = headings();
    if (shown.length === 0) frames.pending += 1;
    else if (shown.includes('Today')) frames.today += 1;
    else frames.first += 1;
    if (buttonNamed('Listening') !== undefined) frames.listening += 1;
    const choices = choicesOf(host);
    if (choices.groups > 0 || choices.switches.length > 0) frames.shown += 1;
    if (countsIn(host).length > 0) frames.counts += 1;
    if (choices.checked.length === 1) note(seen.minutes, choices.checked[0] ?? undefined);
    note(seen.voice, choices.switches[0]);
    found.push(...frameFaults(host));
  };
  const watch = new MutationObserver(frame);
  watch.observe(host, { subtree: true, childList: true, attributes: true, characterData: true });
  const root = createRoot(host);
  await act(async () =>
    root.render(
      <RegistryProvider initialValues={[[runtime.layer, layer], ...seeded]}>
        <Root />
      </RegistryProvider>,
    ),
  );
  frame();
  /** Waits on the host's clock until `holds`, at most `ms`. */
  const until = async (holds: () => boolean, ms = 3000) => {
    const start = Date.now();
    while (!holds()) {
      if (Date.now() - start > ms) return false;
      await act(() => new Promise((resolve) => setTimeout(resolve, 1)));
    }
    return true;
  };
  const tap = async (label: string) => {
    const node = buttonNamed(label);
    expect([label, node !== undefined]).toEqual([label, true]);
    await act(async () => {
      node?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
    });
  };
  const leave = async () => {
    if (!mounted.delete(leave)) return;
    gate.resolve();
    watch.disconnect();
    await act(async () => root.unmount());
    host.remove();
  };
  mounted.add(leave);
  return {
    host,
    faults: found,
    frames,
    seen,
    hearing,
    headings,
    until,
    tap,
    has: (label: string) => buttonNamed(label) !== undefined,
    choices: () => choicesOf(host),
    counts: () => countsIn(host),
    release: () => gate.resolve(),
    leave,
  };
};

export type Launch = Awaited<ReturnType<typeof launch>>;
