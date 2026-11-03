import { Effect, Option, Schema } from 'effect';
import * as HttpApiClient from 'effect/http-api/HttpApiClient';
import { LabHttpApi, ToolFailure } from '../core/api.ts';
import { LabDown, LookInvalid, LookPost, ToolFailed } from '../core/easel.ts';
import { MatchPost } from '../core/match.ts';

const encodeFailure = Schema.encodeUnknownOption(Schema.fromJsonString(ToolFailure));

export const failureJson = (error: { readonly _tag: string; readonly message: string }): string =>
  Option.getOrElse(encodeFailure(error), () =>
    Option.getOrElse(
      encodeFailure(ToolFailed.make({ failed: error._tag, reason: error.message })),
      () => '',
    ),
  );

const sendable = (post: LookPost) =>
  Schema.encodeEffect(LookPost)(post).pipe(
    Effect.mapError((error) => LookInvalid.make({ reason: error.message })),
  );

export const takeLook = (url: string, film: string, post: LookPost) =>
  sendable(post).pipe(
    Effect.andThen(HttpApiClient.make(LabHttpApi, { baseUrl: url })),
    Effect.flatMap((client) => client.looks.take({ params: { film }, payload: post })),
    Effect.catchTags({
      HttpClientError: (error) => Effect.fail(LabDown.make({ url, reason: error.message })),
      SchemaError: (error) =>
        Effect.fail(
          LabDown.make({
            url,
            reason: `it answered no look (${error.message}); a lab older than this checkout needs a restart`,
          }),
        ),
    }),
  );

export const takeMatch = (url: string, film: string, post: MatchPost) =>
  Schema.encodeEffect(MatchPost)(post).pipe(
    Effect.mapError((error) => LookInvalid.make({ reason: error.message })),
    Effect.andThen(HttpApiClient.make(LabHttpApi, { baseUrl: url })),
    Effect.flatMap((client) => client.matches.take({ params: { film }, payload: post })),
    Effect.catchTags({
      HttpClientError: (error) => Effect.fail(LabDown.make({ url, reason: error.message })),
      SchemaError: (error) =>
        Effect.fail(
          LabDown.make({
            url,
            reason: `it answered no match (${error.message}); a lab older than this checkout needs a restart`,
          }),
        ),
    }),
  );
