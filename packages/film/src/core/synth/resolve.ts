import { Option, Predicate, Result, Schema } from 'effect';
import {
  type CodeError,
  CodeTooLong,
  DegreeWithoutKey,
  FitUnmatched,
  SampleCycle,
  SampleNotCode,
  SampleUnknown,
  StreamDuplicate,
} from '../errors.ts';
import { hashText } from '../narration.ts';
import { type CodeTrial, type Library, codeTrialOf, isKeptFit, soundEntry } from '../sfx.ts';
import { type Bound, boundOf } from './graph/bound.ts';
import {
  CodeSound,
  type Key,
  type Node,
  type Pitch,
  type Signal,
  type Value,
  drawable,
} from './graph/nodes.ts';
import { isDegree } from './graph/pitch.ts';
import type { ResolvedSound } from './graph/plan.ts';
import { MAX_CODE_SECS, MAX_CODE_WORK } from './graph/units.ts';

const NO_KEY: Key = { tonic: 'C', scale: 'major' };

const CodeJson = Schema.fromJsonString(CodeSound);

const childrenOf = (node: Node): ReadonlyArray<Node> => {
  switch (node._tag) {
    case 'Osc':
    case 'Noise':
    case 'Partials':
    case 'Sample':
      return [];
    case 'Layer':
      return node.of.map((layered) => layered.node);
    case 'Sequence':
      return node.of;
    default:
      return [node.of];
  }
};

const nodesOf = (root: Node): ReadonlyArray<Node> => [root, ...childrenOf(root).flatMap(nodesOf)];

const signalValues = <U>(signal: Signal<U>): ReadonlyArray<Value<U>> => {
  if (Predicate.isTagged(signal, 'Ramp')) return [signal.from, signal.to];
  if (Predicate.isTagged(signal, 'Points')) return signal.points.map(([, value]) => value);
  if (Predicate.isTagged(signal, 'Wobble') || Predicate.isTagged(signal, 'Lfo'))
    return [signal.around];
  return [signal];
};

const pitchesOf = (node: Node): ReadonlyArray<Pitch> => {
  switch (node._tag) {
    case 'Osc':
      return signalValues(node.pitch).flatMap(drawable);
    case 'Partials':
      return drawable(node.pitch);
    case 'Filter':
      return signalValues(node.hz).flatMap(drawable);
    default:
      return [];
  }
};

const sharedStream = (nodes: ReadonlyArray<Node>): Option.Option<string> => {
  const seen = new Set<string>();
  for (const node of nodes) {
    if (node.stream === undefined) continue;
    if (seen.has(node.stream)) return Option.some(node.stream);
    seen.add(node.stream);
  }
  return Option.none();
};

interface Walked {
  readonly sound: ResolvedSound;
  readonly bound: Bound;
}

interface Walk {
  readonly library: Library;
  readonly done: Map<string, Result.Result<Walked, CodeError>>;
}

const sampled = (
  walk: Walk,
  stack: ReadonlyArray<string>,
  name: string,
): Result.Result<Walked, CodeError> => {
  const sampler = stack[stack.length - 1] ?? name;
  const ring = stack.indexOf(name);
  if (ring >= 0) return Result.fail(SampleCycle.make({ path: [...stack.slice(ring), name] }));
  const known = walk.done.get(name);
  if (known !== undefined) return known;
  const entry = soundEntry(walk.library, name);
  if (Option.isNone(entry))
    return Result.fail(SampleUnknown.make({ sound: sampler, sample: name }));
  if (entry.value.kind !== 'code')
    return Result.fail(
      SampleNotCode.make({ sound: sampler, sample: name, kind: entry.value.kind }),
    );
  const walked = walkSound(walk, stack, name, entry.value.sound);
  walk.done.set(name, walked);
  return walked;
};

const walkSound = (
  walk: Walk,
  stack: ReadonlyArray<string>,
  name: string,
  sound: CodeSound,
): Result.Result<Walked, CodeError> => {
  const nodes = nodesOf(sound.play);
  const samples = new Map<string, Walked>();
  for (const node of nodes) {
    if (node._tag !== 'Sample' || samples.has(node.sound)) continue;
    const found = sampled(walk, [...stack, name], node.sound);
    if (Result.isFailure(found)) return Result.fail(found.failure);
    samples.set(node.sound, found.success);
  }
  const stream = sharedStream(nodes);
  if (Option.isSome(stream))
    return Result.fail(StreamDuplicate.make({ sound: name, stream: stream.value }));
  if (sound.key === undefined && nodes.some((node) => pitchesOf(node).some(isDegree)))
    return Result.fail(DegreeWithoutKey.make({ sound: name }));
  const bound = boundOf(sound.play, (sample) => samples.get(sample)?.bound ?? { secs: 0, work: 0 });
  if (bound.secs > MAX_CODE_SECS)
    return Result.fail(
      CodeTooLong.make({ sound: name, measure: 'length', secs: bound.secs, limit: MAX_CODE_SECS }),
    );
  if (bound.work > MAX_CODE_WORK)
    return Result.fail(
      CodeTooLong.make({ sound: name, measure: 'work', secs: bound.work, limit: MAX_CODE_WORK }),
    );
  const sampledHashes = [...samples]
    .map(([sample, walked]) => `${sample}=${walked.sound.hash}`)
    .toSorted();
  const hash = hashText([Schema.encodeSync(CodeJson)(sound), ...sampledHashes].join('\n'));
  return Result.succeed({
    sound: {
      name,
      sound,
      key: sound.key ?? NO_KEY,
      samples: new Map([...samples].map(([sample, walked]) => [sample, walked.sound])),
      hash,
    },
    bound,
  });
};

export interface ResolvedTrial {
  readonly sound: ResolvedSound;
  readonly variants: number;
}

interface ResolvedCode {
  readonly code: ReadonlyMap<string, ResolvedSound>;
  readonly trials: ReadonlyMap<string, ResolvedTrial>;
}

export const resolveCode = (
  library: Library,
  fits: ReadonlyMap<string, CodeTrial> = new Map(),
): Result.Result<ResolvedCode, CodeError> => {
  for (const name of [...fits.keys()].toSorted()) {
    const entry = soundEntry(library, name);
    if (Option.isNone(entry))
      return Result.fail(FitUnmatched.make({ sound: name, kind: 'undeclared' }));
    const { kind } = entry.value;
    if (kind === 'recorded' || isKeptFit(entry.value)) continue;
    return Result.fail(FitUnmatched.make({ sound: name, kind }));
  }
  const walk: Walk = { library, done: new Map() };
  const code = new Map<string, ResolvedSound>();
  const trials = new Map<string, ResolvedTrial>();
  for (const name of Object.keys(library)) {
    const entry = soundEntry(library, name);
    if (Option.isNone(entry)) continue;
    if (entry.value.kind === 'code') {
      const walked = sampled(walk, [], name);
      if (Result.isFailure(walked)) return Result.fail(walked.failure);
      code.set(name, walked.success.sound);
    }
    const trial = codeTrialOf(entry.value, Option.fromUndefinedOr(fits.get(name)));
    if (Option.isNone(trial)) continue;
    const walked = walkSound(walk, [], `${name} (trial)`, trial.value.sound);
    if (Result.isFailure(walked)) return Result.fail(walked.failure);
    trials.set(name, { sound: walked.success.sound, variants: trial.value.variants });
  }
  return Result.succeed({ code, trials });
};
