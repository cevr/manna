#!/usr/bin/env bun

import { BunCrypto, BunRuntime, BunServices } from '@effect/platform-bun';
import { Array as Arr, Console, Effect, FileSystem, Layer, Option, Path, Schema } from 'effect';
import { Command, Flag } from 'effect/cli';
import { Digest } from 'effect/crypto';

/** One entry of core's Strong's lexicon (`packages/core/assets/strongs.json`), its fields in the file's order. */
const LexiconEntry = Schema.Struct({
  lemma: Schema.String,
  xlit: Schema.optionalKey(Schema.String),
  def: Schema.String,
  pron: Schema.optionalKey(Schema.String),
  kjvDef: Schema.optionalKey(Schema.String),
});
export type LexiconEntry = typeof LexiconEntry.Type;

/** One entry of Open Scriptures' Strong's dictionaries: the Greek file names the transliteration `translit`, the Hebrew `xlit`. */
const SourceEntry = Schema.Struct({
  lemma: Schema.optionalKey(Schema.String),
  xlit: Schema.optionalKey(Schema.String),
  translit: Schema.optionalKey(Schema.String),
  pron: Schema.optionalKey(Schema.String),
  derivation: Schema.optionalKey(Schema.String),
  strongs_def: Schema.optionalKey(Schema.String),
  kjv_def: Schema.optionalKey(Schema.String),
});
export type SourceEntry = typeof SourceEntry.Type;

/** An entry as the file stores it: its fields in the order they were written, which a sound entry keeps. */
type Stored = Readonly<Record<string, string>>;

/** The lexicon file: JSON indented by two spaces, as it is kept, each entry's fields in their stored order. */
const LexiconJson = Schema.fromJsonString(
  Schema.Record(Schema.String, Schema.Record(Schema.String, Schema.String)),
  { space: 2 },
);
const SourcesJson = Schema.fromJsonString(Schema.Record(Schema.String, SourceEntry));

/** The source the refill reads: Open Scriptures' Strong's dictionaries as JSON, at one commit, each file held to its SHA-256. */
const SOURCE = {
  repository: 'https://github.com/openscriptures/strongs',
  commit: '0acd2f251c2d35ff8db2dece4e0593979d3ac223',
  files: [
    {
      name: 'strongs-greek-dictionary.js',
      sha256: '7624ee738ae47e80f1a352223e28a26d011c9cd4898822cee52f47a010c04efd',
    },
    {
      name: 'strongs-hebrew-dictionary.js',
      sha256: '5ce6aeed551c709f49bcfa341cadf2f34bc7599b85d9de9e6ac2ecbf60fc3739',
    },
  ],
};

/** A source file that is not the pinned one. */
class StrongsSourceError extends Schema.TaggedError<StrongsSourceError>()('StrongsSourceError', {
  message: Schema.String,
}) {}

/** A source's text field, or the empty text where the source has none. */
const fieldText = (source: SourceEntry, key: keyof SourceEntry) =>
  Option.getOrElse(Option.fromUndefinedOr(source[key]), () => '');
const flat = (text: string) => text.replace(/\s+/gu, ' ').trim();
const hasLetter = (text: string) => /\p{L}/u.test(text);
const isGreek = (number: string) => number.startsWith('G');

/** A definition that begins with the literal `null`, the pronunciation after it. */
const startsNull = (def: string) => def.trimStart().startsWith('null');

/** A definition with a run of 30 characters from its first 40 that comes again later in it: the text written twice. */
const writtenTwice = (def: string) => {
  const text = flat(def).replace(/^null/u, '');
  const probe = text.slice(10, 40);
  return probe.length === 30 && text.indexOf(probe, 11) > 0;
};

/** A run of three spaces or more between two words: fields joined, or the source's Greek or Hebrew letters dropped. */
const holed = (def: string) => /\S\s{3,}\S/u.test(def);

/** Whether an entry's definition shows none of the lexicon's four defects: a leading `null`, the text written twice, no letter, a run of three spaces. */
export const isSound = (entry: LexiconEntry) =>
  !startsNull(entry.def) && !writtenTwice(entry.def) && hasLetter(entry.def) && !holed(entry.def);

