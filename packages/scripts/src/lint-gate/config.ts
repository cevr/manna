import { Array as Arr, Effect, Option, Schema } from 'effect';

const JUDGED = 'judged';

const NATIVE_DEFAULT = ['eslint', 'oxc', 'unicorn', 'typescript'];

const Rules = Schema.Record(Schema.String, Schema.Unknown);
const Rest = [Schema.Record(Schema.String, Schema.Unknown)] as const;
const Names = Schema.Array(Schema.String);

const none = <A>(): Effect.Effect<ReadonlyArray<A>> => Effect.succeed([]);

const Override = Schema.StructWithRest(
  Schema.Struct({
    files: Names,
    rules: Rules.pipe(Schema.withDecodingDefaultKey(Effect.succeed({}))),
    plugins: Names.pipe(Schema.withDecodingDefaultKey(none<string>())),
    jsPlugins: Names.pipe(Schema.withDecodingDefaultKey(none<string>())),
  }),
  Rest,
);

export const LintConfig = Schema.StructWithRest(
  Schema.Struct({
    plugins: Names.pipe(Schema.withDecodingDefaultKey(none<string>())),
    jsPlugins: Names.pipe(Schema.withDecodingDefaultKey(none<string>())),
    rules: Rules.pipe(Schema.withDecodingDefaultKey(Effect.succeed({}))),
    overrides: Schema.Array(Override).pipe(
      Schema.withDecodingDefaultKey(none<typeof Override.Encoded>()),
    ),
  }),
  Rest,
);
export type LintConfig = typeof LintConfig.Type;

const pluginOf = (rule: string) =>
  Option.getOrElse(Arr.head(rule.split('/').slice(0, -1)), () => 'eslint');

const keepRules = (rules: typeof Rules.Type, keep: (rule: string) => boolean) =>
  Object.fromEntries(Object.entries(rules).filter(([rule]) => keep(rule)));

const rewrite = (
  config: LintConfig,
  keep: (rule: string) => boolean,
  jsPlugins: (plugins: ReadonlyArray<string>) => ReadonlyArray<string>,
): LintConfig => ({
  ...config,
  jsPlugins: jsPlugins(config.jsPlugins),
  rules: keepRules(config.rules, keep),
  overrides: config.overrides.map((override) => ({
    ...override,
    rules: keepRules(override.rules, keep),
    jsPlugins: jsPlugins(override.jsPlugins),
  })),
});

export const nativeOnly = (config: LintConfig): LintConfig => {
  const native = new Set([
    ...NATIVE_DEFAULT,
    ...config.plugins,
    ...config.overrides.flatMap((override) => override.plugins),
  ]);
  return rewrite(
    config,
    (rule) => native.has(pluginOf(rule)),
    () => [],
  );
};

const relocated = (absolute: (plugin: string) => string) => (plugin: string) => {
  if (plugin.startsWith('.')) return absolute(plugin);
  return plugin;
};

export const withoutJudged = (
  config: LintConfig,
  judgedPlugin: string,
  absolute: (plugin: string) => string,
): LintConfig =>
  rewrite(
    config,
    (rule) => pluginOf(rule) !== JUDGED,
    (plugins) => plugins.filter((plugin) => plugin !== judgedPlugin).map(relocated(absolute)),
  );

export const Kept = Schema.Struct({
  key: Schema.String,
  files: Schema.Record(Schema.String, Schema.String),
});
export type Kept = typeof Kept.Type;

const holds = (kept: Kept, key: string, file: string, hash: string) =>
  kept.key === key && Option.contains(Option.fromUndefinedOr(kept.files[file]), hash);

export const unkept = (kept: Kept, key: string, hashes: ReadonlyMap<string, string>) =>
  [...hashes].filter(([file, hash]) => !holds(kept, key, file, hash)).map(([file]) => file);

export const keptAfter = (
  kept: Kept,
  key: string,
  hashes: ReadonlyMap<string, string>,
  passed: ReadonlyArray<string>,
): Kept => {
  const still = [...hashes].filter(([file, hash]) => holds(kept, key, file, hash));
  const now = passed.flatMap((file) =>
    Option.toArray(
      Option.map(Option.fromUndefinedOr(hashes.get(file)), (hash) => [file, hash] as const),
    ),
  );
  return { key, files: Object.fromEntries([...still, ...now]) };
};

const fileOf = (line: string) =>
  Option.flatMap(Option.fromNullishOr(/^([^:\s][^:]*):\d+:\d+: /.exec(line)), (match) =>
    Option.fromUndefinedOr(match[1]),
  );

export const passedOf = (files: ReadonlyArray<string>, code: number, report: string) => {
  if (code === 0) return files;
  const named = new Set(report.split('\n').flatMap((line) => Option.toArray(fileOf(line))));
  const ours = files.filter((file) => named.has(file));
  if (code !== 1 || ours.length === 0) return [];
  return files.filter((file) => !named.has(file));
};
