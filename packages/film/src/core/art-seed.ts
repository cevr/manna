import { Array as Arr, Option } from 'effect';
import { rng, seedOf } from './random.ts';

type ArtCost = '2d' | 'webgl';

type OptionRef = string;

interface ArtOption {
  readonly id: string;
  readonly name: string;
  readonly look: string;
  readonly asks: string;
  readonly cost: ArtCost;
  readonly excludes?: ReadonlyArray<OptionRef>;
  readonly requires?: ReadonlyArray<OptionRef>;
  readonly profile?: boolean;
}

export interface ArtAxis {
  readonly id: string;
  readonly name: string;
  readonly weight: number;
  readonly options: ReadonlyArray<ArtOption>;
}

type ArtPicks = Readonly<Record<string, string>>;

interface ArtLook {
  readonly name: string;
  readonly picks: ArtPicks;
}

export interface ArtDeck {
  readonly version: number;
  readonly axes: ReadonlyArray<ArtAxis>;
  readonly existing: ReadonlyArray<ArtLook>;
  readonly minDistance: number;
  readonly distinct: ReadonlyArray<string>;
  readonly balance?: string;
  readonly nameAxes: ReadonlyArray<string>;
  readonly rules: ReadonlyArray<string>;
}

interface ArtDraw {
  readonly seed: number;
  readonly attempt: number;
  readonly picks: ArtPicks;
  readonly name: string;
}

const ATTEMPTS = 64;

const SEEDS_PER_DRAW = 64;

const refOf = (axis: string, id: string): OptionRef => `${axis}/${id}`;
const axisOf = (ref: OptionRef): string => ref.slice(0, Math.max(0, ref.indexOf('/')));

const lookup = (options: ReadonlyMap<OptionRef, ArtOption>, ref: OptionRef) =>
  Option.fromUndefinedOr(options.get(ref));

const pickOf = (picks: ArtPicks, axis: string): Option.Option<string> =>
  Option.fromUndefinedOr(picks[axis]);

const drawable = (axis: ArtAxis): ReadonlyArray<ArtOption> =>
  axis.options.filter((o) => o.profile !== true);

const optionsOf = (deck: ArtDeck): ReadonlyMap<OptionRef, ArtOption> =>
  new Map(deck.axes.flatMap((axis) => axis.options.map((o) => [refOf(axis.id, o.id), o] as const)));

const agree = (
  options: ReadonlyMap<OptionRef, ArtOption>,
  ref: OptionRef,
  other: OptionRef,
): boolean => {
  const allows = (o: ArtOption, pick: OptionRef) => {
    const named = (o.requires ?? []).filter((r) => axisOf(r) === axisOf(pick));
    return !(o.excludes ?? []).includes(pick) && (named.length === 0 || named.includes(pick));
  };
  return Option.match(Option.all([lookup(options, ref), lookup(options, other)]), {
    onNone: () => false,
    onSome: ([a, b]) => allows(a, other) && allows(b, ref),
  });
};

export const conflicts = (
  deck: ArtDeck,
  picks: ArtPicks,
): ReadonlyArray<readonly [OptionRef, OptionRef]> => {
  const options = optionsOf(deck);
  const refs = Object.entries(picks).map(([axis, id]) => refOf(axis, id));
  const unknown = refs.filter((r) => !options.has(r)).map((r) => [r, r] as const);
  const pairs = refs.flatMap((a, i) =>
    refs
      .slice(i + 1)
      .filter((b) => options.has(a) && options.has(b) && !agree(options, a, b))
      .map((b) => [a, b] as const),
  );
  return [...unknown, ...pairs];
};

const distance = (deck: ArtDeck, a: ArtPicks, b: ArtPicks): number => {
  let differ = 0;
  let total = 0;
  for (const axis of deck.axes) {
    const both = Option.all([pickOf(a, axis.id), pickOf(b, axis.id)]);
    if (Option.isNone(both)) continue;
    total += axis.weight;
    if (both.value[0] !== both.value[1]) differ += axis.weight;
  }
  if (total === 0) return 1;
  return differ / total;
};

const apart = (deck: ArtDeck, picks: ArtPicks, others: ReadonlyArray<ArtPicks>): boolean =>
  others.every(
    (other) =>
      distance(deck, picks, other) >= deck.minDistance &&
      deck.distinct.every((axis) =>
        Option.match(pickOf(other, axis), {
          onNone: () => true,
          onSome: (id) => !Option.contains(pickOf(picks, axis), id),
        }),
      ),
  );

const score = (seed: number, attempt: number, axis: string, id: string): number =>
  rng(seedOf(`${seed >>> 0}:${attempt}:${axis}:${id}`))();

