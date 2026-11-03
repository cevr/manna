/* oxlint-disable effect/noAsyncFunction, effect/noGlobals, eslint/no-await-in-loop, effect/noNullish, effect/noTernary, effect/noRuntimeTypeof, effect/noUnsafeDictionaryType -- a script at Bun's boundary, as the browser harness is: the screens are imported only once the phone's stand-ins are registered (`phone.ts`), it drives React one step after another and waits on what the document shows, reads the stand-in scroll view's props as React Native hands them over, and prints its report on stdout. */

import { phone } from './phone';

const { scrolls } = phone({ nativeList: true });

const pageDraws = new Map<number, number>();
Object.assign(globalThis, { hymnalPageDraws: pageDraws });
{
  const { plugin } = await import('bun');
  plugin({
    name: 'hymnal-page-draws',
    setup(build) {
      build.onLoad({ filter: /\/reader\/HymnPage\.tsx$/ }, async (args) => {
        const source = await Bun.file(args.path).text();
        const renamed = source
          .replace('export const HymnPage = memo(', 'const RealHymnPage = memo(')
          .replace('export function HymnPage(', 'function RealHymnPage(');
        return {
          contents: [
            renamed,
            `const countedDraw = (props: Parameters<typeof HymnPageInner>[0]) => {`,
            `  const draws = (globalThis as unknown as { hymnalPageDraws: Map<number, number> }).hymnalPageDraws;`,
            `  draws.set(props.hymn.number, (draws.get(props.hymn.number) ?? 0) + 1);`,
            `  return HymnPageInner(props);`,
            `};`,
            `const HymnPageInner = ((RealHymnPage as unknown as { type?: typeof RealHymnPage }).type ?? RealHymnPage) as (props: { readonly hymn: HymnText; readonly reader: ChordReader }) => ReturnType<typeof NoHymn>;`,
            `export const HymnPage = ((RealHymnPage as unknown as { type?: unknown }).type === undefined ? countedDraw : memo(countedDraw)) as unknown as typeof RealHymnPage;`,
          ].join('\n'),
          loader: 'tsx',
        };
      });
    },
  });
}

const { act, createElement: h } = await import('react');
const { createRoot } = await import('react-dom/client');
const { RegistryContext } = await import('@effect/atom-react');
const { Duration, Effect, Option } = await import('effect');
const Atom = await import('effect/reactivity/Atom');
const AtomRegistry = await import('effect/reactivity/AtomRegistry');
const { HymnScreen } = await import('../reader/HymnScreen.native');
const { StackHeader } = await import('./stack');
const { HymnList } = await import('../reader/HymnList.native');
const { pagesFrom } = await import('../reader/place');
const { Recent } = await import('../home/Recent');
const { settings } = await import('../store');
const { hymnAt, hymns } = await import('../hymns/hymns');
const { PlayerContext } = await import('../player/context');
const { PlayerBar } = await import('../player/PlayerBar');
const { Command, playerOn } = await import('../player/player');
const { fakeDevice } = await import('./device');
const { opened, params, paramsSet } = await import('./one');

const width = 390;

const offset = Atom.make(0);

const tick = () => act(() => Effect.runPromise(Effect.sleep(Duration.millis(10))));

const waitFor = async (holds: () => boolean) => {
  for (let i = 0; i < 200; i++) {
    if (holds()) return true;
    await tick();
  }
  return false;
};

const drawn = (host: HTMLElement) =>
  host.querySelector('[data-testid="header"]') !== null &&
  host.querySelector('[data-testid="hymn-name"]') !== null;

const listed = (host: HTMLElement) => host.querySelector('[aria-label*=", "]') !== null;

const app = () => {
  opened.splice(0);
  paramsSet.splice(0);
  scrolls.sideways.splice(0);
  const { device, layer } = fakeDevice();
  const player = playerOn(layer, Duration.millis(1));
  const provided = Option.some(player);
  const registry = AtomRegistry.make();
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const show = async (node: ReturnType<typeof h>, ready: (host: HTMLElement) => boolean) => {
    await act(async () => {
      root.render(
        h(RegistryContext, { value: registry }, h(PlayerContext, { value: provided }, node)),
      );
    });
    await waitFor(() => ready(host));
  };
  return {
    device,
    player,
    registry,
    host,
    show,
    close: () => {
      act(() => root.unmount());
      host.remove();
      registry.dispose();
    },
  };
};

