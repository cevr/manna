/* oxlint-disable effect/noGlobals, effect/noNullish, effect/noTernary, effect/noAsyncFunction, effect/noNewPromise, effect/noFixedWaitInTests, eslint/no-await-in-loop -- a React screen property: it mounts the root route in happy-dom's document through React's promise-based `act`; the runtime's forked Effect work and the stand-in recognizer run on the host's clock, so each turn is handed over in `act` until the screen settles, at most 3 s; it reads nodes whose absent attributes are null, from plain branches, and the device's records as JSON text. */

/**
 * The root route against a model of the first minute, over generated
 * devices: each starts its disk empty, with records the garden skips, with
 * a foreign key, with another verse's recall or with the passage's, and the
 * voice's switch absent, on or off; each launch is healthy, held or unread.
 * The commands are the reader's taps (Listen, Next, the two batched before a
 * render, Say it, Continue), the voice's finish and interruption, the
 * recognizer's endings (the verse whole, one or several words missed, a
 * refused listen, a denial, an interruption), a refused write in alone, and
 * relaunches. Every frame (each DOM mutation batch) and every settle is read
 * against the model: the heading, what a sighted reader and the screen
 * reader get of each word, the claims, the setting words, and the whole
 * disk, every key and the number of writes, with the voice's switch among
 * them. It counts words without printing one.
 */

import { RegistryProvider } from '@effect/atom-react';
import { describe, expect, it } from 'bun:test';
import { Effect, Layer, MutableRef } from 'effect';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import passage from 'virtual:heartseed-passage';

import Root from '../../app/index';
import { appLayer, runtime } from '../app';
import {
  CHAIN,
  DictationSource,
  DictationUnavailable,
  type DictationEvent,
  type DictationRun,
} from '../dictation';
import { recite, type DictationStep } from '../dictation/script';
import { Chime, type Growth } from '../garden';
import { sourceWords } from '../matcher/words';
import { Haptics } from '../sayit';
import { store } from '../store';
import { device } from '../test/one';
import { VoiceSource, type VoiceEvent } from '../voice';

const PREFIX = 'heartseed/recall/';
const SWITCH = 'heartseed/voice/enabled';
const WORDS = sourceWords(passage.text);
const CUES = WORDS.map((word) => [...word].find((char) => /[\p{L}\p{N}]/u.test(char)) ?? '');
const HEADINGS = ['Hear it', 'Say it with help', 'Say it alone', 'Planted', 'Today'];
const CLAIM = /\b(seeds?|blades?|ears?|corn|planted|plants?|grew|grow|growth|stages?)\b/iu;
const SETTING =
  /\b(sign ?up|sign ?in|log ?in|account|settings?|password|e-?mail|notifications?|remind(?:er)?s?)\b/iu;
const DEVICES = 10;
const COMMANDS = 12;

type Screen = 'hear' | 'letters' | 'alone' | 'planted' | 'today' | 'unread';
const HEADING: Readonly<Record<Screen, string>> = {
  hear: 'Hear it',
  letters: 'Say it with help',
  alone: 'Say it alone',
  planted: 'Planted',
  today: 'Today',
  unread: 'Today',
};

/** How a recital ends: heard (whole, one word missed, several), or not heard (every listen refused, a denial, an interruption). */
type Said = 'whole' | 'one' | 'several' | 'refused' | 'denied' | 'interrupted';
const HEARD: readonly Said[] = ['whole', 'one', 'several'];
const UNHEARD: readonly Said[] = ['refused', 'denied', 'interrupted'];
const SKIPS: Readonly<Record<Said, readonly number[]>> = {
  whole: [],
  one: [10],
  several: [3, 10, 20],
  refused: [],
  denied: [],
  interrupted: [],
};

type DiskKind = 'empty' | 'junk' | 'foreign' | 'other' | 'passage';
type Launch = 'healthy' | 'held' | 'unread';

type Command =
  | { readonly _tag: 'Listen' }
  | { readonly _tag: 'Finish' }
  | { readonly _tag: 'Interrupt' }
  | { readonly _tag: 'Next' }
  | { readonly _tag: 'Batch'; readonly order: 'listen-next' | 'next-listen' }
  | { readonly _tag: 'Say'; readonly said: Said; readonly write: 'lands' | 'refused' }
  | { readonly _tag: 'Continue' }
  | { readonly _tag: 'End' }
  | { readonly _tag: 'Relaunch'; readonly launch: Launch };

