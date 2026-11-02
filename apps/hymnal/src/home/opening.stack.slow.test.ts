/* oxlint-disable effect/noGlobals, effect/noAsyncFunction, effect/noNullish, effect/noUnknownParameters, effect/noUnsafeDictionaryType -- One's and React Navigation's router modules load from their installed files by path, take their own loose arguments and keep their state in plain objects with optional fields. */

/**
 * What One does with the step a hymn page sends, on the phone. The `#`
 * drums' `Open` (`router.replace`) and a search's result (`useLinkTo({
 * replace: true })`) both reach One's `linkTo` as `REPLACE`, a pushing one
 * as `PUSH` (`numreplace.slow.test.tsx` reads those steps from the screens).
 * Here each step runs through One's own native route resolution, as its
 * `linkTo` runs it (`one/src/router/router.ts`): the route tree One builds
 * from the app's own route files (`getRoutes`), the target state its linking
 * config reads from the href (`getLinkingConfig`), the action it dispatches
 * (`getNativeStackReplaceAction` for `REPLACE`, `getNavigateAction` for
 * `PUSH`), and, where that action is null, `navigationRef.resetRoot` to the
 * target state alone. React Navigation's own `StackRouter` builds the
 * stack's state and applies the action to it, and Back is its `GO_BACK`.
 *
 * The router is given no screen ids: One's (`createGetIdForRoute`) load with
 * React Native's own files, which Bun cannot parse, and `StackRouter` reads
 * them only to reuse a retained screen (`REPLACE`) or to reach a screen of
 * the same hymn (`NAVIGATE`); no stack here holds either.
 *
 * The modules are One's native build (`dist/esm/**.native.js`), the files
 * Metro bundles for iOS, so the repo's patch of One (`patches/one@2.11.1.patch`)
 * is what runs here. Numbers only: no hymn's words are read.
 */

import { describe, expect, it } from 'bun:test';
import { Array as Arr, Match, Option } from 'effect';

import { hymnHref } from './Browse';
import { type Opening, openingAt } from './opening';

/** A screen in a navigator's state, as React Navigation keeps it. */
interface Route {
  readonly key: string;
  readonly name: string;
  readonly params?: Readonly<Record<string, string>>;
  readonly state?: Navigator;
}

/** A navigator's state: its screens, oldest first, and the one shown. */
interface Navigator {
  readonly type: string;
  readonly key: string;
  readonly index: number;
  readonly routeNames: ReadonlyArray<string>;
  readonly routes: ReadonlyArray<Route>;
}

/** The partial state One's linking config reads from an href. */
interface Target {
  readonly index?: number;
  readonly routes: ReadonlyArray<{
    readonly key?: string;
    readonly name: string;
    readonly params?: Readonly<Record<string, string>>;
    readonly state?: Target;
  }>;
}

/** A node of One's route tree. */
interface RouteNode {
  readonly route: string;
  readonly children: ReadonlyArray<RouteNode>;
}

/** An action One dispatches: the navigator's key it targets, and what it does. */
interface Action {
  readonly type: string;
  readonly target?: string;
  readonly source?: string;
  readonly payload?: unknown;
}

/** What `StackRouter` is told of the stack's screens. */
interface Config {
  readonly routeNames: ReadonlyArray<string>;
  readonly routeParamList: Record<string, unknown>;
  readonly routeGetIdList: Record<string, unknown>;
}

/** The part of React Navigation's `StackRouter` the stack runs on. */
interface StackRouterOf {
  readonly getRehydratedState: (partial: Target, config: Config) => Navigator;
  readonly getStateForAction: (
    state: Navigator,
    action: Action,
    config: Config,
  ) => Navigator | null;
}

/** A module loaded by its specifier, its exports read as the declarations below them give. */
const load = (specifier: string) => import(specifier);
const one = Bun.resolveSync('one/package.json', import.meta.dir).replace(/\/package\.json$/, '');
const native = (path: string) => load(`${one}/dist/esm/${path}.native.js`);

const routes = await native('router/getRoutes');
const linkingConfig = await native('router/getLinkingConfig');
const navigate = await native('router/utils/getNavigateAction');
const replace = await native('router/utils/getNativeStackReplaceAction');
const navigation = await load('@react-navigation/native');

const getRoutes: (context: unknown, options: Record<string, unknown>) => RouteNode =
  routes.getRoutes;
const getLinkingConfig: (root: RouteNode) => {
  readonly config: unknown;
  readonly getStateFromPath: (path: string, config: unknown) => Target;
} = linkingConfig.getLinkingConfig;
const getNavigateAction: (target: Target, state: Navigator, event: 'PUSH') => Action =
  navigate.getNavigateAction;
