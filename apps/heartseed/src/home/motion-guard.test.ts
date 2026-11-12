/* oxlint-disable effect/noNodeBuiltinImport, effect/noNullish -- the source guard reads local product files; absent parser nodes and unresolved bindings are nullish. */

import { expect, it } from 'bun:test';
import { Predicate } from 'effect';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { parseSync, Visitor, type JSXAttribute, type Node } from 'oxc-parser';

const APP = join(import.meta.dir, '..', '..');
const MOVES = 'src/field/moves.tsx';
const GROWING = 'src/first/growing.tsx';
/** The drawing adapters, each owning exactly one effect: the sway's and the growing seed's. */
const EFFECTS = [MOVES, GROWING];
/** The growing seed's files, which name no host clock: its loop runs on Reanimated's clock alone. */
const CLOCKLESS = [GROWING, 'src/first/growth.ts'];
const HOST_CLOCKS = ['setTimeout', 'setInterval', 'requestAnimationFrame', 'Date', 'performance'];
const SHEETS = ['src/settings/sheet.tsx', 'src/shelves/sheet.tsx'];
const MOTION_PROPS = ['entering', 'exiting', 'layout'];
const OPTIONS_CALLS = ['withTiming', 'withSpring'];
const POSITIONAL_CALLS = new Map([
  ['withDelay', 2],
  ['withRepeat', 4],
  ['withSequence', 0],
]);
const CSS_MOTION =
  /^(animation|transition)(Name|Duration|Delay|TimingFunction|IterationCount|Direction|FillMode|PlayState|Property|Composition|Range|RangeStart|RangeEnd|Timeline|Behavior)?$/;

interface Source {
  readonly path: string;
  readonly text: string;
}

interface Site {
  readonly path: string;
  readonly line: number;
}

