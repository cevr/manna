/* oxlint-disable effect/noGlobals, effect/noModuleMocks, effect/noAsyncFunction, effect/noNewPromise -- a test preload for `bun run seeds` alone, a host adapter by its nature: it reads its settings from the environment, prints each seeded call as JSON, and wraps the walk modules' exports in place, awaiting them, before any test file loads them. */

/**
 * The preload `scripts/seed-search.ts` adds after a part's own, which no
 * gate part loads. `HEARTSEED_SEED_WALKS` names the functions a part's files
 * import from `src/test` modules (`<module>:<name>`, comma-separated, the
 * module a path from the app). It wraps each whose parameter is named `seed`
 * or `seeds` (`seedParam`) in its module's exports, keeping the function it
 * had. With `HEARTSEED_SEED_PIN` unset it prints each such call as
 * `seed-pin call <k> <fn> <seed|seeds> <committed>` and passes it through.
 * With it set, the call numbered `HEARTSEED_SEED_CALL` (from 1) runs with its
 * seed pinned (`pinned`) and prints `seed-pin <fn> <committed> -> <pinned>`.
 */
import { mock } from 'bun:test';
import { Option, Predicate } from 'effect';

import { pinned, type SeedParam, seedParam } from './seed-search.ts';

const walks = (process.env['HEARTSEED_SEED_WALKS'] ?? '').split(',').filter(Boolean);
const pinText = process.env['HEARTSEED_SEED_PIN'] ?? '';
const chosen = Number(process.env['HEARTSEED_SEED_CALL'] ?? '1');
let calls = 0;

/** `walk`, named `name`, with its seed at `param` listed or pinned. */
const wrap =
  (name: string, walk: Function, param: SeedParam) =>
  (...args: ReadonlyArray<unknown>): unknown => {
    calls += 1;
    const committed = JSON.stringify(args[param.index]);
    if (pinText === '') {
      console.log(`seed-pin call ${calls} ${name} ${param.kind} ${committed}`);
      return Reflect.apply(walk, walk, args);
    }
    if (calls !== chosen) return Reflect.apply(walk, walk, args);
    const next = pinned(args, param.index, param.kind, Number(pinText));
    console.log(`seed-pin ${name} ${committed} -> ${JSON.stringify(next[param.index])}`);
    return Reflect.apply(walk, walk, next);
  };

/** The module at `module` (a path from the app), each of `names` that takes a seed wrapped in place. */
const wrapModule = async (module: string) => {
  const names = new Set(
    walks
      .filter((walk) => walk.startsWith(`${module}:`))
      .map((walk) => walk.slice(module.length + 1)),
  );
  const target = Bun.resolveSync(`./${module}`, process.cwd());
  const real: object = await import(target);
  const exports = Object.entries(real).map(([name, value]) => {
    if (!names.has(name) || !Predicate.isFunction(value)) return [name, value];
    return Option.match(seedParam(Function.prototype.toString.call(value)), {
      onNone: () => [name, value],
      onSome: (param) => [name, wrap(name, value, param)],
    });
  });
  await mock.module(target, () => Object.fromEntries(exports));
};

await Promise.all([...new Set(walks.map((walk) => walk.split(':')[0] ?? ''))].map(wrapModule));
