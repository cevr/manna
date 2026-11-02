/* oxlint-disable effect/noGlobals, effect/noAsyncFunction, effect/noReduceAccumulatorCopy -- Bun's loader takes the list's stand-in as source text, so the paths it imports are written into it as JSON literals; the screens are imported only once the stand-in is registered; the stack model folds a handful of steps. */

/**
 * A hymn chosen on a hymn page takes that page's place in the stack (owner,
 * 2026-11-01: "when using the hymn number dial inside another hymn, it
 * should [not push] a new [screen but] replace the current hymn", then
 * "same with search"). The `#` drums' `Open` and a search's result, used on
 * a hymn page, replace the page, so Back returns to where the reader came
 * from, never to the hymn just left; the hymn the page already shows stays,
 * and nothing moves. Off a hymn page (the home list) both push as before.
 *
 * Mounted as the layout nests them: the player layer (`LivePlayer`, the
 * find bar, the `#` and its drums) over the stack's wrapper (`StackBottom`,
 * the search's results) over the shown screens, in a browser's document
 * (`src/test/setup.ts`). A stand-in hymn page says it shows its hymn as a
 * page does (`useShowsPage`), so the bar and its find bar stand over it;
 * the home list and Recent are stand-ins too, since the find bar and the
 * results belong to the player layer and the wrapper. The results are the
 * real `HymnList.native` and its real rows, pressed as a reader presses
 * them; only LegendList is a plain list (it draws no row without a layout,
 * which the document has none of), so this file runs in a process of its
 * own (`test:slow`).
 *
 * The router's steps are read from the `one` stand-in: a pushing link's
 * press in `opened`, and `useRouter`'s steps and a replacing link's press
 * (`useLinkTo({ href, replace: true })`, One's `REPLACE`) in `routed`. A
 * small stack model applies them, then Back. Numbers only: no hymn's words
 * are read or printed.
 */

import { describe, expect, it } from 'bun:test';
import { plugin } from 'bun';
import { Option } from 'effect';
import * as AtomRegistry from 'effect/reactivity/AtomRegistry';

const dep = (name: string) => JSON.stringify(Bun.resolveSync(name, import.meta.dir));
plugin({
  name: 'numreplace-plain-list',
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
const { find, Find } = await import('~/player/bar');
const { LivePlayer } = await import('~/player/LivePlayer');
const { useShowsPage } = await import('~/player/page');
const { StackBottom } = await import('~/player/StackBottom');
const { modeAt, pagesFrom, searchOpen, searchQuery } = await import('~/reader/place');
const { opened, pathname, routed } = await import('~/test/one');

/** A stand-in hymn page: it shows hymn `n`, so the bar and its find bar stand over it. */
function Page({ n }: { readonly n: number }) {
  useShowsPage({ number: n, title: 'Stand-in' });
  return <View testID={`page-${n}`} />;
}

type Screen = { readonly path: string; readonly draw: () => React.ReactNode };

const home: Screen = { path: '/', draw: () => <View key="home" testID="home" /> };
const recent: Screen = { path: '/recent', draw: () => <View key="recent" testID="recent" /> };
const hymn = (n: number): Screen => ({ path: `/hymns/${n}`, draw: () => <Page key={n} n={n} /> });

/** The stack `screens`, the last shown, over a registry of its own; `show` draws another stack over the same registry. */
const mount = (...screens: ReadonlyArray<Screen>) => {
  routed.splice(0);
  opened.splice(0);
  const registry = AtomRegistry.make();
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const show = (...stack: ReadonlyArray<Screen>) => {
    pathname.current = stack.at(-1)?.path ?? '/';
    act(() =>
      root.render(
        <RegistryContext value={registry}>
          <LivePlayer>
            <StackBottom>{stack.map((screen) => screen.draw())}</StackBottom>
          </LivePlayer>
        </RegistryContext>,
      ),
    );
  };
  show(...screens);
  return {
    host,
    registry,
    show,
    paths: screens.map((screen) => screen.path),
    [Symbol.dispose]: () => {
      act(() => root.unmount());
      host.remove();
      pathname.current = '/';
    },
  };
};
type Phone = ReturnType<typeof mount>;

const byId = (host: HTMLElement, id: string) =>
  Option.fromNullishOr(host.querySelector<HTMLElement>(`[data-testid="${id}"]`));
const button = (host: HTMLElement, label: string) =>
  Option.fromNullishOr(host.querySelector<HTMLElement>(`[role="button"][aria-label="${label}"]`));
const box = (host: HTMLElement) => Option.fromNullishOr(host.querySelector('input'));
/** A press on `element`, which must be there. */
const press = (what: string, element: Option.Option<HTMLElement>) => {
  expect({ [what]: Option.isSome(element) }).toEqual({ [what]: true });
  act(() => Option.map(element, (found) => found.click()));
};
const type = (host: HTMLElement, words: string) =>
  act(() =>
    Option.map(box(host), (input) => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, words);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }),
  );
