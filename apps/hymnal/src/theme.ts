/**
 * The app's colours: twenty-two roles in light and dark, all drawn from the
 * brand (`@manna/brand`, the one source the First the Blade site reads too)
 * as the owner's pick of 2026-10-25, "sky": the brand's painted sky as the
 * second colour, the night as the ink. A screen reads a role (`color.ts` on
 * the web, `color.native.ts` on a phone), never a hex value.
 *
 * Light is a cool white page (the sky tinted 88% toward white) under the
 * night's ink, with the night for the accent too (the hymn numbers, the
 * tint, the play button) and the dusk's gold deepened for the chords
 * (`chord`). Panels and pressed rows are the sky tinted less far toward
 * white, the rules a step deeper, and the key button's lit pill the sky
 * itself under the night (`pill`, `onPill`). Dark keeps the night as the
 * page, with a sky-white ink, the sky for quiet text, the dusk's gold for
 * the accent and the chords, the night raised (`nightPanel`) for panels and
 * pressed rows, and the docked bar a shade under the night (`bar`).
 *
 * Text on a fill (`onAccent`, `onPressed`, `onPill`, `onChosen`,
 * `onGlassChosen`) is the night where it meets AA on the fill, else white,
 * else black (`onColor`). A checked chip stands on the accent where the
 * accent reads at 3:1 on the pill, else on the pill's ink (`chosen`; by night
 * the gold does not, so the night). The find bar's capsule is glass: `soft`
 * at 85 % (`glass`), laid over whatever scrolls under the bar, with the ink
 * for its words (`onGlass`) and its chosen control on a disk of the accent
 * (`glassChosen`). Its placeholder is the ink moved toward `soft` as far as
 * AA holds over every opaque role with the glass laid on it (`onGlassMuted`).
 * A pressed accent is a fill of its own (`pressed`), the accent a fifth
 * toward the ground.
 * The open dials stand on an opaque panel (`panel`), so no page word shows
 * through it; its edge (`edge`) is the sky moved toward the night by day and
 * the night toward the sky by night, until it reads at 3.5:1 on the ground:
 * WCAG 1.4.11's 3:1 for a control's boundary, with the margin the shadow
 * under the panel takes from the ground around it. Every text role keeps
 * WCAG AA on every role it is drawn on (`theme.test.ts`).
 */

import { PALETTE } from '@manna/brand';

/** The roles drawn opaque: every role a screen can show under the find bar's glass. */
interface OpaqueRoles {
  /** The screen's background. */
  readonly ground: string;
  /** Body text, the hymn's words and titles. */
  readonly ink: string;
  /** Secondary text: section labels, placeholders, the refrain's mark, the dials' stops. */
  readonly muted: string;
  /** Separators and outlines; never under text. */
  readonly line: string;
  /** The tab tint, the hymn number, links, the play button. */
  readonly accent: string;
  /** A chord's symbol over the words, and the dials' current stop and notch. */
  readonly chord: string;
  /** A pressed row, a selection, the search field: under ink, accent and muted text. */
  readonly soft: string;
  /** Text drawn on an accent fill: the play button's label on the web and Android. */
  readonly onAccent: string;
  /** The accent fill while it is pressed: the accent mixed a fifth toward the ground. */
  readonly pressed: string;
  /** Text drawn on the pressed fill, picked for it as `onAccent` is for the accent. */
  readonly onPressed: string;
  /** A surface over the page, the open dials' panel. */
  readonly panel: string;
  /** The panel's edge: a control's boundary, at least 3.5:1 on the ground. */
  readonly edge: string;
  /** The docked player bar's ground. */
  readonly bar: string;
  /** A pill-shaped button's fill: the key button with chords on, the dials' Reset. */
  readonly pill: string;
  /** Text and marks drawn on the pill. */
  readonly onPill: string;
  /** The chosen mark on the pill: a checked chip's fill. */
  readonly chosen: string;
  /** Text and marks drawn on the chosen mark. */
  readonly onChosen: string;
}

/** The find bar's glass, laid over whatever the page shows under the bar. */
interface GlassRoles {
  /** The find bar's capsule and the lone `#` disk: `soft` at 85 % (`#rrggbbd9`). */
  readonly glass: string;
  /** Typed words and unchosen marks on the glass. */
  readonly onGlass: string;
  /** Quiet text on the glass: the find bar's placeholder. */
  readonly onGlassMuted: string;
  /** The disk behind the find bar's chosen control, on the glass. */
  readonly glassChosen: string;
  /** Text and marks drawn on the chosen disk. */
  readonly onGlassChosen: string;
}

export interface Roles extends OpaqueRoles, GlassRoles {}

type Rgb = readonly [number, number, number];

const channel = (hex: string, at: number) => Number.parseInt(hex.slice(at, at + 2), 16);

/** A hex colour's red, green and blue, 0 to 255. */
const rgb = (hex: string): Rgb => [channel(hex, 1), channel(hex, 3), channel(hex, 5)];

