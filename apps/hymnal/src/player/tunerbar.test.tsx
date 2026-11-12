/**
 * The bar's columns and the key button's wheel (owner, 2026-11-11: the
 * handle "exactly centred", and "long press opens a sort of radial menu we
 * can gesture"), mounted in a browser's document (`src/test/setup.ts`) over
 * a player whose device the test holds (`src/test/device.ts`) and a
 * reader's store the test holds (`src/test/reader.ts`).
 *
 * - R1 on its own hymn's page the bar is three columns, the key button's and
 *   the marks' each the wider one's width, so the grabber's centre is the
 *   bar's, for chords on and off, with and without the ear, and every face;
 * - R2 while another hymn sounds, the row keeps its own widths and draws
 *   every item;
 * - R3 a hold and a slide up opens the tuner, chords as they were;
 * - R4 a hold let go in the middle does nothing;
 * - R5 a hold slid to Chords off turns chords off;
 * - R6 with no ear there is no Tuner item and no `tuner` action;
 * - R7 the open dials hold no Tuner chip, and Reset still shows when moved;
 * - R8 VoiceOver's `tuner` opens the tuner, `keyUp` and `keyDown` move the key a semitone;
 * - R9 the item under the finger draws on the button's fill under its ink,
 *   the others on the panel under the ink in the edge;
 * - R10 while the wheel is up the page dims, no dot marks its origin, `Key`
 *   is ringed, the bar's other controls fade and the find bar is told
 *   (`wheelOpen`), and all of it ends as the wheel shuts;
 * - R11 the items come out of `Key`: at the hold at its centre, small and
 *   unseen, and at their slots once the enter lands;
 * - R12 a release keeps the wheel drawn through its exit, then it is gone,
 *   and a pick acts at the release, not after the exit;
 * - R13 with Reduce Motion each item stands at its slot from the first frame and only fades;
 * - R14 without the ear the four items keep the slots they hold with it.
 *
 * The moves go to each item's slot from the wheel's origin, `ORIGIN_X`
 * from the screen's left edge on the key button's middle (`wheel.ts`).
 *
 * A layout is told as the platform tells it, through each view's `onLayout`
 * (`src/test/props.ts`); a hold is played through its gesture's own
 * callbacks (`src/test/gesture.tsx`), the stand-in's hold being the
 * handler's own 350 ms. Hymn numbers only: no hymn's words are read.
 */

