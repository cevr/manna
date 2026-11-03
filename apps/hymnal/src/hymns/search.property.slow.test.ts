import { fold } from '@manna/hymnal/fold';
import { describe, expect, it } from 'bun:test';
import { Option } from 'effect';

import { hymns } from './hymns';
import { find, indexOf, KIN, search } from './search';

const index = indexOf(hymns);
const numbers = (query: string) => search(index, query).map((h) => h.number);
const wordsOf = (text: string) => fold(text).split(' ').filter(Boolean);
const spaced = (words: ReadonlyArray<string>) => ` ${words.join(' ')} `;

const rng = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

// oxlint-disable-next-line effect/noGlobals -- the run's seed comes from its shell, outside any Effect.
const seed = Number(process.env['HYMNAL_SEARCH_SEED'] ?? Date.now() % 1_000_000);

interface Line {
  readonly hymn: number;
  readonly words: ReadonlyArray<string>;
}

const lines: ReadonlyArray<Line> = hymns.flatMap((hymn) =>
  hymn.sections
    .flatMap((section) => section.lines)
    .map((line) => wordsOf(line))
    .filter((ws) => ws.length >= 4)
    .map((ws) => ({ hymn: hymn.number, words: ws })),
);

const own = new Map(
  hymns.map((hymn) => [
    hymn.number,
    [hymn.title, ...hymn.sections.flatMap((section) => section.lines)].map((line) =>
      spaced(wordsOf(line)),
    ),
  ]),
);
const holders = (phrase: ReadonlyArray<string>) =>
  [...own].filter(([, ls]) => ls.some((l) => l.includes(spaced(phrase)))).map(([n]) => n);

const hymnsOf = new Map<string, Set<number>>();
for (const hymn of hymns)
  for (const line of [hymn.title, ...hymn.sections.flatMap((section) => section.lines)])
    for (const word of wordsOf(line))
      hymnsOf.set(word, (hymnsOf.get(word) ?? new Set<number>()).add(hymn.number));
const vocabulary = [...hymnsOf.keys()].toSorted();

const wordsOfFourOrMore = vocabulary.filter((word) => word.length >= 4);

const holdersOf = (word: string): ReadonlySet<number> => {
  const out = new Set<number>();
  const kin = KIN.find((group) => group.includes(word)) ?? [];
  for (const w of [...kin, ...vocabulary.filter((v) => v.startsWith(word))])
    for (const n of hymnsOf.get(w) ?? []) out.add(n);
  return out;
};

const sureFirst = (query: string, sure: ReadonlySet<number>) => {
  const named = new Set(index.lookups.topicHymns(query));
  const order = find(index, query)
    .map((f) => f.hymn.number)
    .filter((n) => sure.has(n) || !named.has(n))
    .map((n) => sure.has(n));
  return order.slice(0, sure.size).every(Boolean) && order.filter(Boolean).length === sure.size;
};

const hitRate = (
  queries: ReadonlyArray<{ q: string; targets: ReadonlyArray<number> }>,
  k: number,
) =>
  Math.round(
    (queries.filter(({ q, targets }) =>
      numbers(q)
        .slice(0, k)
        .some((n) => targets.includes(n)),
    ).length /
      queries.length) *
      1000,
  ) / 10;

const drawOf = (r: () => number, keep: (line: Line) => boolean) => {
  const kept = lines.filter(keep);
  return () => kept[Math.floor(r() * kept.length)] ?? { hymn: 0, words: [] };
};

const modern = new Map(
  KIN.flatMap(([word = '', ...olds]) => olds.map((old) => [old, word] as const)),
);

const kinds = (r: () => number) => ({
  typo: (ws: ReadonlyArray<string>) => {
    const long = ws.flatMap((w, i) => [i].filter(() => w.length >= 5));
    const i = long[Math.floor(r() * long.length)] ?? 0;
    return ws.with(i, `${ws[i]?.slice(0, 2)}${ws[i]?.slice(3)}`);
  },
  dropped: (ws: ReadonlyArray<string>) => ws.toSpliced(1 + Math.floor(r() * (ws.length - 1)), 1),
  order: (ws: ReadonlyArray<string>) => {
    const k = Math.floor(r() * (ws.length - 1));
    return ws.with(k, ws[k + 1] ?? '').with(k + 1, ws[k] ?? '');
  },
  modern: (ws: ReadonlyArray<string>) => ws.map((w) => modern.get(w) ?? w),
});

const fitFor: Record<keyof ReturnType<typeof kinds>, (line: Line) => boolean> = {
  typo: (line) => line.words.some((w) => w.length >= 5),
  dropped: (line) => line.words.length >= 5,
  order: () => true,
  modern: (line) => line.words.some((w) => modern.has(w)),
};

