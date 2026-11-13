/* oxlint-disable effect/noGlobals, effect/noNullish, effect/noTernary, effect/noAsyncFunction, effect/noNewPromise, effect/noFixedWaitInTests, eslint/no-await-in-loop -- a React screen rig: it mounts Today in happy-dom's document through React's promise-based `act`; the runtime's forked Effect work and the scripted recital run on the host's clock, so each turn is handed over in `act` one after another until the read the test waits on lands, at most 3 s; it reads nodes whose absent attributes and matches are null, and names a one-letter word's cue in one line. */

/**
 * Today's Say it as a reader and a screen reader meet it, for the screen
 * tests of `src/sayit`: the route mounted in happy-dom (react-native-web)
 * under a registry whose runtime is the app's own layer over a scripted
 * source, recorded ticks, and a store in memory holding a disk's recalls
 * that records each recall the garden writes, in order. Every frame a test
 * waits through holds each word Today draws to the spec's rule for its
 * status in the view it was drawn from, a word not yet said to the cue it
 * shows under: the colour its text is seen in, whether the screen reader
 * reads it, its name and its role. It counts words without printing one.
 *
 * The root opens as it opens for a reader: a read disk lands on home, where
 * `begin` takes `Start` to Today (each disk here holds the passage due or
 * not yet planted, so home offers it), and an unread disk opens Today with
 * no `Your field` in any frame. Every frame, from before the root's first
 * render, is also held to the root's frame rule (`rootFaults` through
 * `watchRoot`, the garden the disk's read). Each `renew`'s `Next` ends the
 * run, the passage its one item: Today then shows the end exactly as
 * `tendedModel` has it (kept in `ends`).
 */

import { RegistryProvider, useAtomValue } from '@effect/atom-react';
import { expect } from 'bun:test';
import { Effect, Layer, Logger, MutableRef, Option } from 'effect';
import * as KeyValueStore from 'effect/persistence/KeyValueStore';
import * as AsyncResult from 'effect/reactivity/AsyncResult';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import passage from 'virtual:heartseed-passage';

import Root from '../../app/index';
import { appLayer, runtime, sayItView } from '../app';
import { DictationSource, type DictationEvent } from '../dictation';
import { recite, scriptedSource } from '../dictation/script';
import { Chime } from '../garden';
import type { Cue, MarkStatus } from '../matcher';
import { sourceWords } from '../matcher/words';
import { Haptics, type Recall, type SayItView } from '../sayit';
import { pendingAt } from '../sayit/draw';
import { screenOf } from '../sayit/screen';
import { theme } from '../theme';
import { voiceSource } from '../voice/source';
import { clockOf, START, toDue, type Time } from './clock';
import { deadline } from './elapsed';
import { AA, contrastOf } from './contrast';
import { computed, systemScheme } from './look';
import { END, endShown, watchRoot } from './root-rule';
import { grewLine, tendedModel } from './run-model';
import { passageTextIn } from './passage-text';
import { renewBySettings } from './settings-rig';

export const WORDS = sourceWords(passage.text);

/**
 * A role of the scheme the system names (`src/theme.ts`) as `opaque` reads
 * a computed colour: the ground, the ink of a lit word (`ink`), the colour
 * of the mark and of a peeked word (`miss`), and the cue's ink a word not
 * yet said is seen in under the full text or in letters (`quiet`).
 */
const token = (role: 'ground' | 'ink' | 'miss' | 'quiet') =>
  opaque(computed(theme[systemScheme()][role]));

/** A computed CSS colour as `rgb(r, g, b)`, or null when it is fully transparent. */
const opaque = (css: string) => {
  if (css === 'transparent') return null;
  const parts = /^rgba?\(([^)]*)\)$/
    .exec(css)?.[1]
    ?.split(',')
    .map((part) => Number(part.trim()));
  if (parts === undefined || parts.length < 3) return null;
  const [r, g, b, alpha = 1] = parts;
  if (alpha === 0) return null;
  return `rgb(${r}, ${g}, ${b})`;
};

