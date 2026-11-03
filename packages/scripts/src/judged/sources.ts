import { Glob } from 'bun';
import { Console, Effect, FileSystem, Option, Path, Schema } from 'effect';

import { gateFiles } from '../guard/files.js';
import { makersHash, textHash } from './findings.js';
import { type Item, type Selector, itemsOf, markdownBeats, parse, selects } from './items.js';
import { type JudgedRule, ruleKey } from './rule.js';
import { cacheKey } from './store.js';

interface SourceItem extends Item {
  readonly selector: Selector;
  readonly file: string;
}

interface TreeItem {
  readonly rule: JudgedRule;
  readonly file: string;
  readonly line: number;
  readonly start: number;
  readonly key: string;
}

const MemoItem = Schema.Struct({
  rule: Schema.String,
  line: Schema.Finite,
  start: Schema.Finite,
  key: Schema.String,
});

const Memo = Schema.fromJsonString(
  Schema.Struct({
    form: Schema.String,
    files: Schema.Record(
      Schema.String,
      Schema.Struct({ hash: Schema.String, items: Schema.Array(MemoItem) }),
    ),
  }),
);

type Memo = typeof Memo.Type;

class ItemsMoved extends Schema.TaggedError<ItemsMoved>()('ItemsMoved', { file: Schema.String }) {
  override get message() {
    return `${this.file} changed while the judged lint read it`;
  }
}

const TYPESCRIPT = /\.[cm]?tsx?$/;

const linted = (file: string, ignored: ReadonlyArray<Glob>) =>
  (file.endsWith('.md') || (TYPESCRIPT.test(file) && !file.endsWith('.d.ts'))) &&
  !ignored.some((glob) => glob.match(file));

const itemsIn = (
  file: string,
  text: string,
  selectors: ReadonlyArray<Selector>,
): ReadonlyArray<SourceItem> => {
  const reading = selectors.filter((selector) => selects(selector, file));
  if (reading.length === 0) return [];
  if (file.endsWith('.md'))
    return markdownBeats(text).map((item) => ({ ...item, selector: 'scriptBeats', file }));
  const source = parse(file, text);
  return reading.flatMap((selector) =>
    itemsOf(selector, source).map((item) => ({ ...item, selector, file })),
  );
};

const formOf = (rules: ReadonlyArray<JudgedRule>, model: string) =>
  Effect.sync(() =>
    textHash(
      [
        model,
        ...rules.flatMap((rule) => [rule.id, rule.selector, ruleKey(rule)]),
        makersHash(),
      ].join('\0'),
    ),
  );

const readMemo = (file: string, form: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const text = yield* fs.readFileString(file);
    return yield* Schema.decodeEffect(Memo)(text);
  }).pipe(
    Effect.option,
    Effect.map((memo) => Option.filter(memo, (read) => read.form === form)),
  );

const writeMemo = (file: string, memo: Memo) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    yield* fs.makeDirectory(path.dirname(file), { recursive: true });
    const temporary = `${file}.${process.pid}.tmp`;
    yield* fs.writeFileString(temporary, yield* Schema.encodeEffect(Memo)(memo));
    yield* fs.rename(temporary, file);
  });

const memoChanged = (memo: Option.Option<Memo>, next: Memo) =>
  Option.match(memo, {
    onNone: () => true,
    onSome: (kept) => {
      const files = Object.keys(next.files);
      return (
        files.length !== Object.keys(kept.files).length ||
        files.some((file) => kept.files[file]?.hash !== next.files[file]?.hash)
      );
    },
  });

export const repoItems = Effect.fn('judged.repoItems')(function* (
  root: string,
  ignorePatterns: ReadonlyArray<string>,
  rules: ReadonlyArray<JudgedRule>,
  memo: { readonly model: string; readonly file: string },
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const selectors = [...new Set(rules.map((rule) => rule.selector))];
  const ignored = ignorePatterns.map((pattern) => new Glob(pattern));
  const files = (yield* gateFiles(root)).filter(
    (file) => linted(file, ignored) && selectors.some((selector) => selects(selector, file)),
  );
  const form = yield* formOf(rules, memo.model);
  const kept = yield* readMemo(memo.file, form);
  const byId = new Map(rules.map((rule) => [rule.id, rule]));
  const ruleKeys = new Map(rules.map((rule) => [rule.id, ruleKey(rule)]));
  const keyed = (found: ReadonlyArray<SourceItem>) =>
    rules.flatMap((rule) =>
      found
        .filter((item) => item.selector === rule.selector)
        .map((item) => ({
          tree: {
            rule,
            file: item.file,
            line: item.line,
            start: item.start,
            key: cacheKey(ruleKeys.get(rule.id) ?? ruleKey(rule), memo.model, item.key),
          },
          text: item.text,
        })),
    );
  const texts = new Map<string, string>();
  const read = yield* Effect.forEach(
    files,
    (file) =>
      Effect.map(fs.readFileString(path.join(root, file)), (text) => {
        const hash = textHash(text);
        const held = Option.flatMap(kept, (memoOf) =>
          Option.filter(Option.fromUndefinedOr(memoOf.files[file]), (entry) => entry.hash === hash),
        );
        const items = Option.match(held, {
          onSome: (entry) =>
            entry.items.flatMap((item) =>
              Option.toArray(
                Option.map(Option.fromUndefinedOr(byId.get(item.rule)), (rule): TreeItem => ({
                  ...item,
                  rule,
                  file,
                })),
              ),
            ),
          onNone: () =>
            keyed(itemsIn(file, text, selectors)).map(({ tree, text: itemText }) => {
              texts.set(tree.key, itemText);
              return tree;
            }),
        });
        return { file, hash, items };
      }),
    { concurrency: 8 },
  );
  const next: Memo = {
    form,
    files: Object.fromEntries(
      read.map(({ file, hash, items }) => [
        file,
        {
          hash,
          items: items.map(({ rule, line, start, key }) => ({ rule: rule.id, line, start, key })),
        },
      ]),
    ),
  };
  if (memoChanged(kept, next))
    yield* writeMemo(memo.file, next).pipe(
      Effect.catch((error) => Console.error(`[judged] memo not kept detail=${error._tag}`)),
    );
  const textsIn = (file: string) =>
    Effect.map(
      fs.readFileString(path.join(root, file)),
      (text) =>
        new Map(keyed(itemsIn(file, text, selectors)).map(({ tree, text: t }) => [tree.key, t])),
    );
  return {
    items: read.flatMap(({ items }) => items),
    files: read.map(({ file, hash }) => ({ file, hash })),
    textsOf: (items: ReadonlyArray<TreeItem>) =>
      Effect.gen(function* () {
        const unread = [
          ...new Set(items.filter((item) => !texts.has(item.key)).map((item) => item.file)),
        ];
        const reread = yield* Effect.forEach(unread, textsIn, { concurrency: 8 });
        for (const found of reread) for (const [key, text] of found) texts.set(key, text);
        return yield* Effect.forEach(items, (item) =>
          Effect.fromOption(Option.fromUndefinedOr(texts.get(item.key)), () =>
            ItemsMoved.make({ file: item.file }),
          ),
        );
      }),
  };
});
