import { Effect, Option, Schema } from 'effect';
import {
  Diagnostic,
  type ESTree,
  Rule,
  RuleContext,
  Visitor,
} from 'oxlint-plugin-effect/rule-bindings';
import {
  ancestors,
  type Bindings,
  bindings,
  collect,
  keyName,
  memberName,
  type Module,
} from './nodes.ts';

const BUN_DEFAULT_MS = 5_000;

const WEAKENERS = new Set(['skip', 'only', 'todo', 'failing', 'skipIf', 'todoIf', 'if', 'runIf']);

const PREFIXED = ['xit', 'xtest', 'xdescribe', 'fit', 'fdescribe'];

const Options = Schema.UndefinedOr(Schema.Struct({ timeouts: Schema.optionalKey(Schema.Boolean) }));

const isFunction = (n: ESTree.Node) =>
  n.type === 'ArrowFunctionExpression' || n.type === 'FunctionExpression';

const rootOf = (n: ESTree.Node): Option.Option<ESTree.Node> => {
  if (n.type === 'Identifier') return Option.some(n);
  if (n.type === 'MemberExpression') return rootOf(n.object);
  if (n.type === 'CallExpression') return rootOf(n.callee);
  return Option.none();
};

const onRunner = (b: Bindings, n: ESTree.Node) =>
  Option.exists(
    rootOf(n),
    (root) => b.isRunner(root, 'it') || b.isRunner(root, 'test') || b.isRunner(root, 'describe'),
  );

const isSuiteCall = (b: Bindings, call: ESTree.CallExpression) =>
  Option.exists(rootOf(call.callee), (root) => b.isRunner(root, 'describe'));

const isCase = (b: Bindings, n: ESTree.Node): n is ESTree.CallExpression =>
  n.type === 'CallExpression' && onRunner(b, n.callee) && n.arguments.some(isFunction);

const isBun: Module = (from) => from === 'bun';
const isNodeChildProcess: Module = (from) =>
  from === 'node:child_process' || from === 'child_process';
const isProcess: Module = (from) => from === 'effect/process';
const isChildProcess: Module = (from) => from === 'effect/process/ChildProcess';
const BUN_SPAWNS = ['spawn', 'spawnSync'];
const NODE_SPAWNS = ['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync', 'fork'];

const isChildProcessModule = (b: Bindings, n: ESTree.Node) =>
  b.readsImport(n, isProcess, 'ChildProcess') || b.importsAs(n, isChildProcess, '*');

const startsProcess = (b: Bindings, call: ESTree.CallExpression): boolean => {
  const callee = call.callee;
  if (callee.type === 'MemberExpression')
    return Option.exists(memberName(callee), (name) => {
      if (BUN_SPAWNS.includes(name) && b.isGlobal(callee.object, 'Bun')) return true;
      if (NODE_SPAWNS.includes(name) && b.importsAs(callee.object, isNodeChildProcess, '*'))
        return true;
      return name === 'make' && isChildProcessModule(b, callee.object);
    });
  if (callee.type !== 'Identifier') return false;
  const imported = b.importOf(callee);
  if (
    Option.exists(
      imported,
      ({ from, name }) =>
        (isBun(from) && BUN_SPAWNS.includes(name)) ||
        (isNodeChildProcess(from) && NODE_SPAWNS.includes(name)) ||
        (isChildProcess(from) && name === 'make'),
    )
  )
    return true;
  return Option.exists(
    b.takenFrom(callee),
    ({ key, value }) => BUN_SPAWNS.includes(key) && b.isGlobal(value, 'Bun'),
  );
};

const declaresFunction = (d: ESTree.VariableDeclarator) =>
  Option.exists(
    Option.fromNullOr(d.init),
    (init) =>
      isFunction(init) || (init.type === 'CallExpression' && init.callee.type === 'CallExpression'),
  );

const atTop = (d: ESTree.VariableDeclarator) => {
  const declaration = d.parent;
  return (
    declaration.type === 'VariableDeclaration' &&
    (declaration.parent.type === 'Program' ||
      (declaration.parent.type === 'ExportNamedDeclaration' &&
        declaration.parent.parent.type === 'Program'))
  );
};

const hostOf = (b: Bindings, n: ESTree.Node): Option.Option<ESTree.Node> => {
  for (const a of ancestors(n)) {
    if (isCase(b, a)) return Option.some(a);
    if (
      a.type === 'VariableDeclarator' &&
      a.id.type === 'Identifier' &&
      (declaresFunction(a) || atTop(a))
    )
      return Option.some(a.id);
    if (a.type === 'FunctionDeclaration') return Option.fromNullOr(a.id);
  }
  return Option.none();
};

