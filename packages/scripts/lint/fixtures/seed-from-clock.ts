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
const given = process.env['HYMNAL_LIST_SEED'];
export const listSeed = given !== undefined ? Number(given) : Math.random(); // RED manna/seed-from-clock
export const budgetSeed = Effect.gen(function* () {
  const given = yield* Config.option(Config.Int('TEST_BUDGET_SEED'));
  return yield* Option.match(given, {
    onNone: () => Clock.currentTimeMillis, // RED manna/seed-from-clock
    onSome: (value) => Effect.succeed(value),
  });
});
export const a1 = Number(process.env['HYMNAL_PROBE_SEED']) || Date.now(); // RED manna/seed-from-clock
export const a3 = process.env['X_SEED'] ? Number(process.env['X_SEED']) : Date.now(); // RED manna/seed-from-clock
export const a5 = random(Number(process.env['HYMNAL_PROBE_SEED']) || Date.now()); // RED manna/seed-from-clock
export const a6 = parseInt(process.env['X_SEED'] ?? '', 10) || Math.floor(Math.random() * 1e6); // RED manna/seed-from-clock
export const a7 = Number(process.env['X_SEED']?.trim()) || Date.now(); // RED manna/seed-from-clock
export const d1 = seed > 0 && performance.now() < 5_000;
export const d2 = seed > 0 ? `seed ${seed}` : `took ${performance.now()} ms`;
console.log(seed, Date.now());
export const port = Number(process.env['PORT']) || Date.now();
export const plain = process.env['CI'] ? 1 : Math.random();

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
