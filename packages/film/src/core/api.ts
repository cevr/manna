// The lab's HTTP routes, declared once: every path, its params, query, body
// and answer, and every failure with its status. The server derives its
// handlers from it (`tools/lab.ts`, `tools/studio.ts`, `tools/review-http.ts`,
// `tools/asks-http.ts`, composed in `tools/api-server.ts`), and the pages
// their clients and URLs (`lab/api.ts` and its siblings), so a route cannot
// be written two ways.
//
// One API, `LabHttpApi`, served by `film lab` for every film: what the ask
// pages read and answer (a film's script and Board, a series' drafts, a
// beat's attempts, the renders, the asks) and the easel's looks and matches.
// Every route is under `/api/` (`API`), where no page path is: a film's
// under `/api/films/<film>/`, and the routes of no one film (the renders'
// index and files, a frame, a length, the pages' build) under
// `/api/review/`. A film the app does not have is a 404 FilmUnknown.
//
// A failure crosses as its own class, JSON with its `_tag`, at the status
// `Refusals` gives it: the one status table. Anything a handler fails with
// that is not a Refusal answers 500 as ServerFailed, with its tag and words;
// a request whose params, query or body does not decode answers 400 as
// RequestInvalid, naming the part and why; a path under the API's own
// prefixes that no route declares answers 404 as RouteUnknown.
//
// To add an endpoint: declare it in its group below with `error: Refusals`
// (a new failure class goes into `Refusals` with its status), implement it
// in the group's `HttpApiBuilder.group` in tools, and call it on the page
// through the derived client. packages/film/README.md has the steps.

import { Codec, Field, Place } from '@manna/url-state';
import { Array as Arr, Option, Schema, SchemaAST } from 'effect';
import * as HttpApi from 'effect/http-api/HttpApi';
import * as HttpApiClient from 'effect/http-api/HttpApiClient';
import * as HttpApiEndpoint from 'effect/http-api/HttpApiEndpoint';
import * as HttpApiGroup from 'effect/http-api/HttpApiGroup';
import * as HttpApiSchema from 'effect/http-api/HttpApiSchema';
import { BoardFile } from './board.ts';
import { AskName, AskRecord, AsksPage, StepValues } from './ask.ts';
import { OpId, Project } from './catalogue.ts';
import { WaitTimeout } from './wait.ts';
import { UnknownAct, UnknownScene, UnknownVoice } from './errors.ts';
import {
  LabDown,
  LabElsewhere,
  LookFailed,
  LookInvalid,
  LookLevelUnknown,
  LookOutOfRange,
  LookPlaceUnknown,
  LookPost,
  LookTaken,
  PagesBroken,
  ToolFailed,
} from './easel.ts';
import { MatchFigureUnknown, MatchPost, MatchTaken } from './match.ts';
import {
  CounselFailed,
  CounselUnreadable,
  JudgeNothingToCompare,
  JudgePointAmbiguous,
  JudgePointUnjudged,
  JudgeRuleMissing,
} from './judge.ts';
import { ReviewDuration, ReviewIndex, ReviewVideo } from './review.ts';
import {
  AttemptUnknown,
  AudioInvalid,
  BodyTooLarge,
  CatalogueInvalid,
  ChoiceUnknown,
  DraftUnknown,
  DraftUnread,
  ElevenLabsFailed,
  FilmUnknown,
  FilmVersionUnkept,
  FilmVersionUnknown,
  FreshProcessFailed,
  MediaFailed,
  NoteAnswered,
  NoteNotFound,
  AskRefused,
  AskUnknown,
  PhoneCopyFailed,
  PhoneCopyUnmade,
  RecordingInvalid,
  RecordingLossy,
  RedoUnavailable,
  ReviewFileUnknown,
  ReviewToolFailed,
  SceneNotLocated,
  SceneNotRendered,
  SourceChanged,
  HoldUnchanged,
  SourceRefused,
  SourceShared,
  StepNotNewest,
  StagingCapReached,
  StagingTakeUnknown,
  StillUnknown,
  SttUntimed,
  TakeMismatch,
  TakeUnknown,
  TimelineUnresolved,
  UndoUnavailable,
  VariantUnknown,
  VerbRefused,
  VersionChanged,
  VersionMoved,
  BoardFileUnknown,
  BoardRefused,
} from './refusals.ts';
import { LabWrite, PageBuild, TakeWord } from './schema.ts';
import { Segment } from './segment.ts';
import { StudioAttempts } from './studio.ts';
import { LineRead, Mark } from './delivery.ts';

// ---------------------------------------------------------------------------
// The failures only the transport has.