/** Whether an element's own style leaves it seen: no zero opacity, no `display: none`, no `visibility: hidden`. */
const drawn = (at: Element) => {
  const style = getComputedStyle(at);
  return (
    (style.opacity === '' || Number(style.opacity) > 0) &&
    style.display !== 'none' &&
    style.visibility !== 'hidden'
  );
};

/** The elements under a word element (itself among them) that hold its text. */
const holders = (node: Element) =>
  [node, ...node.querySelectorAll('*')].filter((at) =>
    [...at.childNodes].some(
      (child) => child.nodeType === child.TEXT_NODE && (child.textContent ?? '').trim() !== '',
    ),
  );

/**
 * Reads one frame under `top` as a reader and a screen reader meet each
 * word element in it, with the word's own text named, never printed: the
 * text laid out, the colour its text is seen in (as `rgb(r, g, b)`, or null
 * when it is transparent, the ground's colour, or under an element not
 * drawn), whether it or an element over it is hidden from the screen
 * reader, the name read, and whether it is a button.
 */
const readerOf = (top: Element) => {
  const shownMemo = new Map<Element, boolean>();
  const shown = (at: Element): boolean => {
    const known = shownMemo.get(at);
    if (known !== undefined) return known;
    const parent = at.parentElement;
    const now = drawn(at) && (at === top || parent === null || shown(parent));
    shownMemo.set(at, now);
    return now;
  };
  const hiddenMemo = new Map<Element, boolean>();
  const hidden = (at: Element): boolean => {
    const known = hiddenMemo.get(at);
    if (known !== undefined) return known;
    const parent = at.parentElement;
    const now =
      at.getAttribute('aria-hidden') === 'true' ||
      (at !== top && parent !== null && hidden(parent));
    hiddenMemo.set(at, now);
    return now;
  };
  const seenHere = (holder: Element) => {
    const colour = opaque(getComputedStyle(holder).color);
    return colour !== null && colour !== token('ground') && shown(holder);
  };
  const seenColour = (node: Element) => {
    for (const holder of holders(node)) {
      if (seenHere(holder)) return opaque(getComputedStyle(holder).color);
    }
    return null;
  };
  /** The text of the word's element that is seen: the text each seen holder holds itself, in order. */
  const seenText = (node: Element) =>
    holders(node)
      .filter(seenHere)
      .map((holder) =>
        [...holder.childNodes]
          .filter((child) => child.nodeType === child.TEXT_NODE)
          .map((child) => child.textContent ?? '')
          .join(''),
      )
      .join('');
  return (node: Element, index: number) => {
    const word = WORDS[index] ?? '';
    const unread = hidden(node);
    const text = node.textContent ?? '';
    const readAs = () => {
      if (unread) return null;
      return node.getAttribute('aria-label') ?? text;
    };
    const named = (said: string | null) => {
      if (said === null || said === '') return said;
      if (said === word) return 'the word';
      if (said === initialOf(word)) return 'its initial';
      if (said === `${word}, peeked`) return 'the word, peeked';
      if (/^Missed word \d+$/.test(said)) return said;
      return `another ${said.length} characters`;
    };
    return {
      text: named(text),
      seen: seenColour(node),
      legible: holders(node)
        .filter(seenHere)
        .every((holder) => contrastOf(holder) >= AA),
      seenAs: named(seenText(node)),
      hidden: unread,
      name: named(readAs()),
      button: node.getAttribute('role') === 'button',
    };
  };
};

/** Whether a word under `top` waits for the animation frame that starts its fade: Reanimated's web fade draws an entering element unseen until then. */
const fadeWaits = (top: Element) =>
  [...top.querySelectorAll('*')].some(
    (at) =>
      at instanceof HTMLElement &&
      at.style.visibility === 'hidden' &&
      at.style.animationName === '',
  );

/**
 * Plays each fade Today has started under `top` to its end, once, as a
 * browser does: happy-dom runs no CSS animation, and Reanimated's web fade
 * keeps an entering word unseen until its animation starts.
 */
const runFades = (top: Element, played: WeakSet<Element>) => {
  for (const at of top.querySelectorAll('*')) {
    if (played.has(at) || !(at instanceof HTMLElement) || at.style.animationName === '') continue;
    played.add(at);
    at.dispatchEvent(new Event('animationstart'));
    at.dispatchEvent(new Event('animationend'));
  }
};

