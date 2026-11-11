/* oxlint-disable effect/noNullish, effect/noTernary, effect/noAsyncFunction, eslint/no-await-in-loop -- the oracle reads happy-dom's computed styles and walks parents, whose absent ends are null, from plain branches; it holds each control pressed in turn through React's promise-based `act`. */

/**
 * The frame oracle: what a frame of `host` paints, held to the scheme it
 * must show (`theme[scheme]`, `src/theme.ts`). The screen's ground behind
 * its heading (or behind the reference when no heading shows) is the
 * scheme's `ground`; every opaque fill is one of its roles; every
 * translucent fill is `pulse`; every seen text (a node holding text of its
 * own, in ink not transparent) is drawn in `ink`, `quiet`, `miss`,
 * `onInk` or `sun`, in SF Rounded (`ui-rounded`), at WCAG AA on what lies behind it.
 * The tests' system appearance is happy-dom's `prefersColorScheme`
 * (`setSystem`), which react-native-web's `Appearance` reads.
 */

import { act } from 'react';
import { Appearance } from 'react-native';

import { schemeOf } from '../look';
import { theme, type Roles, type Scheme } from '../theme';
import { AA, contrastOf } from './contrast';

/** The roles a text may be drawn in. */
export const TEXT_ROLES: readonly (keyof Roles)[] = ['ink', 'quiet', 'miss', 'onInk', 'sun'];

/** A computed or written colour as a lower-case hex and its alpha. */
export const paintOf = (css: string) => {
  const parts = /^rgba?\(([^)]*)\)$/u
    .exec(css)?.[1]
    ?.split(',')
    .map((part) => Number(part.trim()));
  if (parts === undefined || parts.length < 3)
    return { hex: css.toLowerCase(), alpha: css === 'transparent' || css === '' ? 0 : 1 };
  const [r = 0, g = 0, b = 0, a = 1] = parts;
  return {
    hex: `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`,
    alpha: a,
  };
};

/** A role's colour as happy-dom computes it, `rgba(r, g, b, a)` with the alpha to two places, for a test that compares a computed style. */
export const computed = (css: string) => {
  const { hex, alpha } = paintOf(css);
  const [r, g, b] = [1, 3, 5].map((at) => Number.parseInt(hex.slice(at, at + 2), 16));
  return `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(2)})`;
};

const ownText = (node: Element) =>
  [...node.childNodes].some(
    (child) => child.nodeType === 3 && (child.textContent ?? '').trim() !== '',
  );

/** Where a text lies, named without its words (a verse's words stay out of a test's output): its own or nearest test id or role. */
const whereOf = (node: Element) => {
  const named = node.closest('[data-testid],[role]');
  if (named === null) return node.tagName.toLowerCase();
  return named.getAttribute('data-testid') ?? named.getAttribute('role') ?? '?';
};

/** Each scheme's paints: its opaque roles, its translucent roles, and its text roles, by hex. */
const paints = (roles: Roles) => {
  const values = Object.values(roles);
  const opaque = new Set(values.map((value) => paintOf(value).hex));
  const translucent = new Set(
    values.filter((value) => paintOf(value).alpha < 1).map((value) => value.replace(/\s/gu, '')),
  );
  const texts = new Set(TEXT_ROLES.map((role) => paintOf(roles[role]).hex));
  return { opaque, translucent, texts };
};
const PAINTS = { light: paints(theme.light), dark: paints(theme.dark) } as const;

/** The scheme the system names now, as the app reads it. */
export const systemScheme = (): Scheme => schemeOf(Appearance.getColorScheme());

/**
 * The system's appearance as a test sets it: happy-dom's
 * `prefersColorScheme`, announced to `matchMedia`'s listeners by a resize.
 * A happy-dom listener takes its first state as not matching, whatever the
 * device says; the resize before the change brings each to the device's
 * state, so the change is announced to all.
 */
export const setSystem = (scheme: Scheme) => {
  window.dispatchEvent(new Event('resize'));
  Object.assign(Reflect.get(window, 'happyDOM').settings.device, { prefersColorScheme: scheme });
  window.dispatchEvent(new Event('resize'));
};

/** A node's styles as drawn: its classes, inline style and own text's presence, and each ancestor's classes and style, which decide its paint and what lies behind it. */
const chainOf = (node: Element) => {
  const parts = [String(ownText(node)), node.getAttribute('aria-disabled') ?? ''];
  for (let at: Element | null = node; at !== null; at = at.parentElement)
    parts.push(`${at.getAttribute('class') ?? ''}/${at.getAttribute('style') ?? ''}`);
  return parts.join('>');
};

