/**
 * The tab row pinned over the home list (`PinnedTabs`), mounted in a
 * browser's document (`src/test/setup.ts`) with the real tab row, driven by
 * the list's offset alone: over generated scroll paths, from the list's top
 * to deep in it with turns at random, the pinned row is in reach exactly
 * while `revealAt` says shown, and the layer holds the tab row and no field.
 */

import { describe, expect, it } from 'bun:test';
import { RegistryProvider } from '@effect/atom-react';
import { Option } from 'effect';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { makeMutable, type SharedValue } from 'react-native-reanimated';

import { PinnedTabs, useTabReveal } from './PinnedTabs';
import { hidden, type Reveal, revealAt } from './reveal';
import { TabRow } from './TabRow';
import type { TabName } from './tabs';

const names: ReadonlyArray<TabName> = ['Sections', 'Lists', 'Topics', 'Metres', 'Scripture'];

/** The home list's title, 49 pt at the reader's usual text size: the row's resting place. */
const rest = 49;
const height = 48;

/** A seeded run of numbers, so a failing path comes back the same. */
const seeded = (start: number) => {
  let seed = start;
  return (below: number) => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed % below;
  };
};

/** A scroll path from the list's top: runs down and up of random lengths, now and then a fling or a pull past the top. */
const path = (next: (below: number) => number): ReadonlyArray<number> => {
  const out: Array<number> = [];
  let at = 0;
  for (let run = 0; run < 6; run += 1) {
    // Down on even runs, up on odd ones.
    const way = 1 - 2 * (run % 2);
    const steps = 1 + next(6);
    for (let step = 0; step < steps; step += 1) {
      // One step in ten a fling's frame of 400 to 2000 pt, else a drag's of 1 to 40.
      const fling = Number(next(10) === 0);
      const by = fling * (400 + next(1600)) + (1 - fling) * (1 + next(40));
      at = Math.min(6000, Math.max(-40, at + way * by));
      out.push(at);
    }
  }
  return out;
};

/** The pinned row over a list at `scroll`, the tab chosen told to `onSelect`. */
function Pinned({
  scroll,
  onSelect,
}: {
  readonly scroll: SharedValue<number>;
  readonly onSelect: (name: TabName) => void;
}) {
  const reveal = useTabReveal(scroll, rest, height);
  return (
    <PinnedTabs reveal={reveal}>
      <TabRow names={names} selected="Sections" onSelect={onSelect} />
    </PinnedTabs>
  );
}

/** True when `element` or a layer holding it is hidden from assistive technology. */
const unreached = (element: Element) =>
  Option.isSome(Option.fromNullishOr(element.closest('[aria-hidden="true"]')));

const mount = (onSelect: (name: TabName) => void = () => {}) => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const scroll = makeMutable(0);
  act(() =>
    root.render(
      <RegistryProvider>
        <Pinned scroll={scroll} onSelect={onSelect} />
      </RegistryProvider>,
    ),
  );
  const layer = () => Option.fromNullishOr(host.querySelector('[data-testid="shown-tabs"]'));
  /** The elements under the layer `selector` finds, none when there is no layer. */
  const inLayer = (selector: string) =>
    Option.match(layer(), {
      onNone: () => [],
      onSome: (found) => [...found.querySelectorAll(selector)],
    });
  const scrollTo = (at: number) => act(() => void (scroll.value = at));
  const close = () => {
    act(() => root.unmount());
    host.remove();
  };
  return { layer, inLayer, scrollTo, close };
};

describe('the tab row pinned over the home list', () => {
  it('is in reach exactly while revealAt says shown, over generated scroll paths', () => {
    const next = seeded(0x7ab5);
    const misses: Array<string> = [];
    const seen = { shown: 0, hidden: 0 };
    for (let run = 0; run < 24; run += 1) {
      const pinned = mount();
      let model: Reveal = hidden(rest);
      for (const at of path(next)) {
        pinned.scrollTo(at);
        model = revealAt(model, at, rest);
        const shown = Option.exists(pinned.layer(), (layer) => !unreached(layer));
        seen.shown += Number(model.shown);
        seen.hidden += Number(!model.shown);
        if (shown !== model.shown) misses.push(`path ${run} at ${at}: ${shown} not ${model.shown}`);
      }
      pinned.close();
    }
    expect(misses).toEqual([]);
    // The paths reach both states, many times each.
    expect(Math.min(seen.shown, seen.hidden)).toBeGreaterThan(50);
  });

  it('holds the tab row and no field', () => {
    const pinned = mount();
    pinned.scrollTo(3000);
    pinned.scrollTo(2980);
    const tabs = pinned.inLayer('[role="tab"]').map((tab) => tab.getAttribute('aria-label'));
    const fields = pinned.inLayer(
      'input, textarea, [placeholder], [aria-label="Number, title or first line"]',
    ).length;
    pinned.close();
    expect({ tabs, fields }).toEqual({ tabs: [...names], fields: 0 });
  });

  it('chooses a tab tapped on it while shown', () => {
    const chosen: Array<TabName> = [];
    const pinned = mount((name) => chosen.push(name));
    pinned.scrollTo(3000);
    pinned.scrollTo(2980);
    const [topics] = pinned.inLayer('[role="tab"][aria-label="Topics"]');
    act(() => {
      if (topics instanceof HTMLElement) topics.click();
    });
    pinned.close();
    expect(chosen).toEqual(['Topics']);
  });
});
