import { Array as Arr, Boolean as Bool, Effect, Option, Predicate, Result, Schema } from 'effect';
import { type Ask, type AskKeeps, recommendedPath, untypedKeeps } from './ask.ts';
import { CRITIQUE_ASPECTS } from './critique.ts';
import { fnv1a } from './random.ts';

const EVIDENCE_DIR = 'review';
export const EVIDENCE_FILE = `${EVIDENCE_DIR}/evidence.json`;
export const EVIDENCE_PAGE = `${EVIDENCE_DIR}/evidence.md`;

const ReviewCrop = Schema.Struct({
  at: Schema.String,
  figure: Schema.String,
  concept: Schema.String,
  drawn: Schema.String,
  side: Schema.String,
});

export const ReviewFinding = Schema.Struct({
  id: Schema.String,
  at: Schema.String,
  figure: Schema.String,
  aspect: Schema.Literals(CRITIQUE_ASPECTS),
  what: Schema.String,
  where: Schema.optionalKey(Schema.String),
  done: Schema.optionalKey(Schema.String),
});
export type ReviewFinding = typeof ReviewFinding.Type;

const ReviewSkip = Schema.Struct({ at: Schema.String, reason: Schema.String });

const Review = Schema.Struct({
  id: Schema.String,
  film: Schema.String,
  scene: Schema.String,
  key: Schema.String,
  figure: Schema.optionalKey(Schema.String),
  made: Schema.String,
  places: Schema.Array(Schema.String),
  crops: Schema.Array(ReviewCrop),
  findings: Schema.Array(ReviewFinding),
  skipped: Schema.Array(ReviewSkip),
});
type Review = typeof Review.Type;

export const ReviewRecord = Schema.Struct({ reviews: Schema.Array(Review) });
export type ReviewRecord = typeof ReviewRecord.Type;

export const ReviewRecordJson = Schema.fromJsonString(ReviewRecord);

export const findingId = (
  film: string,
  scene: string,
  finding: Pick<ReviewFinding, 'at' | 'figure' | 'aspect' | 'what'>,
): string =>
  `f${fnv1a([film, scene, finding.at, finding.figure, finding.aspect, finding.what].join('\n'))
    .toString(16)
    .padStart(8, '0')}`;

export const nextReviewId = (record: ReviewRecord): string => `r${record.reviews.length + 1}`;

const sameFigure = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase();

export const appended = (record: ReviewRecord, review: Review): ReviewRecord => {
  const done = new Map(
    record.reviews.flatMap((r) =>
      r.findings.flatMap((f) =>
        Option.match(Option.fromUndefinedOr(f.done), {
          onNone: () => [],
          onSome: (d) => [[f.id, d] as const],
        }),
      ),
    ),
  );
  return {
    reviews: [
      ...record.reviews,
      {
        ...review,
        findings: review.findings.map((f) =>
          Option.match(Option.fromUndefinedOr(done.get(f.id)), {
            onNone: () => f,
            onSome: (d) => ({ ...f, done: d }),
          }),
        ),
      },
    ],
  };
};

interface Kept {
  readonly which: string;
  readonly keeps: AskKeeps;
}

export const keptOn = (ask: Ask): ReadonlyArray<Kept> =>
  recommendedPath(ask).flatMap((r) =>
    Option.match(
      Option.filter(
        Option.fromUndefinedOr(r.option.keeps),
        (keeps) => r.option.outcome === 'keep' && keeps.scenes.length > 0,
      ),
      {
        onNone: () => [],
        onSome: (keeps) => [
          { which: `step ${r.step}: ${r.choose} recommends ${r.option.value}`, keeps },
        ],
      },
    ),
  );

export const typingProblems = (
  ask: Ask,
  production: string,
  productionFilm: Option.Option<string>,
): ReadonlyArray<string> => [
  ...untypedKeeps(ask),
  ...keptOn(ask).flatMap(({ which, keeps }) =>
    Option.match(productionFilm, {
      onNone: () => [],
      onSome: (film) =>
        Bool.match(keeps.film === film, {
          onTrue: () => [],
          onFalse: () => [
            `${which}: it keeps ${keeps.film}, and production ${production} is the film ${film}`,
          ],
        }),
    }),
  ),
];

const newestOf = (
  record: ReviewRecord,
  film: string,
  scene: string,
  figure: Option.Option<string>,
): Option.Option<Review> =>
  Arr.findLast(
    record.reviews,
    (r) =>
      r.film === film &&
      r.scene === scene &&
      Option.match(figure, {
        onNone: () => Predicate.isUndefined(r.figure) && r.crops.length > 0,
        onSome: (f) => r.crops.some((c) => sameFigure(c.figure, f)),
      }),
  );

