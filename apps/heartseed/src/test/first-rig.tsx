/* oxlint-disable effect/noGlobals, effect/noNullish, effect/noTernary, effect/noAsyncFunction, effect/noNewPromise, effect/noFixedWaitInTests, eslint/no-await-in-loop, effect/noTryCatch, effect/noThrowStatement -- a React screen property's rig: it tears a device's launch down whatever its oracles fail with, and passes that failure on to bun's runner; it mounts the root route in happy-dom's document through React's promise-based `act`; the runtime's forked Effect work and the stand-ins run on the host's clock, so each turn is handed over in `act` until the screen settles, at most 3 s; it reads nodes whose absent attributes are null, from plain branches, and the device's records as JSON text. */

/**
 * The root route against a model of the first minute, as a rig the root's
 * properties and fixed cases share. Its inputs are the rule's whole domain
 * (spec rows 1-15), each a generated value read from the services' own
 * types:
 * - a device: its disk (empty, records the garden skips, a foreign key,
 *   another verse's recall, the passage's), the voice's old switch (absent,
 *   on, off, other text) and its choice (absent, `off`, `her`, `him`, or a
 *   near miss), the voices it offers, and its store (healthy, a write
 *   refused once, or down until it recovers);
 * - a launch: read at once, after one or two failed listings, or unread
 *   (every attempt failed, or the store down), held before its read or not;
 * - the voice: a speak that lands or is refused, and the source's events
 *   (`range` the next word, two, ahead, behind, stale or out of the verse,
 *   `start`, `finish`, `interrupt`, `cancel`, of the reading or a stale one,
 *   at any time);
 * - the recognizer: each engine of `CHAIN` refusing the listen or failing
 *   `unavailable` before it hears, then the one that runs hearing any subset
 *   of the words, from none to all, with extra words, delivered whole or
 *   held open mid-recital, and ending `end`, `denied`, `interrupted`,
 *   `error` or `unavailable`, or answering the reader's finish with an end
 *   or an error: so every `Ending` Dictation gives but `cancelled`, which no
 *   screen asks for (a recital is cut off only by the runtime closing);
 * - the reader: Listen, a finger's hold on the reading view while the voice
 *   reads (moved across words, then lifted, canceled, or still down while
 *   the reading finishes or Next is tapped), Next, Say it, Listening, a
 *   peek, a grade, Continue,
 *   two taps queued before a render, and a relaunch in every phase and
 *   activity, the pending frame included; on home, `Start` when the model
 *   shows an item, and in its done state `Later` (the device's clock moved
 *   to the passage's due, then a relaunch); on Today, Next after a kept
 *   recall and a new plan at the passage's due (the device's clock moved
 *   there, then `Your field`, home's Settings sheet and its Minutes radio
 *   checked, `Done`, and `Start` when the plan shows an item).
 *
 * A read launch with a plant of any verse, and Continue, show home, whose
 * first show makes Today's plan; `Start` shows that plan on Today. Every
 * frame, from before the root's first render, is held to the root's frame
 * rule (`rootFaults` through `watchRoot`, the garden the launch's read), and
 * an unread launch shows no `Your field` in any frame. Every frame (each DOM
 * mutation batch) and every settle is read against
 * the model: the heading, the pending rules, the plant images by their
 * sources (`src/test/plant-image-rule.ts`: none in the pending frame or the
 * phases, Planted's one hidden 112 pt seed of the system's scheme, Today's
 * its stage line's 28 pt image), what a sighted reader and the
 * screen reader get of each word, the hear phase's ink and selection, the
 * claims and setting words, the whole disk with every write counted and each
 * kept record's nine fields from the model's own grade rule and the zone's
 * offset at its start by the wall clock's own fields, the speaks (each the
 * passage from its start: a hold's release reads on from the held word),
 * pauses, resumes and stops, the reading view exactly while the voice
 * reads, the held word and the screen held still while a finger holds,
 * one tick a hold, the recognizer's cancel at a relaunch, the chime, and Today's run:
 * its one action (Say it, Listening or Next, never Next unread) and its done
 * state, by hsdaily's plan model: the end of the run (`The field is tended`
 * over the line of what grew and each grown verse's name, by `tendedModel`
 * over the plan made last) when that plan holds the passage, else the
 * counts line alone; home's counts line
 * by the same model, and `Start` exactly when the plan shows an item. It counts
 * words without printing one.
 *
 * It also gives the first minute's screen cases their launch
 * (`screenLaunch`): the root over the disk as it stands, a scripted
 * recital, a voice that records its calls, and every frame held to the
 * root's rule.
 */

import { RegistryProvider } from '@effect/atom-react';
import { describe, expect, it } from 'bun:test';
import { Effect, Layer, Logger, MutableRef } from 'effect';
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
  type Engine,
} from '../dictation';
import { Chime, type Growth } from '../garden';
import { sourceWords } from '../matcher/words';
import { Haptics, type Recall } from '../sayit';
import { MINUTES_KEY } from '../session/service';
import { store } from '../store';
import { theme } from '../theme';
import { recite, scriptedSource } from '../dictation/script';
import { clockOf, START, type Time } from './clock';
import { deadline } from './elapsed';
import { computed, paintOf, systemScheme } from './look';
import { gestureOf } from './gesture';
import { device } from './one';
import { plantFaults, STAGE_IMAGE } from './plant-image-rule';
import { voiceOverFaults } from './voiceover';
import { cardLineModel } from './home-model';
import { cardLine, END, endShown, watchRoot } from './root-rule';
import { grewLine, tendedModel } from './run-model';
import { renewBySettings } from './settings-rig';
import { dueModel, MINUTE, planModel, type ModelItem } from './session-model';
import { hostOffset } from './zone';
import { VoiceSource, VoiceUnavailable, type VoiceEvent, type VoiceInfo } from '../voice';

export const PREFIX = 'heartseed/recall/';
export const SWITCH = 'heartseed/voice/enabled';
const CHOICE = 'heartseed/voice/choice';
const OTHER = 'Made 1:1';
const LETTER = /[\p{L}\p{N}]/u;
export const WORDS = sourceWords(passage.text);
const N = WORDS.length;
const CUES = WORDS.map((word) => [...word].find((char) => LETTER.test(char)) ?? '');
/** Each source word's UTF-16 span in the passage, as the voice's ranges name them. */
export const SPANS = [...passage.text.matchAll(/\S+/gu)]
  .filter((run) => LETTER.test(run[0]))
  .map((run) => ({ start: run.index, end: run.index + run[0].length }));
const keyOf = (word: string) => word.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
/** Every four words of the verse in a row, by key: none may show outside the word nodes in letters or alone. */
const GRAMS = new Set(
  WORDS.slice(3).map((_, at) =>
    WORDS.slice(at, at + 4)
      .map(keyOf)
      .join(' '),
  ),
);
/** A word the verse does not hold, said as an extra word. */
export const EXTRA = 'zebra';
const HEADINGS = [
  'Hear it',
  'Say it with help',
  'Say it alone',
  'Planted',
  'Your field',
  'Today',
  END,
];
const CLAIM = /\b(seeds?|blades?|ears?|corn|planted|plants?|grew|grow|growth|stages?)\b/iu;
const SETTING =
  /\b(sign ?up|sign ?in|log ?in|account|settings?|password|e-?mail|notifications?|remind(?:er)?s?)\b/iu;
const STAGES = ['Stage: blade', 'Stage: ear', 'Stage: full corn'];
/** Word `index`'s box in the reading view as the rig lays it out: five words a line, 60 pt wide and 70 apart, lines 40 apart. */
const boxOf = (index: number) => ({
  x: (index % 5) * 70,
  y: Math.floor(index / 5) * 40,
  width: 60,
  height: 36,
});

export type Screen =
  | 'pending'
  | 'hear'
  | 'letters'
  | 'alone'
  | 'planted'
  | 'home'
  | 'today'
  | 'unread';
const HEADING: Readonly<Record<Screen, string | null>> = {
  pending: null,
  hear: 'Hear it',
  letters: 'Say it with help',
  alone: 'Say it alone',
  planted: 'Planted',
  home: 'Your field',
  today: 'Today',
  unread: 'Today',
};

/** How an engine of the chain fails before the one that runs: it refuses the listen, or fails `unavailable` before it hears. */
export type Fallback = 'refuse' | 'fail';
/** How the engine that runs ends once it has said all it heard. */
export type Close = 'end' | 'denied' | 'interrupted' | 'error' | 'unavailable';

/** One recital as the recognizer hears it. */
export interface Plan {
  /** The engines before the one that runs; three means none runs. */
  readonly fallbacks: readonly Fallback[];
  /** The source words not said, by index: none, some or all. */
  readonly skip: readonly number[];
  /** An extra word is said after the source word at each of these indexes. */
  readonly extras: readonly number[];
  /** How many words a final result takes. */
  readonly every: number;
  /** Results delivered at once; fewer than all holds the recital open there. */
  readonly cut: number;
  readonly close: Close;
  /** The answer to the reader's finish while the recital is held open. */
  readonly onFinish: 'end' | 'error';
}

/** What the store does at the next write: it lands, is refused once, or the device goes down until it recovers. */
export type Write = 'lands' | 'refused' | 'down';
export type RangeKind = 'next' | 'two' | 'ahead' | 'behind' | 'stale' | 'outside';
export type VoiceKind = 'finish' | 'interrupt' | 'cancel' | 'start';
export type Read = 'ok' | 'retry1' | 'retry2' | 'unread';
export type Part = 'junk' | 'blank' | 'misfiled' | 'foreign' | 'other' | 'passage';
export type Switch = 'absent' | 'true' | 'false' | 'other';
/** The choice key's text as the device starts: absent, one of the three choices, or a near miss the voice reads past to the old switch. */
export type Chosen = 'absent' | 'off' | 'her' | 'him' | 'Her' | 'on' | ' off';
const CHOSEN: readonly Chosen[] = ['absent', 'off', 'her', 'him', 'Her', 'on', ' off'];

/** Whether a device starting with `start`'s keys reads the voice on: the choice when it is exactly one of the three, else the old switch, off only for its text `false`. */
const voiceOnOf = (start: Pick<DeviceStart, 'voice' | 'choice'>) => {
  const chosen = start.choice ?? 'absent';
  if (chosen === 'off') return false;
  if (chosen === 'her' || chosen === 'him') return true;
  return start.voice !== 'false';
};

export interface LaunchKind {
  readonly read: Read;
  readonly held: boolean;
  readonly voices: 0 | 1;
}

/** How a finger's hold on the hear phase's reading view ends: lifted (a seek to the held word), canceled (a resume), or still down while the reading finishes or Next is tapped, its end coming late. */
export type HoldEnd = 'release' | 'cancel' | 'finish' | 'next';

export type Command =
  | { readonly _tag: 'Resolve' }
  | {
      readonly _tag: 'Hold';
      /** The word the finger lands on, then the words it moves across. */
      readonly word: number;
      readonly moves: readonly number[];
      readonly end: HoldEnd;
    }
  | { readonly _tag: 'Listen'; readonly speak: 'lands' | 'refused' }
  | { readonly _tag: 'Range'; readonly kind: RangeKind; readonly step: number }
  | { readonly _tag: 'Voice'; readonly kind: VoiceKind; readonly stale: boolean }
  | { readonly _tag: 'Next' }
  | {
      readonly _tag: 'Batch';
      readonly labels: readonly string[];
      readonly speak: 'lands' | 'refused';
    }
  | { readonly _tag: 'Say'; readonly plan: Plan; readonly write: Write }
  | { readonly _tag: 'SayTwice'; readonly plan: Plan; readonly write: Write }
  | { readonly _tag: 'More'; readonly write: Write }
  | { readonly _tag: 'Finish'; readonly write: Write }
  | { readonly _tag: 'Peek'; readonly write: Write }
  | { readonly _tag: 'Grade'; readonly grade: 1 | 2 | 3 | 4; readonly write: Write }
  | { readonly _tag: 'Recover' }
  | { readonly _tag: 'Continue' }
  /** On Today: the device's clock moved to the passage's due, then home's Settings sheet and its Minutes radio checked, which makes the plan again. */
  | { readonly _tag: 'Renew' }
  /** On home with an item: the step to Today, which shows the plan home's first show made. */
  | { readonly _tag: 'Begin' }
  /** On home's done state: the device's clock moved to the passage's due, as Renew moves it, then a relaunch of `launch`. */
  | { readonly _tag: 'Later'; readonly launch: LaunchKind }
  | { readonly _tag: 'Relaunch'; readonly launch: LaunchKind };

export interface DeviceStart {
  readonly parts: readonly Part[];
  readonly voice: Switch;
  /** The choice key's text; absent when not given. */
  readonly choice?: Chosen;
  readonly launch: LaunchKind;
}

interface Step {
  readonly final: boolean;
  readonly runs: readonly DictationRun[];
  /** The source words of the runs, by index; an extra word is -1. */
  readonly said: readonly number[];
}

/** A plan's recognizer results, as a recognizer reports them: a tentative result after each word holding the tail, and a final one every `every` words and at the last. */
const stepsOf = (plan: Plan): readonly Step[] => {
  const spoken = WORDS.flatMap((_, index) => [
    ...(plan.skip.includes(index) ? [] : [index]),
    ...plan.extras.filter((at) => at === index).map(() => -1),
  ]);
  const steps: Step[] = [];
  let tail: number[] = [];
  spoken.forEach((index, n) => {
    tail = [...tail, index];
    const runs = tail.map((each, at) => {
      const start = (n - tail.length + 1 + at) * 10;
      return { text: each < 0 ? EXTRA : (WORDS[each] ?? ''), start, end: start + 5 };
    });
    steps.push({ final: false, runs, said: tail });
    if (tail.length >= plan.every || n === spoken.length - 1) {
      steps.push({ final: true, runs, said: tail });
      tail = [];
    }
  });
  return steps;
};

/** The result at which Say it finishes the recital by itself: the first final one holding the verse's last word; -1 when the last word is not said. */
const autoAt = (plan: Plan) =>
  stepsOf(plan).findIndex((step) => step.final && step.said.includes(N - 1));

/** The words final results hold among a plan's results `[0, end)`, each a source index or -1. */
const finalsIn = (plan: Plan, end: number) =>
  stepsOf(plan)
    .slice(0, end)
    .filter((step) => step.final)
    .flatMap((step) => step.said);

