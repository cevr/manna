/* oxlint-disable effect/noNodeBuiltinImport -- the test reads the probes' sources and verify-heartseed's feature files from disk, synchronously, as `parts.test.ts` does. */

/**
 * A feature file of verify-heartseed quotes only the lines its probe
 * writes. A probe's texts are the template literals, string literals and JSX
 * texts of its sources (`app/probe/<name>.tsx`, and `src/<name>/probe.ts`
 * where there is one), each `${…}` of a template standing for any non-empty
 * text, and a template trimmed at its end (`.trimEnd()`) also standing
 * without its last gap. A text that opens with a lower-case field word and a
 * space is a line of that field. Over `features/*.md` and `SKILL.md`: each
 * `sim open probe/<name>… --expect "label=…"` (or `id=`) target fits, whole,
 * a text of that probe whose opening is not a gap; and in a file that names
 * `app/probe/<name>.tsx`, each quoted span (inline code outside fenced
 * blocks, white space folded) whose first word is a field word of that
 * probe is the word alone, fits one of that field's lines whole, or ends in
 * `…` and opens as one of them opens. A log line carries its tag
 * (`[natural] install done`), so it is no probe line. The rule holds a quote
 * to a line's literal skeleton; it does not judge a value or when a line
 * shows.
 */

import { describe, expect, it } from 'bun:test';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Predicate } from 'effect';
import { parseSync } from 'oxc-parser';

const APP = join(import.meta.dir, '..');
const SKILL = join(APP, '../../.claude/skills/verify-heartseed');

/** A text's literal parts: between each two, a gap of any non-empty text. */
type Parts = ReadonlyArray<string>;

/** A line of a field: the field word and the line's parts. */
interface Line {
  readonly field: string;
  readonly parts: Parts;
}

const FIELD = /^([a-z][a-z-]*) /gu;

const escaped = (text: string) => text.replaceAll(/[.*+?^${}()|[\]\\/]/gu, String.raw`\$&`);

/** Whether `text` fits `parts` whole, each gap any non-empty text. */
const fits = (parts: Parts, text: string) =>
  new RegExp(`^${parts.map(escaped).join('.+')}$`, 'u').test(text);

/** A node of the parsed tree, by the fields the reader reads. */
interface Node {
  readonly type: string;
  readonly start: number;
  readonly callee?: unknown;
  readonly property?: unknown;
  readonly object?: unknown;
  readonly quasis?: unknown;
  readonly value?: unknown;
}

/** Any value of the parsed tree, a node's field or the tree itself. */
type Field = Node[keyof Node];

const isNode = (value: Field): value is Node =>
  Predicate.hasProperty(value, 'type') &&
  Predicate.isString(value.type) &&
  Predicate.hasProperty(value, 'start');

/** Every node under `value`, depth first. */
const nodesOf = (value: Field): ReadonlyArray<Node> => {
  if (Array.isArray(value)) return value.flatMap(nodesOf);
  if (!Predicate.isObject(value)) return [];
  const inner = Object.values(value).flatMap(nodesOf);
  if (isNode(value)) return [value, ...inner];
  return inner;
};

/** The start of each template literal a `.trimEnd()` call trims. */
const trimmedStarts = (nodes: ReadonlyArray<Node>) =>
  new Set(
    nodes.flatMap((node) => {
      if (node.type !== 'CallExpression' || !isNode(node.callee)) return [];
      const { property, object } = node.callee;
      const named = Predicate.hasProperty(property, 'name') && property.name === 'trimEnd';
      if (!named || !isNode(object) || object.type !== 'TemplateLiteral') return [];
      return [object.start];
    }),
  );

/** The cooked text of each quasi of a template literal. */
const quasisOf = (node: Node): Parts =>
  [node.quasis].flat().map((quasi) => {
    if (!Predicate.hasProperty(quasi, 'value') || !Predicate.hasProperty(quasi.value, 'cooked'))
      return '';
    return String(quasi.value.cooked);
  });

/** The parts of every text a source writes: each template (and, trimmed at its end, without its last gap), string and JSX text. */
const textsIn = (path: string, source: string): ReadonlyArray<Parts> => {
  const nodes = nodesOf(parseSync(path, source).program);
  const trimmed = trimmedStarts(nodes);
  return nodes.flatMap((node): ReadonlyArray<Parts> => {
    if (node.type === 'TemplateLiteral') {
      const parts = quasisOf(node);
      const cut = parts.length > 1 && parts.at(-1) === '' && trimmed.has(node.start);
      if (!cut) return [parts];
      return [parts, [...parts.slice(0, -2), (parts.at(-2) ?? '').trimEnd()]];
    }
    if (node.type === 'Literal' && Predicate.isString(node.value)) return [[node.value]];
    if (node.type === 'JSXText')
      return [[String(node.value).replaceAll(/\s+/gu, ' ').trim()]].filter(([text]) => text !== '');
    return [];
  });
};

