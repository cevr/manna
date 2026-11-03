import { Effect, Option, Record } from 'effect';
import { HttpServerResponse } from 'effect/http';
import * as HttpApiBuilder from 'effect/http-api/HttpApiBuilder';
import { LabHttpApi, sectionsPosted } from '../core/api.ts';
import { answered } from './api-server.ts';
import { AskStore } from './ask-store.ts';
import { CACHE } from './review-file.ts';

const IMAGE_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  avif: 'image/avif',
};

const typeOf = (name: string): string =>
  Option.getOrElse(
    Record.get(IMAGE_TYPES, (name.split('.').at(-1) ?? '').toLowerCase()),
    () => 'application/octet-stream',
  );

export const asksGroup = HttpApiBuilder.group(LabHttpApi, 'asks', (handlers) =>
  handlers
    .handle('read', ({ params }) =>
      answered(Effect.flatMap(AskStore, (asks) => asks.read(params.ask))),
    )
    .handle('page', ({ params }) =>
      answered(Effect.flatMap(AskStore, (asks) => asks.page(params.ask))),
    )
    .handle('answer', ({ params, payload }) =>
      answered(
        Effect.flatMap(AskStore, (asks) => asks.answerPage(params.ask, sectionsPosted(payload))),
      ),
    )
    .handle('shown', ({ params }) =>
      answered(
        Effect.map(
          Effect.flatMap(AskStore, (asks) => asks.shownFile(params.ask, params.file)),
          ({ name, bytes }) =>
            HttpServerResponse.uint8Array(bytes, {
              contentType: typeOf(name),
              headers: { 'cache-control': CACHE.hashed },
            }),
        ),
      ),
    ),
);
