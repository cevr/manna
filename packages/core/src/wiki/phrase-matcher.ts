import { Schema } from 'effect';
import { constVoid } from 'effect/Function';

import type { Node as EgwNode, Text as EgwText } from '../egw/ast.js';
import type { TextSegment } from '../bible-rendering/segments.js';
import { TopicSlug, type PhraseDictionary, type PhraseDictionaryEntry } from './model.js';
import { isBoundaryAt, normalizeScan, type NormalizedText } from './normalize.js';

export class PhraseSpan extends Schema.Class<PhraseSpan>('Wiki/PhraseSpan')({
  start: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  end: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  slug: TopicSlug,
  alias: Schema.NonEmptyString,
}) {}

type SectionSpans = readonly (readonly PhraseSpan[])[];

const ROOT = 0;

interface Pattern {
  readonly entry: PhraseDictionaryEntry;
  readonly length: number;
}

const NO_NODE = -1;

interface AutomatonNode {
  readonly next: Map<string, number>;
  readonly outputs: Pattern[];
  failure: number;
}

const emptyNode = (): AutomatonNode => ({ next: new Map(), outputs: [], failure: ROOT });

export class PhraseAutomaton {
  private readonly nodes: readonly AutomatonNode[];

  private constructor(nodes: readonly AutomatonNode[]) {
    this.nodes = nodes;
  }

  private at(index: number): AutomatonNode {
    return this.nodes[index] ?? this.nodes[ROOT] ?? emptyNode();
  }

  static make = (dictionary: PhraseDictionary): PhraseAutomaton => {
    const nodes: AutomatonNode[] = [emptyNode()];
    for (const entry of dictionary.entries) insertPattern(nodes, entry);
    linkFailures(nodes);
    return new PhraseAutomaton(nodes);
  };

  get edges(): number {
    return this.nodes.length - 1;
  }

  candidates(run: NormalizedText): readonly Candidate[] {
    const found: Candidate[] = [];
    this.walk(run, (outputs, end) => {
      if (isBoundaryAt(run.text, end)) pushHits(run, end, outputs, found);
    });
    return found;
  }

  transitions(run: NormalizedText): number {
    return this.walk(run, constVoid);
  }

  private walk(
    run: NormalizedText,
    visit: (outputs: readonly Pattern[], end: number) => void,
  ): number {
    let node = ROOT;
    let taken = 0;
    for (let index = 0; index < run.text.length; index += 1) {
      const character = run.text.charAt(index);
      for (;;) {
        taken += 1;
        const next = this.at(node).next.get(character) ?? NO_NODE;
        if (next !== NO_NODE) {
          node = next;
          break;
        }
        if (node === ROOT) break;
        node = this.at(node).failure;
      }
      const outputs = this.at(node).outputs;
      if (outputs.length > 0) visit(outputs, index + 1);
    }
    return taken;
  }
}

const nodeAt = (nodes: readonly AutomatonNode[], index: number): AutomatonNode =>
  nodes[index] ?? nodes[ROOT] ?? emptyNode();

const insertPattern = (nodes: AutomatonNode[], entry: PhraseDictionaryEntry): void => {
  const alias = normalizeScan(entry.alias).text;
  if (alias.length === 0) return;
  let node = ROOT;
  for (let unit = 0; unit < alias.length; unit += 1) {
    const character = alias.charAt(unit);
    const next = nodeAt(nodes, node).next.get(character) ?? NO_NODE;
    if (next === NO_NODE) {
      nodes.push(emptyNode());
      const created = nodes.length - 1;
      nodeAt(nodes, node).next.set(character, created);
      node = created;
      continue;
    }
    node = next;
  }
  nodeAt(nodes, node).outputs.push({ entry, length: alias.length });
};

const failureTarget = (
  nodes: readonly AutomatonNode[],
  fallback: number,
  character: string,
): number => {
  let from = fallback;
  for (;;) {
    const candidate = nodeAt(nodes, from).next.get(character) ?? NO_NODE;
    if (candidate !== NO_NODE) return candidate;
    if (from === ROOT) return ROOT;
    from = nodeAt(nodes, from).failure;
  }
};

const linkFailures = (nodes: readonly AutomatonNode[]): void => {
  const queue: number[] = [];
  for (const child of nodeAt(nodes, ROOT).next.values()) queue.push(child);

  for (let head = 0; head < queue.length; head += 1) {
    const index = queue[head] ?? ROOT;
    const node = nodeAt(nodes, index);
    for (const [character, child] of node.next) {
      nodeAt(nodes, child).failure = failureTarget(nodes, node.failure, character);
      queue.push(child);
    }
    node.outputs.push(...nodeAt(nodes, node.failure).outputs);
    node.outputs.sort((left, right) => right.length - left.length);
  }
};

