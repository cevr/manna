/* oxlint-disable effect/noGlobals -- react-native-web keeps a view's `onLayout` on its node, where the test calls it as the platform would. */
/* oxlint-disable effect/noTestLifecycleHooks, effect/noUnknownParameters, effect/noNewPromise, effect/noAsyncFunction, effect/noNullish, effect/noTernary -- a React screen test: the role sheet is in the document for the file and animations land after each case; the layout handler takes the platform's untyped event; Reduce Motion stands in as the platform's promise; `act` and a source file's text are awaited; `closest` answers null for no match; a case's name prints the OverBar state only when there is one. */

/**
 * The find bar and the key panel's chips, as the owner asked (2026-11-01,
 * plan `packages/hymnal/plans/hymnapp-run.md`, unit findlook): the Tuner
 * chip and Reset are one height, the Tuner's mark small and upright; the
 * find bar's capsule is glass (`glass`), its marks the
 * glass's ink, and one chosen mark, a disk in the `glassChosen` colour behind
 * the chosen control: the `#` while the drums are open, Search while search
 * is open, and none at rest (owner, 2026-11-11: the `#` "shouldn't be
 * highlighted ... should only be highlighted once this is open"). With
 * Reduce Motion the mark jumps. Between a hymn page and the home list the whole
 * bar glides (`glideOf`); the bar's own rise rides the bar's spring.
 *
 * Mounted in a browser's document (`src/test/setup.ts`), where an animation
 * waits between `holdAnimations` and `landAnimations` as one under way on a
 * device. A view's layout is told as the platform tells it, through its
 * `onLayout`. Hymn numbers only: no hymn's words are read or printed.
 */

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'bun:test';
import type * as Chord from '@manna/hymnal/chord';
import { RegistryProvider } from '@effect/atom-react';
import { Option } from 'effect';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { AccessibilityInfo, Pressable, Text } from 'react-native';
import { holdAnimations, landAnimations } from '~/test/reanimated';

import * as finding from '~/home/finding';
import { FindBar } from '~/home/FindBar';
import * as bar from '~/player/bar';
import { Dials } from '~/player/Dials';
import { Player } from '~/player/player';
import { searchAt, type Searching, searchOpen } from '~/reader/place';
import * as themes from '~/theme';

const PAGE = '/hymns/8';
const HASH = 44;

/**
 * The theme's roles as the web reads them (`var(--<role>)`, `color.ts`),
 * each set here to a colour of its own, so a computed colour names the role
 * it came from. Set for this file's tests alone.
 */
const ROLES = [
  'ground',
  'ink',
  'muted',
  'line',
  'accent',
  'chord',
  'soft',
  'onAccent',
  'pressed',
  'onPressed',
  'panel',
  'edge',
  'bar',
  'pill',
  'onPill',
  'chosen',
  'onChosen',
  'glass',
  'onGlass',
  'onGlassMuted',
  'glassChosen',
  'onGlassChosen',
] as const;
type Role = (typeof ROLES)[number];
const role = (name: Role) => `rgb(${ROLES.indexOf(name) + 1}, 1, 2)`;
const roleSheet = document.createElement('style');
roleSheet.textContent = `:root { ${ROLES.map((name) => `--${name}: ${role(name)};`).join(' ')} }`;
beforeAll(() => document.head.append(roleSheet));
afterAll(() => roleSheet.remove());

/** The `#` the player layer hands the bar: one pressable, on a disk or not. */
const hash = () => (
  <Pressable testID="find-number" role="button" aria-label="Find a hymn by number">
    <Text>#</Text>
  </Pressable>
);

/** A mounted tree in the document; disposed, it unmounts. */
const mounted = (tree: React.ReactNode) => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  act(() => root.render(tree));
  const one = (selector: string) => Option.fromNullishOr(host.querySelector<HTMLElement>(selector));
  return {
    host,
    one,
    /** The element at `selector`, which must be there. */
    get: (selector: string): HTMLElement => {
      const found = one(selector);
      expect({ [selector]: Option.isSome(found) }).toEqual({ [selector]: true });
      return Option.getOrThrow(found);
    },
    [Symbol.dispose]: () => {
      act(() => root.unmount());
      host.remove();
    },
  };
};

/** The find bar on a hymn page with search `open` or not and the drums open or shut. */
const findBar = (open: Option.Option<Searching>, drumsOpen: boolean) =>
  mounted(
    <RegistryProvider initialValues={[[searchOpen, open]]}>
      <FindBar path={PAGE} bottom={0} drums={<></>} drumsOpen={drumsOpen} hash={hash} />
    </RegistryProvider>,
  );
type Bar = ReturnType<typeof findBar>;

