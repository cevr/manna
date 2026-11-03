import { Predicate, Result, Schema } from 'effect';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { Order } from '../src/hymn.js';
import {
  bookOf,
  decidingOf,
  type Fix,
  formatProblems,
  layoutLineAs,
  layoutLinesIn,
  layoutLinesOf,
  isEcho,
  type Outline,
  outlinesOf,
  type Placement,
  placementOf,
  placing,
  type PrintedLayout,
  type PrintedText,
  printedTextOf,
  readAs,
  readText,
  type RefrainText,
  type Ruling,
  type Sources,
  spansOf,
  type StanzaCheck,
  stanzaCheckOf,
  type Verses,
  wordsOf,
} from './census.js';

export interface PrintedSource {
  readonly stanzas: ReadonlyArray<readonly string[]>;
  readonly refrain: readonly string[];
}

const linesOf = (text: string) => text.split('\n').filter((line) => line.trim() !== '');

export const printedSourceOf = (row: Verses, fix: Fix | undefined): PrintedSource =>
  fix !== undefined
    ? {
        stanzas: fix.stanzas.map((lines) => lines.map((line) => line.text)),
        refrain: (fix.refrain?.lines ?? []).flatMap((item) =>
          'varies' in item ? [] : [item.text],
        ),
      }
    : {
        stanzas: row
          .filter((verse) => verse.id >= 0)
          .toSorted((a, b) => a.id - b.id)
          .map((verse) => linesOf(verse.text)),
        refrain: row
          .filter((verse) => verse.id < 0)
          .toSorted((a, b) => b.id - a.id)
          .flatMap((verse) => linesOf(verse.text)),
      };

export const rowOfSource = (source: PrintedSource): Verses => [
  ...source.stanzas.map((lines, id) => ({ id, text: lines.join('\n') })),
  ...(source.refrain.length > 0 ? [{ id: -1, text: source.refrain.join('\n') }] : []),
];

const sameWords = (a: readonly string[], b: readonly string[]) =>
  wordsOf(a.join('\n')).join(' ') === wordsOf(b.join('\n')).join(' ');

export const applyRecipe = (
  source: PrintedSource,
  recipe: string,
): Result.Result<PrintedSource, string> => {
  const stanzas = source.stanzas.map((lines) => [...lines]);
  if (recipe === 'norefrain')
    return source.refrain.length === 0
      ? Result.fail('the source has no refrain')
      : Result.succeed({ stanzas, refrain: [] });
  const swap = /^swap:(\d+)-(\d+)$/.exec(recipe);
  if (swap !== null) {
    const [i, j] = [Number(swap[1]) - 1, Number(swap[2]) - 1];
    const [a, b] = [stanzas[i], stanzas[j]];
    if (a === undefined || b === undefined) return Result.fail(`no stanza ${i + 1} or ${j + 1}`);
    if (sameWords(a, b)) return Result.fail(`stanzas ${i + 1} and ${j + 1} sing the same words`);
    stanzas[i] = b;
    stanzas[j] = a;
    return Result.succeed({ stanzas, refrain: source.refrain });
  }
  const line = /^(dropline|swaplines):(\d+)\.(\d+)\/(\d+)$/.exec(recipe);
  if (line === null) return Result.fail(`no recipe ${recipe}`);
  const [s, l, count] = [Number(line[2]) - 1, Number(line[3]) - 1, Number(line[4])];
  const lines = stanzas[s];
  if (lines === undefined) return Result.fail(`no stanza ${s + 1}`);
  if (lines.length !== count)
    return Result.fail(`stanza ${s + 1} has ${lines.length} lines, the recipe ${count}`);
  if (line[1] === 'dropline') {
    if (count < 2 || l >= count) return Result.fail(`stanza ${s + 1} has no line ${l + 1} to drop`);
    lines.splice(l, 1);
    return Result.succeed({ stanzas, refrain: source.refrain });
  }
  const [a, b] = [lines[l], lines[l + 1]];
  if (a === undefined || b === undefined)
    return Result.fail(`stanza ${s + 1} has no lines ${l + 1} and ${l + 2}`);
  if (sameWords([a], [b])) return Result.fail(`lines ${l + 1} and ${l + 2} sing the same words`);
  lines[l] = b;
  lines[l + 1] = a;
  return Result.succeed({ stanzas, refrain: source.refrain });
};

