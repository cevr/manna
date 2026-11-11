import { Array as Arr, Option, Record, Schema } from 'effect';
import type { ReactNode } from 'react';
import type { ColorValue } from 'react-native';

import { color, useAccent } from './color';

/** A screen of the stack as the stack's options see it: its route's name and params. */
export interface StackRoute {
  readonly name: string;
  readonly params?: unknown;
}

/** A pushed screen's header as its route's params name it: its title, and its buttons. */
export interface Header {
  readonly title: string;
  readonly headerRight?: () => ReactNode;
}

/** A route's params as its path holds them: each a string, by name. */
export type RouteParams = Readonly<Record<string, string>>;

/** The headers of the screens whose header follows their route's params, by route name. */
export type Headers = Readonly<Record<string, (params: RouteParams) => Header>>;

/** The router hands a screen's params over untyped; a path's are strings. */
const decodeParams = Schema.decodeUnknownOption(Schema.Record(Schema.String, Schema.String));

/**
 * The app's stack: each screen on the theme's ground, its native header on
 * the ground too (without it iOS draws the system's white or grey bar
 * there), and its titles in ink. The header's tint is the accent, but iOS
 * 26's glass back button draws its chevron and label in the system colour
 * regardless. One's web stacks are headless, so on the web only
 * `contentStyle` draws, and the web's header reads `headerRight`.
 *
 * A screen named in `headers` takes its title and buttons from its route's
 * params here, as the stack lays the screen out, so the header is right on
 * the first frame of its push and follows `setParams` at once: no effect of
 * the screen's own sets them, and the header never shows the route's name.
 */
export const stackOptions =
  (accent: ColorValue, headers: Headers) =>
  ({ route }: { readonly route: StackRoute }) => ({
    contentStyle: { backgroundColor: color.ground },
    headerStyle: { backgroundColor: color.ground },
    headerTintColor: accent,
    headerTitleStyle: { color: color.ink },
    headerLargeTitleStyle: { color: color.ink },
    ...Option.match(Record.get(headers, route.name), {
      onNone: () => ({}),
      onSome: (header) => header(Option.getOrElse(decodeParams(route.params), () => ({}))),
    }),
  });

/** The stack's options in the theme's accent now. */
export const useStackOptions = (headers: Headers) => stackOptions(useAccent(), headers);

/** The presentations iOS draws in a native modal of their own, over the stack's column and the bar docked under it. */
const OVER = new Set(['modal', 'transparentModal', 'fullScreenModal', 'formSheet', 'pageSheet']);

/** Whether a screen presented with `options` is drawn over the stack (a sheet or a modal), not in it. */
export const drawnOver = (options: { readonly presentation?: string }): boolean =>
  OVER.has(options.presentation ?? 'card');

/** A stack's screens, oldest first, and the one shown, as React Navigation keeps them. */
interface Stacked {
  readonly routes: ReadonlyArray<StackRoute>;
  readonly index?: number;
}

/**
 * `state` with every screen drawn over the stack (its route named in `over`)
 * that lies under a screen drawn in it left out. A screen pushed over a sheet
 * is drawn inside that sheet's native modal, over the docked bar, so its
 * Play, Pause and `#` cannot be reached; with the sheets under it left out,
 * the sheet closes and the screen is pushed where the sheet was, and Back
 * goes where Back from the sheet went. A stack with no such sheet is `state`
 * itself.
 */
export const outOfSheets = <S extends Stacked>(state: S, over: ReadonlySet<string>): S => {
  const lastInStack = Option.getOrElse(
    Arr.findLastIndex(state.routes, (route) => !over.has(route.name)),
    () => -1,
  );
  const kept = state.routes.filter((route, at) => at > lastInStack || !over.has(route.name));
  if (kept.length === state.routes.length) return state;
  const index = Option.fromNullishOr(state.routes[state.index ?? state.routes.length - 1]).pipe(
    Option.flatMap((shown) => Arr.findFirstIndex(kept, (route) => route === shown)),
    Option.getOrElse(() => kept.length - 1),
  );
  return { ...state, routes: kept, index };
};

/** The part of a navigator's router the stack overrides: the state an action leads to. */
interface ActionRouter<State, Next, Action, Options> {
  readonly getStateForAction: (
    state: State,
    action: Action,
    options: Options,
    // oxlint-disable-next-line effect/noNullish -- React Navigation's router answers null for an action it does not handle.
  ) => Next | null;
}

/**
 * The stack's router (`Stack`'s `router` prop) with every action's state put
 * `outOfSheets`, so no path that opens a screen (a link, the `#` drums, a
 * search's result) leaves it inside a sheet.
 */
export const cardsOutOfSheets =
  (over: ReadonlySet<string>) =>
  <State, Next extends Stacked, Action, Options>(
    original: ActionRouter<State, Next, Action, Options>,
  ): ActionRouter<State, Next, Action, Options> => ({
    getStateForAction: (state, action, options) =>
      Option.fromNullishOr(original.getStateForAction(state, action, options)).pipe(
        Option.map((next) => outOfSheets(next, over)),
        Option.getOrNull,
      ),
  });
