/* oxlint-disable effect/noGlobals, effect/noNullish, effect/noAsyncFunction, effect/noTernary, effect/noNewPromise, effect/noFixedWaitInTests, eslint/no-await-in-loop -- a root test: it mounts the app in happy-dom's document through React's promise-based `act`, hands the runtime's forked work its turns one after another on the host's clock, draws its steps with plain branches, reads nodes whose absent attributes are null, and hands each word its box through the layout handler react-native-web keeps on the node. */

/**
 * Today's reading view and hold through the root (hslight L6, L7), on one
 * device whose plan's new piece is one whole verse (John 15:1), against the
 * voice's model (`src/test/voice-model.ts`): `Listen`, then generated
 * range events of the current, a past and a future utterance, ends,
 * holds at generated points, moves, releases, cancels, swipes, and a
 * reading's end under a held finger followed by that finger's late end.
 * After every step: the source's calls equal the model's (a hold pauses,
 * a release seeks to the held word once, a cancel resumes, a swipe and a
 * late end call nothing); one tick per hold; the reading view exactly
 * while the model reads the piece, with no `passage` beside it, the held
 * word as the read point and the selection while held, each word its own
 * VoiceOver element (`src/test/voiceover.ts`); the passage whole
 * otherwise; and Today's scroll view still exactly while held.
 *
 * It catches a hold with no tick or no pause, a scroll view that scrolls
 * under a held finger or stays still after it, a seek at both ends of a
 * release, a hold kept past the reading's end, the reading view shown at
 * rest, and its words merged into one VoiceOver element or hidden.
 */

import { RegistryProvider } from '@effect/atom-react';
import { expect, it } from 'bun:test';
import { Effect, Layer, Logger, Option } from 'effect';
import * as KeyValueStore from 'effect/persistence/KeyValueStore';
import { act } from 'react';
import { createRoot } from 'react-dom/client';

import Root from '../../app/index';
import { appLayer, runtime } from '../app';
import { microphoneSource } from '../dictation/source';
import { Chime } from '../garden';
import { versesOf } from '../kjv';
import { TAUGHT } from '../promises';
import { Haptics } from '../sayit';
import { clockAt } from '../test/clock';
import { below, random } from '../test/garden-model';
import { gestureOf, type PanConfig } from '../test/gesture';
import { computed } from '../test/look';
import { KEY, spansOf, VoiceModel, type ModelCall, type ModelVoice } from '../test/voice-model';
import { voiceOverFaults } from '../test/voiceover';
import { theme } from '../theme';
import { VoiceSource, type VoiceEvent } from '../voice';
import { type Box, shownWordsOf, wordAt } from './words';

const VOICES: ReadonlyArray<ModelVoice> = [
  {
    id: 'test.en-US',
    language: 'en-US',
    name: 'Test',
    quality: 2,
    novelty: false,
    personal: false,
  },
];

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 10, 12, 15, 0, 0);

/** A disk whose plan's new piece is John 15:1: one recall of the passage yesterday, and the verse added. */
const diskOf = () => {
  const startedAt = NOW - DAY - 3 * 3_600_000;
  const offset = -new Date(startedAt).getTimezoneOffset();
  return new Map<string, string>([
    [
      `heartseed/recall/Isaiah 41:10/${startedAt}`,
      JSON.stringify({
        reference: 'Isaiah 41:10',
        startedAt,
        offset,
        grade: 4,
        suggested: 3,
        words: 0,
        missed: 0,
        peeked: 0,
        extra: 0,
      }),
    ],
    [KEY, 'her'],
    ['heartseed/passages', JSON.stringify([{ book: 43, chapter: 15, first: 1, last: 1 }])],
  ]);
};

const storeOf = (map: Map<string, string>) =>
  Layer.succeed(
    KeyValueStore.KeyValueStore,
    KeyValueStore.makeStringOnly({
      get: (key) => Effect.sync(() => map.get(key)),
      set: (key, value) => Effect.sync(() => void map.set(key, value)),
      remove: (key) => Effect.sync(() => void map.delete(key)),
      clear: Effect.sync(() => map.clear()),
      size: Effect.sync(() => map.size),
      keys: Effect.sync(() => [...map.keys()]),
    }),
  );

