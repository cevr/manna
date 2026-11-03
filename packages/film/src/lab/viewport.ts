/** A phone's widest window, in CSS px: the studio's one breakpoint. */
const PHONE_WIDEST = 899;

/**
 * A phone's width, the studio's one: under it the shell is a phone's
 * (`page-shell-style.ts`), a sheet rises from the bottom and the review
 * plays the 720p copy. Every style written in TypeScript (the shell's, the
 * review's, the commands') says
 * it through `PHONE` and `WIDE`, and `film/one-breakpoint` refuses a width
 * written out there; the stylesheets that cannot import it (`player.css`,
 * `tokens.css`) are held to its value by `viewport.test.ts`.
 */
export const PHONE = `(max-width: ${PHONE_WIDEST}px)`;

/** Wider than a phone: a laptop's window, `PHONE`'s other side. */
export const WIDE = `(min-width: ${PHONE_WIDEST + 1}px)`;
