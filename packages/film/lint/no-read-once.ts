import { Effect, Option } from 'effect';
import {
  Diagnostic,
  type ESTree,
  Rule,
  RuleContext,
  Visitor,
} from 'oxlint-plugin-effect/rule-bindings';
import { type Bindings, bindings, memberName } from './nodes.ts';

/** A call to `evaluate`: `page.evaluate(…)`, or a local helper by that name. */
const isEvaluate = (call: ESTree.CallExpression): boolean => {
  const callee = call.callee;
  if (callee.type === 'Identifier') return callee.name === 'evaluate';
  return callee.type === 'MemberExpression' && Option.contains(memberName(callee), 'evaluate');
};

/** A call of the test runner's `expect` (`bun:test`'s, `effect-bun-test`'s, or bun's global), by its binding. */
const isExpect = (b: Bindings, call: ESTree.CallExpression): boolean =>
  b.isRunner(call.callee, 'expect');

/** A matcher on an expectation: `expect(…).toBe(…)`, `expect(…).not.toEqual(…)`. */
const isMatcher = (b: Bindings, call: ESTree.CallExpression): boolean => {
  let at: ESTree.Node = call.callee;
  while (at.type === 'MemberExpression') at = at.object;
  return at.type === 'CallExpression' && isExpect(b, at);
};

/** Nodes that hand the value they wrap on unchanged: `yield*`, `await`, a cast. */
const PASSES_ON = new Set([
  'YieldExpression',
  'AwaitExpression',
  'TSAsExpression',
  'TSSatisfiesExpression',
  'TSNonNullExpression',
  'ParenthesizedExpression',
]);

/** Nodes that hold the value they take: `{ canvas }`, `{ ...strip }`, `[a, b]`. */
const HOLDS = new Set(['Property', 'SpreadElement', 'ObjectExpression', 'ArrayExpression']);

/** Nodes whose value is computed from what they take: `after - before`, `!open`, `a ?? b`, `x ? a : b`, `` `at ${hash}` ``. */
const DERIVES = new Set([
  'BinaryExpression',
  'UnaryExpression',
  'LogicalExpression',
  'ConditionalExpression',
  'TemplateLiteral',
]);

type Asserted = Effect.Effect<boolean, never, RuleContext>;

/** Whether any of `checks` answers true. */
const anyOf = (checks: ReadonlyArray<Asserted>): Asserted =>
  Effect.map(Effect.all(checks), (answers) => answers.some(Boolean));

/** A read of a helper's name that calls it: `shownT(page)`. */
const callOf = (id: ESTree.Node): ReadonlyArray<ESTree.Node> =>
  Option.toArray(
    Option.filter(
      Option.fromNullishOr(id.parent),
      (up) => up.type === 'CallExpression' && up.callee === id,
    ),
  );

/**
 * The reads of what a `const` declarator binds: each read of the name, or for
 * a helper (`const shownT = (page) => …`) each call of it. A declarator met
 * before on the way is not followed again.
 */
const readsOf = (
  declarator: ESTree.VariableDeclarator,
  seen: ReadonlySet<ESTree.Node>,
  helper: boolean,
): Asserted =>
  Effect.flatMap(bindings, (b) => {
    if (seen.has(declarator)) return Effect.succeed(false);
    const next = new Set([...seen, declarator]);
    const reads = b.readsOf(declarator).flatMap((id) => {
      if (helper) return callOf(id);
      return [id];
    });
    return anyOf(reads.map((read) => asserted(read, next)));
  });

/** Whether the arrow `up`, answering `n`, hands it to a call or makes a helper of it. */
const arrowAnswers = (
  n: ESTree.Node,
  up: ESTree.ArrowFunctionExpression,
  seen: ReadonlySet<ESTree.Node>,
): Asserted => {
  if (up.body !== n) return Effect.succeed(false);
  if (up.parent.type === 'CallExpression') return asserted(up, seen);
  if (up.parent.type === 'VariableDeclarator' && up.parent.init === up)
    return readsOf(up.parent, seen, true);
  return Effect.succeed(false);
};

/** Whether the call `up`, taking `n`, asserts it or answers it on. */
const callTakes = (
  n: ESTree.Node,
  up: ESTree.CallExpression,
  seen: ReadonlySet<ESTree.Node>,
): Asserted => {
  if (up.callee === n) return asserted(up, seen);
  if (!up.arguments.some((a) => a === n)) return Effect.succeed(false);
  return Effect.flatMap(bindings, (b) => {
    if (isExpect(b, up) || isMatcher(b, up)) return Effect.succeed(true);
    return asserted(up, seen);
  });
};

/**
 * Whether `expect(…)` asserts the value `n` answers, or a matcher compares with
 * it, past what only hands it on (`yield*`, `await`, a cast), a call that
 * takes it (`Effect.map(…)`, `x.pipe(…)`), a part of it
 * (`box.canvas`), a literal that holds it, a value computed from it
 * (arithmetic, a test, a template), a `const` bound to it (each read
 * of the name), and a local helper whose arrow answers it (each call).
 */
const asserted = (n: ESTree.Node, seen: ReadonlySet<ESTree.Node>): Asserted => {
  if (n.type === 'Program') return Effect.succeed(false);
  const up = n.parent;
  if (PASSES_ON.has(up.type) || HOLDS.has(up.type) || DERIVES.has(up.type))
    return asserted(up, seen);
  if (up.type === 'MemberExpression' && up.object === n) return asserted(up, seen);
  if (up.type === 'ArrowFunctionExpression') return arrowAnswers(n, up, seen);
  if (up.type === 'VariableDeclarator' && up.init === n) return readsOf(up, seen, false);
  if (up.type === 'CallExpression') return callTakes(n, up, seen);
  return Effect.succeed(false);
};

/** The read a call makes once, when it is an `evaluate` whose answer is asserted. */
const refused = (call: ESTree.CallExpression) => {
  if (!isEvaluate(call)) return Effect.succeedNone;
  return Effect.map(asserted(call, new Set()), (yes) =>
    Option.filter(Option.some('evaluate'), () => yes),
  );
};

export const noReadOnce = Rule.define({
  name: 'no-read-once',
  meta: Rule.meta({
    type: 'problem',
    description:
      'A lab browser test waits for the value it asserts (fixtures/settled.ts); a one-shot read of the page takes whatever was drawn at that instant.',
  }),
  create: function* () {
    const context = yield* RuleContext;
    return Visitor.on('CallExpression', (node) =>
      Effect.flatMap(refused(node), (found) =>
        Option.match(found, {
          onNone: () => Effect.void,
          onSome: (name) =>
            context.report(
              Diagnostic.make({
                node,
                message: `${name} reads the page once, whatever it had drawn at that instant: wait for the value instead (textIs, textHas, countIs, evaluates or until in lab/fixtures/settled.ts).`,
              }),
            ),
        }),
      ),
    );
  },
});
