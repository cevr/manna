/* oxlint-disable effect/noGlobals, effect/noNullish, effect/noAsyncFunction, effect/noNewPromise, effect/noFixedWaitInTests, eslint/no-await-in-loop -- a React screen test: it mounts Today in happy-dom's document through React's promise-based `act`; the runtime's forked Effect work and the scripted recital run on the host's clock, so each turn is handed over in `act` one after another until the read the test waits on lands, at most 3 s; it reads nodes whose absent attributes and matches are null. */

/**
 * Today's Say it as a reader and a screen reader meet it: the route mounted
 * in happy-dom (react-native-web) under a registry whose runtime is the
 * app's own layer over a scripted source, recorded ticks and recalls. Every
 * frame a test waits through holds each word Today draws to the spec's rule
 * for its status in the view it was drawn from: the colour its text is seen
 * in, whether the screen reader reads it, its name and its role. It counts
 * words without printing one.
 */

import { RegistryProvider, useAtomValue } from '@effect/atom-react';
import { describe, expect, it } from 'bun:test';
import { Effect, Layer, MutableRef, Option } from 'effect';
import * as AsyncResult from 'effect/reactivity/AsyncResult';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import passage from 'virtual:heartseed-passage';

import Today from '../../app/index';
import { appLayer, runtime, sayItView } from '../app';
import { DictationSource, type DictationEvent } from '../dictation';
import { recite, scriptedSource } from '../dictation/script';
import type { MarkStatus } from '../matcher';
import { sourceWords } from '../matcher/words';
import { Haptics, Recalls, type Recall, type SayItView } from '../sayit';
import { screenOf } from './screen';

const WORDS = sourceWords(passage.text);

