/**
 * The key dial's wrap, frame by frame: on every frame of a drag and of the
 * glide after it, at any fling speed and length and over chained flings,
 * every slot of the dial's window shows its key, the keys side by side in
 * order; the detents it cues step one at a time; and once still, the key at
 * the notch is the last one cued and told.
 *
 * It mounts the real `DialView` as the key dial (twelve stops, wrapping)
 * under the app's stand-ins (`src/test/setup.ts`): the pan's own callbacks
 * are played as the gesture handler calls them, and each glide is stepped a
 * 16 ms frame at a time along its own duration and curve
 * (`stepAnimations`), the dial read after each frame. The next touch comes
 * at a frame of the glide the case picks, or once it has landed.
 *
 * A slot is read where the row draws it: a key's left edge in the window is
 * the sum of the `left` and `translateX` of its stop and of the row the stop
 * lies in; the window is the row's parent, laid out by its own `onLayout`.
 *
 * Generated over 40 seeded cases (each printed on failure), in groups of
 * five: a window of 200 to 1000 points (and 320, 390, 430), the key at the
 * notch at the start, and 1 to 8 flings, each a drag of up to 1.4 window
 * widths either way read every 5 to 40 points, let go at up to 5000 points a
 * second either way (a third at the fling cap or past it).
 */

import { describe, expect, test } from 'bun:test';
import { Array as Arr, Option, Predicate } from 'effect';
import { act, useState } from 'react';
import { Text } from 'react-native';
import { createRoot } from 'react-dom/client';

import { type Cue, CueProvider } from '~/feel/cue';

import { gestureOf } from '../test/gesture';
import { holdAnimations, landAnimations, stepAnimations } from '../test/reanimated';
import { DETENT, FLING_CAP, FRAME } from './dial';
import { DialView } from './DialView';

const KEYS = Array.from({ length: 12 }, (_, n) => n);

