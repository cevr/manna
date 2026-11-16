#!/usr/bin/env bun

import { BunCrypto, BunRuntime, BunServices } from '@effect/platform-bun';
import { Array as Arr, Console, Effect, FileSystem, Layer, Option, Path, Schema } from 'effect';
import { Command, Flag } from 'effect/cli';
import { Digest } from 'effect/crypto';

import { repair, SourceEntry } from './strongs-clean/rules.ts';

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

Command.run(command, { version: '1' }).pipe(
  Effect.provide(Layer.mergeAll(BunServices.layer, BunCrypto.layerDigest)),
  BunRuntime.runMain,
);
