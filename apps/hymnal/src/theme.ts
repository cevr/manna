import { PALETTE } from '@manna/brand';

interface OpaqueRoles {
  readonly ground: string;
  readonly ink: string;
  readonly muted: string;
  readonly line: string;
  readonly accent: string;
  readonly chord: string;
  readonly soft: string;
  readonly onAccent: string;
  readonly pressed: string;
  readonly onPressed: string;
  readonly panel: string;
  readonly edge: string;
  readonly bar: string;
  readonly pill: string;
  readonly onPill: string;
  readonly chosen: string;
  readonly onChosen: string;
}

interface GlassRoles {
  readonly glass: string;
  readonly onGlass: string;
  readonly onGlassMuted: string;
  readonly glassChosen: string;
  readonly onGlassChosen: string;
}

export interface Roles extends OpaqueRoles, GlassRoles {}

type Rgb = readonly [number, number, number];

const channel = (hex: string, at: number) => Number.parseInt(hex.slice(at, at + 2), 16);

const rgb = (hex: string): Rgb => [channel(hex, 1), channel(hex, 3), channel(hex, 5)];

const hex = (channels: Rgb) =>
  `#${channels
    .map((v) =>
      Math.round(Math.max(0, Math.min(255, v)))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;

const mix = (a: string, b: string, t: number): string => {
  const [r, g, bl] = rgb(a);
  const [r2, g2, b2] = rgb(b);
  return hex([r + (r2 - r) * t, g + (g2 - g) * t, bl + (b2 - bl) * t]);
};

const linear = (channel: number) => {
  const c = channel / 255;
  if (c <= 0.03928) return c / 12.92;
  return ((c + 0.055) / 1.055) ** 2.4;
};

const luminance = (color: string) => {
  const [r, g, b] = rgb(color);
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
};

const contrast = (a: string, b: string) => {
  const [la, lb] = [luminance(a), luminance(b)];
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};

export const onColor = (fill: string) =>
  [PALETTE.night, '#ffffff'].find((text) => contrast(text, fill) >= 4.5) ?? '#000000';

const chosenOn = (accent: string, pill: string, onPill: string) => {
  if (contrast(accent, pill) >= 3) return accent;
  return onPill;
};

const onPillRoles = (accent: string, pill: string) => {
  const onPill = onColor(pill);
  const chosen = chosenOn(accent, pill, onPill);
  return { pill, onPill, chosen, onChosen: onColor(chosen) };
};

const GLASS_ALPHA = 'd9';

const over = (glass: string, under: string) =>
  mix(under, glass.slice(0, 7), channel(glass, 7) / 255);

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

const withGlass = <const T extends OpaqueRoles>(opaque: T) => ({
  ...opaque,
  ...glassRoles(opaque),
});

const white = '#ffffff';

const skyTint = (t: number) => mix(PALETTE.sky, white, t);

const lightGround = skyTint(0.88);
const lightPressed = mix(PALETTE.night, lightGround, 0.2);
const darkPressed = mix(PALETTE.duskGold, PALETTE.night, 0.2);

export const theme = {
  light: withGlass({
    ground: lightGround,
    ink: PALETTE.night,
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
    bar: mix(PALETTE.night, '#000000', 0.147),
    ...onPillRoles(PALETTE.duskGold, PALETTE.sky),
  }),
} as const satisfies { readonly light: Roles; readonly dark: Roles };
