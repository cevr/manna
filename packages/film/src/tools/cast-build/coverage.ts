// A cast member's coverage: every drawing the cast pipeline needs of him,
// named once in his `cutout/coverage.ts` (`COVERAGE`), each a puppet view
// (cut into parts, posed and trained on) or a drawn key (shown whole on
// twos, never posed), and the rule that says what each still lacks.
//
// An entry is complete when it is drawn and kept, and a puppet also cut, its
// part sheet's bars passed and its fit rows passed. The facts come from
// `coverage-facts.ts`; this module is pure.

import { Option, Schema } from 'effect';

/** What an entry needs, in the order a report names it. */
export const REQUIREMENTS = ['drawn', 'kept', 'cut', 'bars', 'fit'] as const;
export const Requirement = Schema.Literals(REQUIREMENTS);
export type Requirement = typeof Requirement.Type;

/** A drawing cut into parts and posed (`puppet`), or shown whole on twos (`key`). */
export const CutKind = Schema.Literals(['puppet', 'key']);
export type CutKind = typeof CutKind.Type;

/** Why a drawing is needed: a script and the beats of it that draw it. */
export const Need = Schema.Struct({
  script: Schema.String,
  beats: Schema.Array(Schema.String),
});
export interface Need extends Schema.Schema.Type<typeof Need> {}

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
 * chain`): its file, from the member's folder, and the bands of frames
 * (first and last, inclusive) its report means over beside the whole clip.
 */
export const Clip = Schema.Struct({
  id: Schema.String,
  file: Schema.String,
  bands: Schema.Array(Schema.Tuple([Schema.Finite, Schema.Finite])),
});
export interface Clip extends Schema.Schema.Type<typeof Clip> {}

/** A member's manifest: every drawing the pipeline needs of him, and the clips his reader is scored on. */
export const Coverage = Schema.Struct({
  member: Schema.String,
  entries: Schema.Array(Entry),
  clips: Schema.optionalKey(Schema.Array(Clip)),
});
export interface Coverage extends Schema.Schema.Type<typeof Coverage> {}

/** What is known of one entry; a requirement whose stage has no result for the current inputs is false and `unmeasured`. */
export type EntryFacts = { readonly [R in Requirement]: boolean } & {
  readonly unmeasured?: ReadonlyArray<Requirement>;
};

export interface EntryReport {
  readonly id: string;
  readonly cut: CutKind;
  readonly missing: ReadonlyArray<Requirement>;
  readonly unmeasured: ReadonlyArray<Requirement>;
}

export interface CoverageReport {
  readonly member: string;
  readonly complete: boolean;
  readonly entries: ReadonlyArray<EntryReport>;
}

/** The requirements an entry of this cut is held to. */
export const requirementsOf = (cut: CutKind): ReadonlyArray<Requirement> => HELD_TO[cut];

const HELD_TO = {
  key: ['drawn', 'kept'],
  puppet: REQUIREMENTS,
} satisfies { readonly [C in CutKind]: ReadonlyArray<Requirement> };

/** Each entry's unmet requirements, in order; an entry with no facts misses them all. */
export const coverageOf = (
  coverage: {
    readonly member: string;
    readonly entries: ReadonlyArray<{ readonly id: string; readonly cut: CutKind }>;
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
    return { id: entry.id, cut: entry.cut, missing, unmeasured };
  });
  return {
    member: coverage.member,
    complete: entries.every((e) => e.missing.length === 0),
    entries,
  };
};
