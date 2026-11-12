/* oxlint-disable effect/noGlobals, effect/noAsyncFunction, eslint/no-await-in-loop, effect/noNullish -- a script at Bun's boundary, as `phone-pager.tsx` is: the screens are imported only once the phone's stand-ins are registered (`phone.ts`), it drives React one step after another and waits on what the document shows, reads the document's attributes as it gives them, and prints its report on stdout. */

/**
 * Draws each scene a verify-hymnal journey's steps stand in (`Scene` in
 * `scene.ts`) as the phones draw it, on the phone `phone.ts`
 * stands in for: the route's screen under the layout's player layer and
 * docked bar, or a sheet's screen alone, set up as the scene says (a hymn,
 * chords, a search typed, the drums, the tiles, a dial, a hymn playing).
 * The scenes come as JSON in the first argument, each with the names a
 * journey asks of it; it prints, as JSON, the names each scene draws among
 * those asked: a testID (`data-testid`), or an accessible name (an
 * `aria-label`, a placeholder, or a text with no element in it, as iOS
 * names a text). Only names asked are printed, so no hymn's words are.
 */

import type * as Atom from 'effect/reactivity/Atom';
import type * as Registry from 'effect/reactivity/AtomRegistry';

import type { Scene } from './scene';
import { phone } from './phone';

phone({ nativeList: true });

{
  const { plugin } = await import('bun');
  const native = Bun.resolveSync('../tuner/native.ts', import.meta.dir);
  plugin({
    name: 'hymnal-phone-ear',
    setup(build) {
      build.module('~/tuner/native', () => ({
        contents: `export * from ${JSON.stringify(native)}; export const available = true;`,
        loader: 'js',
      }));
    },
  });
}

const { act, createElement: h } = await import('react');
const { AccessibilityInfo } = await import('react-native');
Object.assign(AccessibilityInfo, { sendAccessibilityEvent: () => {} });
const { createRoot } = await import('react-dom/client');
const { RegistryContext } = await import('@effect/atom-react');
const { Duration, Effect, Option } = await import('effect');
const AtomRegistry = await import('effect/reactivity/AtomRegistry');
const { default: Settings } = await import('../../app/(hymnal)/settings');
const { Home } = await import('../home/Home.native');
const { Tiles, tiles } = await import('../home/finding');
const { hymnAt } = await import('../hymns/hymns');
const { PAUSE } = await import('../hymns/meaning');
const { FullPlayer } = await import('../player/FullPlayer');
const { PlayerContext } = await import('../player/context');
const { LivePlayer } = await import('../player/LivePlayer');
const { useShowsPage } = await import('../player/page');
const { playerOn } = await import('../player/player');
const { PlayerBar } = await import('../player/PlayerBar');
const { StackBottom } = await import('../player/StackBottom');
const { AboutScreen } = await import('../reader/About');
const { ChordScreen } = await import('../reader/ChordSheet');
const { HymnScreen } = await import('../reader/HymnScreen.native');
const { openAtTopic } = await import('../reader/place');
const { settings } = await import('../store');
const { fakeDevice } = await import('./device');
const { opened, params, pathname, routed } = await import('./one');
const { StackHeader } = await import('./stack');

type Node = ReturnType<typeof h>;

/** A moment of the event loop, for the stand-in views' layout and the player's device. */
const tick = () => act(() => Effect.runPromise(Effect.sleep(Duration.millis(10))));

/** Waits until `holds` is true, for two seconds at most. */
const waitFor = async (holds: () => boolean) => {
  for (let i = 0; i < 200 && !holds(); i++) await tick();
};

/** The testIDs and the accessible names the document draws under `host`. */
const drawnIn = (host: HTMLElement) => {
  const ids = new Set<string>();
  const labels = new Set<string>();
  for (const element of host.querySelectorAll('*')) {
    const id = element.getAttribute('data-testid');
    if (id !== null) ids.add(id);
    for (const name of ['aria-label', 'placeholder']) {
      const value = element.getAttribute(name);
      if (value !== null) labels.add(value);
    }
    const text = element.textContent?.trim() ?? '';
    if (element.children.length === 0 && text !== '') labels.add(text);
  }
  return { ids, labels };
};

/**
 * The element named `selector` under `host`, pressed as a finger presses
 * it. One that never comes is not pressed: the scene then lacks what the
 * press would draw, and the test names those targets.
 */
