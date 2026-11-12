// Fixture for manna/seed-from-clock: each line marked RED fires the rule,
// and nothing else does.

import { Clock, Config, Effect, Option } from 'effect';

declare const process: { readonly env: Record<string, string | undefined> };
declare const random: (seed: number) => () => number;
declare const it: (title: string, body: () => unknown) => void;

export const seed = Number(process.env['HYMNAL_ROWS_SEED'] ?? Date.now() % 1_000_000); // RED manna/seed-from-clock
export const draws = random(Number(process.env['ROWS_SEED'] ?? Date.now())); // RED manna/seed-from-clock
export const SEEDS = Math.floor(Math.random() * 2 ** 32); // RED manna/seed-from-clock
export const motionSeed = performance.now(); // RED manna/seed-from-clock
export const run = { seed: new Date().getTime() }; // RED manna/seed-from-clock
export const listSeed = ((given) => (given !== undefined ? Number(given) : Math.random()))(
  // RED manna/seed-from-clock
  process.env['HYMNAL_LIST_SEED'],
);
export const budgetSeed = Effect.gen(function* () {
  const given = yield* Config.option(Config.Int('TEST_BUDGET_SEED'));
  return yield* Option.match(given, {
    onNone: () => Clock.currentTimeMillis, // RED manna/seed-from-clock
    onSome: (value) => Effect.succeed(value),
  });
});

export const constant = Number(process.env['HYMNAL_ROWS_SEED'] ?? 20261112);
export const configured = Config.Int('TOPICS_SEED').pipe(Config.withDefault(20261020));
export const heartseedStarted = Date.now();
export const seeded = random(7)();
export const startedAt = Effect.gen(function* () {
  return yield* Clock.currentTimeMillis;
});
export const at = new Date(0);
it('times the seed rig', () => {
  const started = Date.now();
  random(7)();
  return started;
});
