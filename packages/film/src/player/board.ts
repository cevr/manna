// The Board a render page draws (`film render --board`, `boardFilm`): the
// film's `board.json` and the try each picture panel shows, every one decoded
// before the first frame, read from the page's server at `boardUrls` (the
// app's server answers them, `boardFile`). A record or an image the page
// cannot read fails the page, naming it: a Board render draws every kept try
// or none.

import { Effect, Option, Schema } from 'effect';
import { HttpClient } from 'effect/http';
import { type BoardFile, BoardFileJson, shownTry } from '../core/board.ts';
import { boardUrls } from '../core/board-render.ts';
import { BoardUnreadable } from '../core/errors.ts';
import type { BoardImage } from '../canvas/board.ts';

/** A film's Board as the page draws it: the record, and each shown try's image by its file. */
interface LoadedBoard {
  readonly board: BoardFile;
  readonly images: ReadonlyMap<string, BoardImage>;
}

/** The bytes at `url`, read through the page's client; any failure or non-2xx status is `BoardUnreadable`. */
const bytesAt = (film: string, url: string) =>
  Effect.gen(function* () {
    const unreadable = (reason: string) => BoardUnreadable.make({ film, url, reason });
    const http = yield* HttpClient.HttpClient;
    const res = yield* Effect.mapError(http.get(url), (e) => unreadable(e.message));
    if (res.status < 200 || res.status >= 300) return yield* unreadable(`status ${res.status}`);
    return yield* Effect.mapError(res.arrayBuffer, (e) => unreadable(e.message));
  });

/** Film `id`'s Board: its record, and the image of each picture panel's shown try, decoded. */
export const loadBoard = (
  id: string,
): Effect.Effect<LoadedBoard, BoardUnreadable, HttpClient.HttpClient> =>
  Effect.gen(function* () {
    const at = boardUrls(id);
    const text = new TextDecoder().decode(yield* bytesAt(id, at.record));
    const board = yield* Effect.mapError(Schema.decodeEffect(BoardFileJson)(text), (e) =>
      BoardUnreadable.make({ film: id, url: at.record, reason: e.message }),
    );
    const files = board.panels.flatMap((p) =>
      Option.toArray(
        Option.map(
          Option.filter(shownTry(p), () => p.text === undefined),
          (t) => t.file,
        ),
      ),
    );
    const decoded = yield* Effect.forEach(
      files,
      (file) =>
        Effect.flatMap(bytesAt(id, at.image(file)), (bytes) =>
          Effect.map(
            Effect.tryPromise({
              try: () => createImageBitmap(new Blob([bytes])),
              catch: (e) =>
                BoardUnreadable.make({ film: id, url: at.image(file), reason: String(e) }),
            }),
            (image) => [file, image] as const,
          ),
        ),
      { concurrency: 4 },
    );
    return { board, images: new Map(decoded) };
  });