const hex = (channels: Rgb) =>
  `#${channels
    .map((v) =>
      Math.round(Math.max(0, Math.min(255, v)))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;

/** `a` mixed `t` of the way toward `b`, per sRGB channel, as the palette page mixes. */
const mix = (a: string, b: string, t: number): string => {
  const [r, g, bl] = rgb(a);
  const [r2, g2, b2] = rgb(b);
  return hex([r + (r2 - r) * t, g + (g2 - g) * t, bl + (b2 - bl) * t]);
};

/** An sRGB channel (0 to 255) as linear light, with the palette page's knee at 0.03928. */
const linear = (channel: number) => {
  const c = channel / 255;
  if (c <= 0.03928) return c / 12.92;
  return ((c + 0.055) / 1.055) ** 2.4;
};

/** A colour's relative luminance, 0 to 1. */
const luminance = (color: string) => {
  const [r, g, b] = rgb(color);
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
};

/** WCAG 2's contrast ratio between two colours, 1 to 21. */
const contrast = (a: string, b: string) => {
  const [la, lb] = [luminance(a), luminance(b)];
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};

/**
 * Text on a fill of `fill`: the night where it meets WCAG AA (4.5:1), else
 * white where it does, else black. White and black between them meet AA on
 * every fill.
 */
export const onColor = (fill: string) =>
  [PALETTE.night, '#ffffff'].find((text) => contrast(text, fill) >= 4.5) ?? '#000000';

/**
 * The chosen mark on a pill of `pill`: the `accent` where it reads as a state
 * there (WCAG 1.4.11's 3:1), else the pill's own ink, `onPill`.
 */
const chosenOn = (accent: string, pill: string, onPill: string) => {
  if (contrast(accent, pill) >= 3) return accent;
  return onPill;
};

/** The roles a lit pill-shaped button draws with: the key button with chords on, a checked chip. */
const onPillRoles = (accent: string, pill: string) => {
  const onPill = onColor(pill);
  const chosen = chosenOn(accent, pill, onPill);
  return { pill, onPill, chosen, onChosen: onColor(chosen) };
};

/** The glass's alpha: 0xd9 of 0xff, 85 %. */
const GLASS_ALPHA = 'd9';

/** A `#rrggbbaa` colour laid over an opaque `under`, as the screen draws it. */
const over = (glass: string, under: string) =>
  mix(under, glass.slice(0, 7), channel(glass, 7) / 255);

/**
 * The find bar's glass over a scheme's opaque roles: `soft` at 85 %, its words
 * the ink, its chosen disk the accent. The placeholder is the ink moved toward
 * `soft`, in steps of a hundredth, as far as it still meets WCAG AA (4.5:1)
 * over every opaque role with the glass laid on it, since any of them may
 * scroll under the bar.
 */
const glassRoles = (opaque: OpaqueRoles) => {
  const glass = `${opaque.soft}${GLASS_ALPHA}`;
  const seen = Object.values(opaque).map((under) => over(glass, under));
  const holds = (tone: string) => seen.every((fill) => contrast(tone, fill) >= 4.5);
  const steps = Array.from({ length: 101 }, (_, step) => mix(opaque.ink, opaque.soft, step / 100));
  return {
    glass,
    onGlass: opaque.ink,
    onGlassMuted: steps.findLast(holds) ?? opaque.ink,
    glassChosen: opaque.accent,
    onGlassChosen: onColor(opaque.accent),
  };
};

/** A scheme's roles: its opaque roles and the glass laid over them. */
const withGlass = <const T extends OpaqueRoles>(opaque: T) => ({
  ...opaque,
  ...glassRoles(opaque),
});

const white = '#ffffff';

/** The sky tinted `t` of the way toward white. */
const skyTint = (t: number) => mix(PALETTE.sky, white, t);

const lightGround = skyTint(0.88);
const lightPressed = mix(PALETTE.night, lightGround, 0.2);
const darkPressed = mix(PALETTE.duskGold, PALETTE.night, 0.2);

export const theme = {
  light: withGlass({
    ground: lightGround,
    ink: PALETTE.night,
    // The night 27% toward white: the brand's quiet text a shade bluer, for the sky.
    muted: mix(PALETTE.night, white, 0.268),
    line: skyTint(0.529),
    accent: PALETTE.night,
    chord: PALETTE.duskDeep,
    soft: skyTint(0.57),
    onAccent: onColor(PALETTE.night),
    pressed: lightPressed,
    onPressed: onColor(lightPressed),
    panel: skyTint(0.709),
    edge: mix(PALETTE.sky, PALETTE.night, 0.45),
    bar: lightGround,
    ...onPillRoles(PALETTE.night, PALETTE.sky),
  }),
  dark: withGlass({
    ground: PALETTE.night,
    ink: skyTint(0.75),
    muted: PALETTE.sky,
    line: mix(PALETTE.night, PALETTE.sky, 0.153),
    accent: PALETTE.duskGold,
    chord: PALETTE.duskGold,
    soft: PALETTE.nightPanel,
    onAccent: onColor(PALETTE.duskGold),
    pressed: darkPressed,
    onPressed: onColor(darkPressed),
    panel: PALETTE.nightPanel,
    edge: mix(PALETTE.night, PALETTE.sky, 0.6),
    // The night 15% toward black: the docked bar sits a shade under the page.
    bar: mix(PALETTE.night, '#000000', 0.147),
    ...onPillRoles(PALETTE.duskGold, PALETTE.sky),
  }),
} as const satisfies { readonly light: Roles; readonly dark: Roles };