/** The first device's commands, on an empty disk with the switch absent, so every seed meets each path at least once: an interrupted reading and Listen again, a Next during a reading, an unheard letters recital, a relaunch mid-flow, a finished reading, a refused alone write, a denied alone recital, the seed, Continue and an unread launch. */
const TOUR: readonly Command[] = [
  { _tag: 'Listen' },
  { _tag: 'Interrupt' },
  { _tag: 'Listen' },
  { _tag: 'Next' },
  { _tag: 'Say', said: 'refused', write: 'lands' },
  { _tag: 'Relaunch', launch: 'healthy' },
  { _tag: 'Batch', order: 'listen-next' },
  { _tag: 'Relaunch', launch: 'healthy' },
  { _tag: 'Batch', order: 'next-listen' },
  { _tag: 'Relaunch', launch: 'healthy' },
  { _tag: 'Listen' },
  { _tag: 'Finish' },
  { _tag: 'Say', said: 'one', write: 'lands' },
  { _tag: 'Say', said: 'whole', write: 'refused' },
  { _tag: 'Say', said: 'denied', write: 'lands' },
  { _tag: 'Say', said: 'one', write: 'lands' },
  { _tag: 'Continue' },
  { _tag: 'Relaunch', launch: 'unread' },
];

/** A seeded generator (mulberry32). */
const random = (seed: number) => {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const pick = <A,>(items: readonly A[]): A => items[Math.floor(next() * items.length)] as A;
  return { next, pick };
};

const recallRecord = (reference: string, startedAt: number) =>
  [
    `${PREFIX}${reference}/${startedAt}`,
    JSON.stringify({
      reference,
      startedAt,
      grade: 3,
      suggested: 3,
      words: 4,
      missed: 0,
      peeked: 0,
      extra: 0,
    }),
  ] as const;

const diskOf = (kind: DiskKind): (readonly [string, string])[] => {
  const at = Date.UTC(2026, 0, 5, 9);
  if (kind === 'junk') return [[`${PREFIX}${passage.reference}/junk`, 'not a recall']];
  if (kind === 'foreign') return [['elsewhere/key', 'kept as it is']];
  if (kind === 'other') return [recallRecord('Made 1:1', at)];
  if (kind === 'passage') return [recallRecord(passage.reference, at)];
  return [];
};

/** The recognizer: each listen plays the plan set before it, at once, or refuses. */
const recognizer = () => {
  const plan = MutableRef.make<Said>('whole');
  const listener = MutableRef.make<(event: DictationEvent) => void>(() => {});
  const held = MutableRef.make(0);
  const emit = (session: number, kind: DictationEvent['kind'], reason = '', step?: DictationStep) =>
    MutableRef.get(listener)({
      session,
      kind,
      final: step?.final ?? false,
      runs: step?.runs ?? ([] as readonly DictationRun[]),
      reason,
    });
  const play = (session: number) => {
    if (MutableRef.get(held) !== session) return;
    const said = MutableRef.get(plan);
    emit(session, 'start');
    if (said === 'denied' || said === 'interrupted') {
      MutableRef.set(held, 0);
      emit(session, 'fail', said);
      return;
    }
    for (const step of recite(passage.text, { skip: SKIPS[said], every: 5, pace: 0 }))
      emit(session, 'result', '', step);
    MutableRef.set(held, 0);
    emit(session, 'end');
  };
  const layer = Layer.succeed(
    DictationSource,
    DictationSource.of({
      engines: () => Effect.succeed(CHAIN.map((engine) => ({ engine, status: 'ready' }))),
      listen: (session) =>
        Effect.suspend(() => {
          if (MutableRef.get(plan) === 'refused')
            return Effect.fail(DictationUnavailable.make({ reason: 'refused' }));
          MutableRef.set(held, session);
          setTimeout(() => play(session), 0);
          return Effect.void;
        }),
      finish: Effect.sync(() => {
        const session = MutableRef.get(held);
        if (session === 0) return;
        MutableRef.set(held, 0);
        emit(session, 'end');
      }),
      cancel: Effect.sync(() => MutableRef.set(held, 0)),
      subscribe: (next) =>
        Effect.acquireRelease(
          Effect.sync(() => MutableRef.set(listener, next)),
          () => Effect.sync(() => MutableRef.set(listener, () => {})),
        ),
    }),
  );
  return { layer, say: (said: Said) => MutableRef.set(plan, said) };
};

