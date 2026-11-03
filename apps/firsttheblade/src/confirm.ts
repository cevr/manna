import { Clock, Duration, Effect, Option } from 'effect';
import { FetchHttpClient, HttpClient, HttpClientRequest } from 'effect/http';

const LOST = '.lost';
const WHEAT = '.wheat';

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
