/** The backdrop's opacity while the wheel is up, and its fades in and out, in ms. */
export declare const BACKDROP: {
  readonly opacity: number;
  readonly enter: number;
  readonly exit: number;
};

/** Reduce Motion's fades in and out, in ms. */
export declare const REDUCED: { readonly enter: number; readonly exit: number };

/** The exit's run for one item, and each item's delay after the one farther out, in ms. */
export declare const EXIT: { readonly duration: number; readonly stagger: number };
