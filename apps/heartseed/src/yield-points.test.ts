/* oxlint-disable effect/noGlobals, effect/noNodeBuiltinImport -- the test reads the app's own source files from disk, synchronously, outside any Effect. */

/**
 * Every service whose native listener runs an effect at a scheduler yield
 * has a yield-point property. A product module (`src` or `app`, less tests,
 * declarations and `src/test/`) that creates a PubSub and runs an effect
 * synchronously or publishes unsafely (only a native listener may,
 * `heartseed-no-sync-runner-in-product`) is imported, with the shared
 * scheduler `src/test/yielding.ts`, by a test under `src`; and that scheduler
 * is the only one the app's code defines, this test's model aside. The
 * scheduler is held to a reference model over generated runs.
 *
 * The reader parses the code (oxc-parser), so a comment, a string or a type
 * that names a runner or a PubSub is no reason. It reads a runner on any
 * object, a runner's named import and `publishUnsafe`, and a PubSub made
 * by any of effect's constructors (`make`, `bounded`, `dropping`, `sliding`,
 * `unbounded`) through the name `PubSub`; the same names on another object
 * (`Queue.bounded`) make no PubSub. An aliased import (`import * as P from
 * 'effect/PubSub'`), a maker's named import (`import { make } from
 * 'effect/PubSub'`) and a destructured runner (`const { runSync } =
 * Effect`) are not read, and the app writes `PubSub` and `Effect.` forms
 * everywhere.
 */

import { describe, expect, it } from 'bun:test';
import { Array as Arr, Effect, Option, Predicate, type Scheduler } from 'effect';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { type Node, parseSync, Visitor } from 'oxc-parser';

import { yieldingAt } from './test/yielding';

const APP = join(import.meta.dir, '..');
const HELPER = 'src/test/yielding.ts';
/** This test, whose model of the scheduler stands a base scheduler in. */
const SELF = 'src/yield-points.test.ts';

const RUNNERS = new Set([
  'runSync',
  'runSyncExit',
  'runSyncWith',
  'runSyncExitWith',
  'publishUnsafe',
]);
/** Every constructor of a PubSub that effect exports. */
const MAKERS = new Set(['make', 'sliding', 'unbounded', 'bounded', 'dropping']);

/** A key's name: an identifier's, or a string literal's when it is computed. */
const nameOf = (node: Node): Option.Option<string> => {
  if (node.type === 'Identifier') return Option.some(node.name);
  if (node.type === 'Literal' && Predicate.isString(node.value)) return Option.some(node.value);
  return Option.none();
};

const named = (node: Node, names: ReadonlySet<string>) =>
  Option.exists(nameOf(node), (name) => names.has(name));

const YIELD = new Set(['shouldYield']);

/** What a module's code (not its comments, strings or types) does: creates a PubSub, runs or publishes synchronously, defines a scheduler's `shouldYield`. */
const readCode = (file: string, text: string) => {
  const parsed = parseSync(file, text, { sourceType: 'module' });
  const found = { pubsub: false, sync: false, scheduler: false, broken: parsed.errors.length > 0 };
  new Visitor({
    MemberExpression: (node) => {
      if (node.object.type === 'Identifier' && node.object.name === 'PubSub')
        found.pubsub ||= named(node.property, MAKERS);
      found.sync ||= named(node.property, RUNNERS);
    },
    ImportSpecifier: (node) => {
      found.sync ||= named(node.imported, RUNNERS);
    },
    Property: (node) => {
      found.scheduler ||= named(node.key, YIELD);
    },
    MethodDefinition: (node) => {
      found.scheduler ||= named(node.key, YIELD);
    },
    PropertyDefinition: (node) => {
      found.scheduler ||= named(node.key, YIELD);
    },
  }).visit(parsed.program);
  return found;
};

/** Whether a module needs a yield-point property: it creates a PubSub and its code runs or publishes synchronously, or it does not parse. */
const needsYieldPoints = (file: string, text: string) => {
  const found = readCode(file, text);
  return found.broken || (found.pubsub && found.sync);
};

const read = (file: string) => readFileSync(join(APP, file), 'utf8');

/** The app's TypeScript files under `src` and `app`, declarations aside. */
const sources = () =>
  [...new Bun.Glob('{src,app}/**/*.{ts,tsx}').scanSync({ cwd: APP })].filter(
    (file) => !file.endsWith('.d.ts'),
  );

const isTest = (file: string) => /\.test\.tsx?$/u.test(file);

const isProduct = (file: string) => !isTest(file) && !file.startsWith('src/test/');

const EXTENSIONS = ['', '.ts', '.tsx', '/index.ts', '/index.tsx'];

const loaderOf = (file: string): 'ts' | 'tsx' => {
  if (file.endsWith('.tsx')) return 'tsx';
  return 'ts';
};

