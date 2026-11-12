/* oxlint-disable effect/noNullish, effect/noTernary, effect/noUnsafeDictionaryType, effect/noRuntimeTypeof -- a test rig: it reads React's fiber tree as React keeps it, whose absent links are null, whose props are a plain record and whose text is a string where an element's is not, and names each fault with a plain branch. */

/** A fiber as React keeps it: the props it was drawn with (a string for a text), its first child, its next sibling and its host node. */
export interface Fiber {
  readonly memoizedProps?: unknown;
  readonly child?: Fiber | null;
  readonly sibling?: Fiber | null;
  readonly stateNode?: unknown;
}

/** The value `node` keeps under the React key starting with `prefix`. */
const keyed = (node: Node, prefix: string): Fiber | undefined => {
  const key = Object.keys(node).find((name) => name.startsWith(prefix));
  return key === undefined ? undefined : (node as unknown as Record<string, Fiber>)[key];
};

/** The current fiber of the React root that draws `element` (or that `element` holds), not the node's own fiber, which may be the stale alternate. */
export const rootFiberOf = (element: Node): Fiber | undefined => {
  let root: Fiber | undefined;
  for (let node: Node | null = element; node !== null && root === undefined; node = node.parentNode)
    root = (keyed(node, '__reactContainer$')?.stateNode as { readonly current?: Fiber } | undefined)
      ?.current;
  return root;
};

/** A fiber's props as a record, or none for a text, whose props are its string. */
export const fiberProps = (fiber: Fiber): Record<string, unknown> =>
  fiber.memoizedProps instanceof Object ? (fiber.memoizedProps as Record<string, unknown>) : {};

/** Whether `props` hide their node's children from VoiceOver (iOS, Android or the web's name). */
const hides = (props: Record<string, unknown>): boolean =>
  props['accessibilityElementsHidden'] === true ||
  props['importantForAccessibility'] === 'no-hide-descendants' ||
  props['aria-hidden'] === true ||
  props['aria-hidden'] === 'true';

const WORD = /^word-\d+$/u;

/** Whether the fibers from `fiber` on, and every one below them, hold a word or a text. */
const holdsWords = (fiber: Fiber | null | undefined): boolean => {
  for (let each = fiber; each; each = each.sibling) {
    if (typeof each.memoizedProps === 'string') return true;
    if (typeof fiberProps(each)['children'] === 'string') return true;
    if (WORD.test(String(fiberProps(each)['testID'] ?? ''))) return true;
    if (holdsWords(each.child)) return true;
  }
  return false;
};

/**
 * What would merge the reading view's words into one VoiceOver element, or
 * hide them, in the React root drawing `host`: an `accessible` node from
 * `reading` (inclusive) down to a word (exclusive: a word is its own
 * element), or a node hiding its children from `reading` down to a word's
 * text, when they hold a word or a text (a line's empty `break-<k>` hides
 * nothing). Faults too when the root or the `reading` view is not in the tree.
 * Read from React's current fiber tree, since react-native-web draws no DOM
 * for the props VoiceOver reads (`accessible`,
 * `accessibilityElementsHidden`, `importantForAccessibility`).
 */
export const voiceOverFaults = (host: Node): string[] => {
  const root = rootFiberOf(host);
  if (root === undefined) return ['voiceover: no React root'];
  const faults = new Set<string>();
  let readings = 0;
  const walk = (fiber: Fiber | null | undefined, inReading: boolean, word: string | undefined) => {
    for (let each = fiber; each; each = each.sibling) {
      const props = fiberProps(each);
      const id = props['testID'] === undefined ? undefined : String(props['testID']);
      const reading = inReading || id === 'reading';
      if (!inReading && reading) readings++;
      const own = word ?? (reading && id !== undefined && WORD.test(id) ? id : undefined);
      if (reading && own === undefined && props['accessible'] === true)
        faults.add(`voiceover: ${id ?? 'a node'} in the reading view is one element`);
      if (reading && hides(props) && holdsWords(each.child))
        faults.add(`voiceover: ${id ?? 'a node'} hides ${own ?? 'the reading view'}'s children`);
      walk(each.child, reading, own);
    }
  };
  walk(root, false, undefined);
  if (readings === 0) faults.add('voiceover: no reading view in the tree');
  return [...faults];
};
