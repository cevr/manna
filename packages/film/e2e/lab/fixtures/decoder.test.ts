import { describe, expect, it } from 'effect-bun-test';
import { Effect } from 'effect';
import { compile } from '../../../src/lab/fixtures/bundles.ts';

/** Long enough to bundle two pages. */
const BUNDLING = 20_000;

describe("the fixture pages' decoder", () => {
  it.live(
    'is left out of a page whose tests show no footage, and kept in one whose tests show a talk',
    () =>
      Effect.gen(function* () {
        const [ask, render] = yield* Effect.all(
          [compile('ask-page.ts'), compile('render-page.ts')],
          {
            concurrency: 2,
          },
        );
        expect(ask.includes('EncodedPacketSink')).toBe(false);
        expect(ask).toContain('this fixture page decodes no footage');
        expect(render.includes('EncodedPacketSink')).toBe(true);
      }),
    BUNDLING,
  );
});
