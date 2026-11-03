import { Effect, Schema } from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import { asset, openTab, respond, scriptOf, servePaths } from '../../src/lab/fixtures/browsers.ts';
import type { AfterLoss, RiveFrame } from '../../src/canvas/fixtures/rive-pixels.ts';

/** The five times compared: the reach off, on, mid-swing and left at rest. */
const TARGETS = [0.1, 0.6, 1.1, 1.6, 1.95];

/** Two histories drawn before each target: far ahead and behind, and from the scene's end. */
const HISTORY_A = [3.9, 0.3, 2.2];
const HISTORY_B = [1.0, 3.1];

/** The fixture page's script and the files it loads (the runtimes' wasm, the rig), bundled once, as the file loads. */
const fixture = Effect.succeed(
  // oxlint-disable-next-line effect/noAsyncFunction -- built once as the file loads, so no case's time limit holds its cost
  await Effect.runPromise(
    Effect.promise(() =>
      Bun.build({
        entrypoints: [`${import.meta.dir}/../../src/canvas/fixtures/rive-pixels.ts`],
        target: 'browser',
        format: 'iife',
        publicPath: '/',
      }),
    ).pipe(
      Effect.flatMap((built) =>
        Effect.forEach(built.outputs, (out) =>
          Effect.promise(() => out.arrayBuffer()).pipe(
            Effect.map((buffer) => ({
              kind: out.kind,
              path: out.path.split('/').pop() ?? '',
              bytes: new Uint8Array(buffer),
            })),
          ),
        ),
      ),
    ),
  ),
);

/** Times as JSON, to hand to the page. */
const json = Schema.encodeSync(Schema.fromJsonString(Schema.Array(Schema.Finite)));

/** A page of its own with the fixture's script loaded. */
const fixturePage = () =>
  Effect.gen(function* () {
    const files = yield* fixture;
    const entry = files.find((f) => f.kind === 'entry-point');
    expect(entry).toBeDefined();
    const script = asset('rive.js', respond(entry?.bytes ?? new Uint8Array(), 'text/javascript'));
    const served = Object.fromEntries(
      files
        .filter((f) => f.kind === 'asset')
        .map((f) => [
          `/${f.path}`,
          respond(
            f.bytes,
            f.path.endsWith('.wasm') ? 'application/wasm' : 'application/octet-stream',
          ),
        ]),
    );
    const page = yield* openTab({
      width: 800,
      height: 600,
      microphone: false,
      init: [],
      assets: [script],
      serve: servePaths({
        ...served,
        '/': respond(`<!doctype html><html><body>${scriptOf(script)}</body></html>`, 'text/html'),
      }),
    });
    yield* page.goto('/');
    return page;
  });

/** `targets`' frames after `histories` (one after another), in one page. */
const framesOn = (
  histories: ReadonlyArray<ReadonlyArray<number>>,
  targets: ReadonlyArray<number> = TARGETS,
) =>
  Effect.gen(function* () {
    const page = yield* fixturePage();
    const drawn: Array<ReadonlyArray<RiveFrame>> = [];
    for (const history of histories)
      drawn.push(
        yield* page.evaluate<ReadonlyArray<RiveFrame>>(
          `riveFrames(${json(history)}, ${json(targets)})`,
        ),
      );
    return drawn;
  });

describe('a Rive rig in the page', () => {
  it.scopedLive(
    'draws the same bytes at each time after either history and on a fresh page of its own',
    () =>
      Effect.gen(function* () {
        const [afterA = [], afterB = []] = yield* framesOn([HISTORY_A, HISTORY_B]);
        const fresh = (yield* Effect.forEach(TARGETS, (at) => framesOn([[]], [at]))).flat(2);
        expect(fresh.map((f) => f.at)).toEqual(TARGETS);
        expect(afterA.map((f) => f.hash)).toEqual(fresh.map((f) => f.hash));
        expect(afterB.map((f) => f.hash)).toEqual(fresh.map((f) => f.hash));
        expect(new Set(fresh.map((f) => f.hash)).size).toBe(TARGETS.length);
        for (const f of fresh) expect(f.rigPixels).toBeGreaterThan(1000);
      }),
    120_000,
  );

  for (const how of ['cap', 'budget'] as const)
    it.scopedLive(
      `draws the same bytes again once its WebGL context is lost (${how === 'cap' ? "the browser's cap" : "the page's budget"}), never a blank`,
      () =>
        Effect.gen(function* () {
          const page = yield* fixturePage();
          const loss = yield* page.evaluate<AfterLoss>(`riveAfterLoss(0.6, '${how}')`);
          expect(loss.lost).toBeGreaterThan(0);
          expect(loss.after).toBe(loss.before);
        }),
      60_000,
    );
});
