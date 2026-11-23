import { EGWParagraphDatabase } from '@manna/core/egw-db';
import * as EGWDbBun from '@manna/core/egw-db/bun';
import { BunServices } from '@effect/platform-bun';
import { Console, Effect, Layer } from 'effect';
import { Argument, Command } from 'effect/cli';

const codes = Argument.String('code').pipe(
  Argument.variadic(),
  Argument.withDescription('Book codes to relink (default: every installed book)'),
);

/** `manna egw relink [CODE...]`: the link rows of installed books read again
 *  from their stored paragraphs, so a changed reading reaches the corpus
 *  without a download. */
export const egwRelink = Command.make('relink', { codes }, (args) =>
  Effect.gen(function* () {
    const db = yield* EGWParagraphDatabase;
    const report = yield* db.relinkBibleRefs(args.codes);
    yield* Console.log(
      `Relinked ${String(report.books)} book(s): ${String(report.paragraphs)} paragraphs, ${String(report.links)} links`,
    );
  }),
).pipe(
  Command.withDescription('Read the Bible links of installed books again from their paragraphs'),
  Command.provide(() => EGWDbBun.Default.pipe(Layer.provide(BunServices.layer))),
);