/**
 * A request the server does not answer at all: a Host it is not bound to or
 * told, another site's page, or a write from an Origin not its own.
 */
export class RequestRefused extends Schema.TaggedError<RequestRefused>()('RequestRefused', {
  reason: Schema.String,
}) {
  override get message() {
    return this.reason;
  }
}

/**
 * A request whose params, query or body does not decode as its route
 * declares: which part, and the schema's words for why.
 */
export class RequestInvalid extends Schema.TaggedError<RequestInvalid>()('RequestInvalid', {
  part: Schema.String,
  reason: Schema.String,
}) {
  override get message() {
    return `the request's ${this.part.toLowerCase()} does not decode: ${this.reason}`;
  }
}

/** A path under the API's own prefix that no route declares: an endpoint the page calls that the server does not have. */
export class RouteUnknown extends Schema.TaggedError<RouteUnknown>()('RouteUnknown', {
  path: Schema.String,
}) {
  override get message() {
    return `the lab has no route ${this.path}`;
  }
}

/** A write whose body is not JSON: a cross-site form can post text/plain without a preflight. */
export class WriteNotJson extends Schema.TaggedError<WriteNotJson>()('WriteNotJson', {
  type: Schema.String,
}) {
  override get message() {
    return `a write must send application/json, not ${this.type}`;
  }
}

/**
 * A failure no route declares, answered 500 so no request hangs: the tag it
 * failed with, for the log, and its words, which the page shows.
 */
export class ServerFailed extends Schema.TaggedError<ServerFailed>()('ServerFailed', {
  tag: Schema.String,
  reason: Schema.String,
}) {
  override get message() {
    return this.reason;
  }
}

// ---------------------------------------------------------------------------
// The one status table.

const status = HttpApiSchema.status;

/**
 * Every failure a route answers with, at its status: a thing the film or the
 * review does not have 404; a request that is not one 400; another site or
 * host 403; a write against a newer file, or a verb its variant's state
 * refuses, 409; a body over the limit 413; a body of the wrong type 415; an edit or a
 * take the lab will not make 422; a staging take past the day's cap 429; a
 * tool or a service that failed 502; the rest 500.
 */
const Refusals = [
  NoteNotFound.pipe(status(404)),
  NoteAnswered.pipe(status(409)),
  AskUnknown.pipe(status(404)),
  SceneNotLocated.pipe(status(404)),
  FilmUnknown.pipe(status(404)),
  FilmVersionUnknown.pipe(status(404)),
  FilmVersionUnkept.pipe(status(404)),
  ChoiceUnknown.pipe(status(404)),
  VariantUnknown.pipe(status(404)),
  TakeUnknown.pipe(status(404)),
  SceneNotRendered.pipe(status(404)),
  UnknownAct.pipe(status(404)),
  ReviewFileUnknown.pipe(status(404)),
  PhoneCopyUnmade.pipe(status(404)),
  StillUnknown.pipe(status(404)),
  BoardFileUnknown.pipe(status(404)),
  AttemptUnknown.pipe(status(404)),
  UnknownScene.pipe(status(404)),
  RouteUnknown.pipe(status(404)),
  LookPlaceUnknown.pipe(status(404)),
  LookLevelUnknown.pipe(status(404)),
  MatchFigureUnknown.pipe(status(404)),
  StagingTakeUnknown.pipe(status(404)),
  DraftUnknown.pipe(status(404)),
  AudioInvalid.pipe(status(400)),
  RequestInvalid.pipe(status(400)),
  LookInvalid.pipe(status(400)),
  RequestRefused.pipe(status(403)),
  UndoUnavailable.pipe(status(409)),
  RedoUnavailable.pipe(status(409)),
  StepNotNewest.pipe(status(409)),
  SourceChanged.pipe(status(409)),
  VerbRefused.pipe(status(409)),
  VersionChanged.pipe(status(409)),
  VersionMoved.pipe(status(409)),
  LabElsewhere.pipe(status(409)),
  AskRefused.pipe(status(409)),
  BodyTooLarge.pipe(status(413)),
  WriteNotJson.pipe(status(415)),
  RecordingLossy.pipe(status(415)),
  SourceRefused.pipe(status(422)),
  HoldUnchanged.pipe(status(422)),
  DraftUnread.pipe(status(422)),
  BoardRefused.pipe(status(422)),
  SourceShared.pipe(status(422)),
  TimelineUnresolved.pipe(status(422)),
  TakeMismatch.pipe(status(422)),
  RecordingInvalid.pipe(status(422)),
  PhoneCopyFailed.pipe(status(422)),
  UnknownVoice.pipe(status(422)),
  LookOutOfRange.pipe(status(422)),
  PagesBroken.pipe(status(422)),
  StagingCapReached.pipe(status(429)),
  ReviewToolFailed.pipe(status(502)),
  MediaFailed.pipe(status(502)),
  FreshProcessFailed.pipe(status(502)),
  ElevenLabsFailed.pipe(status(502)),
  SttUntimed.pipe(status(502)),
  LookFailed.pipe(status(502)),
  CatalogueInvalid.pipe(status(500)),
  ServerFailed.pipe(status(500)),
] as const;

