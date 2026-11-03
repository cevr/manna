import { Effect } from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import { pageHref } from '../../src/core/api.ts';
import { frameAtOrAfter } from '../../src/core/time.ts';
import { openRender } from '../../src/lab/fixtures/harness.ts';
import { CROWD, crowdFilm } from '../../src/lab/fixtures/crowd-film.ts';
import { evaluates } from '../../src/lab/fixtures/settled.ts';

describe("a film's export page", () => {
  it.live("installs the render page's handle for the film its path names", () =>
    Effect.gen(function* () {
      const { page, errors } = yield* openRender(pageHref.export(CROWD));
      const film = crowdFilm();
      yield* evaluates(page, 'window.__film.info.duration', film.duration);
      yield* evaluates(page, 'window.__film.info.frames', frameAtOrAfter(film.duration, film.fps));
      yield* evaluates(
        page,
        'window.__film.scenes().map((s) => s.id)',
        film.placed.map((p) => p.spec.id),
      );
      yield* evaluates(page, "document.body.classList.contains('export')", true);
      yield* evaluates(page, "document.querySelector('.bar, .sh-header') === null", true);
      expect(errors).toEqual([]);
    }).pipe(Effect.scoped),
  );
});