/** A word's first letter or number as written, nothing for a word with neither. */
const initialOf = (word: string) => {
  const at = word.search(/[\p{L}\p{N}]/u);
  if (at < 0) return '';
  return word.slice(at, at + 1);
};

/**
 * How the reader meets a word not yet said under each cue other than none,
 * in the cue's ink at AA contrast on what is painted behind it: whole under
 * the full text; under letters its exact first letter or number alone seen
 * and named (the word itself when it is that one character), the rest laid
 * out unseen.
 */
const unsaidRule = (cue: 'full' | 'initials', index: number) => {
  const word = WORDS[index] ?? '';
  const shown = cue === 'full' || initialOf(word) === word ? 'the word' : 'its initial';
  return {
    text: 'the word',
    seen: token('quiet'),
    legible: true,
    seenAs: shown,
    hidden: false,
    name: shown,
    button: false,
  };
};

/** Today's rules for a word of each status (spec, Today → The verse and Look and feel), written apart from the screen's code; a word not yet said shows as the recital's cue. */
const rule = (status: MarkStatus, index: number, cue: Cue = 'none') => {
  if (status === 'pending' && cue !== 'none') return unsaidRule(cue, index);
  switch (status) {
    case 'matched':
      return {
        text: 'the word',
        seen: token('ink'),
        legible: expect.any(Boolean),
        seenAs: 'the word',
        hidden: false,
        name: 'the word',
        button: false,
      };
    case 'tentative':
      return {
        text: 'the word',
        seen: expect.any(String),
        legible: expect.any(Boolean),
        seenAs: 'the word',
        hidden: true,
        name: null,
        button: false,
      };
    case 'pending':
      return {
        text: expect.anything(),
        seen: null,
        legible: true,
        seenAs: '',
        hidden: true,
        name: null,
        button: false,
      };
    case 'miss':
      return {
        text: '',
        seen: null,
        legible: true,
        seenAs: '',
        hidden: false,
        name: `Missed word ${index + 1}`,
        button: true,
      };
    case 'peek':
      return {
        text: 'the word',
        seen: token('miss'),
        legible: expect.any(Boolean),
        seenAs: 'the word',
        hidden: false,
        name: 'the word, peeked',
        button: false,
      };
  }
};

/** Records the Say it view Today renders from, in the same commit. */
function Seen({ into }: { readonly into: MutableRef.MutableRef<Option.Option<SayItView>> }) {
  MutableRef.set(into, AsyncResult.value(useAtomValue(sayItView)));
  return null;
}

/** Another verse's recall, so the launch opens Today and not the first minute, which a store with no recall of any verse opens. */
const OTHER: Recall = {
  reference: 'Made 1:1',
  startedAt: Date.UTC(2026, 0, 5, 9),
  grade: 3,
  suggested: 3,
  words: 4,
  missed: 0,
  peeked: 0,
  extra: 0,
};

/** The passage's recalls a day apart from `OTHER`'s, Good with no peek: one is a seed, two a blade (the second said under letters), three an ear. */
export const passageAt = (count: number): Recall[] =>
  Array.from({ length: count }, (_, n) => ({
    ...OTHER,
    reference: passage.reference,
    startedAt: OTHER.startedAt + (n + 1) * 86_400_000,
  }));

/** What a mount's store holds and does: its recalls, whether every listing fails, leaving the garden unread, and a promise each listing waits on first, holding the launch in its pending frame. */
export interface Disk {
  readonly recalls: readonly Recall[];
  readonly unread: boolean;
  readonly held?: Promise<void>;
}

/** Another verse's recall alone: the passage is not planted. */
export const NOT_PLANTED: Disk = { recalls: [OTHER], unread: false };
export const SEED: Disk = { recalls: passageAt(1), unread: false };
export const BLADE: Disk = { recalls: passageAt(2), unread: false };