/** Any failure a route answers with. */
export const Refusal = Schema.Union(Refusals);
export type Refusal = typeof Refusal.Type;

/**
 * A failure as a film tool prints it (`film lab look --json`, `film judge
 * --json`): a route's refusal exactly as the route answers it (tagged, its
 * fields), or the tool's own (no lab answering, the judge's), or
 * `ToolFailed` for any other. One shape for a tool to decode, whichever
 * side failed.
 */
export const ToolFailure = Schema.Union([
  ...Refusals,
  LabDown,
  ToolFailed,
  JudgePointUnjudged,
  JudgeNothingToCompare,
  JudgePointAmbiguous,
  JudgeRuleMissing,
  CounselFailed,
  CounselUnreadable,
]);
export type ToolFailure = typeof ToolFailure.Type;

/** Whether `u` is a failure a route answers with (else it answers ServerFailed). */
export const isRefusal = Schema.is(Refusal);

const annotatedStatus = SchemaAST.resolveAt<number>('httpApiStatus');

/** The status `refusal` answers with, as `Refusals` gives it. */
export const statusOf = (refusal: Refusal): number => {
  for (const schema of Refusals)
    if (Schema.is(schema)(refusal)) return annotatedStatus(schema.ast) ?? 500;
  return 500;
};

// ---------------------------------------------------------------------------
// The groups.

/**
 * A beat of a film's script as the words reader reads it beside the staged
 * film: what the film plays leaves it out (`scenesOf`), so it comes from the
 * script as it stands: the picture's brief and the beat's sources.
 */
const ScriptBeat = Schema.Struct({
  id: Schema.String,
  /** Its line as the script says it, marks and cues in braces; none for a beat that says nothing (left out by an older lab). */
  say: Schema.optionalKey(Schema.String),
  /** What the picture does, as the script says it; none where it says nothing. */
  picture: Schema.optionalKey(Schema.String),
  /** The cast members the picture draws, by their cast-sheet folder ids; none where it names none. */
  cast: Schema.optionalKey(Schema.Array(Schema.String)),
  /** The beat's sources, as the script cites them. */
  cite: Schema.Array(Schema.String),
});
export type ScriptBeat = typeof ScriptBeat.Type;

/**
 * `GET /api/films/<film>/script`: each beat of the film's `script.ts` in its
 * order, as the file stands now (`film read script`, run fresh); no beats for
 * a film that keeps no script.
 */
export const ScriptBeats = Schema.Struct({
  film: Schema.String,
  beats: Schema.Array(ScriptBeat),
});
export type ScriptBeats = typeof ScriptBeats.Type;

/**
 * A beat's staging take as the Script reader shows it: ready (its audio,
 * served by `GET …/script/takes/:file`, its length and where each word is
 * heard in it), being voiced, not voiced (the lab keeps none ready:
 * `FILM_STAGING_FILL` off), or refused (the day's cap, a failed request).
 */
export const StagingTake = Schema.Union([
  Schema.TaggedStruct('Ready', {
    file: Schema.String,
    duration: Schema.Finite,
    words: Schema.Array(TakeWord),
  }),
  Schema.TaggedStruct('Voicing', {}),
  Schema.TaggedStruct('Unvoiced', {}),
  Schema.TaggedStruct('Refused', { reason: Schema.String }),
]).pipe(Schema.toTaggedUnion('_tag'));
export type StagingTake = typeof StagingTake.Type;

/**
 * `GET /api/films/<film>/script/voice`: each spoken beat's staging take, in
 * the voice and marks the script has now, and the day's staging spend in
 * characters against its cap.
 */
export const ScriptVoice = Schema.Struct({
  film: Schema.String,
  spent: Schema.Int,
  cap: Schema.Int,
  beats: Schema.Array(Schema.Struct({ id: Schema.String, take: StagingTake })),
});
export type ScriptVoice = typeof ScriptVoice.Type;

