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

interface LayoutEvent {
  readonly nativeEvent: { readonly layout: Record<string, number> };
}

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

type Batch = 'together' | 'apart';

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

const draggedTo = (kind: BarKind, at: number, length: number, width: number, x: number) => {
  using bar = mount(kind, at, Option.some(length), width);
  let start = x - 30;
  if (x < width / 2) start = x + 30;
  act(() => void drag(kind.pan, { x: start, y: 16, dx: x - start, dy: 0 }));
  return bar.sought;
};

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