export const evidenceProblems = (
  record: ReviewRecord,
  keeps: AskKeeps,
  now: ReadonlyMap<string, string>,
): ReadonlyArray<string> =>
  Arr.dedupe(
    keeps.scenes.flatMap(({ scene, figures }) =>
      Option.match(Option.fromUndefinedOr(figures), {
        onNone: () => [Option.none<string>()],
        onSome: (named) => named.map(Option.some),
      }).flatMap((figure) => {
        const what = Option.match(figure, {
          onNone: () => `${keeps.film} ${scene} over every figure`,
          onSome: (f) => `${f} in ${keeps.film} ${scene}`,
        });
        return Option.match(newestOf(record, keeps.film, scene, figure), {
          onNone: () => [
            `no review of ${what}: run film review ${keeps.film} --set <set> --scene ${scene} --at <place> --at <place>${Option.match(figure, { onNone: () => '', onSome: (f) => ` --figure ${f}` })}`,
          ],
          onSome: (review) => [
            ...Option.match(Option.fromUndefinedOr(now.get(scene)), {
              onNone: () => [`scene ${scene} is no scene of ${keeps.film} now`],
              onSome: (key) =>
                Bool.match(key === review.key, {
                  onTrue: () => [],
                  onFalse: () => [
                    `${keeps.film} ${scene} changed since review ${review.id} (key ${review.key.slice(0, 12)}, now ${key.slice(0, 12)}): run film review again`,
                  ],
                }),
            }),
            ...review.findings
              .filter((f) =>
                Option.match(figure, {
                  onNone: () => true,
                  onSome: (named) => sameFigure(f.figure, named),
                }),
              )
              .filter((f) => Predicate.isUndefined(f.done))
              .map(
                (f) =>
                  `finding ${f.id} of review ${review.id} (${f.figure} ${f.aspect} at ${scene} ${f.at}: ${f.what}) has nothing done: fix it, then film review ${keeps.film} --set <set> --done ${f.id} --did "<what was done>"`,
              ),
          ],
        });
      }),
    ),
  );

const reviewMarkdown = (r: Review): ReadonlyArray<string> => [
  `## ${r.id}: ${r.film} ${r.scene}${Option.match(Option.fromUndefinedOr(r.figure), { onNone: () => '', onSome: (f) => `, ${f}` })}`,
  '',
  `Taken ${r.made} at ${r.places.join(', ')}, over the scene's sources at key ${r.key.slice(0, 12)} all through.`,
  '',
  '### Crops at 1:1',
  '',
  ...r.crops.map(
    (c) => `- ${c.at}, ${c.figure}: \`${c.concept}\`, \`${c.drawn}\`, side by side \`${c.side}\``,
  ),
  '',
  '### Findings',
  '',
  ...Arr.match(r.findings, {
    onEmpty: () => ['No finding.'],
    onNonEmpty: (all) =>
      all.map(
        (f) =>
          `- \`${f.id}\` ${f.at}, ${f.figure}, **${f.aspect}**: ${f.what}${Option.match(Option.fromUndefinedOr(f.where), { onNone: () => '', onSome: (w) => ` (${w})` })}. Done: ${f.done ?? 'nothing yet'}`,
      ),
  }),
  ...Arr.match(r.skipped, {
    onEmpty: () => [],
    onNonEmpty: (all) => [
      '',
      '### Skipped critiques',
      '',
      ...all.map((s) => `- ${s.at}: ${s.reason}`),
    ],
  }),
  '',
];

export const evidenceMarkdown = (record: ReviewRecord): string =>
  ['# Reviews', '', ...Arr.reverse(record.reviews).flatMap(reviewMarkdown)].join('\n');

export const cropFile = (
  review: string,
  scene: string,
  at: string,
  figure: string,
  kind: 'concept' | 'scene' | 'side',
): string =>
  `${EVIDENCE_DIR}/crops/${review}/${scene}.${at.replace(/[^A-Za-z0-9.-]+/g, '-')}.${figure}.${kind}.png`;

export const answered = (
  record: ReviewRecord,
  id: string,
  done: string,
): Result.Result<ReviewRecord, string> => {
  const ids = Arr.dedupe(record.reviews.flatMap((r) => r.findings.map((f) => f.id)));
  if (done.trim() === '') return Result.fail(`what was done is words: finding ${id}, "${done}"`);
  if (!ids.includes(id))
    return Result.fail(
      `the record holds no finding ${id}: it holds ${Arr.match(ids, { onEmpty: () => 'none', onNonEmpty: (all) => all.join(', ') })}`,
    );
  return Result.succeed({
    reviews: record.reviews.map((r) => ({
      ...r,
      findings: r.findings.map((f) =>
        Bool.match(f.id === id, { onTrue: () => ({ ...f, done }), onFalse: () => f }),
      ),
    })),
  });
};

class ReviewSceneChanged extends Schema.TaggedError<ReviewSceneChanged>()('ReviewSceneChanged', {
  before: Schema.String,
  after: Schema.String,
}) {
  override get message() {
    return `film review: the scene changed during the review (key ${this.before.slice(0, 12)} before its first place, ${this.after.slice(0, 12)} after its last): run film review again`;
  }
}

export const keyHeld = <A, E, R, E2, R2>(
  keyNow: Effect.Effect<string, E2, R2>,
  places: Effect.Effect<A, E, R>,
) =>
  Effect.gen(function* () {
    const before = yield* keyNow;
    const taken = yield* places;
    const after = yield* keyNow;
    if (before !== after) return yield* ReviewSceneChanged.make({ before, after });
    return { key: before, taken };
  });
