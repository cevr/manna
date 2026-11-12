/**
 * The find bar (`FindBar`) mounted in a browser's document
 * (`src/test/setup.ts`) in each of its rows, with a stand-in `#`. While the
 * drums are open, every view of the bar but the `#` lets a touch through to
 * the drums' backdrop beneath it, which closes the drums; with the drums
 * shut, the bar's controls take their touches. While the key button's wheel
 * is open (`wheelOpen`) the bar fades and takes no touch at all.
 *
 * A view lets a touch through when its computed `pointer-events` is `none`:
 * react-native-web writes `box-none` as `none` on the view itself and `auto`
 * on its children, and `none` as `none` on the view and its children, which
 * is how iOS hit-tests the same props.
 */

import { describe, expect, it } from 'bun:test';
import { RegistryContext, RegistryProvider } from '@effect/atom-react';
import { Option } from 'effect';
import * as AtomRegistry from 'effect/reactivity/AtomRegistry';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Pressable, Text } from 'react-native';

import { wheelOpen } from '~/player/bar';
import { searchAt, type Searching, searchOpen } from '~/reader/place';

import { FindBar } from './FindBar';
import { Tiles, tiles } from './finding';

/** The screens the bar stands on: the home list, and a hymn page, where the bar is the same. */
const HOME = '/';
const PAGE = '/hymns/8';

/** The `#` the player layer hands the bar, as `LivePlayer` draws it: one pressable, on a disk or not. */
const hash = () => (
  <Pressable testID="find-number" role="button" aria-label="Find a hymn by number">
    <Text>#</Text>
  </Pressable>
);

const rows: ReadonlyArray<{
  readonly name: string;
  readonly path: string;
  readonly open: Option.Option<Searching>;
  readonly shown: Tiles;
}> = [
  { name: 'folded', path: HOME, open: Option.none(), shown: Tiles.Hidden() },
  { name: 'open', path: HOME, open: searchAt(HOME, 'field'), shown: Tiles.Hidden() },
  {
    name: 'open for About this hymn',
    path: HOME,
    open: searchAt(HOME, 'about'),
    shown: Tiles.Hidden(),
  },
  {
    name: 'tiles',
    path: HOME,
    open: Option.none(),
    shown: Tiles.Shown({ stood: { offset: 0, cover: 0 } }),
  },
  { name: 'folded on a hymn page', path: PAGE, open: Option.none(), shown: Tiles.Hidden() },
  { name: 'open on a hymn page', path: PAGE, open: searchAt(PAGE, 'field'), shown: Tiles.Hidden() },
];

/**
 * `view`'s `pointer-events`, inherited as CSS inherits it: the test document
 * computes only the value a rule sets on the view itself.
 */
const pointerEvents = (view: Element): string => {
  const own = getComputedStyle(view).pointerEvents;
  if (own !== '') return own;
  return Option.match(Option.fromNullishOr(view.parentElement), {
    onNone: () => 'auto',
    onSome: pointerEvents,
  });
};

/** `view`'s tag, with its test id when it has one. */
const named = (view: Element) =>
  Option.match(Option.fromNullishOr(view.getAttribute('data-testid')), {
    onNone: () => view.tagName.toLowerCase(),
    onSome: (id) => `${view.tagName.toLowerCase()}#${id}`,
  });

/** Mounts the bar on the screen at `path` with the search `open` and `shown` tiles, the drums open or shut, and returns the views of it that take a touch, the `#` left out. */
const touchable = (
  path: string,
  open: Option.Option<Searching>,
  shown: Tiles,
  drumsOpen: boolean,
): ReadonlyArray<string> => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  act(() =>
    root.render(
      <RegistryProvider
        initialValues={[
          [searchOpen, open],
          [tiles, shown],
        ]}
      >
        <FindBar path={path} bottom={0} drums={<></>} drumsOpen={drumsOpen} hash={hash} />
      </RegistryProvider>,
    ),
  );
  const find = Option.fromNullishOr(host.querySelector('[data-testid="find"]'));
  const bar = Option.fromNullishOr(host.querySelector('[data-testid="find-bar"]'));
  const views = [
    ...Option.toArray(find),
    ...Option.toArray(bar),
    ...Option.toArray(bar).flatMap((found) => [...found.querySelectorAll('*')]),
  ];
  const taking = views
    .filter((view) =>
      Option.isNone(Option.fromNullishOr(view.closest('[data-testid="find-number"]'))),
    )
    .filter((view) => pointerEvents(view) !== 'none')
    .map(named);
  act(() => root.unmount());
  host.remove();
  return taking;
};

describe('the find bar over the open drums', () => {
  it('in every row, every view of the bar but the # lets a touch through to the backdrop', () => {
    const taking = rows.map(({ name, path, open, shown }) => [
      name,
      touchable(path, open, shown, true),
    ]);
    expect(taking).toEqual(rows.map(({ name }) => [name, []]));
  });

  it('with the drums shut, its controls take a touch', () => {
    expect(touchable(PAGE, Option.none(), Tiles.Hidden(), false)).toEqual(
      expect.arrayContaining(['button#find-search']),
    );
    expect(touchable(PAGE, searchAt(PAGE, 'field'), Tiles.Hidden(), false)).toEqual(
      expect.arrayContaining(['input#find-box', 'button#find-cancel']),
    );
  });
});

describe('the find bar under the key button’s wheel', () => {
  it('fades to at most 0.35 and takes no touch while the wheel is open, and is whole again once it shuts', () => {
    const registry = AtomRegistry.make();
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    act(() =>
      root.render(
        <RegistryContext value={registry}>
          <FindBar path={PAGE} bottom={0} drums={<></>} drumsOpen={false} hash={hash} />
        </RegistryContext>,
      ),
    );
    const find = Option.getOrThrow(
      Option.fromNullishOr(host.querySelector('[data-testid="find"]')),
    );
    const seen = () => Number.parseFloat(getComputedStyle(find).opacity || '1');
    const taking = () =>
      [find, ...find.querySelectorAll('*')]
        .filter((view) => pointerEvents(view) !== 'none')
        .map(named);
    act(() => registry.set(wheelOpen, true));
    const open = { seen: seen(), taking: taking() };
    act(() => registry.set(wheelOpen, false));
    const shut = { seen: seen(), taking: taking() };
    act(() => root.unmount());
    host.remove();
    registry.dispose();
    expect({ dim: open.seen <= 0.35, taking: open.taking }).toEqual({ dim: true, taking: [] });
    expect(shut.seen).toBe(1);
    expect(shut.taking).toEqual(
      expect.arrayContaining(['button#find-search', 'button#find-number']),
    );
  });
});
