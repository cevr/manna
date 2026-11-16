import { Array as Arr, Option } from 'effect';

/** The two tabs, Garden first. */
export type NavTab = 'garden' | 'read';

/** A visit: its id (minted in order), its route's name, its location and the fragment it landed on. */
export interface NavVisit {
  readonly id: number;
  readonly name: string;
  readonly url: string;
  readonly fragment: string;
}

/** The router: the tab shown, each tab's stack (root first), and the next id. */
export interface Nav {
  readonly tab: NavTab;
  readonly garden: readonly NavVisit[];
  readonly read: readonly NavVisit[];
  readonly next: number;
}

/** What the Read tab keeps besides the router: the kept place's two texts and the verse `readOpenAt` asked to open on. */
export interface NavState {
  readonly nav: Nav;
  readonly bookKept: string;
  readonly chapterKept: string;
  readonly openVerse: number;
}

/** A place a reader opens or follows. */
interface NavPlace {
  readonly book: number;
  readonly chapter: number;
  readonly verse: number;
}

/** What the reader does: a tab tapped, a Garden screen's push, Back, the gear and Done, the Read tab's two ways in, and a location typed or followed. */
export type NavInput =
  | { readonly _tag: 'pick'; readonly tab: NavTab }
  | { readonly _tag: 'push'; readonly url: string }
  | { readonly _tag: 'back' }
  | { readonly _tag: 'settingsOpen' }
  | { readonly _tag: 'settingsDone' }
  | ({ readonly _tag: 'readOpenAt' } & NavPlace)
  | ({ readonly _tag: 'readFollow' } & NavPlace)
  | { readonly _tag: 'follow'; readonly url: string };

/** A route of the table: its name, its locations, its parent's name (empty for a tab's root) and its tab. */
interface NavRoute {
  readonly name: string;
  readonly pattern: RegExp;
  readonly parent: string;
  readonly tab: NavTab;
}

const garden = (name: string, pattern: RegExp, parent = 'garden'): NavRoute => ({
  name,
  pattern,
  parent,
  tab: 'garden',
});

/** The route table of `app.contract`, each route with its parent and its tab. */
const ROUTES: readonly NavRoute[] = [
  garden('garden', /^\/$/u, ''),
  garden('list', /^\/lists\/[^/]+$/u),
  garden('settings', /^\/settings$/u),
  garden('settingsAbout', /^\/settings\/about$/u, 'settings'),
  garden('settingsLicences', /^\/settings\/about\/licences$/u, 'settingsAbout'),
  garden('today', /^\/today$/u),
  garden('start', /^\/start\/[^/]+$/u),
  garden('cued', /^\/cue\/[^/]+$/u),
  garden('verses', /^\/verses$/u),
  garden('add', /^\/add$/u),
  garden('addBible', /^\/add\/bible$/u, 'add'),
  garden('addBook', /^\/add\/bible\/[^/]+$/u, 'addBible'),
  garden('addChapter', /^\/add\/bible\/[^/]+\/[^/]+$/u, 'addBook'),
  garden('addList', /^\/add\/lists\/[^/]+$/u, 'add'),
  { name: 'read', pattern: /^\/read$/u, parent: '', tab: 'read' },
  { name: 'readAt', pattern: /^\/read\/at\/[^/]+\/[^/]+\/[^/]+$/u, parent: 'read', tab: 'read' },
];

const ROOTS: Readonly<Record<NavTab, string>> = { garden: '/', read: '/read' };

/** A location's path and fragment. */
const split = (location: string) => {
  const at = location.indexOf('#');
  if (at < 0) return { url: location, fragment: '' };
  return { url: location.slice(0, at), fragment: location.slice(at + 1) };
};

const routeOf = (url: string) => Arr.findFirst(ROUTES, (route) => route.pattern.test(url));

const otherOf = (tab: NavTab): NavTab => {
  if (tab === 'garden') return 'read';
  return 'garden';
};

/** The launch: each tab seeded at its root, Garden shown. */
export const navLaunch = (): NavState => ({
  nav: {
    tab: 'garden',
    garden: [{ id: 0, name: 'garden', url: '/', fragment: '' }],
    read: [{ id: 1, name: 'read', url: '/read', fragment: '' }],
    next: 2,
  },
  bookKept: '',
  chapterKept: '',
  openVerse: 0,
});

const withStack = (nav: Nav, tab: NavTab, stack: readonly NavVisit[], next = nav.next): Nav => {
  if (tab === 'garden') return { ...nav, garden: stack, next };
  return { ...nav, read: stack, next };
};

/** `select(nav, tab)`: shows the tab; reselecting the tab shown pops it to its root. */
export const select = (nav: Nav, tab: NavTab): Nav => {
  if (nav.tab !== tab) return { ...nav, tab };
  return withStack(nav, tab, nav[tab].slice(0, 1));
};

/** `push(nav, location)`: one fresh visit on the tab shown, whatever tab declares the route, unless the location is already on top (then only its fragment changes). */
export const push = (nav: Nav, location: string): Nav => {
  const { url, fragment } = split(location);
  const stack = nav[nav.tab];
  return Option.match(routeOf(url), {
    onNone: () => nav,
    onSome: (route) =>
      Option.match(
        Option.filter(Arr.last(stack), (top) => top.url === url),
        {
          onSome: (top) => withStack(nav, nav.tab, [...stack.slice(0, -1), { ...top, fragment }]),
          onNone: () =>
            withStack(
              nav,
              nav.tab,
              [...stack, { id: nav.next, name: route.name, url, fragment }],
              nav.next + 1,
            ),
        },
      ),
  });
};

