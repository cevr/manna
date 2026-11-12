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
  /** The tab tint, the hymn number, links. */
  readonly accent: string;
  /** A button's tint or fill: the play and Sound marks, the key button's pill, the find bar's chosen disk. */
  readonly button: string;
  /** Text and marks drawn on the button's fill. */
  readonly onButton: string;
  /** A chosen tab's fill, and other selected backgrounds: under ink words only. */
  readonly selected: string;
  /** A chord's symbol over the words, and the dials' current stop and notch. */
  readonly chord: string;
  /** A pressed row, a selection, the search field: under ink, accent, muted and alert text. */
  readonly soft: string;
  /** Text drawn on an accent fill: the play button's label on the web and Android. */
  readonly onAccent: string;
  /** A button's fill while it is pressed: the button a fifth toward the ground. */
  readonly pressed: string;
  /** Text drawn on the pressed fill, picked for it as `onAccent` is for the accent. */
  readonly onPressed: string;
  /** A surface over the page: the open dials' panel, the KEY wheel's resting items. */
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
  /** A destructive action's words: Delete downloads and its confirm. */
  readonly alert: string;
  /** A raised surface's shadow: the dials' panel, the KEY wheel's pills and backdrop; not text. */
  readonly shadow: string;
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

/** Heartseed's roles the hymnal draws from, in one scheme. */
interface Garden {
  /** Heartseed's `ground`: the page. */
  readonly ground: string;
  /** Heartseed's `card`: field rows, results, pills. */
  readonly card: string;
  /** Heartseed's `ink`: text, the big button. */
  readonly ink: string;
  /** Heartseed's `quiet`: references, unread words. */
  readonly quiet: string;
  /** Heartseed's `soft`: lines, progress segments. */
  readonly soft: string;
  /** Heartseed's `sun`: the gold ink. */
  readonly sun: string;
  /** Heartseed's `miss`: a missed word, alerts. */
  readonly miss: string;
  /** Heartseed's `shadow`: the big button's shadow. */
  readonly shadow: string;
}

/**
 * Heartseed's palette, each hex the Heartseed role it copies
 * (`apps/heartseed/src/theme.ts`; `theme.test.ts` holds them equal).
 */
export const garden = {
  light: {
    ground: '#f1f0e6',
    card: '#f9f8f1',
    ink: '#2c4542',
    quiet: '#5a6761',
    soft: '#b9cfae',
    sun: '#80641f',
    miss: '#a04a34',
    shadow: '#2c4542',
  },
  dark: {
    ground: '#142420',
    card: '#1d322c',
    ink: '#e6eedb',
    quiet: '#a0b4a7',
    soft: '#3d5c4f',
    sun: '#d4a640',
    miss: '#f09982',
    shadow: '#000000',
  },
} as const satisfies { readonly light: Garden; readonly dark: Garden };

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

/** `a` mixed `t` of the way toward `b`, per sRGB channel, as Heartseed's theme mixes. */
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

/** `from` moved toward `to` in steps of a hundredth: the first step that reads at `least`:1 on `on`, else `to`. */
const firstAt = (from: string, to: string, on: string, least: number) =>
  Array.from({ length: 101 }, (_, step) => mix(from, to, step / 100)).find(
    (tone) => contrast(tone, on) >= least,
  ) ?? to;

/**
 * Text on a fill of `fill` in a scheme: the scheme's ground where it meets
 * WCAG AA (4.5:1), else its ink where it does, else white, else black.
 * White and black between them meet AA on every fill.
 */
export const onColor = (fill: string, scheme: { readonly ground: string; readonly ink: string }) =>
  [scheme.ground, scheme.ink, '#ffffff'].find((text) => contrast(text, fill) >= 4.5) ?? '#000000';

/**
 * The chosen mark on a pill of `pill`: the `accent` where it reads as a state
 * there (WCAG 1.4.11's 3:1), else the pill's own ink, `onPill`.
 */
const chosenOn = (accent: string, pill: string, onPill: string) => {
  if (contrast(accent, pill) >= 3) return accent;
  return onPill;
};

/** The glass's alpha: 0xd9 of 0xff, 85 %. */
const GLASS_ALPHA = 'd9';

/** A `#rrggbbaa` colour laid over an opaque `under`, as the screen draws it. */
const over = (glass: string, under: string) =>
  mix(under, glass.slice(0, 7), channel(glass, 7) / 255);