/** The app's files a module imports by relative imports, from the app's root. */
const importsOf = (file: string): ReadonlySet<string> => {
  const out = new Set<string>();
  for (const { path } of new Bun.Transpiler({ loader: loaderOf(file) }).scanImports(read(file))) {
    if (!path.startsWith('.')) continue;
    const hit = Arr.findFirst(
      EXTENSIONS.map((extension) => join(dirname(join(APP, file)), path) + extension),
      (candidate) => /\.tsx?$/u.test(candidate) && existsSync(candidate),
    );
    if (Option.isSome(hit)) out.add(relative(APP, hit.value));
  }
  return out;
};

/** A seeded generator of numbers in [0, 1). */
const random = (seed: number) => {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
};

const pick = <A>(next: () => number, items: ReadonlyArray<A>) =>
  items[Math.floor(next() * items.length)] ?? items[0]!;

/** A line of a generated module, and whether it makes a PubSub or runs synchronously in code. */
interface Line {
  readonly text: string;
  readonly pubsub: boolean;
  readonly sync: boolean;
}

const OBJECTS = ['Effect', 'runtime', 'context.runtime', 'E'];
const SYNC_NAMES = ['runSync', 'runSyncExit', 'runSyncWith', 'runSyncExitWith'];

/** The generator's own list of effect's PubSub constructors, apart from the reader's. */
const GENERATED_MAKERS = ['make', 'bounded', 'dropping', 'sliding', 'unbounded'];
/** Objects whose makers of the same names make no PubSub. */
const OTHER_MAKERS = ['Queue', 'Stream', 'Mailbox', 'pubsub', 'PubSub.Atomic'];

/** A maker's arguments: an options object for `make`, a capacity for the rest. */
const argsOf = (maker: string) => {
  if (maker === 'make') return '{ atomicPubSub: () => atomic, strategy: () => strategy }';
  return '16';
};

/** A line that makes a PubSub, or names one, or calls a same-named maker on another object, with no code that makes one. */
const pubsubLine = (next: () => number): Line => {
  const maker = pick(next, GENERATED_MAKERS);
  const other = pick(next, OTHER_MAKERS);
  return pick(next, [
    {
      text: `const views = yield* PubSub.${maker}<number>(${argsOf(maker)});`,
      pubsub: true,
      sync: false,
    },
    {
      text: `const box = yield* PubSub['${maker}']<number>(${argsOf(maker)});`,
      pubsub: true,
      sync: false,
    },
    {
      text: `const queue = yield* ${other}.${maker}<number>(${argsOf(maker)});`,
      pubsub: false,
      sync: false,
    },
    { text: `const held = yield* ${other}['${maker}']<number>(4);`, pubsub: false, sync: false },
    { text: 'const atomic = PubSub.makeAtomicBounded<number>(4);', pubsub: false, sync: false },
    { text: `// PubSub.${maker} once held the views`, pubsub: false, sync: false },
    {
      text: `/** Publishes through PubSub.${maker}. */\nconst a${maker} = 1;`,
      pubsub: false,
      sync: false,
    },
    { text: `const s = 'PubSub.${maker}';`, pubsub: false, sync: false },
    { text: 'type T = PubSub.PubSub<number>;', pubsub: false, sync: false },
    { text: 'const t = PubSub.publish;', pubsub: false, sync: false },
  ]);
};

/** A line that runs or publishes synchronously, or names a runner with no code that runs. */
const syncLine = (next: () => number): Line => {
  const runner = pick(next, SYNC_NAMES);
  const object = pick(next, OBJECTS);
  return pick(next, [
    { text: `listener(() => ${object}.${runner}(step));`, pubsub: false, sync: true },
    { text: `const exit = ${object}['${runner}'](step);`, pubsub: false, sync: true },
    { text: `import { ${runner} } from 'effect/Effect';`, pubsub: false, sync: true },
    { text: `import { ${runner} as run } from 'effect/Effect';`, pubsub: false, sync: true },
    { text: 'PubSub.publishUnsafe(views, view);', pubsub: false, sync: true },
    { text: `// ${object}.${runner}(step) ran here`, pubsub: false, sync: false },
    { text: `/** Runs with \`Effect.${runner}\`. */\nconst b = 2;`, pubsub: false, sync: false },
    { text: `const n = '${runner}';`, pubsub: false, sync: false },
    { text: 'const f = Effect.runFork(step);', pubsub: false, sync: false },
    { text: 'yield* PubSub.publish(views, view);', pubsub: false, sync: false },
  ]);
};

/** A generated module, and whether it needs a yield-point property. */
const moduleOf = (next: () => number) => {
  const lines: Array<Line> = [];
  for (let k = 0; k < Math.floor(next() * 4); k += 1) lines.push(pubsubLine(next));
  for (let k = 0; k < Math.floor(next() * 4); k += 1) lines.push(syncLine(next));
  const shuffled = lines.toSorted(() => next() - 0.5);
  const imports = shuffled.filter(({ text }) => text.startsWith('import'));
  const body = shuffled.filter(({ text }) => !text.startsWith('import'));
  const source = [
    ...imports.map(({ text }) => text),
    'export const layer = Effect.gen(function* () {',
    ...body.map(({ text }) => `  ${text}`),
    '});',
  ].join('\n');
  return {
    source,
    needs: lines.some(({ pubsub }) => pubsub) && lines.some(({ sync }) => sync),
  };
};