const getNativeStackReplaceAction: (target: Target, state: Navigator) => Action | null =
  replace.getNativeStackReplaceAction;
const stackRouter: StackRouterOf = navigation.StackRouter({});
const goBack: () => Action = navigation.CommonActions.goBack;

/** The app's route files, as Metro's route context lists them for One. */
const files = [...new Bun.Glob('**/*.tsx').scanSync({ cwd: `${import.meta.dir}/../../app` })].map(
  (file) => `./${file}`,
);
const context = Object.assign(() => ({ default: () => null }), {
  keys: () => files,
  resolve: (id: string) => id,
  id: 'app',
});
const root = getRoutes(context, {
  ignoreEntryPoints: true,
  ignoreRequireErrors: true,
  platform: 'ios',
});
const linking = getLinkingConfig(root);
const targetOf = (href: string) => linking.getStateFromPath(href, linking.config);

/** The app's one stack, `(hymnal)`, as One's `Stack` declares its screens. */
const hymnal = Option.getOrThrow(Arr.findFirst(root.children, (node) => node.route === '(hymnal)'));
const config: Config = {
  routeNames: hymnal.children.map((node) => node.route),
  routeParamList: {},
  routeGetIdList: {},
};

/** The root state, its one screen `(hymnal)` holding `stack`. */
const phone = (stack: Navigator): Navigator => ({
  type: 'stack',
  key: 'root',
  index: 0,
  routeNames: root.children.map((node) => node.route),
  routes: [{ key: 'hymnal', name: '(hymnal)', state: stack }],
});

/** The `(hymnal)` stack holding `screens`, the last shown, as `StackRouter` builds it. */
const stackHolding = (screens: Target['routes']) =>
  phone(stackRouter.getRehydratedState({ routes: screens }, config));

/** The stack a reader built by pushes: the screen One's linking config gives each path, keyed `k<at>`. */
const stackOf = (paths: ReadonlyArray<string>) =>
  stackHolding(
    paths.map((path, at) => {
      const leaf = targetOf(path).routes[0]?.state?.routes[0];
      return { key: `k${at}`, name: leaf?.name ?? `no route for ${path}`, params: leaf?.params };
    }),
  );

/** The `(hymnal)` stack's state in `state`. */
const stackIn = (state: Navigator): Navigator =>
  state.routes[0]?.state ?? { ...state, routes: [], index: -1 };

/** The screen `state`'s stack shows. */
const shownIn = (state: Navigator) => Arr.last(stackIn(state).routes);

/** A screen named by its key, its route and its hymn number. */
const label = (route: Option.Option<Route>) =>
  Option.match(route, {
    onNone: () => 'nothing',
    onSome: (screen) =>
      [screen.key, screen.name, screen.params?.['number']].filter(Boolean).join(' '),
  });

/** The shown screen's path, as `usePathname` gives it there. */
const pathOf = (route: Option.Option<Route>) =>
  Option.match(route, {
    onNone: () => '/',
    onSome: (screen) =>
      Match.value(screen.name).pipe(
        Match.when('hymns/[number]', () => `/hymns/${screen.params?.['number']}`),
        Match.orElse((name) => `/${name}`),
      ),
  });

/** `action` handled by the navigator it targets, as React Navigation's container hands it on. */
const dispatch = (state: Navigator, action: Action): Navigator => {
  const stack = stackIn(state);
  return Option.liftPredicate(action, (sent) => sent.target === stack.key).pipe(
    Option.flatMapNullishOr((sent) => stackRouter.getStateForAction(stack, sent, config)),
    Option.match({
      onNone: () => stackHolding([{ key: 'unhandled', name: action.type }]),
      onSome: phone,
    }),
  );
};

/**
 * The state after One's `linkTo` runs `event` for `href` over `state`
 * (`router.ts`): the action it builds, or, where that is null,
 * `navigationRef.resetRoot` to the target state, whose stack holds the
 * target's screen alone.
 */
const linkTo = (state: Navigator, event: 'PUSH' | 'REPLACE', href: string): Navigator => {
  const target = targetOf(href);
  return Match.value(event).pipe(
    Match.when('REPLACE', () => Option.fromNullishOr(getNativeStackReplaceAction(target, state))),
    Match.when('PUSH', () => Option.some(getNavigateAction(target, state, 'PUSH'))),
    Match.exhaustive,
    Option.match({
      onNone: () => stackHolding(target.routes[0]?.state?.routes ?? []),
      onSome: (action) => dispatch(state, action),
    }),
  );
};

