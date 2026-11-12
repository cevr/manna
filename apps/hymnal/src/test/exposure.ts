/* oxlint-disable effect/noNullish -- reads the document as it gives an attribute: null when absent. */

import type { ReactNode, Ref } from 'react';

/** The props of a view or a Text that iOS's tree reads, as React Native hands them over. */
interface Props {
  readonly accessible?: boolean;
  readonly accessibilityElementsHidden?: boolean;
  readonly accessibilityViewIsModal?: boolean;
  readonly dataSet?: Readonly<Record<string, string>>;
}

/**
 * `props` with what iOS reads of them written where the document keeps it:
 * `accessible` as `data-ios` `element` or `none`, `accessibilityViewIsModal`
 * as `data-ios-modal`, `accessibilityElementsHidden` as `aria-hidden`.
 */
export const iosProps = <P extends Props>(props: P): P => {
  const marks: Array<[string, string]> = [];
  if (props.accessible === true) marks.push(['ios', 'element']);
  if (props.accessible === false) marks.push(['ios', 'none']);
  if (props.accessibilityViewIsModal === true) marks.push(['iosModal', 'true']);
  const hidden = props.accessibilityElementsHidden === true && { 'aria-hidden': true };
  if (marks.length === 0 && !hidden) return props;
  return { ...props, ...hidden, dataSet: { ...props.dataSet, ...Object.fromEntries(marks) } };
};

/** A component as `forwardRef` makes it: its render function, which React reads at each draw. */
interface Forwarded {
  render: (props: Props, ref: Ref<HTMLElement>) => ReactNode;
}

/** Has each of `components` (react-native-web's `View` and `Text`) draw with `iosProps`. */
export const exposeAsIOS = (components: ReadonlyArray<unknown>) => {
  for (const component of components as ReadonlyArray<Forwarded>) {
    const render = component.render;
    component.render = (props, ref) => render(iosProps(props), ref);
  }
};

/** What iOS's tree holds under a host: the testIDs, and the elements' names. */
export interface Exposed {
  readonly ids: ReadonlySet<string>;
  readonly labels: ReadonlySet<string>;
}

const INPUTS = new Set(['INPUT', 'TEXTAREA']);

const hidden = (element: Element) => element.getAttribute('aria-hidden') === 'true';

/** Whether iOS makes `element` an accessibility element. */
const isElement = (element: Element) => {
  const mark = element.getAttribute('data-ios');
  if (mark === 'none') return false;
  if (mark === 'element') return true;
  return (
    element.hasAttribute('dir') ||
    element.getAttribute('tabindex') === '0' ||
    INPUTS.has(element.tagName)
  );
};

/** A Text's words as one string: its runs and nested Texts run on, as iOS draws one label. */
const runOf = (element: Element): string =>
  [...element.childNodes]
    .map((child) => {
      if (child.nodeType === 3) return child.textContent ?? '';
      if (child instanceof Element && !hidden(child)) return runOf(child);
      return '';
    })
    .join('');

/** The Texts under `element` iOS reads into its name, each whole: none under a hidden view. */
const textsOf = (element: Element): ReadonlyArray<string> =>
  [...element.children].flatMap((child) => {
    if (hidden(child)) return [];
    if (child.hasAttribute('dir')) return [runOf(child).trim()];
    return textsOf(child);
  });

/** An element's name: its label, else an input's placeholder, else its Texts joined (a Text's own run). */
const nameOf = (element: Element) => {
  const named = element.getAttribute('aria-label') ?? element.getAttribute('placeholder');
  if (named !== null) return named;
  if (element.hasAttribute('dir')) return runOf(element).trim();
  return textsOf(element)
    .filter((text) => text !== '')
    .join(' ');
};

/** The testIDs under an element: agent-device still finds them, named as the element is. */
const idsUnder = (element: Element, ids: Set<string>) => {
  for (const child of shownChildren(element)) {
    if (hidden(child)) continue;
    const id = child.getAttribute('data-testid');
    if (id !== null) ids.add(id);
    idsUnder(child, ids);
  }
};

/** The children of `element` iOS shows: a modal child's alone, when it has one. */
const shownChildren = (element: Element) => {
  const children = [...element.children];
  const modal = children.filter((child) => child.getAttribute('data-ios-modal') === 'true');
  if (modal.length > 0) return modal;
  return children;
};

/**
 * What iOS's accessibility tree holds of a screen react-native-web drew,
 * as agent-device reads it (`label=`, `id=`): the scenes' drawer
 * (`phone-scenes.tsx`) asks it for the names a scene draws.
 *
 * iOS exposes accessibility elements, not views:
 * - an element is a Text, a touchable (a Pressable: react-native-web gives
 *   it `tabindex="0"`), an input, or a view marked `accessible`;
 *   `accessible={false}` makes a view or a Text no element;
 * - an element is named by its `accessibilityLabel` (`aria-label`), or, with
 *   none, by its Texts joined with spaces, each Text's runs run on (an input
 *   by its placeholder);
 * - an element hides the names under it: a button whose label is renamed is
 *   found by its new label only, though it still draws the old word (About's
 *   `Done` relabelled `Close`: `label=Done` is missing on the simulator);
 *   the testIDs under it are still found, as the line's syllables are
 *   (`id=syllable-1-1-1` in the hymn-reader journey, green on the simulator);
 * - `aria-hidden` and `accessibilityElementsHidden` hide a view and all under
 *   it; `importantForAccessibility` is Android's alone and hides nothing;
 * - `accessibilityViewIsModal` hides the modal view's siblings.
 *
 * react-native-web drops `accessible`, `accessibilityElementsHidden` and
 * `accessibilityViewIsModal` from the document, so `iosProps` writes them
 * into it first (`data-ios`, `aria-hidden`), as `exposeAsIOS` has every
 * `View` and `Text` do.
 */
export const exposedIn = (host: Element): Exposed => {
  const ids = new Set<string>();
  const labels = new Set<string>();
  const visit = (element: Element) => {
    if (hidden(element)) return;
    const id = element.getAttribute('data-testid');
    if (id !== null) ids.add(id);
    if (isElement(element)) {
      const name = nameOf(element);
      if (name !== '') labels.add(name);
      idsUnder(element, ids);
      return;
    }
    for (const child of shownChildren(element)) visit(child);
  };
  for (const child of shownChildren(host)) visit(child);
  return { ids, labels };
};
