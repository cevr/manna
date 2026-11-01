/**
 * iOS's position bar (`Scrubber.ios.tsx`) takes its touch as a gesture
 * handler's pan, a UIKit gesture that begins at the touch, so the sheet's
 * pan cannot take the drag while the finger holds the bar, and a tap that
 * competes with the pan for a still touch. The touch is played through the
 * gestures' own callbacks, as iOS's recognizers report it
 * (`src/test/gesture.tsx`); the drive on the simulator proves the sheet
 * holds still.
 */

import { describe, expect, it } from 'bun:test';
import { Option } from 'effect';
import { act } from 'react';
import { createRoot } from 'react-dom/client';

import { gestureOf, gestures, touchDown, touchUp } from '../test/gesture';
import { propsWith } from '../test/props';
import { Scrubber } from './Scrubber.ios';

/** A view's `onLayout` event, as the bar reads it. */
interface LayoutEvent {
  readonly nativeEvent: { readonly layout: Record<string, number> };
}

/** The bar over a recording `length` seconds long at 0:30, mounted; each seek it sends is kept. */
const mount = (length: Option.Option<number>) => {
  gestures.splice(0);
  const sought: Array<number> = [];
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  act(() =>
    root.render(<Scrubber at={30} length={length} onSeek={(seconds) => sought.push(seconds)} />),
  );
  const bar = () => host.querySelector('[aria-label="Position"]') as Element;
  return {
    sought,
    /** What VoiceOver is told of the bar's place. */
    said: () =>
      (propsWith(bar(), 'accessibilityValue')['accessibilityValue'] as { text: string }).text,
    /** The bar is laid out `width` points wide. */
    layOut: (width: number) =>
      act(() =>
        (propsWith(bar(), 'onLayout')['onLayout'] as (event: LayoutEvent) => void)({
          nativeEvent: { layout: { x: 0, y: 0, width, height: 32 } },
        }),
      ),
    [Symbol.dispose]: () => {
      act(() => root.unmount());
      host.remove();
    },
  };
};

const pan = () => gestureOf('position-pan');

describe('iOS’s position bar', () => {
  it('takes its touch as a pan, which begins at the touch', () => {
    using _bar = mount(Option.some(120));
    expect(pan().enabled).toBe(true);
    expect(gestureOf('position-tap').enabled).toBe(true);
  });

  it('sends one seek, to the place under the finger, once the finger lifts', () => {
    using bar = mount(Option.some(120));
    // happy-dom lays the bar out 0 points wide: every place is the start.
    act(() => pan().onBegin?.({ x: 0 }));
    act(() => pan().onUpdate?.({ x: 0 }));
    expect(bar.sought).toEqual([]);
    act(() => pan().onFinalize?.({ x: 0, canceled: false }));
    expect(bar.sought).toEqual([0]);
  });

  it('sends nothing when the touch is taken from it', () => {
    using bar = mount(Option.some(120));
    act(() => pan().onBegin?.({ x: 0 }));
    act(() => pan().onFinalize?.({ x: 0, canceled: true }));
    expect(bar.sought).toEqual([]);
  });

  it('jumps to a tap’s place, once, whether the pan fails before the tap lands or after', () => {
    for (const order of ['pans-first', 'tap-first'] as const) {
      using bar = mount(Option.some(120));
      // 220 points wide: the track runs 200 points between the thumb's half insets, so x 110 is 1:00.
      bar.layOut(220);
      // The bar draws the pan's press under the finger before the finger lifts, and both ends come in one batch.
      act(() => touchDown('position-tap', { x: 110 }));
      act(() => touchUp('position-tap', { x: 110 }, order));
      expect({ order, sought: bar.sought }).toEqual({ order, sought: [60] });
      expect({ order, said: bar.said() }).toEqual({ order, said: '1:00 of 2:00' });
    }
  });

  it('takes no touch while the length is not known', () => {
    using _bar = mount(Option.none());
    expect(pan().enabled).toBe(false);
    expect(gestureOf('position-tap').enabled).toBe(false);
  });
});