/** A step the app sends: the hymn's href, pushed or put in the shown page's place. */
interface Step {
  readonly how: Exclude<Opening, 'stay'>;
  readonly href: string;
}

/** The step the app sends for hymn `n` chosen on the shown screen; a `stay` sends none. */
const stepFor = (state: Navigator, n: number): Option.Option<Step> =>
  Option.liftPredicate(
    openingAt(pathOf(shownIn(state)), n),
    (how): how is Step['how'] => how !== 'stay',
  ).pipe(Option.map((how) => ({ how, href: String(hymnHref(n)) })));

/** `state` after `step`, as One's `linkTo` takes it. */
const take = (state: Navigator, step: Step): Navigator =>
  linkTo(
    state,
    Match.value(step.how).pipe(
      Match.when('replace', () => 'REPLACE' as const),
      Match.when('push', () => 'PUSH' as const),
      Match.exhaustive,
    ),
    step.href,
  );

/** Each hymn of `chosen` opened in turn on the shown screen: the steps sent, as the `one` stand-in records them, and the state after. */
const choose = (paths: ReadonlyArray<string>, chosen: ReadonlyArray<number>) =>
  chosen.reduce<{ readonly steps: ReadonlyArray<string>; readonly state: Navigator }>(
    ({ steps, state }, n) =>
      Option.match(stepFor(state, n), {
        onNone: () => ({ steps, state }),
        onSome: (step) => ({
          steps: [...steps, `${step.how} ${step.href}`],
          state: take(state, step),
        }),
      }),
    { steps: [], state: stackOf(paths) },
  );

/** What a reader meets: the screens under the shown one, the shown one, and Back's screen. */
const read = (state: Navigator) => {
  const stack = stackIn(state);
  const back = Option.fromNullishOr(
    stackRouter.getStateForAction(stack, { ...goBack(), target: stack.key }, config),
  );
  return {
    under: stack.routes.slice(0, -1).map((route) => label(Option.some(route))),
    shown: Option.match(Arr.last(stack.routes), {
      onNone: () => 'nothing',
      onSome: (screen) => [screen.name, screen.params?.['number']].filter(Boolean).join(' '),
    }),
    back: label(Option.flatMap(back, (after) => Arr.last(after.routes))),
  };
};

describe('One, given the step a hymn page sends', () => {
  it.each([
    ['a hymn page over the home list', ['/', '/hymns/8'], [100], ['k0 index'], 'k0 index'],
    [
      'a hymn page over Recent',
      ['/', '/recent', '/hymns/8'],
      [100],
      ['k0 index', 'k1 recent'],
      'k1 recent',
    ],
    [
      'a hymn reached from a hymn reached from search (a result, then the `#`)',
      ['/', '/hymns/8'],
      [100, 50],
      ['k0 index'],
      'k0 index',
    ],
    [
      'a hymn page over another hymn page',
      ['/', '/hymns/8', '/hymns/50'],
      [100],
      ['k0 index', 'k1 hymns/[number] 8'],
      'k1 hymns/[number] 8',
    ],
  ] as const)(
    'on %s: the chosen hymn replaces the shown page alone, and Back reaches the screen under it',
    (_, paths, chosen, under, back) => {
      const { steps, state } = choose(paths, chosen);
      expect({ steps, ...read(state) }).toEqual({
        steps: chosen.map((n) => `replace /hymns/${n}`),
        under: [...under],
        shown: `hymns/[number] ${chosen.at(-1)}`,
        back,
      });
    },
  );

  it('on the hymn page it shows: no step is sent, and every screen stays with its key', () => {
    const before = stackOf(['/', '/hymns/8']);
    const { steps, state } = choose(['/', '/hymns/8'], [8]);
    expect({ steps, stack: stackIn(state).routes, ...read(state) }).toEqual({
      steps: [],
      stack: stackIn(before).routes,
      under: ['k0 index'],
      shown: 'hymns/[number] 8',
      back: 'k0 index',
    });
  });

  it.each([
    ['the home list', ['/'], ['k0 index'], 'k0 index'],
    ['Recent', ['/', '/recent'], ['k0 index', 'k1 recent'], 'k1 recent'],
  ] as const)('on %s: the chosen hymn is pushed over it', (_, paths, under, back) => {
    const { steps, state } = choose(paths, [100]);
    expect({ steps, ...read(state) }).toEqual({
      steps: ['push /hymns/100'],
      under: [...under],
      shown: 'hymns/[number] 100',
      back,
    });
  });
});
