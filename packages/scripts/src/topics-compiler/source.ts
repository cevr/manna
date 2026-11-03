import { Effect, Option, Schema, SchemaGetter } from 'effect';

class TopicSourceError extends Schema.TaggedError<TopicSourceError>()('TopicSourceError', {
  file: Schema.String,
  message: Schema.String,
}) {}

const ScalarString = Schema.Union([Schema.String, Schema.Finite]).pipe(
  Schema.decodeTo(Schema.NonEmptyString, {
    decode: SchemaGetter.String(),
    encode: SchemaGetter.passthrough(),
  }),
);

const TopicFrontmatter = Schema.Struct({
  slug: ScalarString,
  title: ScalarString,
  status: Schema.Literals(['draft', 'approved']),
  aliases: Schema.optional(Schema.Array(ScalarString)),
  related: Schema.optional(Schema.Array(ScalarString)),
  catalog: Schema.optional(ScalarString),
});
type TopicFrontmatter = typeof TopicFrontmatter.Type;

export interface TopicSource {
  readonly file: string;
  readonly frontmatter: TopicFrontmatter;
  readonly body: string;
}

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/u;

const decodeFrontmatter = Schema.decodeUnknownEffect(TopicFrontmatter);

export const parseTopicSource = Effect.fn('TopicsCompiler.parseTopicSource')(function* (
  file: string,
  contents: string,
) {
  const match = Option.fromNullOr(FRONTMATTER.exec(contents));
  if (Option.isNone(match)) {
    return yield* TopicSourceError.make({ file, message: 'missing YAML frontmatter' });
  }
  const [, yaml = '', body = ''] = match.value;
  const raw = yield* Effect.try({
    try: () => Bun.YAML.parse(yaml),
    catch: (cause) => TopicSourceError.make({ file, message: `invalid YAML: ${String(cause)}` }),
  });
  const frontmatter = yield* decodeFrontmatter(raw).pipe(
    Effect.mapError((cause) =>
      TopicSourceError.make({ file, message: `invalid frontmatter: ${cause.message}` }),
    ),
  );
  return { file, frontmatter, body } satisfies TopicSource;
});
