import { BunRuntime, BunServices } from '@effect/platform-bun';
import { artBrief, conflicts, drawBatch } from '@manna/film/tools';
import { Console, Effect, FileSystem, Option, Path, Random, Schema } from 'effect';
import { Command, Flag } from 'effect/cli';
import { DECK } from './deck.ts';

const COMMAND = 'bun run seed-look';

class DeckConflict extends Schema.TaggedError<DeckConflict>()('DeckConflict', {
  look: Schema.String,
  pairs: Schema.Array(Schema.String),
}) {
  override get message() {
    return `art/deck.ts profiles ${this.look} with picks that do not hold: ${this.pairs.join(', ')}`;
  }
}

const said = ([a, b]: readonly [string, string]): string => {
  if (a === b) return `${a} (no such option)`;
  return `${a} with ${b}`;
};

const seedLook = Command.make(
  'seed-look',
  {
    seed: Flag.Int('seed').pipe(
      Flag.optional,
      Flag.withDescription('the first seed (a random one when left out, printed)'),
    ),
    count: Flag.Int('count').pipe(
      Flag.withDefault(1),
      Flag.withDescription('how many looks to draw, from that seed on'),
    ),
    out: Flag.String('out').pipe(
      Flag.optional,
      Flag.withDescription('a directory to write each brief to, as <name>.md'),
    ),
  },
  Effect.fn('art.seedLook')(function* (input) {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    for (const look of DECK.existing) {
      const found = conflicts(DECK, look.picks);
      if (found.length > 0)
        return yield* DeckConflict.make({
          look: look.name,
          pairs: found.map(said),
        });
    }
    const from = yield* Option.match(input.seed, {
      onNone: () => Random.nextIntBetween(0, 2 ** 31),
      onSome: Effect.succeed,
    });
    const batch = drawBatch(DECK, from, Math.max(1, input.count));
    yield* Console.log(
      `# Seeded looks: \`${COMMAND} --seed ${from} --count ${input.count}\` (deck v${DECK.version})\n`,
    );
    for (const draw of batch.draws) {
      const brief = artBrief(DECK, draw, COMMAND);
      yield* Console.log(brief);
      if (Option.isSome(input.out)) {
        const dir = path.resolve(input.out.value);
        yield* fs.makeDirectory(dir, { recursive: true });
        yield* fs.writeFileString(path.join(dir, `${draw.name}.md`), brief);
      }
    }
    if (batch.skipped.length > 0)
      yield* Console.log(
        [
          '## Seeds passed over',
          '',
          ...batch.skipped.map((s) => `- \`${s.seed}\`: ${s.reason}`),
          '',
        ].join('\n'),
      );
    if (batch.draws.length < input.count)
      yield* Console.log(
        `Drew ${batch.draws.length} of ${input.count}: the deck ran short of looks far enough apart.`,
      );
  }),
).pipe(Command.withDescription('New art directions for the looks study, drawn from a seed'));

if (import.meta.main)
  Command.run(seedLook, { version: '0.1.0' }).pipe(
    Effect.provide(BunServices.layer),
    BunRuntime.runMain,
  );
