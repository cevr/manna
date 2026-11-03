import { Deferred, Effect, Exit, Option, Schedule } from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import {
  asset,
  chromeCommandLine,
  openTab,
  respond,
  scriptOf,
  viewsMade,
} from '../../../src/lab/fixtures/browsers.ts';
import { evaluates } from '../../../src/lab/fixtures/settled.ts';
import { type Request, type Tab, jsonOf } from '../../../src/lab/fixtures/tab.ts';

/**
 * A page whose script answers `window.served` from its server's `/probe`; its server holds
 * `/hold` unanswered, and `held` is done once it has.
 */
const page = (word: string) => {
  const script = asset(
    'probe.js',
    respond(
      `fetch('/probe').then((r) => r.text()).then((t) => { window.served = t; });`,
      'text/javascript',
    ),
  );
  const held = Deferred.makeUnsafe<void>();
  return {
    script,
    held,
    serve: (asked: Array<string>) => (request: Request) =>
      Effect.suspend(() => {
        asked.push(request.url.pathname);
        if (request.url.pathname === '/hold')
          return Effect.as(Deferred.done(held, Exit.void), Option.none());
        if (request.url.pathname === '/probe')
          return Effect.succeedSome(respond(word, 'text/plain'));
        return Effect.succeedSome(
          respond(`<!doctype html><html><body>${scriptOf(script)}</body></html>`, 'text/html'),
        );
      }),
  };
};

/** The page's state, as one JSON value a wait can compare. */
const STATE = `JSON.stringify({
  init: globalThis.dirty ?? 'none',
  local: localStorage.length,
  session: sessionStorage.length,
  cookie: document.cookie,
  name: window.name,
  hash: location.hash,
  history: history.length,
  width: innerWidth,
  served: globalThis.served ?? 'none',
})`;

const dirty = (tab: Tab, held: Deferred.Deferred<void>) =>
  Effect.gen(function* () {
    yield* tab.goto('/');
    yield* evaluates(tab, "globalThis.served ?? 'none'", 'one');
    yield* tab.evaluate(`
      localStorage.setItem('k', 'v');
      sessionStorage.setItem('k', 'v');
      document.cookie = 'k=v';
      window.name = 'leaked';
      history.pushState(null, '', '#dirty');
      fetch('/hold');
      addEventListener('pagehide', () => {
        console.log('leaked log');
        setTimeout(() => { throw new Error('leaked throw'); });
        throw new Error('leaked throw');
      });
      true`);
    yield* Deferred.await(held);
    yield* tab.mouse.move(20, 20);
    yield* tab.mouse.down;
  });

