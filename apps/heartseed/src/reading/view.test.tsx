/* oxlint-disable effect/noGlobals, effect/noNullish, effect/noAsyncFunction, effect/noTernary, effect/noUnsafeDictionaryType, eslint/no-await-in-loop -- a view test: it reads a word's React props as React holds them, where react-native-web draws no DOM for VoiceOver's actions; it mounts the reading view in happy-dom's document and draws it again frame after frame, one after another, through React's promise-based `act`, draws its views with plain branches, reads nodes whose absent attributes are null, and hands each word its box through the layout handler react-native-web keeps on the node. */

/**
 * The reading view alone (hslight L2, L5-L9), mounted in happy-dom
 * (react-native-web) and drawn again over generated readings of made-up
 * texts.
 *
 * The light: each frame holds one `word-<i>` per word, each a direct child
 * of `reading` showing `shownWordsOf`'s text; the words before the read
 * point in `ink` and the rest in `quiet`; the selected words alone on the
 * `hearing` ground; no transition or animation on any node; and the view
 * at least 44 pt tall.
 *
 * The hold, played through the gesture stand-in (`src/test/gesture.tsx`)
 * over generated layouts, each word's box handed to it as its layout, and
 * points on a word, in a gap, between lines and outside: a long press holds
 * the word under the finger and asks for the pause once; each move holds
 * the word under the finger; while held the held word is the read point
 * and the selection whatever the voice says; a release asks for one seek
 * to the held word and a cancel for one resume, both at the end's
 * deactivation and finalization alike; a swipe (a pan that never activates)
 * asks for nothing; when the view goes while held the hold is dropped and a
 * later end asks for nothing. Each hold is played on the gesture as it was
 * drawn at the hold's start, so a callback that read the held word from its
 * render would seek to a stale one.
 *
 * VoiceOver (L8): each word, itself and not a wrapper, offers one action,
 * `Read from here`, read from the props React holds since react-native-web
 * draws no DOM for it; performing it asks for one seek to that word, and
 * any other action asks for nothing. Each word stays its own element:
 * nothing from `reading` down to it is `accessible` or hides its children
 * (`src/test/voiceover.ts`).
 *
 * It catches the ink off by one, a selection or ground left on a word out
 * of the range, a word nested in a wrapper, a word's text cut at its
 * letters, a held word not shown, a seek at both ends of a release, a hold
 * not dropped with the view, and a stale held word. Today's wiring (when
 * the view shows, the scroll lock, the pause and the tick) is
 * `today.test.tsx`'s.
 */

import { describe, expect, it } from 'bun:test';
import { Option } from 'effect';
import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { View } from 'react-native';

import { gestureOf, type PanConfig } from '../test/gesture';
import { below, random } from '../test/garden-model';
import { computed } from '../test/look';
import { type Fiber, fiberProps, rootFiberOf, voiceOverFaults } from '../test/voiceover';
import { theme } from '../theme';
import type { VoiceView } from '../voice';
import { wordSpans } from '../voice/reading';
import { type Hold, ReadingView } from './view';
import { type Box, shownWordsOf, wordAt } from './words';

const TEXTS = [
  'Alpha beta, gamma — delta... epsilon zeta eta theta iota kappa.',
  '— lead mark then words 12 and 𝒜dam’s end ...',
  'one',
  'a b c d e f g h i j k l m n o p q r s t u v w x y z',
];

const viewOf = (text: string, next: () => number): VoiceView => {
  const words = wordSpans(text).length;
  const lit = Math.floor(next() * (words + 1));
  const first = Math.floor(next() * words);
  const last = Math.min(words - 1, first + Math.floor(next() * 3));
  return {
    choice: 'her',
    enabled: true,
    status: next() < 0.3 ? 'paused' : 'reading',
    verse: text,
    words,
    lit,
    current: next() < 0.25 ? null : { first, last },
    ended: null,
  };
};

const IDLE: Hold = {
  held: Option.none(),
  onHeld: () => undefined,
  onHold: () => undefined,
  onSeek: () => undefined,
  onLetGo: () => undefined,
};

