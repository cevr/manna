/* oxlint-disable effect/noTernary, effect/noNullish -- the browser test's sampler, plain arithmetic over small tables. */

import { type ListName } from './routes';

export const heights = [320, 568, 874, 1400] as const;

export const shares = [0.005, 0.1, 0.33, 0.6, 0.85, 1] as const;

export const ways = ['back', 'header', 'tab'] as const;
export type Way = (typeof ways)[number];

export const movesOf = {
  hymns: ['top', 'fling', 'onward'],
  search: ['top', 'fling', 'nothing', 'onward'],
} as const satisfies Record<ListName, ReadonlyArray<string>>;
export type Move = (typeof movesOf)[ListName][number];

export const presses = ['now', 'later'] as const;
export type Press = (typeof presses)[number];

export interface Visit {
  readonly way: Way;
  readonly share: number;
  readonly height: number;
  readonly move: Move;
  readonly press: Press;
}

export interface Cold {
  readonly height: number;
  readonly before: number;
  readonly after: number;
}

type Axes = Readonly<Record<string, ReadonlyArray<string | number>>>;

export interface Domain<A extends Axes> {
  readonly axes: A;
  readonly meet: ReadonlyArray<readonly [keyof A & string, keyof A & string]>;
}

type Case<A extends Axes> = { readonly [K in keyof A]: A[K][number] };

const everyTwo = <N extends string>(names: ReadonlyArray<N>) =>
  names.flatMap((a, i) => names.slice(i + 1).map((b) => [a, b] as const));

export const visitDomain = (list: ListName) => {
  const axes = {
    way: ways,
    share: shares,
    height: heights,
    move: movesOf[list],
    press: presses,
  } as const;
  return {
    axes,
    meet: everyTwo(['way', 'share', 'height', 'move', 'press'] as const),
  } satisfies Domain<typeof axes>;
};

export const coldDomain = {
  axes: { height: heights, before: shares, after: shares },
  meet: [
    ['height', 'before'],
    ['height', 'after'],
  ],
} as const satisfies Domain<{
  height: typeof heights;
  before: typeof shares;
  after: typeof shares;
}>;

const random = (seed: number) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

type Value = string | number;

const key = (a: string, x: Value | undefined, b: string, y: Value | undefined) =>
  `${a}=${x} ${b}=${y}`;

const pairsOf = <A extends Axes>({ axes, meet }: Domain<A>): Array<string> =>
  meet.flatMap(([a, b]) =>
    (axes[a] ?? []).flatMap((x) => (axes[b] ?? []).map((y) => key(a, x, b, y))),
  );

const pairsIn = <A extends Axes>({ meet }: Domain<A>, c: { readonly [K in keyof A]: Value }) =>
  meet.map(([a, b]) => key(a, c[a], b, c[b]));

export const uncovered = <A extends Axes>(
  domain: Domain<A>,
  cases: ReadonlyArray<{ readonly [K in keyof A]: Value }>,
): Array<string> => {
  const held = new Set(cases.flatMap((c) => pairsIn(domain, c)));
  return pairsOf(domain).filter((pair) => !held.has(pair));
};

const productOf = <A extends Axes>(axes: A): Array<Case<A>> =>
  Object.entries(axes).reduce<Array<Record<string, string | number>>>(
    (cases, [name, values]) => cases.flatMap((c) => values.map((v) => ({ ...c, [name]: v }))),
    [{}],
  ) as Array<Case<A>>;

const sample = <A extends Axes>(domain: Domain<A>, seed: number): Array<Case<A>> => {
  const next = random(seed);
  const all = productOf(domain.axes);
  const open = new Set(pairsOf(domain));
  const cases: Array<Case<A>> = [];
  while (open.size > 0) {
    let best: Array<Case<A>> = [];
    let most = 0;
    for (const c of all) {
      const gain = pairsIn(domain, c).filter((pair) => open.has(pair)).length;
      if (gain > most) [best, most] = [[c], gain];
      else if (gain === most) best.push(c);
    }
    const chosen = best[Math.floor(next() * best.length)];
    if (chosen === undefined) break;
    for (const pair of pairsIn(domain, chosen)) open.delete(pair);
    cases.push(chosen);
  }
  return cases;
};

export const visitsOf = (list: ListName, seed: number): Array<Visit> =>
  sample(visitDomain(list), seed + (list === 'hymns' ? 0 : 1));

export const coldsOf = (list: ListName, seed: number): Array<Cold> =>
  sample(coldDomain, seed + (list === 'hymns' ? 2 : 3));