describe('the pool of views', () => {
  it.live('lends a view to the next case with nothing of the last case left in it', () =>
    Effect.gen(function* () {
      const first = page('one');
      const firstAsked: Array<string> = [];
      const made = yield* Effect.scoped(
        Effect.gen(function* () {
          const tab = yield* openTab({
            width: 500,
            height: 400,
            microphone: false,
            init: [`globalThis.dirty = 'init'`],
            assets: [first.script],
            serve: first.serve(firstAsked),
          });
          yield* dirty(tab, first.held);
          yield* evaluates(tab, 'location.hash', '#dirty');
          return viewsMade();
        }),
      );

      const second = page('two');
      const asked: Array<string> = [];
      yield* Effect.scoped(
        Effect.gen(function* () {
          const tab = yield* openTab({
            width: 900,
            height: 700,
            microphone: false,
            init: [],
            assets: [second.script],
            serve: second.serve(asked),
          });
          expect(viewsMade()).toBe(made);
          yield* tab.goto('/');
          yield* evaluates(
            tab,
            STATE,
            jsonOf({
              init: 'none',
              local: 0,
              session: 0,
              cookie: '',
              name: '',
              hash: '',
              history: 2,
              width: 900,
              served: 'two',
            }),
          );
          yield* tab.evaluate(`
            window.seen = [];
            for (const type of ['mousedown', 'mouseup', 'click'])
              addEventListener(type, (e) => window.seen.push(type + ':' + e.buttons));
            true`);
          yield* tab.mouse.click(40, 40);
          yield* evaluates(tab, 'window.seen', ['mousedown:1', 'mouseup:0', 'click:0']);
          expect(asked.filter((path) => path !== '/favicon.ico')).toEqual(['/', '/probe']);
          expect(tab.errors).toEqual([]);
          expect(tab.logged.map((m) => m.text)).not.toContain('leaked log');
        }),
      );
      expect(firstAsked).toContain('/hold');
    }),
  );

  for (const [name, script] of [
    ['a Solid diagnostic', "console.warn('[NO_OWNER_CLEANUP] a cleanup with no owner')"],
    ['a console error', "console.error('boom')"],
    [
      "a warning in the host-reach report's spelling",
      `console.warn('[host-reach] {"api":"probe","frames":[]}')`,
    ],
    [
      "an error in the host-reach report's spelling",
      `console.error('[host-reach] {"api":"probe","frames":[]}')`,
    ],
    ['an uncaught throw', "setTimeout(() => { throw new Error('late') })"],
  ] as const)
    it.live(`fails a case whose page logged ${name}, though the case never looked`, () =>
      Effect.gen(function* () {
        const control = page('one');
        const exit = yield* Effect.exit(
          Effect.scoped(
            Effect.gen(function* () {
              const tab = yield* openTab({
                width: 500,
                height: 400,
                microphone: false,
                init: [],
                assets: [control.script],
                serve: control.serve([]),
              });
              yield* tab.goto('/');
              yield* evaluates(tab, "globalThis.served ?? 'none'", 'one');
              yield* tab.evaluate(`${script}; true`);
              yield* Effect.repeat(
                Effect.sync(() => tab.errors.length),
                {
                  schedule: Schedule.spaced('10 millis'),
                  until: (heard) => heard > 0,
                },
              );
            }),
          ),
        );
        expect(exit._tag).toBe('Failure');
      }),
    );

  it.live.serial(
    'dies on a finger put down while another tab is open: a touch runs alone, whatever its spelling',
    () =>
      Effect.gen(function* () {
        const phone = {
          width: 390,
          height: 844,
          coarse: true,
          microphone: false,
          init: [],
          assets: [],
          serve: page('touch').serve([]),
        };
        const exit = yield* Effect.exit(
          Effect.scoped(
            Effect.gen(function* () {
              const tab = yield* openTab(phone);
              yield* openTab({ ...phone, coarse: false });
              yield* tab.goto('/');
              yield* tab.finger.down(100, 100);
            }),
          ),
        );
        expect(exit._tag).toBe('Failure');
        expect(String(exit)).toContain('a finger went down while another tab was open');
        yield* Effect.scoped(
          Effect.gen(function* () {
            const tab = yield* openTab(phone);
            yield* tab.goto('/');
            yield* tab.finger.down(100, 100);
            yield* tab.finger.up;
          }),
        );
      }),
  );

  it.live.serial(
    "closes a view two fingers were down on at once, and the next case's touch lands",
    () =>
      Effect.gen(function* () {
        const phone = {
          width: 390,
          height: 844,
          coarse: true,
          microphone: false,
          init: [],
          assets: [],
          serve: page('touch').serve([]),
        };
        yield* Effect.scoped(
          Effect.gen(function* () {
            const tab = yield* openTab(phone);
            yield* tab.goto('/');
            yield* tab.finger.down(100, 100);
            yield* tab.finger.second.down(200, 200);
            yield* tab.finger.second.up;
            yield* tab.finger.up;
          }),
        );
        yield* Effect.scoped(
          Effect.gen(function* () {
            const tab = yield* openTab(phone);
            yield* tab.goto('/');
            yield* tab.evaluate(
              `(window.seen = [], addEventListener('touchstart', () => window.seen.push('touchstart')), true)`,
            );
            yield* tab.finger.down(100, 100);
            yield* tab.finger.up;
            yield* evaluates(tab, 'window.seen', ['touchstart']);
          }),
        );
      }),
  );
});

describe("the tests' Chrome", () => {
  it.live(
    "runs silent: its pages muted, their sound played to a fake device, never the host's speakers",
    () =>
      Effect.gen(function* () {
        const flags = (yield* chromeCommandLine).split(/\s+/);
        expect(flags).toContain('--mute-audio');
        expect(flags).toContain('--disable-audio-output');
      }),
  );
});