const calleeCall = (n: ESTree.Node): Option.Option<ESTree.CallExpression> => {
  const p = n.parent;
  if (p?.type === 'CallExpression' && p.callee === n) return Option.some(p);
  if (p?.type === 'MemberExpression' && p.parent.type === 'CallExpression' && p.parent.callee === p)
    return Option.some(p.parent);
  return Option.none();
};

const readAsName = (n: ESTree.Node) => {
  const p = n.parent;
  if (p?.type === 'MemberExpression') return p.object === n || p.computed;
  if (p?.type === 'Property') return p.value === n || p.computed;
  return true;
};

interface Sighting {
  readonly host: Option.Option<ESTree.Node>;
  readonly starts: boolean;
  readonly reads: Option.Option<ESTree.Node>;
}

const sightingOf =
  (b: Bindings) =>
  (n: ESTree.Node): Option.Option<Sighting> => {
    if (n.type !== 'Identifier') return Option.none();
    const starts = Option.exists(calleeCall(n), (call) => startsProcess(b, call));
    const reads = Option.filter(
      Option.flatMap(Option.liftPredicate(n, readAsName), (id) =>
        Option.map(b.definitionOf(id), (d): ESTree.Node => d.name),
      ),
      (binding) => binding !== n,
    );
    if (!starts && Option.isNone(reads)) return Option.none();
    return Option.some({ host: hostOf(b, n), starts, reads });
  };

const startingHosts = (sightings: ReadonlyArray<Sighting>) => {
  const starting = new Set<ESTree.Node>();
  let grew = true;
  while (grew) {
    grew = false;
    for (const sighting of sightings)
      Option.map(sighting.host, (host) => {
        if (starting.has(host)) return;
        if (sighting.starts || Option.exists(sighting.reads, (binding) => starting.has(binding))) {
          starting.add(host);
          grew = true;
        }
      });
  }
  return starting;
};

type Timeout =
  | { readonly _tag: 'None' }
  | { readonly _tag: 'Read'; readonly ms: number; readonly node: ESTree.Node }
  | { readonly _tag: 'Unread'; readonly node: ESTree.Node };

const NONE: Timeout = { _tag: 'None' };

const timeoutValue = (b: Bindings, n: ESTree.Node): Timeout =>
  Option.match(b.numberOf(n), {
    onNone: (): Timeout => ({ _tag: 'Unread', node: n }),
    onSome: (ms): Timeout => ({ _tag: 'Read', ms, node: n }),
  });

const propertyOf = (o: ESTree.ObjectExpression, key: string) =>
  Option.fromUndefinedOr(
    o.properties.find(
      (p): p is ESTree.ObjectProperty => p.type === 'Property' && Option.contains(keyName(p), key),
    ),
  );

const namedArguments = (call: ESTree.CallExpression) => {
  const body = call.arguments.findIndex(isFunction);
  return call.arguments.filter((_, at) => at !== body && (at !== 0 || body === 0));
};

const timeoutOf = (b: Bindings, call: ESTree.CallExpression): Timeout => {
  for (const argument of namedArguments(call)) {
    if (argument.type === 'SpreadElement') continue;
    if (argument.type !== 'ObjectExpression') return timeoutValue(b, argument);
    const timeout = propertyOf(argument, 'timeout');
    if (Option.isSome(timeout)) return timeoutValue(b, timeout.value.value);
  }
  return NONE;
};

const retryOf = (call: ESTree.CallExpression) =>
  Option.firstSomeOf(
    namedArguments(call).map((argument) =>
      Option.flatMap(
        Option.liftPredicate(
          argument,
          (a): a is ESTree.ObjectExpression => a.type === 'ObjectExpression',
        ),
        (options) => propertyOf(options, 'retry'),
      ),
    ),
  );

const raises = (timeout: Timeout) =>
  timeout._tag === 'Unread' ||
  (timeout._tag === 'Read' && (timeout.ms > BUN_DEFAULT_MS || timeout.ms <= 0));

const weakenerMessage = (member: string) =>
  `\`${member}\` runs a test less than every time: a test runs every time and passes as written. Fix what it tests and drop \`${member}\`, or delete the test with the code it held.`;

const PREFIX_MESSAGE =
  'a prefixed runner skips or focuses its test: a test runs every time and passes as written. Use the runner plainly, and fix what the test holds.';

