/* oxlint-disable effect/noTestLifecycleHooks -- a React screen test: the role sheet is in the document for the file, and animations land after each case. */

/**
 * Acceptance (tidyup A3): the find bar's capsule is glass, as the owner asked
 * (2026-11-02): "Let's make the search not have white. Let's make it glass
 * colour, like a glass background."
 *
 * The theme (`src/theme.ts`), in light and dark:
 * - `glass` is the search field's own role, `soft`, at 85 % (`#rrggbbd9`).
 * - Over every role a screen draws under the bar (every role but the glass
 *   ones), the glass laid on it keeps the typed words (`onGlass`, the ink)
 *   and the placeholder (`onGlassMuted`) at WCAG AA (4.5:1), and the chosen
 *   disk (`glassChosen`, the button) at 3:1; the chosen disk's mark
 *   (`onGlassChosen`) keeps AA on it.
 * - The placeholder is the ink moved toward `soft`, in hundredths, as far as
 *   AA holds over every one of those roles.
 *
 * The bar (`FindBar`), mounted in a browser's document (`src/test/setup.ts`)
 * with each role set to a colour of its own: the capsule is `glass`, folded
 * and open; the typed words `onGlass`, the placeholder `onGlassMuted`; the
 * chosen disk `glassChosen`.
 *
 * Final path: `apps/hymnal/src/home/findglass.test.tsx`.
 */

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'bun:test';
import { RegistryProvider } from '@effect/atom-react';
import { Option } from 'effect';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Pressable, Text } from 'react-native';
import { landAnimations } from '~/test/reanimated';

import { FindBar } from '~/home/FindBar';
import { searchAt, type Searching, searchOpen } from '~/reader/place';
import * as themes from '~/theme';

const PAGE = '/hymns/8';

type Rgb = readonly [number, number, number];
const channel = (hex: string, at: number) => Number.parseInt(hex.slice(at, at + 2), 16);
const rgb = (hex: string): Rgb => [channel(hex, 1), channel(hex, 3), channel(hex, 5)];
const hex = (channels: ReadonlyArray<number>) =>
  `#${channels
    .map((v) =>
      Math.round(Math.max(0, Math.min(255, v)))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
/** `a` mixed `t` of the way toward `b`, per sRGB channel, rounded as the theme rounds. */
const mix = (a: string, b: string, t: number) => {
  const [x, y] = [rgb(a), rgb(b)];
  return hex(x.map((v, k) => v + ((y[k] ?? v) - v) * t));
};
const linear = (c: number) => {
  const v = c / 255;
  if (v <= 0.03928) return v / 12.92;
  return ((v + 0.055) / 1.055) ** 2.4;
};
const luminance = (color: string) => {
  const [r, g, b] = rgb(color);
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
};
/** WCAG 2's contrast ratio. */
const contrast = (a: string, b: string) => {
  const [la, lb] = [luminance(a), luminance(b)];
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};
/** A `#rrggbbaa` colour laid over an opaque `under`, as the screen draws it. */
const over = (glass: string, under: string) =>
  mix(under, glass.slice(0, 7), channel(glass, 7) / 255);

const GLASS_ROLES = new Set(['glass', 'onGlass', 'onGlassMuted', 'glassChosen', 'onGlassChosen']);