export const PROPERTIES = [
  'stanza count',
  'stanza order',
  'stanza split',
  'line presence',
  'line order',
  'line break',
  'indent',
  'refrain presence',
  'refrain placement',
  'refrain varies',
  'unnumbered rows',
] as const;
export type Property = (typeof PROPERTIES)[number];

export interface LayoutMutant {
  readonly property: Property;
  readonly name: string;
  readonly text: PrintedText;
  readonly touches: readonly number[] | 'all';
}

const layoutOfMutant = (mutant: LayoutMutant): PrintedLayout => readText(mutant.text);

const sameLine = (a: string, b: string) => wordsOf(a).join(' ') === wordsOf(b).join(' ');
const sameBlock = (a: readonly string[], b: readonly string[]) => sameWords(a, b);

const tokensOf = (line: string) => ({
  lead: /^\s*/u.exec(line)?.[0] ?? '',
  tokens: line.split(/\s+/u).filter((token) => token !== ''),
});

const lineOf = (lead: string, tokens: readonly string[]) => `${lead}${tokens.join(' ')}`;

const lineMutations = function* (lines: readonly string[]) {
  const at = (k: number) => lines[k] ?? '';
  for (let k = 0; k < lines.length; k++) {
    const line = at(k);
    const mine = tokensOf(line);
    yield {
      property: 'line presence',
      name: `dropline:${k + 1}`,
      lines: lines.toSpliced(k, 1),
    } as const;
    yield {
      property: 'line presence',
      name: `repeatline:${k + 1}`,
      lines: lines.toSpliced(k + 1, 0, line),
    } as const;
    yield {
      property: 'indent',
      name: `indent:${k + 1}`,
      lines: lines.toSpliced(k, 1, `  ${line}`),
    } as const;
    if (mine.tokens.length >= 2) {
      const m = Math.floor(mine.tokens.length / 2);
      yield {
        property: 'line break',
        name: `split:${k + 1}`,
        lines: lines.toSpliced(
          k,
          1,
          lineOf(mine.lead, mine.tokens.slice(0, m)),
          lineOf('', mine.tokens.slice(m)),
        ),
      } as const;
    }
    if (k + 1 >= lines.length) continue;
    const next = at(k + 1);
    const theirs = tokensOf(next);
    if (!sameLine(line, next))
      yield {
        property: 'line order',
        name: `swaplines:${k + 1}`,
        lines: lines.toSpliced(k, 2, next, line),
      } as const;
    yield {
      property: 'line break',
      name: `join:${k + 1}`,
      lines: lines.toSpliced(k, 2, lineOf(mine.lead, [...mine.tokens, ...theirs.tokens])),
    } as const;
    if (mine.tokens.length >= 2)
      yield {
        property: 'line break',
        name: `movedown:${k + 1}`,
        lines: lines.toSpliced(
          k,
          2,
          lineOf(mine.lead, mine.tokens.slice(0, -1)),
          lineOf(theirs.lead, [...mine.tokens.slice(-1), ...theirs.tokens]),
        ),
      } as const;
    if (theirs.tokens.length >= 2)
      yield {
        property: 'line break',
        name: `moveup:${k + 1}`,
        lines: lines.toSpliced(
          k,
          2,
          lineOf(mine.lead, [...mine.tokens, ...theirs.tokens.slice(0, 1)]),
          lineOf(theirs.lead, theirs.tokens.slice(1)),
        ),
      } as const;
  }
  const [first, last] = [at(0), at(lines.length - 1)];
  if (lines.length >= 3 && !sameLine(first, last))
    yield {
      property: 'line order',
      name: 'swapends',
      lines: lines.toSpliced(0, 1, last).toSpliced(lines.length - 1, 1, first),
    } as const;
};

const refrainRuns = (refrain: readonly RefrainText[]) => {
  const runs: Array<{ at: number; lines: string[] }> = [];
  for (const [k, item] of refrain.entries()) {
    if (!Predicate.isString(item)) continue;
    const last = runs.at(-1);
    if (last !== undefined && last.at + last.lines.length === k) last.lines.push(item);
    else runs.push({ at: k, lines: [item] });
  }
  return runs;
};

