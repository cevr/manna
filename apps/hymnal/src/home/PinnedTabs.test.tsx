import { describe, expect, it } from 'bun:test';
import { RegistryProvider } from '@effect/atom-react';
import { Option } from 'effect';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { makeMutable, type SharedValue } from 'react-native-reanimated';

import { PinnedTabs, type TabReveal, useTabReveal } from './PinnedTabs';
import { hidden, type Reveal, revealAt, travel } from './reveal';
import { TabRow } from './TabRow';
import type { TabName } from './tabs';

const names: ReadonlyArray<TabName> = ['Sections', 'Lists', 'Topics', 'Metres', 'Scripture'];

const rest = 49;
const height = 48;

const seeded = (start: number) => {
  let seed = start;
  return (below: number) => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed % below;
  };
};

const path = (next: (below: number) => number): ReadonlyArray<number> => {
  const out: Array<number> = [];
  let at = 0;
  for (let run = 0; run < 6; run += 1) {
    const way = 1 - 2 * (run % 2);
    const steps = 1 + next(6);
    for (let step = 0; step < steps; step += 1) {
      const fling = Number(next(10) === 0);
      const by = fling * (400 + next(1600)) + (1 - fling) * (1 + next(40));
      at = Math.min(6000, Math.max(-40, at + way * by));
      out.push(at);
    }
  }
  return out;
};

function Pinned({
  scroll,
  onSelect,
  onReveal,
}: {
  readonly scroll: SharedValue<number>;
  readonly onSelect: (name: TabName) => void;
  readonly onReveal: (reveal: TabReveal) => void;
}) {
  const reveal = useTabReveal(scroll, rest, height);
  onReveal(reveal);
  return (
    <PinnedTabs reveal={reveal}>
      <TabRow names={names} selected="Sections" onSelect={onSelect} />
    </PinnedTabs>
  );
}

const unreached = (element: Element) =>
  Option.isSome(Option.fromNullishOr(element.closest('[aria-hidden="true"]')));

const mount = (onSelect: (name: TabName) => void = () => {}) => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const scroll = makeMutable(0);
  const reveals: Array<TabReveal> = [];
  const onReveal = (reveal: TabReveal) => void reveals.splice(0, reveals.length, reveal);
  act(() =>
    root.render(
      <RegistryProvider>
        <Pinned scroll={scroll} onSelect={onSelect} onReveal={onReveal} />
      </RegistryProvider>,
    ),
  );
  const layer = () => Option.fromNullishOr(host.querySelector('[data-testid="shown-tabs"]'));
  const inLayer = (selector: string) =>
    Option.match(layer(), {
      onNone: () => [],
      onSome: (found) => [...found.querySelectorAll(selector)],
    });
  const scrollTo = (at: number) => act(() => void (scroll.value = at));
  const through = (offsets: ReadonlyArray<number>) => offsets.forEach(scrollTo);
  const inReach = () => Option.exists(layer(), (found) => !unreached(found));
  const tap = (at: number) =>
    act(() => {
      reveals.forEach((reveal) => reveal.jump(at));
      scroll.value = at;
    });
  const touch = () => act(() => reveals.forEach((reveal) => reveal.touch()));
  const cover = () => reveals.map((reveal) => reveal.cover.value);
  const close = () => {
    act(() => root.unmount());
    host.remove();
  };
  return { layer, inLayer, scrollTo, through, inReach, tap, touch, cover, close };
};

const frames = (from: number, to: number, step: number) => {
  const out: Array<number> = [];
  const sign = Math.sign(to - from);
  for (let at = from; sign * (to - at) > 0; at += sign * step) out.push(at);
  out.push(to);
  return out;
};

const tapOf = (next: (below: number) => number) => {
  const deep = rest + travel + 1 + next(40000);
  const shownAt = deep - travel - next(Math.min(deep - rest - 1 - travel, 600) + 1);
  const top = Number(next(6) === 0);
  const kept = top * next(rest + 1) + (1 - top) * (rest + 1 + next(40000));
  const short = Number(kept > rest && next(4) === 0);
  const landing = kept - short * next(Math.max(1, kept - rest + 1));
  const kinds = [() => 0, () => next(rest + 1), () => next(landing + 1)];
  const reports = Array.from({ length: 1 + next(4) }, () => kinds[next(3)]?.() ?? 0);
  return { deep, shownAt, kept, landing, reports: [...reports, landing] };
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
    expect(Math.min(seen.shown, seen.hidden)).toBeGreaterThan(50);
  });

  it('stays pinned, fully in, after a tap on a pinned tab, until the reader scrolls down the travel', () => {
    const next = seeded(0x91ab5);
    const misses: Array<string> = [];
    for (let run = 0; run < 16; run += 1) {
      const { deep, shownAt, kept, landing, reports } = tapOf(next);
      const at = `tap ${run} (shown at ${shownAt}, kept ${kept}, landing ${landing}, reports ${reports.join(' ')})`;
      const pinned = mount();
      pinned.through([deep, shownAt]);
      pinned.tap(kept);
      pinned.through(reports);
      const settled = { reach: pinned.inReach(), full: pinned.cover().join() === `${height}` };
      const want = { reach: landing > rest, full: landing > rest };
      if (settled.reach !== want.reach || settled.full !== want.full) {
        misses.push(
          `${at}: landed reach ${settled.reach} full ${settled.full}, not reach ${want.reach} full ${want.full}`,
        );
      }
      pinned.touch();
      const top = landing - Math.max(0, Math.min(120, landing - rest - travel));
      pinned.through([...frames(landing, top, 30), ...frames(top, top + travel - 1, 1)]);
      if (landing > rest && !pinned.inReach()) misses.push(`${at}: hidden short of the travel`);
      pinned.through(frames(top + travel - 1, top + 2 * travel, 1));
      if (pinned.inReach()) misses.push(`${at}: still shown after a downward scroll of the travel`);
      pinned.close();
    }
    expect(misses).toEqual([]);
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
