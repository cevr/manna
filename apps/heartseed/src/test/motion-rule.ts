/* oxlint-disable effect/noNullish -- the frame rule reads DOM attributes and ancestors, whose absence is null. */

const CONTROLS =
  'button,input[type="radio"],input[type="checkbox"],a[href],[role="button"],[role="radio"],[role="checkbox"],[role="link"]';

/** What moving nodes under `top` show wrong: only hidden drawings holding exactly one image, no text and no control may enter, sway or wait unseen. Inline styles keep the frame scan to one query without computing layout. */
export const motionFaults = (top: Element): string[] => {
  const faults: string[] = [];
  for (const node of top.querySelectorAll<HTMLElement>('[style]')) {
    const animation = node.style.animationName;
    const visibility = node.style.visibility;
    const transform = node.style.transform;
    if (animation === '' && visibility !== 'hidden' && transform === '') continue;
    const id = node.getAttribute('data-testid') ?? node.tagName;
    if (node.closest('[aria-hidden="true"]') === null) faults.push(`a moving node exposed: ${id}`);
    if ((node.textContent ?? '').trim() !== '') faults.push(`a moving node holding text: ${id}`);
    if (node.matches(CONTROLS) || node.querySelector(CONTROLS) !== null)
      faults.push(`a moving node that is or holds a control: ${id}`);
    if (node.querySelectorAll('img').length !== 1)
      faults.push(`a moving node without its one image: ${id}`);
  }
  return faults;
};