/** The most results a held plan may deliver before it holds: never the one that lights the last word, so the recital is still under way while it is held. */
export const lastCut = (plan: Plan) => {
  const auto = autoAt(plan);
  return auto >= 0 ? auto : stepsOf(plan).length - 1;
};

/** The recognizer: each listen plays the current plan for the engine it names. */
const recognizer = () => {
  const state = {
    plan: undefined as Plan | undefined,
    listener: (_: DictationEvent) => {},
    held: 0,
    rest: undefined as (() => void) | undefined,
    cancels: 0,
    listens: 0,
  };
  /** Sends one event of `session`, only while the session is the one held: a session the app finished or cancelled says nothing more. */
  const send = (session: number, kind: DictationEvent['kind'], reason = '', step?: Step) =>
    state.listener({ session, kind, final: step?.final ?? false, runs: step?.runs ?? [], reason });
  const emit = (session: number, kind: DictationEvent['kind'], reason = '', step?: Step) => {
    if (state.held === session) send(session, kind, reason, step);
  };
  /** Ends the held session for good, then sends its last event. */
  const last = (session: number, kind: 'end' | 'fail', reason = '') => {
    state.held = 0;
    state.rest = undefined;
    send(session, kind, reason);
  };
  const close = (session: number, plan: Plan) => {
    if (state.held !== session) return;
    if (plan.close === 'end') last(session, 'end');
    else last(session, 'fail', plan.close);
  };
  const play = (session: number, plan: Plan) => {
    const steps = stepsOf(plan);
    emit(session, 'start');
    steps.slice(0, plan.cut).forEach((step) => emit(session, 'result', '', step));
    if (plan.cut >= steps.length) return close(session, plan);
    state.rest = () => {
      steps.slice(plan.cut).forEach((step) => emit(session, 'result', '', step));
      close(session, plan);
    };
  };
  const layer = Layer.succeed(
    DictationSource,
    DictationSource.of({
      engines: () => Effect.succeed(CHAIN.map((engine) => ({ engine, status: 'ready' }))),
      listen: (session, engine: Engine) =>
        Effect.suspend(() => {
          state.listens += 1;
          const plan = state.plan;
          if (plan === undefined)
            return Effect.fail(DictationUnavailable.make({ reason: 'no plan' }));
          const fallback = plan.fallbacks[CHAIN.indexOf(engine)];
          if (fallback === 'refuse')
            return Effect.fail(DictationUnavailable.make({ reason: 'test: refused' }));
          state.held = session;
          setTimeout(() => {
            if (state.held !== session) return;
            if (fallback === undefined) return play(session, plan);
            last(session, 'fail', 'unavailable');
          }, 0);
          return Effect.void;
        }),
      finish: Effect.sync(() => {
        const session = state.held;
        const plan = state.plan;
        if (session === 0 || plan === undefined) return;
        if (plan.onFinish === 'end') last(session, 'end');
        else last(session, 'fail', 'error');
      }),
      cancel: Effect.sync(() => {
        state.cancels += 1;
        state.held = 0;
        state.rest = undefined;
      }),
      subscribe: (next) =>
        Effect.acquireRelease(
          Effect.sync(() => {
            state.listener = next;
          }),
          () =>
            Effect.sync(() => {
              state.listener = () => {};
            }),
        ),
    }),
  );
  return { layer, state, more: () => state.rest?.() };
};

const VOICE: VoiceInfo = {
  id: 'test-voice',
  language: 'en-US',
  name: 'Test',
  quality: 2,
  novelty: false,
  personal: false,
};