/** A voice source that keeps every call and hands the test its listener. */
const sourceOf = () => {
  const calls: ModelCall[] = [];
  const listeners = new Set<(event: VoiceEvent) => void>();
  const layer = Layer.succeed(
    VoiceSource,
    VoiceSource.of({
      voices: Effect.succeed(VOICES),
      speak: (utterance, text, speaking) =>
        Effect.sync(
          () =>
            void calls.push({
              type: 'speak',
              utterance,
              text,
              voice: speaking.system,
              natural: speaking.natural,
            }),
        ),
      pause: Effect.sync(() => void calls.push({ type: 'pause' })),
      resume: Effect.sync(() => void calls.push({ type: 'resume' })),
      stop: Effect.sync(() => void calls.push({ type: 'stop' })),
      subscribe: (next) =>
        Effect.asVoid(
          Effect.acquireRelease(
            Effect.sync(() => listeners.add(next)),
            () => Effect.sync(() => listeners.delete(next)),
          ),
        ),
    }),
  );
  return { layer, calls, send: (event: VoiceEvent) => listeners.forEach((each) => each(event)) };
};

/** Words in rows that wrap at 340 pt, 24-70 pt wide, 8 apart, lines 40 apart. */
const layoutOf = (next: () => number, n: number): Box[] => {
  const boxes: Box[] = [];
  let x = 0;
  let row = 0;
  for (let index = 0; index < n; index += 1) {
    const width = 24 + below(next, 47);
    if (x > 0 && x + width > 340) {
      x = 0;
      row += 1;
    }
    boxes.push({ x, y: row * 40, width, height: 36 });
    x += width + 8;
  }
  return boxes;
};

const pointOf = (next: () => number, boxes: readonly Box[]) => {
  const box = boxes[below(next, boxes.length)] as Box;
  const points = [
    { x: box.x + below(next, box.width), y: box.y + below(next, box.height) },
    { x: box.x + box.width + 4, y: box.y + 10 },
    { x: box.x + below(next, box.width), y: box.y + 38 },
    { x: -30, y: box.y + 5 },
    { x: 400, y: box.y + 5 },
  ];
  return points[below(next, points.length)] as { x: number; y: number };
};

const nameOf = (node: Element) =>
  node.getAttribute('aria-label') ?? (node.textContent ?? '').trim();

/** A touch as the stand-in plays it: the point in the reading view, no translation. */
interface Touch {
  readonly x: number;
  readonly y: number;
  readonly translationX: number;
  readonly translationY: number;
}

/** A layout as react-native-web's observer hands it to a node's `onLayout`. */
interface LayoutEvent {
  readonly nativeEvent: { readonly layout: Box };
  readonly timeStamp: number;
}

/** How often the walk played each kind of step. */
interface Tally {
  holds: number;
  moves: number;
  releases: number;
  cancels: number;
  swipes: number;
  ranges: number;
}

type Kind = 'listen' | 'hold' | 'swipe' | 'move' | 'release' | 'cancel' | 'event';

/** The step drawn by `roll` while the piece is read or not, held or not. */
const kindOf = (reads: boolean, held: boolean, roll: number): Kind => {
  if (!reads) return 'listen';
  if (!held) return roll < 0.35 ? 'hold' : roll < 0.45 ? 'swipe' : 'event';
  if (roll < 0.35) return 'move';
  if (roll < 0.55) return 'release';
  return roll < 0.65 ? 'cancel' : 'event';
};

/** A source's event: mostly a range in the current utterance's own text, now and then an end, one in eight of the past utterance. */
const eventOf = (next: () => number, model: VoiceModel, roll: number): VoiceEvent => {
  const spoken = (model.view.verse ?? '').length - model.offset;
  return {
    utterance: model.utterance - (below(next, 8) === 0 ? 1 : 0),
    kind: roll > 0.93 ? 'finish' : roll > 0.9 ? 'interrupt' : 'range',
    location: below(next, spoken),
    length: 1 + below(next, 8),
  };
};