const press = async (host: HTMLElement, selector: string) => {
  await waitFor(() => host.querySelector(selector) !== null);
  await act(async () => host.querySelector<HTMLElement>(selector)?.click());
  await tick();
};

/** The moments a typed query waits: the search's pause before it asks for the hymns about it, and a margin. */
const TYPED_TICKS = Math.ceil(PAUSE / 10) + 10;

/** `words` typed into the search box, and the search's pause waited out. */
const type = async (host: HTMLElement, words: string) => {
  await waitFor(() => host.querySelector('[data-testid="find-box"]') !== null);
  const box = host.querySelector<HTMLInputElement>('[data-testid="find-box"]');
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(box, words);
    box?.dispatchEvent(new Event('input', { bubbles: true }));
  });
  for (let i = 0; i < TYPED_TICKS; i++) await tick();
};

/** A hymn page shown, as its screen says to the bar, under a sheet. */
function Shows({ n }: { readonly n: number }) {
  const hymn = Option.getOrThrow(hymnAt(String(n)));
  useShowsPage({ number: hymn.number, title: hymn.title });
  return h('div');
}

/**
 * A fresh registry holding what `scene` sets, each setting mounted so the
 * registry keeps it while the scene is drawn; its `close` lets them go.
 */
const registryOf = (scene: Scene) => {
  const registry = AtomRegistry.make();
  const mounted: Array<() => void> = [];
  const keep = <A,>(atom: Atom.Writable<A>, value: A) => {
    mounted.push(registry.mount(atom));
    registry.set(atom, value);
  };
  keep(settings.lists.recent, scene.recent ?? [100]);
  keep(settings.chords, scene.chords ?? false);
  if (scene.advanced === true) keep(settings.chordStyle, 'advanced');
  if (scene.tab !== undefined) keep(settings.home.tab, scene.tab);
  const n = scene.hymn ?? 100;
  if (scene.moved === true) keep(settings.move(n), { transpose: 2, capo: 0 });
  if (scene.stanzas !== undefined) keep(settings.stanzas(n), scene.stanzas);
  if (scene.tempo !== undefined) keep(settings.tempo(n), scene.tempo);
  if (scene.topic !== undefined) keep(openAtTopic, Option.some(scene.topic));
  if (scene.tiles === true) keep(tiles, Tiles.Shown({ stood: { offset: 0, cover: 0 } }));
  return {
    registry,
    close: () => {
      for (const unmount of mounted) unmount();
      registry.dispose();
    },
  };
};

/** The route's params and path set back to none, as the router shows a new screen. */
const routeTo = (path: string, next: Record<string, string>) => {
  for (const key of Object.keys(params)) delete params[key];
  Object.assign(params, next);
  pathname.current = path;
  opened.splice(0);
  routed.splice(0);
};

/** A scene drawn: the host it is drawn in, and its unmount. */
interface Shown {
  readonly host: HTMLElement;
  readonly close: () => void;
}

/** Draws `node` over `registry` in a new host. */
const mount = async (registry: Registry.AtomRegistry, node: Node): Promise<Shown> => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(h(RegistryContext, { value: registry }, node)));
  for (let i = 0; i < 10; i++) await tick();
  return {
    host,
    close: () => {
      act(() => root.unmount());
      host.remove();
    },
  };
};

/** The layout as the phones nest it: the player layer, the stack's screen in its wrapper, and the docked bar. */
const layout = (screen: Node) => h(LivePlayer, null, h(StackBottom, null, screen), h(PlayerBar));

/** The hymn route's screen: its header and its pager. */
const hymnRoute = () => h('div', null, h(StackHeader), h(HymnScreen));

/** The page the hymn route draws for hymn `n`, with the player layer `wrap` gives. */
const showHymn = (registry: Registry.AtomRegistry, n: number, wrap: (screen: Node) => Node) => {
  routeTo(`/hymns/${n}`, { number: String(n) });
  return mount(registry, wrap(hymnRoute()));
};