/** The voice's native source: it records each speak, pause, resume and stop and whether a speak is still sounding, refuses a speak when told to, and lets the test send its events. */
const voiceStandIn = (voices: 0 | 1) => {
  const calls = {
    speaks: 0,
    stops: 0,
    pauses: 0,
    resumes: 0,
    texts: [] as string[],
    sounding: false,
    utterance: 0,
    refuse: false,
  };
  const listener = MutableRef.make<(event: VoiceEvent) => void>(() => {});
  const layer = Layer.succeed(
    VoiceSource,
    VoiceSource.of({
      voices: Effect.succeed(voices === 1 ? [VOICE] : []),
      speak: (utterance, text) =>
        Effect.suspend(() => {
          calls.speaks += 1;
          calls.texts.push(text);
          if (calls.refuse) return Effect.fail(VoiceUnavailable.make({ reason: 'test: refused' }));
          calls.sounding = true;
          calls.utterance = utterance;
          return Effect.void;
        }),
      pause: Effect.sync(() => void (calls.pauses += 1)),
      resume: Effect.sync(() => void (calls.resumes += 1)),
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
  const send = (event: VoiceEvent) => {
    if (event.utterance === calls.utterance && event.kind !== 'range' && event.kind !== 'start')
      calls.sounding = false;
    MutableRef.get(listener)(event);
  };
  return { layer, calls, send };
};

const alphaOf = (color: string) => {
  const match = /rgba?\(([^)]*)\)/u.exec(color);
  if (match === null) return color === 'transparent' ? 0 : 1;
  const parts = (match[1] ?? '').split(',').map((part) => Number.parseFloat(part));
  return parts.length === 4 ? (parts[3] ?? 1) : 1;
};

/** Whether `color` is the hear phase's ink for a spoken word: the ink of the scheme the system names (`src/theme.ts`). */
const isInk = (color: string) => {
  const ink = paintOf(theme[systemScheme()].ink);
  const seen = paintOf(color);
  return seen.hex === ink.hex && seen.alpha === 1;
};

interface Sight {
  readonly text: Map<number, string>;
  readonly ink: Map<number, string>;
  /** Text seen outside every word node. */
  readonly outside: string;
}

/** What a sighted reader sees under `host`: each word node's text whose element's ink is not transparent, with nothing above it out of the layout, hidden or at no opacity; each word node's own ink; and the text seen outside the word nodes. One style read per element. */
const sightOf = (host: Element): Sight => {
  const text = new Map<number, string>();
  const ink = new Map<number, string>();
  let outside = '';
  const styles = new Map<string, { readonly color: string; readonly hides: boolean }>();
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
    if (id !== null) ink.set(within ?? -1, style.color);
    if (within !== null && !text.has(within)) text.set(within, '');
    const inked = !gone && alphaOf(style.color) > 0;
    at.childNodes.forEach((child) => {
      if (child instanceof Element) return walk(child, gone, within, style.color);
      if (child.nodeType !== 3 || !inked) return;
      const said = child.textContent ?? '';
      if (within === null) outside += ` ${said}`;
      else text.set(within, `${text.get(within) ?? ''}${said.replace(/\s+/gu, '')}`);
    });
  };
  walk(host, false, null, '');
  return { text, ink, outside };
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
  [...disk].some(([key, value]) => {
    if (value === null || !value.startsWith('{')) return false;
    const record = JSON.parse(value);
    return (
      record.reference === passage.reference &&
      key === `${PREFIX}${passage.reference}/${record.startedAt}`
    );
  });

/** Whether four verse words in a row show in `text`. */
const showsVerse = (text: string) => {
  const keys = text
    .split(/\s+/u)
    .map(keyOf)
    .filter((key) => key !== '');
  return keys.some((_, at) => at + 4 <= keys.length && GRAMS.has(keys.slice(at, at + 4).join(' ')));
};

/** What a frame of letters or alone shows wrong of the words: a word seen other than as its cue (letters), nothing (alone) or, once a recital of the phase's own started, whole; before that recital, a word seen or read to the screen reader beyond its cue; and four verse words in a row outside the word nodes. */
const wordFaults = (host: Element, heading: string, said: boolean): string[] => {
  const cueOf = (index: number) => (heading === 'Say it with help' ? (CUES[index] ?? '') : '');
  const sight = sightOf(host);
  const out = showsVerse(sight.outside)
    ? [`frame: the verse outside the word nodes in ${heading}`]
    : [];
  return [
    ...out,
    ...WORDS.flatMap((text, index) => {
      const node = host.querySelector(`[data-testid="word-${index}"]`);
      if (node === null) return [`frame: no word node ${index}`];
      const seen = sight.text.get(index) ?? '';
      const cue = cueOf(index);
      const faults: string[] = [];
      if (seen !== cue && seen !== '' && !(said && seen === text.replace(/\s+/gu, '')))
        faults.push(`frame: word ${index} seen as ${seen.length} characters in ${heading}`);
      if (said) return faults;
      if (seen !== cue) faults.push(`frame: word ${index} seen before a recital in ${heading}`);
      if (heard(node).some((part) => part !== cue))
        faults.push(`frame: word ${index} read to the screen reader before it is said`);
      return faults;
    }),
  ];
};

/** The hear phase's words: how many are inked, whether the inked ones are a prefix and every word is seen whole, and the selected ones. */
const hearOf = (host: Element) => {
  const sight = sightOf(host);
  const inked = WORDS.map((_, index) => isInk(sight.ink.get(index) ?? ''));
  const selected = WORDS.flatMap((_, index) =>
    host.querySelector(`[data-testid="word-${index}"]`)?.getAttribute('aria-selected') === 'true'
      ? [index]
      : [],
  );
  const count = inked.filter(Boolean).length;
  return {
    nodes: WORDS.filter((_, index) => host.querySelector(`[data-testid="word-${index}"]`) !== null)
      .length,
    whole: WORDS.every((word, index) => sight.text.get(index) === word.replace(/\s+/gu, '')),
    inked: count,
    prefix: inked.every((each, index) => each === index < count),
    selected,
  };
};

/** Whether `element` sits in a scroll view that scrolls now. */
const scrolls = (element: Element | null) => {
  for (let up = element?.parentElement ?? null; up !== null; up = up.parentElement) {
    const overflow = getComputedStyle(up).overflowY;
    if (overflow === 'auto' || overflow === 'scroll') return true;
  }
  return false;
};

/** What a frame of hear shows wrong: a word node missing or not whole, a word node outside the reading view while it shows or merged into one VoiceOver element or hidden from it (`./voiceover`), the inked words not a prefix, the selected ones not one run inside it; while a finger holds the word `held`, no reading view, the held word not the read point or not the one selected, or a screen that scrolls; else one that does not. */
const hearFaults = (host: Element, held: number | null): string[] => {
  const hear = hearOf(host);
  const out: string[] = [];
  if (hear.nodes !== N) out.push(`frame: hear shows ${hear.nodes} of ${N} word nodes`);
  if (!hear.whole) out.push('frame: a hear word is not seen whole');
  if (!hear.prefix) out.push('frame: hear inks a word after an unlit one');
  const view = host.querySelector('[data-testid="reading"]');
  if (
    view !== null &&
    WORDS.some(
      (_, index) => host.querySelector(`[data-testid="word-${index}"]`)?.parentElement !== view,
    )
  )
    out.push('frame: a hear word outside the reading view');
  if (view !== null) out.push(...voiceOverFaults(host).map((fault) => `frame: ${fault}`));
  const still = !scrolls(host.querySelector('[role="heading"]'));
  if (still !== (held !== null))
    out.push(`frame: hear ${still ? 'still' : 'scrolls'} while ${held === null ? 'not ' : ''}held`);
  if (held !== null) {
    if (view === null) out.push('frame: a held word with no reading view');
    if (hear.inked !== held || hear.selected.join() !== `${held}`)
      out.push('frame: the held word not the read point and the one selected');
    return out;
  }
  const run = hear.selected.every(
    (index, at) => at === 0 || index === (hear.selected[at - 1] ?? 0) + 1,
  );
  if (!run) out.push('frame: hear selects words that are not one run');
  if (hear.selected.some((index) => index >= hear.inked) && hear.inked < N)
    out.push('frame: hear selects a word not yet spoken');
  return out;
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
  if (
    host.querySelector(
      'input,textarea,select,a[href],[role="switch"],[role="checkbox"],[role="slider"],[aria-label="Voice"]',
    )
  )
    out.push(`frame: a control in ${heading}`);
  if (heading === 'Hear it' && !voiceOn && buttons.includes('Listen'))
    out.push('frame: Listen with the voice off');
  return out;
};

/** The session's nodes, which only Today shows: the Minutes group, the Voice button and the counts line. */
const SESSION_NODES =
  '[role="radiogroup"][aria-label="Minutes"],[role="radio"][aria-label$=" min"],[aria-label="Voice"],[data-testid="session"]';

/** A frame other than Today's (or the end of its run, which the root's rule judges) that shows the session's nodes: the pending frame, the first minute's phases and Planted show none. */
const sessionFaults = (host: Element, heading: string | undefined): string[] => {
  if (heading === 'Today' || heading === END || host.querySelector(SESSION_NODES) === null)
    return [];
  return [`frame: the session's choices or counts in ${heading ?? 'the pending frame'}`];
};

interface Allowed {
  headings: Set<string>;
  pending: boolean;
}

/** The plant Planted owes (`src/test/plant-image-rule.ts`): the home set's seed in the scheme the system names, 112 pt. */
const PLANTED_SEED = () => ({ asset: `assets/home/seed-${systemScheme()}.png`, size: 112 });

/** The plant Today's stage line `label` owes: its stage's image in the scheme the system names, 28 pt; none with no stage line or one not planted. */
const todayPlant = (label: string | null | undefined) => {
  const name = STAGE_IMAGE.get(label ?? '');
  if (name === undefined) return null;
  return { asset: `assets/home/${name}-${systemScheme()}.png`, size: 28 };
};

/** A frame's drawing faults against the plant `want` owes (`plantFaults`), each named for `where`. */
const drawingFaults = (
  host: Element,
  where: string,
  want: { readonly asset: string; readonly size: number } | null,
) => plantFaults(host, want).map((fault) => `frame: ${where} draws ${fault}`);

/** What one frame shows wrong: more than one heading; a pending frame after the launch decided, or one offering a button, a stage or a plant image; a heading the command cannot reach; Planted with no recall on the disk or without its one hidden seed image; Today's drawing not its stage line's; and the phases' own faults, a plant image among them. */
const frameFaults = (
  host: Element,
  shown: readonly string[],
  buttons: readonly (string | null)[],
  allowed: Allowed,
  phase: { readonly said: boolean; readonly voiceOn: boolean; readonly held: number | null },
): string[] => {
  const out: string[] = shown.length > 1 ? [`frame: ${shown.length} headings`] : [];
  const heading = shown[0];
  out.push(...sessionFaults(host, heading));
  if (heading === undefined) {
    if (!allowed.pending) out.push('frame: no heading after the launch decided');
    if (buttons.length > 0) out.push('frame: a pending frame offers a button');
    if (host.querySelector('[data-testid="stage"],[data-testid="plant"],[role="alert"]') !== null)
      out.push('frame: a pending frame claims a stage');
    if (CLAIM.test(host.textContent ?? '')) out.push('frame: a pending frame claims');
    out.push(...drawingFaults(host, 'the pending frame', null));
    return out;
  }
  if (!allowed.headings.has(heading)) out.push(`frame: heading ${heading} not allowed now`);
  if (heading === 'Planted') {
    if (!hasPassageRecall(device.disk))
      out.push('frame: Planted while the disk holds no recall of the passage');
    const stage = host.querySelector('[data-testid="stage"]')?.getAttribute('aria-label');
    const plant = host.querySelector('[data-testid="plant"]');
    if (stage !== 'Stage: seed' || plant?.getAttribute('aria-hidden') !== 'true')
      out.push('frame: Planted without its hidden seed');
    out.push(...drawingFaults(host, 'Planted', PLANTED_SEED()));
  }
  if (heading === 'Today') {
    const stage = host.querySelector('[data-testid="stage"]')?.getAttribute('aria-label');
    out.push(...drawingFaults(host, 'Today', todayPlant(stage)));
  }
  if (['Today', END, 'Planted', 'Your field'].includes(heading)) return out;
  out.push(...drawingFaults(host, heading, null));
  out.push(...phaseFaults(host, heading, buttons, phase.voiceOn));
  if (heading === 'Hear it') return [...out, ...hearFaults(host, phase.held)];
  return [...out, ...wordFaults(host, heading, phase.said)];
};

/** A launch: the root over the device's disk as it stands, on the device's clock, built once `gate` resolves; every frame from before the first render held to the root's rule for `garden`, the launch's read as it stands. */
const mount = async (
  allowed: Allowed,
  voices: 0 | 1,
  count: (key: string) => void,
  time: Time,
  garden: 'read' | 'unread',
) => {
  const voice = voiceStandIn(voices);
  const dictation = recognizer();
  const chimes: Growth[] = [];
  const felt = { ticks: 0 };
  const gate = Promise.withResolvers<void>();
  const layer = appLayer({
    source: dictation.layer,
    haptics: Layer.succeed(
      Haptics,
      Haptics.of({ tick: Effect.sync(() => void (felt.ticks += 1)) }),
    ),
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
  }).pipe(Layer.provideMerge(Layer.merge(clockOf(time), Logger.layer([]))));
  const host = document.createElement('div');
  document.body.append(host);
  const headings = () =>
    [...host.querySelectorAll('[role="heading"]')]
      .map((node) => (node.textContent ?? '').trim())
      .filter((text) => HEADINGS.includes(text));
  const buttons = () =>
    [...host.querySelectorAll('[role="button"]')].map((node) => node.getAttribute('aria-label'));
  const faults: string[] = [];
  const phase = { said: false, voiceOn: true, held: null as number | null };
  const rooted = { garden, rule: watchRoot(host, garden), taken: 0, field: false };
  /** Moves the root rule's new faults into the rig's list, and a `Your field` heading on an unread launch once. */
  const takeRoot = () => {
    faults.push(...rooted.rule.faults.slice(rooted.taken));
    rooted.taken = rooted.rule.faults.length;
    if (
      rooted.garden === 'unread' &&
      !rooted.field &&
      rooted.rule.frames.some((each) => each.headings.includes('Your field'))
    ) {
      rooted.field = true;
      faults.push('frame: Your field on an unread launch');
    }
  };
  /** The garden the launch's read decides, while only pending frames have shown: the rule watches on for it. */
  const readAs = (read: 'read' | 'unread') => {
    if (read === rooted.garden) return;
    takeRoot();
    rooted.rule.stop();
    Object.assign(rooted, { garden: read, rule: watchRoot(host, read), taken: 0 });
  };
  const watch = new MutationObserver(() => {
    count('frames');
    faults.push(...frameFaults(host, headings(), buttons(), allowed, phase));
  });
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
    const late = deadline(ms);
    while (!holds()) {
      if (late()) return false;
      await act(() => new Promise((resolve) => setTimeout(resolve, 1)));
    }
    return true;
  };
  const node = (label: string) =>
    [...host.querySelectorAll('[role="button"],[role="radio"]')].find(
      (each) => each.getAttribute('aria-label') === label,
    );
  const press = (at: Element | undefined, label: string) => {
    expect(at === undefined, `button ${label}`).toBe(false);
    at?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
  };
  const click = (label: string) => act(async () => press(node(label), label));
  const leave = async () => {
    takeRoot();
    rooted.rule.stop();
    watch.disconnect();
    await act(async () => root.unmount());
    host.remove();
  };
  /** Home as it shows: its Today card's lines (none before a plan) and whether it offers `Start`. */
  const home = () => ({
    counts: cardLine(host),
    begin: node('Start') !== undefined,
  });
  return {
    host,
    takeRoot,
    readAs,
    home,
    voice,
    felt,
    dictation,
    chimes,
    faults,
    phase,
    gate,
    until,
    node,
    press,
    click,
    buttons,
    heading: () => headings()[0] ?? null,
    leave,
  };
};

type Rig = Awaited<ReturnType<typeof mount>>;

/** The counts line of Today's done state. */
const DONE = 'Nothing to tend now';

/** Today's action buttons shown, by name: Say it, Listening or Next. */
const actionsOf = (r: Rig) =>
  r
    .buttons()
    .filter(
      (name): name is string => name !== null && ['Say it', 'Listening', 'Next'].includes(name),
    );

/** What the end of a run shows of `ended`, as `endShown` reads it: its heading, no counts line, the line of what grew and each grown verse's name. */
const endWant = (ended: readonly { readonly reference: string; readonly stage: string }[]) => ({
  headings: [END],
  counts: [],
  grew: [grewLine(ended.length)],
  grown: ended.map((each) => `${each.reference}, ${each.stage}`),
});

/** Whether a read Today is ready in the done state (the end of the run as `endWant` gives `ended`, or with none the bare counts line alone) or under Next (with its result), with `sets` writes reached; not yet while no stage shows; none for Say it's own checks. */
const runReady = (
  r: Rig,
  run: 'say' | 'next' | 'done',
  sets: number,
  ended: Parameters<typeof endWant>[0] | null,
): boolean | null => {
  const written = device.calls.set >= sets;
  if (run === 'done') {
    if (actionsOf(r).length > 0 || !written) return false;
    if (ended !== null) return JSON.stringify(endShown(r.host)) === JSON.stringify(endWant(ended));
    return r.host.querySelector('[data-testid="session"]')?.textContent === DONE;
  }
  if (r.host.querySelector('[data-testid="stage"]') === null) return false;
  if (run === 'say') return null;
  return (
    actionsOf(r).join() === 'Next' &&
    r.host.querySelector('[data-testid="summary"]') !== null &&
    written
  );
};

/** A finished recital Say it shows: its record as the model expects it, and whether it is kept. */
interface Shown {
  readonly keep: boolean;
  readonly window: readonly [number, number];
  key: string | null;
  record: {
    reference: string;
    grade: number;
    suggested: number;
    words: number;
    missed: number;
    peeked: number;
    extra: number;
  };
  /** Missed words not yet peeked. */
  misses: number;
}

/** A recital held open. */
interface Open {
  readonly plan: Plan;
  readonly keep: boolean;
  readonly window: readonly [number, number];
  peeks: number;
}

/** The model of one device: its disk, store and switch across launches, then the launch's own screen, reading and recital. */
export interface Model {
  disk: Map<string, string | null>;
  /** Valid recalls of any verse on the disk. */
  recalls: number;
  /** Valid recalls of the passage on the disk. */
  passage: number;
  down: boolean;
  /** The stored keys read the voice on (`voiceOnOf`). */
  stored: boolean;
  /** Since the last Recover: a landed write is one after the device came back. */
  recovered: boolean;
  /** The voice as this launch read it: the stored keys', or on (Her) when the store was down. */
  voiceOn: boolean;
  /** The launch's store is open: its read opened it, or a call since the device came back. */
  opened: boolean;
  screen: Screen;
  unread: boolean;
  reading: boolean;
  utterance: number;
  lit: number;
  current: { first: number; last: number } | null;
  speaks: number;
  /** Where each speak of this launch starts in the passage: 0 for Listen, the sought word's start for a hold's release. */
  starts: number[];
  /** Where the current utterance's text starts in the passage. */
  offset: number;
  /** The source's pauses and resumes in this launch. */
  pauses: number;
  resumes: number;
  sets: number;
  said: 'none' | 'open' | 'heard' | 'unheard';
  refused: boolean;
  open: Open | null;
  shown: Shown | null;
  /** A Today write landed in this launch with the passage grown past a seed: a growth line and a chime may show. */
  grew: boolean;
  /** Today's plan made last in this launch: its items, whether it holds the passage, and the passage's recalls then; none before home's first show (or an unread Today's). */
  plan: {
    readonly items: readonly ModelItem[];
    readonly passage: boolean;
    readonly recalls: number;
  } | null;
  /** Today holds the passage: from a press of Say it until Next or a making with no recital under way. */
  held: boolean;
  /** The recital last pressed was said under a cue: on a read Today, the full text before the passage is planted and first letters at a seed. */
  cued: boolean;
}

/** Today's run in a read launch (`plan` made): the passage shown under Say it until a kept recall, then under Next, and the done state once it is neither held nor planned and not done. */
const runOf = (m: Model): 'say' | 'next' | 'done' => {
  const plan = m.plan;
  if (plan === null) return 'say';
  const done = m.passage > plan.recalls;
  if (!m.held && (!plan.passage || done)) return 'done';
  return done ? 'next' : 'say';
};

/** The end of each plan asked, by the writes and the disk's size it was asked at: a poll asks no model. */
const ENDS = new WeakMap<object, { readonly at: string; readonly ended: ModelEnd }>();
type ModelEnd = ReturnType<typeof tendedModel>;

/** H9: the end of Today's run by `tendedModel` over the plan made last and the model's disk, asked only in the run's done state (nothing held); none while that plan holds no item, Today's bare done state. */
const endOf = (m: Model): ModelEnd => {
  const plan = m.plan;
  if (plan === null || m.held || runOf(m) !== 'done') return null;
  const at = `${m.sets}:${m.disk.size}`;
  const cached = ENDS.get(plan);
  if (cached !== undefined && cached.at === at) return cached.ended;
  const records = [...plantsOf(m.disk).values()].flat();
  const ended = tendedModel({ plan: plan.items, hold: null }, [], records);
  ENDS.set(plan, { at, ended });
  return ended;
};

/** The heading the model's screen shows: Today's is `The field is tended` at the end of a run. */
const headingOf = (m: Model) => {
  if (m.screen === 'today' && endOf(m) !== null) return END;
  return HEADING[m.screen];
};

/** The valid recalls of each verse on `disk`, as the garden reads them: a key that names its record's reference and start. */
const plantsOf = (disk: ReadonlyMap<string, string | null>) => {
  const plants = new Map<string, Recall[]>();
  for (const [key, value] of disk) {
    if (!key.startsWith(PREFIX) || value === null) continue;
    let record: Recall | null = null;
    try {
      record = JSON.parse(value);
    } catch {
      continue;
    }
    if (record === null || key !== `${PREFIX}${record.reference}/${record.startedAt}`) continue;
    plants.set(record.reference, [...(plants.get(record.reference) ?? []), record]);
  }
  return plants;
};

/** The items of hsdaily's model's plan over `disk` at `at` with the default five minutes. */
const planOver = (disk: ReadonlyMap<string, string | null>, at: number) =>
  planModel({
    plants: plantsOf(disk),
    pieces: [{ reference: passage.reference, words: N, group: passage.reference }],
    at,
    offset: hostOffset(at),
    minutes: 5,
  }).items;

/** The grade the matcher suggests for a finished recital: Again when nothing or over a tenth is missed, Hard when any is missed, an extra word is said, a word was peeked or the recital was said under a cue (`helped`), else Good. */
export const gradeOf = (hits: number, extras: number, peeks: number, helped = false) => {
  const missing = N - hits;
  if (hits === 0 || missing * 10 > N) return 1;
  if (missing > 0 || extras > 0 || peeks > 0 || helped) return 2;
  return 3;
};

type Ending = 'finished' | 'unavailable' | 'denied' | 'interrupted' | 'failed';

const CLOSES: Readonly<Record<Close, Ending>> = {
  end: 'finished',
  denied: 'denied',
  interrupted: 'interrupted',
  error: 'failed',
  unavailable: 'failed',
};

/**
 * How a plan's recital ends, and the words its final results held (source
 * indexes, an extra word -1): with no engine left, `unavailable`; at the
 * reader's finish (held open, or a second tap at once), the finish's
 * answer; else Say it finishes the recital itself at the result that lights
 * the last word, and a recital whose last word is not said ends as the
 * engine closes it.
 */
interface Outcome {
  readonly ending: Ending;
  readonly finals: readonly number[];
}

const outcomeOf = (plan: Plan, at: 'close' | 'finish' | 'twice'): Outcome => {
  const finished: Ending = plan.onFinish === 'end' ? 'finished' : 'failed';
  if (
    plan.fallbacks.length >= 3 &&
    (at !== 'twice' || plan.fallbacks.every((each) => each === 'refuse'))
  )
    return { ending: 'unavailable', finals: [] };
  if (at === 'twice') return { ending: finished, finals: [] };
  if (at === 'finish') return { ending: finished, finals: finalsIn(plan, plan.cut) };
  const auto = autoAt(plan);
  if (auto >= 0) return { ending: finished, finals: finalsIn(plan, auto + 1) };
  return { ending: CLOSES[plan.close], finals: finalsIn(plan, Number.MAX_SAFE_INTEGER) };
};

const isHeld = (plan: Plan) => plan.fallbacks.length < 3 && plan.cut < stepsOf(plan).length;

export const activityOf = (m: Model) => {
  if (m.reading) return `${m.screen}:reading`;
  if (m.screen === 'home') return runOf(m) === 'done' ? 'home:done' : 'home:idle';
  if (m.said === 'open') return `${m.screen}:listening`;
  if (m.said === 'unheard') return `${m.screen}:alert`;
  if (m.refused) return `${m.screen}:refused`;
  if (m.screen === 'today' && runOf(m) === 'done') return 'today:done';
  if (m.shown !== null && (m.screen === 'today' || m.screen === 'unread'))
    return `${m.screen}:recap`;
  return `${m.screen}:idle`;
};

const RECORD_FIELDS = [
  'reference',
  'startedAt',
  'offset',
  'grade',
  'suggested',
  'words',
  'missed',
  'peeked',
  'extra',
];

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

/** The disk a device starts with, from its parts, its old switch and its choice. */
export const diskOf = (start: DeviceStart): (readonly [string, string | null])[] => {
  const at = Date.UTC(2026, 0, 5, 9);
  const parts: Readonly<Record<Part, readonly [string, string | null]>> = {
    junk: [`${PREFIX}${passage.reference}/junk`, 'not a recall'],
    blank: [`${PREFIX}${passage.reference}/${at + 1}`, null],
    misfiled: [`${PREFIX}${passage.reference}/${at + 2}`, recallRecord(passage.reference, at)[1]],
    foreign: ['elsewhere/key', 'kept as it is'],
    other: recallRecord(OTHER, at),
    passage: recallRecord(passage.reference, at),
  };
  const disk = start.parts.map((part) => parts[part]);
  if (start.voice === 'true') disk.push([SWITCH, 'true']);
  if (start.voice === 'false') disk.push([SWITCH, 'false']);
  if (start.voice === 'other') disk.push([SWITCH, 'yes']);
  if (start.choice !== undefined && start.choice !== 'absent') disk.push([CHOICE, start.choice]);
  return disk;
};

const setDown = (down: boolean) => {
  const times = down ? Number.MAX_SAFE_INTEGER : 0;
  device.failing = { open: times, keys: times, get: times, set: times };
};

/** The session's launch: its rig once mounted, the headings its frames may show, and its kind. */
interface Launched {
  rig: Rig | undefined;
  allowed: Allowed;
  kind: LaunchKind;
}

/** What a recital's end writes: whether it keeps a recall, and whether that write lands. */
interface Written {
  readonly lands: boolean;
  readonly keeps: boolean;
}

const UNWRITTEN: Written = { lands: false, keeps: false };

/** One device driven through commands, against the model; `count` records coverage. */
export const session = (count: (key: string) => void) => {
  const at: Launched = {
    rig: undefined,
    allowed: { headings: new Set(), pending: true },
    kind: { read: 'ok', held: false, voices: 0 },
  };
  const m: Model = {
    disk: new Map(),
    recalls: 0,
    passage: 0,
    down: false,
    stored: true,
    recovered: false,
    voiceOn: true,
    opened: false,
    screen: 'pending',
    unread: false,
    reading: false,
    utterance: 0,
    lit: 0,
    current: null,
    speaks: 0,
    starts: [],
    offset: 0,
    pauses: 0,
    resumes: 0,
    sets: 0,
    said: 'none',
    refused: false,
    open: null,
    shown: null,
    grew: false,
    plan: null,
    held: false,
    cued: false,
  };
  /** Whether the last settle showed the end of a run, so the frames of the command after it may still show its heading. */
  const settled = { end: false };
  const trace: string[] = [];
  const where = () => trace.join(' > ');
  const rig = (): Rig => at.rig ?? expect.unreachable('no launch');
  const time: Time = { now: START };
  /** The device's instant now, as its app's clock reads it. */
  const now = () => time.now;

  const opening = (): Screen => {
    if (m.unread) return 'unread';
    return m.recalls > 0 ? 'home' : 'hear';
  };

  /** A making of Today's plan: one with no recital under way lets the held passage go, its recital's result with it. */
  const make = () => {
    if (m.said !== 'open') {
      m.held = false;
      m.said = 'none';
      m.refused = false;
      m.shown = null;
    }
    const items = planOver(m.disk, now());
    m.plan = {
      items,
      passage: items.some((item) => item.reference === passage.reference),
      recalls: m.passage,
    };
    count(`made:${m.plan.passage ? 'passage' : 'empty'}${m.held ? ':held' : ''}`);
  };

  /** The screen moves from `before` to `screen`, the frames between allowed the two headings; home's first show makes the plan. */
  const go = (before: Screen, screen: Screen) => {
    m.screen = screen;
    if (screen === 'home' && before !== 'home') make();
    const ends = settled.end || headingOf(m) === END;
    at.allowed.headings = new Set(
      [HEADING[before], HEADING[screen], ends ? END : null].filter(
        (each): each is string => each !== null,
      ),
    );
  };

  /** The screen is ready for the model's oracles. */
  const ready = () => {
    const r = rig();
    const want = headingOf(m);
    if (r.heading() !== want) return false;
    if (m.screen === 'pending') return true;
    if (m.screen === 'hear') return r.buttons().includes('Listen') === (m.voiceOn && !m.reading);
    if (m.screen === 'planted') return true;
    if (m.screen === 'home') return r.home().counts !== '';
    if (m.screen === 'today') {
      const run = runReady(r, runOf(m), m.sets, endOf(m));
      if (run !== null) return run;
    }
    if (m.said === 'open')
      return r.buttons().includes('Listening') && r.dictation.state.rest !== undefined;
    if (m.said === 'unheard') return r.host.querySelector('[role="alert"]') !== null;
    if (m.refused) return r.host.querySelector('[data-testid="summary"]') !== null;
    if (m.shown !== null && m.said === 'heard')
      return r.host.querySelector('[data-testid="summary"]') !== null && device.calls.set >= m.sets;
    return r.buttons().includes('Say it') && device.calls.set >= m.sets;
  };

  /** Takes a landed write into the model: the key the app wrote for the shown recital, its record checked field by field. */
  const landed = () => {
    const shown = m.shown;
    if (shown === null) return;
    const fresh = [...device.disk.keys()].filter(
      (key) => !m.disk.has(key) && key.startsWith(`${PREFIX}${passage.reference}/`),
    );
    const key = shown.key ?? fresh[0] ?? '';
    expect(shown.key === null ? fresh.length : 1, `${where()}: one new recall`).toBe(1);
    const record = JSON.parse(device.disk.get(key) ?? 'null');
    expect(Object.keys(record ?? {}).toSorted(), `${where()}: the record's fields`).toEqual(
      RECORD_FIELDS.toSorted(),
    );
    expect(key, `${where()}: the record's key`).toBe(
      `${PREFIX}${passage.reference}/${record.startedAt}`,
    );
    expect(
      record.startedAt >= shown.window[0] - 5 && record.startedAt <= shown.window[1] + 5,
      `${where()}: the record started at its recital`,
    ).toBe(true);
    const { startedAt, offset, ...fields } = record;
    expect(fields, `${where()}: the record`).toEqual(shown.record);
    expect(offset, `${where()}: the record's zone offset at its start`).toBe(hostOffset(startedAt));
    if (shown.key === null) {
      m.recalls += 1;
      m.passage += 1;
    }
    shown.key = key;
    m.disk.set(key, device.disk.get(key) ?? null);
  };

  /** A kept recital's write, as the model expects it: counted, then landed or refused by the store's state. It reaches the store's `setItem` once the store is open; a down device refuses the open first. */
  const write = (mode: Write) => {
    const wasDown = m.down;
    count(`write:${m.screen}:${wasDown ? 'while-down' : mode}`);
    if (mode === 'down') {
      m.down = true;
      setDown(true);
    }
    if (m.opened || !m.down) m.sets += 1;
    if (!m.down) m.opened = true;
    if (mode === 'refused' && !m.down) device.fail('set', 1);
    const lands = mode === 'lands' && !m.down;
    if (lands && m.recovered) count(`write:recovered:${m.screen}`);
    if (lands) m.recovered = false;
    return lands;
  };

  /** Arms the store for a command whose write may not come: only a device going down holds whether a write comes or not. */
  const arm = (mode: Write) => {
    if (mode !== 'down') return;
    m.down = true;
    setDown(true);
  };

  /** A recital that ended, applied to the model on its screen. */
  const ended = (
    before: Screen,
    outcome: Outcome,
    keep: boolean,
    window: readonly [number, number],
    peeks: number,
    mode: Write,
  ): Written => {
    count(`ending:${before}:${outcome.ending}`);
    if (outcome.ending !== 'finished') {
      arm(mode);
      m.said = 'unheard';
      m.refused = false;
      m.shown = null;
      go(before, before);
      return UNWRITTEN;
    }
    const hits = outcome.finals.filter((index) => index >= 0).length;
    const extras = outcome.finals.length - hits;
    count(`missed:${before}:${hits === N ? 'none' : hits === 0 ? 'all' : 'some'}`);
    const grade = gradeOf(hits, extras, peeks, m.cued);
    m.shown = {
      keep,
      window,
      key: null,
      record: {
        reference: passage.reference,
        grade,
        suggested: grade,
        words: N,
        missed: N - hits,
        peeked: peeks,
        extra: extras,
      },
      misses: N - hits - peeks,
    };
    if (before === 'letters') {
      arm(mode);
      m.said = 'none';
      m.refused = false;
      go(before, 'alone');
      return UNWRITTEN;
    }
    const lands = write(mode);
    if (before === 'alone') {
      m.said = lands ? 'none' : 'heard';
      m.refused = !lands;
      go(before, lands ? 'planted' : 'alone');
    } else {
      m.said = 'heard';
      go(before, before);
    }
    return { lands, keeps: true };
  };

  /** Settles a landed write: waits for the key, then reads it. */
  const settleWrite = async (outcome: Written) => {
    if (!outcome.keeps) return;
    const r = rig();
    await r.until(() => device.calls.set >= m.sets);
    if (!outcome.lands) return;
    await r.until(() => {
      const key = m.shown?.key;
      if (key !== null && key !== undefined) return device.disk.get(key) !== m.disk.get(key);
      return [...device.disk.keys()].some((each) => !m.disk.has(each));
    });
    landed();
    if (m.screen === 'today' && m.passage >= 2) m.grew = true;
  };

  /** The settle's oracles. Today's stage past the passage's first recall is the garden's own rule over its recalls; this rule claims only that it is planted. */
  const settle = async () => {
    const r = rig();
    await r.until(ready);
    await act(async () => {});
    const here = where();
    r.takeRoot();
    expect(r.faults, here).toEqual([]);
    const heading = headingOf(m);
    expect(r.heading(), here).toBe(heading);
    settled.end = heading === END;
    expect([...device.disk].toSorted(), `${here}: the disk`).toEqual([...m.disk].toSorted());
    expect(device.calls.set, `${here}: the writes`).toBe(m.sets);
    expect(device.calls.remove + device.calls.clear, `${here}: removals`).toBe(0);
    expect(r.voice.calls.speaks, `${here}: the speaks`).toBe(m.speaks);
    expect(
      r.voice.calls.texts.map((text, index) => text === passage.text.slice(m.starts[index] ?? 0)),
      `${here}: each speak is the passage from its start`,
    ).toEqual(m.starts.map(() => true));
    expect(
      [r.voice.calls.pauses, r.voice.calls.resumes],
      `${here}: the pauses and resumes`,
    ).toEqual([m.pauses, m.resumes]);
    if (!m.grew) expect(r.chimes.length, `${here}: no chime`).toBe(0);
    if (m.screen !== 'hear')
      expect(r.voice.calls.sounding, `${here}: a reading left outside hear`).toBe(false);
    if (m.screen === 'pending') {
      expect([r.buttons().length, device.calls.keys], `${here}: the pending frame`).toEqual([0, 0]);
      return;
    }
    if (m.screen === 'hear') checkHear(r, here);
    checkHome(r, here);
    checkRun(r, here);
    checkRecital(r, here);
    checkClaims(r, here);
  };

  /** Today's run: the action the model's run offers (Listening while a recital is open, none in the done state, never Next on an unread Today), and in the done state no verse, stage, grade or result, over the end of the run exactly as `endOf` gives it (tallied `end:none`, `end:one` or `end:many`), or with none the counts line alone. */
  const checkRun = (r: Rig, here: string) => {
    if (m.screen !== 'today' && m.screen !== 'unread') return;
    const run = m.screen === 'today' ? runOf(m) : 'say';
    count(`run:${m.screen}:${run}`);
    const want = { say: ['Say it'], next: ['Next'], done: [] }[run];
    expect(actionsOf(r), `${here}: Today's action`).toEqual(
      m.said === 'open' ? ['Listening'] : want,
    );
    if (run !== 'done') return;
    const none = {
      verse: r.host.querySelector('[data-testid="reference"],[data-testid^="word-"]') !== null,
      stage: r.host.querySelector('[data-testid="stage"]') !== null,
      grade: r.host.querySelector('[role="radiogroup"][aria-label="Grade"]') !== null,
      result: r.host.querySelector('[data-testid="summary"],[role="alert"]') !== null,
    };
    const ended = m.screen === 'today' ? endOf(m) : null;
    if (ended !== null) {
      count(['end:none', 'end:one'][ended.length] ?? 'end:many');
      expect({ ...endShown(r.host), ...none }, `${here}: the end of the run`).toEqual({
        ...endWant(ended),
        verse: false,
        stage: false,
        grade: false,
        result: false,
      });
      return;
    }
    expect(
      { counts: r.host.querySelector('[data-testid="session"]')?.textContent ?? null, ...none },
      `${here}: the done state`,
    ).toEqual({ counts: DONE, verse: false, stage: false, grade: false, result: false });
  };

  /** Home at rest: the Today card's lines the plan made at its first show gives (`All tended for today` in its done state), and `Start` exactly when that plan shows an item. */
  const checkHome = (r: Rig, here: string) => {
    if (m.screen !== 'home') return;
    const run = runOf(m);
    count(`run:home:${run}`);
    const recalls = plantsOf(m.disk);
    expect(r.home(), `${here}: home`).toEqual({
      counts: cardLineModel(
        m.plan?.items ?? null,
        (reference) => recalls.get(reference)?.length ?? 0,
      ),
      begin: run !== 'done',
    });
  };

  /** Hear at rest: Listen iff the voice is on and idle, Next, the reading view iff the voice reads, the inked words the model's lit ones and the selected ones its current range. */
  const checkHear = (r: Rig, here: string) => {
    const hear = hearOf(r.host);
    const current = m.reading ? m.current : null;
    expect(
      {
        listen: r.buttons().includes('Listen'),
        next: r.buttons().includes('Next'),
        view: r.host.querySelector('[data-testid="reading"]') !== null,
        inked: hear.inked,
        selected: hear.selected,
      },
      `${here}: hear`,
    ).toEqual({
      listen: m.voiceOn && !m.reading,
      next: true,
      view: m.reading,
      inked: m.reading ? m.lit : N,
      selected: WORDS.flatMap((_, index) =>
        current !== null && index >= current.first && index <= current.last ? [index] : [],
      ),
    });
  };

  /** A recital's screen at rest: the alert, the count and Listening as the model's recital, and letters and alone at rest showing only their cues. */
  const checkRecital = (r: Rig, here: string) => {
    const alert = r.host.querySelector('[role="alert"]') !== null;
    const summary = r.host.querySelector('[data-testid="summary"]') !== null;
    if (m.screen === 'letters' || m.screen === 'alone') {
      expect(
        { alert, summary, listening: r.buttons().includes('Listening') },
        `${here}: the recital`,
      ).toEqual({
        alert: m.said === 'unheard',
        summary: m.refused,
        listening: m.said === 'open',
      });
      if (m.said === 'none' || m.said === 'unheard') {
        const sight = sightOf(r.host);
        const wrong = WORDS.filter((_, index) => {
          const cue = m.screen === 'letters' ? (CUES[index] ?? '') : '';
          return sight.text.get(index) !== cue;
        }).length;
        expect(wrong, `${here}: words at rest not shown as their cues`).toBe(0);
      }
    }
    if (m.screen === 'today' || m.screen === 'unread') {
      expect(
        { alert, listening: r.buttons().includes('Listening') },
        `${here}: Today's recital`,
      ).toEqual({
        alert: m.said === 'unheard',
        listening: m.said === 'open',
      });
      if (m.said === 'heard') expect(summary, `${here}: Today's count`).toBe(true);
    }
  };

  /** The claims at rest: none and no plant image on an unread Today, a seed and its one hidden 112 pt seed image on Planted, Today's stage the model's with no growth line until a grown write. */
  const checkClaims = (r: Rig, here: string) => {
    const stage = r.host.querySelector('[data-testid="stage"]')?.getAttribute('aria-label') ?? null;
    const growth = r.host.querySelector('[data-testid="growth"]') !== null;
    if (m.screen === 'unread')
      expect(
        [stage, growth, r.host.querySelector('[data-testid="plant"]'), plantFaults(r.host, null)],
        `${here}: unread claims`,
      ).toEqual([null, false, null, []]);
    if (m.screen === 'planted')
      expect([stage, plantFaults(r.host, PLANTED_SEED())], `${here}: Planted's seed`).toEqual([
        'Stage: seed',
        [],
      ]);
    if (m.screen !== 'today' || runOf(m) === 'done') return;
    const want = ['Stage: not planted', 'Stage: seed'][m.passage] ?? 'Stage: planted';
    const planted = stage !== null && (STAGES.includes(stage) || stage === 'Stage: seed');
    const got = m.passage >= 2 && planted ? 'Stage: planted' : stage;
    expect(got, `${here}: Today's stage`).toBe(want);
    if (!m.grew) expect(growth, `${here}: no growth line`).toBe(false);
  };

  /** The garden a launch of `kind` reads as the device stands: unread when the device is down or every listing fails. */
  const gardenOf = (kind: LaunchKind) => (m.down || kind.read === 'unread' ? 'unread' : 'read');

  /** A launch of `kind` over the device's disk as it stands. */
  const launch = async (kind: LaunchKind) => {
    device.launch();
    if (m.down) setDown(true);
    if (kind.held) count('launch:held');
    count(`launch:voices-${kind.voices}`);
    at.kind = kind;
    Object.assign(m, {
      reading: false,
      utterance: 0,
      lit: 0,
      current: null,
      speaks: 0,
      starts: [],
      offset: 0,
      pauses: 0,
      resumes: 0,
      sets: 0,
      said: 'none',
      refused: false,
      open: null,
      shown: null,
      grew: false,
      screen: 'pending',
      plan: null,
      held: false,
      cued: false,
    } satisfies Partial<Model>);
    at.allowed = { headings: new Set(), pending: true };
    at.rig = await mount(at.allowed, kind.voices, count, time, gardenOf(kind));
    if (kind.held) {
      await rig().until(() => false, 5);
      await settle();
      return;
    }
    await resolve();
  };

  /** The launch's store comes up: its read meets the device as it is now, a down one or the launch's read faults. */
  const resolve = async () => {
    const kind = at.kind;
    if (!m.down && kind.read === 'unread') device.fail('keys', 3);
    if (!m.down && kind.read === 'retry1') device.fail('keys', 1);
    if (!m.down && kind.read === 'retry2') device.fail('keys', 2);
    m.unread = m.down || kind.read === 'unread';
    count(`launch:${m.down ? 'down' : kind.read}`);
    m.voiceOn = m.down || m.stored;
    m.opened = !m.down;
    if (!m.voiceOn) count('launch:voice-off');
    rig().phase.voiceOn = m.voiceOn;
    rig().readAs(m.unread ? 'unread' : 'read');
    const screen = opening();
    m.screen = screen;
    if (screen === 'home') make();
    at.allowed.headings = new Set([HEADING[screen] ?? '']);
    rig().gate.resolve();
    await settle();
    at.allowed.pending = false;
    count(`open:${screen}`);
  };

  const leave = async () => {
    const r = rig();
    const open = m.said === 'open';
    await r.leave();
    expect(r.faults, `${where()}: the frames before the launch left`).toEqual([]);
    expect(await r.until(() => !r.voice.calls.sounding), `${where()}: the reading stopped`).toBe(
      true,
    );
    if (open)
      expect(
        [r.dictation.state.cancels > 0, r.dictation.state.held],
        `${where()}: the recital cancelled as the runtime closed`,
      ).toEqual([true, 0]);
  };

  /** Starts a recital of `plan` at a press of Say it (twice when `twice`), on the model. */
  const say = async (plan: Plan, mode: Write, twice: boolean) => {
    const r = rig();
    const before = m.screen;
    const keep = before !== 'letters';
    r.dictation.state.plan = plan;
    r.phase.said = true;
    if (before === 'today') m.held = true;
    const stage = r.host.querySelector('[data-testid="stage"]')?.getAttribute('aria-label');
    m.cued = before === 'today' && (m.passage <= 1 || stage === 'Stage: seed');
    time.now += 1000;
    const start = now();
    let outcome = UNWRITTEN;
    const window = [start, start] as [number, number];
    if (twice) {
      outcome = ended(before, outcomeOf(plan, 'twice'), keep, window, 0, mode);
      count(
        `batch:say-twice${outcomeOf(plan, 'twice').ending === 'unavailable' ? ':unavailable' : ''}`,
      );
      const button = r.node('Say it');
      await act(async () => {
        r.press(button, 'Say it');
        r.press(button, 'Say it');
      });
    } else if (isHeld(plan)) {
      m.said = 'open';
      m.refused = false;
      m.open = { plan, keep, window, peeks: 0 };
      m.shown = null;
      go(before, before);
      arm(mode);
      await r.click('Say it');
    } else {
      outcome = ended(before, outcomeOf(plan, 'close'), keep, window, 0, mode);
      await r.click('Say it');
    }
    window[1] = now();
    await settleWrite(outcome);
  };

  /** Ends the recital held open: the rest of it said (`More`) or the reader's finish. */
  const close = async (how: 'close' | 'finish', mode: Write) => {
    const r = rig();
    const open = m.open ?? expect.unreachable('no recital open');
    const before = m.screen;
    m.open = null;
    const outcome = ended(
      before,
      outcomeOf(open.plan, how),
      open.keep,
      open.window,
      open.peeks,
      mode,
    );
    if (how === 'close') await act(async () => r.dictation.more());
    else await r.click('Listening');
    await settleWrite(outcome);
  };

  /** A press of a missed word's mark: a peek, which re-keeps a finished kept recital. */
  const peek = async (mode: Write) => {
    const r = rig();
    const mark = [...r.host.querySelectorAll('[role="button"]')].find((node) =>
      /^Missed word \d+$/u.test(node.getAttribute('aria-label') ?? ''),
    );
    const label = mark?.getAttribute('aria-label') ?? '';
    const before = m.screen;
    let outcome = UNWRITTEN;
    if (m.said === 'open' && m.open !== null) {
      m.open.peeks += 1;
      arm(mode);
      count(`peek:${before}:listening`);
    } else if (m.shown !== null) {
      m.shown.record.peeked += 1;
      m.shown.misses -= 1;
      count(`peek:${before}:${m.shown.keep ? 'kept' : 'unkept'}`);
      if (m.shown.keep) {
        const lands = write(mode);
        outcome = { lands, keeps: true };
        if (before === 'alone' && lands) {
          m.said = 'none';
          m.refused = false;
          go(before, 'planted');
        }
      } else arm(mode);
    }
    await r.click(label);
    await settleWrite(outcome);
  };

  /** The device's clock moved to the passage's due, a minute on at least. */
  const toDue = () => {
    const recalls = plantsOf(m.disk).get(passage.reference) ?? [];
    const due = recalls.length > 0 ? dueModel(recalls) + 1 : 0;
    time.now = Math.max(now() + MINUTE, due);
  };

  /**
   * A new plan at the passage's due: the device's clock moved there (a minute
   * on at least), then the trip through home's Settings sheet
   * (`renewBySettings`: `Your field`, the Minutes radio checked, which writes
   * the minutes and makes the plan again at its tap, `Done`, and `Start` when
   * the plan shows an item). Arriving on home makes nothing; the trip ends on
   * Today when the plan shows an item, else on home's done state.
   */
  const renew = async () => {
    const r = rig();
    toDue();
    count(`renew:${activityOf(m)}`);
    m.sets += 1;
    m.opened = true;
    make();
    at.allowed.headings = new Set(['Today', 'Your field', ...(settled.end ? [END] : [])]);
    const trip = await renewBySettings(r);
    m.screen = runOf(m) === 'done' ? 'home' : 'today';
    expect(
      { at: trip.at, sheet: trip.sheet, looked: trip.looked > 0 },
      `${where()}: the trip`,
    ).toEqual({
      at: HEADING[m.screen] ?? 'no heading',
      sheet: [],
      looked: true,
    });
    await r.until(() => device.calls.set >= m.sets);
    m.disk.set(MINUTES_KEY, '5');
  };

  const grade = async (to: 1 | 2 | 3 | 4, mode: Write) => {
    const r = rig();
    const shown = m.shown;
    const names = { 1: 'Again', 2: 'Hard', 3: 'Good', 4: 'Easy' } as const;
    let outcome = UNWRITTEN;
    if (shown !== null && shown.keep && shown.record.grade !== to) {
      shown.record.grade = to;
      outcome = { lands: write(mode), keeps: true };
      count(`grade:${m.screen}`);
    } else arm(mode);
    await r.click(names[to]);
    await settleWrite(outcome);
  };

  /** The voice's range event of `kind`, against the reading's lit words. */
  const range = async (kind: RangeKind, step: number) => {
    const r = rig();
    const lit = m.lit;
    const word = (index: number) =>
      SPANS[Math.max(0, Math.min(N - 1, index))] ?? { start: 0, end: 1 };
    const span = (first: number, last: number) => ({
      location: word(first).start,
      length: word(last).end - word(first).start,
    });
    const event = (() => {
      if (kind === 'next') return { ...span(lit, lit), utterance: m.utterance };
      if (kind === 'two') return { ...span(lit, lit + 1), utterance: m.utterance };
      if (kind === 'ahead') return { ...span(lit + step, lit + step), utterance: m.utterance };
      if (kind === 'behind')
        return { ...span(lit - 1 - step, lit - 1 - step), utterance: m.utterance };
      if (kind === 'stale') return { ...span(lit, lit), utterance: m.utterance - 1 };
      return { location: passage.text.length, length: 1, utterance: m.utterance };
    })();
    const offset = m.offset;
    const valid = kind !== 'stale' && kind !== 'outside' && m.reading && event.location >= offset;
    if (offset > 0 && m.reading) count(`range:sought:${kind}`);
    if (valid) {
      const hit = SPANS.flatMap((each, index) =>
        each.start < event.location + event.length && event.location < each.end ? [index] : [],
      );
      const first = Math.min(...hit);
      const last = Math.max(...hit);
      if (hit.length > 0 && last + 1 >= lit) {
        m.lit = last + 1;
        m.current = { first, last };
      }
    }
    count(`range:${kind}${m.reading ? '' : ':idle'}`);
    go(m.screen, m.screen);
    await act(async () =>
      r.voice.send({ ...event, location: event.location - offset, kind: 'range' }),
    );
  };

  const voiceEvent = async (kind: VoiceKind, stale: boolean) => {
    const r = rig();
    const before = m.screen;
    const live = m.reading && !stale;
    count(`voice:${kind}${stale ? ':stale' : ''}${m.reading ? '' : ':idle'}@${before}`);
    if (live && kind === 'finish') {
      m.reading = false;
      go(before, 'letters');
    } else if (live && (kind === 'interrupt' || kind === 'cancel')) {
      m.reading = false;
      go(before, before);
    } else go(before, before);
    const utterance = stale ? m.utterance - 1 : m.utterance;
    await act(async () => r.voice.send({ utterance, kind, location: 0, length: 0 }));
  };

  /** A press of Listen: a speak that lands starts a reading; a refused one ends it at once. */
  const listen = (speak: 'lands' | 'refused') => {
    m.speaks += 1;
    m.starts.push(0);
    m.offset = 0;
    m.utterance += 1;
    m.lit = 0;
    m.current = null;
    m.reading = speak === 'lands';
    if (speak === 'refused') count('speak:refused');
  };

  /** The taps of a batch, on the model, in order, before any render: the nodes are those of the frame the batch starts on. */
  const batch = async (labels: readonly string[], speak: 'lands' | 'refused') => {
    const r = rig();
    const before = m.screen;
    let screen = before;
    let skipped = false;
    for (const label of labels) {
      if (label === 'Next' && screen === 'hear') {
        skipped = true;
        m.reading = false;
        screen = 'letters';
      } else if (label === 'Listen' && !skipped && !m.reading) listen(speak);
      else if (label === 'Continue') screen = 'home';
    }
    count(`batch:${labels.join('-')}@${before}`);
    if (screen === 'home') count('home:after-continue');
    go(before, screen);
    r.voice.calls.refuse = speak === 'refused';
    const nodes = labels.map((label) => r.node(label));
    await act(async () => labels.forEach((label, index) => r.press(nodes[index], label)));
  };

  /** A press of Next: on Today it lets the held passage go with its result; in hear it stops a reading under way and goes on to letters. */
  const next = async () => {
    const before = m.screen;
    if (before === 'today') {
      m.held = false;
      m.said = 'none';
      m.refused = false;
      m.shown = null;
      go(before, before);
      await rig().click('Next');
      return;
    }
    if (m.reading) count('next:while-reading');
    m.reading = false;
    go(before, 'letters');
    await rig().click('Next');
  };

  /** A finger on the reading view: it lands on `word` (the reading pauses with one tick), moves across `moves`, and ends by `end`; each frame while it is down holds the held word as the read point and the one selected, and the screen still. A release reads on from the held word as a new utterance; a cancel resumes; a finger still down while the reading finishes or Next is tapped ends late and asks nothing. */
  const hold = async (word: number, moves: readonly number[], end: HoldEnd) => {
    const r = rig();
    count(`hold:${end}`);
    await act(async () =>
      WORDS.forEach((_, index) => {
        const node = r.host.querySelector(`[data-testid="word-${index}"]`) as
          | (Element & {
              __reactLayoutHandler?: (event: {
                readonly nativeEvent: { readonly layout: ReturnType<typeof boxOf> };
                readonly timeStamp: number;
              }) => void;
            })
          | null;
        node?.__reactLayoutHandler?.({ nativeEvent: { layout: boxOf(index) }, timeStamp: 0 });
      }),
    );
    const touch = (index: number) => {
      const box = boxOf(index);
      return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    };
    const pan = gestureOf('reading-hold');
    r.phase.held = word;
    m.pauses += 1;
    const ticks = r.felt.ticks;
    await act(async () => {
      pan.onBegin?.(touch(word));
      pan.onActivate?.(touch(word));
    });
    await r.until(() => r.felt.ticks !== ticks, 500);
    let held = word;
    for (const to of moves) {
      r.phase.held = to;
      held = to;
      await act(async () => pan.onUpdate?.(touch(to)));
    }
    const lift = (canceled: boolean) =>
      act(async () => {
        pan.onDeactivate?.({ ...touch(held), canceled });
        pan.onFinalize?.({ ...touch(held), canceled });
      });
    r.phase.held = null;
    go(m.screen, m.screen);
    if (end === 'release') {
      m.speaks += 1;
      m.offset = SPANS[held]?.start ?? 0;
      m.starts.push(m.offset);
      m.utterance += 1;
      m.lit = held;
      m.current = null;
    } else if (end === 'cancel') m.resumes += 1;
    else if (end === 'finish') await voiceEvent('finish', false);
    else await next();
    await lift(end === 'cancel');
    expect(r.felt.ticks - ticks, `${where()}: one tick for the hold`).toBe(1);
  };

  /** The device comes back up: a write that lands after it counts as recovered. */
  const recover = () => {
    if (m.down) m.recovered = true;
    m.down = false;
    setDown(false);
    go(m.screen, m.screen);
  };

  /** One command to the app and the model, then the settle's oracles. */
  const run = async (command: Command) => {
    const before = m.screen;
    const activity = activityOf(m);
    trace.push(nameOf(command));
    count(`cmd:${command._tag}@${activity}`);
    const r = rig();
    switch (command._tag) {
      case 'Resolve':
        await resolve();
        return;
      case 'Relaunch':
        count(`relaunch:${activity}`);
        await leave();
        await launch(command.launch);
        return;
      case 'Listen':
        listen(command.speak);
        go(before, before);
        r.voice.calls.refuse = command.speak === 'refused';
        await r.click('Listen');
        break;
      case 'Range':
        await range(command.kind, command.step);
        break;
      case 'Hold':
        await hold(command.word, command.moves, command.end);
        break;
      case 'Voice':
        await voiceEvent(command.kind, command.stale);
        break;
      case 'Next':
        await next();
        break;
      case 'Batch':
        await batch(command.labels, command.speak);
        break;
      case 'Say':
      case 'SayTwice':
        await say(command.plan, command.write, command._tag === 'SayTwice');
        break;
      case 'More':
        await close('close', command.write);
        break;
      case 'Finish':
        await close('finish', command.write);
        break;
      case 'Peek':
        await peek(command.write);
        break;
      case 'Grade':
        await grade(command.grade, command.write);
        break;
      case 'Recover':
        recover();
        break;
      case 'Continue':
        count('home:after-continue');
        go(before, 'home');
        await r.click('Continue');
        break;
      case 'Renew':
        await renew();
        break;
      case 'Begin':
        go(before, 'today');
        await r.click('Start');
        break;
      case 'Later':
        toDue();
        await leave();
        await launch(command.launch);
        return;
    }
    await settle();
    r.phase.said = m.said !== 'none' || m.refused;
  };

  /** Starts the device and its first launch. */
  const start = async (begin: DeviceStart) => {
    const disk = diskOf(begin);
    device.launch(disk);
    m.disk = new Map(disk);
    m.recalls = begin.parts.filter((part) => part === 'other' || part === 'passage').length;
    m.passage = begin.parts.filter((part) => part === 'passage').length;
    m.stored = voiceOnOf(begin);
    m.down = false;
    begin.parts.forEach((part) => count(`disk:${part}`));
    if (begin.parts.length === 0) count('disk:empty');
    count(`switch:${begin.voice}`);
    count(`choice:${encodeURIComponent(begin.choice ?? 'absent')}`);
    if (begin.voice === 'false' && m.stored) count('choice:over-off');
    if (begin.voice !== 'false' && !m.stored) count('choice:off-over-on');
    trace.push(
      `device ${begin.parts.join('+') || 'empty'} voice=${begin.voice} choice=${JSON.stringify(begin.choice ?? 'absent')}`,
    );
    await launch(begin.launch);
  };

  const end = async () => {
    if (at.rig !== undefined) await at.rig.leave();
    setDown(false);
  };

  return { m, start, run, end, rig, trace };
};

/** A command as the trace names it: counts and kinds, never a word. */
export const nameOf = (command: Command) => {
  switch (command._tag) {
    case 'Say':
    case 'SayTwice': {
      const plan = command.plan;
      const skip = plan.skip.length > 4 ? `${plan.skip.length}` : plan.skip.join('/');
      return `${command._tag}[fb=${plan.fallbacks.join('/')} skip=${skip} extra=${plan.extras.join('/')} every=${plan.every} cut=${plan.cut} close=${plan.close} finish=${plan.onFinish}]:${command.write}`;
    }
    case 'Relaunch':
    case 'Later':
      return `${command._tag}:${command.launch.read}${command.launch.held ? ':held' : ''}:v${command.launch.voices}`;
    case 'Batch':
      return `Batch:${command.labels.join('-')}:${command.speak}`;
    case 'Range':
      return `Range:${command.kind}:${command.step}`;
    case 'Hold':
      return `Hold:${[command.word, ...command.moves].join('>')}:${command.end}`;
    case 'Voice':
      return `Voice:${command.kind}${command.stale ? ':stale' : ''}`;
    case 'Listen':
      return `Listen:${command.speak}`;
    case 'More':
    case 'Finish':
    case 'Peek':
      return `${command._tag}:${command.write}`;
    case 'Grade':
      return `Grade:${command.grade}:${command.write}`;
    default:
      return command._tag;
  }
};

/** A seeded generator (mulberry32). */
export const random = (seed: number) => {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const pick = <A,>(items: readonly A[]): A => items[Math.floor(next() * items.length)] as A;
  const int = (low: number, high: number) => low + Math.floor(next() * (high - low + 1));
  return { next, pick, int };
};

type Random = ReturnType<typeof random>;

const ENDINGS = ['finished', 'unavailable', 'denied', 'interrupted', 'failed'] as const;
const MISSED = ['none', 'some', 'all'] as const;
/** The coverage keys only a device on Planted meets. */
const PLANTED_ON = ['relaunch:planted:idle', 'cmd:Continue@planted:idle'];
/** The coverage keys only a finished alone recital meets. */
const KEPT_ON = [
  ...MISSED.map((missed) => `missed:alone:${missed}`),
  ...['lands', 'refused', 'down', 'while-down'].map((write) => `write:alone:${write}`),
  'write:recovered:alone',
  'peek:alone:kept',
  'relaunch:alone:refused',
  ...PLANTED_ON,
];
/** The coverage keys only a device that reached alone meets: the generator leads toward alone while one is unmet. */
const ALONE_ON = [
  ...['idle', 'alert', 'listening'].map((activity) => `relaunch:alone:${activity}`),
  ...ENDINGS.map((ending) => `ending:alone:${ending}`),
  'peek:alone:listening',
  ...KEPT_ON,
];
/** The coverage keys only a device that reached letters meets. */
const LETTERS_ON = [
  ...['idle', 'alert', 'listening'].map((activity) => `relaunch:letters:${activity}`),
  ...ENDINGS.map((ending) => `ending:letters:${ending}`),
  ...MISSED.map((missed) => `missed:letters:${missed}`),
  ...ALONE_ON,
];
/** Each way a hold on the reading view ends. */
const HOLD_ENDS: readonly HoldEnd[] = ['release', 'cancel', 'finish', 'next'];
/** The coverage keys of a sought reading's ranges the light floors name: the next word in the tail's own text, and one before the sought word or past the tail. */
const SOUGHT = ['range:sought:next', 'range:sought:behind', 'range:sought:outside'];
/** The coverage keys only a reading meets. */
const READING_ON = [
  ...['next', 'two', 'ahead', 'behind', 'stale', 'outside'].map((kind) => `range:${kind}`),
  'voice:finish@hear',
  'voice:interrupt@hear',
  'voice:cancel@hear',
  'voice:finish:stale@hear',
  'next:while-reading',
  'relaunch:hear:reading',
  ...HOLD_ENDS.map((end) => `hold:${end}`),
];

/**
 * Picks among `options` (an option listed twice weighs two). With `goal`,
 * the coverage keys an option would meet or lead toward, it mostly picks among the options
 * with a key the walk's floors name and the walk has not met yet; past those, mostly among the options
 * this walk has picked least under `dim` for their weight. So every value of
 * each input is met within a few devices, and still any value may come.
 */
const chooser = (
  pick: Random,
  coverage: Readonly<Record<string, number>>,
  floors: readonly RegExp[],
) => {
  const picked = new Map<string, number>();
  /** Whether `key` would meet a floor of this walk that its devices have not met yet. */
  const unmet = (key: string) =>
    key !== '' &&
    floors.some(
      (floor) => floor.test(key) && !Object.keys(coverage).some((each) => floor.test(each)),
    );
  const choose = <A,>(
    dim: string,
    options: readonly A[],
    name: (option: A) => string = String,
    goal?: (option: A) => string | readonly string[],
    eager = 0.8,
  ): A => {
    const keyed = options.map((option) => [option, `${dim}:${name(option)}`] as const);
    const aims = keyed.filter(([option]) => [goal?.(option) ?? ''].flat().some(unmet));
    const weight = (key: string) => keyed.filter(([, each]) => each === key).length;
    const load = (key: string) => (picked.get(key) ?? 0) / weight(key);
    const least = Math.min(...keyed.map(([, key]) => load(key)));
    const roll = pick.next();
    const pool =
      aims.length > 0 && roll < eager
        ? aims
        : roll < (1 + eager) / 2
          ? keyed.filter(([, key]) => load(key) === least)
          : keyed;
    const [option, key] = pick.pick(pool);
    picked.set(key, (picked.get(key) ?? 0) + 1);
    return option;
  };
  return Object.assign(choose, { coverage, unmet });
};

type Choose = ReturnType<typeof chooser>;

/**
 * A generated recital for `screen`, aimed at an ending (finished,
 * unavailable, denied, interrupted, failed) and, finished, at words missed
 * (none, some, all): the fallbacks, the words heard (any subset), an extra
 * word, the results' grouping, held open or not, the engine's close and its
 * answer to a finish. Any value of each part may still come. An engine that
 * fails mid-recital breaks off before the last word, which would have
 * finished the recital first.
 */
const planOf = (pick: Random, choose: Choose, screen: string): Plan => {
  const ending = choose(
    `ending:${screen}`,
    [
      'finished',
      'finished',
      'finished',
      'finished',
      'unavailable',
      'denied',
      'interrupted',
      'failed',
    ] as const,
    String,
    (each) => {
      if (each !== 'finished') return [`ending:${screen}:${each}`, `relaunch:${screen}:alert`];
      return [`ending:${screen}:${each}`, ...(screen === 'letters' ? ALONE_ON : KEPT_ON)];
    },
    0.35,
  );
  const fallbacks =
    ending === 'unavailable' ? 3 : choose(`fallbacks:${screen}`, [0, 0, 0, 1, 2] as const, String);
  const fall = Array.from({ length: fallbacks }, () => pick.pick<Fallback>(['refuse', 'fail']));
  const hearing = choose(
    `heard:${screen}`,
    ['none', 'some', 'some', 'all'] as const,
    String,
    (each) => `missed:${screen}:${({ none: 'all', some: 'some', all: 'none' } as const)[each]}`,
  );
  const skip = new Set<number>();
  if (hearing === 'none') WORDS.forEach((_, index) => skip.add(index));
  if (hearing === 'some') {
    const misses = pick.int(1, N - 1);
    while (skip.size < misses) skip.add(pick.int(0, N - 1));
  }
  const close = (
    {
      finished: 'end',
      unavailable: pick.pick<Close>(['end', 'denied', 'error']),
      denied: 'denied',
      interrupted: 'interrupted',
      failed: pick.pick<Close>(['error', 'unavailable']),
    } as const
  )[ending];
  if (close !== 'end' || pick.next() < 0.15) {
    const from = pick.int(0, N - 1);
    WORDS.forEach((_, index) => index >= from && skip.add(index));
  }
  const extras = pick.next() < 0.25 ? [pick.int(0, N - 1)] : [];
  const every = pick.int(1, 7);
  const onFinish = ending === 'finished' ? 'end' : pick.pick<'end' | 'error'>(['end', 'error']);
  const plan: Plan = {
    fallbacks: fall,
    skip: [...skip].toSorted((a, b) => a - b),
    extras,
    every,
    cut: Number.MAX_SAFE_INTEGER,
    close,
    onFinish,
  };
  const held =
    choose(`timing:${screen}`, ['whole', 'whole', 'held'], String, (each) =>
      each === 'held' ? `relaunch:${screen}:listening` : '',
    ) === 'held';
  if (!held || stepsOf(plan).length === 0) return plan;
  return { ...plan, cut: pick.int(0, lastCut(plan)) };
};

const LAUNCH_READS: readonly Read[] = ['ok', 'ok', 'ok', 'ok', 'retry1', 'retry2', 'unread'];

const launchOf = (pick: Random, choose: Choose): LaunchKind => ({
  read: choose('read', LAUNCH_READS, String, (each) => `launch:${each}`),
  held: choose('held', [false, false, true], String, (each) => (each ? 'launch:held' : '')),
  voices: pick.pick<0 | 1>([0, 1]),
});

/** One command the generator may give: its name for weighting, the coverage key it aims at (none: ''), and how it is made. */
interface Option {
  readonly name: string;
  readonly goal: string | readonly string[];
  readonly make: () => Command;
}

/** What a screen's offer adds its commands with. */
interface Offering {
  readonly m: Model;
  readonly r: Rig;
  readonly pick: Random;
  readonly choose: Choose;
  readonly add: (name: string, goal: Option['goal'], make: () => Command, times?: number) => void;
  readonly write: () => Write;
  /** Adds a late event of the voice: a range or an end of a reading no longer under way. */
  readonly late: () => void;
  /** Whether the screen offers a missed word's mark to peek at. */
  readonly marks: boolean;
  readonly todayOn: readonly string[];
}

/** A reading under way: the voice's ranges and ends, Next, two Next taps, and a finger's hold on the words. */
const offerReading = ({ m, pick, choose, add }: Offering) => {
  add(
    'range',
    [...READING_ON.filter((key) => key.startsWith('range:')), ...(m.offset > 0 ? SOUGHT : [])],
    () => ({
      _tag: 'Range',
      kind: choose(
        'range',
        ['next', 'next', 'next', 'two', 'ahead', 'behind', 'stale', 'outside'] as const,
        String,
        (each) => [`range:${each}`, ...(m.offset > 0 ? [`range:sought:${each}`] : [])],
      ),
      step: pick.int(0, 3),
    }),
    6,
  );
  add(
    'voice',
    READING_ON.filter((key) => key.startsWith('voice:')),
    () => ({
      _tag: 'Voice',
      kind: choose(
        'voice',
        ['finish', 'finish', 'interrupt', 'cancel', 'start'] as const,
        String,
        (each) => `voice:${each}@hear`,
      ),
      stale: choose('stale', [false, false, false, true], String, (each) =>
        each ? 'voice:finish:stale@hear' : '',
      ),
    }),
  );
  add('next', 'next:while-reading', () => ({ _tag: 'Next' }));
  add('next-next', '', () => ({ _tag: 'Batch', labels: ['Next', 'Next'], speak: 'lands' }));
  add('hold', [...HOLD_ENDS.map((end) => `hold:${end}`), ...SOUGHT], () => ({
    _tag: 'Hold',
    word: pick.int(0, N - 1),
    moves: Array.from({ length: pick.int(0, 3) }, () => pick.int(0, N - 1)),
    end: choose(
      'hold',
      ['release', 'release', 'cancel', 'finish', 'next'] as const,
      String,
      (each) => (each === 'release' ? ['hold:release', ...SOUGHT] : `hold:${each}`),
    ),
  }));
};

/** Hear at rest: Listen (a speak that lands or is refused) and every queued order of two taps with the voice on, Next, and a late event. */
const offerHear = ({ m, choose, add, late }: Offering) => {
  const speak = () =>
    choose('speak', ['lands', 'lands', 'lands', 'refused'] as const, String, (each) =>
      each === 'refused' ? 'speak:refused' : '',
    );
  if (m.voiceOn) {
    add('listen', ['speak:refused', ...READING_ON], () => ({ _tag: 'Listen', speak: speak() }), 4);
    for (const labels of [
      ['Listen', 'Next'],
      ['Next', 'Listen'],
      ['Listen', 'Listen'],
      ['Next', 'Next'],
    ])
      add(`batch:${labels.join('-')}`, `batch:${labels.join('-')}@hear`, () => ({
        _tag: 'Batch',
        labels,
        speak: speak(),
      }));
  } else
    add('batch:Next-Next', 'batch:Next-Next@hear', () => ({
      _tag: 'Batch',
      labels: ['Next', 'Next'],
      speak: 'lands',
    }));
  add('next', LETTERS_ON, () => ({ _tag: 'Next' }));
  late();
};

/** Planted: Continue, two Continue taps, and a late event. */
const offerPlanted = ({ add, late }: Offering) => {
  add(
    'continue',
    ['cmd:Continue@planted:idle', 'home:after-continue', 'cmd:Later@home:done'],
    () => ({ _tag: 'Continue' }),
    3,
  );
  add('continue-twice', 'batch:Continue-Continue@planted', () => ({
    _tag: 'Batch',
    labels: ['Continue', 'Continue'],
    speak: 'lands',
  }));
  late();
};

/** The coverage keys a recital on `screen` leads toward. */
const onwardOf = (screen: Screen, todayOn: readonly string[]): readonly string[] => {
  if (screen === 'letters') return LETTERS_ON;
  if (screen === 'alone') return ALONE_ON;
  return todayOn;
};

/** A recital held open: the rest of it said, the reader's finish, a peek, a late event, and on Today a new plan while it listens. */
const offerOpen = (offering: Offering) => {
  const { m, add, write, late, marks, todayOn } = offering;
  const ends = onwardOf(m.screen, todayOn);
  add('more', ends, () => ({ _tag: 'More', write: write() }), 2);
  add('finish', ends, () => ({ _tag: 'Finish', write: write() }), 2);
  if (marks) add('peek', `peek:${m.screen}:listening`, () => ({ _tag: 'Peek', write: write() }));
  late();
  renewal(offering);
};

/** A recital's screen at rest: Say it once or twice before a render, a peek, a grade, a late event, and on Today a new plan at the passage's due. */
const offerSay = (offering: Offering) => {
  const { m, pick, choose, add, write, todayOn } = offering;
  add(
    'say',
    onwardOf(m.screen, todayOn),
    () => ({ _tag: 'Say', plan: planOf(pick, choose, m.screen), write: write() }),
    5,
  );
  add('say-twice', 'batch:say-twice', () => ({
    _tag: 'SayTwice',
    plan: planOf(pick, choose, m.screen),
    write: write(),
  }));
  offerResult(offering);
  renewal(offering);
};

/** A result's own taps: a peek, a grade, and a late event. */
const offerResult = ({ m, r, pick, add, write, late, marks }: Offering) => {
  if (marks) add('peek', `peek:${m.screen}:kept`, () => ({ _tag: 'Peek', write: write() }), 2);
  if (r.host.querySelector('[role="radiogroup"][aria-label="Grade"] [role="radio"]') !== null)
    add('grade', `grade:${m.screen}`, () => ({
      _tag: 'Grade',
      grade: pick.pick<1 | 2 | 3 | 4>([1, 2, 3, 4]),
      write: write(),
    }));
  late();
};

/** On a read Today with the device up, no recital listening (Today then offers no `Your field`) and no reading under way (a making mid-reading is `wake-walk`'s): a new plan at the passage's due, `times` weighed. */
const renewal = ({ m, add, todayOn }: Offering, times = 1) => {
  if (m.screen === 'today' && !m.down && m.said !== 'open' && !m.reading)
    add('renew', todayOn, () => ({ _tag: 'Renew' }), times);
};

/** Today's kept recall under Next: Next, a peek, a grade, a new plan at the passage's due, and a late event. */
const offerNext = (offering: Offering) => {
  offering.add('next', offering.todayOn, () => ({ _tag: 'Next' }), 3);
  offerResult(offering);
  renewal(offering);
};

/** Today's done state: a new plan at the passage's due, most often, and a late event. */
const offerDone = (offering: Offering) => {
  renewal(offering, 3);
  offering.late();
};

/** Home: `Start` when the plan shows an item, else `Later` (the clock to the passage's due, then a relaunch); and a late event. */
const offerHome = ({ m, pick, choose, add, late }: Offering) => {
  if (runOf(m) === 'done')
    add(
      'later',
      ['cmd:Later@home:done', 'cmd:Begin@home:idle'],
      () => ({ _tag: 'Later', launch: launchOf(pick, choose) }),
      3,
    );
  else
    add(
      'begin',
      ['cmd:Begin@home:idle', 'run:today:next', 'write:today:lands', 'relaunch:today:idle'],
      () => ({ _tag: 'Begin' }),
      4,
    );
  late();
};

/** The offer of the model's screen and activity. */
const offerOf = (m: Model) => {
  if (m.screen === 'hear') return m.reading ? offerReading : offerHear;
  if (m.screen === 'planted') return offerPlanted;
  if (m.screen === 'home') return offerHome;
  if (m.said === 'open') return offerOpen;
  if (m.screen === 'today' && runOf(m) === 'done') return offerDone;
  if (m.screen === 'today' && runOf(m) === 'next') return offerNext;
  return offerSay;
};

/**
 * The commands the model offers on its screen and activity, each picked by
 * `choose`, so a value the walk's floors name and it has not met yet comes
 * first: a relaunch is likely in an activity its floors name and it has not
 * relaunched from yet, and rare elsewhere; a down device recovers
 * often; a device on Today often ends, so the walk's devices meet the first
 * minute. Nothing here filters a value out: each command and each value of
 * it is offered wherever the screen takes it.
 */
const offer = (m: Model, r: Rig, pick: Random, choose: Choose): Command | undefined => {
  const activity = activityOf(m);
  const relaunch = (): Command => ({ _tag: 'Relaunch', launch: launchOf(pick, choose) });
  const wanted = choose.unmet(`relaunch:${activity}`) || (m.down && choose.unmet('launch:down'));
  if (pick.next() < (wanted ? 0.6 : 0.03)) return relaunch();
  if (m.down && pick.next() < 0.3) return { _tag: 'Recover' };
  const today = m.screen === 'today' || m.screen === 'unread';
  const todayOn = [
    `ending:${m.screen}:finished`,
    `write:${m.screen}:lands`,
    `relaunch:${m.screen}:idle`,
  ];
  if (today && m.said !== 'open' && pick.next() < (todayOn.some(choose.unmet) ? 0.1 : 0.3))
    return undefined;
  const write = (): Write =>
    choose(
      `write:${m.screen}`,
      ['lands', 'lands', 'lands', 'refused', 'refused', 'down'] as const,
      String,
      (each) => {
        const key = `write:${m.screen}:${m.down ? 'while-down' : each}`;
        if (m.screen !== 'alone') return key;
        if (each === 'lands') return [key, ...PLANTED_ON];
        if (each === 'refused') return [key, 'relaunch:alone:refused'];
        return [key, 'relaunch:alone:refused', 'launch:down', 'write:recovered:alone'];
      },
    );
  const options: Option[] = [];
  const add = (name: string, goal: Option['goal'], make: () => Command, times = 1) => {
    for (let n = 0; n < times; n += 1) options.push({ name, goal, make });
  };
  const late = () =>
    add('late', [`voice:finish:idle@${m.screen}`, `voice:finish:stale:idle@${m.screen}`], () =>
      pick.next() < 0.5
        ? {
            _tag: 'Voice',
            kind: pick.pick<VoiceKind>(['finish', 'interrupt', 'cancel', 'start']),
            stale: pick.next() < 0.5,
          }
        : { _tag: 'Range', kind: pick.pick<RangeKind>(['next', 'stale', 'outside']), step: 1 },
    );
  if (m.down) add('recover', 'cmd:Recover@', () => ({ _tag: 'Recover' }));
  const marks = [...r.host.querySelectorAll('[role="button"]')].some((node) =>
    /^Missed word \d+$/u.test(node.getAttribute('aria-label') ?? ''),
  );
  if (m.screen === 'pending') return pick.next() < 0.75 ? { _tag: 'Resolve' } : relaunch();
  offerOf(m)({ m, r, pick, choose, add, write, late, marks, todayOn });
  const aimless = !options.some((option) => [option.goal].flat().some(choose.unmet));
  if (aimless && pick.next() < 0.5) return today ? undefined : relaunch();
  return choose(
    `cmd:${activity}`,
    options,
    (each) => each.name,
    (each) => each.goal,
  ).make();
};

const PARTS: readonly Part[] = ['junk', 'blank', 'misfiled', 'foreign', 'other', 'passage'];

const SWITCHES: readonly Switch[] = ['absent', 'true', 'false', 'other'];
/** A device's voice keys that read the voice `on` or off: any choice key's text that may, then any old switch that does with it. */
const keysOf = (aside: Random, on: boolean) => {
  const reads = (choice: Chosen) => (voice: Switch) => voiceOnOf({ voice, choice }) === on;
  const choice = aside.pick(CHOSEN.filter((each) => SWITCHES.some(reads(each))));
  return { choice, voice: aside.pick(SWITCHES.filter(reads(choice))) };
};

/**
 * A generated device's start: any set of disk parts (none most often, so the
 * first minute is met), its voice keys and a first launch. The steered draw
 * picks whether the voice reads off (the old switch `false`) or on; `aside`
 * then picks any pair of the old switch and the choice key that reads so
 * (`voiceOnOf`), so `pick`'s stream and the walk run as before the choice
 * key was drawn.
 */
const startOf = (pick: Random, choose: Choose, aside: Random): DeviceStart => {
  const kind = choose(
    'disk',
    ['empty', 'empty', 'empty', 'empty', 'skipped', 'skipped', 'foreign', 'other', 'passage'],
    String,
    (each) => {
      const key = `disk:${each === 'skipped' ? 'junk' : each}`;
      if (each === 'other' || each === 'passage')
        return [
          key,
          'open:home',
          'cmd:Begin@home:idle',
          'relaunch:home:idle',
          'relaunch:today:idle',
          'write:today:lands',
          'ending:today:finished',
        ];
      return [key, 'open:hear', 'relaunch:hear:idle', ...READING_ON, ...LETTERS_ON];
    },
  );
  const parts: Part[] = [];
  if (kind === 'skipped')
    parts.push(
      ...PARTS.filter((part) => ['junk', 'blank', 'misfiled'].includes(part) && pick.next() < 0.6),
      'junk',
    );
  if (kind === 'foreign') parts.push('foreign');
  if (kind === 'other') parts.push('other');
  if (kind === 'passage') parts.push('passage');
  if (pick.next() < 0.2) parts.push('foreign');
  const on =
    choose('switch', SWITCHES, String, (each) =>
      each === 'false' ? 'launch:voice-off' : ['speak:refused', ...READING_ON],
    ) !== 'false';
  return {
    parts: [...new Set(parts)],
    ...keysOf(aside, on),
    launch: {
      ...launchOf(pick, choose),
      read: choose('first-read', ['ok', 'ok', 'ok', 'retry1', 'unread'] as const, String, (each) =>
        each === 'unread'
          ? ['launch:unread', 'open:unread', 'relaunch:unread:idle', 'write:unread:lands']
          : [`launch:${each}`, 'open:hear', ...READING_ON, ...LETTERS_ON],
      ),
    },
  };
};

/**
 * The coverage keys the walk's generated devices must reach, in groups,
 * each a part of its own (`walk-<group>.property.test.tsx`) so each part
 * stays under its budget; together they are every floor: each ending in
 * letters and alone, missed words none, some and all, each write fault,
 * each launch, read and disk, each relaunch activity, each voice event and
 * tap batch, home (opened at a launch and after Continue, `Start`, `Later`
 * and a relaunch from it), and Today's run (Next, the done state, a new
 * plan at the passage's due). Every part draws from the whole generator; its group only
 * steers which unmet values come first, and is what it asserts.
 */
export const FLOORS = {
  letters: [
    ...ENDINGS.map((ending) => new RegExp(`^ending:letters:${ending}$`, 'u')),
    ...MISSED.map((missed) => new RegExp(`^missed:letters:${missed}$`, 'u')),
  ],
  alone: [
    ...ENDINGS.map((ending) => new RegExp(`^ending:alone:${ending}$`, 'u')),
    ...MISSED.map((missed) => new RegExp(`^missed:alone:${missed}$`, 'u')),
    /^peek:alone:/u,
    /^batch:say-twice/u,
    /^cmd:Continue@planted:idle$/u,
    /^home:after-continue$/u,
    /^cmd:Later@home:/u,
  ],
  write: [
    /^write:alone:lands$/u,
    /^write:alone:refused$/u,
    /^write:alone:down$/u,
    /^write:alone:while-down$/u,
    /^write:recovered:/u,
    /^launch:down$/u,
    /^ending:(today|unread):finished$/u,
    /^write:unread:lands$/u,
  ],
  today: [
    /^cmd:Begin@home:/u,
    /^write:today:lands$/u,
    /^run:today:next$/u,
    /^cmd:Next@today:/u,
    /^run:today:done$/u,
    /^end:(one|many)$/u,
    /^renew:today:done$/u,
  ],
  launch: [
    /^launch:ok$/u,
    /^launch:retry1$/u,
    /^launch:retry2$/u,
    /^launch:unread$/u,
    /^launch:held$/u,
    /^launch:voice-off$/u,
    /^open:hear$/u,
    /^open:home$/u,
    /^open:unread$/u,
  ],
  disk: [
    /^disk:(junk|blank|misfiled)$/u,
    /^disk:foreign$/u,
    /^disk:other$/u,
    /^disk:passage$/u,
    /^disk:empty$/u,
  ],
  relaunch: [
    /^relaunch:pending:idle$/u,
    /^relaunch:hear:idle$/u,
    /^relaunch:hear:reading$/u,
    /^relaunch:letters:idle$/u,
    /^relaunch:letters:alert$/u,
    /^relaunch:letters:listening$/u,
    /^relaunch:home:/u,
    /^relaunch:today:/u,
    /^relaunch:unread:/u,
  ],
  planted: [
    /^relaunch:alone:idle$/u,
    /^relaunch:alone:alert$/u,
    /^relaunch:alone:listening$/u,
    /^relaunch:alone:refused$/u,
    /^relaunch:planted:idle$/u,
  ],
  reading: [
    ...['next', 'two', 'ahead', 'behind', 'stale', 'outside'].map(
      (kind) => new RegExp(`^range:${kind}$`, 'u'),
    ),
    /^voice:finish@hear$/u,
    /^voice:(interrupt|cancel)@hear$/u,
    /^voice:\w+:stale@hear$/u,
  ],
  taps: [
    /^speak:refused$/u,
    /^voice:\w+(:stale)?:idle@(letters|alone)$/u,
    /^next:while-reading$/u,
    /^batch:Listen-Next@hear$/u,
    /^batch:Next-Listen@hear$/u,
    /^batch:Listen-Listen@hear$/u,
  ],
  light: [
    ...HOLD_ENDS.map((end) => new RegExp(`^hold:${end}$`, 'u')),
    /^range:sought:next$/u,
    /^range:sought:(behind|outside)$/u,
  ],
} as const satisfies Readonly<Record<string, readonly RegExp[]>>;

export type Group = keyof typeof FLOORS;

/** Drives `devices` generated devices of up to `commands` commands each from `seed`, steered toward `group`'s floors, and answers the coverage of the generated devices. A failing device's start and commands go to the file `HSFIRST_WALK_DUMP` names, if set, for `play` to replay. */
export const walk = async (group: Group, seed: number, devices: number, commands: number) => {
  const coverage: Record<string, number> = {};
  const count = (key: string) => void (coverage[key] = (coverage[key] ?? 0) + 1);
  const pick = random(seed);
  const choose = chooser(pick, coverage, FLOORS[group]);
  const aside = random(
    [...group].reduce((hash, char) => Math.imul(hash ^ char.charCodeAt(0), 0x01000193), seed),
  );
  for (let n = 0; n < devices; n += 1) {
    const run = session(count);
    run.trace.push(`seed ${seed} device ${n}`);
    const begin = startOf(pick, choose, aside);
    const played: Command[] = [];
    try {
      await run.start(begin);
      for (let c = 0; c < commands; c += 1) {
        const command = offer(run.m, run.rig(), pick, choose);
        if (command === undefined) break;
        played.push(command);
        await run.run(command);
      }
    } catch (error) {
      const dump = process.env['HSFIRST_WALK_DUMP'];
      if (dump !== undefined) await Bun.write(dump, JSON.stringify({ begin, commands: played }));
      throw error;
    } finally {
      await run.end();
    }
  }
  return coverage;
};

/** The floors of `group` that `coverage` misses. */
export const missing = (group: Group, coverage: Readonly<Record<string, number>>) =>
  FLOORS[group]
    .filter((floor) => !Object.keys(coverage).some((key) => floor.test(key)))
    .map(String);

/**
 * One walk part: `devices` generated devices from `seed`, steered toward
 * `group`'s floors, each floor met by those devices alone. The environment's
 * `HSFIRST_WALK_SEED` and `HSFIRST_WALK_DEVICES` replace the two for a
 * longer or another walk.
 */
export const walkPart = (group: Group, seed: number, devices: number, commands = 12) => {
  const at = Number(process.env['HSFIRST_WALK_SEED'] ?? seed);
  const many = Number(process.env['HSFIRST_WALK_DEVICES'] ?? devices);
  describe(`the root route on generated devices, steered to the ${group} floors`, () => {
    it(`agrees with the first minute's model on ${many} devices of ${commands} commands (seed ${at})`, async () => {
      const coverage = await walk(group, at, many, commands);
      console.log(
        `walk ${group} coverage ${Object.entries(coverage)
          .toSorted(([a], [b]) => a.localeCompare(b))
          .map(([key, value]) => `${key}=${value}`)
          .join(' ')}`,
      );
      expect(missing(group, coverage)).toEqual([]);
    });
  });
};

/** A fixed device's launch: read at once, not held, with a voice. */
export const LAUNCH_OK: LaunchKind = { read: 'ok', held: false, voices: 1 };

/** A fixed recital: every word heard by the first engine, three to a final result, ending `end`; `over` replaces any of it. */
export const recital = (over: Partial<Plan> = {}): Plan => ({
  fallbacks: [],
  skip: [],
  extras: [],
  every: 3,
  cut: Number.MAX_SAFE_INTEGER,
  close: 'end',
  onFinish: 'end',
  ...over,
});

/** A press of Say it for `plan`, its write `write`. */
export const sayOf = (plan: Plan, write: Write = 'lands'): Command => ({
  _tag: 'Say',
  plan,
  write,
});

/** Plays one fixed device: its start and its commands, through the same runner and oracles. */
export const play = async (begin: DeviceStart, commands: readonly Command[]) => {
  const run = session(() => {});
  try {
    await run.start(begin);
    for (const command of commands) await run.run(command);
  } finally {
    await run.end();
  }
  return run.m;
};

/** The first minute's claim words, as the screen cases read them. */
const SCREEN_CLAIM = /\b(seeds?|planted|plants?|grew|growth|stages?)\b/iu;

/** The voice's native source: it records each speak and stop, and lets the test send its events. */
const recordingVoice = () => {
  const calls = { speaks: 0, stops: 0 };
  const listener = MutableRef.make<(event: VoiceEvent) => void>(() => {});
  const layer = Layer.succeed(
    VoiceSource,
    VoiceSource.of({
      voices: Effect.succeed([]),
      speak: () => Effect.sync(() => void (calls.speaks += 1)),
      pause: Effect.void,
      resume: Effect.void,
      stop: Effect.sync(() => void (calls.stops += 1)),
      subscribe: (next) =>
        Effect.acquireRelease(
          Effect.sync(() => MutableRef.set(listener, next)),
          () => Effect.sync(() => MutableRef.set(listener, () => {})),
        ),
    }),
  );
  const emit = (event: VoiceEvent) => MutableRef.get(listener)(event);
  return { layer, calls, emit };
};

/** The passage's recall keys on the device's disk. */
export const recallKeys = () => [...device.disk.keys()].filter((key) => key.startsWith(PREFIX));

/** A launch for the first minute's screen cases: the root over the device's disk as it stands, built once `held` resolves; every frame from before the first render held to the root's rule for `garden`, the launch's read. */
export const screenLaunch = async (
  held: Promise<void> = Promise.resolve(),
  source = scriptedSource(recite(passage.text, { skip: [10], every: 5, pace: 1 })),
  time: Time = { now: START },
  garden: 'read' | 'unread' = 'read',
) => {
  const voice = recordingVoice();
  const chimes: Growth[] = [];
  const layer = appLayer({
    source,
    haptics: Layer.succeed(Haptics, Haptics.of({ tick: Effect.void })),
    store: Layer.unwrap(
      Effect.as(
        Effect.promise(() => held),
        store,
      ),
    ),
    chime: Layer.succeed(
      Chime,
      Chime.of({ grow: (growth) => Effect.sync(() => void chimes.push(growth)) }),
    ),
    voice: voice.layer,
  }).pipe(Layer.provideMerge(clockOf(time)));
  const host = document.createElement('div');
  document.body.append(host);
  const headings = () =>
    [...host.querySelectorAll('[role="heading"]')].map((node) => (node.textContent ?? '').trim());
  const buttons = () =>
    [...host.querySelectorAll('[role="button"]')].map((node) => node.getAttribute('aria-label'));
  const frames = { pending: 0, pendingOffers: 0, claims: 0, many: 0 };
  const watch = new MutationObserver(() => {
    const shown = headings().filter((text) => HEADINGS.includes(text));
    if (shown.length > 1) frames.many += 1;
    if (shown.length === 0) {
      frames.pending += 1;
      if (buttons().length > 0) frames.pendingOffers += 1;
    }
    const firstMinute = shown.some(
      (text) => !['Planted', 'Today', END, 'Your field'].includes(text),
    );
    if (
      firstMinute &&
      (SCREEN_CLAIM.test(host.textContent ?? '') ||
        host.querySelector('[data-testid="stage"],[data-testid="plant"]') !== null)
    )
      frames.claims += 1;
  });
  watch.observe(host, { subtree: true, childList: true, attributes: true, characterData: true });
  const rule = watchRoot(host, garden);
  const root = createRoot(host);
  await act(async () =>
    root.render(
      <RegistryProvider initialValues={[[runtime.layer, layer]]}>
        <Root />
      </RegistryProvider>,
    ),
  );
  const until = async (holds: () => boolean, ms = 3000) => {
    const late = deadline(ms);
    while (!holds()) {
      if (late()) return false;
      await act(() => new Promise((resolve) => setTimeout(resolve, 1)));
    }
    return true;
  };
  const click = async (label: string) => {
    const node = [...host.querySelectorAll('[role="button"]')].find(
      (each) => each.getAttribute('aria-label') === label,
    );
    expect(node === undefined, `button ${label}`).toBe(false);
    await act(async () => {
      node?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
    });
  };
  const send = (event: Omit<VoiceEvent, 'utterance'>) =>
    act(async () => voice.emit({ utterance: 1, ...event }));
  const word = (index: number) => host.querySelector(`[data-testid="word-${index}"]`);
  const ink = computed(theme.light.ink);
  const inked = () =>
    WORDS.filter((_, index) => {
      const node = word(index);
      return node !== null && getComputedStyle(node).color === ink;
    }).length;
  const selected = () =>
    WORDS.flatMap((_, index) =>
      word(index)?.getAttribute('aria-selected') === 'true' ? [index] : [],
    );
  const heading = () => headings().find((text) => HEADINGS.includes(text)) ?? null;
  const stage = () =>
    host.querySelector('[data-testid="stage"]')?.getAttribute('aria-label') ?? null;
  /** Today's action buttons shown, by name: Say it, Listening or Next. */
  const actions = () =>
    buttons().filter((name) => name === 'Say it' || name === 'Listening' || name === 'Next');
  /** Home as it shows: its Today card's lines (none before a plan) and whether it offers `Start`. */
  const home = () => ({
    counts: cardLine(host),
    begin: buttons().includes('Start'),
  });
  /** Holds every frame of the launch to the root's rule: no fault, and on an unread garden no `Your field` heading in any frame. */
  const leave = async () => {
    rule.stop();
    watch.disconnect();
    await act(async () => root.unmount());
    expect({
      faults: rule.faults,
      field:
        garden === 'unread' && rule.frames.some((frame) => frame.headings.includes('Your field')),
    }).toEqual({ faults: [], field: false });
  };
  return {
    home,
    host,
    voice,
    chimes,
    frames,
    until,
    click,
    send,
    word,
    inked,
    selected,
    heading,
    buttons,
    stage,
    actions,
    leave,
  };
};
