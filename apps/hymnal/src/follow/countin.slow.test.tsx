import { describe, expect, it, spyOn } from 'bun:test';
import { RegistryContext } from '@effect/atom-react';
import { Array as Arr, Duration, Effect, Option } from 'effect';
import * as Atom from 'effect/reactivity/Atom';
import * as AtomRegistry from 'effect/reactivity/AtomRegistry';
import { act, type ReactNode } from 'react';
import { AccessibilityInfo } from 'react-native';
import { createRoot } from 'react-dom/client';

import { bodyOf, type Haptic, type SoundName } from '~/feel/body';
import { type Cue, CueProvider } from '~/feel/cue';
import { feelOver } from '~/feel/feel';
import { hymnAt } from '~/hymns/hymns';
import { PlayerContext } from '~/player/context';
import { type Beat, countInOf } from '~/player/countin';
import { FullPlayer } from '~/player/FullPlayer';
import { useShowsPage } from '~/player/page';
import { Player, playerOn, type Track } from '~/player/player';
import { ALL } from '~/player/stanzas';
import { HymnPage } from '~/reader/HymnPage';
import { settings } from '~/store';
import { fakeDevice } from '~/test/device';
import { params } from '~/test/one';
import { propsWith } from '~/test/props';
import { readerOn } from '~/test/reader';

import { book } from './book';
import type { Timeline } from './timeline';

const ACCENT = 'var(--accent)';

const timelineOf = (number: number): Timeline => Option.getOrThrow(book.of(number));

const trackOf = (number: number): Track => ({
  number,
  title: Option.getOrThrow(hymnAt(String(number))).title,
});

const lowestOfEachMeter = () => {
  const seen = new Set<string>();
  return Arr.filter(Arr.range(1, 695), (number) =>
    Option.match(book.of(number), {
      onNone: () => false,
      onSome: ({ tempo }) => {
        const meter = `${tempo.numerator}/${tempo.denominator}`;
        if (seen.has(meter)) return false;
        seen.add(meter);
        return true;
      },
    }),
  );
};

const within = (el: Element) => [el, ...el.querySelectorAll('*')];

const styleOf = (el: Element) => Option.liftPredicate(el, (it) => it instanceof HTMLElement);

const lit = (el: Element) =>
  within(el).some((it) =>
    Option.match(styleOf(it), {
      onNone: () => false,
      onSome: (html) =>
        html.style.backgroundColor === ACCENT || getComputedStyle(html).backgroundColor === ACCENT,
    }),
  );

const scaled = (el: Element) =>
  within(el).some((it) =>
    Option.match(styleOf(it), {
      onNone: () => false,
      onSome: (html) =>
        `${html.style.transform} ${getComputedStyle(html).transform}`.includes('scale('),
    }),
  );

const settle = Effect.promise(() => act(() => Effect.runPromise(Effect.void)));

const mountPage = (number: number, click: boolean) => {
  const timeline = timelineOf(number);
  const hymn = Option.getOrThrow(hymnAt(String(number)));
  const track = trackOf(number);
  const state = Atom.make<Player>(Player.Idle());
  const countIn = Atom.make<Option.Option<Beat>>(Option.none());
  const player = { ...playerOn(fakeDevice().layer, Duration.millis(1)), state, countIn };
  const registry = AtomRegistry.make();
  registry.set(settings.stanzas(number), ALL);
  registry.set(settings.click, click);
  const told: Array<Cue> = [];
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  act(() =>
    root.render(
      <RegistryContext value={registry}>
        <CueProvider value={(cue) => told.push(cue)}>
          <PlayerContext value={Option.some(player)}>
            <HymnPage hymn={hymn} reader={readerOn(new Map())} />
          </PlayerContext>
        </CueProvider>
      </RegistryContext>,
    ),
  );
  const playingAtFirst = () =>
    Player.Playing({ track, at: timeline.first / 1000, length: Option.none<number>() });
  const beat = (index: number, of: number) =>
    act(() => {
      registry.set(state, playingAtFirst());
      registry.set(countIn, Option.some({ index, of }));
    });
  const done = () =>
    act(() => {
      registry.set(countIn, Option.none());
      registry.set(state, playingAtFirst());
    });
  const again = () => act(() => registry.set(state, playingAtFirst()));
  const lines = () => [...host.querySelectorAll<HTMLElement>('[data-testid="line"]')];
  const lineZero = () => Option.getOrThrow(Arr.get(lines(), 0));
  const selected = () =>
    lines().flatMap((line, k) =>
      Arr.filter([k], () => line.getAttribute('aria-selected') === 'true'),
    );
  const colours = (k: number) =>
    Option.match(Arr.get(lines(), k), {
      onNone: () => [],
      onSome: (line) => {
        const syllables = [...line.querySelectorAll<HTMLElement>('[data-testid^="syllable-"]')];
        if (syllables.length > 0) return syllables.map((el) => el.style.color);
        return [...line.querySelectorAll<HTMLElement>(':scope > *')].map((el) => el.style.color);
      },
    });
  const pulses = () => [...host.querySelectorAll<HTMLElement>('[data-testid="count-in"]')];
  const marks = (bar: Element) => [...bar.querySelectorAll('[data-testid="count-in-mark"]')];
  return {
    timeline,
    told,
    beat,
    done,
    again,
    lineZero,
    selected,
    colours,
    pulses,
    marks,
    [Symbol.dispose]: () => {
      act(() => root.unmount());
      host.remove();
      registry.set(settings.click, false);
      registry.dispose();
    },
  };
};

