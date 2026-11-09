/* oxlint-disable effect/noGlobals, effect/noNullish, effect/noTernary, effect/noAsyncFunction, effect/noNewPromise, effect/noFixedWaitInTests, eslint/no-await-in-loop -- the run's screen rig: it mounts the root route in happy-dom's document through React's promise-based `act`; the runtime's forked Effect work runs on the host's clock, so each turn is handed over in `act` until the frame a test waits on lands, at most 3 s; the disk and the faults are plain maps and flags a test changes between steps, and a parsed node's absent attributes are null. */

/**
 * Today's run as a reader and a screen reader meet it, for the tests of
 * `src/run`: the root route mounted in happy-dom (react-native-web) under
 * the app's own layer, given its pieces through `appLayer`'s `pieces`, over
 * a store in memory (a disk that outlives launches) whose listings can fail
 * every attempt (an unread garden) and whose recall writes can be refused,
 * a recognizer that hears the text the test names once the recital is
 * finished (or fails it, unheard), at once or held back while the recital
 * finishes until the test releases it, Dictation's own cancel and status
 * for the test to call and read, a voice source with no voice, a silent
 * chime and haptics, and Effect's `Clock` provided under the app's layer,
 * its instant frozen where the test sets it.
 *
 * Every Today frame (each DOM mutation batch) is held to the footer rule,
 * over the whole tree: no control lies inside a scroll view but a missed
 * word's mark (`Missed word <n>`), so the action button and the `Grade`
 * group never do, and at most one action button (`Say it`, `Listening`,
 * `Next`) shows. Each fault is kept with the frame's actions.
 */

import { RegistryProvider } from '@effect/atom-react';
import { Context, Effect, Layer, Logger, MutableRef, Option } from 'effect';
import * as KeyValueStore from 'effect/persistence/KeyValueStore';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import passage from 'virtual:heartseed-passage';

import Root from '../../app/index';
import { appLayer, runtime } from '../app';
import { Dictation, DictationSource, type DictationEvent } from '../dictation';
import { CHAIN } from '../dictation/attempt';
import { recite } from '../dictation/script';
import type { Foreground } from '../foreground';
import { Chime } from '../garden';
import { sourceWords } from '../matcher/words';
import { Haptics } from '../sayit';
import type { TextPiece } from '../session';
import { VoiceSource, VoiceUnavailable } from '../voice';
import { clockOf } from './clock';
import { PREFIX } from './garden-model';

/** The app's own piece: the passage, its own group. */
export const PASSAGE: TextPiece = {
  reference: passage.reference,
  text: passage.text,
  words: sourceWords(passage.text).length,
  group: passage.reference,
};

/** The action button's names. */
export const ACTIONS = ['Say it', 'Listening', 'Next'] as const;

/** A missed word's mark, the one control allowed inside Today's scroll view. */
const PEEK_MARK = /^Missed word \d+$/;

const CONTROLS =
  '[role="button"],[role="radio"],[role="switch"],[role="checkbox"],[role="radiogroup"],input,a[href]';

/** The device's disk, which outlives every launch, and each key written, in order. */
export interface Device {
  readonly disk: Map<string, string>;
  readonly writes: string[];
}

export const deviceOf = (entries: Iterable<readonly [string, string]> = []): Device => ({
  disk: new Map(entries),
  writes: [],
});

/** How a launch's store fails: every listing (`unread`), and whether recall writes are refused now. */
export interface Faults {
  unread: boolean;
  refuse: boolean;
}

const failure = (method: string, key: string) =>
  new KeyValueStore.KeyValueStoreError({ message: `test: ${method}`, method, key });

const storeOf = (device: Device, faults: Faults) =>
  Layer.succeed(
    KeyValueStore.KeyValueStore,
    KeyValueStore.makeStringOnly({
      get: (key) => Effect.sync(() => device.disk.get(key)),
      set: (key, value) =>
        Effect.suspend(() => {
          if (faults.refuse && key.startsWith(PREFIX)) return Effect.fail(failure('set', key));
          device.disk.set(key, value);
          device.writes.push(key);
          return Effect.void;
        }),
      remove: (key) => Effect.fail(failure('remove', key)),
      clear: Effect.fail(failure('clear', '')),
      size: Effect.sync(() => device.disk.size),
      keys: Effect.suspend(() => {
        if (faults.unread) return Effect.fail(failure('keys', ''));
        return Effect.succeed([...device.disk.keys()]);
      }),
    }),
  );

/** How the next recital is heard at its finish: the words of `text` but `skip`, or not at all. */
export type Hearing =
  | { readonly kind: 'heard'; readonly text: string; readonly skip: readonly number[] }
  | { readonly kind: 'unheard' };

