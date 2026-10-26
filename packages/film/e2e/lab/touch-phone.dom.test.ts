// The lab on a phone (390 × 844): every page fits (no sideways scroll, each
// control inside the width, its chrome at most a quarter of the height); a
// finger on a slider drags it from the top edge of its box.

import { Effect } from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import { pageHref } from '../../src/core/api.ts';
import { openAsk } from '../../src/lab/fixtures/harness.ts';
import { fitsPhone } from '../../src/lab/fixtures/phone-fit.ts';
import { waitFor } from '../../src/lab/fixtures/settled.ts';
import {
  STUDIO_ASK,
  STUDIO_GUIDED,
  STUDIO_PAGE,
  guidedRoutes,
  studioRoutes,
} from '../../src/lab/fixtures/studio-film.ts';
import { PHONE_HIT } from '../../src/lab/fixtures/touch-targets.ts';
import type { State, ByPlace } from './studio-states.ts';
import { SLOW, PHONE, byPlace, isAt, asked, ASK_READY, PAGE_READY } from './studio-states.ts';

describe('every page fits a phone, 390 × 844 (G8)', () => {
  /** A page: its name, how it opens, and the layer it opens, which is no chrome. */
  const PAGES: ByPlace<readonly [name: string, open: State['open'], layer?: string]> = {
    ask: [['an ask', asked(pageHref.ask(STUDIO_ASK), ASK_READY)]],
    askPage: [['a page of asks', asked(pageHref.askPage(STUDIO_PAGE), PAGE_READY)]],
  };
  for (const [place, [name, open, layer]] of byPlace(PAGES)) {
    it.live(
      `${name}: no sideways scroll, every control inside the width, chrome at most a quarter of the height`,
      () =>
        Effect.gen(function* () {
          const page = yield* open(PHONE.viewport);
          yield* isAt(page, place);
          yield* fitsPhone(page, layer);
        }).pipe(Effect.scoped),
      SLOW,
    );
  }
});

/** The guided ask's cut: its video, and the row its player shows once it has moved. */
const CUT = '.ak-step[data-step="cut"] [data-material="video"]';

describe('a finger on a slider', () => {
  // Serial: a finger's touches (`film/touches-serial`).
  it.scopedLive.serial(
    "drags an ask's video's scrub from the top edge of its box, where a finger meets it, not only on the track's line",
    () =>
      Effect.gen(function* () {
        const { page } = yield* openAsk([...guidedRoutes, ...studioRoutes], {
          href: pageHref.ask(STUDIO_GUIDED),
          viewport: PHONE.viewport,
        });
        yield* waitFor(page, ASK_READY);
        // The row stands once the video has moved: played, then paused at its start's side.
        yield* page.click(`${CUT} [data-act="play-video"]`);
        const slider = `${CUT} .rv-transport input[type="range"]`;
        yield* waitFor(page, slider);
        yield* page.click(`${CUT} .rv-transport [data-act="play"]`);
        yield* page.until(
          `(() => { const s = document.querySelector('${slider}'); return Number(s.max) > 1 && Number(s.value) < (Number(s.min) + Number(s.max)) / 2; })()`,
        );
        const box = yield* page.box(slider);
        // The box is a finger tall; the finger lands 2 px under its top, well off the 4 px track.
        expect(box.height).toBeGreaterThanOrEqual(PHONE_HIT);
        yield* page.finger.down(box.x + box.width * 0.1, box.y + 2);
        yield* page.finger.move(box.x + box.width * 0.8, box.y + 2, 20);
        // Held, the scrub shows the time dragged to: past the middle of the clip.
        yield* page.until(
          `(() => { const s = document.querySelector('${slider}'); return Number(s.value) > (Number(s.min) + Number(s.max)) / 2; })()`,
        );
        yield* page.finger.up;
      }),
    SLOW,
  );
});
