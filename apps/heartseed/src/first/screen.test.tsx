/* oxlint-disable effect/noGlobals, effect/noNullish, effect/noTernary, effect/noAsyncFunction, effect/noNewPromise, effect/noFixedWaitInTests, eslint/no-await-in-loop -- a React screen test: it mounts the root route in happy-dom's document through React's promise-based `act`; the runtime's forked Effect work and the scripted recital run on the host's clock, so each turn is handed over in `act` until the frame the test waits on lands, at most 3 s; it reads nodes whose absent attributes are null, from plain branches, and the kept record as JSON text. */

/**
 * The first minute as a reader meets it: the root route mounted in
 * happy-dom under the app's own layer over the real store on the device's
 * `One.Database` (`src/test/one.tsx`), the scripted recital (the passage
 * less its 11th word) and a voice source that records its calls and sends
 * the events the test gives it. Every frame (each DOM mutation batch) is
 * read: a frame before the garden's read shows no heading and no button,
 * and no first-minute frame names a stage outside Planted. The letters
 * phase shows each letter in Today's cue ink at AA on its ground, at rest
 * and while listening, and the hear phase's words not yet read keep the
 * mute. It counts words without printing one.
 */

import { RegistryProvider } from '@effect/atom-react';
import { describe, expect, it } from 'bun:test';
import { Effect, Layer, MutableRef } from 'effect';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import passage from 'virtual:heartseed-passage';

import Root from '../../app/index';
import { appLayer, runtime } from '../app';
import { recite, scriptedSource } from '../dictation/script';
import { Chime, type Growth } from '../garden';
import { sourceWords } from '../matcher/words';
import { Haptics } from '../sayit';
import { store } from '../store';
import { AA, contrastOf } from '../test/contrast';
import { device } from '../test/one';
import { VoiceSource, type VoiceEvent } from '../voice';
import { wordSpans } from '../voice/reading';

const PREFIX = 'heartseed/recall/';
const SWITCH = 'heartseed/voice/enabled';
const WORDS = sourceWords(passage.text);
const SPANS = wordSpans(passage.text);
const INK = 'rgba(6, 79, 110, 1.00)';
/** Today's cue ink, `#56656d`: the first minute's letters are seen in it. */
const CUE = 'rgba(86, 101, 109, 1.00)';
/** The mute, `#7d8d95`: the hear phase's words not yet read and the reference keep it. */
const MUTE = 'rgba(125, 141, 149, 1.00)';
const HEADINGS = ['Hear it', 'Say it with help', 'Say it alone', 'Planted', 'Today'];
const CLAIM = /\b(seeds?|planted|plants?|grew|growth|stages?)\b/iu;

/** The voice's native source: it records each speak and stop, and lets the test send its events. */
const voiceStandIn = () => {
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

/** A launch: the root over the device's disk as it stands, built once `held` resolves. */
const mount = async (
  held: Promise<void> = Promise.resolve(),
  source = scriptedSource(recite(passage.text, { skip: [10], every: 5, pace: 1 })),
) => {
  const voice = voiceStandIn();
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
  });
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
    const firstMinute = shown.some((text) => text !== 'Planted' && text !== 'Today');
    if (
      firstMinute &&
      (CLAIM.test(host.textContent ?? '') ||
        host.querySelector('[data-testid="stage"],[data-testid="plant"]') !== null)
    )
      frames.claims += 1;
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
    const start = Date.now();
    while (!holds()) {
      if (Date.now() - start > ms) return false;
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
  const inked = () =>
    WORDS.filter((_, index) => {
      const node = word(index);
      return node !== null && getComputedStyle(node).color === INK;
    }).length;
  const selected = () =>
    WORDS.flatMap((_, index) =>
      word(index)?.getAttribute('aria-selected') === 'true' ? [index] : [],
    );
  const heading = () => headings().find((text) => HEADINGS.includes(text)) ?? null;
  const stage = () =>
    host.querySelector('[data-testid="stage"]')?.getAttribute('aria-label') ?? null;
  const leave = async () => {
    watch.disconnect();
    await act(async () => root.unmount());
  };
  return {
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
    leave,
  };
};