/** Whether the next finish holds its end back (the recital finishing until `release`), and the end held back. */
interface Ending {
  defer: boolean;
  pending: Option.Option<() => void>;
}

/** A recognizer that opens each listen and sends nothing more until `finish`, which sends the recital `hearing` names, or its failure, at once or, when `ending` defers it, at its release. */
const recognizerOf = (
  hearing: MutableRef.MutableRef<Hearing>,
  listens: { n: number },
  ending: Ending,
) => {
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
        Effect.sync(() => {
          listens.n += 1;
          MutableRef.set(open, Option.some(session));
          emit(event(session, 'start'));
        }),
      finish: Effect.sync(() => {
        const session = MutableRef.get(open);
        MutableRef.set(open, Option.none());
        if (Option.isNone(session)) return;
        const heard = MutableRef.get(hearing);
        const send = () => {
          if (heard.kind === 'unheard') {
            emit({ ...event(session.value, 'fail'), reason: 'test: unheard' });
            return;
          }
          for (const step of recite(heard.text, { skip: heard.skip, every: 5, pace: 1 }))
            emit({ ...event(session.value, 'result'), final: step.final, runs: step.runs });
          emit(event(session.value, 'end'));
        };
        if (!ending.defer) {
          send();
          return;
        }
        ending.defer = false;
        ending.pending = Option.some(send);
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

/** A node's name: its label, else its text. */
const nameOf = (node: Element) => node.getAttribute('aria-label') ?? text(node);

/** Whether `node` scrolls its overflow. */
const scrolls = (node: Element) => {
  const style = getComputedStyle(node);
  return /auto|scroll/.test(`${style.overflowY} ${style.overflow}`);
};

/** Whether `node` lies inside a scroll view: an ancestor that scrolls its overflow, so a reader may have to scroll to reach it. */
export const scrolled = (node: Element) => {
  for (let at = node.parentElement; at !== null; at = at.parentElement)
    if (scrolls(at)) return true;
  return false;
};

/** The outermost scroll views of `host`. */
const scrollersIn = (host: Element) =>
  [...host.querySelectorAll('*')].filter((node) => scrolls(node) && !scrolled(node));

/** Text as a reader sees it in `node`, of the elements drawn (no hidden node's text). */
export const seenText = (node: Element): string => {
  const parts: string[] = [];
  const walk = (at: Node) => {
    if (at.nodeType === Node.TEXT_NODE) {
      parts.push(at.textContent ?? '');
      return;
    }
    if (!(at instanceof Element)) return;
    if (at.getAttribute('aria-hidden') === 'true') return;
    const style = getComputedStyle(at);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return;
    for (const child of at.childNodes) walk(child);
  };
  walk(node);
  return parts.join(' ').replace(/\s+/g, ' ').trim();
};

/** The action buttons a frame shows, by name. */
const actionsIn = (host: Element) =>
  [...host.querySelectorAll('[role="button"]')].filter((node) =>
    (ACTIONS as readonly string[]).includes(nameOf(node)),
  );

/** What one Today frame shows wrong of the footer rule: a control in the scroll view other than a missed word's mark, or more than one action button. */
export const footerFaults = (host: Element): string[] => {
  const headings = [...host.querySelectorAll('[role="heading"]')].map(text);
  if (!headings.includes('Today')) return [];
  const out: string[] = [];
  const actions = actionsIn(host);
  if (actions.length > 1) out.push(`${actions.length} action buttons`);
  for (const node of host.querySelectorAll(CONTROLS)) {
    if (!scrolled(node)) continue;
    if (node.getAttribute('role') === 'button' && PEEK_MARK.test(nameOf(node))) continue;
    out.push(
      `a control in the scroll view: ${node.getAttribute('role') ?? node.tagName}:${(ACTIONS as readonly string[]).includes(nameOf(node)) || nameOf(node) === 'Grade' ? nameOf(node) : 'other'}`,
    );
  }
  return out;
};

/** The leave of each launch still mounted: the next launch leaves any a failed test left. */
const mounted = new Set<() => Promise<unknown>>();

/** What a rig built on this one may give a launch in place of its own: the voice's source (a voice that never speaks when none), the foreground (the host's `AppState` when none), a wrap of the store over the disk, and the screen a read launch opens on (`today` when none). */
export interface LaunchParts {
  readonly opening?: 'home' | 'today';
  readonly voice?: Layer.Layer<VoiceSource>;
  readonly foreground?: Layer.Layer<Foreground>;
  readonly store?: (
    disk: Layer.Layer<KeyValueStore.KeyValueStore>,
  ) => Layer.Layer<KeyValueStore.KeyValueStore>;
}

/**
 * A launch of the root over `device` with `faults`, at `time.now` on
 * Effect's clock, with `pieces` given to `appLayer` (the app's own when
 * none) and `parts` in place of the rig's own. Every frame is held to the
 * footer rule; the faults found are kept in `faults`, and `frames` counts
 * the Today frames seen.
 */
export const launch = async (
  device: Device,
  faults: Faults,
  time: { now: number },
  pieces: readonly TextPiece[] = [PASSAGE],
  parts: LaunchParts = {},
) => {
  for (const left of [...mounted]) await left();
  const hearing = MutableRef.make<Hearing>({ kind: 'unheard' });
  const listens = { n: 0 };
  const ending: Ending = { defer: false, pending: Option.none() };
  const dictation = MutableRef.make<Option.Option<Dictation['Service']>>(Option.none());
  const layer = appLayer({
    source: recognizerOf(hearing, listens, ending),
    haptics: Layer.succeed(Haptics, Haptics.of({ tick: Effect.void })),
    store: (parts.store ?? ((disk) => disk))(storeOf(device, faults)),
    chime: Layer.succeed(Chime, Chime.of({ grow: () => Effect.void })),
    voice: parts.voice ?? silentVoice,
    pieces,
    foreground: parts.foreground,
  }).pipe(
    Layer.provideMerge(Layer.merge(clockOf(time), Logger.layer([]))),
    Layer.tap((services) =>
      Effect.sync(() => MutableRef.set(dictation, Option.some(Context.get(services, Dictation)))),
    ),
  );
  const recital = () => Option.getOrThrow(MutableRef.get(dictation));
  const host = document.createElement('div');
  document.body.append(host);
  const found: string[] = [];
  const frames = { today: 0, listening: 0, next: 0, done: 0 };
  const headings = () => [...host.querySelectorAll('[role="heading"]')].map(text);
  const actions = () => actionsIn(host).map(nameOf);
  const frame = () => {
    if (!headings().includes('Today')) return;
    frames.today += 1;
    const shown = actions();
    if (shown.includes('Listening')) frames.listening += 1;
    if (shown.includes('Next')) frames.next += 1;
    if (shown.length === 0) frames.done += 1;
    for (const fault of footerFaults(host)) found.push(`${fault} (actions ${shown.join('|')})`);
  };
  const watch = new MutationObserver(frame);
  watch.observe(host, { subtree: true, childList: true, attributes: true, characterData: true });
  const root = createRoot(host);
  await act(async () =>
    root.render(
      <RegistryProvider initialValues={[[runtime.layer, layer]]}>
        <Root opening={parts.opening ?? 'today'} />
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
  const named = (label: string, role = 'button') =>
    [...host.querySelectorAll(`[role="${role}"]`)].find((node) => nameOf(node) === label);
  /** Taps the control named `label`; false when none shows. */
  const tap = async (label: string, role = 'button') => {
    const node = named(label, role);
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
    return found;
  };
  mounted.add(leave);
  const scroll = () => scrollersIn(host);
  return {
    host,
    faults: found,
    frames,
    hearing,
    listens,
    /** Holds back the end of the next finish, so the recital stays finishing until `release`. */
    deferEnd: () => {
      ending.defer = true;
    },
    /** Sends the end held back, if any. */
    release: async () => {
      const send = ending.pending;
      ending.pending = Option.none();
      await act(async () => {
        Option.map(send, (each) => each());
      });
    },
    /** Cancels the recital under way through Dictation's own cancel. */
    cancel: async () => {
      await act(async () => Effect.runPromise(recital().cancel));
    },
    /** The recital's status now: idle, listening or finishing. */
    status: () => Effect.runSync(recital().view).status,
    headings,
    actions,
    until,
    tap,
    has: (label: string, role = 'button') => named(label, role) !== undefined,
    /** The references Today shows, in order. */
    references: () => [...host.querySelectorAll('[data-testid="reference"]')].map(text),
    /** The counts lines Today shows, as they read. */
    counts: () => [...host.querySelectorAll('[data-testid="session"]')].map(text),
    /** The scroll view's text as a reader sees it. */
    scrollText: () => scroll().map(seenText).join(' '),
    grades: () =>
      [...host.querySelectorAll('[role="radiogroup"]')].filter(
        (node) => node.getAttribute('aria-label') === 'Grade',
      ),
    summaries: () => host.querySelectorAll('[data-testid="summary"]').length,
    alerts: () => host.querySelectorAll('[role="alert"]').length,
    leave,
  };
};

export type Launch = Awaited<ReturnType<typeof launch>>;