const refrainTextAfter = (text: PrintedText, i: number): readonly string[] =>
  (text.refrain ?? []).flatMap((item) =>
    Predicate.isString(item)
      ? [item]
      : (item.varies.find((part) => part.after.includes(i))?.lines ?? []),
  );

const ORDERS = Order.literals;

export const mutantsOf = function* (
  text: PrintedText,
  outlines: readonly Outline[],
): Generator<LayoutMutant> {
  yield* stanzaMutants(text);
  yield* stanzaLineMutants(text);
  yield* insertMutants(text);
  yield* refrainLineMutants(text);
  yield* refrainMutants(text);
  yield* extraMutants(text, outlines);
};

const withStanzas = (
  text: PrintedText,
  stanzas: ReadonlyArray<readonly string[]>,
): PrintedText => ({ ...text, stanzas });

const stanzaMutants = function* (text: PrintedText): Generator<LayoutMutant> {
  const stanzas = text.stanzas;
  for (let i = 0; i < stanzas.length; i++) {
    const stanza = stanzas[i] ?? [];
    yield {
      property: 'stanza count',
      name: `dropstanza:${i + 1}`,
      text: withStanzas(text, stanzas.toSpliced(i, 1)),
      touches: 'all',
    };
    yield {
      property: 'stanza count',
      name: `repeatstanza:${i + 1}`,
      text: withStanzas(text, stanzas.toSpliced(i + 1, 0, stanza)),
      touches: 'all',
    };
    for (let j = i + 1; j < stanzas.length; j++)
      if (!sameBlock(stanza, stanzas[j] ?? []))
        yield {
          property: 'stanza order',
          name: `swap:${i + 1}-${j + 1}`,
          text: withStanzas(
            text,
            stanzas.toSpliced(i, 1, stanzas[j] ?? []).toSpliced(j, 1, stanza),
          ),
          touches: [i + 1, j + 1],
        };
    for (let b = 1; b < stanza.length; b++)
      yield {
        property: 'stanza split',
        name: `splitstanza:${i + 1}.${b}`,
        text: withStanzas(text, stanzas.toSpliced(i, 1, stanza.slice(0, b), stanza.slice(b))),
        touches: 'all',
      };
    yield* boundaryMutants(text, i);
  }
};

const boundaryMutants = function* (text: PrintedText, i: number): Generator<LayoutMutant> {
  const stanzas = text.stanzas;
  const [stanza, next] = [stanzas[i] ?? [], stanzas[i + 1]];
  if (next === undefined) return;
  yield {
    property: 'stanza split',
    name: `joinstanzas:${i + 1}`,
    text: withStanzas(text, stanzas.toSpliced(i, 2, [...stanza, ...next])),
    touches: 'all',
  };
  if (stanza.length >= 2)
    yield {
      property: 'stanza split',
      name: `boundaryup:${i + 1}`,
      text: withStanzas(
        text,
        stanzas.toSpliced(i, 2, stanza.slice(0, -1), [...stanza.slice(-1), ...next]),
      ),
      touches: [i + 1, i + 2],
    };
  if (next.length >= 2)
    yield {
      property: 'stanza split',
      name: `boundarydown:${i + 1}`,
      text: withStanzas(
        text,
        stanzas.toSpliced(i, 2, [...stanza, ...next.slice(0, 1)], next.slice(1)),
      ),
      touches: [i + 1, i + 2],
    };
};

const within = (name: string, unit: string) =>
  name.includes(':') ? name.replace(':', `:${unit}.`) : `${name}:${unit}`;

const stanzaLineMutants = function* (text: PrintedText): Generator<LayoutMutant> {
  const stanzas = text.stanzas;
  for (let i = 0; i < stanzas.length; i++)
    for (const one of lineMutations(stanzas[i] ?? []))
      yield {
        property: one.property,
        name: within(one.name, `${i + 1}`),
        text: withStanzas(text, stanzas.toSpliced(i, 1, one.lines)),
        touches: [i + 1],
      };
};

