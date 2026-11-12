/* oxlint-disable effect/noAsyncFunction, effect/noNullish, effect/noNewPromise, eslint/no-await-in-loop, effect/noGlobals -- a drawing test: it mounts the growing seed and the welcome through React's promise-based act in happy-dom, yields to Reanimated's animation frame, drives the host's `performance.now` that Reanimated's frames read, and reads DOM absence as null. */

/**
 * The welcome's growing seed (`./growing`) mounted in happy-dom. With its
 * clock driven (`at` at each hold's middle, each fade's quarter and middle,
 * the cycle's end and generated instants), in both schemes: four images
 * in the order seed, blade, ear, full corn, each the scheme's drawing,
 * 112 pt in the one 120 pt place hidden from the screen reader that holds
 * them all with no text and no control, and their opacities `growthAt(at)`.
 * Under the preload's Reduce Motion with no `at`: `GROWTH_STILL` in the
 * first frame and every frame after, and no node animated. With motion on
 * and no `at`: the first frame is the loop's start, full corn alone as the
 * fade back to the seed begins (the test reads nothing of the host's time);
 * with the frames' time driven past one cycle, the loop's clock starts over
 * and never passes one cycle on from its start, so each stage shows alone
 * again. An unmount mid-loop logs no error. And across the welcome's frames, its
 * heading, texts and controls are the same nodes in every frame.
 */

import { describe, expect, it, spyOn } from 'bun:test';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { View } from 'react-native';
import { isSharedValue } from 'react-native-reanimated';

import { setSystem } from '../test/look';
import { moving, under } from '../test/motion';
import { assetOf } from '../test/plant-image-rule';
import { type Fiber, fiberProps, rootFiberOf } from '../test/voiceover';
import { theme, type Scheme } from '../theme';
import { GrowingSeed } from './growing';
import { GROWTH, GROWTH_START, GROWTH_STILL, growthAt, type GrowthFrame } from './growth';
import { Welcome } from './intro';

const CONTROLS = '[role="button"],[role="radio"],[role="checkbox"],[role="link"]';
const NAMES = ['seed', 'blade', 'ear', 'corn'];

const nextFrame = () =>
  act(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));

/** Mounts `node` on the scheme's ground; the answer renders again and unmounts. */
const mount = async (node: React.ReactNode, scheme: Scheme = 'light') => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const draw = (each: React.ReactNode) =>
    act(async () => {
      setSystem(scheme);
      root.render(<View style={{ backgroundColor: theme[scheme].ground }}>{each}</View>);
    });
  await draw(node);
  return {
    host,
    draw,
    leave: async () => {
      await act(async () => root.unmount());
      host.remove();
      setSystem('light');
    },
  };
};

/** Each drawing's opacity, read from its own wrapper, rounded to 1e-3. */
const opacities = (host: Element) =>
  [...host.querySelectorAll('[data-testid="growing-image"]')].map((image) => {
    const wrapper = image.parentElement;
    return Math.round(Number(getComputedStyle(wrapper ?? image).opacity) * 1000) / 1000;
  });

/**
 * The adapter's clock now: the shared value its drawings take as `clock`,
 * read from React's tree. Its opacities are `growthAt` of it (the points
 * are `growthAt`'s, `growth.property.test.ts`), but without the worklets'
 * Babel plugin react-native-web never runs the drawings' styles again once
 * mounted, so a moving clock is read here and not in their styles.
 */
const clockOf = (host: Element): number => {
  const found: number[] = [];
  const walk = (fiber: Fiber | null | undefined) => {
    for (let each = fiber; each; each = each.sibling) {
      const clock = fiberProps(each)['clock'];
      if (isSharedValue<number>(clock)) found.push(clock.value);
      walk(each.child);
    }
  };
  walk(rootFiberOf(host));
  return found[0] ?? Number.NaN;
};

const rounded = (frame: GrowthFrame) => frame.map((each) => Math.round(each * 1000) / 1000);

/** What the place draws wrong in `scheme`: not one hidden place; not the four drawings in order, each 112 pt; any text or control in it. */
const placeFaults = (host: Element, scheme: Scheme) => {
  const places = [...host.querySelectorAll('[data-testid="growing"]')];
  const place = places[0];
  if (places.length !== 1 || place === undefined) return [`${places.length} places`];
  const out: string[] = [];
  const box = getComputedStyle(place);
  if (box.width !== '120px' || box.height !== '120px') out.push(`a ${box.width} place`);
  if (place.getAttribute('aria-hidden') !== 'true') out.push('the place exposed');
  const images = [...place.querySelectorAll('img')];
  const want = NAMES.map((name) => `assets/home/${name}-${scheme}.png`);
  if (images.map(assetOf).join() !== want.join()) out.push(`draws ${images.map(assetOf).join()}`);
  for (const image of images) {
    const drawn = image.closest('[data-testid="growing-image"]');
    const { width, height } = getComputedStyle(drawn ?? image);
    if (width !== '112px' || height !== '112px') out.push(`a drawing ${width}×${height}`);
  }
  if ((place.textContent ?? '').trim() !== '') out.push('text in the place');
  if (place.querySelector(CONTROLS) !== null) out.push('a control in the place');
  return out;
};