type App = ReturnType<typeof app>;

const route = (shown: App, n: number) => {
  params['number'] = String(n);
  return shown.show(
    h(
      'div',
      null,
      h(StackHeader),
      h('div', { 'data-testid': 'page' }, h(HymnScreen)),
      h(PlayerBar),
    ),
    drawn,
  );
};

const again = (shown: App) => route(shown, Number(params['number']));

const seen = (shown: App) => {
  const headers = [...shown.host.querySelectorAll('[data-testid="header"]')];
  const pages = [...shown.host.querySelectorAll('[data-testid="hymn-number"]')].map((number) =>
    Number(number.textContent),
  );
  return {
    pages,
    headers: headers.length,
    headerNames: headers.map(
      (header) =>
        hymns.find((hymn) => hymn.title === header.getAttribute('aria-label'))?.number ?? 0,
    ),
    rightItems: headers.map((header) => header.querySelectorAll('[role="button"]').length),
    firstOffset: Option.getOrElse(
      Option.fromNullishOr(
        (scrolls.sideways[0]?.['contentOffset'] as { x?: number } | undefined)?.x,
      ),
      () => -1,
    ),
    offsets: scrolls.sideways.map(
      (props) => (props['contentOffset'] as { x?: number } | undefined)?.x ?? -1,
    ),
    paging: scrolls.sideways.at(-1)?.['pagingEnabled'] === true,
    opened: [...opened],
    paramsSet: paramsSet.map((set) => Number(set['number'])),
    backEdge: edgeOf(shown),
    pageHeights: [...shown.host.querySelectorAll('[data-testid="pager-page"]')].map(
      (page) => getComputedStyle(page).height,
    ),
    bar: barPlace(shown),
  };
};

const barPlace = (shown: App) => ({
  bars: shown.host.querySelectorAll('[aria-label="Player"]').length,
  inScreen: shown.host.querySelectorAll('[data-testid="page"] [aria-label="Player"]').length,
});

const edgeOf = (shown: App) => {
  const edges = [...shown.host.querySelectorAll('[data-testid="back-edge"]')];
  const edge = edges[0];
  const style = edge === undefined ? undefined : getComputedStyle(edge);
  return {
    count: edges.length,
    overPager:
      (edge?.previousElementSibling?.querySelector('[data-testid="hymn-name"]') ?? null) !== null,
    position: style?.position ?? '',
    left: style?.left ?? '',
    top: style?.top ?? '',
    bottom: style?.bottom ?? '',
    width: style?.width ?? '',
  };
};

const settle = async (shown: App, index: number) => {
  await act(async () => {
    const props = scrolls.sideways.at(-1) ?? {};
    const told = props['onMomentumScrollEnd'];
    if (typeof told === 'function')
      told({
        nativeEvent: {
          contentOffset: { x: index * width, y: 0 },
          contentSize: { width: width * 695, height: 800 },
          layoutMeasurement: { width, height: 800 },
          contentInset: { top: 0, left: 0, bottom: 0, right: 0 },
          zoomScale: 1,
        },
      });
  });
  await again(shown);
};

const press = (shown: App, label: string) =>
  act(async () => {
    shown.host
      .querySelector(`[aria-label^="${label}, "]`)
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
  });

const until = (shown: App, holds: (state: { readonly _tag: string }) => boolean) =>
  waitFor(() => holds(shown.registry.get(shown.player.state)));

const out: Record<string, unknown> = {};

{
  const shown = app();
  await shown.show(
    h(HymnList, { hymns, hrefOf: (n: number) => `/hymns/${n}`, offset, byTopic: true }),
    listed,
  );
  await press(shown, '3');
  const source = shown.registry.get(pagesFrom);
  out['homeSource'] = Option.match(source, {
    onNone: () => ({ length: 0, first: 0 }),
    onSome: (list) => ({ length: list.length, first: list[0] ?? 0 }),
  });
  out['homeOpened'] = [...opened];
  await route(shown, 3);
  out['open3'] = seen(shown);
  out['sourceAfterOpen'] = Option.isSome(shown.registry.get(pagesFrom));
  out['recentOpen3'] = shown.registry.get(settings.lists.recent);
  await settle(shown, 3);
  out['settle4'] = seen(shown);
  out['recentSettle4'] = shown.registry.get(settings.lists.recent);
  shown.close();
}