/** The text once when it is one copy written twice, with at most three spaces between the copies. */
const once = (text: string) =>
  Option.getOrElse(
    Option.map(
      Arr.findFirst([0, 1, 2, 3], (gap) => {
        const half = Math.floor((text.length - gap) / 2);
        return half > 0 && text.slice(0, half).trimEnd() === text.slice(half).trimStart();
      }),
      (gap) => text.slice(0, Math.floor((text.length - gap) / 2)).trimEnd(),
    ),
    () => text,
  );

/** What follows a leading `null`: a transliteration (its letters often dropped) and a comma, then the pronunciation, then two spaces. */
const HEAD = /^(?:[^,]*?,)?([a-z][a-z'-]*(?: -[a-z'-]+)*)(?:\s{2,}|$)/u;

/** A pronunciation as Strong's writes it: syllables of lower-case letters joined by hyphens, stress marked by an apostrophe. */
const PRONUNCIATION = /^[a-z]+(?:['-]+[a-z]+)*'?$/u;

/** A `null`-led definition, written once, split into the pronunciation it leads with (when it reads as one) and the text after it. */
const afterNull = (def: string) => {
  const rest = once(def.trimStart().slice(4).trim());
  return Option.match(Option.fromNullishOr(HEAD.exec(rest)), {
    onNone: () => ({ pron: Option.none<string>(), body: rest }),
    onSome: (head) => ({
      pron: Option.filter(
        Option.map(Option.fromUndefinedOr(head[1]), (said) => said.replace(/ -/gu, '-')),
        (pron) => PRONUNCIATION.test(pron),
      ),
      body: rest.slice(head[0].length),
    }),
  });
};

interface Fields {
  readonly lemma: string;
  readonly xlit: Option.Option<string>;
  readonly def: string;
  readonly pron: Option.Option<string>;
  readonly kjvDef: Option.Option<string>;
}

const present = <K extends string>(key: K, value: Option.Option<string>) =>
  Option.match(value, {
    onNone: () => ({}),
    onSome: (text) => ({ [key]: text }),
  });

/** An entry with its fields in the file's order, an absent one left out. */
const entryOf = (fields: Fields): LexiconEntry => ({
  lemma: fields.lemma,
  ...present('xlit', fields.xlit),
  def: fields.def,
  ...present('pron', fields.pron),
  ...present('kjvDef', fields.kjvDef),
});

/** A stored entry read as the lexicon's fields, in the file's order; a field the lexicon does not name is not read. */
const entryFrom = (stored: Stored): LexiconEntry =>
  entryOf({
    lemma: Option.getOrElse(Option.fromUndefinedOr(stored['lemma']), () => ''),
    xlit: Option.fromUndefinedOr(stored['xlit']),
    def: Option.getOrElse(Option.fromUndefinedOr(stored['def']), () => ''),
    pron: Option.fromUndefinedOr(stored['pron']),
    kjvDef: Option.fromUndefinedOr(stored['kjvDef']),
  });

const fieldsOf = (entry: LexiconEntry): Fields => ({
  lemma: entry.lemma,
  xlit: Option.fromUndefinedOr(entry.xlit),
  def: entry.def,
  pron: Option.fromUndefinedOr(entry.pron),
  kjvDef: Option.fromUndefinedOr(entry.kjvDef),
});

/**
 * Stage 1, by rule and with no source: a sound entry comes back as it is; a
 * `null`-led one loses the `null` and the pronunciation after it (a Greek
 * pronunciation that reads as one becomes the entry's `pron`; a Hebrew one is
 * the `pron` it has), is written once, and every run of spaces is closed. An
 * entry with no letter comes back as it is: only a source can fill it.
 */
export const clean = (entry: LexiconEntry): LexiconEntry => {
  if (isSound(entry) || !hasLetter(entry.def)) return entry;
  if (!startsNull(entry.def)) return { ...entry, def: flat(once(flat(entry.def))) };
  const { pron, body } = afterNull(entry.def);
  const fields = fieldsOf(entry);
  return entryOf({ ...fields, def: flat(body), pron: Option.orElse(fields.pron, () => pron) });
};

/** Where a definition starts once the tail of a derivation the source split wrongly (`…(τίθημι)); illegal`) is set aside: after the bracket that closes the derivation's open one, else at its start. */
const derivationEnd = (text: string, open: number) => {
  let depth = open;
  for (const [index, char] of Arr.fromIterable(text).entries()) {
    if (depth <= 0) return index;
    if (char === '(') depth += 1;
    if (char === ')') depth -= 1;
  }
  return 0;
};

/** The source's own definition, braces and a derivation's spilled tail taken off. */
const definitionOf = (source: SourceEntry) => {
  const derivation = fieldText(source, 'derivation');
  const open = derivation.split('(').length - derivation.split(')').length;
  const text = fieldText(source, 'strongs_def').replace(/[{}]/gu, '');
  return flat(text.slice(derivationEnd(text, open)).replace(/^[\s),;]+/u, ''));
};

/** The KJV's renderings as the sound entries end a definition: a Greek one closed by a stop. */
const renderingsOf = (number: string, source: SourceEntry) => {
  const kjv = flat(fieldText(source, 'kjv_def'));
  if (isGreek(number) && kjv.length > 0 && !/[.!?]$/u.test(kjv)) return `${kjv}.`;
  return kjv;
};

/** The source's entry as the lexicon's sound entries write a definition: the definition, a dash, how the KJV renders it. */
const styled = (number: string, source: SourceEntry) =>
  [definitionOf(source), renderingsOf(number, source)]
    .filter((part) => part.length > 0)
    .join(' — ');

/** A refilled entry: its own transliteration and pronunciation kept, the source's lemma where it had none, and for Hebrew the source's `kjvDef`. */
const fromSource = (number: string, cleaned: LexiconEntry, source: SourceEntry) => {
  const fields = fieldsOf(cleaned);
  const lemma = Option.getOrElse(
    Option.filter(Option.some(cleaned.lemma), (own) => own.length > 0),
    () => fieldText(source, 'lemma'),
  );
  if (isGreek(number))
    return entryOf({
      ...fields,
      lemma,
      xlit: Option.orElse(fields.xlit, () => Option.fromUndefinedOr(source.translit)),
      def: styled(number, source),
    });
  return entryOf({
    lemma,
    xlit: Option.orElse(fields.xlit, () => Option.fromUndefinedOr(source.xlit)),
    def: styled(number, source),
    pron: Option.orElse(fields.pron, () => Option.fromUndefinedOr(source.pron)),
    kjvDef: Option.orElse(Option.fromUndefinedOr(source.kjv_def), () => fields.kjvDef),
  });
};

/**
 * Stage 2: an entry that was not sound takes its definition from the source,
 * in the sound entries' style, over what stage 1 made of it. A rule closes
 * spaces but cannot bring back what the defects took (a dropped Greek or
 * Hebrew word, a lost semicolon, a cut-off text), so the source's text is the
 * whole one; where it equals stage 1's, nothing but the filled fields differs.
 * A sound entry comes back as it is; with no source, or a source with no
 * definition, stage 1's answer stands.
 */
export const refill = (
  number: string,
  entry: LexiconEntry,
  source: Option.Option<SourceEntry>,
): LexiconEntry => {
  if (isSound(entry)) return entry;
  const cleaned = clean(entry);
  return Option.match(
    Option.filter(source, (found) => hasLetter(styled(number, found))),
    {
      onNone: () => cleaned,
      onSome: (found) => fromSource(number, cleaned, found),
    },
  );
};

/** An entry's fields and values in its order, as one text. */
const bytesOf = (entry: LexiconEntry) =>
  Object.entries(entry)
    .map(([key, value]) => `${key}\u0001${value}`)
    .join('\u0002');

/** Whether two entries would be written the same: the same fields, in the same order, with the same values. */
const same = (left: LexiconEntry, right: LexiconEntry) => bytesOf(left) === bytesOf(right);

/**
 * Both stages over a whole lexicon as the file stores it: the repaired
 * lexicon (an entry neither stage changes is the stored one, its fields in
 * their order), the numbers stage 1 alone changed, those stage 2 refilled, and
 * those still defective.
 */
export const repair = (
  lexicon: Readonly<Record<string, Stored>>,
  sources: Option.Option<Readonly<Record<string, SourceEntry>>>,
) => {
  const rows = Object.entries(lexicon).map(([number, stored]) => {
    const entry = entryFrom(stored);
    const found = Option.flatMap(sources, (all) => Option.fromUndefinedOr(all[number]));
    const repaired = refill(number, entry, found);
    return { number, stored, entry, repaired, changed: !same(entry, repaired) };
  });
  const changed = rows.filter((row) => row.changed);
  const byRule = (row: (typeof rows)[number]) => same(row.repaired, clean(row.entry));
  const written: ReadonlyArray<readonly [string, Stored]> = rows.map((row) => [
    row.number,
    Option.getOrElse(
      Option.map(
        Option.liftPredicate(row, (kept) => kept.changed),
        (kept) => kept.repaired,
      ),
      () => row.stored,
    ),
  ]);
  return {
    lexicon: Object.fromEntries(written),
    cleaned: changed.filter(byRule).map((row) => row.number),
    refilled: changed.filter((row) => !byRule(row)).map((row) => row.number),
    defective: rows.filter((row) => !isSound(row.repaired)).map((row) => row.number),
  };
};

/** The object a `var x = {…};` dictionary file of Open Scriptures holds, as JSON text. */
const objectText = (text: string) =>
  text.slice(text.indexOf('{', text.indexOf('= ')), text.lastIndexOf('}') + 1);

const readSources = Effect.fn('strongsClean.readSources')(function* (directory: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const hasher = yield* Digest.Digest;
  const parts = yield* Effect.forEach(SOURCE.files, (file) =>
    Effect.gen(function* () {
      const bytes = yield* fs.readFile(path.join(directory, file.name));
      const sha256 = yield* hasher.digestHex(Digest.sha256, bytes);
      if (sha256 !== file.sha256)
        return yield* StrongsSourceError.make({
          message: `${file.name}: sha256 ${sha256}, the pinned file is ${file.sha256} (${SOURCE.repository} at ${SOURCE.commit})`,
        });
      return yield* Schema.decodeEffect(SourcesJson)(objectText(new TextDecoder().decode(bytes)));
    }),
  );
  return Object.fromEntries(parts.flatMap((part) => Object.entries(part)));
});

const summaryOf = (result: ReturnType<typeof repair>) => {
  const sample = Option.match(Arr.head(result.defective), {
    onNone: () => '',
    onSome: () => ` (first: ${result.defective.slice(0, 5).join(' ')})`,
  });
  return `${Object.keys(result.lexicon).length} entries; stage 1 cleaned ${result.cleaned.length}, stage 2 refilled ${result.refilled.length}, still defective ${result.defective.length}${sample}`;
};

const command = Command.make(
  'strongs-clean',
  {
    asset: Flag.String('asset').pipe(
      Flag.withDefault(new URL('../../core/assets/strongs.json', import.meta.url).pathname),
      Flag.withDescription('The lexicon to repair in place'),
    ),
    source: Flag.String('source').pipe(
      Flag.optional,
      Flag.withDescription(
        "A directory holding Open Scriptures' strongs-greek-dictionary.js and strongs-hebrew-dictionary.js at the pinned commit; without it, stage 1 alone",
      ),
    ),
  },
  (args) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const lexicon = yield* Schema.decodeEffect(LexiconJson)(yield* fs.readFileString(args.asset));
      const sources = yield* Effect.transposeOption(Option.map(args.source, readSources));
      const result = repair(lexicon, sources);
      const written = yield* Schema.encodeEffect(LexiconJson)(result.lexicon);
      yield* fs.writeFileString(args.asset, `${written}\n`);
      yield* Console.log(`strongs-clean ${args.asset}: ${summaryOf(result)}`);
    }),
);

if (import.meta.main)
  Command.run(command, { version: '1' }).pipe(
    Effect.provide(Layer.mergeAll(BunServices.layer, BunCrypto.layerDigest)),
    BunRuntime.runMain,
  );
