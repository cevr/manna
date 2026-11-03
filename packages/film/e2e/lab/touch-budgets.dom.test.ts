import { Effect, Exit, Option } from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import { type Tab, WAIT_MS } from '../../src/lab/fixtures/tab.ts';
import { firstScreenItems } from '../../src/lab/fixtures/touch-targets.ts';
import { pageHref } from '../../src/core/api.ts';
import { STUDIO_ASK } from '../../src/lab/fixtures/studio-film.ts';
import {
  ASK_AT_REST,
  ASK_READY,
  SLOW,
  PHONE,
  DEVICES,
  asked,
  byPlace,
  STATES,
} from './studio-states.ts';

const SETTLE_MS = 5_000;

const WHERE = { screen: 'first screen', page: 'page' } as const;

const withinBudget = (
  page: Tab,
  budget: number,
  view: string,
  reach: 'screen' | 'page' = 'screen',
  within = WAIT_MS,
) =>
  Effect.gen(function* () {
    yield* page.clock.fastForward(SETTLE_MS);
    const now = firstScreenItems(reach);
    yield* page.until(`${now}.length <= ${budget}`, {
      now,
      within,
      say: (found) =>
        `${view} shows more than ${budget} things on its ${WHERE[reach]} at rest: ${found}`,
    });
  });

const PLANT = (tag: 'button' | 'p') =>
  `for (let i = 0; i <= ${ASK_AT_REST.phone}; i++) { const el = document.createElement('${tag}'); el.textContent = 'planted ' + i; Object.assign(el.style, { position: 'fixed', top: (120 + (i % 20) * 24) + 'px', left: (16 + Math.floor(i / 20) * 120) + 'px', zIndex: '999' }); document.body.append(el); }`;

const plant = (page: Tab, tag: 'button' | 'p') =>
  page.evaluate(`(() => { ${PLANT(tag)} return true; })()`);

const plantLater = (page: Tab, tag: 'button' | 'p') =>
  page.evaluate(`(() => { setTimeout(() => { ${PLANT(tag)} }, 2000); return true; })()`);

const CEILING = 200;

const ask = asked(pageHref.ask(STUDIO_ASK), ASK_READY);

for (const device of DEVICES) {
  describe(`the targets each view shows at rest on ${device.name} (UR2-17)`, () => {
    for (const [state, budget] of byPlace(STATES).flatMap(([, s]) =>
      Option.toArray(Option.map(Option.fromUndefinedOr(s.budget), (b) => [s, b] as const)),
    )) {
      it.live(
        `${state.name}: at most ${budget[device.budget]}`,
        () =>
          Effect.gen(function* () {
            const page = yield* state.open(device.viewport);
            yield* withinBudget(page, budget[device.budget], `${state.name} on ${device.name}`);
          }).pipe(Effect.scoped),
        SLOW,
      );
    }
    for (const [state, page] of byPlace(STATES).flatMap(([, s]) =>
      Option.toArray(Option.map(Option.fromUndefinedOr(s.page), (b) => [s, b] as const)),
    )) {
      it.live(
        `${state.name}: at most ${page[device.budget]} over its whole length`,
        () =>
          Effect.gen(function* () {
            const opened = yield* state.open(device.viewport);
            yield* withinBudget(
              opened,
              page[device.budget],
              `${state.name} on ${device.name}`,
              'page',
            );
          }).pipe(Effect.scoped),
        SLOW,
      );
    }
  });
}

describe('the at-rest budget (UR2-17)', () => {
  for (const [tag, what] of [
    ['button', 'buttons'],
    ['p', 'lines of text'],
  ] as const) {
    it.live(
      `fails an ask on a phone with ${what} landing 2 s after the view is ready`,
      () =>
        Effect.gen(function* () {
          const page = yield* ask(PHONE.viewport);
          yield* withinBudget(page, ASK_AT_REST.phone, 'an ask');
          yield* plantLater(page, tag);
          const exit = yield* Effect.exit(
            withinBudget(page, ASK_AT_REST.phone, 'an ask, things landing late', 'screen', 0),
          );
          expect(Exit.isFailure(exit)).toBe(true);
        }).pipe(Effect.scoped),
      SLOW,
    );

    it.live(
      `fails an ask on a phone with ${what} planted past its budget`,
      () =>
        Effect.gen(function* () {
          const page = yield* ask(PHONE.viewport);
          yield* withinBudget(page, ASK_AT_REST.phone, 'an ask');
          yield* plant(page, tag);
          const exit = yield* Effect.exit(
            withinBudget(page, ASK_AT_REST.phone, 'an ask, planted', 'screen', 0),
          );
          expect(Exit.isFailure(exit)).toBe(true);
        }).pipe(Effect.scoped),
      SLOW,
    );
  }

  it.live(
    'counts lines planted below the first screen over the whole length, and not on the first screen',
    () =>
      Effect.gen(function* () {
        const page = yield* ask(PHONE.viewport);
        yield* withinBudget(page, ASK_AT_REST.phone, 'an ask');
        const ceiling = CEILING;
        yield* page.evaluate(
          `(() => { const box = document.createElement('div'); box.style.marginTop = '5000px'; for (let i = 0; i <= ${ceiling}; i++) { const el = document.createElement('p'); el.textContent = 'planted ' + i; box.append(el); } document.body.append(box); return true; })()`,
        );
        yield* withinBudget(page, ASK_AT_REST.phone, 'an ask, planted');
        const exit = yield* Effect.exit(withinBudget(page, ceiling, 'an ask, planted', 'page', 0));
        expect(Exit.isFailure(exit)).toBe(true);
      }).pipe(Effect.scoped),
    SLOW,
  );
});
