/* oxlint-disable effect/noGlobals, effect/noAsyncFunction -- Bun's loader takes the list's stand-in as source text, so the paths it imports are written into it as JSON literals; the screens are imported only once the stand-in is registered. */
/* oxlint-disable effect/noTestLifecycleHooks -- a React screen test: the safe area is set for the file and animations land after each case. */

/**
 * Acceptance (checkbulk S1): the find bar stands where the page the route
 * draws puts it, in the real player layer.
 *
 * - An unknown hymn number's route draws no hymn page and no bar (the
 *   route's `NoHymn`); with the player idle, no find bar stands there.
 * - The home list over a hymn page that still says it shows (a link to `/`
 *   from a hymn page), with the player idle, docks the find bar.
 *
 * Mounted as `findglide.slow.test.tsx` mounts the layers: the player layer
 * (`LivePlayer`) over the stack's wrapper (`StackBottom`) over stand-in
 * screens, in a browser's document (`src/test/setup.ts`). Numbers only: no
 * hymn's words are read or printed.
 */

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'bun:test';
import { plugin } from 'bun';
import { Option } from 'effect';
import * as AtomRegistry from 'effect/reactivity/AtomRegistry';

const dep = (name: string) => JSON.stringify(Bun.resolveSync(name, import.meta.dir));
plugin({
  name: 'findplace-plain-list',
  setup(build) {
    build.module('@legendapp/list/reanimated', () => ({
      contents: `import { createElement as h, Fragment, isValidElement } from ${dep('react')};
import { View } from ${dep('react-native-web')};
const node = (part) => (part == null ? null : isValidElement(part) ? part : h(part));
export function AnimatedLegendList(props) {
  const rows = (props.data ?? []).map((item, index) =>
    h(Fragment, { key: props.keyExtractor ? props.keyExtractor(item, index) : index },
      props.renderItem({ item, index, extraData: props.extraData })));
  return h(View, null, node(props.ListHeaderComponent),
    rows.length > 0 ? rows : node(props.ListEmptyComponent), node(props.ListFooterComponent));
}
`,
      loader: 'js',
    }));
  },
});

const { RegistryContext } = await import('@effect/atom-react');
const { act } = await import('react');
const { createRoot } = await import('react-dom/client');
const { View } = await import('react-native');
const { landAnimations } = await import('~/test/reanimated');
const { DOCKED_LIFT } = await import('~/player/bar');
const { LivePlayer } = await import('~/player/LivePlayer');
const { useShowsPage } = await import('~/player/page');
const { StackBottom } = await import('~/player/StackBottom');
const { pathname, safeArea } = await import('~/test/one');

/** The device's bottom inset: a phone's home indicator. */
const INSET = 34;
/** The bar docked on the home list: its bottom over the window's. */
const DOCKED = INSET + DOCKED_LIFT;

beforeAll(() => {
  Object.assign(safeArea, { bottom: INSET });
});
afterAll(() => {
  Object.assign(safeArea, { bottom: 0 });
});
afterEach(() => landAnimations());

/** A stand-in hymn page: it shows hymn `n`, so the bar and its find bar stand over it. */
function Page({ n }: { readonly n: number }) {
  useShowsPage({ number: n, title: 'Stand-in' });
  return <View testID={`page-${n}`} />;
}

type Screen = { readonly path: string; readonly draw: () => React.ReactNode };
const home: Screen = { path: '/', draw: () => <View key="home" testID="home" /> };
const hymn = (n: number): Screen => ({ path: `/hymns/${n}`, draw: () => <Page key={n} n={n} /> });
/** The hymn route's `NoHymn` for a number the book does not hold: it says no page shows and draws no bar. */
const noHymn = (segment: string): Screen => ({
  path: `/hymns/${segment}`,
  draw: () => <View key={`none-${segment}`} testID="no-hymn" />,
});

/** The stack `screens`, the last shown, over a registry of its own. */
const mount = (...screens: ReadonlyArray<Screen>) => {
  const registry = AtomRegistry.make();
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  pathname.current = screens.at(-1)?.path ?? '/';
  act(() =>
    root.render(
      <RegistryContext value={registry}>
        <LivePlayer>
          <StackBottom>{screens.map((screen) => screen.draw())}</StackBottom>
        </LivePlayer>
      </RegistryContext>,
    ),
  );
  act(() => landAnimations());
  const find = () => Option.fromNullishOr(host.querySelector<HTMLElement>('[data-testid="find"]'));
  return {
    find,
    [Symbol.dispose]: () => {
      act(() => root.unmount());
      host.remove();
      pathname.current = '/';
    },
  };
};

const style = (element: Element) => getComputedStyle(element);

/** A transform's move along `axis`, 0 when it draws none. */
const moved = (element: Element, axis: 'X' | 'Y') => {
  const drawn = new RegExp(`translate${axis}\\((-?[\\d.]+)px\\)`).exec(style(element).transform);
  return Number(drawn?.[1] ?? 0);
};

/** Where the bar stands: its bottom over the window's, as its `bottom` and any move up draw it. */
const standing = (find: HTMLElement) =>
  Math.round(Number.parseFloat(style(find).bottom) - moved(find, 'Y'));

describe('the find bar follows the page the route draws', () => {
  it('stands nowhere on an unknown hymn number, as no bar is drawn there', () => {
    for (const segment of ['9999', '0', 'abc']) {
      using phone = mount(home, noHymn(segment));
      expect({ segment, find: Option.isSome(phone.find()) }).toEqual({ segment, find: false });
    }
  });

  it('docks on the home list over a hymn page that still says it shows', () => {
    using phone = mount(hymn(3), home);
    expect({
      find: Option.map(phone.find(), standing),
    }).toEqual({ find: Option.some(DOCKED) });
  });
});