/** A store over memory (`backing`, holding `disk`'s recalls at the start) that records, in order, each recall the garden writes: each keep Say it hands over that changes the recital's record writes one. */
const recordingStore = (kept: Recall[], disk: Disk, backing: Map<string, string>) => {
  for (const recall of disk.recalls)
    backing.set(`heartseed/recall/${recall.reference}/${recall.startedAt}`, JSON.stringify(recall));
  return Layer.succeed(
    KeyValueStore.KeyValueStore,
    KeyValueStore.makeStringOnly({
      get: (key) => Effect.sync(() => backing.get(key)),
      set: (key, value) =>
        Effect.sync(() => {
          backing.set(key, value);
          if (!key.startsWith('heartseed/recall/')) return;
          const recall: Recall = JSON.parse(value);
          kept.push(recall);
        }),
      remove: (key) => Effect.sync(() => void backing.delete(key)),
      clear: Effect.sync(() => backing.clear()),
      size: Effect.sync(() => backing.size),
      keys: Effect.andThen(
        disk.held === undefined
          ? Effect.void
          : Effect.promise(() => disk.held ?? Promise.resolve()),
        Effect.suspend(() => {
          if (disk.unread)
            return Effect.fail(
              new KeyValueStore.KeyValueStoreError({ message: 'keys', method: 'keys' }),
            );
          return Effect.succeed([...backing.keys()]);
        }),
      ),
    }),
  );
};

/** The release of each held disk not yet released: leaving a Today releases them all, so a test that fails while a launch is held leaves no read waiting. */
const holding = new Set<() => void>();

/** `disk` with its listings held until `release`, so the launch shows its pending frame until then. */
export const heldDisk = (disk: Disk) => {
  const gate = Promise.withResolvers<void>();
  const release = () => {
    holding.delete(release);
    gate.resolve();
  };
  holding.add(release);
  return { disk: { ...disk, held: gate.promise }, release };
};

/** The leave of each Today still mounted: the next mount leaves any a test failed before leaving. */
const mounted = new Set<() => Promise<void>>();

/**
 * Today over `source` and `disk`, under a registry that keeps living after
 * Today leaves, as the app's does, at `time` on Effect's clock (the host's
 * while it is null). `rest.cue` is the cue the test expects Today's words
 * under while no recital is shown. A recital's marks show from a press of
 * Say it until a new plan lets its item go (`renew`). A read disk not held
 * is taken from home to Today by `begin` before the mount answers; a held
 * one is the test's to take once released. It first leaves any Today a
 * failed test left mounted, so a failure stays a failure of its own test.
 */