describe('the theme’s glass', () => {
  for (const scheme of ['light', 'dark'] as const) {
    const roles: Readonly<Record<string, string>> = themes.theme[scheme];
    const under = Object.entries(roles).filter(([name]) => !GLASS_ROLES.has(name));

    it(`${scheme}: glass is soft at 85 %, and the words are the ink`, () => {
      expect({
        glass: roles['glass'],
        onGlass: roles['onGlass'],
        opaqueUnder: under.every(([, value]) => /^#[0-9a-f]{6}$/.test(value)),
      }).toEqual({ glass: `${roles['soft']}d9`, onGlass: roles['ink'], opaqueUnder: true });
    });

    it(`${scheme}: over every role under the bar, the words and the placeholder keep 4.5:1 and the chosen disk 3:1`, () => {
      const glass = roles['glass'] ?? '';
      const failed = under.flatMap(([name, value]) => {
        const seen = over(glass, value);
        const least = [
          ['onGlass', 4.5],
          ['onGlassMuted', 4.5],
          ['glassChosen', 3],
        ] as const;
        return least
          .filter(([text, ratio]) => !(contrast(roles[text] ?? '', seen) >= ratio))
          .map(([text]) => `${text} over ${name}`);
      });
      expect({ checked: under.length, failed }).toEqual({ checked: under.length, failed: [] });
      expect(under.length).toBeGreaterThanOrEqual(16);
    });

    it(`${scheme}: the chosen disk is the button, and its mark keeps 4.5:1 on it`, () => {
      expect({
        chosen: roles['glassChosen'],
        mark: contrast(roles['onGlassChosen'] ?? '', roles['glassChosen'] ?? '') >= 4.5,
      }).toEqual({ chosen: roles['button'], mark: true });
    });

    it(`${scheme}: the placeholder is the ink moved toward soft as far as AA holds over every role under the bar`, () => {
      const glass = roles['glass'] ?? '';
      const ink = roles['ink'] ?? '';
      const holds = (tone: string) =>
        under.every(([, value]) => contrast(tone, over(glass, value)) >= 4.5);
      const quietest = Array.from({ length: 101 }, (_, step) =>
        mix(ink, roles['soft'] ?? '', step / 100),
      ).findLast(holds);
      expect({
        placeholder: roles['onGlassMuted'],
        quieter: roles['onGlassMuted'] !== ink,
      }).toEqual({ placeholder: quietest ?? 'no tone holds', quieter: true });
    });
  }
});

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
  'onPillMuted',
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
afterEach(() => landAnimations());

/** The `#` the player layer hands the bar. */
const hash = () => (
  <Pressable testID="find-number" role="button" aria-label="Find a hymn by number">
    <Text>#</Text>
  </Pressable>
);

/** The find bar on a hymn page with search `open` or not, mounted; disposed, it unmounts. */
const findBar = (open: Option.Option<Searching>) => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  act(() =>
    root.render(
      <RegistryProvider initialValues={[[searchOpen, open]]}>
        <FindBar path={PAGE} bottom={0} drums={<></>} drumsOpen={false} hash={hash} />
      </RegistryProvider>,
    ),
  );
  const get = (selector: string) =>
    Option.getOrThrow(Option.fromNullishOr(host.querySelector<HTMLElement>(selector)));
  return {
    get,
    [Symbol.dispose]: () => {
      act(() => root.unmount());
      host.remove();
    },
  };
};

const style = (element: Element) => getComputedStyle(element);

/** Whether a computed fill draws nothing. */
const clear = (fill: string) =>
  fill === '' || fill === 'transparent' || /^rgba\(.*,\s*0(\.0+)?\)$/.test(fill);

/** The nearest fill over `control` inside the find bar: the capsule's. */
const capsuleFill = (control: HTMLElement): string => {
  const filled = (view: HTMLElement): string => {
    if (view.dataset['testid'] === 'find-bar') return 'none';
    const fill = style(view).backgroundColor;
    if (!clear(fill)) return fill;
    return Option.match(Option.fromNullishOr(view.parentElement), {
      onNone: () => 'none',
      onSome: filled,
    });
  };
  return Option.match(Option.fromNullishOr(control.parentElement), {
    onNone: () => 'none',
    onSome: filled,
  });
};

describe('the find bar’s glass', () => {
  it('folded, the capsule is glass and the chosen disk glassChosen', () => {
    using bar = findBar(Option.none());
    expect({
      capsule: capsuleFill(bar.get('[data-testid="find-search"]')),
      chosen: style(bar.get('[data-testid="find-chosen"]')).backgroundColor,
    }).toEqual({ capsule: role('glass'), chosen: role('glassChosen') });
  });

  it('open, the capsule is glass, the typed words onGlass and the placeholder onGlassMuted', () => {
    using bar = findBar(searchAt(PAGE, 'field'));
    const box = bar.get('[data-testid="find-box"]');
    expect({
      capsule: capsuleFill(box),
      words: style(box).color,
      placeholder: box.style.getPropertyValue('--placeholderTextColor'),
      chosen: style(bar.get('[data-testid="find-chosen"]')).backgroundColor,
    }).toEqual({
      capsule: role('glass'),
      words: role('onGlass'),
      placeholder: 'var(--onGlassMuted)',
      chosen: role('glassChosen'),
    });
  });
});
