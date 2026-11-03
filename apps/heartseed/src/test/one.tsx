/**
 * `one`'s safe-area insets as the app's tests see them, in points: a phone's
 * with no insets. `setup.ts` stands this module in for `one`, the router's
 * boundary, with the parts the screens use.
 */
export const useSafeAreaInsets = () => ({ top: 0, right: 0, bottom: 0, left: 0 });