/** `back(nav)`: pops the tab shown; a root stays. */
export const back = (nav: Nav): Nav => {
  const stack = nav[nav.tab];
  if (stack.length <= 1) return nav;
  return withStack(nav, nav.tab, stack.slice(0, -1));
};

/** The chain `open` builds for a tab's root or a route right under it: each location and route name, root first; none for a deeper route. */
const chainOf = (route: NavRoute, url: string) => {
  if (route.parent === '') return Option.some([{ url, name: route.name }]);
  if (route.parent !== route.tab) return Option.none();
  return Option.some([
    { url: ROOTS[route.tab], name: route.tab },
    { url, name: route.name },
  ]);
};

/** `open(nav, location)` for a tab's root or a route right under it: selects the route's declared tab and makes its stack the route's chain, a visit at the same place and location keeping its id; the leaf takes the fragment. */
export const open = (nav: Nav, location: string): Nav => {
  const { url, fragment } = split(location);
  return Option.match(
    Option.flatMap(routeOf(url), (route) =>
      Option.map(chainOf(route, url), (chain) => ({ route, chain })),
    ),
    {
      onNone: () => nav,
      onSome: ({ route, chain }) => {
        const old = nav[route.tab];
        let next = nav.next;
        const stack = chain.map((link, at): NavVisit => {
          const leaf = at === chain.length - 1;
          const kept = Option.filter(Arr.get(old, at), (visit) => visit.url === link.url);
          if (Option.isSome(kept) && leaf) return { ...kept.value, fragment };
          if (Option.isSome(kept)) return kept.value;
          const minted = { id: next, name: link.name, url: link.url, fragment: '' };
          next += 1;
          if (leaf) return { ...minted, fragment };
          return minted;
        });
        return { ...withStack(nav, route.tab, stack, next), tab: route.tab };
      },
    },
  );
};

/** `go(nav, location)`: the top stays (taking the fragment), else a pop to the location on the tab shown, else the other tab whose top it is, else a push. */
export const go = (nav: Nav, location: string): Nav => {
  const { url, fragment } = split(location);
  if (Option.isNone(routeOf(url))) return nav;
  const stack = nav[nav.tab];
  const at = stack.findLastIndex((visit) => visit.url === url);
  const other = otherOf(nav.tab);
  if (at < 0 && Option.exists(Arr.last(nav[other]), (top) => top.url === url))
    return select(nav, other);
  if (at < 0) return push(nav, location);
  const kept = stack.slice(0, at + 1);
  const landed = Arr.map(kept, (visit, index) => {
    if (index === at && (at === stack.length - 1 || fragment !== '')) return { ...visit, fragment };
    return visit;
  });
  return withStack(nav, nav.tab, landed);
};

/** The route `path("readAt", …)` writes for a place, with the verse's row as its fragment. */
export const readAtPath = (book: number, chapter: number, verse: number) =>
  `/read/at/${book}/${chapter}/${verse}#verse-${verse}`;

/** `follow(url)`: a location of the other tab's routes selects that tab first; a Settings location stays on the tab shown. */
const followOf = (nav: Nav, url: string): Nav => {
  if (url.startsWith('/read') && nav.tab !== 'read') return go(select(nav, 'read'), url);
  if (!url.startsWith('/read') && !url.startsWith('/settings') && nav.tab !== 'garden')
    return go(select(nav, 'garden'), url);
  return go(nav, url);
};

/** `readFollow`: pushes the followed reference on Read, selecting it first. */
const readFollowOf = (nav: Nav, place: NavPlace): Nav => {
  const to = readAtPath(place.book, place.chapter, place.verse);
  if (nav.tab === 'read') return push(nav, to);
  return push(select(nav, 'read'), to);
};

/**
 * The state after one input, each as its Contract action composes Exact's
 * router (`select`, `push`, `back`, `open`, `go`, written here as the
 * pinned clone's `route/src/router.rs` does them): `pick`, `follow`,
 * `settingsOpen`, `settingsDone`, `readOpenAt` and `readFollow`.
 * `read.test.ts` holds the actions' text in the Contract files to these
 * compositions, and `nav.model.test.ts` walks generated readers through
 * this beside a small model of what the reader sees.
 */
export const navStep = (state: NavState, input: NavInput): NavState => {
  const { nav } = state;
  switch (input._tag) {
    case 'pick':
      return { ...state, nav: select(nav, input.tab) };
    case 'push':
      return { ...state, nav: push(nav, input.url) };
    case 'back':
    case 'settingsDone':
      return { ...state, nav: back(nav) };
    case 'settingsOpen':
      return { ...state, nav: push(nav, '/settings') };
    case 'readOpenAt':
      return {
        nav: open(nav, `/read#verse-${input.verse}`),
        bookKept: `${input.book}`,
        chapterKept: `${input.chapter}`,
        openVerse: input.verse,
      };
    case 'readFollow':
      return { ...state, nav: readFollowOf(nav, input) };
    case 'follow':
      return { ...state, nav: followOf(nav, input.url) };
  }
};