export const mount = async (
  source: Layer.Layer<DictationSource>,
  disk: Disk = NOT_PLANTED,
  rest: { readonly cue: Cue } = { cue: 'full' },
  time: Time = { now: START },
) => {
  for (const left of [...mounted]) await left();
  const ticks = { n: 0 };
  const kept: Recall[] = [];
  const backing = new Map<string, string>();
  const shown = { recital: false, cue: rest.cue };
  const layer = appLayer({
    source,
    haptics: Layer.succeed(Haptics, Haptics.of({ tick: Effect.sync(() => void (ticks.n += 1)) })),
    store: recordingStore(kept, disk, backing),
    chime: Layer.succeed(Chime, Chime.of({ grow: () => Effect.void })),
    voice: voiceSource,
  }).pipe(Layer.provideMerge(Layer.merge(clockOf(time), Logger.layer([]))));
  const host = document.createElement('div');
  document.body.append(host);
  const garden = disk.unread ? 'unread' : 'read';
  const rootRule = watchRoot(host, garden);
  const root = createRoot(host);
  const latest = MutableRef.make(Option.none<SayItView>());
  const show = (today: boolean) =>
    act(async () =>
      root.render(
        <RegistryProvider initialValues={[[runtime.layer, layer]]}>
          {today && (
            <>
              <Seen into={latest} />
              <Root />
            </>
          )}
        </RegistryProvider>,
      ),
    );
  await show(true);
  const one = (selector: string) => host.querySelector(selector);
  const all = (selector: string) => [...host.querySelectorAll(selector)];
  const word = (index: number) => one(`[data-testid="word-${index}"]`);
  const reached = new Map<MarkStatus, number>();
  const unsaid = new Map<Cue, number>();
  const played = new WeakSet<Element>();
  const headings = () => all('[role="heading"]').map((node) => node.textContent ?? '');
  /** Holds every frame so far to the root's rule: no fault, and on an unread disk no `Your field` heading in any frame. */
  const rooted = () =>
    expect({
      faults: rootRule.faults,
      field:
        garden === 'unread' && rootRule.frames.some((each) => each.headings.includes('Your field')),
    }).toEqual({ faults: [], field: false });
  /** Holds every word Today draws now, its fades run, to the rule for its status in the view it was drawn from (a word not yet said under the recital's cue, or the rest cue while none is shown), and counts the statuses met. */
  const frame = () => {
    rooted();
    runFades(host, played);
    const words = all('[data-testid^="word-"]');
    if (words.length === 0) return;
    const view = MutableRef.get(latest);
    const recital = Option.filter(screenOf(view).marks, () => shown.recital);
    const { marks, cue } = Option.match(recital, {
      onNone: () => ({ marks: WORDS.map((_, index) => pendingAt(index)), cue: shown.cue }),
      onSome: (shown) => ({ marks: shown, cue: Option.getOrThrow(view).cue }),
    });
    expect(words.length).toBe(marks.length);
    const metOf = readerOf(host);
    for (const mark of marks) {
      const node = word(mark.index);
      expect(node === null, `word-${mark.index} drawn`).toBe(false);
      if (node === null) continue;
      expect(metOf(node, mark.index), `${mark.status} at ${mark.index}`).toEqual(
        rule(mark.status, mark.index, cue),
      );
      reached.set(mark.status, (reached.get(mark.status) ?? 0) + 1);
      if (mark.status === 'pending') unsaid.set(cue, (unsaid.get(cue) ?? 0) + 1);
    }
  };
  /** Hands over the animation frames a fade waits on, then holds the frame Today leaves to Today's rules. */
  const settle = async () => {
    for (let round = 0; round < 10 && fadeWaits(host); round += 1)
      await act(() => new Promise((resolve) => setImmediate(resolve)));
    frame();
  };
  /** Waits until `holds`, at most `ms` on the monotonic deadline, holding each frame on the way to Today's rules. */
  const until = async (holds: () => boolean, ms = 3000) => {
    const late = deadline(ms);
    await settle();
    while (!holds()) {
      if (late()) return false;
      await act(() => new Promise((resolve) => setTimeout(resolve, 5)));
      await settle();
    }
    return true;
  };
  const button = () =>
    all('[role="button"]').filter((node) =>
      ['Say it', 'Listening'].includes(node.getAttribute('aria-label') ?? ''),
    );
  const label = () => button()[0]?.getAttribute('aria-label');
  /** The action buttons shown, by name: Say it, Listening or Next. */
  const actions = () =>
    all('[role="button"]')
      .map((node) => node.getAttribute('aria-label') ?? '')
      .filter((name) => ['Say it', 'Listening', 'Next'].includes(name));
  const click = (node: Element | null | undefined) =>
    act(async () => {
      if (node?.getAttribute('aria-label') === 'Say it') shown.recital = true;
      node?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
    });
  const radios = () => all('[role="radiogroup"][aria-label="Grade"] [role="radio"]');
  const checked = () => radios().map((radio) => radio.getAttribute('aria-checked'));
  /** The passage's recalls the store holds now. */
  const passageRecalls = () =>
    [...backing]
      .filter(([key]) => key.startsWith(`heartseed/recall/${passage.reference}/`))
      .map(([, value]): Recall => JSON.parse(value));
  /** The passage's recalls when the plan Today runs was made: at the launch, then at each `renew`'s Minutes radio. */
  const planned = { recalls: passageRecalls().length };
  /** Each end of a run `renew` met after its `Next`, as Today read: its grew line and grown verses. */
  const ends: { readonly grew: readonly string[]; readonly grown: readonly string[] }[] = [];
  /**
   * After `Next` on the plan's one item, the passage: Today held to the end
   * of the run exactly as `tendedModel` gives it over that item's recalls
   * when the plan was made and the store's recalls now (the heading `The
   * field is tended`, no counts line, the grew line and the grown verses by
   * name), kept in `ends`.
   */
  const ended = async () => {
    const tended = tendedModel(
      { plan: [{ reference: passage.reference, recalls: planned.recalls }], hold: null },
      [],
      passageRecalls(),
    );
    const want =
      tended === null
        ? '<no end over the run>'
        : JSON.stringify({
            headings: [END],
            counts: [],
            grew: [grewLine(tended.length)],
            grown: tended.map((each) => `${each.reference}, ${each.stage}`),
          });
    const read = () => JSON.stringify(endShown(host));
    await until(() => read() === want);
    expect({ after: 'Next', shown: read() }).toEqual({ after: 'Next', shown: want });
    const end = endShown(host);
    ends.push({ grew: end.grew, grown: end.grown });
  };
  /**
   * A new plan at the passage's due: `Next`, then the end of the run it
   * gives (`ended`), the clock set to the due, and the reader's trip through the Settings sheet
   * (`renewBySettings`: `Your field`, the Minutes radio checked, `Done`,
   * `Start`), which makes the plan again with no recital under way (the
   * recital's marks and result go) and ends on Today, the sheet held and
   * its look checked; Today then offers Say it on the passage under `cue`.
   */
  const renew = async (cue: Cue) => {
    await click(all('[role="button"]').find((node) => node.getAttribute('aria-label') === 'Next'));
    await ended();
    toDue(time, passageRecalls());
    shown.recital = false;
    shown.cue = cue;
    const trip = await renewBySettings({ host, until });
    expect({ at: trip.at, sheet: trip.sheet, looked: trip.looked > 0 }, 'the trip').toEqual({
      at: 'Today',
      sheet: [],
      looked: true,
    });
    const offered = await until(
      () => label() === 'Say it' && one('[data-testid="summary"]') === null,
    );
    planned.recalls = passageRecalls().length;
    return offered;
  };
  const leave = async () => {
    if (!mounted.delete(leave)) return;
    for (const release of [...holding]) release();
    rooted();
    rootRule.stop();
    await act(async () => root.unmount());
  };
  mounted.add(leave);
  /**
   * The step from home to Today on a read disk: home shows with its heading
   * alone and `Start`, no frame faulting the root's rule, and `Start` taken
   * lands on Today with its action.
   */
  const begin = async () => {
    expect(await until(() => headings().join('|') === 'Your field')).toBe(true);
    const offered = all('[role="button"]').find(
      (node) => (node.getAttribute('aria-label') ?? node.textContent) === 'Start',
    );
    expect({ headings: headings(), begin: offered !== undefined, faults: rootRule.faults }).toEqual(
      {
        headings: ['Your field'],
        begin: true,
        faults: [],
      },
    );
    await click(offered);
    expect(await until(() => headings().join('|') === 'Today' && button().length === 1)).toBe(true);
  };
  if (garden === 'read' && disk.held === undefined) await begin();
  /** The cue of the recital Say it's view holds, none before one. */
  const recitalCue = () =>
    Option.flatMap(MutableRef.get(latest), (view) =>
      Option.filter(Option.some(view.cue), () => view.startedAt !== null),
    );
  /** The plain verse's text as Today shows it: a lined verse's `line-<i>` texts joined by a space, else the whole-text node's; none while no plain verse shows. */
  const passageText = () => passageTextIn(host);
  /** Say it's view as Today last read it, none before one. */
  const sayIt = () => MutableRef.get(latest);
  /** The recall Say it's view holds pending for `Next`, as a list of none or one. */
  const pending = () =>
    Option.match(
      Option.flatMap(MutableRef.get(latest), (view) => Option.fromNullishOr(view.pending)),
      { onNone: (): Recall[] => [], onSome: (recall) => [recall] },
    );
  /** A tap on Today's `Next`. */
  const next = () =>
    click(all('[role="button"]').find((node) => node.getAttribute('aria-label') === 'Next'));
  /** How many runs of three of the verse's words, as written, show in any text or label outside the word nodes and the whole-text node. */
  const runsElsewhere = () => {
    const inVerse = (node: Node) =>
      (node.parentElement?.closest('[data-testid^="word-"], [data-testid="passage"]') ?? null) !==
      null;
    const texts = [...host.querySelectorAll('*')].flatMap((node) => [
      ...[...node.childNodes]
        .filter((child) => child.nodeType === child.TEXT_NODE && !inVerse(child))
        .map((child) => child.textContent ?? ''),
      ...(node.matches('[data-testid^="word-"]') ? [] : [node.getAttribute('aria-label') ?? '']),
    ]);
    return WORDS.slice(0, -2)
      .map((_, at) => WORDS.slice(at, at + 3).join(' '))
      .filter((run) => texts.some((text) => text.includes(run))).length;
  };
  /** How many of the whole-text node and the word nodes show any of the verse: a text seen in them, or a name the screen reader reads. */
  const verseShown = () => {
    const metOf = readerOf(host);
    return all('[data-testid="passage"], [data-testid^="word-"]').filter((node) => {
      const met = metOf(node, 0);
      return (met.seenAs ?? '') !== '' || (met.name ?? '') !== '';
    }).length;
  };
  /** How many of the whole-text node and the word nodes hold text seen at less than AA contrast on what is painted behind it. */
  const faint = () => {
    const metOf = readerOf(host);
    return all('[data-testid="passage"], [data-testid^="word-"]').filter(
      (node) => !metOf(node, 0).legible,
    ).length;
  };
  return {
    host,
    show,
    passageText,
    sayIt,
    pending,
    next,
    verseShown,
    faint,
    one,
    all,
    word,
    button,
    label,
    actions,
    renew,
    ends,
    begin,
    time,
    click,
    radios,
    checked,
    ticks,
    kept,
    leave,
    until,
    frame,
    reached,
    unsaid,
    recitalCue,
    runsElsewhere,
  };
};