/** The clocks a driven case reads: each hold's middle, each fade's quarter and middle, the cycle's end, and 40 generated instants over a day. */
const CLOCKS = (() => {
  const { hold, fade, rest, cycle } = GROWTH;
  const held = [hold, hold, hold, rest];
  const out: number[] = [];
  let at = 0;
  for (const span of held) {
    out.push(at + span / 2, at + span + fade / 4, at + span + fade / 2);
    at += span + fade;
  }
  out.push(cycle, cycle - 1);
  let state = 7;
  for (let index = 0; index < 40; index++) {
    state = (state * 48_271) % 2_147_483_647;
    out.push(state % 86_400_000);
  }
  return out;
})();

describe('the growing seed', () => {
  for (const scheme of ['light', 'dark'] as const)
    it(`draws growthAt(at) on a driven clock in ${scheme}: the four drawings in order, each 112 pt in one hidden 120 pt place with no text or control`, async () => {
      const drawn = await mount(<GrowingSeed at={0} />, scheme);
      for (const at of CLOCKS) {
        await drawn.draw(<GrowingSeed at={at} />);
        expect({
          at,
          faults: placeFaults(drawn.host, scheme),
          opacity: opacities(drawn.host),
        }).toEqual({
          at,
          faults: [],
          opacity: rounded(growthAt(at)),
        });
      }
      await drawn.leave();
    });

  it('stands still at full corn under Reduce Motion, from its first frame, with no node animated', async () => {
    const drawn = await mount(<GrowingSeed />);
    const frames = [opacities(drawn.host)];
    for (let frame = 0; frame < 6; frame++) {
      await nextFrame();
      frames.push(opacities(drawn.host));
    }
    expect({
      frames,
      moving: moving(drawn.host).length,
      faults: placeFaults(drawn.host, 'light'),
    }).toEqual({
      frames: frames.map(() => [...GROWTH_STILL]),
      moving: 0,
      faults: [],
    });
    await drawn.leave();
  });

  it('starts the loop with motion on at its start, full corn alone as the fade back to the seed begins, and logs nothing when it leaves mid-loop', () =>
    under('no-preference', async () => {
      // oxlint-disable-next-line effect/noModuleMocks -- React reports a late update after unmount on the console alone, a host boundary no layer stands in for
      const errors = spyOn(console, 'error');
      const host = document.createElement('div');
      document.body.append(host);
      const first: number[][] = [];
      const watch = new MutationObserver(() => {
        if (first.length === 0 && host.querySelector('[data-testid="growing-image"]') !== null)
          first.push(opacities(host));
      });
      watch.observe(host, { subtree: true, childList: true, attributes: true });
      const root = createRoot(host);
      await act(async () => root.render(<GrowingSeed />));
      watch.disconnect();
      await nextFrame();
      await nextFrame();
      await act(async () => root.unmount());
      await nextFrame();
      host.remove();
      expect({ first, errors: errors.mock.calls.length }).toEqual({
        first: [rounded(growthAt(GROWTH_START))],
        errors: 0,
      });
      errors.mockRestore();
    }));

  it('loops with motion on: driven past its first cycle, its clock starts over and the seed, the blade, the ear and full corn each show alone again, the clock never past one cycle on from its start', () =>
    under('no-preference', async () => {
      const real = performance.now();
      const frames = { now: real };
      // oxlint-disable-next-line effect/noModuleMocks -- Reanimated's web frames read the host's `performance.now` alone, a host boundary no layer stands in for; the test drives it past one cycle
      const time = spyOn(performance, 'now').mockImplementation(() => frames.now);
      const drawn = await mount(<GrowingSeed />);
      const step = 250;
      const alone = new Set<number>();
      let most = 0;
      for (let at = step; at <= 2 * GROWTH.cycle; at += step) {
        frames.now = real + at;
        await nextFrame();
        const clock = clockOf(drawn.host);
        most = Math.max(most, clock);
        const shown = growthAt(clock);
        if (at > GROWTH.cycle + GROWTH.fade && shown.includes(1)) alone.add(shown.indexOf(1));
      }
      await drawn.leave();
      time.mockRestore();
      expect({ alone: [...alone].toSorted(), over: most > GROWTH_START + GROWTH.cycle }).toEqual({
        alone: [0, 1, 2, 3],
        over: false,
      });
    }));

  it('keeps the welcome’s heading, texts and controls the same nodes in every frame while the seed grows', () =>
    under('no-preference', async () => {
      const drawn = await mount(<Welcome run="first" onBegin={() => {}} onSkip={() => {}} />);
      const others = () => [
        ...drawn.host.querySelectorAll(
          '[role="heading"],[data-testid="reference"],[role="button"]',
        ),
      ];
      const before = others();
      const changed: string[] = [];
      const watch = new MutationObserver(() => {
        const now = others();
        if (now.length !== before.length || now.some((node, index) => node !== before[index]))
          changed.push(now.map((node) => node.textContent ?? '').join('|'));
      });
      watch.observe(drawn.host, {
        subtree: true,
        childList: true,
        attributes: true,
        characterData: true,
      });
      for (let frame = 0; frame < 8; frame++) await nextFrame();
      watch.disconnect();
      expect({ count: before.length, changed }).toEqual({ count: 4, changed: [] });
      await drawn.leave();
    }));
});