const style = (element: Element) => getComputedStyle(element);

/** Whether a computed fill draws nothing: none set, or a colour with no alpha. */
const clear = (fill: string) =>
  fill === '' || fill === 'transparent' || /^rgba\(.*,\s*0(\.0+)?\)$/.test(fill);

/** The capsule: the nearest view over `control`, inside the find bar, with a fill of its own. */
const capsuleOf = (control: HTMLElement): Option.Option<HTMLElement> => {
  const filled = (view: HTMLElement): Option.Option<HTMLElement> => {
    if (view.dataset['testid'] === 'find-bar') return Option.none();
    const fill = style(view).backgroundColor;
    if (!clear(fill)) return Option.some(view);
    return Option.flatMap(Option.fromNullishOr(view.parentElement), filled);
  };
  return Option.flatMap(Option.fromNullishOr(control.parentElement), filled);
};

/** The capsule over the bar's leading control, Search folded or the box open. */
const capsule = (found: Bar) => {
  const control = Option.orElse(found.one('[data-testid="find-search"]'), () =>
    found.one('[data-testid="find-box"]'),
  );
  const view = Option.flatMap(control, capsuleOf);
  expect({ capsule: Option.isSome(view) }).toEqual({ capsule: true });
  return Option.getOrThrow(view);
};

/** The sideways move a view's transform draws, 0 when it draws none. */
const translateX = (element: Element) => {
  const drawn = style(element).transform;
  const moved = /translateX\((-?[\d.]+)px\)/.exec(drawn);
  return Number(moved?.[1] ?? 0);
};

/** The find bar's row laid out `width` points wide, as the platform tells it once drawn. */
const layOut = (found: Bar, width: number) => {
  const row = found.get('[data-testid="find-bar"]') as HTMLElement & {
    __reactLayoutHandler?: (event: unknown) => void;
  };
  act(() =>
    row.__reactLayoutHandler?.({
      nativeEvent: { layout: { x: 0, y: 0, width, height: HASH } },
      timeStamp: 0,
    }),
  );
};

/** Where the chosen mark rests over the capsule's leading end: its full width less one control, leftward. */
const leading = (found: Bar) => -(Number.parseFloat(style(capsule(found)).width) - HASH);

/** Reduce Motion on, as the system tells it, for the bar mounted after. */
const reduceMotion = () => {
  const was = AccessibilityInfo.isReduceMotionEnabled;
  AccessibilityInfo.isReduceMotionEnabled = () => Promise.resolve(true);
  return {
    [Symbol.dispose]: () => {
      AccessibilityInfo.isReduceMotionEnabled = was;
    },
  };
};

afterEach(() => landAnimations());

describe('the key panel’s chips', () => {
  const key: Chord.Key = { tonic: 'C', minor: false };
  /** The panel open on a hymn moved from its printed key, so Reset shows beside the Tuner. */
  const dials = () =>
    mounted(
      <Dials
        thumb={{
          printed: Option.some(key),
          state: { chords: true, move: { transpose: 2, capo: 1 }, open: true },
          send: () => {},
          keep: () => {},
          resets: 0,
        }}
        printed={key}
        tuner
      />,
    );

  it('the Tuner and Reset are one height, 32 points', () => {
    using panel = dials();
    const tuner = panel.get('[data-testid="dials-tuner"]');
    const reset = panel.get('[data-testid="dials"] [role="button"][aria-label="Reset"]');
    expect({ tuner: style(tuner).height, reset: style(reset).height }).toEqual({
      tuner: '32px',
      reset: '32px',
    });
  });

  it('the Tuner’s mark is small and upright: at most 14 points tall, no wider than tall, nothing turned', () => {
    using panel = dials();
    const tuner = panel.get('[data-testid="dials-tuner"]');
    const mark = Option.getOrThrow(
      Option.fromNullishOr(tuner.querySelector<HTMLElement>('[aria-hidden="true"]')),
    );
    const height = Number.parseFloat(style(mark).height);
    const width = Number.parseFloat(style(mark).width);
    const turned = [mark, ...mark.querySelectorAll('*')].filter((part) =>
      /rotate/.test(style(part).transform),
    );
    expect({ small: height <= 14, upright: width <= height, turned: turned.length }).toEqual({
      small: true,
      upright: true,
      turned: 0,
    });
  });

  it('on iOS the Tuner’s mark is drawn, not the diagonal tuning-fork symbol', async () => {
    const ios = await Bun.file(new URL('../player/BarMark.ios.tsx', import.meta.url)).text();
    expect(ios.includes('tuningfork')).toBe(false);
  });
});

