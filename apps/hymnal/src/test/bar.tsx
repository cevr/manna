/**
 * The bar mounted whole for its tests (`src/player/tunerbar.test.tsx`,
 * `tunerbar.wheel.test.tsx`, `tunerbar.motion.test.tsx`), in a browser's document (`src/test/setup.ts`)
 * over a player whose device the test holds (`src/test/device.ts`) and a
 * reader's store the test holds (`src/test/reader.ts`). Hymn numbers only:
 * no hymn's words are read.
 */

import { RegistryContext } from '@effect/atom-react';
import { Duration, Effect, Option, Stream } from 'effect';
import * as AtomRegistry from 'effect/reactivity/AtomRegistry';
import { act, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';

import { type Cue, CueProvider } from '~/feel/cue';
import { hymnAt } from '~/hymns/hymns';
import { PlayerContext } from '~/player/context';
import { ChordReaderContext } from '~/player/Dials';
import { Ear } from '~/player/KeyWheel';
import { Command, Player, playerOn } from '~/player/player';
import { PageBar } from '~/player/PlayerBar';
import { type Item, ORIGIN_X, slotOf } from '~/player/wheel';

import { fakeDevice } from './device';
import { longPress } from './gesture';
import { routed } from './one';
import { readerOn } from './reader';

export const morning = Option.getOrThrow(hymnAt('100'));

export interface Mounted {
  readonly registry: AtomRegistry.AtomRegistry;
  readonly device: Map<string, string>;
  readonly cues: Array<Cue>;
  readonly get: (selector: string) => HTMLElement;
  readonly find: (selector: string) => Option.Option<HTMLElement>;
  readonly start: (track: typeof morning) => Effect.Effect<void>;
  readonly [Symbol.dispose]: () => void;
}

/** `screen` over a fresh player, the reader's store `device` and the ear `ear`, mounted; it unmounts when the `using` ends. */
export const mount = (screen: ReactNode, device: Map<string, string>, ear: boolean): Mounted => {
  routed.splice(0);
  const played = fakeDevice();
  const player = playerOn(played.layer, Duration.millis(1));
  const registry = AtomRegistry.make();
  const cues: Array<Cue> = [];
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  act(() =>
    root.render(
      <RegistryContext value={registry}>
        <ChordReaderContext value={readerOn(device)}>
          <Ear value={ear}>
            <CueProvider value={(cue) => void cues.push(cue)}>
              <PlayerContext value={Option.some(player)}>{screen}</PlayerContext>
            </CueProvider>
          </Ear>
        </ChordReaderContext>
      </RegistryContext>,
    ),
  );
  const find = (selector: string) =>
    Option.fromNullishOr(host.querySelector<HTMLElement>(selector));
  return {
    registry,
    device,
    cues,
    find,
    get: (selector) => Option.getOrThrow(find(selector)),
    start: (track) =>
      Effect.promise(() =>
        act(() =>
          Effect.runPromise(
            Effect.sync(() => registry.set(player.send, Command.Start({ track }))).pipe(
              Effect.andThen(
                AtomRegistry.toStream(registry, player.state).pipe(
                  Stream.filter((state) => !Player.$is('Idle')(state)),
                  Stream.runHead,
                ),
              ),
              Effect.asVoid,
            ),
          ),
        ),
      ),
    [Symbol.dispose]: () => {
      act(() => root.unmount());
      host.remove();
      registry.dispose();
    },
  };
};

/** Hymn 100's page with its own bar, over the store `device`. */
export const onPage = (device: Map<string, string>, ear: boolean) =>
  mount(<PageBar track={morning} />, device, ear);

export const chordsOn = (move?: { readonly transpose: number; readonly capo: number }) =>
  new Map([
    ['chords', 'true'],
    ...((move && [[`move.100`, `{"transpose":${move.transpose},"capo":${move.capo}}`] as const]) ||
      []),
  ]);

export const keyButton = (page: Mounted) => page.get('[role="button"][aria-label="Key"]');

export const px = (element: HTMLElement, property: string) =>
  Number.parseFloat(getComputedStyle(element).getPropertyValue(property) || '0');

/** Where the hold lands in the key button, in its own points. */
const PRESS = { x: 90, y: 22 } as const;

/** The wheel's origin in the key button's points: `ORIGIN_X` from the screen's edge, the button at the bar's 12-point padding, on its middle. */
const ORIGIN = { x: ORIGIN_X - 12, y: 22 } as const;

/** A hold on the key button at its middle, the finger kept there; the stand-in's hold is the handler's own time. */
export const hold = () => {
  let held = Option.none<ReturnType<typeof longPress>>();
  act(() => void (held = Option.some(longPress('key-hold', PRESS))));
  return {
    move: (dx: number, dy: number) => act(() => Option.map(held, (finger) => finger.move(dx, dy))),
    lift: () => act(() => Option.map(held, (finger) => finger.lift())),
  };
};

/** The finger's move from where the hold landed to `item`'s slot. */
export const toSlot = (item: Item) =>
  [ORIGIN.x + slotOf(item).x - PRESS.x, ORIGIN.y + slotOf(item).y - PRESS.y] as const;
