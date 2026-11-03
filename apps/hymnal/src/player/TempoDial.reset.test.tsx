import { RegistryContext } from '@effect/atom-react';
import { describe, expect, it } from 'effect-bun-test';
import { Duration, Effect, Option } from 'effect';
import * as AtomRegistry from 'effect/reactivity/AtomRegistry';
import { TestClock } from 'effect/testing';
import { act } from 'react';
import { createRoot } from 'react-dom/client';

import { type Cue, CueProvider, plain } from '~/feel/cue';
import { book } from '~/follow/book';
import { settings } from '~/store';
import { holdAnimations, landAnimations, stepAnimations } from '~/test/reanimated';

import { RESET_TURN } from './DialView';
import { STOPS } from './tempo';
import { TapClock, TempoDial } from './TempoDial';

const RESET = '[aria-label="Reset tempo"]';

const NO_TIMING = 696;

const FRAME = 16;

const MOST_FRAMES = 120;

const framesAfter = (move: () => void) => {
  holdAnimations();
  using _held = { [Symbol.dispose]: landAnimations };
  move();
  const step = () => {
    let running = false;
    act(() => {
      running = stepAnimations(FRAME);
    });
    return running;
  };
  let frames = 1;
  while (frames < MOST_FRAMES && step()) frames++;
  return frames;
};

const press = (element: Element) =>
  act(() => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
  });

const mount = (number: number) => {
  const registry = AtomRegistry.make();
  registry.set(settings.tempo(number), 100);
  const clock = Effect.runSync(Effect.scoped(TestClock.make()));
  const cues: Array<Cue> = [];
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  act(() =>
    root.render(
      <RegistryContext value={registry}>
        <TapClock value={clock}>
          <CueProvider value={(cue) => void cues.push(cue)}>
            <TempoDial number={number} />
          </CueProvider>
        </TapClock>
      </RegistryContext>,
    ),
  );
  const one = (selector: string) => Option.fromNullishOr(host.querySelector(selector));
  const get = (selector: string) => Option.getOrThrow(one(selector));
  const touched = new Set([number]);
  return {
    cues,
    shown: () => Option.isSome(one(RESET)),
    beat: () => ({
      readOut: Option.isSome(one('[data-testid="tempo-bpm"]')),
      tap: Option.isSome(one('[aria-label="Tap"]')),
    }),
    reset: () => press(get(RESET)),
    chip: () => {
      const element = get(RESET);
      return { role: element.getAttribute('role'), words: element.textContent ?? '' };
    },
    tempo: (n = number) => registry.get(settings.tempo(n)),
    setTempo: (tempo: number, n = number) => {
      touched.add(n);
      act(() => registry.set(settings.tempo(n), tempo));
    },
    setSound: (on: boolean) => act(() => registry.set(settings.sound, on)),
    said: () => get('[data-testid="dial-tempo"]').getAttribute('aria-valuetext'),
    readOut: () => get('[data-testid="tempo-bpm"]').getAttribute('aria-label'),
    taps: (count: number, apart: number) =>
      Effect.gen(function* () {
        for (let n = 0; n < count; n++) {
          if (n > 0)
            yield* Effect.promise(() =>
              act(() => Effect.runPromise(clock.adjust(Duration.millis(apart)))),
            );
          press(get('[aria-label="Tap"]'));
        }
      }),
    [Symbol.dispose]: () => {
      act(() => {
        for (const n of touched) registry.set(settings.tempo(n), 100);
      });
      act(() => root.unmount());
      host.remove();
      registry.dispose();
    },
  };
};

