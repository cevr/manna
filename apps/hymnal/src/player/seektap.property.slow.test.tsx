/**
 * A tap on a seek bar jumps there, on every seek bar the reader sees on
 * iOS: the docked bar's `Seek` (`Seeker.tsx`) and the full player's
 * `Position` (`Scrubber.ios.tsx`). A tap is played as iOS's recognizers
 * report a still touch (`src/test/gesture.tsx`): each pan on the bar begins
 * and then fails, never activated, and the tap gesture (`seek-tap`,
 * `position-tap`) begins and activates. UIKit gives no order between the
 * pans' failure and the tap's activation, nor says whether the bar draws
 * between them, so each case picks the order and whether the two ends come
 * in one batch.
 *
 * The property, over generated widths, lengths, playing places and tap
 * points (inside the bar and past either end): a tap at `x` sends exactly
 * the seeks a drag whose finger lifts at `x` sends (the place under the
 * finger, once; nothing when it is the second the bar showed), the bar then
 * tells that place to VoiceOver, and the docked bar gives one `seek-release`
 * cue and no grab or tick. Plus: a tap past the left end lands at 0, past
 * the right end at the length; a still bar (length unknown) takes no tap.
 */

import { describe, expect, it } from 'bun:test';
import { Option } from 'effect';
import { act, type ComponentType } from 'react';
import { createRoot } from 'react-dom/client';

import { CueProvider } from '~/feel/cue';
import { drag, gestureOf, gestures, type TapOrder, touchDown, touchUp } from '~/test/gesture';
import { propsWith } from '~/test/props';

import type { ScrubberProps } from './scrub';
import { Scrubber } from './Scrubber.ios';
import { Seeker } from './Seeker';
import { clock } from './time';

interface BarKind {
  readonly name: string;
  readonly component: ComponentType<ScrubberProps>;
  readonly selector: string;
  readonly pan: string;
  readonly tap: string;
  /** What VoiceOver is told of the bar's value. */
  readonly said: (element: Element) => string;
  readonly cues: boolean;
}

const BARS: ReadonlyArray<BarKind> = [
  {
    name: 'the docked bar’s Seek',
    component: Seeker,
    selector: '[data-testid="seek"]',
    pan: 'seek-pan',
    tap: 'seek-tap',
    said: (element) => element.getAttribute('aria-valuetext') ?? '',
    cues: true,
  },
  {
    name: 'the full player’s Position',
    component: Scrubber,
    selector: '[aria-label="Position"]',
    pan: 'position-pan',
    tap: 'position-tap',
    said: (element) =>
      (propsWith(element, 'accessibilityValue')['accessibilityValue'] as { text: string }).text,
    cues: false,
  },
];

/** A view's `onLayout` event, as the bar reads it. */
interface LayoutEvent {
  readonly nativeEvent: { readonly layout: Record<string, number> };
}

/** Bar `kind` over a recording `length` seconds long, playing at `at`, laid out `width` points wide. */
const mount = (kind: BarKind, at: number, length: Option.Option<number>, width: number) => {
  gestures.splice(0);
  const sought: Array<number> = [];
  const cues: Array<string> = [];
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const Bar = kind.component;
  act(() =>
    root.render(
      <CueProvider value={(cue) => cues.push(cue._tag)}>
        <Bar at={at} length={length} onSeek={(seconds) => sought.push(seconds)} />
      </CueProvider>,
    ),
  );
  const bar = () => Option.getOrThrow(Option.fromNullishOr(host.querySelector(kind.selector)));
  act(() =>
    (propsWith(bar(), 'onLayout')['onLayout'] as (event: LayoutEvent) => void)({
      nativeEvent: { layout: { x: 0, y: 0, width, height: 32 } },
    }),
  );
  return {
    sought,
    cues,
    bar,
    [Symbol.dispose]: () => {
      act(() => root.unmount());
      host.remove();
    },
  };
};

