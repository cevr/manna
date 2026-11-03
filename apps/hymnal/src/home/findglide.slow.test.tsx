/* oxlint-disable effect/noGlobals, effect/noAsyncFunction -- Bun's loader takes the list's stand-in as source text, so the paths it imports are written into it as JSON literals; the screens are imported only once the stand-in is registered. */
/* oxlint-disable effect/noTestLifecycleHooks, effect/noNewPromise -- a React screen test: the role sheet and the safe area are set for the file and animations land after each case; Reduce Motion stands in as the platform's promise. */

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'bun:test';
import { plugin } from 'bun';
import { Option } from 'effect';
import * as AtomRegistry from 'effect/reactivity/AtomRegistry';

const dep = (name: string) => JSON.stringify(Bun.resolveSync(name, import.meta.dir));
plugin({
  name: 'findglide-plain-list',
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
const { AccessibilityInfo, View } = await import('react-native');
const { animations, holdAnimations, landAnimations, stepAnimations } =
  await import('~/test/reanimated');
const { DOCKED_LIFT, HASH_GAP, REST } = await import('~/player/bar');
const { LivePlayer } = await import('~/player/LivePlayer');
const { useShowsPage } = await import('~/player/page');
const { StackBottom } = await import('~/player/StackBottom');
const { pathname, safeArea } = await import('~/test/one');

const INSET = 34;
const DOCKED = INSET + DOCKED_LIFT;
const OVER_BAR = INSET + REST + HASH_GAP;

const ROLES = ['accent', 'ink', 'onGlass', 'glassChosen', 'onGlassChosen'] as const;
const role = (name: (typeof ROLES)[number]) => `rgb(${ROLES.indexOf(name) + 1}, 3, 4)`;
const roleSheet = document.createElement('style');
roleSheet.textContent = `:root { ${ROLES.map((name) => `--${name}: ${role(name)};`).join(' ')} }`;
beforeAll(() => {
  document.head.append(roleSheet);
  Object.assign(safeArea, { bottom: INSET });
});
afterAll(() => {
  roleSheet.remove();
  Object.assign(safeArea, { bottom: 0 });
});
afterEach(() => landAnimations());

function Page({ n }: { readonly n: number }) {
  useShowsPage({ number: n, title: 'Stand-in' });
  return <View testID={`page-${n}`} />;
}

type Screen = { readonly path: string; readonly draw: () => React.ReactNode };
const home: Screen = { path: '/', draw: () => <View key="home" testID="home" /> };
const hymn = (n: number): Screen => ({ path: `/hymns/${n}`, draw: () => <Page key={n} n={n} /> });

const mount = (...screens: ReadonlyArray<Screen>) => {
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
  const find = (): HTMLElement => {
    const found = Option.fromNullishOr(host.querySelector<HTMLElement>('[data-testid="find"]'));
    expect({ find: Option.isSome(found) }).toEqual({ find: true });
    return Option.getOrThrow(found);
  };
  return {
    host,
    show,
    find,
    [Symbol.dispose]: () => {
      act(() => root.unmount());
      host.remove();
      pathname.current = '/';
    },
  };
};

const style = (element: Element) => getComputedStyle(element);

const moved = (element: Element, axis: 'X' | 'Y') => {
  const drawn = new RegExp(`translate${axis}\\((-?[\\d.]+)px\\)`).exec(style(element).transform);
  return Number(drawn?.[1] ?? 0);
};

const standing = (find: HTMLElement) =>
  Math.round(Number.parseFloat(style(find).bottom) - moved(find, 'Y'));

const opacity = (find: HTMLElement) =>
  Math.min(
    ...[find, ...find.querySelectorAll('[data-testid="find-bar"]')].map((view) => {
      const set = style(view).opacity;
      return (set === '' && 1) || Number(set);
    }),
  );

const movingSince = (from: number) =>
  animations.slice(from).filter((animation) => animation.from !== animation.to);

const reduceMotion = () => {
  const was = AccessibilityInfo.isReduceMotionEnabled;
  AccessibilityInfo.isReduceMotionEnabled = () => Promise.resolve(true);
  return {
    [Symbol.dispose]: () => {
      AccessibilityInfo.isReduceMotionEnabled = was;
    },
  };
};

describe('the find bar between the home list and a hymn page', () => {
  it('glides up as a hymn opens: under way it still stands docked, and lands over the bar, the same node', () => {
    using phone = mount(home);
    const before = { node: phone.find(), at: standing(phone.find()) };
    holdAnimations();
    phone.show(home, hymn(6));
    const under = standing(phone.find());
    act(() => landAnimations());
    expect({
      docked: before.at,
      under,
      landed: standing(phone.find()),
      same: phone.find() === before.node,
    }).toEqual({ docked: DOCKED, under: DOCKED, landed: OVER_BAR, same: true });
  });

  it('glides down as the hymn closes: under way it still stands over the bar, and lands docked', () => {
    using phone = mount(home, hymn(6));
    const before = standing(phone.find());
    holdAnimations();
    phone.show(home);
    const under = standing(phone.find());
    act(() => landAnimations());
    expect({ before, under, landed: standing(phone.find()) }).toEqual({
      before: OVER_BAR,
      under: OVER_BAR,
      landed: DOCKED,
    });
  });

  it('stays as a hymn page takes another’s place: the same node, never taken out, and nothing moves', () => {
    using phone = mount(home, hymn(6));
    const node = phone.find();
    const watch = new MutationObserver(() => {});
    watch.observe(phone.host, { childList: true, subtree: true });
    const from = animations.length;
    holdAnimations();
    phone.show(home, hymn(7));
    const taken = watch
      .takeRecords()
      .some((record) =>
        [...record.removedNodes].some((removed) => removed === node || removed.contains(node)),
      );
    watch.disconnect();
    expect({
      same: phone.find() === node,
      taken,
      at: standing(phone.find()),
      moving: movingSince(from),
    }).toEqual({ same: true, taken: false, at: OVER_BAR, moving: [] });
  });

  it('with Reduce Motion, jumps up as a hymn opens and fades in over 150 ms', async () => {
    using _reduced = reduceMotion();
    using phone = mount(home);
    await act(async () => {});
    holdAnimations();
    phone.show(home, hymn(6));
    const at = standing(phone.find());
    const faded = opacity(phone.find());
    let frames = 0;
    while (opacity(phone.find()) < 1 && frames < 30) {
      act(() => void stepAnimations(16));
      frames += 1;
    }
    expect({ at, fadedIn: faded < 1, frames: frames >= 9 && frames <= 10 }).toEqual({
      at: OVER_BAR,
      fadedIn: true,
      frames: true,
    });
  });
});

describe('the # the player layer draws in the find bar', () => {
  const ink = (host: HTMLElement) => {
    const glyph = Option.fromNullishOr(
      host.querySelector<HTMLElement>(
        '[data-testid="find-number"] [dir], [data-testid="find-number"] div',
      ),
    );
    return Option.match(glyph, { onNone: () => 'none', onSome: (view) => style(view).color });
  };

  it('is in the chosen ink folded, and the glass’s ink with search open', () => {
    using phone = mount(home, hymn(6));
    const folded = ink(phone.host);
    act(() =>
      Option.map(
        Option.fromNullishOr(phone.host.querySelector<HTMLElement>('[data-testid="find-search"]')),
        (search) => search.click(),
      ),
    );
    expect({ folded, open: ink(phone.host) }).toEqual({
      folded: role('onGlassChosen'),
      open: role('onGlass'),
    });
  });
});
