// What the lab's touch, token, budget and phone-fit guards open: the
// devices they are asked on, every place a page is at in each state it
// discloses (`STATES`), and how a state opens and is read.

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

/**
 * Every place a lab page is at (`Places`, `core/api.ts`): all but a film's
 * export page, the renderer's and the easel's, which has no chrome to touch
 * and no phone to fit (`e2e/player/render.dom.test.ts` opens it), and home,
 * which is no page (the lab sends it on to an ask, `tools/lab-home.ts`).
 */
export type PlaceName = Exclude<keyof typeof Places, 'export' | 'home'>;

export const SLOW = 30_000;

/** A device the studio is used on: its window and pointer, the media query its pointer matches, and the target it needs. */
export interface Device {
  readonly name: string;
  readonly viewport: Viewport;
  readonly pointer: string;
  readonly hit: number;
  /** Which of a view's budgets is this device's. */
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

/**
 * The most things a view shows on its first screen at rest on each device
 * (`firstScreenItems`: its controls, pictures and text leaves, as the
 * UI-reduction sweep's `count.js` counts them; Progressive
 * disclosure: a thing earns a place at rest by being used in most visits).
 * A budget is raised only in the commit that adds the thing, saying why
 * most visits use it.
 */
export interface Budget {
  readonly phone: number;
  readonly laptop: number;
}

/** A view's budget: at most `phone` things on a phone, `laptop` on a laptop. */
export const most = (phone: number, laptop: number): Budget => ({ phone, laptop });

/** An ask at rest: its budget, which a planted button or a planted line of text passes (the budget's positive controls). */
export const ASK_AT_REST = most(23, 23);

/** A page in one state: how it opens on a device, what discloses the state, and the layer measured. */
export interface State {
  readonly name: string;
  readonly open: (viewport: Viewport) => Effect.Effect<Tab, never, Scope.Scope>;
  readonly disclose: (page: Tab) => Effect.Effect<void>;
  /** A view at rest: the most things it shows on its first screen (`Budget`). */
  readonly budget?: Budget;
  /** The most things its whole length shows, below the fold too (`Budget`): on a long view. */
  readonly page?: Budget;
  /** The layer the state opens, measured within itself; none: the whole page. */
  readonly layer?: string;
}

/** A place's first case, the place as it opens: the budget of what it shows is not optional. */
export interface AtRest extends State {
  readonly budget: Budget;
}

/** A place a guard here does not open itself: the place whose cases measure it, and why. */
export interface Exempt {
  readonly measuredAt: PlaceName;
  readonly why: string;
}

/**
 * What a guard opens at each place: a place added to `Places` is opened here
 * by one case at least or named exempt, with the place that measures it and
 * why, or this fails to typecheck (an empty list too); `First` is the kind of
 * the first case, which for the touch guard's table is the place at rest, its
 * budget required; and each case checks its page is at the place it is keyed
 * by (`isAt`).
 */
export type ByPlace<A, First extends A = A> = Readonly<
  Record<PlaceName, readonly [First, ...ReadonlyArray<A>] | Exempt>
>;

// The type's own probe: a place given an empty list fails to typecheck.
// @ts-expect-error: an empty list neither opens a place nor names it exempt
void ([] satisfies ByPlace<State>[PlaceName]);

// The table's own probe: a place at rest without a budget fails to typecheck.
void ([
  // @ts-expect-error: the first case of a place is the place at rest, and carries its budget
  { name: 'a place', open: () => Effect.die('x'), disclose: () => Effect.void },
] satisfies ByPlace<State, AtRest>[PlaceName]);

/** Each case of `cases` with the place it is keyed by; an exempt place has none. */
export const byPlace = <A>(cases: ByPlace<A>): ReadonlyArray<readonly [PlaceName, A]> =>
  Struct.keys(cases).flatMap((place) => {
    const at = cases[place];
    if ('measuredAt' in at) return [];
    return at.map((one) => [place, one] as const);
  });

/** The exempt places of `cases` whose measuring place is exempt itself: measured nowhere. */
export const unmeasured = <A>(cases: ByPlace<A>): ReadonlyArray<PlaceName> =>
  Struct.keys(cases).filter((place) => {
    const at = cases[place];
    return 'measuredAt' in at && 'measuredAt' in cases[at.measuredAt];
  });

/** Dies unless the page is at `place`: its path and query decode as that place's. */
export const isAt = (page: Tab, place: PlaceName) =>
  Effect.flatMap(page.evaluate<string>('location.pathname + location.search'), (href) => {
    const at: Place.Place<unknown> = Places[place];
    return Option.match(Place.decode(at, href), {
      onNone: () => Effect.die(`the page is at ${href}, not at the place ${place}`),
      onSome: () => Effect.void,
    });
  });

/** The page as it opens: nothing disclosed. */
export const AT_REST = (_page: Tab) => Effect.void;

/** The ask page at `href` (an ask's, or a page of asks'), once each of `ready` shows. */
export const asked =
  (href: string, ...ready: ReadonlyArray<string>) =>
  (viewport: Viewport) =>
    Effect.gen(function* () {
      const { page } = yield* openAsk(studioRoutes, { href, viewport });
      for (const selector of ready) yield* waitFor(page, selector);
      return page;
    });

/** A click on `selector`, then `shows` on the page. */
export const opens = (selector: string, shows: string) => (page: Tab) =>
  Effect.andThen(page.click(selector), waitFor(page, shows));

/** A key pressed, then `shows` on the page. */
export const pressed = (key: string, shows: string) => (page: Tab) =>
  Effect.andThen(page.press(key), waitFor(page, shows));

export const COMMAND_MENU = '[data-role="command-menu"]';
export const CONTEXT_MENU = '[data-role="context-menu"]';
export const KEYS = '[data-role="keys-sheet"]';
export const VIEW_MENU = '[data-role="view-menu"]';
export const RECEIPTS = '[data-role="receipts"]';

/** An ask, read: its page's send, under its sections. */
export const ASK_READY = '.ak-sections:has(.ak-step) ~ .ak-send [data-act="send"]';

/** A page of asks, read: its count, and its last part's send under its sections. */
export const PAGE_READY = `.akp:has(.akp-count) .ak[data-ask="${STUDIO_PAGE_PACE}"] ${ASK_READY}`;

export const STATES: ByPlace<State, AtRest> = {
  ask: [
    {
      name: "an agent's ask, at its first step: a choice of three",
      open: asked(pageHref.ask(STUDIO_ASK), ASK_READY),
      disclose: AT_REST,
      // A page of one section has no "1 of 1" head, and an ask that waits wears no chip (the
      // dock's count says what is left).
      budget: ASK_AT_REST,
    },
    {
      // The shell's view menu (`⋯`), which the ask page's header holds.
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
      // A press on no thing opens the page's own commands.
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
      // Copy link, run from ⌘K: its receipt says what it copied.
      name: 'an ask, a receipt',
      open: asked(pageHref.ask(STUDIO_ASK), ASK_READY),
      disclose: (page) =>
        Effect.gen(function* () {
          yield* page.press('Control+k');
          yield* page.fill('.lab-command-query', 'copy link');
          yield* waitFor(page, `${COMMAND_MENU} [data-command="link.copy"]`);
          yield* page.press('Enter');
          yield* waitFor(page, `${RECEIPTS} [data-role="receipt"]`);
          // The receipt's own timer does not put it away before it is measured.
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
      // The shell's, the page's head and count, the answered ask's one line, then each ask still
      // asking: its head, why, choice and Send (measured 26 on a phone, 27 on a laptop).
      budget: most(26, 27),
    },
  ],
};

/**
 * Every shown target in `layer` (the page when none) is `device`'s size, or
 * kept by a principle, and its hit-slop lies over no neighbour; else each
 * one that is not is named.
 */
export const sized = (page: Tab, device: Device, layer?: string) => {
  const now = undersizedTargets(device.hit, layer);
  return page.until(`${now}.length === 0`, {
    now,
    say: (found) =>
      `targets under ${device.hit} × ${device.hit} px, or reaching over a neighbour, on ${device.name} (what its pointer meets): ${found}`,
  });
};

/** `state` opened at `place` on `device`, with the device's pointer, and disclosed. */
export const disclosed = (place: PlaceName, state: State, device: Device) =>
  Effect.gen(function* () {
    const page = yield* state.open(device.viewport);
    yield* isAt(page, place);
    // The page has the device's pointer, so its density tokens are the device's.
    yield* page.until(`matchMedia('${device.pointer}').matches`);
    yield* state.disclose(page);
    return page;
  });

/** Every target `state` shows is `device`'s size (`sized`). */
export const targetsIn = (place: PlaceName, state: State, device: Device) =>
  Effect.gen(function* () {
    const page = yield* disclosed(place, state, device);
    yield* sized(page, device, state.layer);
  }).pipe(Effect.scoped);

/** Everything `state` draws is drawn in the tokens (`untokened`). */
export const drawnIn = (place: PlaceName, state: State, device: Device) =>
  Effect.gen(function* () {
    const page = yield* disclosed(place, state, device);
    yield* until(page, `document.fonts.status === 'loaded'`);
    yield* evaluates(page, untokened(tokensCss), []);
  }).pipe(Effect.scoped);