/** The faults of one frame: each word against the read point `readTo` and the selected range, none when nothing is selected. */
const frameFaults = (
  host: Element,
  text: string,
  readTo: number,
  selected: { readonly first: number; readonly last: number } | null,
  at: string,
): string[] => {
  const faults: string[] = [];
  const roles = theme.light;
  const reading = host.querySelector('[data-testid="reading"]');
  if (reading === null) return [`${at}: no reading view`];
  if (Number.parseFloat(getComputedStyle(reading).minHeight) < 44)
    faults.push(`${at}: the view under 44 pt`);
  const shown = shownWordsOf(text);
  const children = [...reading.children];
  if (children.length !== shown.length)
    faults.push(`${at}: ${children.length} children of ${shown.length} words`);
  children.forEach((node, index) => {
    const word = `${at} word-${index}`;
    if (node.getAttribute('data-testid') !== `word-${index}`)
      faults.push(`${word}: child is ${node.getAttribute('data-testid')}`);
    if (node.textContent !== shown[index]) faults.push(`${word}: text differs`);
    const isSelected = selected !== null && index >= selected.first && index <= selected.last;
    if ((node.getAttribute('aria-selected') === 'true') !== isSelected)
      faults.push(`${word}: selected ${node.getAttribute('aria-selected')} want ${isSelected}`);
    const style = getComputedStyle(node);
    const ink = index < readTo ? roles.ink : roles.quiet;
    if (style.color !== computed(ink))
      faults.push(`${word}: ink ${style.color} want ${index < readTo ? 'ink' : 'quiet'}`);
    const ground = style.backgroundColor === computed(roles.hearing);
    if (ground !== isSelected) faults.push(`${word}: hearing ground ${ground} want ${isSelected}`);
    for (const moving of [style.transitionProperty, style.animationName])
      if (moving !== '' && moving !== 'none') faults.push(`${word}: moves (${moving})`);
  });
  return faults;
};

/** A layout of `n` words: rows that wrap at 320 pt, words 20-80 pt wide, gaps of 4-12, lines 34-44 apart. */
const layoutOf = (next: () => number, n: number): Box[] => {
  const boxes: Box[] = [];
  let x = 0;
  let y = 0;
  const step = 34 + below(next, 11);
  for (let index = 0; index < n; index += 1) {
    const width = 20 + below(next, 61);
    if (x > 0 && x + width > 320) {
      x = 0;
      y += step;
    }
    boxes.push({ x, y, width, height: 32 });
    x += width + 4 + below(next, 9);
  }
  return boxes;
};

/** A point on a word, in the gap after one, between its line and the next, or outside every box. */
const pointOf = (next: () => number, boxes: readonly Box[]) => {
  const box = boxes[below(next, boxes.length)] as Box;
  const points = [
    { x: box.x + below(next, box.width), y: box.y + below(next, box.height) },
    { x: box.x + box.width + 2, y: box.y + 8 },
    { x: box.x + below(next, box.width), y: box.y + 33 },
    { x: -40 + below(next, 420), y: -40 + below(next, 400) },
    { x: -25, y: box.y + 4 },
    { x: 380, y: box.y + 4 },
  ];
  return points[below(next, points.length)] as { x: number; y: number };
};

/** What the screen around the view saw: each ask of the hold in order, and the held word it keeps. */
interface Seen {
  readonly asks: string[];
  held: Option.Option<number>;
}

/** The screen's part of the hold, as Today keeps it: the held word in its state, each ask recorded. */
function Holding({
  text,
  view,
  shown,
  seen,
}: {
  readonly text: string;
  readonly view: VoiceView;
  readonly shown: boolean;
  readonly seen: Seen;
}) {
  const [held, setHeld] = useState<Option.Option<number>>(Option.none());
  seen.held = held;
  if (!shown) return <View testID="rest" />;
  return (
    <ReadingView
      text={text}
      view={view}
      hold={{
        held,
        onHeld: setHeld,
        onHold: () => void seen.asks.push('hold'),
        onSeek: (word) => void seen.asks.push(`seek ${word}`),
        onLetGo: () => void seen.asks.push('letGo'),
      }}
    />
  );
}

/** A held word as a failure names it. */
const named = (held: Option.Option<number>) =>
  Option.match(held, { onNone: () => 'none', onSome: (word) => `word ${word}` });

/** A layout as react-native-web's observer hands it to a node's `onLayout`. */
interface LayoutEvent {
  readonly nativeEvent: { readonly layout: Box };
  readonly timeStamp: number;
}