const RETRY_MESSAGE =
  'a retry passes a test that fails: find why it fails (a race, a shared fixture, a wall clock) and fix that.';

const TIMEOUT_MESSAGE =
  "a timeout over bun's 5 s, or of 0 (none), on a test that starts no process: make the test fast (share its setup, use TestClock, run its work concurrently), never give it more time. A test that spawns names its spawn budget (effect/requireSpawnBudget).";

const DEFAULT_MESSAGE =
  "a default timeout over bun's 5 s, or of 0 (none), raises every test after it: make the slow tests fast, and give a test that spawns its own spawn budget.";

const weakenerAt = (b: Bindings, n: ESTree.MemberExpression) =>
  Option.flatMap(
    Option.filter(memberName(n), (name) => WEAKENERS.has(name) && onRunner(b, n.object)),
    (name) => Option.some(Diagnostic.make({ node: n.property, message: weakenerMessage(name) })),
  );

const setsDefault = (b: Bindings, call: ESTree.CallExpression) =>
  call.callee.type === 'Identifier' && b.isRunner(call.callee, 'setDefaultTimeout');

export const testsKeepTheirStrength = Rule.define({
  name: 'tests-keep-their-strength',
  meta: Rule.meta({
    type: 'problem',
    description:
      'A test runs every time at its full strength: no skip, only, todo, retry, or timeout over bun’s 5 s but a spawn budget.',
    schema: [
      {
        type: 'object',
        properties: { timeouts: { type: 'boolean' } },
        additionalProperties: false,
      },
    ],
  }),
  options: Options,
  create: function* (options) {
    const context = yield* RuleContext;
    const b = yield* bindings;
    const timeouts = options?.timeouts ?? true;
    const report = (node: ESTree.Node, message: string) =>
      context.report(Diagnostic.make({ node, message }));
    const members = Visitor.on('MemberExpression', (n) =>
      Option.match(weakenerAt(b, n), {
        onNone: () => Effect.void,
        onSome: (diagnostic) => context.report(diagnostic),
      }),
    );
    const prefixed = Visitor.on('Identifier', (n) =>
      Effect.asVoid(
        Effect.when(
          report(n, PREFIX_MESSAGE),
          Effect.succeed(
            PREFIXED.includes(n.name) &&
              n.parent.type === 'CallExpression' &&
              n.parent.callee === n &&
              b.isRunner(n, n.name),
          ),
        ),
      ),
    );
    const cases: Array<ESTree.CallExpression> = [];
    const defaults: Array<ESTree.CallExpression> = [];
    const calls = Visitor.on('CallExpression', (n) =>
      Effect.sync(() => {
        if (isCase(b, n)) cases.push(n);
        if (timeouts && setsDefault(b, n)) defaults.push(n);
      }),
    );
    const names = collect('Identifier', Option.some, (identifiers) => {
      const raising = cases.flatMap((call) => {
        const timeout = timeoutOf(b, call);
        if (!timeouts || timeout._tag === 'None' || !raises(timeout)) return [];
        return [{ call, node: timeout.node }];
      });
      const startingOf = () => {
        if (raising.length === 0) return new Set<ESTree.Node>();
        return startingHosts(identifiers.flatMap((n) => Option.toArray(sightingOf(b)(n))));
      };
      const starting = startingOf();
      const spawns = (call: ESTree.CallExpression) =>
        starting.has(call) ||
        (isSuiteCall(b, call) &&
          cases.some((inner) => starting.has(inner) && ancestors(inner).includes(call)));
      const retries = cases.flatMap((call) =>
        Option.toArray(Option.map(retryOf(call), (p) => ({ node: p, message: RETRY_MESSAGE }))),
      );
      const raised = raising
        .filter(({ call }) => !spawns(call))
        .map(({ node }) => ({ node, message: TIMEOUT_MESSAGE }));
      const raisedDefaults = defaults.flatMap((n) => {
        const value = Option.fromUndefinedOr(n.arguments[0]);
        if (Option.isNone(value) || value.value.type === 'SpreadElement') return [];
        if (!raises(timeoutValue(b, value.value))) return [];
        return [{ node: n, message: DEFAULT_MESSAGE }];
      });
      return Effect.forEach(
        [...retries, ...raised, ...raisedDefaults],
        (finding) => report(finding.node, finding.message),
        { discard: true },
      );
    });
    return Visitor.merge(Visitor.merge(members, prefixed), Visitor.merge(calls, names));
  },
});