type Page = ReturnType<typeof mountPage>;

const pulseOf = (page: Page) => {
  const [shown, ...more] = page.pulses();
  expect(more).toEqual([]);
  return Option.getOrThrow(Option.fromNullishOr(shown));
};

const absoluteUnder = (el: Element, box: Element): boolean =>
  Option.match(
    Option.filter(Option.fromNullishOr(el.parentElement), () => el !== box),
    {
      onNone: () => false,
      onSome: (parent) =>
        getComputedStyle(el).position === 'absolute' || absoluteUnder(parent, box),
    },
  );

describe('the count-in pulse over line 0', () => {
  it('is the lowest hymn of each meter the bundle carries (the oracle)', () => {
    expect(lowestOfEachMeter()).toEqual([
      1, 2, 33, 44, 46, 49, 69, 96, 131, 343, 357, 373, 478, 532,
    ]);
    expect(countInOf(timelineOf(78).tempo).beats).toBe(3);
    expect(countInOf(timelineOf(116).tempo).beats).toBe(4);
  });

  it('marks each beat over line 0 of the lowest hymn of every meter, adds no height, keeps line 0 marked and unlit, and goes at None', () => {
    for (const number of lowestOfEachMeter()) {
      const n = countInOf(timelineOf(number).tempo).beats;
      using page = mountPage(number, false);
      expect(page.pulses()).toEqual([]);
      const box = Option.getOrThrow(Option.fromNullishOr(page.lineZero().parentElement));
      for (const index of Arr.range(0, n - 1)) {
        page.beat(index, n);
        const bar = pulseOf(page);
        const k = index + 1;
        expect({
          number,
          role: bar.getAttribute('role'),
          label: bar.getAttribute('aria-label'),
          text: bar.getAttribute('aria-valuetext'),
          live: Option.getOrElse(Option.fromNullishOr(bar.getAttribute('aria-live')), () => 'off'),
          lit: page.marks(bar).map(lit),
        }).toEqual({
          number,
          role: 'progressbar',
          label: 'Count-in',
          text: `Beat ${k} of ${n}`,
          live: 'off',
          lit: Arr.range(1, n).map((m) => m <= k),
        });
        const zero = page.lineZero();
        expect(zero.parentElement).toBe(box);
        expect(box.firstElementChild).toBe(zero);
        expect({
          inLine: zero.contains(bar),
          inBox: box.contains(bar),
          absolute: absoluteUnder(bar, box),
        }).toEqual({
          inLine: false,
          inBox: true,
          absolute: true,
        });
        expect(page.selected()).toEqual([0]);
        expect(page.colours(0)).not.toContain(ACCENT);
      }
      page.done();
      expect(page.pulses()).toEqual([]);
      expect(page.told).toEqual([]);
    }
  });
});