describe('the find bar’s colours', () => {
  it.each([
    ['folded', Option.none<Searching>()],
    ['open', searchAt(PAGE, 'field')],
  ] as const)('%s, the capsule is glass', (_, open) => {
    using found = findBar(open, false);
    expect(style(capsule(found)).backgroundColor).toBe(role('glass'));
  });

  it('open, the typed words are the glass’s ink and the placeholder its quiet ink', () => {
    using found = findBar(searchAt(PAGE, 'field'), false);
    const box = found.get('[data-testid="find-box"]');
    expect({
      words: style(box).color,
      placeholder: box.style.getPropertyValue('--placeholderTextColor'),
    }).toEqual({ words: role('onGlass'), placeholder: 'var(--onGlassMuted)' });
  });

  it('the magnifier is the glass’s ink folded, and the chosen ink open, where the chosen mark lies behind it', () => {
    /** The fills the magnifier's parts draw with: its views hidden from VoiceOver in the capsule, the chosen mark and the `#` left out. */
    const inkOf = (found: Bar) => {
      const marks = [
        ...capsule(found).querySelectorAll<HTMLElement>('[aria-hidden="true"]'),
      ].filter(
        (view) =>
          view.closest('[data-testid="find-chosen"]') === null &&
          view.closest('[data-testid="find-number"]') === null,
      );
      const fills = marks.flatMap((view) =>
        [...view.querySelectorAll('*')]
          .map((part) => style(part).backgroundColor)
          .filter((fill) => !clear(fill)),
      );
      return [...new Set(fills)];
    };
    using folded = findBar(Option.none(), false);
    const shut = inkOf(folded);
    using open = findBar(searchAt(PAGE, 'field'), false);
    expect({ folded: shut, open: inkOf(open) }).toEqual({
      folded: [role('onGlass')],
      open: [role('onGlassChosen')],
    });
  });

  it.each([
    ['folded', Option.none<Searching>(), false, 0],
    ['open', searchAt(PAGE, 'field'), false, 1],
    ['folded, the drums open', Option.none<Searching>(), true, 1],
    ['open, the drums open', searchAt(PAGE, 'field'), true, 1],
  ] as const)(
    '%s, one chosen mark in the chosen colour, out of touch and of VoiceOver, seen only while something is open',
    (_, open, drumsOpen, seen) => {
      using found = findBar(open, drumsOpen);
      const marks = [...found.host.querySelectorAll<HTMLElement>('[data-testid="find-chosen"]')];
      expect(
        marks.map((mark) => ({
          fill: style(mark).backgroundColor,
          hidden: mark.getAttribute('aria-hidden'),
          touch: style(mark).pointerEvents,
          seen: Number(style(mark).opacity || 1),
        })),
      ).toEqual([{ fill: role('glassChosen'), hidden: 'true', touch: 'none', seen }]);
    },
  );
});

describe('the chosen mark', () => {
  const rows: ReadonlyArray<finding.Row> = ['folded', 'open', 'tiles'];

  it('is the # while the drums are open, Search while search is open, and none at rest: every row, drums open or shut', () => {
    const cases = rows.flatMap((row) => [false, true].map((drumsOpen) => ({ row, drumsOpen })));
    const want = ({ row, drumsOpen }: (typeof cases)[number]) =>
      (drumsOpen && 'hash') || (row === 'open' && 'search') || 'none';
    expect(cases.map((c) => [c, finding.chosenOf(c.row, c.drumsOpen)])).toEqual(
      cases.map((c) => [c, want(c)]),
    );
  });

  it('draws the # chosen only while the drums are open, alone on its disk in the tiles: every row, drums open or shut', () => {
    const cases = rows.flatMap((row) => [false, true].map((drumsOpen) => ({ row, drumsOpen })));
    const want = ({ row, drumsOpen }: (typeof cases)[number]) =>
      (row === 'tiles' && ((drumsOpen && 'aloneChosen') || 'alone')) ||
      (drumsOpen && 'chosen') ||
      'unchosen';
    expect(
      cases.map((c) => [c, finding.hashLookOf(c.row, finding.chosenOf(c.row, c.drumsOpen))]),
    ).toEqual(cases.map((c) => [c, want(c)]));
  });

  it('fades in behind Search as search opens, and out where it stands on Cancel', () => {
    using found = findBar(Option.none(), false);
    layOut(found, 343);
    const mark = () => found.get('[data-testid="find-chosen"]');
    const seen = () => Number(style(mark()).opacity || 1);
    const folded = seen();
    act(() => found.get('[data-testid="find-search"]').click());
    const opened = { at: translateX(mark()), leading: leading(found), seen: seen() };
    holdAnimations();
    act(() => found.get('[data-testid="find-cancel"]').click());
    const fading = { at: translateX(mark()), seen: seen() };
    act(() => landAnimations());
    expect({
      folded,
      opened: opened.at === opened.leading && opened.at < 0 && opened.seen,
      fading: fading.at === opened.at && fading.seen,
      landed: seen(),
    }).toEqual({ folded: 0, opened: 1, fading: 1, landed: 0 });
  });

  it('with the drums open, stays on the # with search open', () => {
    using found = findBar(searchAt(PAGE, 'field'), true);
    layOut(found, 343);
    expect(translateX(found.get('[data-testid="find-chosen"]'))).toBe(0);
  });

  it('with Reduce Motion, jumps to Search as search opens', async () => {
    using _reduced = reduceMotion();
    using found = findBar(Option.none(), false);
    await act(async () => {});
    layOut(found, 343);
    holdAnimations();
    act(() => found.get('[data-testid="find-search"]').click());
    const at = translateX(found.get('[data-testid="find-chosen"]'));
    expect({ jumped: at === leading(found) && at < 0 }).toEqual({ jumped: true });
  });
});

