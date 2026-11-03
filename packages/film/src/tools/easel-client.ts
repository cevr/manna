import { Effect, Option, Schema } from 'effect';
import * as HttpApiClient from 'effect/http-api/HttpApiClient';
import { LabHttpApi, ToolFailure } from '../core/api.ts';
import { LabDown, LookInvalid, LookPost, ToolFailed } from '../core/easel.ts';
import { MatchPost } from '../core/match.ts';

const encodeFailure = Schema.encodeUnknownOption(Schema.fromJsonString(ToolFailure));

/**
 * A failure as `--json` prints it, one JSON line in the one shape a tool
 * decodes (`ToolFailure`): a route's refusal exactly as the route answered
 * it, a tool's own as itself, and any other as `ToolFailed` (its tag and
 * its words).
 */
export const failureJson = (error: { readonly _tag: string; readonly message: string }): string =>
  Option.getOrElse(encodeFailure(error), () =>
    Option.getOrElse(
      encodeFailure(ToolFailed.make({ failed: error._tag, reason: error.message })),
      () => '',
    ),
  );

/** A look as it will be sent, or why it cannot be: a request the route would refuse unread. */
const sendable = (post: LookPost) =>
  Schema.encodeEffect(LookPost)(post).pipe(
    Effect.mapError((error) => LookInvalid.make({ reason: error.message })),
  );

/**
 * The look `post` of `film` asked of the lab at `url` (`LooksGroup`): the
 * stills it wrote and their build, its refusal as itself, `LookInvalid` when
 * the request cannot be sent at all (no lab is asked), or `LabDown` when no
 * lab answered, or one answered with no look (a lab older than the asker).
 */
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

/**
 * The match `post` of `film` asked of the lab at `url` (`MatchesGroup`):
 * each figure's table and side-by-side, its refusal as itself, `LookInvalid`
 * when the request cannot be sent, or `LabDown` when no lab answered, or one
 * answered with no match (a lab older than the asker).
 */
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
