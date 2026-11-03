/* oxlint-disable effect/noTernary -- the mount wraps the dial in the tap clock only for the cases that tap, and one plain branch says so. */

/**
 * Acceptance (taptempo A2): the Tempo dial's bpm read-out and its `Tap`
 * button, mounted in a browser's document (`src/test/setup.ts`) over a fresh
 * registry, every cue told to the test, the taps' times read from a
 * TestClock the test moves: no real time passes, and nothing sounds.
 *
 * - The read-out says the hymn's beat and its bpm at the dial's tempo, as
 *   one label (`quarter note = 90`), its text `= <bpm>`.
 * - Four presses 600 ms apart set the dial to the stop nearest the tapped
 *   bpm over the hymn's; three set nothing, and a pause over 3 s starts the
 *   count over.
 * - Each press tells one `press` cue; the dial moved by the taps tells no
 *   detent.
 *
 * Each case sets the hymn's tempo to 100 first and back after. Hymn numbers
 * only: no hymn's words are read or printed.
 *
 * Final path: `apps/hymnal/src/player/TempoDial.tap.test.tsx`.
 */

import { RegistryContext } from '@effect/atom-react';
import { describe, expect, it } from 'effect-bun-test';
import { Duration, Effect, Option } from 'effect';
import * as AtomRegistry from 'effect/reactivity/AtomRegistry';
import { TestClock } from 'effect/testing';
import { act } from 'react';
import { createRoot } from 'react-dom/client';

import { type Cue, CueProvider, plain } from '~/feel/cue';
import { settings } from '~/store';

import * as Dial from './TempoDial';

/**
 * Hymn `number`'s Tempo dial at 100 %, mounted; under the tap clock when
 * `tapping`. It sets the tempo back to 100 and unmounts when the `using` ends.
 */
const mount = (number: number, tapping: boolean) => {
  const registry = AtomRegistry.make();
  registry.set(settings.tempo(number), 100);
  const clock = Effect.runSync(Effect.scoped(TestClock.make()));
  const cues: Array<Cue> = [];
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const dial = (
    <CueProvider value={(cue) => void cues.push(cue)}>
      <Dial.TempoDial number={number} />
    </CueProvider>
  );
  act(() =>
    root.render(
      <RegistryContext value={registry}>
        {tapping ? <Dial.TapClock value={clock}>{dial}</Dial.TapClock> : dial}
      </RegistryContext>,
    ),
  );
  const get = (selector: string) =>
    Option.getOrThrow(Option.fromNullishOr(host.querySelector(selector)));
  /** One press on `Tap`, as a finger's tap reaches it on the web. */
  const tap = () =>
    act(() => {
      get('[aria-label="Tap"]').dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }),
      );
    });
  /** The tap clock moved on `ms`, with React told of what was set as it moved. */
  const wait = (ms: number) =>
    Effect.promise(() => act(() => Effect.runPromise(clock.adjust(Duration.millis(ms)))));
  return {
    cues,
    /** The kept tempo of the hymn. */
    tempo: () => registry.get(settings.tempo(number)),
    /** The hymn's tempo written as the dial or another screen writes it. */
    setTempo: (tempo: number) => act(() => registry.set(settings.tempo(number), tempo)),
    /** The read-out's one label, and its drawn text. */
    readOut: () => {
      const element = get('[data-testid="tempo-bpm"]');
      return { label: element.getAttribute('aria-label'), text: element.textContent ?? '' };
    },
    /** What the dial says of its tempo. */
    said: () => get('[data-testid="dial-tempo"]').getAttribute('aria-valuetext'),
    wait,
    /** `count` presses on `Tap`, `apart` ms between each, the first at once. */
    taps: (count: number, apart: number) =>
      Effect.gen(function* () {
        for (let n = 0; n < count; n++) {
          if (n > 0) yield* wait(apart);
          tap();
        }
      }),
    [Symbol.dispose]: () => {
      act(() => registry.set(settings.tempo(number), 100));
      act(() => root.unmount());
      host.remove();
      registry.dispose();
    },
  };
};

describe('the Tempo dial’s bpm read-out', () => {
  it.live(
    'says hymn 100’s quarter note at the dial’s tempo: 90 at 100 %, 45 at 50 %, 99 at 110 %, 135 at 150 %',
    () =>
      Effect.sync(() => {
        using page = mount(100, false);
        const read = (tempo: number, bpm: number) => {
          page.setTempo(tempo);
          const { label, text } = page.readOut();
          return { tempo, label, drawn: text.includes(`= ${bpm}`) };
        };
        expect([read(100, 90), read(50, 45), read(110, 99), read(150, 135)]).toEqual([
          { tempo: 100, label: 'quarter note = 90', drawn: true },
          { tempo: 50, label: 'quarter note = 45', drawn: true },
          { tempo: 110, label: 'quarter note = 99', drawn: true },
          { tempo: 150, label: 'quarter note = 135', drawn: true },
        ]);
      }),
  );

  for (const { number, label, bpm } of [
    { number: 33, label: 'dotted quarter note = 54', bpm: 54 },
    { number: 46, label: 'half note = 80', bpm: 80 },
    { number: 101, label: 'quarter note = 72', bpm: 72 },
  ])
    it.live(`says hymn ${number}’s beat at 100 %: ${label}`, () =>
      Effect.sync(() => {
        using page = mount(number, false);
        const readOut = page.readOut();
        expect({ label: readOut.label, drawn: readOut.text.includes(`= ${bpm}`) }).toEqual({
          label,
          drawn: true,
        });
      }),
    );
});

describe('Tap on the Tempo dial', () => {
  for (const { number, tempo, label } of [
    { number: 76, tempo: 125, label: 'quarter note = 100' },
    { number: 100, tempo: 110, label: 'quarter note = 99' },
  ])
    it.live(
      `four presses 600 ms apart set hymn ${number} to ${tempo} %, the read-out ${label}`,
      () =>
        Effect.gen(function* () {
          using page = mount(number, true);
          yield* page.taps(4, 600);
          expect({ tempo: page.tempo(), said: page.said(), label: page.readOut().label }).toEqual({
            tempo,
            said: `${tempo}%`,
            label,
          });
        }),
    );

  it.live('three presses set nothing', () =>
    Effect.gen(function* () {
      using page = mount(76, true);
      yield* page.taps(3, 600);
      expect({ tempo: page.tempo(), said: page.said() }).toEqual({ tempo: 100, said: '100%' });
    }),
  );

  it.live(
    'a pause over 3 s starts the count over: three, a 3001 ms pause and one set nothing; three more set it',
    () =>
      Effect.gen(function* () {
        using page = mount(76, true);
        yield* page.taps(3, 600);
        yield* page.wait(3001);
        yield* page.taps(1, 600);
        const afterPause = page.tempo();
        yield* page.wait(600);
        yield* page.taps(2, 600);
        const atThree = page.tempo();
        yield* page.wait(600);
        yield* page.taps(1, 600);
        expect({ afterPause, atThree, atFour: page.tempo(), said: page.said() }).toEqual({
          afterPause: 100,
          atThree: 100,
          atFour: 125,
          said: '125%',
        });
      }),
  );

  it.live('tells one press cue for each press, and the dial it moves tells no detent', () =>
    Effect.gen(function* () {
      using page = mount(76, true);
      yield* page.taps(4, 600);
      expect({ tempo: page.tempo(), cues: page.cues }).toEqual({
        tempo: 125,
        cues: [plain('press'), plain('press'), plain('press'), plain('press')],
      });
    }),
  );
});
