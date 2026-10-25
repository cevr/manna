/**
 * The channel's name as it is drawn: lockup D, “Small capitals”. The bare
 * wheat (`../art/wheat.svg`, the hymnal's blade, the same shape) beside the
 * wordmark, Newsreader 500 in small capitals with “the” in italic. The wheat
 * is laid in the page as markup, so it takes the colour of the ground it
 * stands on: the deep wheat on the paper and the sky, the wheat by night.
 * The wordmark is the name as text, its capitals drawn by the stylesheet, so
 * it is read once, as it reads.
 */
import wheat from '../art/wheat.svg?raw';

export const Wordmark = () => (
  <span class="wordmark" data-logo="">
    First <i>the</i> Blade
  </span>
);

/** The bare wheat, drawn in the colour of the words around it. */
export const Wheat = () => <span class="wheat" innerHTML={wheat} />;

/** The wheat beside the wordmark, as the link home. */
export const Lockup = () => (
  <a class="lockup" href="/">
    <Wheat />
    <Wordmark />
  </a>
);

/** The wheat over the wordmark, for the night close. */
export const StackedLockup = () => (
  <div class="lockup lockup-stack">
    <Wheat />
    <Wordmark />
  </div>
);
