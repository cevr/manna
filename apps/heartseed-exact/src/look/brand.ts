/* oxlint-disable effect/noNullish -- Exact's app folder cannot import effect (docs/exact.md): a regex group, a map entry and a list's first item are absent as undefined. */

/**
 * A token's colour in each scheme, as the brand file (`app.tamber`) is read
 * as data: each token of its `theme` block with its light and dark colour (a
 * token that names another token or role takes that one's), and the colour
 * literals any text holds. The look's tests read the brand through these,
 * against the current Heartseed's palette (`@manna/heartseed/theme`).
 */
export interface Paint {
  readonly light: string;
  readonly dark: string;
}

/** A colour as the brand and the palette both write it: lower case, no spaces. */
export const colourKey = (colour: string): string => colour.toLowerCase().replace(/\s+/gu, '');

const LITERAL = /#[\da-f]{3,8}\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\([^)]*\)/giu;

/** Every colour literal a text holds (a hex, or a colour function such as `rgb(…)`), in order. */
export const colourLiterals = (text: string): string[] => text.match(LITERAL) ?? [];

/** The parts of `light-dark(a, b)` split at its one top-level comma, or the value twice. */
const sides = (value: string): Paint => {
  const inner = /^light-dark\((.*)\)$/u.exec(value.trim())?.[1];
  if (inner === undefined) return { light: value.trim(), dark: value.trim() };
  let depth = 0;
  for (const [at, char] of [...inner].entries()) {
    if (char === '(') depth++;
    if (char === ')') depth--;
    if (char === ',' && depth === 0)
      return { light: inner.slice(0, at).trim(), dark: inner.slice(at + 1).trim() };
  }
  return { light: inner.trim(), dark: inner.trim() };
};

/** Each `name = value` line of a Tamber file's `theme` block, its trailing marks (`pair=…`, `scheme=…`) left off. */
export const themeLines = (tamber: string): ReadonlyMap<string, string> => {
  const lines = new Map<string, string>();
  let inTheme = false;
  for (const line of tamber.split('\n')) {
    if (/^\S/u.test(line)) inTheme = line.trim() === 'theme';
    const entry = /^\s+(\S+)\s*=\s*(.+?)(?:\s{2,}\S+=\S+)*\s*$/u.exec(line);
    if (inTheme && entry?.[1] !== undefined && entry[2] !== undefined)
      lines.set(entry[1], entry[2]);
  }
  return lines;
};

/** Each token's paint, a name it holds resolved through the file's other tokens; a family or other non-colour token is left out. */
export const paintsOf = (tamber: string): ReadonlyMap<string, Paint> => {
  const lines = themeLines(tamber);
  const paints = new Map<string, Paint>();
  const resolve = (value: string, seen: number): Paint | undefined => {
    const named = lines.get(value);
    if (named !== undefined && seen < lines.size) return resolve(named, seen + 1);
    const paint = sides(value);
    if (colourLiterals(paint.light).length === 0) return undefined;
    return paint;
  };
  for (const [name, value] of lines) {
    const paint = resolve(value, 0);
    if (paint !== undefined) paints.set(name, paint);
  }
  return paints;
};

/** An sRGB channel, 0-255, as linear light, by WCAG 2. */
const linear = (channel: number) => {
  const share = channel / 255;
  if (share > 0.04045) return ((share + 0.055) / 1.055) ** 2.4;
  return share / 12.92;
};

/** A `#rrggbb` colour's relative luminance, by WCAG 2. */
const luminanceOf = (hex: string) => {
  const [red = 0, green = 0, blue = 0] = [1, 3, 5].map((at) =>
    linear(Number.parseInt(hex.slice(at, at + 2), 16)),
  );
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
};

/** WCAG 2's contrast of two `#rrggbb` colours, 1 to 21, unrounded. */
export const contrast = (one: string, other: string): number => {
  const [lighter, darker] = [luminanceOf(one), luminanceOf(other)].toSorted((a, b) => b - a);
  return ((lighter ?? 0) + 0.05) / ((darker ?? 0) + 0.05);
};