/** The voice's native source: it records each speak and whether a speak is still sounding, and lets the test send its events. */
const voiceStandIn = () => {
  const calls = { speaks: 0, stops: 0, texts: [] as string[], sounding: false, utterance: 0 };
  const listener = MutableRef.make<(event: VoiceEvent) => void>(() => {});
  const layer = Layer.succeed(
    VoiceSource,
    VoiceSource.of({
      voices: Effect.succeed([]),
      speak: (utterance, text) =>
        Effect.sync(() => {
          calls.speaks += 1;
          calls.texts.push(text);
          calls.sounding = true;
          calls.utterance = utterance;
        }),
      pause: Effect.void,
      resume: Effect.void,
      stop: Effect.sync(() => {
        calls.stops += 1;
        calls.sounding = false;
      }),
      subscribe: (next) =>
        Effect.acquireRelease(
          Effect.sync(() => MutableRef.set(listener, next)),
          () => Effect.sync(() => MutableRef.set(listener, () => {})),
        ),
    }),
  );
  const end = (kind: 'finish' | 'interrupt') => {
    calls.sounding = false;
    MutableRef.get(listener)({ utterance: calls.utterance, kind, location: 0, length: 0 });
  };
  return { layer, calls, end };
};

const alphaOf = (color: string) => {
  const match = /rgba?\(([^)]*)\)/u.exec(color);
  if (match === null) return color === 'transparent' ? 0 : 1;
  const parts = (match[1] ?? '').split(',').map((part) => Number.parseFloat(part));
  return parts.length === 4 ? (parts[3] ?? 1) : 1;
};

/** The text a sighted reader sees of each word node under `host`, without spaces: text whose element's ink is not transparent, with nothing above it out of the layout, hidden or at no opacity. One style read per element. */
const sightOf = (host: Element): Map<number, string> => {
  const seen = new Map<number, string>();
  const styles = new Map<string, { readonly color: string; readonly hides: boolean }>();
  /** The element's ink and whether it hides itself, read once for each class list and inline style under the same inherited ink and visibility. */
  const styleOf = (at: Element, inherited: string) => {
    const key = `${inherited}|${at.getAttribute('class') ?? ''}|${at.getAttribute('style') ?? ''}`;
    const known = styles.get(key);
    if (known !== undefined) return known;
    const style = getComputedStyle(at);
    const read = {
      color: style.color,
      hides: style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0',
    };
    styles.set(key, read);
    return read;
  };
  const walk = (at: Element, hidden: boolean, word: number | null, inherited: string) => {
    const style = styleOf(at, inherited);
    const gone = hidden || style.hides;
    const id = /^word-(\d+)$/u.exec(at.getAttribute('data-testid') ?? '');
    const within = id === null ? word : Number(id[1]);
    if (within !== null && !seen.has(within)) seen.set(within, '');
    const inked = !gone && alphaOf(style.color) > 0;
    at.childNodes.forEach((child) => {
      if (child instanceof Element) return walk(child, gone, within, style.color);
      if (child.nodeType !== 3 || within === null || !inked) return;
      seen.set(
        within,
        `${seen.get(within) ?? ''}${(child.textContent ?? '').replace(/\s+/gu, '')}`,
      );
    });
  };
  walk(host, false, null, '');
  return seen;
};

/** What the screen reader reaches under `node`: each label and text outside every hidden subtree, trimmed, empty ones dropped. */
const heard = (node: Element) => {
  for (let up: Element | null = node; up !== null; up = up.parentElement)
    if (up.getAttribute('aria-hidden') === 'true') return [];
  const parts: string[] = [];
  const walk = (at: Node) => {
    if (at instanceof Element) {
      if (at.getAttribute('aria-hidden') === 'true') return;
      const label = at.getAttribute('aria-label');
      if (label !== null) parts.push(label);
    }
    if (at.nodeType === 3) parts.push(at.textContent ?? '');
    at.childNodes.forEach(walk);
  };
  walk(node);
  return parts.map((part) => part.trim()).filter((part) => part !== '');
};

/** What the screen shows outside every alert, for the setting words: Say it's own alert may point to iOS's Settings (spec, Decided 9). */
const textOutsideAlerts = (host: Element) => {
  let text = '';
  const walk = (at: Node) => {
    if (at instanceof Element && at.getAttribute('role') === 'alert') return;
    if (at.nodeType === 3) text += ` ${at.textContent ?? ''}`;
    at.childNodes.forEach(walk);
  };
  walk(host);
  return text;
};

