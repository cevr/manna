import { Effect, Option, type Scope, Struct } from 'effect';
import { Place } from '@manna/url-state';
import { Places, pageHref } from '../../src/core/api.ts';
import { rightClick } from '../../src/lab/fixtures/gestures.ts';
import { type Viewport, openAsk, tokensCss } from '../../src/lab/fixtures/harness.ts';
import { untokened } from '../../src/lab/fixtures/drawn-tokens.ts';
import { evaluates, until, waitFor } from '../../src/lab/fixtures/settled.ts';
import {
  STUDIO_ASK,
  STUDIO_PAGE,
  STUDIO_PAGE_PACE,
  studioRoutes,
} from '../../src/lab/fixtures/studio-film.ts';
import type { Tab } from '../../src/lab/fixtures/tab.ts';
import { DESK_HIT, PHONE_HIT, undersizedTargets } from '../../src/lab/fixtures/touch-targets.ts';

export type PlaceName = Exclude<keyof typeof Places, 'export' | 'home'>;

export const SLOW = 30_000;

export interface Device {
  readonly name: string;
  readonly viewport: Viewport;
  readonly pointer: string;
  readonly hit: number;
  readonly budget: keyof Budget;
}

export const PHONE: Device = {
  name: 'a phone',
  viewport: { width: 390, height: 844, coarse: true },
  pointer: '(pointer: coarse)',
  hit: PHONE_HIT,
  budget: 'phone',
};
export const LAPTOP: Device = {
  name: 'a laptop',
  viewport: { width: 1440, height: 900 },
  pointer: '(pointer: fine)',
  hit: DESK_HIT,
  budget: 'laptop',
};
export const DEVICES: ReadonlyArray<Device> = [PHONE, LAPTOP];

export interface Budget {
  readonly phone: number;
  readonly laptop: number;
}

export const most = (phone: number, laptop: number): Budget => ({ phone, laptop });

export const ASK_AT_REST = most(23, 23);

export interface State {
  readonly name: string;
  readonly open: (viewport: Viewport) => Effect.Effect<Tab, never, Scope.Scope>;
  readonly disclose: (page: Tab) => Effect.Effect<void>;
  readonly budget?: Budget;
  readonly page?: Budget;
  readonly layer?: string;
}

export interface AtRest extends State {
  readonly budget: Budget;
}

export interface Exempt {
  readonly measuredAt: PlaceName;
  readonly why: string;
}

export type ByPlace<A, First extends A = A> = Readonly<
  Record<PlaceName, readonly [First, ...ReadonlyArray<A>] | Exempt>
>;

// @ts-expect-error: an empty list neither opens a place nor names it exempt
void ([] satisfies ByPlace<State>[PlaceName]);

void ([
  // @ts-expect-error: the first case of a place is the place at rest, and carries its budget
  { name: 'a place', open: () => Effect.die('x'), disclose: () => Effect.void },
] satisfies ByPlace<State, AtRest>[PlaceName]);

export const byPlace = <A>(cases: ByPlace<A>): ReadonlyArray<readonly [PlaceName, A]> =>
  Struct.keys(cases).flatMap((place) => {
    const at = cases[place];
    if ('measuredAt' in at) return [];
    return at.map((one) => [place, one] as const);
  });

export const unmeasured = <A>(cases: ByPlace<A>): ReadonlyArray<PlaceName> =>
  Struct.keys(cases).filter((place) => {
    const at = cases[place];
    return 'measuredAt' in at && 'measuredAt' in cases[at.measuredAt];
  });

export const isAt = (page: Tab, place: PlaceName) =>
  Effect.flatMap(page.evaluate<string>('location.pathname + location.search'), (href) => {
    const at: Place.Place<unknown> = Places[place];
    return Option.match(Place.decode(at, href), {
      onNone: () => Effect.die(`the page is at ${href}, not at the place ${place}`),
      onSome: () => Effect.void,
    });
  });

export const AT_REST = (_page: Tab) => Effect.void;

export const asked =
  (href: string, ...ready: ReadonlyArray<string>) =>
  (viewport: Viewport) =>
    Effect.gen(function* () {
      const { page } = yield* openAsk(studioRoutes, { href, viewport });
      for (const selector of ready) yield* waitFor(page, selector);
      return page;
    });