/** The spec's tokens (Today → Look and feel): the ground, the ink of a lit word, and the colour of the mark and of a peeked word. */
const GROUND = 'rgb(238, 232, 225)';
const INK = 'rgb(6, 79, 110)';
const MARK = 'rgb(192, 88, 63)';

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
  const seenColour = (node: Element) => {
    for (const holder of holders(node)) {
      const colour = opaque(getComputedStyle(holder).color);
      if (colour !== null && colour !== GROUND && shown(holder)) return colour;
    }
    return null;
  };
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
      if (said === `${word}, peeked`) return 'the word, peeked';
      if (/^Missed word \d+$/.test(said)) return said;
      return `another ${said.length} characters`;
    };
    return {
      text: named(text),
      seen: seenColour(node),
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

/** Today's rules for a word of each status (spec, Today → The verse and Look and feel), written apart from the screen's code. */
const rule = (status: MarkStatus, index: number) => {
  switch (status) {
    case 'matched':
      return { text: 'the word', seen: INK, hidden: false, name: 'the word', button: false };
    case 'tentative':
      return {
        text: 'the word',
        seen: expect.any(String),
        hidden: true,
        name: null,
        button: false,
      };
    case 'pending':
      return { text: expect.anything(), seen: null, hidden: true, name: null, button: false };
    case 'miss':
      return {
        text: '',
        seen: null,
        hidden: false,
        name: `Missed word ${index + 1}`,
        button: true,
      };
    case 'peek':
      return {
        text: 'the word',
        seen: MARK,
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

/** Today over `source`, under a registry that keeps living after Today leaves, as the app's does. */
const mount = async (source: Layer.Layer<DictationSource>) => {
  const ticks = { n: 0 };
  const kept: Recall[] = [];
  const layer = appLayer({
    source,
    haptics: Layer.succeed(Haptics, Haptics.of({ tick: Effect.sync(() => void (ticks.n += 1)) })),
    recalls: Layer.succeed(
      Recalls,
      Recalls.of({ keep: (recall) => Effect.sync(() => void kept.push(recall)) }),
    ),
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
              <Today />
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
  const played = new WeakSet<Element>();
  /** Holds every word Today draws now, its fades run, to the rule for its status in the view it was drawn from, and counts the statuses met. */
  const frame = () => {
    runFades(host, played);
    const words = all('[data-testid^="word-"]');
    if (words.length === 0) return;
    const marks = Option.getOrThrow(
      Option.flatMap(MutableRef.get(latest), (view) =>
        Option.fromNullishOr(view.dictation.matcher),
      ),
    ).marks;
    expect(words.length).toBe(marks.length);
    const metOf = readerOf(host);
    for (const mark of marks) {
      const node = word(mark.index);
      expect(node === null, `word-${mark.index} drawn`).toBe(false);
      if (node === null) continue;
      expect(metOf(node, mark.index), `${mark.status} at ${mark.index}`).toEqual(
        rule(mark.status, mark.index),
      );
      reached.set(mark.status, (reached.get(mark.status) ?? 0) + 1);
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
  const leave = () => act(async () => root.unmount());
  return {
    host,
    show,
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
  };
};

/** A source that ends each listen with a failure of `reason`. */
const failing = (reason: string) =>
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

describe('Today’s Say it', () => {
  it('reads a whole recital: each lit word by its name, the miss as a numbered mark, the count, the suggestion and the grade, then a changed grade and a peek', async () => {
    const n = WORDS.length;
    const today = await mount(
      scriptedSource(recite(passage.text, { skip: [10], every: 5, pace: 1 })),
    );
    expect(await today.until(() => today.label() === 'Say it')).toBe(true);
    expect(today.button()).toHaveLength(1);
    expect(today.one('[data-testid="passage"]')?.textContent).toBe(passage.text);
    expect(today.all('[data-testid^="word-"]')).toHaveLength(0);
    expect(today.radios()).toHaveLength(0);
    await today.click(today.button()[0]);
    expect(await today.until(() => today.one('[data-testid="summary"]') !== null)).toBe(true);
    expect(today.one('[data-testid="passage"]')).toBe(null);
    const named = WORDS.filter((_, index) => {
      const node = today.word(index);
      return (
        node !== null &&
        node.textContent === WORDS[index] &&
        node.getAttribute('aria-hidden') !== 'true' &&
        node.getAttribute('role') !== 'button'
      );
    });
    expect(named).toHaveLength(n - 1);
    const mark = today.word(10);
    expect(mark?.getAttribute('role')).toBe('button');
    expect(mark?.getAttribute('aria-label')).toBe('Missed word 11');
    expect(mark?.textContent).toBe('');
    expect(today.one('[data-testid="summary"]')?.textContent).toBe(`${n - 1} of ${n} words`);
    expect(today.host.textContent?.includes('Suggested: Hard')).toBe(true);
    expect(today.radios().map((radio) => radio.getAttribute('aria-label'))).toEqual([
      'Again',
      'Hard',
      'Good',
      'Easy',
    ]);
    expect(today.checked()).toEqual(['false', 'true', 'false', 'false']);
    expect(today.all('[role="alert"]')).toHaveLength(0);
    expect(today.label()).toBe('Say it');
    expect(today.ticks.n).toBe(n - 1);
    expect(today.kept.map((recall) => [recall.grade, recall.missed, recall.peeked])).toEqual([
      [2, 1, 0],
    ]);
    await today.click(today.radios()[2]);
    expect(await today.until(() => today.checked()[2] === 'true')).toBe(true);
    expect(today.checked()).toEqual(['false', 'false', 'true', 'false']);
    expect(today.host.textContent?.includes('Suggested: Hard')).toBe(true);
    await today.click(today.word(10));
    expect(
      await today.until(() => today.word(10)?.getAttribute('aria-label') !== 'Missed word 11'),
    ).toBe(true);
    expect(today.word(10)?.getAttribute('aria-label')).toBe(`${WORDS[10]}, peeked`);
    expect(today.word(10)?.textContent).toBe(WORDS[10]);
    expect(today.all('[aria-label^="Missed word"]')).toHaveLength(0);
    expect(today.one('[data-testid="summary"]')?.textContent).toBe(
      `${n - 1} of ${n} words, 1 peeked`,
    );
    expect(today.checked()).toEqual(['false', 'false', 'true', 'false']);
    expect(today.kept.map((recall) => [recall.grade, recall.peeked])).toEqual([
      [2, 0],
      [3, 0],
      [3, 1],
    ]);
    expect(today.reached.get('matched') ?? 0).toBeGreaterThanOrEqual(3 * (n - 1));
    expect(today.reached.get('miss') ?? 0).toBeGreaterThanOrEqual(2);
    expect(today.reached.get('peek') ?? 0).toBeGreaterThanOrEqual(1);
    await today.leave();
  });

  it('hides each unsaid word from the screen reader and reads Listening while it listens, with no grade', async () => {
    const today = await mount(scriptedSource(recite(passage.text, { every: 5, pace: 400 })));
    expect(await today.until(() => today.label() === 'Say it')).toBe(true);
    await today.click(today.button()[0]);
    expect(await today.until(() => today.label() === 'Listening')).toBe(true);
    const words = today.all('[data-testid^="word-"]');
    expect(words).toHaveLength(WORDS.length);
    const hidden = words.filter((node) => node.getAttribute('aria-hidden') === 'true');
    expect(hidden.length).toBeGreaterThan(WORDS.length - 5);
    expect(today.radios()).toHaveLength(0);
    expect(today.one('[data-testid="summary"]')).toBe(null);
    await today.leave();
  });

  it('shows a word still being heard softly but hides it from the screen reader, and draws each unsaid word as an empty slot', async () => {
    const today = await mount(scriptedSource(recite(passage.text, { every: 100, pace: 60 })));
    expect(await today.until(() => today.label() === 'Say it')).toBe(true);
    await today.click(today.button()[0]);
    expect(await today.until(() => (today.reached.get('tentative') ?? 0) > 0)).toBe(true);
    expect(today.reached.get('pending') ?? 0).toBeGreaterThan(WORDS.length - 5);
    expect(today.reached.get('matched') ?? 0).toBe(0);
    expect(today.ticks.n).toBe(0);
    await today.leave();
  });

  it('leaving mid-recital cancels it once and keeps nothing, with the registry still alive', async () => {
    const cancels = { n: 0 };
    const counted = Layer.effect(
      DictationSource,
      Effect.map(DictationSource, (inner) =>
        DictationSource.of({
          ...inner,
          cancel: Effect.andThen(
            Effect.sync(() => void (cancels.n += 1)),
            inner.cancel,
          ),
        }),
      ),
    ).pipe(Layer.provide(scriptedSource(recite(passage.text, { every: 5, pace: 400 }))));
    const today = await mount(counted);
    expect(await today.until(() => today.label() === 'Say it')).toBe(true);
    await today.click(today.button()[0]);
    expect(await today.until(() => today.label() === 'Listening')).toBe(true);
    await today.show(false);
    expect(today.button()).toHaveLength(0);
    expect(await today.until(() => cancels.n > 0)).toBe(true);
    expect(cancels.n).toBe(1);
    expect(today.kept).toEqual([]);
    await today.leave();
  });

  for (const [reason, ending, says] of [
    ['denied', 'denied', 'Settings'],
    ['unavailable', 'unavailable', 'available'],
    ['interrupted', 'interrupted', 'interrupted'],
    ['error', 'failed', 'Say it again'],
  ] as const)
    it(`ends a recital that could not be heard (${ending}) with one alert, the verse whole, no grade, and Say it again`, async () => {
      const today = await mount(failing(reason));
      expect(await today.until(() => today.label() === 'Say it')).toBe(true);
      await today.click(today.button()[0]);
      expect(await today.until(() => today.all('[role="alert"]').length === 1)).toBe(true);
      expect(today.one('[role="alert"]')?.textContent?.includes(says)).toBe(true);
      expect(today.one('[data-testid="passage"]')?.textContent).toBe(passage.text);
      expect(today.radios()).toHaveLength(0);
      expect(today.label()).toBe('Say it');
      expect(today.ticks.n).toBe(0);
      expect(today.kept).toEqual([]);
      await today.leave();
    });

  it('holds the button until Say it is ready, and while a recital finishes', () => {
    expect(screenOf(Option.none())).toMatchObject({ button: 'Say it', pressable: false });
    const finishing: SayItView = {
      dictation: { status: 'finishing', engine: 'analyzer', verse: '', matcher: null, ended: null },
      startedAt: 0,
      choice: null,
    };
    expect(screenOf(Option.some(finishing))).toMatchObject({
      button: 'Listening',
      pressable: false,
    });
    const cancelled: SayItView = {
      dictation: {
        status: 'idle',
        engine: 'analyzer',
        verse: '',
        matcher: null,
        ended: 'cancelled',
      },
      startedAt: 0,
      choice: null,
    };
    expect(screenOf(Option.some(cancelled))).toMatchObject({
      button: 'Say it',
      pressable: true,
      marks: Option.none(),
      result: Option.none(),
      alert: Option.none(),
    });
  });
});