/** Source calls as a failure names them: no text, only each speak's utterance and length. */
const said = (calls: ReadonlyArray<ModelCall>) =>
  calls
    .map((call) =>
      call.type === 'speak' ? `speak#${call.utterance}@${call.text.length}` : call.type,
    )
    .join('|');

/** Whether an element sits in a scroll view that scrolls. */
const scrolls = (element: Element) => {
  for (let up = element.parentElement; up !== null; up = up.parentElement) {
    const overflow = getComputedStyle(up).overflowY;
    if (overflow === 'auto' || overflow === 'scroll') return true;
  }
  return false;
};

/** The faults of each word of the reading view against the read point and the selection. */
const wordFaults = (
  reading: Element,
  text: string,
  readTo: number,
  selected: { readonly first: number; readonly last: number } | null,
  at: string,
) =>
  shownWordsOf(text).flatMap((word, index) => {
    const node = reading.querySelector(`[data-testid="word-${index}"]`);
    if (node === null || node.parentElement !== reading)
      return [`${at}: word-${index} not a child of the view`];
    const isSelected = selected !== null && index >= selected.first && index <= selected.last;
    const ink = index < readTo ? theme.light.ink : theme.light.quiet;
    return [
      node.textContent !== word && `${at}: word-${index} text differs`,
      (node.getAttribute('aria-selected') === 'true') !== isSelected &&
        `${at}: word-${index} selected ${!isSelected}`,
      getComputedStyle(node).color !== computed(ink) &&
        `${at}: word-${index} in ${index < readTo ? 'quiet' : 'ink'}`,
    ].filter((fault): fault is string => fault !== false);
  });

/** The frame's faults: the reading view exactly while the model reads `text`, under the held word, and the scroll view still exactly while held. */
const frameFaults = (
  host: Element,
  text: string,
  model: VoiceModel,
  held: number | null,
  at: string,
): string[] => {
  const reading = host.querySelector('[data-testid="reading"]');
  const passage = host.querySelector('[data-testid="passage"]');
  if (!(model.active && model.view.verse === text))
    return [
      reading !== null && `${at}: a reading view at rest`,
      passage?.textContent !== text && `${at}: the passage not whole at rest`,
    ].filter((fault): fault is string => fault !== false);
  if (reading === null) return [`${at}: no reading view while the voice reads`];
  const selected = held === null ? model.view.current : { first: held, last: held };
  const still = !scrolls(reading);
  return [
    ...(passage === null ? [] : [`${at}: the passage beside the reading view`]),
    ...wordFaults(reading, text, held ?? model.view.lit, selected, at),
    ...voiceOverFaults(host).map((fault) => `${at}: ${fault}`),
    ...(still === (held !== null)
      ? []
      : [
          `${at}: the scroll view ${still ? 'is still' : 'scrolls'} while ${held === null ? 'not held' : 'held'}`,
        ]),
  ];
};

