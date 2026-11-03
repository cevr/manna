/* oxlint-disable effect/noAsyncFunction, effect/noGlobals, effect/noFixedWaitInTests, eslint/no-await-in-loop -- a React screen test: the screen's forked Effect work and its renders settle on the host's event loop, so each frame is handed over in `act` and awaited one after another, each turn a `Bun.sleep(0)` yield, until its read lands (the needle's animation is the event waited on). */

import { describe, expect, it } from 'bun:test';
import { Effect, Option } from 'effect';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { animations } from '../test/reanimated';

import { FEED_RATE, FRAME, feedFrame } from './session';
import { type Device, type Source, Tuner } from './Tuner';
import type { StringId } from './tuning';

const IDS: ReadonlyArray<StringId> = ['E2', 'A2', 'D3', 'G3', 'B3', 'E4'];

const tone = (string: StringId, cents: number, count: number, from = 0) =>
  Array.from({ length: count }, (_, k) =>
    feedFrame({ string, cents }, from + k, new Float32Array(FRAME)),
  );

const silence = (count: number) => Array.from({ length: count }, () => new Float32Array(FRAME));

const tick = () =>
  act(async () => {
    await Bun.sleep(0);
  });

const TURNS = 12;

const startedAfter = (starts: ReadonlyArray<number>, count: number) => starts.length > count;

const mount = async () => {
  const listeners = new Set<(frame: Float32Array) => void>();
  const activeListeners = new Set<(active: boolean) => void>();
  const starts: Array<number> = [];
  let active = true;
  const device: Device = {
    readPermission: Effect.succeed('granted'),
    askPermission: Effect.succeed('granted'),
    openSettings: () => {},
    active: () => active,
    onActive: (listener) => {
      activeListeners.add(listener);
      return () => void activeListeners.delete(listener);
    },
  };
  const source: Source = {
    name: 'mic',
    start: Effect.sync(() => {
      starts.push(FEED_RATE);
      return FEED_RATE;
    }),
    stop: Effect.void,
    onFrame: (listener) => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    onEnd: () => () => {},
  };
  const host = document.createElement('div');
  document.body.append(host);
  const root: Root = createRoot(host);
  act(() =>
    root.render(<Tuner device={device} source={source} sounding={false} pause={() => {}} />),
  );
  for (let turn = 0; turn < TURNS && !startedAfter(starts, 0); turn++) await tick();
  await tick();
  const byTestId = (id: string) =>
    Option.getOrThrow(Option.fromNullishOr(host.querySelector(`[data-testid="${id}"]`)));
  const name = () => byTestId('tuner-reading').children[0]?.textContent ?? '';
  return {
    starts,
    name,
    selected: () =>
      IDS.filter((id) => byTestId(`tuner-string-${id}`).getAttribute('aria-selected') === 'true'),
    clickAuto: () =>
      act(
        () =>
          void byTestId('tuner-auto').dispatchEvent(
            new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }),
          ),
      ),
    feed: async (frame: Float32Array) => {
      const before = animations.length;
      act(() => {
        for (const listener of [...listeners]) listener(frame);
      });
      for (let turn = 0; turn < TURNS && animations.length === before; turn++) await tick();
      await tick();
      return name();
    },
    awayAndBack: async () => {
      const count = starts.length;
      for (const next of [false, true]) {
        active = next;
        act(() => {
          for (const listener of [...activeListeners]) listener(next);
        });
      }
      for (let turn = 0; turn < TURNS && !startedAfter(starts, count); turn++) await tick();
      await tick();
    },
    [Symbol.dispose]: () => {
      act(() => root.unmount());
      host.remove();
    },
  };
};

const play = async (
  app: { readonly feed: (frame: Float32Array) => Promise<string> },
  frames: ReadonlyArray<Float32Array>,
) => {
  const names: Array<string> = [];
  for (const frame of frames) names.push(await app.feed(frame));
  return names;
};

describe('the tuner screen starts its focus afresh', () => {
  it('shows nothing on 3 silent frames after the app goes away and back with A locked', async () => {
    using app = await mount();
    const locked = await play(app, tone('A2', 0, 8));
    await app.awayAndBack();
    const after = await play(app, silence(3));
    expect({ starts: app.starts.length, locked: locked.at(-1), after }).toEqual({
      starts: 2,
      locked: 'A',
      after: ['Listening', 'Listening', 'Listening'],
    });
  });

  it('shows a steady A 15 cents sharp after the app goes away and back from its 4th frame, as a fresh lock', async () => {
    using app = await mount();
    const locked = await play(app, tone('A2', 0, 8));
    await app.awayAndBack();
    const after = await play(app, tone('A2', 15, 5, 100));
    expect({ starts: app.starts.length, locked: locked.at(-1), after }).toEqual({
      starts: 2,
      locked: 'A',
      after: ['Listening', 'Listening', 'Listening', 'A', 'A'],
    });
  });
});

describe('a shown pitch sets the string last heard', () => {
  it('in Auto, after 8 frames of A, turning Auto off picks A', async () => {
    using app = await mount();
    const seen = await play(app, tone('A2', 0, 8));
    app.clickAuto();
    await tick();
    expect({ shown: seen.at(-1), selected: app.selected() }).toEqual({
      shown: 'A',
      selected: ['A2'],
    });
  });
});