/**
 * `POST /api/films/<film>/script/marks` (and a draft's): a beat's delivery
 * marks as they should read, its words unchanged, and the line the page
 * read when it made them (`read`: its words as the voice says them and
 * their marks). A write replaces the line's every mark, and a mark is on a
 * word by its index, so a write is refused once the line says other words
 * or carries other marks: the page reads it again rather than mark the
 * wrong word or write over marks made elsewhere. `read` is optional only so
 * a tab older than the lab (which sent none) is refused with words that
 * say to reload, not a payload that does not decode; it never writes.
 */
export const MarksPost = Schema.Struct({
  beat: Schema.String,
  marks: Schema.Array(Mark),
  read: Schema.optionalKey(LineRead),
});
export type MarksPost = typeof MarksPost.Type;

/**
 * `GET /api/series`: the app's series and their drafts, as the lab lists them
 * beside the films: each series by its folder's name and its plan's title,
 * each draft by its file's name and its own title.
 */
export const SeriesList = Schema.Struct({
  series: Schema.Array(
    Schema.Struct({
      name: Schema.String,
      title: Schema.String,
      drafts: Schema.Array(Schema.Struct({ name: Schema.String, title: Schema.String })),
    }),
  ),
});
export type SeriesList = typeof SeriesList.Type;

/**
 * A beat of a series draft as the Script reader reads it (`core/draft.ts`):
 * its id (a talk's row number, a film's beat id), its label, its line with
 * its marks, what its picture does and its sources.
 */
const DraftBeatRead = Schema.Struct({
  id: Schema.String,
  label: Schema.String,
  /** Its line, marks and cues in braces; none for a beat that says nothing. */
  say: Schema.optionalKey(Schema.String),
  brief: Schema.optionalKey(Schema.String),
  cite: Schema.Array(Schema.String),
});
export type DraftBeatRead = typeof DraftBeatRead.Type;

/**
 * `GET /api/series/<series>/<draft>`: the draft's beats as its Markdown
 * stands now; and what a mark write answers, the draft as it leaves it.
 */
export const DraftRead = Schema.Struct({
  series: Schema.String,
  draft: Schema.String,
  title: Schema.String,
  beats: Schema.Array(DraftBeatRead),
});
export type DraftRead = typeof DraftRead.Type;

/**
 * What the owner says of a variant, a scene's render, an act or the film:
 * approve it as it is now, withdraw every approval of it, or comment on it.
 * A withdraw `given` an approve's op (its `Project.gave.op`) withdraws only
 * the approvals that approve gave: its exact undo, leaving every other
 * approval alone, another's given at the very same moment too. The one say
 * both the choices and the project take.
 */
export const Say = Schema.Union([
  Schema.TaggedStruct('Approve', {}),
  Schema.TaggedStruct('Withdraw', { given: Schema.OptionFromOptionalKey(OpId) }),
  Schema.TaggedStruct('Comment', { text: Schema.String.check(Schema.isNonEmpty()) }),
]).pipe(Schema.toTaggedUnion('_tag'));
export type Say = typeof Say.Type;

/** `POST /api/films/<film>/choices/say`: a say on one variant of one point, as it is now. */
export const SayPost = Schema.Struct({ point: Schema.String, variant: Schema.String, say: Say });
export type SayPost = typeof SayPost.Type;

/** A file answered as it lies (a still, a take, a render, a mix): its type is the file's. */
const FileBytes = Schema.Uint8Array.pipe(HttpApiSchema.asUint8Array());

const film = { film: Schema.String };

/** Where every route of the API lives: no page path starts with it. */
const API = '/api';
/** One film's routes. */
const FILM = `${API}/films/:film`;
/** The routes of no one film: the renders under the roots, and the pages' build. */
const REVIEW = `${API}/review`;

/**
 * The film's script as the words reader reads it: each beat's line, picture
 * and sources, each beat's staging take and its audio, and a beat's delivery
 * marks written.
 */
class ScriptGroup extends HttpApiGroup.make('script').add(
  HttpApiEndpoint.get('beats', `${FILM}/script`, {
    params: film,
    success: ScriptBeats,
    error: Refusals,
  }),
  HttpApiEndpoint.get('voice', `${FILM}/script/voice`, {
    params: film,
    success: ScriptVoice,
    error: Refusals,
  }),
  HttpApiEndpoint.get('take', `${FILM}/script/takes/:file`, {
    params: { ...film, file: Schema.String },
    success: FileBytes,
    error: Refusals,
  }),
  HttpApiEndpoint.post('marks', `${FILM}/script/marks`, {
    params: film,
    payload: MarksPost,
    success: LabWrite,
    error: Refusals,
  }),
) {}

