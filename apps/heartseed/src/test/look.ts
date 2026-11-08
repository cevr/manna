/* oxlint-disable effect/noNullish, effect/noTernary -- the oracle reads happy-dom's computed styles and walks parents, whose absent ends are null, from plain branches. */

/**
 * The frame oracle: what a frame of `host` paints, held to the scheme it
 * must show (`theme[scheme]`, `src/theme.ts`). The screen's ground behind
 * its heading (or behind the reference when no heading shows) is the
 * scheme's `ground`; every opaque fill is one of its roles; every
 * translucent fill is `pulse`; every seen text (a node holding text of its
 * own, in ink not transparent) is drawn in `ink`, `quiet`, `miss` or
 * `onInk`, in SF Rounded (`ui-rounded`), at WCAG AA on what lies behind it.
 * The tests' system appearance is happy-dom's `prefersColorScheme`
 * (`setSystem`), which react-native-web's `Appearance` reads.
 */

import { Appearance } from 'react-native';

import { schemeOf } from '../look';
import { theme, type Roles, type Scheme } from '../theme';
import { AA, contrastOf } from './contrast';

/** The roles a text may be drawn in. */
export const TEXT_ROLES: readonly (keyof Roles)[] = ['ink', 'quiet', 'miss', 'onInk'];

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

/** The faults the frame `host` shows now against `scheme` (the system's by default), each once, at most `limit`. */
export const lookFaults = (host: Element, scheme: Scheme = systemScheme(), limit = 6) => {
  const faults = [
    ...groundFaults(host, scheme),
    ...[...host.querySelectorAll('*')].flatMap((node) => nodeFaults(node, scheme)),
  ];
  return [...new Set(faults)].slice(0, limit);
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
  if (contrastOf(node) < AA) faults.push(`${scheme} faint ${ink.hex} at ${at}`);
  return faults;
};
