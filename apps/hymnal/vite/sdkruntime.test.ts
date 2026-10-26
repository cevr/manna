/* oxlint-disable effect/noNullish, effect/noTernary -- drives rolldown at the bundler's host boundary: its plugin hooks answer `undefined` for a module that is not theirs. */

import { describe, expect, it } from 'effect-bun-test';
import { Effect } from 'effect';
import { build } from 'rolldown';

const app = new URL('..', import.meta.url).pathname;
const entry = '\0sdk-entry';

/** Bundles one module that calls the SDK, as One's iOS backends do, tree-shaken as the Release bundle is. */
const bundle = () =>
  Effect.promise(() =>
    build({
      input: entry,
      cwd: app,
      platform: 'neutral',
      treeshake: true,
      write: false,
      resolve: { conditionNames: ['react-native', 'import', 'default'] },
      external: [/^react-native/],
      plugins: [
        {
          name: 'sdk-entry',
          resolveId: (source: string) => (source === entry ? entry : undefined),
          load: (module: string) =>
            module === entry
              ? `import { callSDK } from 'one/ios-runtime'; globalThis.call = callSDK;`
              : undefined,
        },
      ],
    }),
  ).pipe(
    Effect.map(({ output }) =>
      output.map((chunk) => ('code' in chunk ? chunk.code : '')).join('\n'),
    ),
  );

const setUp = 'createHybridObject("OneSDK")';

describe('the Release bundle keeps One’s iOS SDK set-up', () => {
  it.effect('One’s package preserves SDK initialization in a tree-shaken native bundle', () =>
    bundle().pipe(Effect.map((code) => expect(code).toContain(setUp))),
  );
});