const recalls = () => [...device.disk.keys()].filter((key) => key.startsWith(PREFIX));

/** Each word's seen letter in the letters phase: the one part of its node not hidden from the screen reader, none when the word is not shown in letters. */
const lettersIn = (host: Element) =>
  WORDS.flatMap((_, index) => {
    const word = host.querySelector(`[data-testid="word-${index}"]`);
    const seen = [...(word?.children ?? [])].filter((part) => !part.hasAttribute('aria-hidden'));
    return seen.length === 1 && seen[0] !== undefined ? [seen[0]] : [];
  });

/** The letters' ink and contrast, counted: how many are seen, in the cue's ink, and at AA on the ground behind them. */
const lettersLook = (host: Element) => {
  const letters = lettersIn(host);
  return {
    letters: letters.length,
    cue: letters.filter((letter) => getComputedStyle(letter).color === CUE).length,
    aa: letters.filter((letter) => contrastOf(letter) >= AA).length,
  };
};

describe('the first minute', () => {
  it('on a fresh install: hears the verse lit word by word, says it with first letters keeping nothing, says it alone and plants one seed, then Continue opens Today at a seed, as does the next launch', async () => {
    device.launch([]);
    const first = await mount();
    expect(await first.until(() => first.heading() === 'Hear it')).toBe(true);
    expect([first.buttons(), first.voice.calls.speaks]).toEqual([['Listen', 'Next'], 0]);
    expect(WORDS.every((text, index) => first.word(index)?.textContent === text)).toBe(true);
    await first.click('Listen');
    expect(await first.until(() => first.voice.calls.speaks === 1 && first.inked() === 0)).toBe(
      true,
    );
    expect(first.buttons()).toEqual(['Next']);
    await first.send({ kind: 'range', location: SPANS[0]?.start ?? 0, length: 1 });
    await first.send({
      kind: 'range',
      location: SPANS[1]?.start ?? 0,
      length: (SPANS[2]?.end ?? 0) - (SPANS[1]?.start ?? 0),
    });
    expect(await first.until(() => first.inked() === 3)).toBe(true);
    expect(first.selected()).toEqual([1, 2]);
    await first.send({ kind: 'finish', location: 0, length: 0 });
    expect(await first.until(() => first.heading() === 'Say it with help')).toBe(true);
    expect(
      WORDS.every(
        (text, index) =>
          first.word(index)?.getAttribute('aria-label') ===
          [...text].find((char) => /[\p{L}\p{N}]/u.test(char)),
      ),
    ).toBe(true);
    await first.click('Say it');
    expect(await first.until(() => first.heading() === 'Say it alone')).toBe(true);
    expect([recalls(), device.calls.set]).toEqual([[], 0]);
    expect(
      WORDS.every((_, index) => first.word(index)?.getAttribute('aria-hidden') === 'true'),
    ).toBe(true);
    await first.click('Say it');
    expect(await first.until(() => first.heading() === 'Planted')).toBe(true);
    expect([first.stage(), recalls().length, first.chimes]).toEqual(['Stage: seed', 1, []]);
    const kept = JSON.parse(device.disk.get(recalls()[0] ?? '') ?? 'null');
    expect([kept.grade, kept.suggested, kept.words, kept.missed]).toEqual([2, 2, WORDS.length, 1]);
    await first.click('Continue');
    expect(await first.until(() => first.heading() === 'Today' && first.stage() !== null)).toBe(
      true,
    );
    expect(first.stage()).toBe('Stage: seed');
    expect(first.host.querySelector('[data-testid="growth"]')).toBe(null);
    expect(first.frames).toMatchObject({ pendingOffers: 0, claims: 0, many: 0 });
    await first.leave();

    device.launch();
    const next = await mount();
    expect(await next.until(() => next.stage() !== null)).toBe(true);
    expect([next.heading(), next.stage(), next.frames.claims, recalls().length]).toEqual([
      'Today',
      'Stage: seed',
      0,
      1,
    ]);
    await next.leave();
  });

  it('shows every letter of the letters phase in Today’s cue ink at AA on its ground, at rest and while its recital listens, while the hear phase’s words not yet read and the reference keep the mute', async () => {
    device.launch([]);
    const open = scriptedSource([{ at: 600_000, final: false, runs: [] }]);
    const first = await mount(Promise.resolve(), open);
    expect(await first.until(() => first.heading() === 'Hear it')).toBe(true);
    const reference = first.host.querySelector('[data-testid="reference"]');
    expect(reference === null ? null : getComputedStyle(reference).color).toBe(MUTE);
    await first.click('Listen');
    await first.send({ kind: 'range', location: SPANS[0]?.start ?? 0, length: 1 });
    expect(await first.until(() => first.inked() === 1)).toBe(true);
    const unread = WORDS.filter((_, index) => {
      const node = first.word(index);
      return index > 0 && node !== null && getComputedStyle(node).color === MUTE;
    }).length;
    expect(unread).toBe(WORDS.length - 1);
    await first.send({ kind: 'finish', location: 0, length: 0 });
    expect(await first.until(() => first.heading() === 'Say it with help')).toBe(true);
    const all = { letters: WORDS.length, cue: WORDS.length, aa: WORDS.length };
    expect(lettersLook(first.host)).toEqual(all);
    await first.click('Say it');
    expect(await first.until(() => first.buttons().includes('Listening'))).toBe(true);
    expect(lettersLook(first.host)).toEqual(all);
    expect(reference === null ? null : getComputedStyle(reference).color).toBe(MUTE);
    await first.leave();
  });

  it('with the voice off: offers no Listen and never speaks, and Next goes on', async () => {
    device.launch([[SWITCH, 'false']]);
    const first = await mount();
    expect(await first.until(() => first.heading() === 'Hear it')).toBe(true);
    expect(first.buttons()).toEqual(['Next']);
    await first.click('Next');
    expect(await first.until(() => first.heading() === 'Say it with help')).toBe(true);
    expect([first.voice.calls.speaks, device.disk.get(SWITCH)]).toEqual([0, 'false']);
    await first.leave();
  });

  it('stops a reading under way at Next, and keeps nothing at a relaunch mid-flow, which starts again at hear', async () => {
    device.launch([]);
    const first = await mount();
    expect(await first.until(() => first.heading() === 'Hear it')).toBe(true);
    await first.click('Listen');
    await first.click('Next');
    expect(await first.until(() => first.heading() === 'Say it with help')).toBe(true);
    expect(first.voice.calls.stops).toBe(1);
    await first.click('Say it');
    expect(await first.until(() => first.heading() === 'Say it alone')).toBe(true);
    await first.leave();
    device.launch();
    const again = await mount();
    expect(await again.until(() => again.heading() === 'Hear it')).toBe(true);
    expect(recalls()).toEqual([]);
    await again.leave();
  });

  it('never opens on a garden it could not read: Today, claiming no stage', async () => {
    device.launch([]).fail('keys', 3);
    const today = await mount();
    expect(await today.until(() => today.heading() !== null && device.calls.keys === 3)).toBe(true);
    await today.until(() => false, 20);
    expect([today.heading(), today.stage(), today.frames.claims]).toEqual(['Today', null, 0]);
    await today.leave();
  });

  it('shows a held launch no heading and no button, and lists nothing, until its read completes, then the first minute', async () => {
    device.launch([]);
    const gate = Promise.withResolvers<void>();
    const first = await mount(gate.promise);
    await first.until(() => false, 20);
    expect([first.heading(), first.buttons(), device.calls.keys, first.frames.pending > 0]).toEqual(
      [null, [], 0, true],
    );
    expect(first.host.querySelector('[data-testid="reference"]')?.textContent).toBe(
      passage.reference,
    );
    gate.resolve();
    expect(await first.until(() => first.heading() === 'Hear it')).toBe(true);
    expect(first.frames).toMatchObject({ pendingOffers: 0, many: 0 });
    await first.leave();
  });
});