/**
 * One recital said on `disk` under `cue`, the cue its stage gives
 * (`cue-say` and `cue-say-letters`): every unsaid word shows that cue while
 * it listens, the recital's own cue is `cue`, and a recital whole is
 * suggested Hard and kept with no miss, no run of the verse elsewhere.
 */
export const saysUnderCue = async (disk: Disk, cue: 'full' | 'initials') => {
  const n = WORDS.length;
  const today = await mount(scriptedSource(recite(passage.text, { every: 5, pace: 4 })), disk, {
    cue,
  });
  expect(await today.until(() => today.label() === 'Say it')).toBe(true);
  const atRest = today.unsaid.get(cue) ?? 0;
  await today.click(today.button()[0]);
  expect(await today.until(() => today.label() === 'Listening')).toBe(true);
  expect(today.recitalCue()).toEqual(Option.some(cue));
  expect(await today.until(() => today.one('[data-testid="summary"]') !== null)).toBe(true);
  expect((today.unsaid.get(cue) ?? 0) - atRest).toBeGreaterThan(n - 5);
  expect([today.host.textContent?.includes('Suggested: Hard'), today.runsElsewhere()]).toEqual([
    true,
    0,
  ]);
  expect(today.kept).toEqual([]);
  expect(today.pending().map((recall) => [recall.grade, recall.missed])).toEqual([[2, 0]]);
  await today.next();
  expect(await today.until(() => today.kept.length === 1)).toBe(true);
  expect(today.kept.map((recall) => [recall.grade, recall.missed])).toEqual([[2, 0]]);
  await today.leave();
};

/** A source that ends each listen with a failure of `reason`. */
export const failing = (reason: string) =>
  Layer.sync(DictationSource, () => {
    const send = MutableRef.make<(event: DictationEvent) => void>(() => {});
    return DictationSource.of({
      engines: () => Effect.succeed([]),
      listen: (session) =>
        Effect.sync(() =>
          MutableRef.get(send)({ session, kind: 'fail', final: false, runs: [], reason }),
        ),
      finish: Effect.void,
      cancel: Effect.void,
      subscribe: (listener) =>
        Effect.acquireRelease(
          Effect.sync(() => MutableRef.set(send, listener)),
          () => Effect.sync(() => MutableRef.set(send, () => {})),
        ),
    });
  });