/** Hands each word node its box as react-native-web's layout observer would. */
const lay = (host: Element, boxes: readonly Box[]) => {
  boxes.forEach((box, index) => {
    const node = host.querySelector(`[data-testid="word-${index}"]`) as
      | (Element & { __reactLayoutHandler?: (event: LayoutEvent) => void })
      | null;
    node?.__reactLayoutHandler?.({ nativeEvent: { layout: box }, timeStamp: 0 });
  });
};

/** How often the walk played each kind of step. */
interface Tally {
  holds: number;
  moves: number;
  releases: number;
  cancels: number;
  swipes: number;
  gone: number;
}

type Kind = 'show' | 'hold' | 'swipe' | 'redraw' | 'move' | 'release' | 'cancel' | 'gone';

/** The step drawn by `roll` for a view `shown` or gone, held or not. */
const kindOf = (shown: boolean, held: boolean, roll: number): Kind => {
  if (!shown) return 'show';
  if (!held) return roll < 0.6 ? 'hold' : roll < 0.8 ? 'swipe' : 'redraw';
  if (roll < 0.4) return 'move';
  if (roll < 0.55) return 'redraw';
  if (roll < 0.75) return 'release';
  return roll < 0.88 ? 'cancel' : 'gone';
};

/**
 * One generated walk of 30 steps over one made-up text and layout: the
 * hold's asks, the held word the screen keeps and every frame, against the
 * walk's own record of what the hold should be.
 */
const holdWalk = async (seed: number, tally: Tally): Promise<string[]> => {
  const faults: string[] = [];
  const next = random(100 + seed);
  const text = TEXTS[seed % TEXTS.length] as string;
  const boxes = layoutOf(next, shownWordsOf(text).length);
  const known = new Map(boxes.map((box, index) => [index, box] as const));
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const seen: Seen = { asks: [], held: Option.none() };
  const want: string[] = [];
  let view = viewOf(text, next);
  let shown = true;
  let held: Option.Option<number> = Option.none();
  let pan: PanConfig = { testID: 'reading-hold' };
  const draw = async () => {
    await act(async () =>
      root.render(<Holding text={text} view={view} shown={shown} seen={seen} />),
    );
    if (shown) await act(async () => lay(host, boxes));
  };
  const end = (touch: { x: number; y: number }, canceled: boolean) =>
    act(async () => {
      pan.onDeactivate?.({ ...touch, canceled });
      pan.onFinalize?.({ ...touch, canceled });
    });
  const play: Record<Kind, (touch: { x: number; y: number }) => Promise<void>> = {
    show: async () => {
      shown = true;
      view = viewOf(text, next);
      await draw();
    },
    hold: async (touch) => {
      pan = gestureOf('reading-hold');
      await act(async () => {
        pan.onBegin?.(touch);
        pan.onActivate?.(touch);
      });
      held = wordAt(touch.x, touch.y, known);
      want.push('hold');
      tally.holds += 1;
    },
    swipe: async (touch) => {
      const swipe = gestureOf('reading-hold');
      await act(async () => {
        swipe.onBegin?.(touch);
        swipe.onFinalize?.({ ...touch, canceled: true });
      });
      tally.swipes += 1;
    },
    redraw: async () => {
      view = viewOf(text, next);
      await draw();
    },
    move: async (touch) => {
      await act(async () => pan.onUpdate?.(touch));
      held = wordAt(touch.x, touch.y, known);
      tally.moves += 1;
    },
    release: async (touch) => {
      await end(touch, false);
      want.push(`seek ${Option.getOrElse(Option.map(held, String), () => 'none')}`);
      held = Option.none();
      tally.releases += 1;
    },
    cancel: async (touch) => {
      await end(touch, true);
      want.push('letGo');
      held = Option.none();
      tally.cancels += 1;
    },
    gone: async (touch) => {
      shown = false;
      await draw();
      await end(touch, false);
      held = Option.none();
      tally.gone += 1;
    },
  };
  await draw();
  for (let step = 0; step < 30 && faults.length === 0; step++) {
    const at = `seed ${seed} step ${step}`;
    const kind = kindOf(shown, Option.isSome(held), next());
    await play[kind](pointOf(next, boxes));
    if (seen.asks.join('|') !== want.join('|'))
      faults.push(`${at}: asked ${seen.asks.join('|')} want ${want.join('|')}`);
    if (named(seen.held) !== named(held))
      faults.push(`${at}: the screen holds ${named(seen.held)} want ${named(held)}`);
    if (!shown) continue;
    const selected = Option.match(held, {
      onNone: () => view.current,
      onSome: (word) => ({ first: word, last: word }),
    });
    faults.push(
      ...frameFaults(
        host,
        text,
        Option.getOrElse(held, () => view.lit),
        selected,
        at,
      ),
    );
  }
  await act(async () => root.unmount());
  host.remove();
  return faults;
};