/** One series draft's routes. */
const DRAFT = `${API}/series/:series/:draft`;
const draftParams = { series: Schema.String, draft: Schema.String };

/**
 * The series drafts as the Script reader reads them beside the films: every
 * series and its drafts, a draft's beats, each spoken beat's staging take
 * and its audio (the films' staging voice and cache), and a beat's delivery
 * marks written into the draft's Markdown.
 */
class SeriesGroup extends HttpApiGroup.make('series').add(
  HttpApiEndpoint.get('list', `${API}/series`, { success: SeriesList, error: Refusals }),
  HttpApiEndpoint.get('read', DRAFT, { params: draftParams, success: DraftRead, error: Refusals }),
  HttpApiEndpoint.get('voice', `${DRAFT}/voice`, {
    params: draftParams,
    success: ScriptVoice,
    error: Refusals,
  }),
  HttpApiEndpoint.get('take', `${DRAFT}/takes/:file`, {
    params: { ...draftParams, file: Schema.String },
    success: FileBytes,
    error: Refusals,
  }),
  HttpApiEndpoint.post('marks', `${DRAFT}/marks`, {
    params: draftParams,
    payload: MarksPost,
    success: DraftRead,
    error: Refusals,
  }),
) {}

/** The panels of a film's Board drawn from what has changed since (its picture's words, a cast sheet), each with why in a sentence. */
const BoardStale = Schema.Struct({
  panels: Schema.Array(Schema.Struct({ panel: Schema.String, why: Schema.String })),
});

/**
 * The film's storyboard (`core/board.ts`, `film board`) as an ask shows it:
 * the record, the panels it would draw again, and an image of it.
 */
class BoardGroup extends HttpApiGroup.make('board').add(
  HttpApiEndpoint.get('read', `${FILM}/board`, {
    params: film,
    success: BoardFile,
    error: Refusals,
  }),
  /** Each panel `film board` would draw again, and why: the board store's judgment, the script read fresh. */
  HttpApiEndpoint.get('stale', `${FILM}/board/stale`, {
    params: film,
    success: BoardStale,
    error: Refusals,
  }),
  /** A board image, of version folder `?folder=v<n>`'s Board when given (`<film>/v<n>/board/`). */
  HttpApiEndpoint.get('file', `${FILM}/board/files/:file`, {
    params: { ...film, file: Schema.String },
    query: { folder: Schema.optionalKey(Segment) },
    success: FileBytes,
    error: Refusals,
  }),
) {}

/** A beat's recorded attempts, as an ask's take block plays them. */
class StudioGroup extends HttpApiGroup.make('studio').add(
  HttpApiEndpoint.get('attempts', `${FILM}/studio/takes/:beat/attempts`, {
    params: { ...film, beat: Schema.String },
    success: StudioAttempts,
    error: Refusals,
  }),
  HttpApiEndpoint.get('attempt', `${FILM}/studio/takes/:beat/attempts/:file`, {
    params: { ...film, beat: Schema.String, file: Schema.String },
    success: FileBytes,
    error: Refusals,
  }),
) {}

/** Where the review serves a file by its ref, and its phone copy: the rest of the path is the ref. */
export const REVIEW_FILES = `${REVIEW}/files/`;
export const REVIEW_PHONE = `${REVIEW}/phone/`;

/** The review: every folder with something to review, each file where it lies, a frame, a length. */
class ReviewGroup extends HttpApiGroup.make('review').add(
  HttpApiEndpoint.get('index', `${REVIEW}/index`, {
    query: { fresh: Schema.optionalKey(Schema.String) },
    success: ReviewIndex,
    error: Refusals,
  }),
  /** The file, its byte ranges answered 206 (a phone's video seeks). */
  HttpApiEndpoint.get('file', `${REVIEW_FILES}*`, { success: FileBytes, error: Refusals }),
  /** Its 720p phone copy, once made (404 before). */
  HttpApiEndpoint.get('phone', `${REVIEW_PHONE}*`, { success: FileBytes, error: Refusals }),
  /** A JPEG of the video at `t` s (10% in without), `w` px wide. */
  HttpApiEndpoint.get('frame', `${REVIEW}/frame`, {
    query: {
      ref: Schema.String,
      t: Schema.optionalKey(Schema.Finite),
      w: Schema.optionalKey(Schema.Finite),
    },
    success: FileBytes,
    error: Refusals,
  }),
  HttpApiEndpoint.get('duration', `${REVIEW}/duration`, {
    query: { ref: Schema.String },
    success: ReviewDuration,
    error: Refusals,
  }),
) {}

/** One section of an ask's page as sent: the step it answers and each answer's value by its name. */
const AskSectionPost = Schema.Struct({ step: AskName, values: StepValues });
type AskSectionPost = typeof AskSectionPost.Type;

