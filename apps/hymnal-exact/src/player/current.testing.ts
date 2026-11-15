/* oxlint-disable effect/noAsyncFunction, effect/noDynamicImports -- the port's tests load the current app's player modules under Bun, imported only after the stand-ins below are registered with Bun's loader; never imported by `app.ts`. */

/**
 * The current app's bar and player, as the port's tests run them: their
 * import graph reaches the current app's bundled timing and chords
 * (`virtual:hymnal-timing`, `virtual:hymnal-chords`), which stand in here
 * empty, as the bar's rule reads neither. Loaded once, after the stand-ins.
 */

Bun.plugin({
  name: 'hymnal-exact-player-boundaries',
  setup(build) {
    build.module('virtual:hymnal-timing', () => ({ exports: { default: [] }, loader: 'object' }));
    build.module('virtual:hymnal-chords', () => ({ exports: { default: [] }, loader: 'object' }));
  },
});

export const current = async () => ({
  bar: await import('@manna/hymnal-app/player/bar'),
  player: await import('@manna/hymnal-app/player/player'),
});
