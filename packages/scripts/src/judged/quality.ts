import { Option } from 'effect';

import type { JudgedRule } from './rule.js';
import type { Verdict } from './store.js';

interface Kept<I> {
  readonly rule: JudgedRule;
  readonly key: string;
  readonly item: I;
  readonly kept: Verdict;
}

const reports = (rule: JudgedRule, answer: Verdict) =>
  (answer.probabilities[rule.reports] ?? 0) >= rule.threshold;

const seeded = (seed: number) => {
  let state = seed | 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const shuffled = <A>(items: ReadonlyArray<A>, seed: number): ReadonlyArray<A> => {
  const next = seeded(seed);
  const out = [...items];
  for (let at = out.length - 1; at > 0; at--) {
    const other = Math.floor(next() * (at + 1));
    const pair = Option.all([Option.fromUndefinedOr(out[at]), Option.fromUndefinedOr(out[other])]);
    Option.map(pair, ([here, there]) => {
      out[at] = there;
      out[other] = here;
    });
  }
  return out;
};

type Stratum = 'random' | 'finding';

export const sampleOf = <I>(
  kept: ReadonlyArray<Kept<I>>,
  rules: ReadonlyArray<JudgedRule>,
  plan: { readonly random: number; readonly findings: number; readonly seed: number },
): ReadonlyArray<Kept<I> & { readonly stratum: Stratum }> =>
  rules.flatMap((rule) => {
    const own = [...new Map(kept.filter((k) => k.rule.id === rule.id).map((k) => [k.key, k]))];
    const drawn = shuffled(
      own.map(([, k]) => k),
      plan.seed,
    ).slice(0, plan.random);
    const taken = new Set(drawn.map((k) => k.key));
    const found = drawn.filter((k) => reports(rule, k.kept)).length;
    const more = shuffled(
      own.map(([, k]) => k).filter((k) => reports(rule, k.kept) && !taken.has(k.key)),
      plan.seed + 1,
    ).slice(0, Math.max(0, plan.findings - found));
    const as = (stratum: Stratum) => (k: Kept<I>) => ({ ...k, stratum });
    return [...drawn.map(as('random')), ...more.map(as('finding'))];
  });

export const agreementOf = (
  rule: JudgedRule,
  sample: ReadonlyArray<{
    readonly stratum: Stratum;
    readonly kept: Verdict;
    readonly key: string;
  }>,
  fresh: ReadonlyMap<string, Verdict>,
) => {
  const own = sample.flatMap((entry) =>
    Option.toArray(
      Option.map(Option.fromUndefinedOr(fresh.get(entry.key)), (now) => ({ ...entry, now })),
    ),
  );
  const p = (answer: Verdict) => answer.probabilities[rule.reports] ?? 0;
  const random = own.filter((entry) => entry.stratum === 'random');
  const findings = own.filter((entry) => reports(rule, entry.kept));
  const moved = (entries: typeof own) =>
    entries.reduce((sum, entry) => sum + Math.abs(p(entry.now) - p(entry.kept)), 0) /
    entries.length;
  return {
    random: random.length,
    labelKept: random.filter((entry) => entry.now.label === entry.kept.label).length,
    findingKept: random.filter((entry) => reports(rule, entry.now) === reports(rule, entry.kept))
      .length,
    newFindings: random.filter((entry) => !reports(rule, entry.kept) && reports(rule, entry.now))
      .length,
    findings: findings.length,
    findingsStill: findings.filter((entry) => reports(rule, entry.now)).length,
    movedRandom: moved(random),
    movedFindings: moved(findings),
    unanswered: sample.length - own.length,
  };
};