const attemptPicks = (
  deck: ArtDeck,
  options: ReadonlyMap<OptionRef, ArtOption>,
  seed: number,
  attempt: number,
): Option.Option<Record<string, string>> => {
  const picks: Record<string, string> = {};
  for (const axis of deck.axes) {
    const picked = Object.entries(picks).map(([a, id]) => refOf(a, id));
    const ranked = drawable(axis)
      .map((o) => ({ id: o.id, s: score(seed, attempt, axis.id, o.id) }))
      .toSorted((x, y) => y.s - x.s);
    const best = Arr.findFirst(ranked, (o) =>
      picked.every((p) => agree(options, refOf(axis.id, o.id), p)),
    );
    if (Option.isNone(best)) return Option.none();
    picks[axis.id] = best.value.id;
  }
  return Option.some(picks);
};

const lookName = (deck: ArtDeck, picks: ArtPicks): string =>
  deck.nameAxes.flatMap((axis) => Option.toArray(pickOf(picks, axis))).join('-');

const drawLook = (deck: ArtDeck, seed: number): Option.Option<ArtDraw> => {
  const options = optionsOf(deck);
  const existing = deck.existing.map((l) => l.picks);
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const picks = attemptPicks(deck, options, seed, attempt);
    if (Option.isSome(picks) && apart(deck, picks.value, existing))
      return Option.some({
        seed: seed >>> 0,
        attempt,
        picks: picks.value,
        name: lookName(deck, picks.value),
      });
  }
  return Option.none();
};

interface ArtBatch {
  readonly draws: ReadonlyArray<ArtDraw>;
  readonly skipped: ReadonlyArray<{ readonly seed: number; readonly reason: string }>;
}

export const drawBatch = (deck: ArtDeck, from: number, count: number): ArtBatch => {
  const draws: ArtDraw[] = [];
  const skipped: Array<{ seed: number; reason: string }> = [];
  const balance = deck.axes.find((a) => a.id === deck.balance);
  const room = Option.match(Option.fromUndefinedOr(balance), {
    onNone: () => count,
    onSome: (axis) => Math.ceil(count / Math.max(1, drawable(axis).length)),
  });
  for (let i = 0; draws.length < count && i < count * SEEDS_PER_DRAW; i++) {
    const seed = (from + i) >>> 0;
    const drawn = drawLook(deck, seed);
    if (Option.isNone(drawn)) {
      skipped.push({ seed, reason: `no attempt of ${ATTEMPTS} holds and keeps its distance` });
      continue;
    }
    const look = drawn.value;
    if (
      !apart(
        deck,
        look.picks,
        draws.map((d) => d.picks),
      )
    ) {
      skipped.push({ seed, reason: `${look.name} is too near an earlier draw` });
      continue;
    }
    const full = Option.filter(
      Option.flatMap(Option.fromUndefinedOr(deck.balance), (axis) =>
        Option.map(pickOf(look.picks, axis), (id) => ({ axis, id })),
      ),
      ({ axis, id }) =>
        draws.filter((d) => Option.contains(pickOf(d.picks, axis), id)).length >= room,
    );
    if (Option.isSome(full)) {
      skipped.push({
        seed,
        reason: `${look.name}: ${full.value.axis} ${full.value.id} has its share of the batch`,
      });
      continue;
    }
    draws.push(look);
  }
  return { draws, skipped };
};

export const artBrief = (deck: ArtDeck, draw: ArtDraw, command: string): string => {
  const options = optionsOf(deck);
  const picked = deck.axes.flatMap((axis) =>
    Option.toArray(
      Option.map(
        Option.flatMap(pickOf(draw.picks, axis.id), (id) => lookup(options, refOf(axis.id, id))),
        (option) => ({ axis, option }),
      ),
    ),
  );
  const cost = Option.match(Option.fromUndefinedOr(picked.find((p) => p.option.cost === 'webgl')), {
    onNone: () => 'the Canvas 2D kit alone',
    onSome: () => 'WebGL (three.js through `glCanvas`) and the Canvas 2D kit',
  });
  const nearest = deck.existing
    .map((l) => ({ name: l.name, d: distance(deck, draw.picks, l.picks) }))
    .toSorted((a, b) => a.d - b.d)[0];
  return [
    `## \`${draw.name}\``,
    '',
    `Seed \`${draw.seed}\` (attempt ${draw.attempt}), deck v${deck.version}. Regenerate: \`${command} --seed ${draw.seed}\`.`,
    '',
    picked.map((p) => p.option.look).join(' '),
    '',
    ...picked.map((p) => `- **${p.axis.name}: ${p.option.name}.** ${p.option.asks}`),
    '',
    `**Cost:** ${cost}.`,
    ...Option.toArray(
      Option.map(
        Option.fromUndefinedOr(nearest),
        (n) => `**Nearest existing look:** \`${n.name}\`, ${Math.round(n.d * 100)}% apart.`,
      ),
    ),
    '',
    '**Standing rules:**',
    ...deck.rules.map((r) => `- ${r}`),
    '',
  ].join('\n');
};