/** The lines among `texts`: each whose first part opens with a field word and a space. */
const linesOf = (texts: ReadonlyArray<Parts>): ReadonlyArray<Line> =>
  texts.flatMap((parts) =>
    [...(parts[0] ?? '').matchAll(FIELD)].map(([, field = '']) => ({ field, parts })),
  );

/** The line number of `index` in `text`. */
const lineAt = (text: string, index: number) => text.slice(0, index).split('\n').length;

/** A command's argument boundary: blanks, or a shell continuation (a backslash ending the line) and the next line's indent. */
const GAP = String.raw`(?:[ \t]|\\\n)+`;
/** A `sim open probe/<name>` command and its `--expect` target, over shell continuations. */
const TARGET = new RegExp(
  String.raw`sim${GAP}open${GAP}"?probe\/([a-z-]+)(?:\\\n|[^\n])*?${GAP}--expect${GAP}"(?:label|id)=([^"]+)"`,
  'gu',
);

/** Each `--expect` target of a `sim open probe/<name>` command, continued over lines or not, whose target fits no text of the probe that opens with a literal; the fault names the line the command's `sim` is on. */
const targetFaults = (
  file: string,
  text: string,
  textsOf: (name: string) => ReadonlyArray<Parts>,
) =>
  [...text.matchAll(TARGET)].flatMap((match) => {
    const [, name = '', target = ''] = match;
    const fitting = textsOf(name).some((parts) => parts[0] !== '' && fits(parts, target));
    if (fitting) return [];
    return [`${file}:${lineAt(text, match.index)}: target \`${target}\` (probe ${name})`];
  });

/** The quoted spans of `text` outside its fenced blocks: each with the line it starts on, its white space folded. */
const spansOf = (text: string) => {
  const prose = text.replaceAll(/^```[\s\S]*?^```/gmu, (block) => block.replaceAll(/[^\n]/gu, ' '));
  return [...prose.matchAll(/`([^`]+)`/gu)].map((match) => ({
    line: lineAt(text, match.index),
    span: (match[1] ?? '').replaceAll(/\s+/gu, ' ').trim(),
  }));
};

/** Each span of `text` that opens with a field word of `lines` and is neither the word alone, a whole line of its field, nor an elided opening of one. */
const quoteFaults = (text: string, lines: ReadonlyArray<Line>) => {
  const fields = new Set(lines.map(({ field }) => field));
  return spansOf(text).filter(({ span }) => {
    const field = span.split(' ')[0] ?? '';
    if (!fields.has(field) || span === field) return false;
    const own = lines.filter((line) => line.field === field);
    if (!span.endsWith('…')) return !own.some(({ parts }) => fits(parts, span));
    const head = span.slice(0, -1).trimEnd();
    return !own.some(({ parts }) => {
      const opening = parts[0] ?? '';
      return head.startsWith(opening) || opening.startsWith(head);
    });
  });
};

/** Every fault of a feature file: its quotes of each probe it names by file, then its targets. */
const featureFaults = (
  file: string,
  text: string,
  textsOf: (name: string) => ReadonlyArray<Parts>,
) =>
  [...new Set([...text.matchAll(/app\/probe\/([a-z-]+)\.tsx/gu)].map(([, name = '']) => name))]
    .flatMap((name) =>
      quoteFaults(text, linesOf(textsOf(name))).map(
        ({ line, span }) => `${file}:${line}: \`${span}\` (probe ${name})`,
      ),
    )
    .concat(targetFaults(file, text, textsOf));

/** The texts of the app's probe `name`, read from its sources. */
const probeTexts = (name: string) =>
  [`app/probe/${name}.tsx`, `src/${name}/probe.ts`]
    .filter((file) => existsSync(join(APP, file)))
    .flatMap((file) => textsIn(file, readFileSync(join(APP, file), 'utf8')));

/** A seeded linear congruential stream: a draw below `below`. */
const random = (seed: number) => {
  let s = seed >>> 0;
  return (below: number) => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return Math.floor((s / 4294967296) * below);
  };
};

type Draw = (below: number) => number;

const pick = <A>(draw: Draw, from: ReadonlyArray<A>): A => from[draw(from.length)] as A;

