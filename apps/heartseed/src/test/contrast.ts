/* oxlint-disable effect/noNullish, effect/noTernary -- the helper reads happy-dom's computed styles, whose absent parent is null, from plain branches. */

/** WCAG 2's AA minimum contrast for normal text: the screen tests' one bar for "reads at AA", against `contrastOf`. */
export const AA = 4.5;

/** A computed colour's channels and alpha. */
const channels = (css: string) => {
  const values = (css.match(/[\d.]+/g) ?? []).map(Number);
  const [r = 0, g = 0, b = 0, a = values.length >= 3 ? 1 : 0] = values;
  return { rgb: [r, g, b], a };
};

/** WCAG 2's relative luminance of sRGB channels 0-255. */
const luminance = (rgb: readonly number[]) => {
  const [r = 0, g = 0, b = 0] = rgb.map((channel) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/** The contrast of an element's computed text colour against the nearest opaque background painted behind it; 0 when none is. */
export const contrastOf = (node: Element) => {
  let ground: Element | null = node;
  while (ground !== null && channels(getComputedStyle(ground).backgroundColor).a < 1)
    ground = ground.parentElement;
  if (ground === null) return 0;
  const ink = luminance(channels(getComputedStyle(node).color).rgb);
  const back = luminance(channels(getComputedStyle(ground).backgroundColor).rgb);
  return (Math.max(ink, back) + 0.05) / (Math.min(ink, back) + 0.05);
};
