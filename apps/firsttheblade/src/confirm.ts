/**
 * Confirming in place: the confirm page's form posted from the page, which
 * opens on a skeleton of the notice to come (`./ui/mail.tsx`), and the page
 * the answer leads to (confirmed, or an expired link's notice) drawn over the
 * skeleton, keeping the wheat every notice shows, its words arriving in the
 * staged entrance `.confirm-arrived` plays. The skeleton holds for at least
 * `HOLD`, so a fast answer reads as a step and not a flicker. The address bar takes
 * the drawn page's canonical path, so a reload shows that page and never
 * posts the used token again. Loaded only on the confirm page
 * (`./client.tsx`); a post that fails or an answer it cannot draw is left to
 * the form, submitted as a browser would.
 */
import { Clock, Duration, Effect, Option } from 'effect';
import { FetchHttpClient, HttpClient, HttpClientRequest } from 'effect/http';

const LOST = '.lost';
/** The wheat every notice shows, kept in place as the words around it change. */
const WHEAT = '.wheat';

/** The least time the skeleton shows before the answer's words arrive. */
const HOLD = Duration.millis(600);

const drawnOf = (html: string) =>
  Effect.sync(() => new DOMParser().parseFromString(html, 'text/html'));

const draw = (shown: Element, next: Document) =>
  Effect.gen(function* () {
    const drawn = yield* Effect.fromNullishOr(next.querySelector(LOST));
    const canonical = yield* Effect.fromNullishOr(next.querySelector('link[rel="canonical"]'));
    const path = new URL(canonical.getAttribute('href') ?? '', location.origin).pathname;
    Option.match(
      Option.all([
        Option.fromNullishOr(shown.querySelector(WHEAT)),
        Option.fromNullishOr(drawn.querySelector(WHEAT)),
      ]),
      {
        onNone: () => {},
        onSome: ([wheat, nextWheat]) => nextWheat.replaceWith(wheat),
      },
    );
    shown.replaceChildren(...drawn.childNodes);
    shown.removeAttribute('aria-busy');
    shown.classList.add('confirm-arrived');
    document.title = next.title;
    history.replaceState(history.state, '', path);
  });

export const confirmInPlace = (form: HTMLFormElement) =>
  Effect.gen(function* () {
    const shown = yield* Effect.fromNullishOr(document.querySelector(LOST));
    const opened = yield* Clock.currentTimeMillis;
    const client = yield* HttpClient.HttpClient;
    const answer = yield* client.execute(
      HttpClientRequest.post(location.href).pipe(
        HttpClientRequest.bodyFormData(new FormData(form)),
      ),
    );
    const next = yield* drawnOf(yield* answer.text);
    const shownFor = Duration.millis((yield* Clock.currentTimeMillis) - opened);
    yield* Effect.sleep(Duration.subtract(HOLD, Duration.min(HOLD, shownFor)));
    yield* draw(shown, next);
  }).pipe(
    Effect.catch(() => Effect.sync(() => form.requestSubmit())),
    Effect.provide(FetchHttpClient.layer),
  );
