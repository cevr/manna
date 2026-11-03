import { Effect, Match, Option, Schema } from 'effect';
import * as Tool from 'effect/ai/Tool';
import { ChangeId } from '../core/schema.ts';
import { BeatEdits, type Edited } from './beat-edits.ts';
import { onlyTracks } from '../core/film-timeline.ts';
import { seamsAround } from '../core/beat-edit.ts';
import { FilmTimeline, Track } from '../core/timeline-schema.ts';
import { LabLinks } from '../core/lab-events.ts';
import { FilmTimelines } from './film-timeline.ts';
import { LabAddress, labCommand } from './lab-command.ts';
import { FilmParam, LabRefused, refused } from './lab-mcp-parts.ts';

const TimelineRead = Schema.Struct({
  ...FilmTimeline.fields,
  lab: LabLinks,
});

const TimelineTool = Tool.make('timeline', {
  description:
    "A film's timeline at one version: each stage of the flow that has material is a lane of clips on the film's clock (script beats, Board panels on their marks, takes, scenes, score movements, renders), each with its start and length in seconds, its state (made, kept, approved) and its clock (`estimated`: words at the reading pace, no take yet). Beside it: the act bands, the flags of what waits on the owner (open asks, his notes not yet done) at their times, each of the nine stages reached, a gap or ahead, the Next row (the first stage ahead and what starts it), and the header (the stage, what waits on him). `version` (a number) reads another version; the production's open one when left out. `tracks` keeps only those lanes.",
  parameters: Schema.Struct({
    ...FilmParam.fields,
    version: Schema.optionalKey(
      Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)).annotate({
        description: "The version's number (the production's open one when left out).",
      }),
    ),
    tracks: Schema.optionalKey(Schema.Array(Track)),
  }),
  success: TimelineRead,
  failure: LabRefused,
}).annotate(Tool.Readonly, true);

const EditRead = Schema.Struct({
  change: Schema.optionalKey(ChangeId),
  target: Schema.String,
  said: Schema.String,
  seams: Schema.optionalKey(
    Schema.Array(Schema.Struct({ from: Schema.String, to: Schema.String, seconds: Schema.Finite })),
  ),
});

const VersionParam = Schema.optionalKey(
  Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)).annotate({
    description:
      "The version whose script is edited, by its number (the production's open one when left out).",
  }),
);

const ByParam = Schema.String.check(Schema.isNonEmpty(), Schema.isMaxLength(80)).annotate({
  description: 'Who you are: the work the edit files on the ledger names you.',
});

const BeatMoveTool = Tool.make('beat_move', {
  description:
    "Move a beat of a version's script before another beat, or to the end (`before` left out): one write of the script's beats order through the lab's history (`undo` undoes it). Refused when the move is no move or would put an act or a score movement before the one declared ahead of it. The film follows on its next read (later beats, their Board panels, scenes and movements move with their beats); a film with a production gets \"re-time, re-check seams, re-render\" filed on its ledger while the move stands. Answers the change's id, what it set and what it says.",
  parameters: Schema.Struct({
    ...FilmParam.fields,
    version: VersionParam,
    beat: Schema.String.annotate({ description: 'The beat to move, by its id.' }),
    before: Schema.optionalKey(
      Schema.String.annotate({ description: 'The beat it goes before; the end when left out.' }),
    ),
    by: ByParam,
  }),
  success: EditRead,
  failure: LabRefused,
});

const BeatHoldTool = Tool.make('beat_hold', {
  description:
    "Set a beat's hold: `lead` (the time before its words) or `tail` (the time after them) held `seconds`, snapped to 0.1 s and kept at or above its floor (lead 0.5 s, tail 0.1 s, or less when the beat already holds less); a tail on 0.1 s is the default and is written as none. Refused when it would change nothing the film plays: a beat with no words, or a tail its `min` absorbs. One write of the script through the lab's history, filed on the ledger as `beat_move` is. Answers the change's id, what it set, what it says, and the seams into and out of the beat as the version reads after it, each from the end of a beat's take to the next beat's words (`film check` measures a seam from the last word heard).",
  parameters: Schema.Struct({
    ...FilmParam.fields,
    version: VersionParam,
    beat: Schema.String.annotate({ description: 'The beat whose hold is set, by its id.' }),
    edge: Schema.Literals(['lead', 'tail']),
    seconds: Schema.Finite.annotate({ description: 'The hold, in seconds.' }),
    by: ByParam,
  }),
  success: EditRead,
  failure: LabRefused,
});

const UndoTool = Tool.make('undo', {
  description:
    "Undo the film's newest change in the lab's one history (every agent's edits), or, given `change` (an id an edit answered), that change only: refused when another change stands before it, so an older step is never undone past a newer one. Withdraws the work its edit filed on the ledger. Answers what it undid.",
  parameters: Schema.Struct({
    ...FilmParam.fields,
    change: Schema.optionalKey(ChangeId),
  }),
  success: EditRead,
  failure: LabRefused,
});

const editRead = (edited: Edited) => ({
  ...Option.match(edited.change, { onNone: () => ({}), onSome: (c) => ({ change: c.id }) }),
  target: edited.target,
  said: edited.said,
});

const scriptLane = (timeline: FilmTimeline) =>
  timeline.lanes.flatMap((lane) =>
    Match.value(lane).pipe(
      Match.when({ track: 'script' }, (l) => l.clips),
      Match.orElse(() => []),
    ),
  );

export const timelineCommands = [
  labCommand(BeatMoveTool, {
    run: ({ film, version, beat, before, by }) =>
      Effect.gen(function* () {
        const edits = yield* BeatEdits;
        const moved = yield* refused(
          edits.move({
            film,
            version: Option.fromUndefinedOr(version),
            beat,
            before: Option.fromUndefinedOr(before),
            by,
          }),
        );
        return editRead(moved);
      }),
  }),
  labCommand(BeatHoldTool, {
    run: ({ film, version, beat, edge, seconds, by }) =>
      Effect.gen(function* () {
        const edits = yield* BeatEdits;
        const timelines = yield* FilmTimelines;
        const held = yield* refused(
          edits.hold({ film, version: Option.fromUndefinedOr(version), beat, edge, seconds, by }),
        );
        const after = yield* refused(timelines.timeline(film, Option.fromUndefinedOr(version)));
        return { ...editRead(held), seams: seamsAround(scriptLane(after), beat) };
      }),
  }),
  labCommand(UndoTool, {
    run: ({ film, change }) =>
      Effect.gen(function* () {
        const edits = yield* BeatEdits;
        const undone = yield* refused(
          edits.undo(
            film,
            Option.match(Option.fromUndefinedOr(change), {
              onNone: () => ({}),
              onSome: (c) => ({ change: c }),
            }),
          ),
        );
        return editRead(undone);
      }),
  }),
  labCommand(TimelineTool, {
    run: ({ film, version, tracks }) =>
      Effect.gen(function* () {
        const timelines = yield* FilmTimelines;
        const lab = yield* LabAddress;
        const read = yield* refused(timelines.timeline(film, Option.fromUndefinedOr(version)));
        return { ...onlyTracks(read, Option.fromUndefinedOr(tracks)), lab };
      }),
  }),
];