/** Whether the disk holds a record of the passage's recall, as the garden writes one: under the passage's key, a JSON value naming its reference. */
const hasPassageRecall = (disk: ReadonlyMap<string, string | null>) =>
  [...disk].some(
    ([key, value]) =>
      key.startsWith(`${PREFIX}${passage.reference}/`) &&
      value !== null &&
      value.startsWith('{') &&
      value.includes(`"reference":${JSON.stringify(passage.reference)}`),
  );

/** What a frame of letters or alone shows wrong of the words: a word seen other than as its cue (letters), nothing (alone) or, once a recital of the phase's own started, whole; and before that recital, a word seen or read to the screen reader beyond its cue. */
const wordFaults = (host: Element, heading: string, said: boolean): string[] => {
  const cueOf = (index: number) => (heading === 'Say it with help' ? (CUES[index] ?? '') : '');
  const sights = sightOf(host);
  return WORDS.flatMap((text, index) => {
    const node = host.querySelector(`[data-testid="word-${index}"]`);
    if (node === null) return [`frame: no word node ${index}`];
    const seen = sights.get(index) ?? '';
    const cue = cueOf(index);
    const out: string[] = [];
    if (seen !== cue && seen !== '' && !(said && seen === text.replace(/\s+/gu, '')))
      out.push(`frame: word ${index} seen as ${seen.length} characters in ${heading}`);
    if (said) return out;
    if (seen !== cue) out.push(`frame: word ${index} seen before a recital in ${heading}`);
    if (heard(node).some((part) => part !== cue))
      out.push(`frame: word ${index} read to the screen reader before it is said`);
    return out;
  });
};

/** What a frame of the first minute's phases shows that none may: a setting word outside an alert, a claim, a stage node, a control, or Listen with the voice off. */
const phaseFaults = (
  host: Element,
  heading: string,
  buttons: readonly (string | null)[],
  voiceOn: boolean,
): string[] => {
  const out: string[] = [];
  if (SETTING.test(textOutsideAlerts(host))) out.push(`frame: a setting word in ${heading}`);
  if (CLAIM.test(host.textContent ?? '')) out.push(`frame: a claim in ${heading}`);
  if (host.querySelector('[data-testid="stage"],[data-testid="plant"]') !== null)
    out.push(`frame: a stage node in ${heading}`);
  if (host.querySelector('input,textarea,select,a[href],[role="switch"],[role="checkbox"]'))
    out.push(`frame: a control in ${heading}`);
  if (heading === 'Hear it' && !voiceOn && buttons.includes('Listen'))
    out.push('frame: Listen with the voice off');
  return out;
};

/** What one frame shows wrong: more than one heading; a pending frame after the launch decided, or one offering a button or a stage; a heading the command cannot reach; Planted with no recall on the disk; and the phases' own faults. */
const frameFaults = (
  host: Element,
  shown: readonly string[],
  buttons: readonly (string | null)[],
  allowed: { readonly headings: Set<string>; readonly pending: boolean },
  phase: { readonly said: boolean; readonly voiceOn: boolean },
): string[] => {
  const out: string[] = shown.length > 1 ? [`frame: ${shown.length} headings`] : [];
  const heading = shown[0];
  if (heading === undefined) {
    if (!allowed.pending) out.push('frame: no heading after the launch decided');
    if (buttons.length > 0) out.push('frame: a pending frame offers a button');
    if (host.querySelector('[data-testid="stage"],[data-testid="plant"]') !== null)
      out.push('frame: a pending frame claims a stage');
    return out;
  }
  if (!allowed.headings.has(heading)) out.push(`frame: heading ${heading} not allowed now`);
  if (heading === 'Planted' && !hasPassageRecall(device.disk))
    out.push('frame: Planted while the disk holds no recall of the passage');
  if (heading === 'Today' || heading === 'Planted') return out;
  out.push(...phaseFaults(host, heading, buttons, phase.voiceOn));
  if (heading === 'Hear it') return out;
  return [...out, ...wordFaults(host, heading, phase.said)];
};

/** The model's view of a launch. */
interface Model {
  screen: Screen;
  voiceOn: boolean;
  reading: boolean;
  /** Whether a recital of the phase's own has started, and whether its last ended heard. */
  said: 'none' | 'heard' | 'unheard';
  /** A refused alone write left the count on the screen. */
  refused: boolean;
  speaks: number;
  sets: number;
  planted: boolean;
  disk: Map<string, string | null>;
}

