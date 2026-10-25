/**
 * EGW CLI command graph.
 *
 * Each subcommand owns its arguments, behavior, and runtime dependencies under
 * ./egw/. This module preserves the backwards-compatible top-level lookup and
 * search routes and assembles the public command tree.
 */

import { isSearchQuery, parseEGWRef } from '@manna/core/egw';
import { Console, Effect, Option } from 'effect';
import { Argument, Command } from 'effect/cli';

import { egwBooks } from './egw/books.js';
import { egwCatalog } from './egw/catalog.js';
import { egwCommentary } from './egw/commentary.js';
import { egwDownload } from './egw/download.js';
import { ServiceLayer } from './egw/layers.js';
import { egwLookup, lookupReference } from './egw/lookup.js';
import { egwReport } from './egw/report.js';
import { egwDaemon } from './egw/search-daemon.js';
import { egwSearch, localSearch } from './egw/search.js';
import { egwStudy } from './egw/study.js';
import { egwSync } from './egw/sync.js';

const query = Argument.String('query').pipe(Argument.variadic());

export const egwWithSubcommands = Command.make('egw', { query }, (args) =>
  Effect.gen(function* () {
    const queryStr = args.query.join(' ').trim();

    if (queryStr.length === 0) {
      yield* Console.log('Usage: manna egw <refcode>');
      yield* Console.log('       manna egw books');
      yield* Console.log('       manna egw catalog --search <term>');
      yield* Console.log('       manna egw download <code>');
      yield* Console.log('       manna egw study <subject>');
      yield* Console.log('       manna egw search <query> [--remote]');
      yield* Console.log('       manna egw sync [--json]');
      yield* Console.log('       manna egw report [name] [--web]');
      yield* Console.log('');
      yield* Console.log('Examples:');
      yield* Console.log('  manna egw "PP 351.1"          # Single paragraph');
      yield* Console.log('  manna egw "PP 351.1-5"        # Paragraph range');
      yield* Console.log('  manna egw "PP 351"            # Full page');
      yield* Console.log('  manna egw "PP 351-355"        # Page range');
      yield* Console.log('  manna egw "PP"                # Book info + TOC');
      yield* Console.log('  manna egw search "great controversy"');
      yield* Console.log('  manna egw search "daniel" --remote');
      yield* Console.log('  manna egw catalog --search "uriah smith"');
      yield* Console.log('  manna egw download DAR');
      yield* Console.log('  manna egw study "seven last plagues"');
      return;
    }

    const parsed = parseEGWRef(queryStr);
    if (isSearchQuery(parsed)) {
      yield* localSearch(parsed.query, Option.none(), 20);
    } else {
      yield* lookupReference(parsed);
    }
  }),
).pipe(
  Command.withSubcommands([
    egwBooks,
    egwCatalog,
    egwDownload,
    egwStudy,
    egwSearch,
    egwLookup,
    egwCommentary,
    egwSync,
    egwReport,
    egwDaemon,
  ]),
  Command.provide(() => ServiceLayer),
);