describe('the count-in pulse under Reduce Motion', () => {
  it('lights each mark with no scale while Reduce Motion is on', () =>
    Effect.runPromise(
      Effect.gen(function* () {
        // oxlint-disable-next-line effect/noModuleMocks -- the system's setting is React Native's own boundary, read by `useReduceMotion`; the spy stands in for the system and is put back as the test ends.
        using _reduced = spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
        using page = mountPage(116, false);
        yield* settle;
        for (const index of Arr.range(0, 3)) {
          page.beat(index, 4);
          yield* settle;
          const bar = pulseOf(page);
          expect(page.marks(bar).map(lit)).toEqual(Arr.range(1, 4).map((m) => m <= index + 1));
          expect(scaled(bar)).toBe(false);
        }
      }),
    ));

  it('pulses the newly lit mark by scale while Reduce Motion is off', () =>
    Effect.runPromise(
      Effect.gen(function* () {
        // oxlint-disable-next-line effect/noModuleMocks -- the system's setting is React Native's own boundary, read by `useReduceMotion`; the spy stands in for the system and is put back as the test ends.
        using _reduced = spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
        using page = mountPage(116, false);
        yield* settle;
        for (const index of Arr.range(0, 3)) {
          page.beat(index, 4);
          const mark = Option.getOrThrow(Arr.get(page.marks(pulseOf(page)), index));
          expect({ index, scaled: scaled(mark) }).toEqual({ index, scaled: true });
        }
      }),
    ));
});

describe('the click as data', () => {
  it('tells one beat cue for each new beat with Click on, the first the accent, never twice for one beat, nothing on mount', () => {
    for (const number of [78, 116, 131]) {
      const n = countInOf(timelineOf(number).tempo).beats;
      using page = mountPage(number, true);
      expect(page.told).toEqual([]);
      for (const round of [1, 2]) {
        for (const index of Arr.range(0, n - 1)) {
          const before = page.told.length;
          page.beat(index, n);
          page.beat(index, n);
          page.again();
          expect({ number, round, index, told: page.told.slice(before) }).toEqual({
            number,
            round,
            index,
            told: [{ _tag: 'beat', accent: index === 0 }],
          });
        }
        const before = page.told.length;
        page.done();
        page.again();
        expect(page.told.slice(before)).toEqual([]);
      }
      expect(page.told).toHaveLength(2 * n);
    }
  });

  it('tells nothing with Click off', () => {
    using page = mountPage(116, false);
    for (const index of Arr.range(0, 3)) page.beat(index, 4);
    page.done();
    expect(page.told).toEqual([]);
  });

  it('is the thock with an impact haptic, medium on the accent and light after', () => {
    const styles: ReadonlyArray<{ readonly accent: boolean; readonly style: 'medium' | 'light' }> =
      [
        { accent: true, style: 'medium' },
        { accent: false, style: 'light' },
      ];
    for (const { accent, style } of styles) {
      const body = bodyOf({ _tag: 'beat', accent });
      expect({
        accent,
        haptic: body.haptic,
        sound: Option.getOrElse(body.sound, () => 'none'),
      }).toEqual({ accent, haptic: { _tag: 'impact', style }, sound: 'thock' });
    }
  });

  it('plays neither port while Sounds and haptics is off, and the haptic and the thock once each while on', () => {
    for (const on of [false, true]) {
      for (const accent of [true, false]) {
        const haptics: Array<Haptic> = [];
        const sounds: Array<SoundName> = [];
        let now = 0;
        const tell = feelOver({
          haptics: { play: (haptic) => haptics.push(haptic) },
          sound: { play: (sound) => sounds.push(sound), length: () => 42 },
          on: () => on,
          now: () => (now += 1000),
        });
        tell({ _tag: 'beat', accent });
        expect({ on, accent, haptics: haptics.length, sounds }).toEqual({
          on,
          accent,
          haptics: Arr.filter([1], () => on).length,
          sounds: Arr.filter<SoundName>(['thock'], () => on),
        });
      }
    }
  });
});

function Shows({ track }: { readonly track: Track }) {
  useShowsPage(track);
  return <></>;
}

