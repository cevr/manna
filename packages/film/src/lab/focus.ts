import type { Input } from '../browser/keys.ts';

/** A text field: the browser shows the ring on it whatever focused it. */
const TEXT_FIELD =
  'input:not([type=button],[type=checkbox],[type=radio],[type=range],[type=submit],[type=reset],[type=color],[type=file],[type=image]), textarea, [contenteditable]:not([contenteditable=false])';

/**
 * Put the focus on `el`, asked for by `input`: the ring shows iff a key asked,
 * or `el` is a text field. An element that already has the focus with the
 * other look (the keyboard's ring, then a click on the studio) lets it go
 * first, since a focus it already has changes nothing.
 */
export const focusFor = (
  el: HTMLElement,
  input: Input,
  options: { readonly preventScroll?: boolean } = {},
): void => {
  const shows = input === 'key' || el.matches(TEXT_FIELD);
  if (el === document.activeElement && el.matches(':focus-visible') !== shows) el.blur();
  // oxlint-disable-next-line film/focus-through-focus-for -- the one focus move the rule sends the lab through
  el.focus({ ...options, focusVisible: shows });
};