/**
 * What an ask's page sends: each section it shows (`sectionsOf`), in order,
 * at least one. A page opened before the one-page ask (2026-10-15) sends
 * one step as it did (`{step, values}`), taken as one section, so a tab
 * left open across the change still sends. The forms are disjoint: the old
 * one carries no `sections`, so a body with sections that do not decode is
 * refused, never read as the old form with its sections dropped.
 */
const AskAnswerPost = Schema.Union([
  Schema.Struct({ sections: Schema.Array(AskSectionPost).check(Schema.isMinLength(1)) }),
  Schema.Struct({ ...AskSectionPost.fields, sections: Schema.optionalKey(Schema.Never) }),
]);
type AskAnswerPost = typeof AskAnswerPost.Type;

/** The sections an answer post carries: its own, or the one step an older page sends. */
export const sectionsPosted = (post: AskAnswerPost): ReadonlyArray<AskSectionPost> => {
  if ('step' in post) return [{ step: post.step, values: post.values }];
  return post.sections;
};

/**
 * The asks: an agent's decision pages (`core/ask.ts`), each read as its
 * record, or with every ask on its page (the asks made in sequence, in the
 * order made), and answered as one page, its sections in order; the answers
 * move its machine and are kept, so a reload or another device opens it
 * where it was left. Its images keep the receipt rule (`AskStore`'s
 * `receipted`): an image whose src the receipt names is served only as its
 * copy. Each file-served image of an image block or an option is copied as
 * the ask is made, or the make is refused (`AskRefused`, naming the src). A
 * board block's panels and a video's poster or frame show live and bind
 * nothing.
 */
class AsksGroup extends HttpApiGroup.make('asks').add(
  HttpApiEndpoint.get('read', `${API}/asks/:ask`, {
    params: { ask: Schema.String },
    success: AskRecord,
    error: Refusals,
  }),
  HttpApiEndpoint.get('page', `${API}/asks/:ask/page`, {
    params: { ask: Schema.String },
    success: AsksPage,
    error: Refusals,
  }),
  HttpApiEndpoint.post('answer', `${API}/asks/:ask/answer`, {
    params: { ask: Schema.String },
    payload: AskAnswerPost,
    success: AskRecord,
    error: Refusals,
  }),
  /** An image the ask shows, as the lab copied it when it made the ask (the receipt rule, above): `<sha256><.ext>`, one its receipt names, served only while it holds its hash. */
  HttpApiEndpoint.get('shown', `${API}/asks/:ask/shown/:file`, {
    params: { ask: Schema.String, file: Schema.String },
    success: FileBytes,
    error: Refusals,
  }),
) {}

/**
 * The project as the review page shows it: the project (`catalogue.ts`), the
 * review's ref of its folder when the review's roots hold it (the page's
 * compare link), and each rendered scene's video by scene id: this
 * checkout's catalogue record of it, its share copy standing in for its
 * master.
 */
export const ProjectView = Schema.Struct({
  project: Project,
  folder: Schema.OptionFromOptionalKey(Schema.String),
  videos: Schema.Record(Schema.String, ReviewVideo),
});
export type ProjectView = typeof ProjectView.Type;

/**
 * A look (`core/easel.ts`): stills of a scene as its sources stand, drawn by
 * a page the lab holds warm, written under the film's `out/<film>/look/` and
 * answered by their paths. A tool's call (`film lab look`), not a page's: it
 * writes files, never source, and waits for the pages' build of every save
 * made before it; a build that fails is answered as `PagesBroken`, its words.
 */
class LooksGroup extends HttpApiGroup.make('looks').add(
  HttpApiEndpoint.post('take', `${FILM}/looks`, {
    params: film,
    payload: LookPost,
    success: LookTaken,
    error: Refusals,
  }),
) {}

/**
 * A match (`core/match.ts`): a scene's figures at one place, each drawn by
 * the look's warm page, cropped by the box its rig declares and measured
 * against its concept (`core/figure.ts`), the tables and side-by-sides
 * written under the film's `out/<film>/match/` and answered with their
 * paths. A tool's call, as a look is, with a look's guarantees: the pages'
 * build of every save made before it, a failed one `PagesBroken`.
 */
class MatchesGroup extends HttpApiGroup.make('matches').add(
  HttpApiEndpoint.post('take', `${FILM}/matches`, {
    params: film,
    payload: MatchPost,
    success: MatchTaken,
    error: Refusals,
  }),
) {}