/** A launch: the root over the device's disk as it stands, built once `held` resolves; `allowed` is the headings a frame may show now. */
const mount = async (allowed: { readonly headings: Set<string>; pending: boolean }) => {
  const voice = voiceStandIn();
  const dictation = recognizer();
  const chimes: Growth[] = [];
  const gate = Promise.withResolvers<void>();
  const layer = appLayer({
    source: dictation.layer,
    haptics: Layer.succeed(Haptics, Haptics.of({ tick: Effect.void })),
    store: Layer.unwrap(
      Effect.as(
        Effect.promise(() => gate.promise),
        store,
      ),
    ),
    chime: Layer.succeed(
      Chime,
      Chime.of({ grow: (growth) => Effect.sync(() => void chimes.push(growth)) }),
    ),
    voice: voice.layer,
  });
  const host = document.createElement('div');
  document.body.append(host);
  const headings = () =>
    [...host.querySelectorAll('[role="heading"]')]
      .map((node) => (node.textContent ?? '').trim())
      .filter((text) => HEADINGS.includes(text));
  const buttons = () =>
    [...host.querySelectorAll('[role="button"]')].map((node) => node.getAttribute('aria-label'));
  const word = (index: number) => host.querySelector(`[data-testid="word-${index}"]`);
  const faults: string[] = [];
  const phase = { said: false, voiceOn: true };
  const frame = () => {
    count('frames');
    faults.push(...frameFaults(host, headings(), buttons(), allowed, phase));
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
  const until = async (holds: () => boolean, ms = 3000) => {
    const start = Date.now();
    while (!holds()) {
      if (Date.now() - start > ms) return false;
      await act(() => new Promise((resolve) => setTimeout(resolve, 1)));
    }
    return true;
  };
  const press = (label: string) => {
    const node = [...host.querySelectorAll('[role="button"]')].find(
      (each) => each.getAttribute('aria-label') === label,
    );
    expect(node === undefined, `button ${label}`).toBe(false);
    node?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
  };
  const click = (label: string) => act(async () => press(label));
  const leave = async () => {
    watch.disconnect();
    await act(async () => root.unmount());
    host.remove();
  };
  return {
    host,
    voice,
    dictation,
    chimes,
    faults,
    phase,
    gate,
    until,
    press,
    click,
    word,
    buttons,
    heading: () => headings()[0] ?? null,
    leave,
  };
};

type Rig = Awaited<ReturnType<typeof mount>>;

const coverage: Record<string, number> = {};
const count = (key: string) => void (coverage[key] = (coverage[key] ?? 0) + 1);

/** The commands the model offers on its screen, weighted toward going on. */
const offers = (model: Model, pick: ReturnType<typeof random>): Command => {
  const relaunch = (): Command => ({
    _tag: 'Relaunch',
    launch: pick.pick<Launch>(['healthy', 'healthy', 'healthy', 'held', 'unread']),
  });
  const roll = pick.next();
  if (roll < 0.08) return relaunch();
  if (model.screen === 'hear') {
    if (model.reading)
      return pick.pick<Command>([
        { _tag: 'Finish' },
        { _tag: 'Interrupt' },
        { _tag: 'Next' },
        { _tag: 'Next' },
      ]);
    if (model.voiceOn)
      return pick.pick<Command>([
        { _tag: 'Listen' },
        { _tag: 'Listen' },
        { _tag: 'Next' },
        { _tag: 'Batch', order: 'listen-next' },
        { _tag: 'Batch', order: 'next-listen' },
      ]);
    return { _tag: 'Next' };
  }
  if (model.screen === 'letters' || model.screen === 'alone') {
    const said = pick.next() < 0.3 ? pick.pick(UNHEARD) : pick.pick(HEARD);
    const write = model.screen === 'alone' && pick.next() < 0.45 ? 'refused' : 'lands';
    return { _tag: 'Say', said, write };
  }
  if (model.screen === 'planted') return { _tag: 'Continue' };
  if (pick.next() < 0.6) return { _tag: 'End' };
  return relaunch();
};

/** The screen a launch opens on, by the model. */
const openingOf = (model: Model, launch: Launch): Screen => {
  if (launch === 'unread') return 'unread';
  return model.planted ? 'today' : 'hear';
};

const settle = async (rig: Rig, model: Model, trace: readonly string[]) => {
  const want = HEADING[model.screen];
  const ready = () => {
    if (rig.heading() !== want) return false;
    if (model.screen === 'today') return rig.host.querySelector('[data-testid="stage"]') !== null;
    if (model.screen === 'unread') return device.calls.keys >= 3;
    if (model.screen === 'hear')
      return rig.buttons().includes('Listen') === (model.voiceOn && !model.reading);
    if (model.screen === 'letters' || model.screen === 'alone') {
      if (model.said === 'unheard') return rig.host.querySelector('[role="alert"]') !== null;
      if (model.refused) return rig.host.querySelector('[data-testid="summary"]') !== null;
      return rig.buttons().includes('Say it');
    }
    return true;
  };
  await rig.until(ready);
  await act(async () => {});
  const where = trace.join(' > ');
  expect(rig.faults, where).toEqual([]);
  expect(rig.heading(), where).toBe(want);
  expect([...device.disk].toSorted(), `${where}: the disk`).toEqual([...model.disk].toSorted());
  expect(device.calls.set, `${where}: the writes`).toBe(model.sets);
  expect(device.calls.remove + device.calls.clear, `${where}: removals`).toBe(0);
  expect(rig.voice.calls.speaks, `${where}: the speaks`).toBe(model.speaks);
  expect(
    rig.voice.calls.texts.every((text) => text === passage.text),
    `${where}: each speak is the passage`,
  ).toBe(true);
  expect(rig.chimes, `${where}: no chime`).toEqual([]);
  if (model.screen !== 'hear')
    expect(rig.voice.calls.sounding, `${where}: a reading left outside hear`).toBe(false);
  if (model.screen === 'hear') {
    expect(rig.buttons().includes('Listen'), `${where}: Listen`).toBe(
      model.voiceOn && !model.reading,
    );
    expect(rig.buttons().includes('Next'), `${where}: Next`).toBe(true);
  }
  if (model.screen === 'letters' || model.screen === 'alone') {
    const alert = rig.host.querySelector('[role="alert"]') !== null;
    expect(alert, `${where}: the alert`).toBe(model.said === 'unheard');
    if (model.said !== 'heard') {
      const sights = sightOf(rig.host);
      WORDS.forEach((_, index) => {
        const cue = model.screen === 'letters' ? (CUES[index] ?? '') : '';
        expect(rig.word(index) === null ? null : sights.get(index), `${where}: word ${index}`).toBe(
          cue,
        );
      });
    }
    if (model.refused)
      expect(rig.host.querySelector('[data-testid="summary"]') !== null, `${where}: count`).toBe(
        true,
      );
  }
  if (model.screen === 'unread')
    expect(rig.host.querySelector('[data-testid="stage"]'), `${where}: unread claims`).toBe(null);
  if (model.screen === 'planted' || model.screen === 'today') {
    const stage = rig.host.querySelector('[data-testid="stage"]')?.getAttribute('aria-label');
    if (model.screen === 'planted' || hasPassageRecall(model.disk))
      expect(stage, `${where}: the stage`).toBe('Stage: seed');
    expect(rig.host.querySelector('[data-testid="growth"]'), `${where}: growth`).toBe(null);
  }
};

/** Starts a launch of `kind` over the device's disk as it stands. */
const launch = async (model: Model, kind: Launch, trace: string[]) => {
  if (kind === 'unread') device.launch().fail('keys', 3);
  else device.launch();
  count(`launch:${kind}`);
  model.screen = openingOf(model, kind);
  model.reading = false;
  model.said = 'none';
  model.refused = false;
  model.speaks = 0;
  model.sets = 0;
  const allowed = { headings: new Set([HEADING[model.screen]]), pending: true };
  const rig = await mount(allowed);
  rig.phase.voiceOn = model.voiceOn;
  if (kind === 'held') {
    await rig.until(() => false, 10);
    expect([rig.heading(), rig.buttons(), device.calls.keys], trace.join(' > ')).toEqual([
      null,
      [],
      0,
    ]);
  }
  rig.gate.resolve();
  await settle(rig, model, trace);
  allowed.pending = false;
  count(`open:${model.screen}`);
  return { rig, allowed };
};

/** One command to the app and the model, then the settle's oracles. */
const run = async (
  at: { rig: Rig; allowed: { headings: Set<string>; pending: boolean } },
  model: Model,
  command: Command,
  trace: string[],
) => {
  const { rig } = at;
  const before = model.screen;
  trace.push(
    `${command._tag}${'said' in command ? `:${command.said}:${command.write}` : ''}${'order' in command ? `:${command.order}` : ''}${'launch' in command ? `:${command.launch}` : ''}`,
  );
  count(`cmd:${command._tag}@${before}${model.reading ? ':reading' : ''}`);
  if (command._tag === 'End') return at;
  if (command._tag === 'Relaunch') {
    const reading = model.reading;
    await rig.leave();
    expect(await rig.until(() => !rig.voice.calls.sounding), `${trace.join(' > ')}: stopped`).toBe(
      true,
    );
    if (reading) count('relaunch:reading');
    return launch(model, command.launch, trace);
  }
  const go = (screen: Screen) => {
    at.allowed.headings = new Set([HEADING[before], HEADING[screen]]);
    model.screen = screen;
  };
  if (command._tag === 'Say') await say(rig, model, command, go, trace);
  else await TAPS[command._tag](rig, model, command, go);
  await settle(rig, model, trace);
  rig.phase.said = model.said === 'heard' || model.refused;
  return at;
};

type Go = (screen: Screen) => void;
type Tap = Exclude<Command['_tag'], 'Say' | 'End' | 'Relaunch'>;

/** Each tap or voice event, to the app and the model. */
const TAPS: Readonly<
  Record<Tap, (rig: Rig, model: Model, command: Command, go: Go) => Promise<void>>
> = {
  Listen: async (rig, model, _, go) => {
    model.speaks += 1;
    model.reading = true;
    go('hear');
    await rig.click('Listen');
  },
  Finish: async (rig, model, _, go) => {
    model.reading = false;
    go('letters');
    await act(async () => rig.voice.end('finish'));
  },
  Interrupt: async (rig, model, _, go) => {
    model.reading = false;
    go('hear');
    await act(async () => rig.voice.end('interrupt'));
  },
  Next: async (rig, model, _, go) => {
    model.reading = false;
    go('letters');
    await rig.click('Next');
  },
  Batch: async (rig, model, command, go) => {
    const skipFirst = command._tag === 'Batch' && command.order === 'next-listen';
    if (!skipFirst) model.speaks += 1;
    model.reading = false;
    go('letters');
    const order = skipFirst ? ['Next', 'Listen'] : ['Listen', 'Next'];
    count(`batch:${skipFirst ? 'next-listen' : 'listen-next'}`);
    await act(async () => order.forEach((label) => rig.press(label)));
  },
  Continue: async (rig, _, __, go) => {
    go('today');
    await rig.click('Continue');
  },
};

/** The screen a recital leaves: an unheard one stays, a heard one in letters goes on to alone, and a heard one in alone plants only when its write lands. */
const afterSay = (before: Screen, heardIt: boolean, lands: boolean): Screen => {
  if (!heardIt) return before;
  if (before === 'letters') return 'alone';
  return lands ? 'planted' : 'alone';
};

/** A recital in letters or alone, to the app and the model; a kept one is read back from the disk. */
const say = async (
  rig: Rig,
  model: Model,
  command: Extract<Command, { _tag: 'Say' }>,
  go: Go,
  trace: readonly string[],
) => {
  const before = model.screen;
  const heardIt = HEARD.includes(command.said);
  const keeps = before === 'alone' && heardIt;
  rig.dictation.say(command.said);
  if (keeps) model.sets += 1;
  if (keeps && command.write === 'refused') device.fail('set', 1);
  const lands = keeps && command.write === 'lands';
  const next = afterSay(before, heardIt, lands);
  rig.phase.said = true;
  go(next);
  model.said = !heardIt ? 'unheard' : next === before ? 'heard' : 'none';
  model.refused = keeps && !lands && next === before;
  await rig.click('Say it');
  if (lands) await kept(rig, model, command.said, trace);
  count(`say:${before}:${command.said}${keeps ? `:${command.write}` : ''}`);
};

/** Reads the one recall a landed alone recital wrote, checks it, and takes it into the model's disk. */
const kept = async (rig: Rig, model: Model, said: Said, trace: readonly string[]) => {
  await rig.until(() => device.calls.set >= model.sets && hasPassageRecall(device.disk));
  const added = [...device.disk.keys()].filter((key) => !model.disk.has(key));
  expect(added.length, `${trace.join(' > ')}: one recall kept`).toBe(1);
  const key = added[0] ?? '';
  const record = JSON.parse(device.disk.get(key) ?? 'null');
  expect(key).toBe(`${PREFIX}${passage.reference}/${record.startedAt}`);
  expect([record.reference, record.words, record.missed, record.peeked]).toEqual([
    passage.reference,
    WORDS.length,
    SKIPS[said].length,
    0,
  ]);
  model.disk.set(key, device.disk.get(key) ?? null);
  model.planted = true;
};

type Switch = 'absent' | 'true' | 'false';
const KINDS: readonly DiskKind[] = ['empty', 'empty', 'junk', 'foreign', 'other', 'passage'];

/** Device `n`: the first six take each disk kind in turn (the first plays the tour with the switch absent, the second launches held with the voice off), the rest are drawn. */
const deviceOf = (n: number, pick: ReturnType<typeof random>) => {
  const kind = KINDS[n] ?? pick.pick(KINDS);
  const fixed: readonly Switch[] = ['absent', 'false'];
  const voice = fixed[n] ?? pick.pick<Switch>(['absent', 'true', 'true', 'false']);
  const disk: (readonly [string, string])[] = [...diskOf(kind)];
  if (voice !== 'absent') disk.push([SWITCH, voice]);
  return { kind, voice, disk };
};

/** One generated device, launched and driven to its end. */
const playDevice = async (n: number, pick: ReturnType<typeof random>) => {
  const { kind, voice, disk } = deviceOf(n, pick);
  device.launch(disk);
  count(`disk:${kind}`);
  count(`voice:${voice}`);
  const model: Model = {
    screen: 'hear',
    voiceOn: voice !== 'false',
    reading: false,
    said: 'none',
    refused: false,
    speaks: 0,
    sets: 0,
    planted: kind === 'other' || kind === 'passage',
    disk: new Map(disk),
  };
  const trace = [`device ${n} ${kind} voice=${voice}`];
  let at = await launch(model, n === 1 ? 'held' : 'healthy', trace);
  const tour = n === 0 ? TOUR : [];
  const commands = Math.max(tour.length, COMMANDS);
  for (let c = 0; c < commands; c += 1) {
    const command = tour[c] ?? offers(model, pick);
    if (command._tag === 'End') break;
    at = await run(at, model, command, trace);
  }
  await at.rig.leave();
};

describe('the root route against its model', () => {
  it(`agrees with the first minute's model on ${DEVICES} seeded devices of ${COMMANDS} commands`, async () => {
    const pick = random(0x5eed);
    for (let n = 0; n < DEVICES; n += 1) await playDevice(n, pick);
    console.log(
      `root coverage ${Object.entries(coverage)
        .toSorted(([a], [b]) => a.localeCompare(b))
        .map(([key, value]) => `${key}=${value}`)
        .join(' ')}`,
    );
    const sum = (pattern: RegExp) =>
      Object.entries(coverage)
        .filter(([key]) => pattern.test(key))
        .reduce((total, [, value]) => total + value, 0);
    expect({
      frames: sum(/^frames$/u) >= 100,
      held: sum(/^launch:held$/u) >= 1,
      unread: sum(/^open:unread$/u) >= 1,
      today: sum(/^open:today$/u) >= 1,
      voiceOff: sum(/^voice:false$/u) >= 1,
      listen: sum(/^cmd:Listen@hear$/u) >= 3,
      finish: sum(/^cmd:Finish@/u) >= 1,
      interrupt: sum(/^cmd:Interrupt@/u) >= 1,
      nextReading: sum(/^cmd:Next@hear:reading$/u) >= 1,
      batched: sum(/^batch:listen-next$/u) >= 1 && sum(/^batch:next-listen$/u) >= 1,
      unheardLetters: sum(/^say:letters:(refused|denied|interrupted)$/u) >= 1,
      unheardAlone: sum(/^say:alone:(refused|denied|interrupted)$/u) >= 1,
      refusedWrite: sum(/^say:alone:(whole|one|several):refused$/u) >= 1,
      planted: sum(/^cmd:Continue@planted$/u) >= 1,
      relaunchMidFlow: sum(/^cmd:Relaunch@(hear|letters|alone)/u) >= 1,
    }).toEqual({
      frames: true,
      held: true,
      unread: true,
      today: true,
      voiceOff: true,
      listen: true,
      finish: true,
      interrupt: true,
      nextReading: true,
      batched: true,
      unheardLetters: true,
      unheardAlone: true,
      refusedWrite: true,
      planted: true,
      relaunchMidFlow: true,
    });
  });
});