import { RegistryContext } from '@effect/atom-react';
import { describe, expect, it, spyOn } from 'bun:test';
import { Duration, Effect, Option, Stream } from 'effect';
import * as AtomRegistry from 'effect/reactivity/AtomRegistry';
import { act, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { AccessibilityInfo } from 'react-native';

import { type Cue, CueProvider, plain } from '~/feel/cue';
import { hymnAt } from '~/hymns/hymns';
import { Shown } from '~/reader/screen';

import { fakeDevice } from '../test/device';
import { longPress } from '../test/gesture';
import { routed } from '../test/one';
import { actionsOf, perform, propsWith } from '../test/props';
import { holdAnimations, landAnimations, stepAnimations } from '../test/reanimated';
import { readerOn } from '../test/reader';
import { wheelOpen } from './bar';
import { PlayerContext } from './context';
import { ChordReaderContext } from './Dials';
import { Ear } from './KeyWheel';
import { Command, Player, playerOn } from './player';
import { PageBar, PlayerBar } from './PlayerBar';
import { type Item, itemsOf, ORIGIN_X, slotOf } from './wheel';

const morning = Option.getOrThrow(hymnAt('100'));
const other = Option.getOrThrow(hymnAt('225'));

/** The bar's width on a 393-point phone, and its padding at each side. */
const WIDTH = 393;

interface Mounted {
  readonly registry: AtomRegistry.AtomRegistry;
  readonly device: Map<string, string>;
  readonly cues: Array<Cue>;
  readonly get: (selector: string) => HTMLElement;
  readonly find: (selector: string) => Option.Option<HTMLElement>;
  readonly start: (track: typeof morning) => Effect.Effect<void>;
  readonly [Symbol.dispose]: () => void;
}

/** `screen` over a fresh player, the reader's store `device` and the ear `ear`, mounted; it unmounts when the `using` ends. */
const mount = (screen: ReactNode, device: Map<string, string>, ear: boolean): Mounted => {
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
const onPage = (device: Map<string, string>, ear: boolean) =>
  mount(<PageBar track={morning} />, device, ear);

const chordsOn = (move?: { readonly transpose: number; readonly capo: number }) =>
  new Map([
    ['chords', 'true'],
    ...((move && [[`move.100`, `{"transpose":${move.transpose},"capo":${move.capo}}`] as const]) ||
      []),
  ]);

const keyButton = (page: Mounted) => page.get('[role="button"][aria-label="Key"]');

/** The view at `selector` laid out at `layout`, as the platform tells it. */
const layOut = (page: Mounted, selector: string, layout: Record<string, number>) =>
  act(() =>
    (
      propsWith(page.get(selector), 'onLayout')['onLayout'] as (event: {
        readonly nativeEvent: { readonly layout: Record<string, number> };
      }) => void
    )({ nativeEvent: { layout: { x: 0, y: 0, height: 44, ...layout } } }),
  );

const px = (element: HTMLElement, property: string) =>
  Number.parseFloat(getComputedStyle(element).getPropertyValue(property) || '0');

/** The grabber's centre from the bar's left edge, as the row's padding, gap and side columns place the opener between them. */
const grabberCentre = (page: Mounted) => {
  const left = page.get('[data-testid="bar-side-key"]');
  const right = page.get('[data-testid="bar-side-marks"]');
  const row = Option.getOrThrow(Option.fromNullishOr(left.parentElement));
  const gap = px(row, 'column-gap') || px(row, 'gap');
  const from = px(row, 'padding-left') + px(left, 'width') + gap;
  const to = WIDTH - px(row, 'padding-right') - px(right, 'width') - gap;
  return (from + to) / 2;
};

/** Where the hold lands in the key button, in its own points. */
const PRESS = { x: 90, y: 22 } as const;

/** The wheel's origin in the key button's points: `ORIGIN_X` from the screen's edge, the button at the bar's 12-point padding, on its middle. */
const ORIGIN = { x: ORIGIN_X - 12, y: 22 } as const;

/** A hold on the key button at its middle, the finger kept there; the stand-in's hold is the handler's own time. */
const hold = () => {
  let held = Option.none<ReturnType<typeof longPress>>();
  act(() => void (held = Option.some(longPress('key-hold', PRESS))));
  return {
    move: (dx: number, dy: number) => act(() => Option.map(held, (finger) => finger.move(dx, dy))),
    lift: () => act(() => Option.map(held, (finger) => finger.lift())),
  };
};

/** The finger's move from where the hold landed to `item`'s slot. */
const toSlot = (item: Item) =>
  [ORIGIN.x + slotOf(item).x - PRESS.x, ORIGIN.y + slotOf(item).y - PRESS.y] as const;

/** A view's drawn translate, scale and opacity, as its style writes them. */
const drawnAt = (view: HTMLElement) => {
  const style = getComputedStyle(view);
  const number = (pattern: RegExp, otherwise: number) =>
    Number.parseFloat(pattern.exec(style.transform)?.[1] ?? `${otherwise}`);
  return {
    x: number(/translateX\((-?[\d.e+-]+)px\)/, 0),
    y: number(/translateY\((-?[\d.e+-]+)px\)/, 0),
    scale: number(/scale\((-?[\d.e+-]+)\)/, 1),
    opacity: Number.parseFloat(style.opacity || '1'),
  };
};

/** Each item's place on the wheel as drawn. */
const places = (page: Mounted, items: ReadonlyArray<Item>) =>
  items.map((item) => ({ item, ...drawnAt(page.get(`[data-testid="key-wheel-place-${item}"]`)) }));

/** Animations held until the `using` ends, then landed. */
const animationsHeld = () => {
  holdAnimations();
  return { [Symbol.dispose]: () => act(() => landAnimations()) };
};

describe('R1: the bar’s sides', () => {
  const faces = [
    { face: 'KEYF', move: { transpose: 4, capo: 0 }, key: 72, marks: 96 },
    { face: 'CAPO 2D', move: { transpose: 3, capo: 2 }, key: 86, marks: 60 },
    { face: 'KEYF#', move: { transpose: 5, capo: 0 }, key: 78, marks: 96 },
  ];
  for (const ear of [true, false]) {
    for (const { face, move, key, marks } of faces) {
      it(`${face}, ear ${ear}: the sides are one width, and the grabber is centred`, () => {
        using page = onPage(chordsOn(move), ear);
        expect(keyButton(page).textContent).toBe(face);
        layOut(page, '[data-testid="bar-side-key"]', { x: 12, y: 6, width: key });
        layOut(page, '[data-testid="key-button"]', { width: key });
        layOut(page, '[data-testid="bar-marks"]', { width: marks });
        const widths = ['bar-side-key', 'bar-side-marks'].map((id) =>
          px(page.get(`[data-testid="${id}"]`), 'width'),
        );
        const wider = Math.max(key, marks);
        expect(widths).toEqual([wider, wider]);
        expect(Math.abs(grabberCentre(page) - WIDTH / 2)).toBeLessThanOrEqual(0.5);
        expect(Option.isSome(page.find('[data-testid="bar-grabber"]'))).toBe(true);
      });
    }
    it(`chords off, ear ${ear}: the sides are one width, and the grabber is centred`, () => {
      using page = onPage(new Map(), ear);
      layOut(page, '[data-testid="key-button"]', { width: 44 });
      layOut(page, '[data-testid="bar-marks"]', { width: 96 });
      expect(Math.abs(grabberCentre(page) - WIDTH / 2)).toBeLessThanOrEqual(0.5);
      expect(px(page.get('[data-testid="bar-side-key"]'), 'width')).toBe(96);
    });
  }
});

describe('R2: another hymn sounding over the page', () => {
  it('keeps the row’s own widths and draws every item, the title unsqueezed', () =>
    Effect.runPromise(
      Effect.gen(function* () {
        using page = mount(
          <>
            <Shown hymn={morning} />
            <PlayerBar />
          </>,
          chordsOn(),
          true,
        );
        yield* page.start(other);
        layOut(page, '[data-testid="key-button"]', { width: 72 });
        layOut(page, '[data-testid="bar-marks"]', { width: 180 });
        const bar = page.get('[aria-label="Player"]');
        expect(
          [...bar.querySelectorAll('[role="button"]')].map((b) => b.getAttribute('aria-label')),
        ).toEqual(['Key', 'Open player', 'Play hymn 100', 'Sound']);
        expect(Option.isSome(page.find('[data-testid="bar-marks"] [aria-label$="hymn 225"]'))).toBe(
          true,
        );
        expect(bar.textContent).toContain('225');
        expect(getComputedStyle(page.get('[data-testid="bar-side-key"]')).width).not.toBe('180px');
        expect(Option.isNone(page.find('[data-testid="bar-grabber"]'))).toBe(true);
      }),
    ));
});

describe('the key button’s wheel', () => {
  it('R3: a hold slid up opens the tuner once, chords as they were, with a tick on the Tuner', () => {
    using page = onPage(chordsOn(), true);
    const held = hold();
    expect(Option.isSome(page.find('[data-testid="key-wheel"]'))).toBe(true);
    held.move(...toSlot('tuner'));
    held.lift();
    expect(routed).toEqual(['push /tuner']);
    expect(page.device.get('chords')).toBe('true');
    expect(page.cues).toEqual([plain('choose')]);
    expect(Option.isNone(page.find('[data-testid="key-wheel"]'))).toBe(true);
  });

  it('R4: a hold let go in the middle does nothing, the dials as they were', () => {
    using page = onPage(chordsOn(), true);
    act(() => keyButton(page).click());
    expect(Option.isSome(page.find('[data-testid="dials"]'))).toBe(true);
    const before = { key: keyButton(page).getAttribute('aria-valuetext'), cues: page.cues.length };
    const held = hold();
    held.move(6, -8);
    held.lift();
    expect({
      routed: [...routed],
      chords: page.device.get('chords'),
      dials: Option.isSome(page.find('[data-testid="dials"]')),
      key: keyButton(page).getAttribute('aria-valuetext'),
      cues: page.cues.length,
    }).toEqual({ routed: [], chords: 'true', dials: true, ...before });
  });

  describe('a key step from the wheel or VoiceOver turns one semitone with the dials closed', () => {
    const steps = [
      { item: 'keyDown', key: 'C' },
      { item: 'keyUp', key: 'D' },
    ] as const;
    const doors = (open: boolean) => (open && (['wheel', 'VoiceOver'] as const)) || ['wheel'];
    for (const open of [true, false]) {
      for (const { item, key } of steps) {
        for (const door of doors(open)) {
          it(`${item} by the ${door}, the dials ${(open && 'open') || 'shut'} before`, () => {
            using page = onPage(chordsOn(), true);
            if (open) act(() => keyButton(page).click());
            expect(Option.isSome(page.find('[data-testid="dials"]'))).toBe(open);
            if (door === 'wheel') {
              const held = hold();
              held.move(...toSlot(item));
              held.lift();
            } else perform(keyButton(page), item);
            expect({
              key: keyButton(page).getAttribute('aria-valuetext'),
              dials: Option.isSome(page.find('[data-testid="dials"]')),
              expanded: keyButton(page).getAttribute('aria-expanded'),
              chords: page.device.get('chords'),
            }).toEqual({ key, dials: false, expanded: 'false', chords: 'true' });
          });
        }
      }
    }
    it('a hold let go in the middle keeps the dials shut (R4 keeps them open)', () => {
      using page = onPage(chordsOn(), true);
      const held = hold();
      held.move(4, -6);
      held.lift();
      expect({
        key: keyButton(page).getAttribute('aria-valuetext'),
        dials: Option.isSome(page.find('[data-testid="dials"]')),
      }).toEqual({ key: 'Db', dials: false });
    });
  });

  it('R5: a hold slid to Chords off turns chords off, as the old hold did', () => {
    using page = onPage(chordsOn(), true);
    const held = hold();
    held.move(...toSlot('chords'));
    held.lift();
    expect(page.device.get('chords')).toBe('false');
    expect(page.cues).toEqual([plain('choose'), plain('chords-off')]);
  });

  it('a hold with chords off turns them on and opens no wheel', () => {
    using page = onPage(new Map(), true);
    hold().lift();
    expect({
      chords: page.device.get('chords'),
      wheel: Option.isSome(page.find('[data-testid="key-wheel"]')),
    }).toEqual({ chords: 'true', wheel: false });
  });

  it('R6: with no ear there is no Tuner item and no tuner action', () => {
    using page = onPage(chordsOn(), false);
    expect(actionsOf(keyButton(page)).map((action) => action.name)).toEqual([
      'keyDown',
      'keyUp',
      'reset',
      'chords',
    ]);
    const held = hold();
    expect({
      wheel: Option.isSome(page.find('[data-testid="key-wheel"]')),
      tuner: Option.isSome(page.find('[data-testid="key-wheel-tuner"]')),
    }).toEqual({ wheel: true, tuner: false });
    held.lift();
  });

  it('R7: the open dials hold no Tuner chip, and Reset shows once moved', () => {
    using page = onPage(chordsOn(), true);
    act(() => keyButton(page).click());
    expect(Option.isNone(page.find('[data-testid="dials-tuner"]'))).toBe(true);
    perform(page.get('[role="slider"][aria-label="Capo"]'), 'increment');
    expect(Option.isSome(page.find('[data-testid="dials-reset"]'))).toBe(true);
    expect(Option.isNone(page.find('[data-testid="dials-tuner"]'))).toBe(true);
  });

  it('R8: VoiceOver opens the tuner and moves the key a semitone each way', () => {
    using page = onPage(chordsOn(), true);
    expect(actionsOf(keyButton(page))).toEqual([
      { name: 'tuner', label: 'Open tuner' },
      { name: 'keyDown', label: 'Key down' },
      { name: 'keyUp', label: 'Key up' },
      { name: 'reset', label: 'Reset key' },
      { name: 'chords', label: 'Turn chords off' },
    ]);
    perform(keyButton(page), 'keyUp');
    expect(keyButton(page).getAttribute('aria-valuetext')).toBe('D');
    perform(keyButton(page), 'keyDown');
    perform(keyButton(page), 'keyDown');
    expect(keyButton(page).getAttribute('aria-valuetext')).toBe('C');
    perform(keyButton(page), 'reset');
    expect(keyButton(page).getAttribute('aria-valuetext')).toBe('Db');
    perform(keyButton(page), 'tuner');
    expect(routed).toEqual(['push /tuner']);
  });

  it('R9: the item under the finger is on the button’s fill under its ink, the others on the panel', () => {
    const roles = ['button', 'onButton', 'panel', 'ink', 'edge'];
    const sheet = document.createElement('style');
    sheet.textContent = `:root { ${roles.map((role, k) => `--${role}: rgb(${k + 1}, 3, 4);`).join(' ')} }`;
    document.head.append(sheet);
    using _sheet = { [Symbol.dispose]: () => sheet.remove() };
    const role = (name: string) => `rgb(${roles.indexOf(name) + 1}, 3, 4)`;
    using page = onPage(chordsOn(), true);
    const held = hold();
    held.move(...toSlot('keyUp'));
    const drawn = (item: string) => {
      const pill = page.get(`[data-testid="key-wheel-${item}"]`);
      const word = Option.getOrThrow(
        Option.fromNullishOr(pill.querySelector('[dir="auto"]') ?? pill.lastElementChild),
      );
      return {
        fill: getComputedStyle(pill).backgroundColor,
        ink: getComputedStyle(word).color,
        edge: getComputedStyle(pill).borderTopColor,
      };
    };
    expect(drawn('keyUp')).toEqual({
      fill: role('button'),
      ink: role('onButton'),
      edge: role('button'),
    });
    for (const item of ['tuner', 'keyDown', 'reset', 'chords'])
      expect({ item, ...drawn(item) }).toEqual({
        item,
        fill: role('panel'),
        ink: role('ink'),
        edge: role('edge'),
      });
    held.lift();
    expect(page.device.get('move.100')).toBe('{"transpose":1,"capo":0}');
  });

  it('the Tuner’s mark is small and upright: at most 14 points tall, no wider than tall, nothing turned', () => {
    using page = onPage(chordsOn(), true);
    const held = hold();
    expect({
      wheel: Option.isSome(page.find('[data-testid="key-wheel"]')),
      tuner: Option.isSome(page.find('[data-testid="key-wheel-tuner"]')),
      key: keyButton(page).getAttribute('aria-valuetext'),
    }).toEqual({ wheel: true, tuner: true, key: 'Db' });
    const mark = page.get('[data-testid="key-wheel-tuner"] [data-testid="mark-tuner"]');
    const turned = [mark, ...mark.querySelectorAll('*')].filter((part) =>
      /rotate/.test(getComputedStyle(part).transform),
    );
    expect({
      small: px(mark, 'height') <= 14,
      upright: px(mark, 'width') <= px(mark, 'height'),
      turned: turned.length,
    }).toEqual({ small: true, upright: true, turned: 0 });
    held.lift();
  });
});

/** Each item's place over the first five frames, 40 ms apart, of a hold of `Key` with the animations held. */
const reducedFrames = (page: Mounted) => {
  const items = itemsOf(true);
  using _held = animationsHeld();
  const finger = hold();
  const frames = [places(page, items)];
  for (let k = 0; k < 4; k += 1) {
    act(() => void stepAnimations(40));
    frames.push(places(page, items));
  }
  finger.lift();
  return frames;
};

describe('the wheel’s look and motion', () => {
  it('R10: the page dims, no dot marks the origin, Key is ringed, the marks fade and the find bar is told, until the wheel shuts', () => {
    using page = onPage(chordsOn(), true);
    const shown = () => ({
      backdrop: Option.isSome(page.find('[data-testid="key-wheel-backdrop"]')),
      hub: Option.isSome(page.find('[data-testid="key-wheel-hub"]')),
      ring: Option.isSome(page.find('[data-testid="key-ring"]')),
      faded:
        Number.parseFloat(getComputedStyle(page.get('[data-testid="bar-marks"]')).opacity || '1') <=
        0.35,
      told: page.registry.get(wheelOpen),
    });
    const finger = hold();
    const open = shown();
    finger.lift();
    expect({ open, shut: shown() }).toEqual({
      open: { backdrop: true, hub: false, ring: true, faded: true, told: true },
      shut: { backdrop: false, hub: false, ring: false, faded: false, told: false },
    });
  });

  it('R11: held at the hold, the items stand at the origin, small and unseen; landed, at their slots', () => {
    using page = onPage(chordsOn(), true);
    const items = itemsOf(true);
    using _held = animationsHeld();
    const finger = hold();
    for (const place of places(page, items))
      expect({ ...place, small: place.scale <= 0.4 }).toEqual({
        ...place,
        x: 0,
        y: 0,
        small: true,
        opacity: 0,
      });
    act(() => landAnimations());
    for (const place of places(page, items)) {
      const slot = slotOf(place.item);
      expect({
        item: place.item,
        off: Math.hypot(place.x - slot.x, place.y - slot.y) <= 0.5,
        whole: Math.abs(place.scale - 1) <= 0.01,
        opacity: place.opacity,
      }).toEqual({ item: place.item, off: true, whole: true, opacity: 1 });
    }
    finger.lift();
  });

  it('R12: a release keeps the wheel drawn through its exit, gone once it lands; a pick acts at the release', () => {
    using page = onPage(chordsOn(), true);
    using _held = animationsHeld();
    const opened = () => {
      const finger = hold();
      act(() => landAnimations());
      holdAnimations();
      return finger;
    };
    const middle = opened();
    middle.move(6, -8);
    middle.lift();
    const closing = {
      wheel: Option.isSome(page.find('[data-testid="key-wheel"]')),
      told: page.registry.get(wheelOpen),
    };
    act(() => void stepAnimations(16));
    const tuner = drawnAt(page.get('[data-testid="key-wheel-place-tuner"]'));
    act(() => landAnimations());
    const shut = {
      gone: Option.isNone(page.find('[data-testid="key-wheel"]')),
      told: page.registry.get(wheelOpen),
      routed: [...routed],
    };
    holdAnimations();
    const pick = opened();
    pick.move(...toSlot('tuner'));
    pick.lift();
    expect({
      closing,
      moving: Math.hypot(tuner.x, tuner.y) < Math.hypot(slotOf('tuner').x, slotOf('tuner').y),
      shut,
      picked: {
        routed: [...routed],
        closing: Option.isSome(page.find('[data-testid="key-wheel"]')),
        lit: page.get('[data-testid="key-wheel-tuner"]').getAttribute('aria-selected'),
      },
    }).toEqual({
      closing: { wheel: true, told: false },
      moving: true,
      shut: { gone: true, told: false, routed: [] },
      picked: { routed: ['push /tuner'], closing: true, lit: 'true' },
    });
  });

  it('R13: with Reduce Motion each item stands at its slot from the first frame, and only fades', () =>
    Effect.runPromise(
      Effect.gen(function* () {
        // oxlint-disable-next-line effect/noModuleMocks -- the system's setting is React Native's own boundary, read by `useReduceMotion`; the spy stands in for the system and is put back as the test ends.
        using _reduced = spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
        using page = onPage(chordsOn(), true);
        yield* Effect.promise(() => act(() => Effect.runPromise(Effect.void)));
        const frames = reducedFrames(page);
        for (const frame of frames)
          for (const place of frame) {
            const slot = slotOf(place.item);
            expect({
              item: place.item,
              off: Math.hypot(place.x - slot.x, place.y - slot.y) <= 0.01,
              scale: place.scale,
            }).toEqual({ item: place.item, off: true, scale: 1 });
          }
        expect(frames.map((frame) => Math.round((frame[0]?.opacity ?? 0) * 100))).toEqual([
          0, 33, 67, 100, 100,
        ]);
      }),
    ));

  it('R14: without the ear four items stand at the slots they hold with it', () => {
    const at = (ear: boolean) => {
      using page = onPage(chordsOn(), ear);
      const finger = hold();
      const drawn = places(page, itemsOf(ear));
      finger.lift();
      return drawn;
    };
    const five = at(true);
    const four = at(false);
    expect(four.map((place) => place.item)).toEqual(['keyDown', 'keyUp', 'reset', 'chords']);
    const atSlot = (drawn: typeof four) =>
      drawn.map((place) => ({
        item: place.item,
        near: Math.hypot(place.x - slotOf(place.item).x, place.y - slotOf(place.item).y) <= 0.5,
      }));
    expect(atSlot(four)).toEqual(atSlot(five).filter(({ item }) => item !== 'tuner'));
    expect(atSlot(five).every(({ near }) => near)).toBe(true);
  });
});