/** `count` distinct entries of `from`, in a drawn order. */
const distinct = <A>(draw: Draw, from: ReadonlyArray<A>, count: number): ReadonlyArray<A> => {
  const left = [...from];
  return Array.from(
    { length: Math.min(count, left.length) },
    () => left.splice(draw(left.length), 1)[0] as A,
  );
};

const FIELDS = ['lit', 'install', 'scheme', 'ended', 'voice', 'fall', 'first-word', 'grade'];
const OTHER_FIELDS = ['beam', 'tally', 'drawn-at'];
/** A line's second word: none is a literal part, and `zz` is none of them. */
const WORDS = ['at', 'rate', 'count', 'none', 'done', 'set'];
/** The literal parts after a gap: none holds another, a digit or a field's letters in a row, and none ends in a space. */
const LITERALS = ['/', ' of', '=', ':', ' ·', ' idle', ' ms'];

/** A generated line: its field and parts, and whether its template is trimmed at its end. */
interface Drawn {
  readonly field: string;
  readonly parts: Parts;
  readonly trimmed: boolean;
}

/** One to three gaps' lines of a field, each opening with the field and its own word. */
const drawLine = (draw: Draw, field: string, word: string): Drawn => {
  const gaps = draw(4);
  if (gaps === 0) return { field, parts: [`${field} ${word}`], trimmed: false };
  const trimmed = gaps >= 2 && draw(3) === 0;
  if (trimmed)
    return {
      field,
      parts: [`${field} ${word} `, ...distinct(draw, LITERALS, gaps - 2), ' ', ''],
      trimmed,
    };
  const tail = pick(draw, ['', ...LITERALS]);
  const middle = distinct(
    draw,
    LITERALS.filter((part) => part !== tail),
    gaps - 1,
  );
  return { field, parts: [`${field} ${word} `, ...middle, tail], trimmed };
};

/** A generated probe's lines: one to three fields of one or two lines each. */
const drawProbe = (draw: Draw, fields: ReadonlyArray<string>): ReadonlyArray<Drawn> =>
  distinct(draw, fields, 1 + draw(3)).flatMap((field) =>
    distinct(draw, WORDS, 1 + draw(2)).map((word) => drawLine(draw, field, word)),
  );

/** A probe's source: each line a template (trimmed or not) or a string, a plain heading in JSX, and a text that opens with a gap. */
const sourceOf = (lines: ReadonlyArray<Drawn>) => {
  const texts = lines.map(({ parts, trimmed }) => {
    if (parts.length === 1) return `'${parts[0] ?? ''}'`;
    const template = `\`${parts.join('${value}')}\``;
    if (trimmed) return `${template}.trimEnd()`;
    return template;
  });
  return [
    'export default function Probe({ value }: { value: number }) {',
    `  const lines = [${texts.join(', ')}, \`\${value} engine\`];`,
    '  return <View><Text>Alpha probe</Text><Text>{lines.join()}</Text></View>;',
    '}',
  ].join('\n');
};

/** The lines a drawn line writes: itself, and its trimmed form without the last gap. */
const writes = ({ parts, trimmed }: Drawn): ReadonlyArray<Parts> => {
  if (!trimmed) return [parts];
  return [parts, [...parts.slice(0, -2), '']];
};

/** `parts` with each gap filled by a drawn number. */
const instance = (draw: Draw, parts: Parts) =>
  (parts[0] ?? '') +
  parts
    .slice(1)
    .map((part) => `${1 + draw(40)}${part}`)
    .join('');

/** A row of a generated feature file: its text, its class, and the faults it holds when it starts on `line` (each after its file's name). */
interface Row {
  readonly text: string;
  readonly kind: string;
  readonly faults: (line: number) => ReadonlyArray<string>;
}

/** A row quoting `span` in prose, whose fault, if `faults`, is the span folded. */
const quote = (kind: string, span: string, faults: boolean, text = span): Row => ({
  text: `- the probe shows \`${text}\` here.`,
  kind,
  faults: (line) => [`:${line}: \`${span.trim()}\` (probe alpha)`].filter(() => faults),
});

/** A shell continuation between two arguments: a backslash ending the line, the next indented or not. */
const CONTINUATIONS = [' \\\n  ', ' \\\n', ' \\\n    '];

/**
 * A row whose fenced command opens probe alpha and expects `target`, whose
 * fault, if `faults`, names it on the line of the command's `sim`. Its
 * layout is drawn apart from the target: one line, or continued at each
 * argument boundary drawn (`continued`, one or more).
 */