const pushHits = (
  run: NormalizedText,
  normalizedEnd: number,
  outputs: readonly Pattern[],
  found: Candidate[],
): void => {
  for (const pattern of outputs) {
    const startNormalized = normalizedEnd - pattern.length;
    if (startNormalized < 0) continue;
    if (!isBoundaryAt(run.text, startNormalized - 1)) continue;
    found.push({ normalizedStart: startNormalized, normalizedEnd, entry: pattern.entry });
  }
};

interface Candidate {
  readonly normalizedStart: number;
  readonly normalizedEnd: number;
  readonly entry: PhraseDictionaryEntry;
}

export class SectionMatchState {
  private readonly hot = new Set<string>();

  eligible(alias: string): boolean {
    return !this.hot.has(alias);
  }

  claim(alias: string): void {
    this.hot.add(alias);
  }
}

const resolve = (
  candidates: readonly Candidate[],
  run: NormalizedText,
  state: SectionMatchState,
): readonly PhraseSpan[] => {
  const eligible = candidates.filter((candidate) => state.eligible(candidate.entry.alias));
  const ordered = [...eligible].sort((left, right) => {
    if (left.normalizedStart !== right.normalizedStart) {
      return left.normalizedStart - right.normalizedStart;
    }
    return (
      right.normalizedEnd - right.normalizedStart - (left.normalizedEnd - left.normalizedStart)
    );
  });

  const spans: PhraseSpan[] = [];
  let reach = 0;
  for (const candidate of ordered) {
    if (candidate.normalizedStart < reach) continue;
    if (!state.eligible(candidate.entry.alias)) continue;
    state.claim(candidate.entry.alias);
    reach = candidate.normalizedEnd;
    spans.push(
      PhraseSpan.make({
        start: run.starts[candidate.normalizedStart] ?? 0,
        end: run.ends[candidate.normalizedEnd - 1] ?? 0,
        slug: candidate.entry.slug,
        alias: candidate.entry.alias,
      }),
    );
  }
  return spans;
};

export const matchRun = (automaton: PhraseAutomaton, text: string): readonly PhraseSpan[] => {
  const run = normalizeScan(text);
  return resolve(automaton.candidates(run), run, new SectionMatchState());
};

export const matchSection = (
  automaton: PhraseAutomaton,
  texts: readonly string[],
  state: SectionMatchState = new SectionMatchState(),
): SectionSpans => {
  const result: (readonly PhraseSpan[])[] = [];
  for (const text of texts) {
    const run = normalizeScan(text);
    result.push(resolve(automaton.candidates(run), run, state));
  }
  return result;
};

export const matchSegments = (
  automaton: PhraseAutomaton,
  segments: readonly TextSegment[],
  state: SectionMatchState = new SectionMatchState(),
): SectionSpans => {
  const result: (readonly PhraseSpan[])[] = [];
  for (const segment of segments) {
    if (segment.type !== 'text') {
      result.push([]);
      continue;
    }
    const run = normalizeScan(segment.text);
    result.push(resolve(automaton.candidates(run), run, state));
  }
  return result;
};

export interface NodeSpans {
  readonly node: EgwText;
  readonly spans: readonly PhraseSpan[];
}

export const matchNodes = (
  automaton: PhraseAutomaton,
  nodes: readonly EgwNode[],
  state: SectionMatchState = new SectionMatchState(),
): readonly NodeSpans[] => {
  const result: NodeSpans[] = [];
  const walk = (current: readonly EgwNode[]): void => {
    for (const node of current) {
      switch (node._tag) {
        case 'Text': {
          const run = normalizeScan(node.text);
          result.push({ node, spans: resolve(automaton.candidates(run), run, state) });
          break;
        }
        case 'ScriptureRef':
        case 'BookRef':
          break;
        case 'Emphasis':
        case 'Comment':
        case 'Unknown':
          walk(node.children);
          break;
        case 'LineBreak':
        case 'PageBreak':
          break;
      }
    }
  };
  walk(nodes);
  return result;
};

export const PhraseSpansJson = Schema.Array(PhraseSpan);
export type PhraseSpansJson = typeof PhraseSpansJson.Encoded;