const insertMutants = function* (text: PrintedText): Generator<LayoutMutant> {
  const stanzas = text.stanzas;
  for (const [i, stanza] of stanzas.entries())
    for (let place = 0; place <= stanza.length; place++)
      for (const [d, donor] of stanzas.entries()) {
        if (d === i) continue;
        for (const [k, line] of donor.entries())
          yield {
            property: 'line presence',
            name: `insertline:${i + 1}.${place + 1}/${d + 1}.${k + 1}`,
            text: withStanzas(text, stanzas.toSpliced(i, 1, stanza.toSpliced(place, 0, line))),
            touches: [i + 1],
          };
      }
};

const refrainLineMutants = function* (text: PrintedText): Generator<LayoutMutant> {
  const items = text.refrain ?? [];
  for (const run of refrainRuns(items))
    for (const one of lineMutations(run.lines))
      yield {
        property: one.property,
        name: within(one.name, `refrain.${run.at + 1}`),
        text: { ...text, refrain: items.toSpliced(run.at, run.lines.length, ...one.lines) },
        touches: 'all',
      };
  for (const [k, item] of items.entries()) {
    if (Predicate.isString(item)) continue;
    for (const [p, part] of item.varies.entries()) {
      for (const one of lineMutations(part.lines))
        yield {
          property: one.property,
          name: within(one.name, `varies.${k + 1}.${p + 1}`),
          text: {
            ...text,
            refrain: items.toSpliced(k, 1, {
              varies: item.varies.toSpliced(p, 1, { ...part, lines: one.lines }),
            }),
          },
          touches: 'all',
        };
      yield {
        property: 'refrain varies',
        name: `dropvaries:${k + 1}.${p + 1}`,
        text: { ...text, refrain: items.toSpliced(k, 1, { varies: item.varies.toSpliced(p, 1) }) },
        touches: 'all',
      };
    }
    yield {
      property: 'refrain varies',
      name: `dropvaries:${k + 1}`,
      text: { ...text, refrain: items.toSpliced(k, 1) },
      touches: 'all',
    };
    yield {
      property: 'refrain varies',
      name: `unvary:${k + 1}`,
      text: {
        ...text,
        refrain: items.toSpliced(k, 1, ...item.varies.flatMap((part) => part.lines)),
      },
      touches: 'all',
    };
  }
};

const refrainMutants = function* (text: PrintedText): Generator<LayoutMutant> {
  const stanzas = text.stanzas;
  if (text.refrain === undefined) {
    for (const [i, stanza] of stanzas.entries())
      if (stanza.length >= 2)
        yield {
          property: 'refrain presence',
          name: `makerefrain:${i + 1}`,
          text: {
            ...text,
            refrain: stanza.slice(-1),
            stanzas: stanzas.toSpliced(i, 1, stanza.slice(0, -1)),
          },
          touches: 'all',
        };
    return;
  }
  yield {
    property: 'refrain presence',
    name: 'norefrain',
    text: { ...text, refrain: undefined },
    touches: 'all',
  };
  const order = text.order ?? 'after-each';
  for (const other of ORDERS.filter((one) => one !== order))
    yield {
      property: 'refrain placement',
      name: `order:${other}`,
      text: { ...text, order: other },
      touches: 'all',
    };
  for (const [i, stanza] of stanzas.entries())
    yield {
      property: 'refrain placement',
      name: `inside:${i + 1}`,
      text: {
        ...text,
        refrain: undefined,
        stanzas: stanzas.toSpliced(i, 1, [...stanza, ...refrainTextAfter(text, i + 1)]),
      },
      touches: 'all',
    };
};

const extraMutants = function* (
  text: PrintedText,
  outlines: readonly Outline[],
): Generator<LayoutMutant> {
  for (const outline of outlines)
    for (const [e, extra] of outline.extra.entries()) {
      const without = isEcho(extra) ? text : withoutRow(text, extra);
      if (without !== text)
        yield {
          property: 'unnumbered rows',
          name: `dropextra:${outline.reader}.${e + 1}`,
          text: without,
          touches: 'all',
        };
    }
};

