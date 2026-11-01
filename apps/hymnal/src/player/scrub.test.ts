/** Where a touch on iOS's position bar lands, where a screen reader's swipe moves it, and a drag that follows a step. */

import { describe, expect, it } from 'bun:test';
import { Option } from 'effect';
import { act, createElement, Fragment } from 'react';
import { createRoot } from 'react-dom/client';

import { nudged, placeAt, useScrub } from './scrub';

describe('placeAt', () => {
  it('maps a touch along the bar to its place in the recording, held inside the bar', () => {
    expect(placeAt(75, 300, 120)).toBe(30);
    expect(placeAt(-20, 300, 120)).toBe(0);
    expect(placeAt(340, 300, 120)).toBe(120);
  });

  it('gives the start before the bar is measured', () => {
    expect(placeAt(75, 0, 120)).toBe(0);
  });
});

/** `useScrub` over a recording 2:00 long at 0:30, mounted; each seek it sends is kept. */
const mount = () => {
  const sought: Array<number> = [];
  let held = Option.none<ReturnType<typeof useScrub>>();
  function Bar() {
    held = Option.some(
      useScrub({ at: 30, length: Option.some(120), onSeek: (seconds) => sought.push(seconds) }),
    );
    return createElement(Fragment);
  }
  const host = document.createElement('div');
  const root = createRoot(host);
  act(() => root.render(createElement(Bar)));
  return {
    sought,
    scrub: () => Option.getOrThrow(held),
    [Symbol.dispose]: () => act(() => root.unmount()),
  };
};

describe('useScrub', () => {
  it('starts a drag from a step sent before the bar draws again', () => {
    using bar = mount();
    // A key's step, then a tap on the stepped place, in one batch: the tap's drag starts there, so nothing more is sent.
    act(() => {
      const scrub = bar.scrub();
      scrub.step(40);
      scrub.press(1);
      scrub.move(40);
      scrub.lift(1);
    });
    expect(bar.sought).toEqual([40]);
  });
});

describe('nudged', () => {
  it('moves ten seconds a swipe, within the recording', () => {
    expect(nudged(30, 120, 1)).toBe(40);
    expect(nudged(30, 120, -1)).toBe(20);
    expect(nudged(115, 120, 1)).toBe(120);
    expect(nudged(4, 120, -1)).toBe(0);
  });
});