describe('search swept over the hymnal', () => {
  it('finds every hymn first by each form of its number', () => {
    const forms = (n: number) => [
      `${n}`,
      `#${n}`,
      `# ${n}`,
      `no ${n}`,
      `no. ${n}`,
      `No.${n}`,
      `hymn ${n}`,
      `Hymn #${n}`,
      `number ${n}`,
      `hymn no. ${n}`,
      `(${n})`,
      `${n}.`,
    ];
    const misses = hymns.filter((hymn) =>
      forms(hymn.number).some((q) => numbers(q)[0] !== hymn.number),
    );
    expect(misses.map((hymn) => hymn.number)).toEqual([]);
  });

  it('finds every hymn by its whole title among the titles that hold it, with no line', () => {
    const misses = hymns.filter((hymn) => {
      const found = find(index, hymn.title);
      const titled = found.filter((f) => Option.isNone(f.line)).length;
      const at = found.findIndex((f) => f.hymn.number === hymn.number);
      return at < 0 || at >= titled;
    });
    expect(misses.map((hymn) => hymn.number)).toEqual([]);
  });

  it('finds every hymn by its whole first line in the first 5', () => {
    const queries = hymns.map((hymn) => ({
      q: hymn.firstLine,
      targets: holders(wordsOf(hymn.firstLine)),
    }));
    expect(hitRate(queries, 5)).toBe(100);
  });

  it('ranks every hymn holding a word typed alone above every hymn a typo alone finds, for every word of 4 letters or more', () => {
    const misses = wordsOfFourOrMore.filter((word) => !sureFirst(word, holdersOf(word)));
    expect({ words: wordsOfFourOrMore.length, misses: misses.length }).toEqual({
      words: wordsOfFourOrMore.length,
      misses: 0,
    });
  });

  it(`ranks every hymn holding each word of a run of 2 or 3 words above every hymn a typo finds one in (seed ${seed})`, () => {
    const r = rng(seed);
    const draw = drawOf(r, () => true);
    const heldBy = (word: string, last: boolean) =>
      new Set([
        ...(KIN.find((group) => group.includes(word)) ?? [word]).flatMap((w) => [
          ...(hymnsOf.get(w) ?? []),
        ]),
        ...[word].filter(() => last).flatMap((w) => [...holdersOf(w)]),
      ]);
    const runs = [2, 3]
      .flatMap((size) =>
        Array.from({ length: 1000 }, () => {
          const { words } = draw();
          const at = Math.floor(r() * (words.length - size + 1));
          return words.slice(at, at + size);
        }),
      )
      .filter((run) => (run.at(-1)?.length ?? 0) >= 2);
    const misses = runs.filter((run) => {
      const sets = run.map((word, i) => heldBy(word, i === run.length - 1));
      const all = [...(sets[0] ?? [])].filter((n) => sets.every((set) => set.has(n)));
      return !sureFirst(run.join(' '), new Set(all));
    });
    expect({ most: runs.length > 1800, misses: misses.length }).toEqual({ most: true, misses: 0 });
  });

  it(`shows under a right first result the line typed, unless its title holds every word (seed ${seed})`, () => {
    const draw = drawOf(rng(seed), () => true);
    const kinOf = (word: string) => KIN.find((group) => group.includes(word)) ?? [word];
    const tops = Array.from({ length: 400 }, draw).flatMap((line) =>
      find(index, line.words.join(' '))
        .slice(0, 1)
        .filter((top) => holders(line.words).includes(top.hymn.number))
        .map((top) => ({ line, top })),
    );
    const wrong = tops.filter(({ line, top }) => {
      const title = wordsOf(top.hymn.title);
      const last = line.words.at(-1) ?? '';
      const held = (shown: ReadonlyArray<string>) =>
        spaced(shown).includes(spaced(line.words)) ||
        (spaced(shown).includes(spaced(line.words.slice(0, -1))) &&
          shown.some((w) => w !== last && w.startsWith(last)));
      return Option.match(top.line, {
        onNone: () =>
          !line.words.every(
            (w) => kinOf(w).some((k) => title.includes(k)) || title.some((t) => t.startsWith(last)),
          ),
        onSome: (shown) => !held(wordsOf(shown)),
      });
    });
    expect(tops.length).toBeGreaterThan(380);
    expect({ seed, wrong: wrong.length }).toEqual({ seed, wrong: 0 });
  });

  it(`finds seeded half-remembered lines in the first 5, 97% of each kind (seed ${seed})`, () => {
    const r = rng(seed);
    const rates = Object.entries(kinds(r)).map(([kind, change]) => {
      const draw = drawOf(r, fitFor[kind as keyof typeof fitFor]);
      const queries = Array.from({ length: 200 }, () => {
        const line = draw();
        return { q: change(line.words).join(' '), targets: holders(line.words) };
      });
      return { kind, at5: hitRate(queries, 5) };
    });
    expect({ seed, low: rates.filter((rate) => rate.at5 < 97) }).toEqual({ seed, low: [] });
  });
});
