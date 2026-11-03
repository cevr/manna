import type { Input } from '../browser/keys.ts';

const TEXT_FIELD =
  'input:not([type=button],[type=checkbox],[type=radio],[type=range],[type=submit],[type=reset],[type=color],[type=file],[type=image]), textarea, [contenteditable]:not([contenteditable=false])';

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
