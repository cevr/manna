// A cast member's coverage: every drawing the cast pipeline needs of him,
// named once in his `cutout/coverage.ts` (`COVERAGE`), each a puppet view
// (cut into parts, posed and trained on) or a drawn key (shown whole on
// twos, never posed), and the rule that says what each still lacks.
//
// An entry is complete when it is drawn and kept, and a puppet also cut, its
// part sheet's bars passed and its fit rows passed: the library's readiness.
// A puppet entry cut from its own sheet is trainable when it is drawn, kept,
// cut and its fit rows pass: the reader needs a puppet that poses as its
// sheet does, and the bars judge the laid paint for a film frame, not that.
// The facts come from `coverage-facts.ts`; this module is pure.

import { Option, Schema } from 'effect';

/** What an entry needs, in the order a report names it. */
const REQUIREMENTS = ['drawn', 'kept', 'cut', 'bars', 'fit'] as const;
export const Requirement = Schema.Literals(REQUIREMENTS);
export type Requirement = typeof Requirement.Type;

/** A drawing cut into parts and posed (`puppet`), or shown whole on twos (`key`). */
export const CutKind = Schema.Literals(['puppet', 'key']);
export type CutKind = typeof CutKind.Type;

/** Why a drawing is needed: a script and the beats of it that draw it. */
const Need = Schema.Struct({
  script: Schema.String,
  beats: Schema.Array(Schema.String),
});
interface Need extends Schema.Schema.Type<typeof Need> {}

/**
 * One drawing a member needs. `id` is a puppet view's `<kind>-<view>` as
 * `concept parts` names it, or a key's `<family>/<key>`; `file` is the
 * drawing, from the member's folder. `fitted` names the puppet entry a pose
 * is fitted from, whose cut it is posed with; `why` says, for a key, the
 * measure that keeps it from being a puppet.
 */
export const Entry = Schema.Struct({
  id: Schema.String,
  cut: CutKind,
  family: Schema.optionalKey(Schema.String),
  between: Schema.optionalKey(Schema.Tuple([Schema.String, Schema.String])),
  fitted: Schema.optionalKey(Schema.String),
  file: Schema.String,
  for: Schema.Array(Need),
  why: Schema.optionalKey(Schema.String),
});
export interface Entry extends Schema.Schema.Type<typeof Entry> {}

/**
 * A clip the reader is scored on (`eval:clip:<id>`, `concept reader
 * chain`): its file, from the member's folder; the bands of frames (first
 * and last, inclusive) its report means over beside the whole clip, and for
 * each band the entries it may name; and how it is made (`clip:<id>`,
 * `clips.ts`): the entries its first and last frames are drawn from, the
 * prompt and the seed of its fal call. Its frames, provenance and mp4 lie
 * beside each other: `<file stem>.first.png`, `.last.png`, `.json`.
 */
const Clip = Schema.Struct({
  id: Schema.String,
  file: Schema.String,
  bands: Schema.Array(Schema.Tuple([Schema.Finite, Schema.Finite])),
  expect: Schema.Array(Schema.Array(Schema.String)),
  given: Schema.Struct({ first: Schema.String, last: Schema.optionalKey(Schema.String) }),
  prompt: Schema.String,
  seed: Schema.Int,
});
export interface Clip extends Schema.Schema.Type<typeof Clip> {}

/**
 * A member's manifest: every drawing the pipeline needs of him, the clips his
 * reader is scored on, and, for a member cut with no repaint, his own cutters:
 * the scripts (from his folder, run with bun in order) that write his part
 * sheets in place of `concept parts`, so his parts stages ask no okra. Each
 * takes one argument, the sheets folder to write (and a later one to read),
 * which the build makes a scratch folder and holds to his committed
 * `cutout/sheets`. A cutter reads its kept drawings by importing them as
 * files, so its import closure holds every input of its stage.
 */
export const Coverage = Schema.Struct({
  member: Schema.String,
  entries: Schema.Array(Entry),
  clips: Schema.optionalKey(Schema.Array(Clip)),
  cutters: Schema.optionalKey(Schema.Array(Schema.String)),
});
export interface Coverage extends Schema.Schema.Type<typeof Coverage> {}

/** What is known of one entry; a requirement whose stage has no result for the current inputs is false and `unmeasured`. */
export type EntryFacts = { readonly [R in Requirement]: boolean } & {
  readonly unmeasured?: ReadonlyArray<Requirement>;
};

interface EntryReport {
  readonly id: string;
  readonly cut: CutKind;
  readonly missing: ReadonlyArray<Requirement>;
  readonly unmeasured: ReadonlyArray<Requirement>;
  /** Whether the reader's training set takes this entry's shard (`trainableOf`). */
  readonly trainable: boolean;
}

interface CoverageReport {
  readonly member: string;
  readonly complete: boolean;
  readonly entries: ReadonlyArray<EntryReport>;
}

/** The requirements an entry of this cut is held to. */
const requirementsOf = (cut: CutKind): ReadonlyArray<Requirement> => HELD_TO[cut];

const HELD_TO = {
  key: ['drawn', 'kept'],
  puppet: REQUIREMENTS,
} satisfies { readonly [C in CutKind]: ReadonlyArray<Requirement> };

/** What a puppet entry needs to be trained on: all but its bars. */
const TRAIN_NEEDS: ReadonlyArray<Requirement> = ['drawn', 'kept', 'cut', 'fit'];

/**
 * Whether the training set takes an entry: a puppet cut from its own sheet
 * that misses none of `TRAIN_NEEDS`. A key is never posed, so never trained
 * on. A fitted entry (`fitted`) yields no shard: its parts are its source
 * view's and its pose lies in that view's range, so the reader names the
 * source view for it.
 */
const trainableOf = (
  entry: { readonly cut: CutKind; readonly fitted?: string },
  missing: ReadonlyArray<Requirement>,
): boolean =>
  entry.cut === 'puppet' &&
  Option.isNone(Option.fromUndefinedOr(entry.fitted)) &&
  !TRAIN_NEEDS.some((r) => missing.includes(r));

/** Each entry's unmet requirements, in order, and whether it is trained on; an entry with no facts misses them all. */
export const coverageOf = (
  coverage: {
    readonly member: string;
    readonly entries: ReadonlyArray<{
      readonly id: string;
      readonly cut: CutKind;
      readonly fitted?: string;
    }>;
  },
  facts: Readonly<Record<string, EntryFacts>>,
): CoverageReport => {
  const entries = coverage.entries.map((entry) => {
    const known = Option.fromNullishOr(facts[entry.id]);
    const missing = requirementsOf(entry.cut).filter((r) => !Option.exists(known, (f) => f[r]));
    const unmeasured = missing.filter((r) =>
      Option.exists(known, (f) =>
        Option.exists(Option.fromNullishOr(f.unmeasured), (u) => u.includes(r)),
      ),
    );
    return {
      id: entry.id,
      cut: entry.cut,
      missing,
      unmeasured,
      trainable: trainableOf(entry, missing),
    };
  });
  return {
    member: coverage.member,
    complete: entries.every((e) => e.missing.length === 0),
    entries,
  };
};
