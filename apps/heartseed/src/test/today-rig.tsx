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
 */

import { RegistryProvider, useAtomValue } from '@effect/atom-react';
import { expect } from 'bun:test';
import { Effect, Layer, MutableRef, Option } from 'effect';
import * as KeyValueStore from 'effect/persistence/KeyValueStore';
import * as AsyncResult from 'effect/reactivity/AsyncResult';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import passage from 'virtual:heartseed-passage';

import Root from '../../app/index';
import { appLayer, runtime, sayItView } from '../app';
import { DictationSource, type DictationEvent } from '../dictation';
import { Chime } from '../garden';
import type { Cue, MarkStatus } from '../matcher';
import { sourceWords } from '../matcher/words';
import { Haptics, type Recall, type SayItView } from '../sayit';
import { pendingAt } from '../sayit/draw';
import { screenOf } from '../sayit/screen';
import { voiceSource } from '../voice/source';

export const WORDS = sourceWords(passage.text);

/** The spec's tokens (Today → Look and feel): the ground, the ink of a lit word, and the colour of the mark and of a peeked word. */
const GROUND = 'rgb(238, 232, 225)';
const INK = 'rgb(6, 79, 110)';
const MARK = 'rgb(192, 88, 63)';
/** The cue's ink a word not yet said is seen in under the full text or in letters. */
const CUE = 'rgb(86, 101, 109)';

/** WCAG 2's AA minimum contrast for normal text, which a word shown as its cue reads at. */
const AA = 4.5;

/** A computed colour's channels and alpha. */
const channels = (css: string) => {
  const values = (css.match(/[\d.]+/g) ?? []).map(Number);
  const [r = 0, g = 0, b = 0, a = values.length >= 3 ? 1 : 0] = values;
  return { rgb: [r, g, b], a };
};

/** WCAG 2's relative luminance of sRGB channels 0-255. */
const luminance = (rgb: readonly number[]) => {
  const [r = 0, g = 0, b = 0] = rgb.map((channel) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/** The contrast of an element's computed text colour against the nearest opaque background painted behind it; 0 when none is. */
const contrastOf = (node: Element) => {
  let ground: Element | null = node;
  while (ground !== null && channels(getComputedStyle(ground).backgroundColor).a < 1)
    ground = ground.parentElement;
  if (ground === null) return 0;
  const ink = luminance(channels(getComputedStyle(node).color).rgb);
  const back = luminance(channels(getComputedStyle(ground).backgroundColor).rgb);
  return (Math.max(ink, back) + 0.05) / (Math.min(ink, back) + 0.05);
};

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
    return colour !== null && colour !== GROUND && shown(holder);
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
    seen: CUE,
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
        seen: INK,
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
        seen: MARK,
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

/** A store over memory, holding `disk`'s recalls, that records, in order, each recall the garden writes: each keep Say it hands over that changes the recital's record writes one. */
const recordingStore = (kept: Recall[], disk: Disk) => {
  const backing = new Map<string, string>(
    disk.recalls.map((recall) => [
      `heartseed/recall/${recall.reference}/${recall.startedAt}`,
      JSON.stringify(recall),
    ]),
  );
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
 * Today leaves, as the app's does. `rest.cue` is the cue the test expects
 * Today's words under while no recital is shown. It first leaves any Today
 * a failed test left mounted, so a failure stays a failure of its own test.
 */
export const mount = async (
  source: Layer.Layer<DictationSource>,
  disk: Disk = NOT_PLANTED,
  rest: { readonly cue: Cue } = { cue: 'full' },
) => {
  for (const left of [...mounted]) await left();
  const ticks = { n: 0 };
  const kept: Recall[] = [];
  const layer = appLayer({
    source,
    haptics: Layer.succeed(Haptics, Haptics.of({ tick: Effect.sync(() => void (ticks.n += 1)) })),
    store: recordingStore(kept, disk),
    chime: Layer.succeed(Chime, Chime.of({ grow: () => Effect.void })),
    voice: voiceSource,
  });
  const host = document.createElement('div');
  document.body.append(host);
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
  /** Holds every word Today draws now, its fades run, to the rule for its status in the view it was drawn from (a word not yet said under the recital's cue, or the rest cue while none is shown), and counts the statuses met. */
  const frame = () => {
    runFades(host, played);
    const words = all('[data-testid^="word-"]');
    if (words.length === 0) return;
    const view = MutableRef.get(latest);
    const { marks, cue } = Option.match(screenOf(view).marks, {
      onNone: () => ({ marks: WORDS.map((_, index) => pendingAt(index)), cue: rest.cue }),
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
  /** Waits on the real clock until `holds`, at most `ms`, holding each frame on the way to Today's rules. */
  const until = async (holds: () => boolean, ms = 3000) => {
    const start = Date.now();
    await settle();
    while (!holds()) {
      if (Date.now() - start > ms) return false;
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
  const click = (node: Element | null | undefined) =>
    act(async () => {
      node?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
    });
  const radios = () => all('[role="radiogroup"][aria-label="Grade"] [role="radio"]');
  const checked = () => radios().map((radio) => radio.getAttribute('aria-checked'));
  const leave = async () => {
    if (!mounted.delete(leave)) return;
    for (const release of [...holding]) release();
    await act(async () => root.unmount());
  };
  mounted.add(leave);
  /** The cue of the recital Say it's view holds, none before one. */
  const recitalCue = () =>
    Option.flatMap(MutableRef.get(latest), (view) =>
      Option.filter(Option.some(view.cue), () => view.startedAt !== null),
    );
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
    verseShown,
    faint,
    one,
    all,
    word,
    button,
    label,
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