/** The search's result row of hymn `n`: the link around its number. */
const row = (host: HTMLElement, n: number) =>
  Option.fromNullishOr(
    [...host.querySelectorAll<HTMLElement>('[data-testid="search"] [data-testid="row-number"]')]
      .find((number) => number.textContent === String(n))
      ?.closest<HTMLElement>('[role="link"]'),
  );

/** The router's steps since the mount: `routed` as it stands, then each pushing link's href. */
const steps = () => [...routed, ...opened.map((href) => `push ${href}`)];

/** The stack `paths` after `taken`, then Back. */
const backFrom = (paths: ReadonlyArray<string>, taken: ReadonlyArray<string>) =>
  [...taken, 'back'].reduce<ReadonlyArray<string>>((stack, step) => {
    const [verb, href = ''] = step.split(' ');
    if (verb === 'push') return [...stack, href];
    if (verb === 'replace') return [...stack.slice(0, -1), href];
    if (verb === 'back') return stack.slice(0, -1);
    return [...stack, `unknown step ${step}`];
  }, paths);

/** The `#`, the drums turned to `n` (as each detent's `dialFind` leaves them), and `Open`. */
const dialAndOpen = (phone: Phone, n: number) => {
  press('#', byId(phone.host, 'find-number'));
  act(() => phone.registry.set(find, Find.Open({ number: n })));
  press('Open', byId(phone.host, 'find-open'));
};

/** `Search`, the query `words`, and a press on hymn `n`'s result. */
const searchAndOpen = (phone: Phone, words: string, n: number) => {
  press('Search', button(phone.host, 'Search'));
  type(phone.host, words);
  press(`result ${n}`, row(phone.host, n));
};

describe('the `#` drums’ Open', () => {
  it.each([
    ['the home list', [home], ['push /hymns/100'], ['/']],
    ['a hymn page over the home list', [home, hymn(8)], ['replace /hymns/100'], ['/']],
    ['a hymn page over Recent', [home, recent, hymn(8)], ['replace /hymns/100'], ['/', '/recent']],
  ] as const)(
    'on %s: the hymn dialled opens, and Back returns where the reader came from',
    (_, screens, want, back) => {
      using phone = mount(...screens);
      dialAndOpen(phone, 100);
      const taken = steps();
      expect({
        steps: taken,
        back: backFrom(phone.paths, taken),
        drums: phone.registry.get(find)._tag,
      }).toEqual({ steps: [...want], back: [...back], drums: 'Closed' });
    },
  );

  it('on the hymn page it shows: the page stays in place and the drums close', () => {
    using phone = mount(home, hymn(8));
    dialAndOpen(phone, 8);
    expect({ steps: steps(), drums: phone.registry.get(find)._tag }).toEqual({
      steps: [],
      drums: 'Closed',
    });
  });
});

describe('a search’s result', () => {
  it('on the home list pushes its hymn over the results, which stay open under it', () => {
    using phone = mount(home);
    searchAndOpen(phone, '100', 100);
    const taken = steps();
    expect({
      steps: taken,
      back: backFrom(phone.paths, taken),
      searchAt: modeAt(phone.registry.get(searchOpen), '/'),
      query: phone.registry.get(searchQuery),
    }).toEqual({ steps: ['push /hymns/100'], back: ['/'], searchAt: 'field', query: '100' });
  });

  it.each([
    ['over the home list', [home, hymn(8)]],
    ['over Recent', [home, recent, hymn(8)]],
  ] as const)('on a hymn page %s replaces the page and closes the search', (_, screens) => {
    using phone = mount(...screens);
    searchAndOpen(phone, '100', 100);
    const taken = steps();
    const after = {
      steps: taken,
      back: backFrom(phone.paths, taken),
      open: Option.isSome(phone.registry.get(searchOpen)),
      query: phone.registry.get(searchQuery),
    };
    // Back lands on the screen under the page replaced: no results stand over it.
    phone.show(...screens.slice(0, -1));
    const landed = { results: Option.isSome(byId(phone.host, 'search')) };
    // The page left, opened again later, shows its folded find bar: no search waits there.
    phone.show(...screens);
    const again = {
      results: Option.isSome(byId(phone.host, 'search')),
      search: Option.isSome(button(phone.host, 'Search')),
      box: Option.isSome(box(phone.host)),
    };
    expect({ after, landed, again }).toEqual({
      after: {
        steps: ['replace /hymns/100'],
        back: phone.paths.slice(0, -1),
        open: false,
        query: '',
      },
      landed: { results: false },
      again: { results: false, search: true, box: false },
    });
  });

  it('on the hymn page it shows: the page stays, the search closes and the pager is handed nothing', () => {
    using phone = mount(home, hymn(8));
    searchAndOpen(phone, '8', 8);
    expect({
      steps: steps(),
      open: Option.isSome(phone.registry.get(searchOpen)),
      pagesFrom: Option.isSome(phone.registry.get(pagesFrom)),
    }).toEqual({ steps: [], open: false, pagesFrom: false });
  });
});
