/* oxlint-disable effect/noNullish -- it reads a rendered document, whose absent nodes, attributes and parents are null. */

import { Option } from 'effect';

import type { Foot } from '../../scripts/foot';

const fold = (text: string) => text.replace(/\s+/gu, ' ').trim().toLowerCase();

/** Whether `node` comes after `last` in document order, outside it. */
const after = (last: Element, node: Node) =>
  !last.contains(node) &&
  (last.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;

/** The label a text node `node` after `last` gives: its element's whole text when that element is after `last` too, else its own text; none when blank. */
const textLabel = (last: Element, node: Node): Option.Option<string> => {
  const own = fold(node.textContent ?? '');
  if (own === '') return Option.none();
  const parent = node.parentElement;
  if (parent !== null && after(last, parent)) return Option.some(fold(parent.textContent ?? ''));
  return Option.some(own);
};

/**
 * Home's foot as a rendered document `host` draws it: every node in the
 * scroll view `field-scroll` that comes after its last furrow row (`row`),
 * in document order and outside that row. Whatever source draws a node
 * there (a spread, props passed on, a sibling inside the furrows'
 * wrapper), the node is in the document, so it is in the foot. Each test
 * id is kept as spelled, each `aria-label` folded, and each text folded:
 * an element's whole text when it holds text of its own, and text loose
 * in an element that holds the furrows as itself. None when the document
 * holds no such scroll view or no row in it.
 */
export const footOfHost = (host: Element): Option.Option<Foot> => {
  const scroll = host.querySelector('[data-testid="field-scroll"]');
  const last = [...(scroll?.querySelectorAll('[data-testid="row"]') ?? [])].at(-1);
  if (scroll === null || last === undefined) return Option.none();
  const ids = new Set<string>();
  const labels = new Set<string>();
  const walker = document.createTreeWalker(scroll, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    if (!after(last, node)) continue;
    if (!(node instanceof Element)) {
      for (const label of Option.toArray(textLabel(last, node))) labels.add(label);
      continue;
    }
    const id = node.getAttribute('data-testid');
    if (id !== null) ids.add(id);
    const label = node.getAttribute('aria-label');
    if (label !== null) labels.add(fold(label));
  }
  return Option.some({ ids, labels });
};