const mountSheet = (number: number) => {
  const track = trackOf(number);
  params['hymn'] = String(number);
  const player = playerOn(fakeDevice().layer, Duration.millis(1));
  const registry = AtomRegistry.make();
  registry.set(settings.stanzas(number), ALL);
  registry.set(settings.intro, true);
  registry.set(settings.click, false);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const screen: ReactNode = (
    <>
      <Shows track={track} />
      <FullPlayer />
    </>
  );
  act(() =>
    root.render(
      <RegistryContext value={registry}>
        <PlayerContext value={Option.some(player)}>{screen}</PlayerContext>
      </RegistryContext>,
    ),
  );
  const find = (selector: string) =>
    Option.getOrThrow(Option.fromNullishOr(host.querySelector(selector)));
  const input = (selector: string) =>
    Option.getOrThrow(
      Option.liftPredicate(
        find(selector),
        (it): it is HTMLInputElement => it instanceof HTMLInputElement,
      ),
    );
  return {
    registry,
    find,
    group: () => find('[role="group"][aria-label="Start"]'),
    intro: () => input('[role="group"][aria-label="Start"] [role="switch"][aria-label="Intro"]'),
    click: () => input('[role="group"][aria-label="Start"] [role="switch"][aria-label="Click"]'),
    tap: (el: HTMLInputElement) => act(() => el.click()),
    [Symbol.dispose]: () => {
      act(() => root.unmount());
      host.remove();
      registry.set(settings.intro, true);
      registry.set(settings.click, false);
      registry.dispose();
      delete params['hymn'];
    },
  };
};

const before = (first: Element, second: Element) =>
  Boolean(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING);

describe('the sheet’s Start group', () => {
  it('stands after the stanzas and before the Chords switch on hymn 78, Intro on and Click off, and keeps Click while Intro is off', () => {
    using sheet = mountSheet(78);
    const stanzas = sheet.find('[data-testid="stanzas"]');
    const chords = sheet.find('[aria-label="Chord settings"] [aria-label="Chords"]');
    const read = () => ({
      intro: sheet.intro().checked,
      click: sheet.click().checked,
      clickDisabled: sheet.click().disabled,
      settings: {
        intro: sheet.registry.get(settings.intro),
        click: sheet.registry.get(settings.click),
      },
    });
    expect({
      afterStanzas: before(stanzas, sheet.group()),
      beforeChords: before(sheet.group(), chords),
      introFirst: before(sheet.intro(), sheet.click()),
    }).toEqual({ afterStanzas: true, beforeChords: true, introFirst: true });
    expect(read()).toEqual({
      intro: true,
      click: false,
      clickDisabled: false,
      settings: { intro: true, click: false },
    });

    sheet.tap(sheet.click());
    expect(read()).toEqual({
      intro: true,
      click: true,
      clickDisabled: false,
      settings: { intro: true, click: true },
    });

    sheet.tap(sheet.intro());
    expect(read()).toEqual({
      intro: false,
      click: true,
      clickDisabled: true,
      settings: { intro: false, click: true },
    });

    sheet.tap(sheet.intro());
    expect(read()).toEqual({
      intro: true,
      click: true,
      clickDisabled: false,
      settings: { intro: true, click: true },
    });

    sheet.tap(sheet.click());
    expect(read()).toEqual({
      intro: true,
      click: false,
      clickDisabled: false,
      settings: { intro: true, click: false },
    });
  });

  it('is found by its id, and Click reads disabled to assistive tech only while Intro is off', () => {
    using sheet = mountSheet(78);
    const disabledClick = () =>
      [...sheet.group().querySelectorAll('[aria-disabled="true"]')].some((el) =>
        el.contains(sheet.click()),
      );
    expect({
      id: sheet.group().getAttribute('data-testid'),
      disabledClick: disabledClick(),
    }).toEqual({ id: 'start', disabledClick: false });

    sheet.tap(sheet.intro());
    expect({ intro: sheet.intro().checked, disabledClick: disabledClick() }).toEqual({
      intro: false,
      disabledClick: true,
    });

    sheet.tap(sheet.intro());
    expect({ intro: sheet.intro().checked, disabledClick: disabledClick() }).toEqual({
      intro: true,
      disabledClick: false,
    });
  });

  it('gives Click the accessibility state VoiceOver reads on iOS: disabled only while Intro is off', () => {
    using sheet = mountSheet(78);
    const state = () => propsWith(sheet.click(), 'accessibilityState')['accessibilityState'];
    const on = state();
    sheet.tap(sheet.intro());
    const off = state();
    sheet.tap(sheet.intro());
    expect({ on, off, onAgain: state() }).toEqual({
      on: expect.not.objectContaining({ disabled: true }),
      off: expect.objectContaining({ disabled: true }),
      onAgain: expect.not.objectContaining({ disabled: true }),
    });
  });
});
