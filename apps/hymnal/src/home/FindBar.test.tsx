import { describe, expect, it } from 'bun:test';
import { RegistryProvider } from '@effect/atom-react';
import { Option } from 'effect';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Pressable, Text } from 'react-native';

import { searchAt, type Searching, searchOpen } from '~/reader/place';

import { FindBar } from './FindBar';
import { Tiles, tiles } from './finding';

const HOME = '/';
const PAGE = '/hymns/8';

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

const pointerEvents = (view: Element): string => {
  const own = getComputedStyle(view).pointerEvents;
  if (own !== '') return own;
  return Option.match(Option.fromNullishOr(view.parentElement), {
    onNone: () => 'auto',
    onSome: pointerEvents,
  });
};

const named = (view: Element) =>
  Option.match(Option.fromNullishOr(view.getAttribute('data-testid')), {
    onNone: () => view.tagName.toLowerCase(),
    onSome: (id) => `${view.tagName.toLowerCase()}#${id}`,
  });

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