/** A player on a fake device, playing hymn `n`'s page with the bar under it; a hand scroll held its follow when `hand`. */
const playing = async (registry: Registry.AtomRegistry, scene: Scene, n: number) => {
  const { device, layer } = fakeDevice();
  const player = Option.some(playerOn(layer, Duration.millis(1)));
  const wrap = (screen: Node) =>
    h(PlayerContext, { value: player }, h(StackBottom, null, screen), h(PlayerBar));
  const play = async (shown: Shown) => {
    await press(shown.host, `[aria-label="Play hymn ${n}"]`);
    device.advancing = true;
    device.now = { state: 'playing', positionMs: 5_000, durationMs: 120_000 };
    await waitFor(() => shown.host.querySelector(`[aria-label="Pause hymn ${n}"]`) !== null);
    return shown;
  };
  if (scene.route === 'player') {
    routeTo('/player', { hymn: String(n) });
    return play(await mount(registry, wrap(h('div', null, h(Shows, { n }), h(FullPlayer)))));
  }
  const shown = await play(await showHymn(registry, n, wrap));
  if (scene.hand === true) {
    const page = [...shown.host.querySelectorAll('[data-testid="hymn-number"]')]
      .find((number) => number.textContent === String(n))
      ?.closest('[data-testid="pager-page"]');
    const scroll = page?.querySelector('[data-testid="hymn-scroll"]');
    await act(async () =>
      scroll?.dispatchEvent(new WheelEvent('wheel', { bubbles: true, deltaY: 120 })),
    );
    await waitFor(() => shown.host.querySelector('[aria-label="Resume follow"]') !== null);
  }
  return shown;
};

/** The query of the href the last press opened or pushed. */
const lastQuery = () => {
  const href = [...opened, ...routed.map((step) => step.replace(/^(push|replace) /, ''))].at(-1);
  return Object.fromEntries(new URL(href ?? '/', 'http://localhost').searchParams);
};

/** Draws `scene` over `registry`, set up as it says. */
const draw = async (registry: Registry.AtomRegistry, scene: Scene): Promise<Shown> => {
  const n = scene.hymn ?? 100;
  if (scene.playing === true) return playing(registry, scene, n);
  switch (scene.route) {
    case 'home': {
      routeTo('/', {});
      const shown = await mount(registry, layout(h(Home)));
      if (scene.drums === true) await press(shown.host, '[data-testid="find-number"]');
      if (scene.search !== undefined) {
        await press(shown.host, '[data-testid="find-search"]');
        await type(shown.host, scene.search);
      }
      return shown;
    }
    case 'hymn': {
      const shown = await showHymn(registry, n, layout);
      if (scene.dials === true) await press(shown.host, '[data-testid="key-button"]');
      if (scene.search !== undefined) {
        await press(shown.host, '[data-testid="find-search"]');
        await type(shown.host, scene.search);
      }
      if (scene.drums === true) await press(shown.host, '[data-testid="find-number"]');
      return shown;
    }
    case 'player': {
      routeTo('/player', { hymn: String(n) });
      return mount(registry, layout(h('div', null, h(Shows, { n }), h(FullPlayer))));
    }
    case 'settings': {
      routeTo('/settings', {});
      return mount(registry, h(Settings));
    }
    case 'about': {
      routeTo('/about', { hymn: String(n) });
      return mount(registry, h(AboutScreen));
    }
    case 'chord': {
      const page = await showHymn(registry, n, layout);
      await press(page.host, '[data-testid="chord-1-1-1"]');
      const query = lastQuery();
      page.close();
      routeTo('/chord', query);
      return mount(registry, h(ChordScreen));
    }
  }
};

/** What a scene is asked: the testIDs and the names its steps name. */
interface Asked {
  readonly scene: Scene;
  readonly ids: ReadonlyArray<string>;
  readonly labels: ReadonlyArray<string>;
}

/** The start of the report's line: what the screens log may come before it. */
const MARK = 'scenes ';

const asked: ReadonlyArray<Asked> = JSON.parse(process.argv[2] ?? '[]');
const out: Array<{ readonly ids: ReadonlyArray<string>; readonly labels: ReadonlyArray<string> }> =
  [];
for (const { scene, ids, labels } of asked) {
  const held = registryOf(scene);
  const shown = await draw(held.registry, scene);
  const drawn = drawnIn(shown.host);
  const folded = new Set([...drawn.labels].map((label) => label.toLowerCase()));
  out.push({
    ids: ids.filter((id) => drawn.ids.has(id)),
    labels: labels.filter((label) => folded.has(label.toLowerCase())),
  });
  shown.close();
  held.close();
}
process.stdout.write(`\n${MARK}${JSON.stringify(out)}\n`);
process.exit(0);