/**
 * The lab's own pages: a wait, held open up to `timeout` s (`WaitTimeout`),
 * that answers once a file the pages were built from changed past the build
 * the page was served (`since`), or once the track of `film` is mixed
 * (another film's mix wakes it not); at once when the page names another
 * `server` (the lab restarted). The page a failed build answers waits on it
 * and loads again once the pages build.
 */
class PageGroup extends HttpApiGroup.make('page').add(
  HttpApiEndpoint.get('wait', `${REVIEW}/build`, {
    query: {
      since: Schema.Finite,
      server: Schema.optionalKey(Schema.String),
      film: Schema.optionalKey(Schema.String),
      timeout: WaitTimeout,
    },
    success: PageBuild,
    error: Refusals,
  }),
) {}

/**
 * The lab's API, served by `film lab`: what the ask pages read and send (a
 * film's script and a series' drafts, its Board, a take's attempts, the
 * renders under the roots, the asks), and the easel's looks and matches.
 */
export class LabHttpApi extends HttpApi.make('lab')
  .add(ScriptGroup)
  .add(SeriesGroup)
  .add(BoardGroup)
  .add(StudioGroup)
  .add(ReviewGroup)
  .add(LooksGroup)
  .add(MatchesGroup)
  .add(PageGroup)
  .add(AsksGroup) {}

/** The first segments `api`'s routes live under (`/api/`): the API's own paths. */
export const prefixesOf = <Id extends string, Groups extends HttpApiGroup.Constraint>(
  api: HttpApi.HttpApi<Id, Groups>,
): ReadonlyArray<string> => {
  const prefixes = new Set<string>();
  HttpApi.reflect(api, {
    onGroup: () => {},
    onEndpoint: ({ endpoint }) => void prefixes.add(`/${endpoint.path.split('/')[1] ?? ''}/`),
  });
  return [...prefixes];
};

// ---------------------------------------------------------------------------
// The pages: every place a page is at, declared once as `@manna/url-state`
// Places. The path says what a view is about (an ask, a page of asks, a
// film's export), the query how it is shown (a still open full size). The
// server serves a page at each place's path (`pageAt`), every link is
// printed by `Place.href` over these (`pageHref`), and each page reads and
// writes its own through `UrlState`.

/** The lab's pages with a shell, each one HTML entry: its asks. */
export type PageName = 'ask';

/**
 * The pages the lab serves, each one HTML entry: the asks, and the render
 * page (a film with no chrome, whose handle the renderer and the easel
 * drive).
 */
export type AppPage = PageName | 'render';

/**
 * How often, at most, `#t=` follows a time that moves (play, a drag), in ms:
 * the window the player's writer holds to before it encodes a link (`tInUrl`,
 * `player/main.ts`).
 */
export const TIME_EVERY_MS = 250;

/** A film by its name: one path segment (a short's `/` is written `%2F`). */
const filmParams = { film: Codec.Segment };

/**
 * The still open full size (`?still=`): an ask's Board panel by its key. Its
 * opening is a step Back walks, as every sheet's is; none open is the page's first.
 */
const still = Field.key(Codec.Text, { default: '', history: 'push' });

/**
 * Every place a page is at. Home `/`, which the lab sends on to the newest
 * ask still asking (`tools/lab.ts`); an agent's ask and a page of asks; a
 * film's export page `/films/<film>/export`, the film staged with no chrome
 * and its handle on `window.__film` (`mountRender`), which the easel opens
 * (`film lab look`).
 */
export const Places = {
  home: Place.make({ path: '/' }),
  export: Place.make({ path: '/films/:film/export', params: filmParams }),
  /**
   * An agent's ask: the page of asks it is on (`core/ask.ts`), taken to this
   * one, each at the step its run is on; a Board still open full size.
   */
  ask: Place.make({
    path: '/asks/:ask',
    params: { ask: Codec.Segment },
    query: Field.struct({ still }),
  }),
  /**
   * A page of asks, by the ask that opened it: the asks made in sequence, in
   * the order made, taken to the first still asking; a Board still open full size.
   */
  askPage: Place.make({
    path: '/asks/page/:page',
    params: { page: Codec.Segment },
    query: Field.struct({ still }),
  }),
};

/** The page each place is served by, the first that holds a path winning. */
const PAGES: ReadonlyArray<readonly [Place.Place<unknown>, AppPage]> = [
  [Places.export, 'render'],
  [Places.ask, 'ask'],
  [Places.askPage, 'ask'],
];

/** The page `pathname` serves, if any: a path no place declares (a chunk, a typo, an old `/lab`) serves none. */
export const pageAt = (pathname: string): Option.Option<AppPage> =>
  Option.map(
    Arr.findFirst(PAGES, ([place]) => Option.isSome(Place.decode(place, pathname))),
    ([, page]) => page,
  );