{
  const shown = app();
  const found = [3, 30, 300].map((n) => Option.getOrThrow(hymnAt(String(n))));
  await shown.show(
    h(HymnList, { hymns: found, hrefOf: (n: number) => `/hymns/${n}`, offset }),
    listed,
  );
  await press(shown, '30');
  await route(shown, 30);
  out['open30'] = seen(shown);
  await settle(shown, 2);
  out['settle300'] = seen(shown);
  shown.close();
}

const headings = (host: HTMLElement) =>
  [...host.querySelectorAll('[role="heading"]')].map((row) => row.getAttribute('aria-label'));

const rowsDrawn = (host: HTMLElement) =>
  [...host.querySelectorAll('[role="heading"], [role="button"], [role="link"]')].map(
    (row) =>
      /^\d+/.exec(row.getAttribute('aria-label') ?? '')?.[0] ?? row.getAttribute('aria-label'),
  );

const starPlaces = (host: HTMLElement) =>
  [...host.querySelectorAll('[role="link"]')]
    .filter((row) => (row.getAttribute('aria-label') ?? '').endsWith(', favourite'))
    .map((row) => {
      const star = row.querySelector('[data-testid="row-star"]');
      const title = row.querySelector('[data-testid="row-title"]');
      const number = row.querySelector('[data-testid="row-number"]');
      if (star === null || title === null || number === null) return 'missing';
      return {
        inTitle: title.contains(star),
        afterTitle: (title.compareDocumentPosition(star) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0,
        size: getComputedStyle(star).fontSize,
        numberSize: getComputedStyle(number).fontSize,
      };
    });

{
  const shown = app();
  const of = (numbers: ReadonlyArray<number>) =>
    numbers.map((n) => Option.getOrThrow(hymnAt(String(n))));
  await shown.show(
    h(HymnList, {
      hymns,
      hrefOf: (n: number) => `/hymns/${n}`,
      offset,
      byTopic: true,
      shelves: [{ name: 'Recent', hymns: of([30, 4, 3]), href: '/recent' }],
      favourites: new Set([3, 30]),
    }),
    listed,
  );
  out['shelfRows'] = rowsDrawn(shown.host).slice(0, 5);
  out['shelfFirstTopic'] = hymns[0]?.topic;
  out['starred'] = [...shown.host.querySelectorAll('[role="link"]')]
    .map((row) => row.getAttribute('aria-label') ?? '')
    .filter((label) => label.endsWith(', favourite'))
    .map((label) => Number(/^\d+/.exec(label)?.[0]));
  out['stars'] = shown.host.querySelectorAll('[data-testid="row-star"]').length;
  out['starPlaces'] = starPlaces(shown.host);
  await press(shown, '30');
  out['recentSource'] = Option.getOrElse(shown.registry.get(pagesFrom), () => []);
  const header = shown.host.querySelector('[role="button"][aria-label^="Recent"]');
  out['shelfHeader'] = {
    label: header?.getAttribute('aria-label') ?? '',
    text: header?.textContent ?? '',
  };
  opened.splice(0);
  await act(async () => {
    header?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
  });
  out['shelfOpened'] = [...opened];
  shown.close();
}

{
  const shown = app();
  const kept = [30, 4, 3, 7, 8, 9, 10, 9999];
  shown.registry.set(settings.lists.recent, kept);
  shown.registry.set(settings.lists.favourites, [3, 30]);
  await shown.show(h(Recent), listed);
  out['recentRows'] = rowsDrawn(shown.host);
  out['recentStarred'] = [...shown.host.querySelectorAll('[role="link"]')]
    .map((row) => row.getAttribute('aria-label') ?? '')
    .filter((label) => label.endsWith(', favourite'))
    .map((label) => Number(/^\d+/.exec(label)?.[0]));
  out['recentStarPlaces'] = starPlaces(shown.host);
  await press(shown, '7');
  out['recentScreenOpened'] = [...opened];
  out['recentScreenSource'] = Option.getOrElse(shown.registry.get(pagesFrom), () => []);
  shown.close();
}

{
  const shown = app();
  await shown.show(h(Recent), (host) => (host.textContent ?? '').length > 0);
  out['recentEmpty'] = { rows: rowsDrawn(shown.host).length, text: shown.host.textContent ?? '' };
  shown.close();
}

{
  const shown = app();
  await shown.show(
    h(HymnList, {
      hymns,
      hrefOf: (n: number) => `/hymns/${n}`,
      offset,
      byTopic: true,
      shelves: [{ name: 'Recent', hymns: [], href: '/recent' }],
    }),
    listed,
  );
  out['emptyHeadings'] = headings(shown.host).slice(0, 1);
  shown.close();
}

{
  const shown = app();
  await route(shown, 600);
  out['open600'] = seen(shown);
  await settle(shown, 600);
  out['settle601'] = seen(shown);
  shown.close();
}

{
  const shown = app();
  await route(shown, 3);
  await act(async () =>
    shown.registry.set(shown.player.send, Command.Start({ track: Option.getOrThrow(hymnAt('3')) })),
  );
  shown.device.advancing = true;
  shown.device.now = { state: 'playing', positionMs: 5_000, durationMs: 120_000 };
  const playing = await until(shown, (state) => state._tag === 'Playing');
  const playedBefore = [...shown.device.played];
  await settle(shown, 3);
  const bar = shown.host.querySelector('[aria-label="Player"]');
  const state = shown.registry.get(shown.player.state);
  out['playing'] = {
    playing,
    playedBefore: playedBefore.length,
    playedAfter: shown.device.played.length,
    state: state._tag,
    track: 'track' in state ? (state.track as { number: number }).number : 0,
    barHymn: Number(
      /^\d+/.exec(bar?.querySelector('[aria-label="Open player"]')?.textContent ?? '')?.[0] ?? 0,
    ),
    playFour: bar?.querySelector('[aria-label="Play hymn 4"]') !== null,
    route: params['number'],
    header: seen(shown).headerNames,
    place: barPlace(shown),
  };
  shown.close();
}

{
  const shown = app();
  await route(shown, 3);
  await tick();
  const mounted = seen(shown).pages;
  const first = [...pageDraws].map(([number, draws]) => ({ number, draws }));
  pageDraws.clear();
  await settle(shown, 3);
  await tick();
  out['settleDraws'] = {
    mounted,
    first,
    after: seen(shown).pages,
    draws: [...pageDraws].map(([number, draws]) => ({ number, draws })),
  };
  shown.close();
}

{
  const shown = app();
  await route(shown, 3);
  paramsSet.splice(0);
  const click = (element: Element | null) =>
    act(async () => {
      element?.dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }),
      );
    });
  await click(shown.host.querySelector('[data-testid="key-button"]'));
  await tick();
  await click(shown.host.querySelector('[data-testid="key-button"]'));
  await tick();
  const backdrop = shown.host.querySelector('[data-testid="dials-backdrop"]');
  const pager = shown.host.querySelector('[data-testid="pager-page"]');
  const opened = shown.host.querySelector('[data-testid="dials-panel"]') !== null;
  const takesTouch = backdrop !== null && getComputedStyle(backdrop).pointerEvents !== 'none';
  const over =
    backdrop !== null &&
    pager !== null &&
    (pager.compareDocumentPosition(backdrop) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
  await act(async () => {
    for (const [type, x] of [
      ['pointerdown', 300],
      ['pointermove', 200],
      ['pointermove', 60],
      ['pointerup', 60],
    ] as const)
      backdrop?.dispatchEvent(
        new PointerEvent(type, { bubbles: true, clientX: x, clientY: 400, pointerId: 1 }),
      );
  });
  await click(backdrop);
  await tick();
  out['swipeWithDials'] = {
    opened,
    over,
    takesTouch,
    closed:
      shown.host.querySelector('[data-testid="key-button"]')?.getAttribute('aria-expanded') ===
      'false',
    paramsSet: [...paramsSet],
    route: params['number'],
  };
  shown.close();
}

process.stdout.write(JSON.stringify(out));
process.exit(0);