const expecting = (draw: Draw, kind: string, target: string, faults: boolean): Row => {
  const args = [
    'bun',
    'run',
    'sim',
    'open',
    'probe/alpha',
    '--expect',
    `"${pick(draw, ['label', 'id'])}=${target}"`,
  ];
  const layout = pick(draw, ['single', 'continued']);
  const continued = layout === 'continued';
  const gaps = args.slice(1).map(() => ' ');
  if (continued)
    distinct(
      draw,
      gaps.map((_, index) => index),
      1 + draw(gaps.length),
    ).forEach((index) => {
      gaps[index] = pick(draw, CONTINUATIONS);
    });
  const command = args
    .slice(1)
    .reduce((text, arg, index) => `${text}${gaps[index] ?? ' '}${arg}`, args[0] ?? '');
  const before = gaps.slice(0, 2).filter((gap) => gap !== ' ').length;
  return {
    text: `\`\`\`sh\n${command}\n\`\`\``,
    kind: `${kind} ${layout}`,
    faults: (line) =>
      [`:${line + 1 + before}: target \`${target}\` (probe alpha)`].filter(() => faults),
  };
};

/** A row whose `--expect` stands on the line after the command with no continuation: another command, no target of the probe's. */
const unjoined = (target: string): Row => ({
  text: `\`\`\`sh\nbun run sim open probe/alpha\n  --expect "label=${target}"\n\`\`\``,
  kind: 'target unjoined',
  faults: () => [],
});

/** One row of a drawn class over the probe's lines. */
const drawRow = (draw: Draw, lines: ReadonlyArray<Drawn>, other: ReadonlyArray<Drawn>): Row => {
  const line = pick(draw, lines);
  const written = pick(draw, writes(line));
  const literalAt = line.parts.flatMap((part, index) =>
    [index].filter(() => LITERALS.includes(part)),
  );
  const kind = pick(draw, [
    'field alone',
    'whole',
    'dropped',
    'changed',
    'changed word',
    'elided right',
    'elided wrong',
    'other probe',
    'fenced',
    'folded whole',
    'folded wrong',
    'target fits',
    'target missing',
    'target gap',
    'target unjoined',
  ]);
  if (kind === 'target unjoined') return unjoined(pick(draw, ['Gone probe', `${line.field} zz`]));
  if (kind === 'field alone') return quote(kind, line.field, false);
  if (kind === 'whole') return quote(kind, instance(draw, written), false);
  if ((kind === 'dropped' || kind === 'changed') && literalAt.length > 0) {
    const at = pick(draw, literalAt);
    const unused = LITERALS.filter((part) => !line.parts.includes(part));
    const swapped = line.parts.flatMap((part, index) => {
      if (index !== at) return [part];
      if (kind === 'dropped') return [];
      return [pick(draw, unused)];
    });
    return quote(kind, instance(draw, swapped), true);
  }
  if (kind === 'changed word')
    return quote(
      kind,
      instance(draw, [
        `${line.field} zz${' '.repeat(Math.min(1, line.parts.length - 1))}`,
        ...line.parts.slice(1),
      ]),
      true,
    );
  if (kind === 'elided right') {
    const whole = instance(draw, written);
    const cut = Math.max((line.parts[0] ?? '').indexOf(' ') + 2, draw(whole.length + 1));
    return quote(kind, `${whole.slice(0, cut).trimEnd()} …`, false);
  }
  if (kind === 'elided wrong') return quote(kind, `${line.field} zz${draw(9)} …`, true);
  if (kind === 'other probe') return quote(kind, `${pick(draw, other).field} zz ${draw(9)}`, false);
  if (kind === 'fenced')
    return {
      text: `\`\`\`\n\`${line.field} zz ${draw(9)}\`\n\`\`\``,
      kind,
      faults: () => [],
    };
  if (kind === 'folded whole') {
    const whole = instance(draw, written);
    return quote(kind, whole, false, whole.replace(' ', '\n  '));
  }
  if (kind === 'folded wrong') {
    const wrong = `${line.field} zz ${instance(draw, written).slice(line.field.length + 1)}`;
    return quote(kind, wrong, true, wrong.replace(' ', '\n  '));
  }
  if (kind === 'target fits')
    return expecting(draw, kind, pick(draw, [instance(draw, written), 'Alpha probe']), false);
  if (kind === 'target gap') return expecting(draw, kind, `${draw(9)} engine`, true);
  return expecting(
    draw,
    'target missing',
    pick(draw, ['Gone probe', `${line.field} zz ${draw(9)}`]),
    true,
  );
};

