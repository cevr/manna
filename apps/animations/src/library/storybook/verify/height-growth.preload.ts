/**
 * A defect for the height acceptance to catch, preloaded into a verify run
 * (`bun --preload`): cold-ouch's lead breathes 4 % taller from 1.4 s, the
 * render growing while its key holds (verifier round 2, M3). Fails the run
 * at load when the line it changes is gone, so the defect never silently
 * stops being made.
 */
const FROM = '      ...poseAt(f, t),';
const TO =
  "      ...poseAt(f, t), breath: poseAt(f, t).breath * (1 + 0.04 * Number(shot.id === 'cold-ouch' && f.name === 'lead' && t > 1.4)),";

Bun.plugin({
  name: 'height-growth',
  setup: (build) => {
    // oxlint-disable-next-line effect/noAsyncFunction -- Bun's loader hook takes a promise, before any Effect runtime runs
    build.onLoad({ filter: /library\/storybook\/shot\.ts$/ }, async ({ path }) => {
      // oxlint-disable-next-line effect/noAsyncFunction, effect/noGlobals -- the loader reads the module's source through Bun, as the hook it runs in
      const source = await Bun.file(path).text();
      if (!source.includes(FROM)) {
        const missing = `height-growth: ${FROM.trim()} is not in ${path}`;
        // oxlint-disable-next-line effect/noThrowStatement, effect/noNewError -- a loader refuses a module by throwing; the run then fails at load
        throw new Error(missing);
      }
      return { contents: source.replace(FROM, TO), loader: 'ts' };
    });
  },
});
