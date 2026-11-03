import { Option, Schema } from 'effect';

const REQUIREMENTS = ['drawn', 'kept', 'cut', 'bars', 'fit'] as const;
export const Requirement = Schema.Literals(REQUIREMENTS);
export type Requirement = typeof Requirement.Type;

export const CutKind = Schema.Literals(['puppet', 'key']);
export type CutKind = typeof CutKind.Type;

const Need = Schema.Struct({
  script: Schema.String,
  beats: Schema.Array(Schema.String),
});
interface Need extends Schema.Schema.Type<typeof Need> {}

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

export const Coverage = Schema.Struct({
  member: Schema.String,
  entries: Schema.Array(Entry),
  clips: Schema.optionalKey(Schema.Array(Clip)),
  cutters: Schema.optionalKey(Schema.Array(Schema.String)),
});
export interface Coverage extends Schema.Schema.Type<typeof Coverage> {}

export type EntryFacts = { readonly [R in Requirement]: boolean } & {
  readonly unmeasured?: ReadonlyArray<Requirement>;
};

interface EntryReport {
  readonly id: string;
  readonly cut: CutKind;
  readonly missing: ReadonlyArray<Requirement>;
  readonly unmeasured: ReadonlyArray<Requirement>;
  readonly trainable: boolean;
}

interface CoverageReport {
  readonly member: string;
  readonly complete: boolean;
  readonly entries: ReadonlyArray<EntryReport>;
}

const requirementsOf = (cut: CutKind): ReadonlyArray<Requirement> => HELD_TO[cut];

const HELD_TO = {
  key: ['drawn', 'kept'],
  puppet: REQUIREMENTS,
} satisfies { readonly [C in CutKind]: ReadonlyArray<Requirement> };

const TRAIN_NEEDS: ReadonlyArray<Requirement> = ['drawn', 'kept', 'cut', 'fit'];

const trainableOf = (
  entry: { readonly cut: CutKind; readonly fitted?: string },
  missing: ReadonlyArray<Requirement>,
): boolean =>
  entry.cut === 'puppet' &&
  Option.isNone(Option.fromUndefinedOr(entry.fitted)) &&
  !TRAIN_NEEDS.some((r) => missing.includes(r));

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