it('lights the words through Today and seeks under a held finger, every step against the model', async () => {
  const text = versesOf(43, 15)[0] as string;
  const n = spansOf(text).length;
  const next = random(41);
  const boxes = layoutOf(next, n);
  const known = new Map(boxes.map((box, index) => [index, box] as const));
  const disk = diskOf();
  const model = new VoiceModel(new Map(disk), VOICES);
  const source = sourceOf();
  let ticks = 0;
  const layer = appLayer({
    source: microphoneSource,
    haptics: Layer.succeed(Haptics, Haptics.of({ tick: Effect.sync(() => void (ticks += 1)) })),
    store: storeOf(disk),
    chime: Layer.succeed(Chime, Chime.of({ grow: () => Effect.void })),
    voice: source.layer,
    promises: TAUGHT,
  }).pipe(
    Layer.provideMerge(
      Layer.merge(
        clockAt(() => NOW),
        Logger.layer([]),
      ),
    ),
  );
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  await act(async () =>
    root.render(
      <RegistryProvider initialValues={[[runtime.layer, layer]]}>
        <Root />
      </RegistryProvider>,
    ),
  );
  const settle = async (turns = 4) => {
    for (let turn = 0; turn < turns; turn++)
      await act(() => new Promise((resolve) => setTimeout(resolve, 1)));
  };
  const button = (label: string) =>
    [...host.querySelectorAll('[role="button"]')].find((node) => nameOf(node) === label);
  const tap = async (label: string) => {
    await act(async () => {
      button(label)?.dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }),
      );
    });
    await settle();
  };
  const lay = () =>
    act(async () => {
      boxes.forEach((box, index) => {
        const node = host.querySelector(`[data-testid="word-${index}"]`) as
          | (Element & { __reactLayoutHandler?: (event: LayoutEvent) => void })
          | null;
        node?.__reactLayoutHandler?.({ nativeEvent: { layout: box }, timeStamp: 0 });
      });
    });
  for (let turn = 0; turn < 300 && button('Begin') === undefined; turn++) await settle(1);
  await tap('Begin');
  for (let turn = 0; turn < 300 && button('Listen') === undefined; turn++) await settle(1);
  const faults: string[] = [];
  const tally: Tally = { holds: 0, moves: 0, releases: 0, cancels: 0, swipes: 0, ranges: 0 };
  let held: number | null = null;
  let pan: PanConfig = { testID: 'reading-hold' };
  const end = (touch: Touch, canceled: boolean) =>
    act(async () => {
      pan.onDeactivate?.({ ...touch, canceled });
      pan.onFinalize?.({ ...touch, canceled });
    });
  const play: Record<Kind, (touch: Touch, roll: number) => Promise<void>> = {
    listen: async () => {
      model.read(text, false);
      await tap('Listen');
      await lay();
    },
    hold: async (touch) => {
      pan = gestureOf('reading-hold');
      await act(async () => {
        pan.onBegin?.(touch);
        pan.onActivate?.(touch);
      });
      held = Option.getOrNull(wordAt(touch.x, touch.y, known));
      model.pause();
      tally.holds += 1;
      await settle();
    },
    swipe: async (touch) => {
      const swipe = gestureOf('reading-hold');
      await act(async () => {
        swipe.onBegin?.(touch);
        swipe.onFinalize?.({ ...touch, canceled: true });
      });
      tally.swipes += 1;
      await settle();
    },
    move: async (touch) => {
      await act(async () => pan.onUpdate?.(touch));
      held = Option.getOrElse(wordAt(touch.x, touch.y, known), () => held);
      tally.moves += 1;
      await settle();
    },
    release: async (touch) => {
      await end(touch, false);
      if (held !== null) model.seek(held, false);
      held = null;
      tally.releases += 1;
      await settle();
      await lay();
    },
    cancel: async (touch) => {
      await end(touch, true);
      model.resume();
      held = null;
      tally.cancels += 1;
      await settle();
    },
    event: async (touch, roll) => {
      const event = eventOf(next, model, roll);
      model.event(event.utterance, event.kind, event.location, event.length);
      if (event.kind === 'range') tally.ranges += 1;
      await act(async () => source.send(event));
      await settle();
      if (held === null || model.active) return;
      held = null;
      await end(touch, false);
      await settle();
    },
  };
  for (let step = 0; step < 48 && faults.length === 0; step++) {
    const at = `John 15:1 step ${step}`;
    const roll = next();
    const kind = kindOf(model.active && model.view.verse === text, held !== null, roll);
    await play[kind]({ ...pointOf(next, boxes), translationX: 0, translationY: 0 }, roll);
    if (said(source.calls) !== said(model.calls))
      faults.push(`${at}: calls ${said(source.calls)} want ${said(model.calls)}`);
    if (ticks !== tally.holds) faults.push(`${at}: ${ticks} ticks for ${tally.holds} holds`);
    faults.push(...frameFaults(host, text, model, held, at));
  }
  await act(async () => root.unmount());
  host.remove();
  expect(faults).toEqual([]);
  expect(tally.holds).toBeGreaterThan(5);
  expect(tally.releases).toBeGreaterThan(1);
  expect(tally.cancels).toBeGreaterThan(0);
  expect(tally.ranges).toBeGreaterThan(5);
});