/** `chainOf`'s classes and styles from a node up, each ancestor's read once per frame: the answer reads `at`'s own, then its parent's chain. */
const chainsUp = () => {
  const known = new Map<Element, string>();
  const chainUp = (at: Element): string => {
    const kept = known.get(at);
    if (kept !== undefined) return kept;
    const own = `${at.getAttribute('class') ?? ''}/${at.getAttribute('style') ?? ''}`;
    const parent = at.parentElement;
    const chain = parent === null ? own : `${own}>${chainUp(parent)}`;
    known.set(at, chain);
    return chain;
  };
  return chainUp;
};

/**
 * The faults the frame `host` shows now against `scheme` (the system's by
 * default), each once, at most six; `known` keeps each style chain's
 * faults across the frames of one mount, so a frame computes only the
 * styles it has not seen.
 */
export const lookFaults = (
  host: Element,
  scheme: Scheme = systemScheme(),
  known = new Map<string, readonly string[]>(),
) => {
  const faults = [...groundFaults(host, scheme)];
  const chainUp = chainsUp();
  for (const node of host.querySelectorAll('*')) {
    const chain = `${scheme}|${String(ownText(node))}>${node.getAttribute('aria-disabled') ?? ''}>${chainUp(node)}`;
    const found = known.get(chain) ?? nodeFaults(node, scheme);
    known.set(chain, found);
    faults.push(...found);
  }
  return [...new Set(faults)].slice(0, 6);
};

/**
 * `lookFaults`'s kept faults for the rigs that watch the app's own frames,
 * shared by every mount of the process: a key is a node's style chain
 * (its own and each ancestor's classes and inline style, with its own
 * text's presence) under a scheme, and react-native-web names a class by
 * its declarations, so a key answers the same on every mount as on every
 * frame of one.
 */
export const KEPT_LOOKS = new Map<string, readonly string[]>();

/**
 * Holds every frame of `host` (each DOM mutation batch) from now on to the
 * oracle, against the scheme `scheme` names at that frame (a test's model
 * of the system), and keeps the first eight faults with the heading shown.
 */
export const watchLook = (host: Element, scheme: () => Scheme) => {
  const faults: string[] = [];
  const looks = KEPT_LOOKS;
  const frames = { seen: 0 };
  const check = () => {
    frames.seen += 1;
    const on = host.querySelector('[role="heading"]')?.textContent ?? 'no heading';
    for (const fault of lookFaults(host, scheme(), looks))
      if (faults.length < 8) faults.push(`${fault} on ${on}`);
  };
  const watch = new MutationObserver(check);
  watch.observe(host, { subtree: true, childList: true, attributes: true, characterData: true });
  check();
  return { faults, frames, check, stop: () => watch.disconnect() };
};

const CONTROLS = '[role="button"],[role="radio"],[role="checkbox"]';

/**
 * Each control of `host` held pressed in turn, one per distinct style
 * chain, and the faults the oracle finds in it while pressed: a pressed
 * control draws its text under its pressed opacity, which `seenContrast`
 * composes. The press is react-native-web's keyboard press, which shows at
 * once: a space down on the control, then an Enter up on the page, which
 * react-native-web takes as the press's end (a space ends it only on a
 * button) and, its target not the control, as no tap. A disabled control is left out, as WCAG
 * leaves it; `pressed` counts the controls seen under an opacity.
 */
export const pressedFaults = async (
  host: Element,
  scheme: Scheme = systemScheme(),
  seen = { pressed: 0 },
) => {
  const chains = new Set<string>();
  const faults: string[] = [];
  const key = (node: Element, type: string, name: string) =>
    node.dispatchEvent(new KeyboardEvent(type, { bubbles: true, cancelable: true, key: name }));
  for (const node of host.querySelectorAll(CONTROLS)) {
    const chain = chainOf(node);
    if (node.getAttribute('aria-disabled') === 'true' || chains.has(chain)) continue;
    chains.add(chain);
    await act(async () => key(node, 'keydown', ' '));
    if (opacityOf(node) < 1) seen.pressed += 1;
    faults.push(...lookFaults(node, scheme).map((fault) => `${fault} pressed`));
    await act(async () => key(document.body, 'keyup', 'Enter'));
  }
  return [...new Set(faults)].slice(0, 6);
};