const withoutRow = (text: PrintedText, row: Outline['extra'][number]): PrintedText => {
  const drop = (lines: readonly string[]) => {
    const words = lines.flatMap((line) => wordsOf(line));
    const gone = new Set<number>();
    for (const span of spansOf(words, row)) for (let k = span.start; k < span.end; k++) gone.add(k);
    if (gone.size === 0) return lines;
    let at = 0;
    return lines.flatMap((line) => {
      const { lead, tokens } = tokensOf(line);
      const kept = tokens.filter((token) => {
        const count = wordsOf(token).length;
        const keep =
          count === 0 || Array.from({ length: count }, (_, j) => at + j).some((k) => !gone.has(k));
        at += count;
        return keep;
      });
      return kept.length === 0 || kept.every((token) => wordsOf(token).length === 0)
        ? []
        : [lineOf(lead, kept)];
    });
  };
  const refrain = text.refrain;
  let dropped = false;
  const dropping = (lines: readonly string[]) => {
    const kept = drop(lines);
    dropped ||= kept !== lines;
    return kept;
  };
  const without: PrintedText = {
    ...text,
    stanzas: text.stanzas.map(dropping),
    refrain:
      refrain === undefined
        ? undefined
        : refrainRuns(refrain).reduceRight<readonly RefrainText[]>(
            (items, run) => items.toSpliced(run.at, run.lines.length, ...dropping(run.lines)),
            refrain,
          ),
  };
  return dropped ? without : text;
};

export interface Reach {
  readonly mutants: number;
  readonly unreached: readonly string[];
}

export const reachOf = (
  n: number,
  text: PrintedText,
  outlines: readonly Outline[],
  borrower: boolean,
  book: ReadonlySet<string>,
): ReadonlyMap<Property, Reach> => {
  const layout = readText(text);
  const controls = outlines.map((outline) => {
    const what = `${n} shape (${outline.reader})`;
    const read = readAs(outline, layout);
    const checks = new Map<number, StanzaCheck>();
    const placements = new Map<number, Placement>();
    for (let i = 1; i <= Math.min(read.stanzas.length, layout.stanzas.length); i++) {
      const placement = placementOf(what, read, layout, i);
      placements.set(i, placement);
      checks.set(i, stanzaCheckOf(what, read, layout, i, book, placement));
    }
    const lines = new Set(layoutLinesOf(n, outline, layout, borrower, book, (i) => checks.get(i)));
    return { outline, read, what, checks, placements, lines };
  });
  const format = new Set(formatProblems(n, layout));
  const reach = new Map<Property, { mutants: number; unreached: string[] }>();
  for (const mutant of mutantsOf(text, outlines)) {
    const one = reach.get(mutant.property) ?? { mutants: 0, unreached: [] };
    reach.set(mutant.property, one);
    one.mutants += 1;
    const mutated = layoutOfMutant(mutant);
    const reached =
      formatProblems(n, mutated).some((line) => !format.has(line)) ||
      controls.some((control) => reaches(n, control, mutant, mutated, layout, borrower, book));
    if (!reached) one.unreached.push(mutant.name);
  }
  return reach;
};

const reaches = (
  n: number,
  control: {
    readonly outline: Outline;
    readonly read: Outline;
    readonly what: string;
    readonly checks: ReadonlyMap<number, StanzaCheck>;
    readonly placements: ReadonlyMap<number, Placement>;
    readonly lines: ReadonlySet<string>;
  },
  mutant: LayoutMutant,
  mutated: PrintedLayout,
  layout: PrintedLayout,
  borrower: boolean,
  book: ReadonlySet<string>,
): boolean => {
  const kept =
    mutated.stanzas.length === layout.stanzas.length &&
    readAs(control.outline, mutated) === control.read;
  const touched = (i: number) => mutant.touches === 'all' || mutant.touches.includes(i);
  const checks = new Map<number, StanzaCheck>();
  if (kept)
    for (let i = 1; i <= Math.min(control.read.stanzas.length, mutated.stanzas.length); i++) {
      if (!touched(i)) continue;
      const run = placing(control.what, control.read, mutated, i, control.placements.get(i));
      let step = run.next();
      for (; step.done !== true; step = run.next())
        if (!control.lines.has(layoutLineAs(n, step.value))) return true;
      checks.set(i, stanzaCheckOf(control.what, control.read, mutated, i, book, step.value));
    }
  const lines = layoutLinesIn(n, control.outline, mutated, borrower, book, (i) =>
    !kept ? undefined : touched(i) ? checks.get(i) : control.checks.get(i),
  );
  for (const line of lines) if (!control.lines.has(line)) return true;
  return false;
};