/**
 * The find bar's glass over a scheme's opaque roles: `soft` at 85 %, its words
 * the ink, its chosen disk the button. The placeholder is the ink moved toward
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
    glassChosen: opaque.button,
    onGlassChosen: onColor(opaque.button, opaque),
  };
};

/** How a scheme draws its roles from the garden's. */
interface Drawn {
  /** How far `soft` is the ground moved toward Heartseed's soft. */
  readonly softness: number;
  /** A chosen tab's fill: the hymnal's own `soft`, or Heartseed's. */
  readonly selected: 'mixed' | 'garden';
  /** The key button's lit fill: Heartseed's soft, or the button (Heartseed's ink). */
  readonly pill: 'soft' | 'ink';
}

/** A scheme's roles from Heartseed's, drawn as `drawn` says. */
const scheme = (from: Garden, { softness, selected, pill }: Drawn) => {
  const soft = mix(from.ground, from.soft, softness);
  const button = from.ink;
  const pressed = mix(button, from.ground, 0.2);
  const pillFill = from[pill];
  const onPill = onColor(pillFill, from);
  const chosen = chosenOn(from.ink, pillFill, onPill);
  const opaque = {
    ground: from.ground,
    ink: from.ink,
    muted: from.quiet,
    line: mix(from.ground, from.soft, 0.6),
    accent: from.ink,
    button,
    onButton: onColor(button, from),
    selected: { mixed: soft, garden: from.soft }[selected],
    chord: from.sun,
    soft,
    onAccent: onColor(from.ink, from),
    pressed,
    onPressed: onColor(pressed, from),
    panel: from.card,
    edge: firstAt(from.soft, from.ink, from.ground, 3.5),
    bar: from.ground,
    pill: pillFill,
    onPill,
    chosen,
    onChosen: onColor(chosen, from),
    alert: from.miss,
    shadow: from.shadow,
  } satisfies OpaqueRoles;
  return { ...opaque, ...glassRoles(opaque) };
};

/**
 * The app's colours: twenty-seven roles in light and dark, drawn from
 * Heartseed's palette (`apps/heartseed/src/theme.ts`), so the hymnal reads
 * as Heartseed's family as its icon and launch screen do. Heartseed's roles
 * it draws from are written once, in `garden`; every role here is one of
 * them or a rule over them, so a change of palette edits `garden` alone
 * (`theme.test.ts` holds `garden` to Heartseed's own). A screen reads a role
 * (`color.ts` on the web, `color.native.ts` on a phone), never a hex value.
 *
 * The page and the docked bar are Heartseed's ground, a surface over the
 * page (the open dials' panel, the KEY wheel's resting items) its card, and
 * the text its ink and quiet. The ink is also the accent (the hymn numbers,
 * the tint, links, the sung syllable) and the button (the play and Sound
 * marks, the find bar's chosen disk), as Heartseed's big button is. Chords
 * are Heartseed's gold ink (`sun`; by night the gold itself): the only warm
 * hue on a hymn's page, so they part from the words, the sung syllable and
 * the buttons (`theme.test.ts` holds their OKLab distances). Delete
 * downloads draws in Heartseed's alert (`miss`), and the dials' panel and
 * the KEY wheel cast Heartseed's shadow.
 *
 * Mixed tones are Heartseed's ground moved toward its soft, per sRGB
 * channel: a pressed row, the search field and the glass (`soft`) 35 % by
 * day and 45 % by night, the rules (`line`) 60 %. A chosen tab (`selected`)
 * is that `soft` by day and Heartseed's soft by night, under ink only. The
 * panel's edge (`edge`) is Heartseed's soft moved toward the ink in steps of
 * a hundredth until it reads at 3.5:1 on the ground: WCAG 1.4.11's 3:1 for a
 * control's boundary, with the margin the shadow under the panel takes from
 * the ground around it. A pressed button is the button a fifth toward the
 * ground. The key button's lit pill is Heartseed's soft by day and the
 * button by night.
 *
 * Text on a fill (`onAccent`, `onButton`, `onPressed`, `onPill`,
 * `onChosen`, `onGlassChosen`) is the scheme's ground where it meets AA on
 * the fill (Heartseed's `onInk`), else its ink, else white, else black
 * (`onColor`). A checked chip stands on the accent where the accent reads
 * at 3:1 on the pill, else on the pill's ink (`chosen`). The find bar's
 * capsule is glass: `soft` at 85 % (`glass`), laid over whatever scrolls
 * under the bar, with the ink for its words (`onGlass`) and its chosen
 * control on a disk of the button (`glassChosen`). Its placeholder is the
 * ink moved toward `soft` as far as AA holds over every opaque role with the
 * glass laid on it (`onGlassMuted`). Every text role keeps WCAG AA on every
 * role it is drawn on (`theme.test.ts`).
 */
export const theme = {
  light: scheme(garden.light, { softness: 0.35, selected: 'mixed', pill: 'soft' }),
  dark: scheme(garden.dark, { softness: 0.45, selected: 'garden', pill: 'ink' }),
} as const satisfies { readonly light: Roles; readonly dark: Roles };
