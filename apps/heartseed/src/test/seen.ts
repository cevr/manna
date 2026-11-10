/* oxlint-disable effect/noNullish, effect/noTryCatch, effect/noTernary, effect/noGlobals -- this synchronous happy-dom adapter walks nullable parents, encodes collision-free tuple keys with JSON, and refuses cross-node reuse when stylesheet access throws. */

type Style = Readonly<
  Pick<CSSStyleDeclaration, 'display' | 'visibility' | 'opacity' | 'color' | 'backgroundColor'>
>;

const PROPERTIES = [
  'display',
  'visibility',
  'opacity',
  'color',
  'background-color',
  'all',
] as const;
const SIMPLE = /^(?:[a-z][\w-]*|\*)?(?:\.[a-z_][\w-]*)*$/i;
const PSEUDO_ELEMENT = /^(.*)::[a-z-]+$/i;
const WORDS = /^[a-z -]+$/i;
const COLOR = /^(?:#[\da-f]{3,8}|rgba?\([\d.,% /+-]+\)|hsla?\([\d.,% /+degturn-]+\))$/i;

const simple = (selector: string) => selector !== '' && SIMPLE.test(selector);
const safeValue = (property: string, value: string) =>
  value === '' ||
  WORDS.test(value) ||
  (property === 'opacity' && /^[\d.+%-]+$/.test(value)) ||
  ((property === 'color' || property === 'background-color') && COLOR.test(value));
const safeStyle = (style: CSSStyleDeclaration) =>
  PROPERTIES.every((property) => safeValue(property, style.getPropertyValue(property)));
const affectsRead = (style: CSSStyleDeclaration) =>
  PROPERTIES.some((property) => style.getPropertyValue(property) !== '');

/** Simple type/class selectors depend only on the chain; terminal pseudo-elements cannot style an element's own computed read. */
const safeSelector = (selector: string) =>
  selector.split(',').every((part) => {
    const arm = part.trim();
    const pseudo = PSEUDO_ELEMENT.exec(arm);
    return simple(arm) || (pseudo !== null && simple(pseudo[1] ?? ''));
  });

const pseudoOnly = (selector: string) =>
  selector.split(',').every((part) => {
    const pseudo = PSEUDO_ELEMENT.exec(part.trim());
    return pseudo !== null && simple(pseudo[1] ?? '');
  });

const inactiveLegacyPlaceholder = (document: Document, selector: string) =>
  selector.split(',').every((part) => {
    const prefix = /^(.*):-ms-input-placeholder$/.exec(part.trim())?.[1];
    return prefix !== undefined && simple(prefix);
  }) && document.querySelector(selector) === null;

/** Only projected declarations can affect the five values; unknown rule kinds and contextual projected declarations take the plain path. */
const safeSheets = (document: Document) => {
  const view = document.defaultView;
  if (view === null) return false;
  try {
    for (const sheet of [...document.styleSheets, ...document.adoptedStyleSheets]) {
      for (const rule of sheet.cssRules) {
        if (rule instanceof view.CSSStyleRule) {
          if (
            affectsRead(rule.style) &&
            !pseudoOnly(rule.selectorText) &&
            !inactiveLegacyPlaceholder(document, rule.selectorText) &&
            (!safeStyle(rule.style) || !safeSelector(rule.selectorText))
          )
            return false;
        } else if (rule.type !== view.CSSRule.KEYFRAMES_RULE) return false;
      }
    }
    return true;
  } catch {
    return false;
  }
};

/** Each read owns all caches. Eligible HTML/SVG chains share immutable values; every unproved context retains node-identity-only reads. */
export const fieldReader = (host: Element) => {
  const document = host.ownerDocument;
  const view = document.defaultView;
  const eligible = view !== null && safeSheets(document);
  const styles = new Map<Element, Style>();
  const chains = new Map<Element, number | null>();
  const interned = new Map<string, number>();
  const shared = new Map<number, Style>();
  const layout = new Map<Element, boolean>();
  const chainOf = (node: Element) => {
    if (!eligible || node.getRootNode() !== document || !node.isConnected) return null;
    const path: Element[] = [];
    let at: Element | null = node;
    while (at !== null && !chains.has(at)) {
      path.push(at);
      at = at.parentElement;
    }
    let parent = at === null ? 0 : (chains.get(at) ?? null);
    for (const member of path.reverse()) {
      if (
        parent === null ||
        view === null ||
        !(member instanceof view.HTMLElement || member instanceof view.SVGElement) ||
        member.shadowRoot !== null ||
        !safeStyle(member.style)
      )
        parent = null;
      else {
        const key = JSON.stringify([
          parent,
          member.namespaceURI,
          member.tagName,
          member.getAttribute('class'),
          member.getAttribute('style'),
        ]);
        let known = interned.get(key);
        if (known === undefined) {
          known = interned.size + 1;
          interned.set(key, known);
        }
        parent = known;
      }
      chains.set(member, parent);
    }
    return parent;
  };
  const styleOf = (node: Element): Style => {
    const known = styles.get(node);
    if (known !== undefined) return known;
    const chain = chainOf(node);
    const reused = chain === null ? undefined : shared.get(chain);
    if (reused !== undefined) {
      styles.set(node, reused);
      return reused;
    }
    const style = getComputedStyle(node);
    const value = {
      display: style.display,
      visibility: style.visibility,
      opacity: style.opacity,
      color: style.color,
      backgroundColor: style.backgroundColor,
    };
    styles.set(node, value);
    if (chain !== null) shared.set(chain, value);
    return value;
  };
  const laidOut = (node: Element) => {
    const path: Element[] = [];
    let visible = true;
    for (let at: Element | null = node; at !== null; at = at.parentElement) {
      const known = layout.get(at);
      if (known !== undefined) {
        visible = known;
        break;
      }
      path.push(at);
      const style = styleOf(at);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
        visible = false;
        break;
      }
    }
    for (const at of path) layout.set(at, visible);
    return visible;
  };
  const seen = (node: Element) =>
    laidOut(node) && !/rgba\(.*, 0(\.0+)?\)$|transparent/.test(styleOf(node).color);
  return { seen, styleOf };
};