/** Whether the pans' failure and the tap's activation come in one batch, or the bar draws between them. */
type Batch = 'together' | 'apart';

/** A still tap at `x`: the finger lands and the bar draws, then the pans fail and the tap activates in `order`. */
const tapAt = (kind: BarKind, x: number, order: TapOrder, batch: Batch) => {
  const touch = { x, y: 16 };
  act(() => touchDown(kind.tap, touch));
  if (batch === 'together') {
    act(() => touchUp(kind.tap, touch, order));
    return;
  }
  const fail = () => act(() => gestureOf(kind.pan).onFinalize?.({ ...touch, canceled: true }));
  const land = () => {
    act(() => gestureOf(kind.tap).onActivate?.(touch));
    act(() => gestureOf(kind.tap).onDeactivate?.({ ...touch, canceled: false }));
    act(() => gestureOf(kind.tap).onFinalize?.({ ...touch, canceled: false }));
  };
  if (order === 'tap-first') {
    land();
    fail();
  } else {
    fail();
    land();
  }
};

/** The seeks a drag on a fresh bar sends when its finger lifts at `x`. */
const draggedTo = (kind: BarKind, at: number, length: number, width: number, x: number) => {
  using bar = mount(kind, at, Option.some(length), width);
  let start = x - 30;
  if (x < width / 2) start = x + 30;
  act(() => void drag(kind.pan, { x: start, y: 16, dx: x - start, dy: 0 }));
  return bar.sought;
};

/** mulberry32: the cases are the same on every run of one seed. */
const random = (seed: number) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const SEED = 0x5ee7a9;
const CASES = 120;
const ORDERS: ReadonlyArray<TapOrder> = ['tap-first', 'pans-first'];
const BATCHES: ReadonlyArray<Batch> = ['together', 'apart'];

describe.each(BARS.map((kind) => [kind.name, kind] as const))('a tap on %s', (_, kind) => {
  it('is not taken while the length is not known', () => {
    using _bar = mount(kind, 0, Option.none(), 300);
    expect(gestureOf(kind.tap).enabled).toBe(false);
  });

  it('lands at 0 past the left end, and at the length past the right end', () => {
    for (const order of ORDERS) {
      for (const batch of BATCHES) {
        using left = mount(kind, 60, Option.some(120), 300);
        tapAt(kind, -5, order, batch);
        expect({ order, batch, sought: left.sought }).toEqual({ order, batch, sought: [0] });
        using right = mount(kind, 60, Option.some(120), 300);
        tapAt(kind, 305, order, batch);
        expect({ order, batch, sought: right.sought }).toEqual({ order, batch, sought: [120] });
      }
    }
  });

  it('sends the seeks a drag lifted at its point sends, and tells VoiceOver the place', () => {
    const next = random(SEED);
    let sent = 0;
    for (let k = 0; k < CASES; k += 1) {
      const width = 40 + next() * 360;
      const length = 1 + next() * 899;
      const at = next() * length;
      const x = -30 + next() * (width + 60);
      const order = ORDERS[Math.floor(next() * ORDERS.length)] ?? 'tap-first';
      const batch = BATCHES[Math.floor(next() * BATCHES.length)] ?? 'together';
      const where = `seed ${SEED} case ${k}: width ${width}, length ${length}, at ${at}, x ${x}, ${order}, ${batch}`;
      const expected = draggedTo(kind, at, length, width, x);
      using bar = mount(kind, at, Option.some(length), width);
      tapAt(kind, x, order, batch);
      expect({ where, sought: bar.sought }).toEqual({ where, sought: expected });
      expect({ where, said: kind.said(bar.bar()) }).toEqual({
        where,
        said: `${clock(expected[0] ?? at)} of ${clock(length)}`,
      });
      if (kind.cues) expect({ where, cues: bar.cues }).toEqual({ where, cues: ['seek-release'] });
      sent += expected.length;
    }
    expect(sent).toBeGreaterThan(CASES / 2);
  });
});