export const fingerprintOf = (text: PrintedText): string =>
  createHash('sha256').update(JSON.stringify(text)).digest('hex').slice(0, 16);

export interface Domain {
  readonly hymns: number;
  readonly properties: ReadonlyMap<
    Property,
    { readonly mutants: number; readonly unreached: number }
  >;
  readonly lists: { readonly unreachable: number; readonly gaps: number };
  readonly unread: readonly number[];
  readonly unlisted: readonly string[];
  readonly reached: readonly string[];
  readonly stale: readonly string[];
  readonly unreached: ReadonlySet<string>;
}

const reachRulings = (rulings: readonly Ruling[]) =>
  rulings.filter((ruling) => (ruling.unreachable ?? []).length + (ruling.gaps ?? []).length > 0);

export const staleRulings = (n: number, text: PrintedText, rulings: readonly Ruling[]) => {
  const now = fingerprintOf(text);
  return reachRulings(rulings).flatMap((ruling) =>
    ruling.layout === now
      ? []
      : [`${n} ${ruling.judge}: ruled on layout ${ruling.layout ?? 'none'}, the text is ${now}`],
  );
};

export const domainOf = (sources: Sources): Domain => {
  const properties = new Map<Property, { mutants: number; unreached: number }>(
    PROPERTIES.map((property) => [property, { mutants: 0, unreached: 0 }]),
  );
  const [unread, unlisted, reached, stale]: [number[], string[], string[], string[]] = [
    [],
    [],
    [],
    [],
  ];
  const lists = { unreachable: 0, gaps: 0 };
  const unreached = new Set<string>();
  const hymns = [...decidingOf(sources.inventory)]
    .filter(([, deciding]) => deciding.source !== 'none')
    .map(([n]) => n)
    .toSorted((a, b) => a - b);
  for (const n of hymns) {
    const { outlines, borrower } = outlinesOf(sources, n);
    if (outlines.length === 0) {
      unread.push(n);
      continue;
    }
    const text = printedTextOf(
      sources.rows.get(n) ?? [],
      sources.fixes.get(n),
      sources.orders.get(n),
    );
    const rulings = sources.rulings.get(n) ?? [];
    stale.push(...staleRulings(n, text, rulings));
    const unreachable = rulings.flatMap((ruling) => ruling.unreachable ?? []);
    const gaps = rulings.flatMap((ruling) => ruling.gaps ?? []);
    const listed = new Set([...unreachable, ...gaps]);
    lists.unreachable += unreachable.length;
    lists.gaps += gaps.length;
    reached.push(
      ...[...unreachable, ...gaps]
        .filter((name, i, all) => all.indexOf(name) !== i)
        .map((name) => `${n} ${name} (listed twice)`),
    );
    const missed = new Set<string>();
    for (const [property, reach] of reachOf(n, text, outlines, borrower, bookOf(sources, n))) {
      const total = properties.get(property);
      if (total !== undefined) {
        total.mutants += reach.mutants;
        total.unreached += reach.unreached.length;
      }
      for (const name of reach.unreached) {
        missed.add(name);
        unreached.add(`${n} ${name}`);
      }
    }
    unlisted.push(...[...missed].filter((name) => !listed.has(name)).map((name) => `${n} ${name}`));
    reached.push(...[...listed].filter((name) => !missed.has(name)).map((name) => `${n} ${name}`));
  }
  return { hymns: hymns.length, properties, lists, unread, unlisted, reached, stale, unreached };
};

const Mutant = Schema.Struct({
  number: Schema.Int,
  mode: Schema.String,
  from: Schema.String,
  layout: Schema.optionalKey(Schema.String),
});
export type Mutant = typeof Mutant.Type;

const MutantsFile = Schema.Struct({ print: Schema.String, mutants: Schema.Array(Mutant) });

export const layoutMutants = (): readonly Mutant[] =>
  Schema.decodeSync(Schema.fromJsonString(MutantsFile))(
    readFileSync(path.resolve(import.meta.dir, '../data/layout-mutants.json'), 'utf8'),
  ).mutants;
