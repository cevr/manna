/**
 * The phone's home list beneath `All at once` (`UnderTiles` in
 * `Home.native.tsx`), mounted in a browser's document (`src/test/setup.ts`)
 * with the real tiles and tab row over stand-in rows: while the tiles show,
 * assistive technology reaches only their heading, Done and the tiles, and
 * the list, its tabs and the title's buttons are hidden beneath them; once
 * the tiles close, the list is reachable again.
 */

import { describe, expect, it } from 'bun:test';
import { RegistryProvider } from '@effect/atom-react';
import { Option } from 'effect';
import { act, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { Pressable, Text } from 'react-native';

import bundled from 'virtual:hymnal-indexes';

import { hymns } from '~/hymns/hymns';

import { AllAtOnce } from './AllAtOnce';
import { UnderTiles } from './Home.native';
import { TabRow } from './TabRow';
import { tabNamed, tabsOf } from './tabs';

const tabs = tabsOf({ hymns, favourites: [], recent: [], indexes: bundled });
const tab = tabNamed(tabs, 'Topics');

/** The home screen's layers: tab row, five rows and the title's two buttons, under `tiles`. */
const home = (tiles: Option.Option<ReactNode>) => (
  <RegistryProvider>
    <UnderTiles tiles={tiles}>
      <TabRow names={tabs.map((t) => t.name)} selected={tab.name} onSelect={() => {}} />
      {[1, 2, 3, 4, 5].map((n) => (
        <Pressable key={n} role="link" aria-label={String(n)}>
          <Text>{n}</Text>
        </Pressable>
      ))}
      <Pressable role="button" aria-label="All at once" />
      <Pressable role="button" aria-label="Settings" />
    </UnderTiles>
  </RegistryProvider>
);

const tiles = Option.some(<AllAtOnce tab={tab} at={0} onPick={() => {}} onClose={() => {}} />);

/** True when `element` or a layer holding it is hidden from assistive technology. */
const hidden = (element: Element) =>
  Option.isSome(Option.fromNullishOr(element.closest('[aria-hidden="true"]')));

/** How many rows, tabs, title buttons, Done buttons and tiles assistive technology reaches. */
const reach = (host: HTMLElement) => {
  const count = (selector: string) =>
    [...host.querySelectorAll(selector)].filter((element) => !hidden(element)).length;
  const buttons = (label: string) => count(`[role="button"][aria-label="${label}"]`);
  return {
    rows: count('[role="link"]'),
    tabs: count('[role="tab"]'),
    title: buttons('All at once') + buttons('Settings'),
    done: buttons('Done'),
    tiles: count('[role="button"][aria-label*="hymn"]'),
  };
};

describe('the phone home list beneath All at once', () => {
  it('is out of reach while the tiles show, and in reach again once they close', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    act(() => root.render(home(Option.none())));
    const before = reach(host);
    act(() => root.render(home(tiles)));
    const open = reach(host);
    act(() => root.render(home(Option.none())));
    const after = reach(host);
    act(() => root.unmount());
    host.remove();
    const list = { rows: 5, tabs: tabs.length, title: 2, done: 0, tiles: 0 };
    expect({ before, open: { ...open, tiles: open.tiles > 0 }, after }).toEqual({
      before: list,
      open: { rows: 0, tabs: 0, title: 0, done: 1, tiles: true },
      after: list,
    });
  });
});
