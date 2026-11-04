/* oxlint-disable effect/noGlobals, effect/noNullish, effect/noAsyncFunction, effect/noNewPromise, effect/noFixedWaitInTests, eslint/no-await-in-loop -- a React screen test: it mounts Today in happy-dom's document through React's promise-based `act`; the runtime's forked Effect work and the scripted recital run on the host's clock, so each turn is handed over in `act` one after another until the read the test waits on lands, at most 3 s; it reads nodes whose absent attributes and matches are null. */

/**
 * Today's Say it as a reader and a screen reader meet it: the route mounted
 * in happy-dom (react-native-web) under a registry whose runtime is the
 * app's own layer over a scripted source, recorded ticks and recalls. It
 * reads only accessible names, roles and states, and counts words without
 * printing one.
 */

import { RegistryProvider } from '@effect/atom-react';
import { describe, expect, it } from 'bun:test';
import { Effect, Layer, MutableRef, Option } from 'effect';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import passage from 'virtual:heartseed-passage';

import Today from '../../app/index';
import { appLayer, runtime } from '../app';
import { DictationSource, type DictationEvent } from '../dictation';
import { recite, scriptedSource } from '../dictation/script';
import { sourceWords } from '../matcher/words';
import { Haptics, Recalls, type Recall, type SayItView } from '../sayit';
import { screenOf } from './screen';

const WORDS = sourceWords(passage.text);

/** Waits on the real clock until `holds`, at most `ms`. */
const until = async (holds: () => boolean, ms = 3000) => {
  const start = Date.now();
  while (!holds()) {
    if (Date.now() - start > ms) return false;
    await act(() => new Promise((resolve) => setTimeout(resolve, 5)));
  }
  return true;
};

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
  const show = (today: boolean) =>
    act(async () =>
      root.render(
        <RegistryProvider initialValues={[[runtime.layer, layer]]}>
          {today && <Today />}
        </RegistryProvider>,
      ),
    );
  await show(true);
  const one = (selector: string) => host.querySelector(selector);
  const all = (selector: string) => [...host.querySelectorAll(selector)];
  const word = (index: number) => one(`[data-testid="word-${index}"]`);
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
  return { host, show, one, all, word, button, label, click, radios, checked, ticks, kept, leave };
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
    expect(await until(() => today.label() === 'Say it')).toBe(true);
    expect(today.button()).toHaveLength(1);
    expect(today.one('[data-testid="passage"]')?.textContent).toBe(passage.text);
    expect(today.all('[data-testid^="word-"]')).toHaveLength(0);
    expect(today.radios()).toHaveLength(0);
    await today.click(today.button()[0]);
    expect(await until(() => today.one('[data-testid="summary"]') !== null)).toBe(true);
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
    expect(await until(() => today.checked()[2] === 'true')).toBe(true);
    expect(today.checked()).toEqual(['false', 'false', 'true', 'false']);
    expect(today.host.textContent?.includes('Suggested: Hard')).toBe(true);
    await today.click(today.word(10));
    expect(await until(() => today.word(10)?.getAttribute('aria-label') !== 'Missed word 11')).toBe(
      true,
    );
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
    await today.leave();
  });

  it('hides each unsaid word from the screen reader and reads Listening while it listens, with no grade', async () => {
    const today = await mount(scriptedSource(recite(passage.text, { every: 5, pace: 400 })));
    expect(await until(() => today.label() === 'Say it')).toBe(true);
    await today.click(today.button()[0]);
    expect(await until(() => today.label() === 'Listening')).toBe(true);
    const words = today.all('[data-testid^="word-"]');
    expect(words).toHaveLength(WORDS.length);
    const hidden = words.filter((node) => node.getAttribute('aria-hidden') === 'true');
    expect(hidden.length).toBeGreaterThan(WORDS.length - 5);
    expect(today.radios()).toHaveLength(0);
    expect(today.one('[data-testid="summary"]')).toBe(null);
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
    expect(await until(() => today.label() === 'Say it')).toBe(true);
    await today.click(today.button()[0]);
    expect(await until(() => today.label() === 'Listening')).toBe(true);
    await today.show(false);
    expect(today.button()).toHaveLength(0);
    expect(await until(() => cancels.n > 0)).toBe(true);
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
      expect(await until(() => today.label() === 'Say it')).toBe(true);
      await today.click(today.button()[0]);
      expect(await until(() => today.all('[role="alert"]').length === 1)).toBe(true);
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