/**
 * How the viewer's move from `from` to `to` enters history, as the place
 * `to` is on declares it (`Place.history`): a new path or a cited key is a
 * step Back walks, a refinement rewrites the entry. The one owner of the
 * policy: a page that moves for a reason names the reason (`addressOn`),
 * never the move, and a page that sets a place's value (`UrlState.set`/
 * `update`, `UrlAtom.place`) enters history by the same declaration. An
 * href off every place is a step.
 */
export const pageMove = (from: string, to: string): 'push' | 'replace' =>
  Option.match(
    Arr.findFirst(PAGES, ([place]) => Option.isSome(Place.decode(place, to))),
    {
      onNone: () => 'push',
      onSome: ([place]) => Place.history(place, from, to).history,
    },
  );

/** The film `href`'s path names (`/films/<film>/export`), if it names one. */
export const filmOfPage = (href: string): Option.Option<string> =>
  Option.map(Place.decode(Places.export, href), (v) => v.path.film);

/**
 * Every page's link, printed by its place (`Place.href`): the one printer of
 * a page path, so a link the app writes is one it reads back.
 */
export const pageHref = {
  home: (): string => Place.href(Places.home, { path: {}, query: {}, hash: {} }),
  /** An agent's ask: its page, taken to it. */
  ask: (ask: string): string =>
    Place.href(Places.ask, { path: { ask }, query: { still: '' }, hash: {} }),
  /** A page of asks, by the ask that opened it: taken to the first still asking. */
  askPage: (page: string): string =>
    Place.href(Places.askPage, { path: { page }, query: { still: '' }, hash: {} }),
  /** A film's export page: the render page, staged for the easel's stills. */
  export: (film: string): string =>
    Place.href(Places.export, { path: { film }, query: {}, hash: {} }),
};

// ---------------------------------------------------------------------------
// The URLs a page puts in an <img>, <audio> or <video>, derived from the routes.

/** Every route's URL, built from its declaration: the one way server, page and tests write a path. */
export const labUrls = HttpApiClient.urlBuilder(LabHttpApi);

/** An image of a film's board (a try, the style's reference), by its file name. */
export const boardFileUrl = (film: string, file: string, folder?: Segment): string =>
  labUrls.board.file({
    params: { film, file },
    query: Option.match(Option.fromUndefinedOr(folder), {
      onNone: () => ({}),
      onSome: (f) => ({ folder: f }),
    }),
  });

/** An image ask `ask` shows, by its copy's name (`<sha256><.ext>`): the bytes it was made with. */
export const askShownUrl = (ask: string, file: string): string =>
  labUrls.asks.shown({ params: { ask, file } });

/** A beat's recorded attempt's audio, to hear it again. */
export const attemptUrl = (film: string, beat: string, file: string): string =>
  labUrls.studio.attempt({ params: { film, beat, file } });

/** A beat's staging take's audio, by the name its `Ready` gives it. */
export const stagingTakeUrl = (film: string, file: string): string =>
  labUrls.script.take({ params: { film, file } });

/** A series draft's beat's staging take's audio, by the name its `Ready` gives it. */
export const draftTakeUrl = (series: string, draft: string, file: string): string =>
  labUrls.series.take({ params: { series, draft, file } });

/** A ref as a URL path: each segment encoded, the slashes kept. */
const refPath = (ref: string) =>
  ref
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');

/**
 * A ref's URL under a route that takes the rest of its path as the ref
 * (`REVIEW_FILES`, `REVIEW_PHONE`): the one way such a URL is written, since
 * the URL builder fills `:param`s and not a `*`.
 */
const refUrl = (at: typeof REVIEW_FILES | typeof REVIEW_PHONE, ref: string): string =>
  `${at}${refPath(ref)}`;

/** The review's URL for a file, by its ref. */
export const reviewFileUrl = (ref: string): string => refUrl(REVIEW_FILES, ref);

/** The review's URL for a video's 720p phone copy, by its ref. */
export const reviewPhoneUrl = (ref: string): string => refUrl(REVIEW_PHONE, ref);

/** A frame of a video, `w` px wide, at `t` s to the hundredth (10% in when none). */
export const reviewFrameUrl = (ref: string, t: Option.Option<number>, w: number): string => {
  const at = Option.match(t, { onNone: () => ({}), onSome: (s) => ({ t: Number(s.toFixed(2)) }) });
  return labUrls.review.frame({ query: { ref, w: Math.round(w), ...at } });
};
