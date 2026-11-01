/**
 * The find bar (`FindBar`) mounted in a browser's document
 * (`src/test/setup.ts`) in each of its rows, with a stand-in `#`. While the
 * drums are open, every view of the bar but the `#` lets a touch through to
 * the drums' backdrop beneath it, which closes the drums; with the drums
 * shut, the bar's controls take their touches.
 *
 * A view lets a touch through when its computed `pointer-events` is `none`:
 * react-native-web writes `box-none` as `none` on the view itself and `auto`
 * on its children, and `none` as `none` on the view and its children, which
 * is how iOS hit-tests the same props.
 */

import { describe, expect, it } from 'bun:test';
import { RegistryProvider } from '@effect/atom-react';
import { Option } from 'effect';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Pressable, Text } from 'react-native';

import { type SearchMode, searchOpen } from '~/reader/place';

import { FindBar } from './FindBar';
import { Tiles, tiles } from './finding';

/** The `#` the player layer hands the bar, as `LivePlayer` draws it: one pressable, on a disk or not. */
const hash = () => (
  <Pressable testID="find-number" role="button" aria-label="Find a hymn by number">
    <Text>#</Text>
  </Pressable>
);

const rows: ReadonlyArray<{
  readonly name: string;
  readonly mode: SearchMode;
  readonly shown: Tiles;
}> = [
  { name: 'folded', mode: 'off', shown: Tiles.Hidden() },
  { name: 'open', mode: 'field', shown: Tiles.Hidden() },
  { name: 'open for About this hymn', mode: 'about', shown: Tiles.Hidden() },
  { name: 'tiles', mode: 'off', shown: Tiles.Shown({ stood: { offset: 0, cover: 0 } }) },
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

/** Mounts the bar in `mode` with `shown` tiles, the drums open or shut, and returns the views of it that take a touch, the `#` left out. */
const touchable = (mode: SearchMode, shown: Tiles, drumsOpen: boolean): ReadonlyArray<string> => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  act(() =>
    root.render(
      <RegistryProvider
        initialValues={[
          [searchOpen, mode],
          [tiles, shown],
        ]}
      >
        <FindBar bottom={0} drums={<></>} drumsOpen={drumsOpen} hash={hash} />
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
    const taking = rows.map(({ name, mode, shown }) => [name, touchable(mode, shown, true)]);
    expect(taking).toEqual(rows.map(({ name }) => [name, []]));
  });

  it('with the drums shut, its controls take a touch', () => {
    expect(touchable('off', Tiles.Hidden(), false)).toEqual(
      expect.arrayContaining(['button#find-search', 'button#find-all']),
    );
    expect(touchable('field', Tiles.Hidden(), false)).toEqual(
      expect.arrayContaining(['input#find-box', 'button#find-cancel']),
    );
  });
});