/**
 * The nearest props at or above `element` holding `name`, read from the
 * root's current fiber tree, where react-native-web draws no DOM for them
 * (VoiceOver's actions). The node's own fiber may be the stale alternate,
 * so the walk starts at the root's current fiber.
 */
const propsOf = (element: Element, name: string): Record<string, unknown> => {
  const root = rootFiberOf(element);
  const path: Fiber[] = [];
  const visit = (fiber: Fiber | null | undefined): boolean => {
    for (let each = fiber; each; each = each.sibling) {
      path.push(each);
      if (each.stateNode === element || visit(each.child)) return true;
      path.pop();
    }
    return false;
  };
  visit(root);
  return (
    path
      .map(fiberProps)
      .toReversed()
      .find((each) => name in each) ?? {}
  );
};

describe('the reading view', () => {
  it('lights each word to the read point and selects the current range, frame after frame', async () => {
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    const next = random(7);
    const faults: string[] = [];
    for (let step = 0; step < 60; step++) {
      const text = TEXTS[step % TEXTS.length] as string;
      const view = viewOf(text, next);
      await act(async () => root.render(<ReadingView text={text} view={view} hold={IDLE} />));
      faults.push(...frameFaults(host, text, view.lit, view.current, `step ${step}`));
    }
    await act(async () => root.unmount());
    host.remove();
    expect(faults).toEqual([]);
  });

  it('holds the word under the finger and asks once for the pause, the seek or the resume', async () => {
    const faults: string[] = [];
    const tally: Tally = { holds: 0, moves: 0, releases: 0, cancels: 0, swipes: 0, gone: 0 };
    for (let seed = 0; seed < 8 && faults.length === 0; seed++)
      faults.push(...(await holdWalk(seed, tally)));
    expect(faults).toEqual([]);
    expect(tally.holds).toBeGreaterThan(30);
    expect(tally.moves).toBeGreaterThan(15);
    expect(tally.releases).toBeGreaterThan(8);
    expect(tally.cancels).toBeGreaterThan(4);
    expect(tally.swipes).toBeGreaterThan(8);
    expect(tally.gone).toBeGreaterThan(3);
  });

  it('offers VoiceOver Read from here on each word, which asks for one seek to that word', async () => {
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    const next = random(11);
    const faults: string[] = [];
    for (let step = 0; step < 8; step++) {
      const text = TEXTS[step % TEXTS.length] as string;
      const view = viewOf(text, next);
      const asks: string[] = [];
      const hold: Hold = { ...IDLE, onSeek: (word) => void asks.push(`seek ${word}`) };
      await act(async () => root.render(<ReadingView text={text} view={view} hold={hold} />));
      const words = [...(host.querySelector('[data-testid="reading"]')?.children ?? [])];
      faults.push(...voiceOverFaults(host).map((fault) => `step ${step} ${fault}`));
      for (const [index, node] of words.entries()) {
        const at = `step ${step} word-${index}`;
        const props = propsOf(node, 'accessibilityActions');
        const actions = JSON.stringify(props['accessibilityActions']);
        if (actions !== JSON.stringify([{ name: 'readFromHere', label: 'Read from here' }]))
          faults.push(`${at}: actions ${actions}`);
        if (props['testID'] !== `word-${index}`) faults.push(`${at}: actions on a wrapper`);
        if (props['accessible'] === false) faults.push(`${at}: not its own element`);
        const run = props['onAccessibilityAction'] as
          | ((event: { readonly nativeEvent: { readonly actionName: string } }) => void)
          | undefined;
        await act(async () => {
          run?.({ nativeEvent: { actionName: 'activate' } });
          run?.({ nativeEvent: { actionName: 'readFromHere' } });
        });
        if (asks.join('|') !== `seek ${index}`) faults.push(`${at}: asked ${asks.join('|')}`);
        asks.length = 0;
      }
    }
    await act(async () => root.unmount());
    host.remove();
    expect(faults).toEqual([]);
  });
});