/** The guard judges product sources, never its own seeds or the frame rigs. */
const sourcesUnder = (folder: string): readonly Source[] =>
  readdirSync(join(APP, folder), { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => relative(APP, join(entry.parentPath, entry.name)))
    .filter((path) => /\.tsx?$/.test(path) && !/\.test\.tsx?$/.test(path))
    .toSorted()
    .map((path) => ({ path, text: readFileSync(join(APP, path), 'utf8') }));

/** One diagnostic carries the source, its line and the independent motion rule. */
const diagnostic = (site: Site, rule: string) => `${site.path}:${site.line}: M7/${rule}`;

/** Every effect belongs to a drawing adapter, and the sway and the growing seed have exactly one each. */
const effectFaults = (effects: readonly Site[]): readonly string[] => {
  const missing = EFFECTS.filter((path) => !effects.some((site) => site.path === path)).map(
    (path) => diagnostic({ path, line: 1 }, 'one-effect'),
  );
  const owned = new Set<string>();
  const extra = effects.flatMap((site) => {
    if (!EFFECTS.includes(site.path) || owned.has(site.path))
      return [diagnostic(site, 'one-effect')];
    owned.add(site.path);
    return [];
  });
  return [...missing, ...extra];
};

const attributeValue = (attribute: JSXAttribute | undefined): Node | null | undefined => {
  if (attribute?.value?.type === 'JSXExpressionContainer') return attribute.value.expression;
  return attribute?.value;
};

const hiddenAttribute = (attribute: JSXAttribute | undefined): boolean => {
  if (!attribute) return false;
  const value = attributeValue(attribute);
  return (
    value === null ||
    (value?.type === 'Literal' && (value.value === true || value.value === 'true'))
  );
};

/** M7 is checked structurally, following imported aliases and local memoized builders. */
const inspect = ({ path, text }: Source) => {
  const parsed = parseSync(path, text, { sourceType: 'module', preserveParens: false });
  const faults: string[] = [];
  const effects: Site[] = [];
  const imports = new Map<string, string>();
  const bindings: Array<{ readonly name: string; readonly value: Node; readonly at: Node }> = [];
  const blocks: Node[] = [];
  const keyframes = new Map<number, Node>();
  let entering = 0;
  let repeats = 0;
  let modals = 0;
  const site = (node: { readonly start: number }): Site => ({
    path,
    line: text.slice(0, node.start).split('\n').length,
  });
  const fault = (node: { readonly start: number }, rule: string) =>
    void faults.push(diagnostic(site(node), rule));
  const propertyName = (node: Node | undefined | null): string => {
    if (node?.type === 'Identifier' || node?.type === 'JSXIdentifier') return node.name;
    if (node?.type === 'Literal' && Predicate.isString(node.value)) return node.value;
    return '';
  };
  const nameOf = (node: Node | undefined | null): string => {
    if (node?.type === 'Identifier' || node?.type === 'JSXIdentifier')
      return imports.get(node.name) ?? node.name;
    if (node?.type === 'Literal' && Predicate.isString(node.value)) return node.value;
    if (node?.type === 'MemberExpression' || node?.type === 'JSXMemberExpression')
      return propertyName(node.property);
    return '';
  };
  const contains = (outer: Node, inner: Node) =>
    outer.start <= inner.start && outer.end >= inner.end;
  const scopeOf = (node: Node): Node => {
    let scope: Node = parsed.program;
    for (const block of blocks)
      if (contains(block, node) && block.end - block.start < scope.end - scope.start) scope = block;
    return scope;
  };
  const resolve = (
    node: Node | undefined | null,
    seen = new Set<string>(),
  ): Node | undefined | null => {
    if (node?.type === 'Identifier' && !seen.has(node.name)) {
      const binding = bindings
        .filter((entry) => entry.name === node.name)
        .map((entry) => ({ ...entry, scope: scopeOf(entry.at) }))
        .filter((entry) => contains(entry.scope, node))
        .toSorted((a, b) => a.scope.end - a.scope.start - (b.scope.end - b.scope.start))[0];
      if (binding) return resolve(binding.value, new Set([...seen, node.name]));
    }
    if (node?.type === 'CallExpression' && nameOf(node.callee) === 'useMemo')
      return resolve(node.arguments[0], seen);
    if (node?.type === 'ArrowFunctionExpression' || node?.type === 'FunctionExpression') {
      if (!node.body) return undefined;
      if (node.body.type !== 'BlockStatement') return resolve(node.body, seen);
      const returned = node.body.body.find((statement) => statement.type === 'ReturnStatement');
      if (returned?.type === 'ReturnStatement') return resolve(returned.argument, seen);
      return undefined;
    }
    return node;
  };
  const system = (value: Node | undefined | null): boolean => {
    const node = resolve(value);
    return (
      node?.type === 'MemberExpression' &&
      nameOf(node.object) === 'ReduceMotion' &&
      nameOf(node.property) === 'System'
    );
  };
  const endsSystem = (value: Node | undefined | null): boolean => {
    const node = resolve(value);
    return (
      node?.type === 'CallExpression' &&
      node.callee.type === 'MemberExpression' &&
      nameOf(node.callee.property) === 'reduceMotion' &&
      node.arguments.length === 1 &&
      system(node.arguments[0])
    );
  };
  const rootKeyframe = (node: Node): Node | undefined => {
    if (node.type === 'NewExpression' && nameOf(node.callee) === 'Keyframe') return node;
    if (node.type === 'CallExpression' && node.callee.type === 'MemberExpression')
      return rootKeyframe(node.callee.object);
    return undefined;
  };
  const systemOptions = (value: Node | undefined): boolean => {
    const options = resolve(value);
    if (options?.type !== 'ObjectExpression') return false;
    const setting = options.properties.findLast(
      (property) => property.type === 'Property' && propertyName(property.key) === 'reduceMotion',
    );
    if (setting?.type !== 'Property' || !system(setting.value)) return false;
    return !options.properties.some(
      (property) => property.type === 'SpreadElement' && property.start > setting.start,
    );
  };
  new Visitor({
    BlockStatement: (node) => void blocks.push(node),
    ImportDeclaration: (node) => {
      for (const specifier of node.specifiers ?? []) {
        if (specifier.type !== 'ImportSpecifier') continue;
        const imported = nameOf(specifier.imported);
        imports.set(specifier.local.name, imported);
        if (
          node.source.value === 'react-native' &&
          ['Animated', 'LayoutAnimation'].includes(imported)
        )
          fault(specifier, 'native-animation');
      }
    },
    VariableDeclarator: (node) => {
      if (node.id.type === 'Identifier' && node.init)
        bindings.push({ name: node.id.name, value: node.init, at: node });
    },
  }).visit(parsed.program);
  new Visitor({
    CallExpression: (node) => {
      const root = rootKeyframe(node);
      if (root && (!keyframes.has(root.start) || node.end > (keyframes.get(root.start)?.end ?? 0)))
        keyframes.set(root.start, node);
    },
  }).visit(parsed.program);
  new Visitor({
    Identifier: (node) => {
      const name = nameOf(node);
      if (['ReducedMotionConfig', 'useReducedMotion'].includes(name)) fault(node, 'system-only');
      if (CLOCKLESS.includes(path) && HOST_CLOCKS.includes(node.name)) fault(node, 'no-host-clock');
    },
    JSXIdentifier: (node) => {
      if (nameOf(node) === 'ReducedMotionConfig') fault(node, 'system-only');
    },
    Property: (node) => {
      if (CSS_MOTION.test(propertyName(node.key))) fault(node, 'no-css-motion');
    },
    MemberExpression: (node) => {
      if (CSS_MOTION.test(propertyName(node.property))) fault(node, 'no-css-motion');
      if (
        nameOf(node.object) === 'ReduceMotion' &&
        ['Never', 'Always'].includes(nameOf(node.property))
      )
        fault(node, 'system-only');
      if (
        ['Animated', 'LayoutAnimation'].includes(nameOf(node.property)) &&
        node.object.type === 'Identifier'
      ) {
        const object = node.object;
        const native = parsed.program.body.some(
          (statement) =>
            statement.type === 'ImportDeclaration' &&
            statement.source.value === 'react-native' &&
            statement.specifiers?.some((specifier) => specifier.local.name === object.name),
        );
        if (native) fault(node, 'native-animation');
      }
    },
    NewExpression: (node) => {
      if (nameOf(node.callee) === 'Keyframe' && !endsSystem(keyframes.get(node.start) ?? node))
        fault(node, 'builder-system');
    },
    CallExpression: (node) => {
      const name = nameOf(node.callee);
      if (name === 'useEffect') effects.push(site(node));
      if (name === 'withRepeat') repeats++;
      if (OPTIONS_CALLS.includes(name) && !systemOptions(node.arguments[1]))
        fault(node, 'options-system');
      const position = POSITIONAL_CALLS.get(name);
      if (position !== undefined && !system(node.arguments[position]))
        fault(node, 'argument-system');
    },
    JSXOpeningElement: (node) => {
      const attrs = node.attributes.filter((attribute) => attribute.type === 'JSXAttribute');
      const hidden = attrs.findLast((attribute) => nameOf(attribute.name) === 'aria-hidden');
      const isHidden = hiddenAttribute(hidden);
      for (const attribute of attrs) {
        const name = nameOf(attribute.name);
        if (CSS_MOTION.test(name)) fault(attribute, 'no-css-motion');
        if (!MOTION_PROPS.includes(name)) continue;
        if (name === 'entering') entering++;
        if (!isHidden || nameOf(node.name) === 'Text') fault(attribute, 'hidden-drawing');
        if (
          attribute.value?.type !== 'JSXExpressionContainer' ||
          !endsSystem(attribute.value.expression)
        )
          fault(attribute, 'builder-system');
      }
      if (nameOf(node.name) === 'Modal' && SHEETS.includes(path)) {
        modals++;
        const animation = attrs.findLast((attribute) => nameOf(attribute.name) === 'animationType');
        const value = attributeValue(animation);
        if (value?.type !== 'Literal' || value.value !== 'slide') fault(node, 'slide-sheet');
      }
    },
  }).visit(parsed.program);
  if (parsed.errors.length > 0) fault({ start: 0 }, 'parse');
  if (SHEETS.includes(path) && modals !== 1) fault({ start: 0 }, 'one-modal');
  return { faults: [...new Set(faults)], effects, entering, repeats };
};

const seed = (rule: string, text: string, path = MOVES, line = 2) => ({ rule, text, path, line });
const BAD = [
  ...MOTION_PROPS.map((prop) =>
    seed('builder-system', `<Animated.View aria-hidden ${prop}={FadeInDown.duration(300)} />`),
  ),
  seed(
    'builder-system',
    'const entry = FadeInDown.reduceMotion(ReduceMotion.System).delay(70);\n<Animated.View aria-hidden entering={entry} />;',
    MOVES,
    3,
  ),
  seed(
    'builder-system',
    'const entry = useMemo(() => FadeInDown.duration(300), []);\n<Animated.View aria-hidden entering={entry} />;',
    MOVES,
    3,
  ),
  seed(
    'builder-system',
    'function Icon() { const entering = useMemo(() => FadeInDown.duration(300), []); return <Animated.View aria-hidden entering={entering} />; }\nfunction Plant() { const entering = useMemo(() => new Keyframe({}).reduceMotion(ReduceMotion.System), []); return <Animated.View aria-hidden entering={entering} />; }',
  ),
  seed('builder-system', 'new Keyframe({}).duration(420);'),
  seed('builder-system', 'new Keyframe({}).reduceMotion(ReduceMotion.System).delay(70);'),
  seed('system-only', 'FadeInDown.reduceMotion(ReduceMotion.Never);'),
  seed('system-only', 'FadeInDown.reduceMotion(ReduceMotion.Always);'),
  seed(
    'system-only',
    'import { ReduceMotion as Motion } from "react-native-reanimated";\nFadeInDown.reduceMotion(Motion.Never);',
    MOVES,
    3,
  ),
  seed(
    'system-only',
    'import { ReducedMotionConfig as MotionConfig } from "react-native-reanimated";',
  ),
  seed(
    'system-only',
    'import { useReducedMotion as reduced } from "react-native-reanimated";\nreduced();',
  ),
  seed(
    'system-only',
    'import * as Motion from "react-native-reanimated";\n<Motion.ReducedMotionConfig />;',
    MOVES,
    3,
  ),
  ...OPTIONS_CALLS.flatMap((call) => [
    seed('options-system', `${call}(3);`),
    seed('options-system', `${call}(3, { duration: 900 });`),
    seed('options-system', `${call}(3, { reduceMotion: ReduceMotion.Never });`),
    seed('options-system', `${call}(3, { reduceMotion: ReduceMotion.System, ...options });`),
  ]),
  seed('argument-system', 'withDelay(70, animation);'),
  seed('argument-system', 'withRepeat(animation, -1, false, undefined);'),
  seed('argument-system', 'withSequence(animation, ReduceMotion.System);'),
  seed(
    'argument-system',
    'import { withRepeat as repeat } from "react-native-reanimated";\nrepeat(animation, -1, false, undefined);',
    MOVES,
    3,
  ),
  ...MOTION_PROPS.map((prop) =>
    seed('hidden-drawing', `<View ${prop}={FadeInDown.reduceMotion(ReduceMotion.System)} />;`),
  ),
  seed(
    'hidden-drawing',
    '<Animated.View aria-hidden={false} entering={FadeInDown.reduceMotion(ReduceMotion.System)} />;',
  ),
  seed(
    'hidden-drawing',
    '<Animated.Text aria-hidden entering={FadeInDown.reduceMotion(ReduceMotion.System)} />;',
  ),
  seed('no-css-motion', 'const style = { animationName: "sway" };'),
  seed('no-css-motion', 'const style = { "animationDuration": "900ms" };'),
  seed('no-css-motion', 'const style = { transitionProperty: "transform" };'),
  seed('no-css-motion', 'style.animationDelay = "90ms";'),
  seed('no-css-motion', '<Animated.View animationDuration="900ms" />;'),
  seed('native-animation', 'import { Animated as Motion } from "react-native";'),
  seed('native-animation', 'import { LayoutAnimation as Layout } from "react-native";'),
  seed(
    'native-animation',
    'import * as Native from "react-native";\nNative.Animated.timing(value);',
    MOVES,
    3,
  ),
  ...HOST_CLOCKS.map((clock) => seed('no-host-clock', `${clock}.call(undefined);`, GROWING)),
  seed('no-host-clock', 'const now = Date.now();', 'src/first/growth.ts'),
  ...SHEETS.flatMap((path) => [
    seed('slide-sheet', '<Modal animationType="fade" />;', path),
    seed('slide-sheet', '<Modal />;', path),
    seed('one-modal', '<View />;', path, 1),
    seed(
      'one-modal',
      '<><Modal animationType="slide" /><Modal animationType="slide" /></>;',
      path,
      1,
    ),
  ]),
];

it('keeps scoped drawings on explicit System motion, both sheets sliding, the sway’s and the growing seed’s one effect each, and no host clock in the growing seed', () => {
  const sources = [
    ...['home', 'field', 'settings', 'shelves', 'run', 'first'].flatMap((folder) =>
      sourcesUnder(`src/${folder}`),
    ),
    { path: 'app/index.tsx', text: readFileSync(join(APP, 'app/index.tsx'), 'utf8') },
  ];
  const reports = sources.map(inspect);
  expect(reports.flatMap((report) => report.faults)).toEqual([]);
  expect(effectFaults(reports.flatMap((report) => report.effects))).toEqual([]);
  expect(reports.reduce((sum, report) => sum + report.entering, 0)).toBeGreaterThan(0);
  expect(reports.reduce((sum, report) => sum + report.repeats, 0)).toBeGreaterThan(0);
});

it('rejects every seeded motion violation by file, line and rule', () => {
  expect(BAD).toHaveLength(53);
  for (const [index, source] of BAD.entries()) {
    const report = inspect({ ...source, text: `\n${source.text}` });
    expect(report.faults, `seed ${index}: ${source.rule}`).toContain(
      `${source.path}:${source.line}: M7/${source.rule}`,
    );
  }
});

it('rejects missing, misplaced and second product effects with their source locations', () => {
  const growing = { path: GROWING, text: '\nuseEffect(() => {});' };
  const cases = [
    { sources: [], faults: [`${MOVES}:1: M7/one-effect`, `${GROWING}:1: M7/one-effect`] },
    {
      sources: [{ path: MOVES, text: '\nuseEffect(() => {});\nuseEffect(() => {});' }, growing],
      faults: [`${MOVES}:3: M7/one-effect`],
    },
    {
      sources: [{ path: 'src/run/tended.tsx', text: '\nuseEffect(() => {});' }, growing],
      faults: [`${MOVES}:1: M7/one-effect`, 'src/run/tended.tsx:2: M7/one-effect'],
    },
    {
      sources: [
        { path: MOVES, text: '\nuseEffect(() => {});' },
        growing,
        { path: 'src/home/extra.tsx', text: '\nReact.useEffect(() => {});' },
      ],
      faults: ['src/home/extra.tsx:2: M7/one-effect'],
    },
    {
      sources: [
        { path: MOVES, text: '\nuseEffect(() => {});' },
        { path: GROWING, text: '\nuseEffect(() => {});\n\nuseEffect(() => {});' },
      ],
      faults: [`${GROWING}:4: M7/one-effect`],
    },
    {
      sources: [{ path: MOVES, text: '\nuseEffect(() => {});' }],
      faults: [`${GROWING}:1: M7/one-effect`],
    },
  ];
  expect(cases).toHaveLength(6);
  for (const cell of cases)
    expect(effectFaults(cell.sources.flatMap((source) => inspect(source).effects))).toEqual(
      cell.faults,
    );
});

it('accepts explicit motion through renamed imports and memoized builders without reading comments as code', () => {
  const report = inspect({
    path: MOVES,
    text: `
import { Keyframe as Frames, ReduceMotion as Motion, withTiming as timing, withSpring as spring, withDelay as delay, withRepeat as repeat, withSequence as sequence } from 'react-native-reanimated';
import { useEffect as effect, useMemo as memo } from 'react';
// ReduceMotion.Never, useReducedMotion, animationName and another useEffect are not code.
const icon = memo(() => FadeInDown.delay(90).reduceMotion(Motion.System), [90]);
const plant = memo(() => new Frames({}).delay(70).reduceMotion(Motion.System), [70]);
const options = { duration: 900, reduceMotion: Motion.System };
effect(() => repeat(sequence(Motion.System, timing(3, options), spring(0, options)), -1, false, undefined, Motion.System), []);
delay(70, animation, Motion.System);
<><Animated.View aria-hidden entering={icon} /><Animated.View aria-hidden={true} exiting={plant} /><Animated.View aria-hidden="true" layout={FadeInDown.reduceMotion(Motion.System)} /></>;
`,
  });
  expect(report.faults).toEqual([]);
  expect(effectFaults([...report.effects, { path: GROWING, line: 2 }])).toEqual([]);
  expect(report.entering).toBe(1);
  expect(report.repeats).toBe(1);
  for (const path of SHEETS)
    expect(inspect({ path, text: '<Modal animationType="slide" />;' }).faults).toEqual([]);
});