/** The screen's ground behind its heading, or behind the reference when no heading shows, when it is not the scheme's `ground`. */
const groundFaults = (host: Element, scheme: Scheme) => {
  const anchor =
    host.querySelector('[role="heading"]') ?? host.querySelector('[data-testid="reference"]');
  if (anchor === null) return [];
  let ground: Element | null = anchor;
  while (ground !== null && paintOf(getComputedStyle(ground).backgroundColor).alpha < 1)
    ground = ground.parentElement;
  const painted = ground === null ? 'none' : paintOf(getComputedStyle(ground).backgroundColor).hex;
  return painted === theme[scheme].ground ? [] : [`${scheme} ground ${painted}`];
};

/** One node's faults: a fill that is no role of the scheme, and its own text off the text roles, the face or AA. */
const nodeFaults = (node: Element, scheme: Scheme) => {
  const { opaque, translucent, texts } = PAINTS[scheme];
  const faults: string[] = [];
  const style = getComputedStyle(node);
  const fill = paintOf(style.backgroundColor);
  if (fill.alpha === 1 && !opaque.has(fill.hex)) faults.push(`${scheme} fill ${fill.hex}`);
  const seeThrough = fill.alpha > 0 && fill.alpha < 1;
  if (seeThrough && !translucent.has(style.backgroundColor.replace(/\s/gu, '')))
    faults.push(`${scheme} translucent ${style.backgroundColor}`);
  if (!ownText(node)) return faults;
  const ink = paintOf(style.color);
  if (ink.alpha === 0) return faults;
  const at = whereOf(node);
  if (!texts.has(ink.hex)) faults.push(`${scheme} text ${ink.hex} at ${at}`);
  if (!/ui-rounded/u.test(style.fontFamily))
    faults.push(`${scheme} face ${style.fontFamily.slice(0, 24)} at ${at}`);
  if (node.closest('[aria-disabled="true"]') === null && seenContrast(node) < AA)
    faults.push(`${scheme} faint ${ink.hex} at ${at}`);
  return faults;
};

type Rgb = readonly [number, number, number];

const rgbOf = (css: string): Rgb => {
  const { hex } = paintOf(css);
  const channel = (at: number) => Number.parseInt(hex.slice(at, at + 2), 16) || 0;
  return [channel(1), channel(3), channel(5)];
};

/** `top` drawn at `alpha` over `under`. */
const blend = (top: Rgb, under: Rgb, alpha: number): Rgb => {
  const mix = (at: 0 | 1 | 2) => alpha * top[at] + (1 - alpha) * under[at];
  return [mix(0), mix(1), mix(2)];
};

const opacityOf = (node: Element) => {
  const value = getComputedStyle(node).opacity;
  return value === '' ? 1 : Number(value);
};

const filled = (node: Element) => paintOf(getComputedStyle(node).backgroundColor).alpha === 1;

/** The nearest opaque fill strictly above `node`, white when none is. */
const backdropOf = (node: Element): Rgb => {
  for (let at = node.parentElement; at !== null; at = at.parentElement)
    if (filled(at)) return rgbOf(getComputedStyle(at).backgroundColor);
  return [255, 255, 255];
};

/**
 * A text's contrast as it is seen, its opacities composed: the text's ink
 * over the nearest opaque fill behind it, each element's opacity between
 * them laid over that fill, and each opacity at or above the fill laid over
 * the backdrop behind it, both the ink and the fill. `contrastOf` reads the
 * ink and the fill alone; the pressed and disabled states draw text under an
 * opacity, which this reads as the reader sees it.
 */
export const seenContrast = (node: Element) => {
  let ink = rgbOf(getComputedStyle(node).color);
  let alpha = 1;
  let at: Element | null = node;
  while (at !== null && !filled(at)) {
    alpha *= opacityOf(at);
    at = at.parentElement;
  }
  if (at === null) return contrastOf(node);
  let ground = rgbOf(getComputedStyle(at).backgroundColor);
  ink = blend(ink, ground, alpha);
  for (let above: Element | null = at; above !== null; above = above.parentElement) {
    const opacity = opacityOf(above);
    if (opacity >= 1) continue;
    const back = backdropOf(above);
    ink = blend(ink, back, opacity);
    ground = blend(ground, back, opacity);
  }
  return ratio(ink, ground);
};

/** WCAG 2's relative luminance of sRGB channels 0-255. */
const luminance = (rgb: Rgb) => {
  const [r = 0, g = 0, b = 0] = rgb.map((channel) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/** WCAG 2's contrast ratio of two colours. */
const ratio = (a: Rgb, b: Rgb) => {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};