describe('Reset tempo on the Tempo dial', () => {
  it.live('shows at every stop but 100 %, with Sound on and with Sound off', () =>
    Effect.sync(() => {
      using page = mount(100);
      const seen = [true, false].flatMap((sound) => {
        page.setSound(sound);
        return STOPS.map((stop) => {
          page.setTempo(stop);
          return { sound, stop, shown: page.shown() };
        });
      });
      page.setSound(true);
      expect(seen).toEqual(
        [true, false].flatMap((sound) =>
          STOPS.map((stop) => ({ sound, stop, shown: stop !== 100 })),
        ),
      );
    }),
  );

  it.live(
    'a press at every stop but 100 % sets the hymn to 100 %, tells one reset cue and no detent, and the chip goes',
    () =>
      Effect.sync(() => {
        using page = mount(100);
        const pressed = STOPS.filter((stop) => stop !== 100).map((stop) => {
          page.setTempo(stop);
          page.cues.splice(0);
          page.reset();
          return {
            stop,
            tempo: page.tempo(),
            said: page.said(),
            cues: [...page.cues],
            shown: page.shown(),
          };
        });
        expect(pressed).toEqual(
          STOPS.filter((stop) => stop !== 100).map((stop) => ({
            stop,
            tempo: 100,
            said: '100%',
            cues: [plain('reset')],
            shown: false,
          })),
        );
      }),
  );

  it.live('resets the held hymn alone: hymn 76 keeps its own tempo', () =>
    Effect.sync(() => {
      using page = mount(100);
      page.setTempo(120, 76);
      page.setTempo(110);
      page.reset();
      expect({ held: page.tempo(), other: page.tempo(76) }).toEqual({ held: 100, other: 120 });
    }),
  );

  it.live('sets the dial back after four taps set it: hymn 76 from 125 % to 100 %', () =>
    Effect.gen(function* () {
      using page = mount(76);
      yield* page.taps(4, 600);
      const tapped = { tempo: page.tempo(), shown: page.shown() };
      page.reset();
      expect({
        tapped,
        tempo: page.tempo(),
        said: page.said(),
        readOut: page.readOut(),
        shown: page.shown(),
      }).toEqual({
        tapped: { tempo: 125, shown: true },
        tempo: 100,
        said: '100%',
        readOut: 'quarter note = 80',
        shown: false,
      });
    }),
  );

  it.live('is a button whose words name 100 %', () =>
    Effect.sync(() => {
      using page = mount(100);
      page.setTempo(90);
      const chip = page.chip();
      expect({ role: chip.role, names: chip.words.includes('100%') }).toEqual({
        role: 'button',
        names: true,
      });
    }),
  );

  it.live(
    'shows on a hymn whose timing does not decode, and a press sets it to 100 % and goes',
    () =>
      Effect.sync(() => {
        using page = mount(NO_TIMING);
        const home = { shown: page.shown(), beat: page.beat() };
        page.setTempo(120);
        const away = { said: page.said(), shown: page.shown(), beat: page.beat() };
        page.cues.splice(0);
        page.reset();
        expect({
          decodes: Option.isSome(book.of(NO_TIMING)),
          home,
          away,
          pressed: {
            tempo: page.tempo(),
            said: page.said(),
            cues: [...page.cues],
            shown: page.shown(),
            beat: page.beat(),
          },
        }).toEqual({
          decodes: false,
          home: { shown: false, beat: { readOut: false, tap: false } },
          away: { said: '120%', shown: true, beat: { readOut: false, tap: false } },
          pressed: {
            tempo: 100,
            said: '100%',
            cues: [plain('reset')],
            shown: false,
            beat: { readOut: false, tap: false },
          },
        });
      }),
  );

  it.live(
    'turns the dial home on the reset’s turn, whether the timing decodes or not: hymn 100 from 150 %, hymn 696 from 50 %',
    () =>
      Effect.sync(() => {
        const from = [
          { number: 100, stop: 150 },
          { number: NO_TIMING, stop: 50 },
        ];
        const turns = from.map(({ number, stop }) => {
          using page = mount(number);
          page.setTempo(stop);
          const frames = framesAfter(page.reset);
          return { number, stop, frames, said: page.said() };
        });
        expect(turns).toEqual(
          from.map(({ number, stop }) => ({
            number,
            stop,
            frames: Math.ceil(RESET_TURN / FRAME),
            said: '100%',
          })),
        );
      }),
  );
});