describe('the bar’s glide between its places', () => {
  const track = { number: 8, title: 'Stand-in' };
  const states: ReadonlyArray<Player> = [
    Player.Idle(),
    Player.Loading({ track }),
    Player.Playing({ track, at: 1, length: Option.some(100) }),
    Player.Buffering({ track, at: 1, length: Option.some(100), retry: false }),
    Player.Paused({ track, at: 1, length: Option.some(100) }),
    Player.Ended({ track, length: Option.some(100) }),
    Player.Stopped({ track, at: Option.none() }),
    Player.Failed({ track, offline: true, at: Option.none() }),
  ];
  const places: ReadonlyArray<bar.FindAt> = [
    bar.FindAt.Nowhere(),
    bar.FindAt.Docked(),
    bar.FindAt.Yielded(),
    ...states.map((state) => bar.FindAt.OverBar({ state })),
  ];
  /** The bar's height over the home indicator while it shows `state`. */
  const heightOver = (state: Player) => (bar.sounding(state) && bar.SOUNDING) || bar.REST;
  /** The rule as the spec writes it. */
  const want = (before: bar.FindAt, after: bar.FindAt) => {
    const tags = `${before._tag}>${after._tag}`;
    if (tags === 'OverBar>Docked' || tags === 'Docked>OverBar') return 'glide';
    if (before._tag === 'OverBar' && after._tag === 'OverBar')
      return (heightOver(before.state) !== heightOver(after.state) && 'bar') || 'none';
    return 'none';
  };

  it('glides between over the bar and docked, rides the bar’s spring as the bar rises or falls, and else moves nothing: every pair of places', () => {
    const pairs = places.flatMap((before) => places.map((after) => ({ before, after })));
    const named = ({ before, after }: (typeof pairs)[number]) =>
      `${before._tag}${before._tag === 'OverBar' ? `(${before.state._tag})` : ''} > ${after._tag}${after._tag === 'OverBar' ? `(${after.state._tag})` : ''}`;
    expect(pairs.map((pair) => [named(pair), bar.glideOf(pair.before, pair.after)])).toEqual(
      pairs.map((pair) => [named(pair), want(pair.before, pair.after)]),
    );
  });
});

describe('the theme’s find bar roles', () => {
  const rgb = (hex: string) =>
    [hex.slice(1, 3), hex.slice(3, 5), hex.slice(5, 7)].map((pair) => Number.parseInt(pair, 16));
  const linear = (channel: number) => {
    const c = channel / 255;
    return (c <= 0.04045 && c / 12.92) || ((c + 0.055) / 1.055) ** 2.4;
  };
  const luminance = (hex: string) => {
    const [r = 0, g = 0, b = 0] = rgb(hex);
    return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
  };
  const contrast = (a: string, b: string) => {
    const [la, lb] = [luminance(a), luminance(b)];
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  };

  it.each(['light', 'dark'] as const)(
    '%s: the capsule is soft glass, the chosen disk the accent with its ink on it (4.5:1), and the placeholder quieter than the words',
    (scheme) => {
      const roles = themes.theme[scheme];
      expect({
        glass: roles.glass,
        words: roles.onGlass,
        chosen: roles.glassChosen,
        onChosen: contrast(roles.onGlassChosen, roles.glassChosen) >= 4.5,
        quieter: roles.onGlassMuted !== roles.onGlass,
      }).toEqual({
        glass: `${roles.soft}d9`,
        words: roles.ink,
        chosen: roles.accent,
        onChosen: true,
        quieter: true,
      });
    },
  );
});