export const opens = (selector: string, shows: string) => (page: Tab) =>
  Effect.andThen(page.click(selector), waitFor(page, shows));

export const pressed = (key: string, shows: string) => (page: Tab) =>
  Effect.andThen(page.press(key), waitFor(page, shows));

export const COMMAND_MENU = '[data-role="command-menu"]';
export const CONTEXT_MENU = '[data-role="context-menu"]';
export const KEYS = '[data-role="keys-sheet"]';
export const VIEW_MENU = '[data-role="view-menu"]';
export const RECEIPTS = '[data-role="receipts"]';

export const ASK_READY = '.ak-sections:has(.ak-step) ~ .ak-send [data-act="send"]';

export const PAGE_READY = `.akp:has(.akp-count) .ak[data-ask="${STUDIO_PAGE_PACE}"] ${ASK_READY}`;

export const STATES: ByPlace<State, AtRest> = {
  ask: [
    {
      name: "an agent's ask, at its first step: a choice of three",
      open: asked(pageHref.ask(STUDIO_ASK), ASK_READY),
      disclose: AT_REST,
      budget: ASK_AT_REST,
    },
    {
      name: 'an ask, the view menu',
      open: asked(pageHref.ask(STUDIO_ASK), ASK_READY),
      disclose: opens('[data-act="view-menu"]', `${VIEW_MENU} [data-command]`),
      layer: VIEW_MENU,
    },
    {
      name: 'an ask, the command menu',
      open: asked(pageHref.ask(STUDIO_ASK), ASK_READY),
      disclose: pressed('Control+k', `${COMMAND_MENU} [data-command]`),
      layer: COMMAND_MENU,
    },
    {
      name: 'an ask, the context menu',
      open: asked(pageHref.ask(STUDIO_ASK), ASK_READY),
      disclose: (page) =>
        Effect.andThen(
          rightClick(page, '.ak-sections'),
          waitFor(page, `${CONTEXT_MENU} [data-command]`),
        ),
      layer: CONTEXT_MENU,
    },
    {
      name: 'an ask, the keys dialog',
      open: asked(pageHref.ask(STUDIO_ASK), ASK_READY),
      disclose: pressed('?', `${KEYS} [data-command]`),
      layer: KEYS,
    },
    {
      name: 'an ask, a receipt',
      open: asked(pageHref.ask(STUDIO_ASK), ASK_READY),
      disclose: (page) =>
        Effect.gen(function* () {
          yield* page.press('Control+k');
          yield* page.fill('.lab-command-query', 'copy link');
          yield* waitFor(page, `${COMMAND_MENU} [data-command="link.copy"]`);
          yield* page.press('Enter');
          yield* waitFor(page, `${RECEIPTS} [data-role="receipt"]`);
          yield* page.clock.hold;
        }),
      layer: RECEIPTS,
    },
  ],
  askPage: [
    {
      name: 'a page of three asks: the first answered and folded, two still asking',
      open: asked(pageHref.askPage(STUDIO_PAGE), PAGE_READY),
      disclose: AT_REST,
      budget: most(26, 27),
    },
  ],
};

export const sized = (page: Tab, device: Device, layer?: string) => {
  const now = undersizedTargets(device.hit, layer);
  return page.until(`${now}.length === 0`, {
    now,
    say: (found) =>
      `targets under ${device.hit} × ${device.hit} px, or reaching over a neighbour, on ${device.name} (what its pointer meets): ${found}`,
  });
};

export const disclosed = (place: PlaceName, state: State, device: Device) =>
  Effect.gen(function* () {
    const page = yield* state.open(device.viewport);
    yield* isAt(page, place);
    yield* page.until(`matchMedia('${device.pointer}').matches`);
    yield* state.disclose(page);
    return page;
  });

export const targetsIn = (place: PlaceName, state: State, device: Device) =>
  Effect.gen(function* () {
    const page = yield* disclosed(place, state, device);
    yield* sized(page, device, state.layer);
  }).pipe(Effect.scoped);

export const drawnIn = (place: PlaceName, state: State, device: Device) =>
  Effect.gen(function* () {
    const page = yield* disclosed(place, state, device);
    yield* until(page, `document.fonts.status === 'loaded'`);
    yield* evaluates(page, untokened(tokensCss), []);
  }).pipe(Effect.scoped);