/** The fiber the model's checks name; the scheduler reads none. */
const FIBER = Effect.runFork(Effect.void);

/** The reference model of `yieldingAt`: its checks so far, whether the next task resumes a yielded fiber, whether the event landed, and the queue of what each task runs. */
interface Model {
  checks: number;
  pending: boolean;
  delivered: boolean;
  readonly queue: Array<ReadonlyArray<string>>;
  readonly ran: Array<string>;
}

/** A base scheduler that holds its tasks in `queue` until the run takes them, in order. */
const queued = (queue: Array<() => void>): Scheduler.Scheduler => ({
  executionMode: 'async',
  shouldYield: () => false,
  makeDispatcher: () => ({
    scheduleTask: (task) => {
      queue.push(task);
    },
    flush: () => {},
  }),
});

/** The model's step for a scheduled task: it queues the event before the task when the task resumes a yield, and no later task does. */
const modelSchedules = (model: Model, id: string) => {
  if (model.pending) model.queue.push(['deliver', id]);
  else model.queue.push([id]);
  model.pending = false;
};

/** The model's step for a task run: the first task queued runs, its event first when it resumes a yield. */
const modelRunsTask = (model: Model) =>
  Option.map(Option.fromNullishOr(model.queue.shift()), (ran) => {
    if (ran[0] === 'deliver') model.delivered = true;
    model.ran.push(...ran);
  });

/** One generated run of 24 steps (a check, a scheduled task, or a task run) against the model, `at` from 1 to 8 or never; whether its event landed. */
const modelRun = (next: () => number, run: number) => {
  const at = pick(next, [1, 2, 3, 4, 5, 6, 7, 8, Number.POSITIVE_INFINITY]);
  const queue: Array<() => void> = [];
  const seen: Array<string> = [];
  const { counted, scheduler } = yieldingAt(at, () => seen.push('deliver'), queued(queue));
  const dispatcher = scheduler.makeDispatcher();
  const model: Model = { checks: 0, pending: false, delivered: false, queue: [], ran: [] };
  for (let step = 0; step < 24; step += 1) {
    const op = next();
    if (op < 0.45) {
      const yielded = scheduler.shouldYield(FIBER);
      model.checks += 1;
      model.pending = model.checks === at;
      expect(yielded).toBe(model.pending);
    } else if (op < 0.8) {
      const id = `task${step}`;
      dispatcher.scheduleTask(() => seen.push(id), 0);
      modelSchedules(model, `task${step}`);
    } else {
      const task = Option.fromNullishOr(queue.shift());
      expect(Option.isSome(modelRunsTask(model))).toBe(Option.isSome(task));
      Option.map(task, (run) => run());
    }
    expect({ run, step, checks: counted.checks, delivered: counted.delivered, seen }).toEqual({
      run,
      step,
      checks: model.checks,
      delivered: model.delivered,
      seen: model.ran,
    });
  }
  return model.delivered;
};

describe('yield points', () => {
  it('each service a native listener writes has a yield-point property, through the one shared scheduler', () => {
    const files = sources();
    const tests = files
      .filter((file) => file.startsWith('src/') && isTest(file))
      .map((file) => ({ file, imports: importsOf(file) }));
    const needing = files.filter((file) => isProduct(file) && needsYieldPoints(file, read(file)));
    expect(needing).toEqual(expect.arrayContaining(['src/voice.ts', 'src/dictation.ts']));
    const uncovered = needing.filter(
      (file) => !tests.some(({ imports }) => imports.has(file) && imports.has(HELPER)),
    );
    expect(uncovered).toEqual([]);
    const schedulers = files.filter(
      (file) => file !== SELF && file !== HELPER && readCode(file, read(file)).scheduler,
    );
    expect(schedulers).toEqual([]);
  });

  it('the reader finds exactly the generated modules that need one, over 300 sources', () => {
    const next = random(7);
    const seen = { needs: 0, not: 0 };
    for (let n = 0; n < 300; n += 1) {
      const { source, needs } = moduleOf(next);
      if (needs) seen.needs += 1;
      else seen.not += 1;
      expect({ n, source, needs: needsYieldPoints('x.ts', source) }).toEqual({ n, source, needs });
    }
    expect(seen.needs).toBeGreaterThan(30);
    expect(seen.not).toBeGreaterThan(30);
  });

  it('the scheduler yields at its at-th check alone and delivers once, before the task it resumes, as a reference model says', () => {
    const next = random(11);
    const delivered = Arr.makeBy(200, (run) => modelRun(next, run)).filter(Boolean).length;
    expect(delivered).toBeGreaterThan(20);
    expect(delivered).toBeLessThan(180);
  });
});