/** A seeded generator of numbers in [0, 1) (mulberry32). */
const seeded = (seed: number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

interface Fling {
  readonly drag: number;
  /** Points between two reads of the drag. */
  readonly every: number;
  readonly speed: number;
  /** The glide's frame the next touch comes at, or `lands`: it lands first. */
  readonly stopAt: number | 'lands';
}

interface Case {
  readonly seed: number;
  readonly width: number;
  readonly first: number;
  readonly flings: ReadonlyArray<Fling>;
}

const FIXED = [320, 390, 430];

const caseOf = (seed: number): Case => {
  const r = seeded(seed * 7919 + 13);
  const width = Arr.get(FIXED, seed).pipe(Option.getOrElse(() => Math.round(200 + r() * 800)));
  const first = Math.floor(r() * 12);
  const flings = Array.from({ length: 1 + Math.floor(r() * 8) }, (): Fling => {
    const sign = (r() < 0.5 && -1) || 1;
    const capped = r() < 0.34;
    const speed = Math.round(
      (capped && sign * (FLING_CAP + r() * 2000)) || (r() * 2 - 1) * FLING_CAP,
    );
    const stops = r() < 0.6;
    return {
      drag: Math.round((r() * 2.8 - 1.4) * width),
      every: 5 + Math.round(r() * 35),
      speed,
      stopAt: (stops && Math.floor(r() * 60)) || 'lands',
    };
  });
  return { seed, width, first, flings };
};

const caseText = (c: Case) =>
  `seed ${c.seed}, window ${c.width}, first key ${c.first}, flings ${c.flings
    .map((f) => `${f.drag} pt (every ${f.every}) at ${f.speed} pt/s, touched at ${f.stopAt}`)
    .join('; ')}`;

/** A view's layout, as React Native hands it to `onLayout`. */
interface Laid {
  readonly nativeEvent: { readonly layout: Record<'x' | 'y' | 'width' | 'height', number> };
}

interface Fiber {
  readonly memoizedProps?: { readonly onLayout?: (event: Laid) => void };
  readonly stateNode?: object;
  readonly return?: Fiber;
}

/** The `onLayout` the view drawn as `element` was handed: react-native-web keeps it off the DOM. */
const layoutOf = (element: Element): Option.Option<(event: Laid) => void> => {
  // React keeps an element's fiber under a key it names at run time.
  const own = Option.fromNullishOr(
    Object.entries(element).find(([name]) => name.startsWith('__reactFiber$')),
  ).pipe(Option.map(([, fiber]): Fiber => fiber));
  for (let fiber = own; Option.isSome(fiber); fiber = Option.fromNullishOr(fiber.value.return)) {
    const { stateNode, memoizedProps } = fiber.value;
    if (stateNode instanceof Element && stateNode !== element) return Option.none();
    const onLayout = Option.fromNullishOr(memoizedProps?.onLayout);
    if (Option.isSome(onLayout) && Predicate.isFunction(onLayout.value)) return onLayout;
  }
  return Option.none();
};

const shiftOf = (element: HTMLElement) =>
  [...element.style.transform.matchAll(/translateX\((-?[\d.e+-]+)px\)/g)].reduce(
    (sum, m) => sum + Number.parseFloat(m[1] ?? '0'),
    Number.parseFloat(element.style.left) || 0,
  );

/** The key dial of case `c`, mounted and laid out; it unmounts when the `using` ends. */
const mounted = (c: Case) => {
  const told: Array<number> = [];
  const cued: Array<number> = [];
  const tell = (cue: Cue) => {
    if (cue._tag === 'detent') cued.push(cue.at);
  };
  function Harness() {
    const [index, setIndex] = useState(c.first);
    return (
      <CueProvider value={tell}>
        <DialView
          dial="key"
          label="Key"
          title="KEY"
          stops={KEYS}
          index={index}
          wrap
          said={String(index)}
          drawStop={(n) => <Text testID={`k-${n}`}>{String(n)}</Text>}
          onTurn={(n) => {
            told.push(n);
            setIndex(n);
          }}
          testID="dial-key"
        />
      </CueProvider>
    );
  }
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  act(() => root.render(<Harness />));
  const windowEl = Option.fromNullishOr(
    host.querySelector<HTMLElement>('[data-testid="dial-key-row"]')?.parentElement,
  ).pipe(Option.getOrThrow);
  const layout = layoutOf(windowEl).pipe(Option.getOrThrow);
  act(() => layout({ nativeEvent: { layout: { x: 0, y: 0, width: c.width, height: DETENT } } }));
  return {
    told,
    cued,
    windowEl,
    [Symbol.dispose]: () => {
      act(() => landAnimations());
      act(() => root.unmount());
      host.remove();
    },
  };
};

/** The problems at one read of the dial: its window not covered, its keys out of order, or, still, the notch off its value. */
const readOf = (c: Case, dial: ReturnType<typeof mounted>, still: boolean) => {
  const slots = [...dial.windowEl.querySelectorAll<HTMLElement>('[data-testid^="k-"]')]
    .map((key) => {
      let x = 0;
      for (
        let e = Option.some(key);
        Option.isSome(e) && e.value !== dial.windowEl;
        e = Option.fromNullishOr(e.value.parentElement)
      )
        x += shiftOf(e.value);
      return { n: Number(key.dataset['testid']?.slice(2)), x };
    })
    .filter((s) => s.x + DETENT > 0.5 && s.x < c.width - 0.5)
    .sort((a, b) => a.x - b.x);
  const from = Arr.head(slots).pipe(Option.match({ onNone: () => c.width, onSome: (s) => s.x }));
  const to = Arr.last(slots).pipe(Option.match({ onNone: () => 0, onSome: (s) => s.x + DETENT }));
  if (from > 0.5 || to < c.width - 0.5)
    return [`the window 0..${c.width} is not covered: its slots run from ${from} to ${to}`];
  const apart = slots.flatMap((b, k) =>
    Arr.get(slots, k - 1).pipe(
      Option.filter((a) => Math.abs(b.x - a.x - DETENT) > 0.5 || b.n !== (a.n + 1) % 12),
      Option.match({
        onNone: () => [],
        onSome: (a) => [`keys ${a.n} at ${a.x.toFixed(1)} and ${b.n} at ${b.x.toFixed(1)}`],
      }),
    ),
  );
  if (apart.length > 0 || !still) return apart;
  const middle = c.width / 2;
  const notch = slots.filter((s) => s.x <= middle && middle < s.x + DETENT).map((s) => s.n);
  const value = Arr.last(dial.told).pipe(Option.getOrElse(() => c.first));
  const cued = Arr.last(dial.cued).pipe(Option.getOrElse(() => value));
  if (notch.length === 1 && notch[0] === value && cued === value) return [];
  return [`the notch shows ${notch.join(',')}, told ${value}, cued ${cued}`];
};

/** Each problem case `c` finds, at the first read that finds one, with the case and the moment. */
const run = (c: Case): ReadonlyArray<string> => {
  using dial = mounted(c);
  const problems: Array<string> = [];
  const read = (where: string, still: boolean) => {
    if (problems.length > 0) return;
    for (const p of readOf(c, dial, still)) problems.push(`${caseText(c)}: ${where}: ${p}`);
  };
  holdAnimations();
  read('mounted', true);
  const pan = () => gestureOf('dial-key-pan');
  for (const [i, f] of c.flings.entries()) {
    act(() => pan().onBegin?.({ x: 0 }));
    read(`fling ${i} touch-down`, false);
    act(() => pan().onActivate?.({ x: 0 }));
    const steps = Math.max(1, Math.ceil(Math.abs(f.drag) / f.every));
    for (let s = 1; s <= steps; s += 1) {
      const translationX = (f.drag * s) / steps;
      act(() => pan().onUpdate?.({ x: 0, translationX }));
      read(`fling ${i} drag ${translationX.toFixed(1)}`, false);
    }
    const end = { x: 0, translationX: f.drag, velocityX: f.speed, canceled: false };
    act(() => pan().onDeactivate?.(end));
    act(() => pan().onFinalize?.(end));
    const glide = { frame: 0, running: true };
    while (glide.running && glide.frame !== f.stopAt) {
      act(() => void (glide.running = stepAnimations(FRAME)));
      glide.frame += 1;
      read(`fling ${i} at ${f.speed} frame ${glide.frame}`, !glide.running);
    }
  }
  act(() => {
    while (stepAnimations(FRAME));
  });
  read('the end, still', true);
  // Each detent cued is a step of one from the detent before it, from the key at the start.
  const jumps = dial.cued.filter(
    (at, k) =>
      ![1, 11].includes(
        (at - Arr.get(dial.cued, k - 1).pipe(Option.getOrElse(() => c.first)) + 12) % 12,
      ),
  );
  if (jumps.length > 0) problems.push(`${caseText(c)}: a detent cued past one: ${jumps.join(',')}`);
  return problems;
};

describe('the key dial, frame by frame', () => {
  test.each(Array.from({ length: 8 }, (_, group) => group * 5))(
    'shows a key in every slot of its window on every frame of a drag and a glide, cases %d on',
    (from) => {
      const found = Array.from({ length: 5 }, (_, k) => run(caseOf(from + k))).flat();
      expect(found.slice(0, 3).join('\n')).toBe('');
    },
  );
});