describe('the probe lines a feature file quotes', () => {
  it('over 150 generated probes and feature files, faults exactly the quotes and targets no line of the probe fits', () => {
    const draw = random(0x9e0be);
    const seen = new Map<string, number>();
    const got: Array<ReadonlyArray<string>> = [];
    const want: Array<ReadonlyArray<string>> = [];
    for (let run = 0; run < 150; run += 1) {
      const lines = drawProbe(draw, FIELDS);
      const other = drawProbe(draw, OTHER_FIELDS);
      const texts = textsIn('app/probe/alpha.tsx', sourceOf(lines));
      const otherTexts = textsIn('app/probe/beta.tsx', sourceOf(other));
      const rows = Array.from({ length: 4 + draw(8) }, () => drawRow(draw, lines, other));
      const file = `generated-${run}.md`;
      const header = 'The probe (`apps/heartseed/app/probe/alpha.tsx`) writes its lines.';
      let at = 2;
      const faults = rows.flatMap((row) => {
        const line = at;
        at += row.text.split('\n').length;
        seen.set(row.kind, (seen.get(row.kind) ?? 0) + 1);
        return row.faults(line).map((fault) => `${file}${fault}`);
      });
      const text = [header, ...rows.map((row) => row.text)].join('\n');
      const textsOf = (name: string) => ({ alpha: texts, beta: otherTexts })[name] ?? [];
      got.push(featureFaults(file, text, textsOf).toSorted());
      want.push(faults.toSorted());
    }
    expect(got).toEqual(want);
    const floors = [
      'field alone',
      'whole',
      'dropped',
      'changed',
      'changed word',
      'elided right',
      'elided wrong',
      'other probe',
      'fenced',
      'folded whole',
      'folded wrong',
      ...['target fits', 'target missing', 'target gap'].flatMap((kind) => [
        `${kind} single`,
        `${kind} continued`,
      ]),
      'target unjoined',
    ];
    expect(floors.filter((kind) => (seen.get(kind) ?? 0) < 10)).toEqual([]);
  });

  it('reads a probe’s lines from its templates, strings and JSX texts, a trimmed template also without its last gap', () => {
    const source = [
      'const a = `lit ${x}/${y} ${z}`.trimEnd();',
      "const b = 'install none';",
      'const c = `${x} engine`;',
      'const d = <Text>Light probe</Text>;',
      'const e = <Text>  status   line </Text>;',
    ].join('\n');
    expect(textsIn('probe.tsx', source)).toEqual([
      ['lit ', '/', ' ', ''],
      ['lit ', '/', ''],
      ['install none'],
      ['', ' engine'],
      ['Light probe'],
      ['status line'],
    ]);
    expect(linesOf(textsIn('probe.tsx', source)).map(({ field }) => field)).toEqual([
      'lit',
      'lit',
      'install',
      'status',
    ]);
  });

  it('faults sim-3’s light oracle and passes the line the light probe writes', () => {
    const text = [
      'The light probe (`apps/heartseed/app/probe/light.tsx`) reads John 3:16.',
      '- at the end `lit 25/25`; at rest `lit 0/25 idle`, or `lit 3/25 …`.',
    ].join('\n');
    expect(featureFaults('light.md', text, probeTexts)).toEqual([
      'light.md:2: `lit 25/25` (probe light)',
    ]);
  });

  it('faults vb-9’s missing light target on one line and continued onto the next', () => {
    const command = (gap: string) =>
      ['```bash', `sim open probe/light${gap}--expect "label=Gone light"`, '```'].join('\n');
    expect(
      [' ', ' \\\n  '].map((gap) => featureFaults('light.md', command(gap), probeTexts)),
    ).toEqual([
      ['light.md:2: target `Gone light` (probe light)'],
      ['light.md:2: target `Gone light` (probe light)'],
    ]);
  });

  it('no feature file or SKILL.md of verify-heartseed quotes a line its probe does not write', () => {
    const probes = readdirSync(join(APP, 'app/probe')).filter((file) => file.endsWith('.tsx'));
    expect(probes.length).toBeGreaterThanOrEqual(6);
    expect(linesOf(probeTexts('light')).map(({ parts }) => parts.join('${…}'))).toContain(
      'lit ${…}/${…} ${…}',
    );
    const files = [
      'SKILL.md',
      ...readdirSync(join(SKILL, 'features'))
        .filter((file) => file.endsWith('.md'))
        .map((file) => `features/${file}`),
    ];
    expect(files.length).toBeGreaterThan(20);
    expect(
      files.flatMap((file) =>
        featureFaults(file, readFileSync(join(SKILL, file), 'utf8'), probeTexts),
      ),
    ).toEqual([]);
  });
});
