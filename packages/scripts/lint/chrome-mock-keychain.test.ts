import { describe, expect, test } from 'bun:test';
import { Option, Predicate } from 'effect';
import { Testing } from 'oxlint-plugin-effect/rule-bindings';
import { type Node, parseSync, visitorKeys } from 'oxc-parser';
import { chromeMockKeychain } from './chrome-mock-keychain.ts';

/** Whether a value read off a node is a node: an object with a string `type`. */
const isNode = (value: unknown): value is Node =>
  Predicate.hasProperty(value, 'type') && Predicate.isString(value.type);

/** The child nodes of `node`, in source order, by the parser's own visitor keys. */
const childrenOf = (node: Node): ReadonlyArray<Node> =>
  (visitorKeys[node.type] ?? []).flatMap((key) => {
    const value: unknown = Reflect.get(node, key);
    if (Array.isArray(value)) return value.filter(isNode);
    return Option.toArray(Option.liftPredicate(value, isNode));
  });

/** Every node under `node`, outer first, each given its `parent` as oxlint gives it. */
const nodesOf = (node: Node): ReadonlyArray<Node> =>
  childrenOf(node).flatMap((child) => {
    Reflect.set(child, 'parent', node);
    return [child, ...nodesOf(child)];
  });

/** How many argument lists the rule reports in `source`, run on the parser's tree as oxlint walks it. */
const reportsIn = (source: string) => {
  const nodes = nodesOf(parseSync('launch.ts', source).program);
  return Testing.runRuleMulti(
    chromeMockKeychain,
    nodes
      .filter((node) => node.type === 'ArrayExpression')
      .map((node) => [node.type, node] as const),
    { filename: 'launch.ts', sourceText: source },
  ).length;
};

const KEYCHAIN = "'--use-mock-keychain', '--password-store=basic'";

describe('manna/chrome-mock-keychain', () => {
  test.each([
    ["spawn([chrome, '--headless=new', '--remote-debugging-port=0', 'about:blank'])"],
    ["spawn([chrome, '--remote-debugging-pipe', '--use-mock-keychain'])"],
    ["spawn([chrome, '--remote-debugging-pipe', '--password-store=basic'])"],
    ['spawn([chrome, `--remote-debugging-port=${port}`, `--user-data-dir=${dir}`])'],
    ["const QUIET = ['--mute-audio']; spawn([chrome, '--remote-debugging-pipe', ...QUIET])"],
  ])('a DevTools launch without both keychain flags is reported: %s', (source) => {
    expect(reportsIn(source)).toBe(1);
  });

  test.each([
    [`spawn([chrome, '--headless=new', '--remote-debugging-port=0', ${KEYCHAIN}, 'about:blank'])`],
    [`spawn([chrome, \`--remote-debugging-port=\${port}\`, ${KEYCHAIN}])`],
    [`const KEYCHAIN = [${KEYCHAIN}]; spawn([chrome, '--remote-debugging-pipe', ...KEYCHAIN])`],
    [
      `export const KEYCHAIN = [${KEYCHAIN}]; const flags = () => ['--remote-debugging-pipe', ...KEYCHAIN];`,
    ],
    ["const OWNED = ['--user-data-dir=', '--remote-debugging-'];"],
    ["spawn([chrome, '--headless=new', '--dump-dom', url])"],
  ])('a launch with both flags, or no DevTools launch, is not reported: %s', (source) => {
    expect(reportsIn(source)).toBe(0);
  });
});
