import { Array as Arr, Boolean as Bool, Option, Order } from 'effect';

export interface LabelRegion {
  readonly id: number;
  readonly class: string;
  readonly at: readonly [number, number];
  readonly box: readonly [number, number, number, number];
  readonly size: number;
}

type LabelWhere =
  | { readonly above: string }
  | { readonly below: string }
  | { readonly left: string }
  | { readonly right: string }
  | { readonly touching: string };

interface PartLabel {
  readonly classes: ReadonlyArray<string>;
  readonly where?: ReadonlyArray<LabelWhere>;
  readonly compared?: boolean;
  readonly doc?: string;
}

export type LabelTable = Readonly<Record<string, PartLabel>>;

interface LabelPicks<R extends LabelRegion> {
  readonly picked: Readonly<Record<string, R>>;
  readonly refused: ReadonlyArray<string>;
}

interface Rule {
  readonly of: string;
  readonly words: string;
  readonly holds: (r: LabelRegion, o: LabelRegion) => boolean;
}

const ruleOf = (w: LabelWhere, touches: (a: number, b: number) => boolean): Rule => {
  if ('above' in w)
    return { of: w.above, words: `above ${w.above}`, holds: (r, o) => r.at[1] < o.box[1] };
  if ('below' in w)
    return { of: w.below, words: `below ${w.below}`, holds: (r, o) => r.at[1] >= o.box[3] };
  if ('left' in w)
    return { of: w.left, words: `left of ${w.left}`, holds: (r, o) => r.at[0] < o.box[0] };
  if ('right' in w)
    return { of: w.right, words: `right of ${w.right}`, holds: (r, o) => r.at[0] >= o.box[2] };
  return {
    of: w.touching,
    words: `touching ${w.touching}`,
    holds: (r, o) => r.id !== o.id && touches(r.id, o.id),
  };
};

interface LabelGrid {
  readonly label: Int32Array;
  readonly w: number;
  readonly h: number;
  readonly origin: readonly [number, number];
}

const boxesNear = (a: LabelRegion['box'], b: LabelRegion['box'], reach: number) =>
  b[0] - a[2] < reach && a[0] - b[2] < reach && b[1] - a[3] < reach && a[1] - b[3] < reach;

const nearRegion = (g: LabelGrid, x: number, y: number, b: number, reach: number) => {
  for (let ny = Math.max(0, y - reach); ny <= Math.min(g.h - 1, y + reach); ny++)
    for (let nx = Math.max(0, x - reach); nx <= Math.min(g.w - 1, x + reach); nx++)
      if (g.label[ny * g.w + nx] === b) return true;
  return false;
};

const reaches = (g: LabelGrid, a: LabelRegion, b: number, reach: number) => {
  const [x0, y0, x1, y1] = a.box;
  const [ox, oy] = g.origin;
  for (let y = Math.max(0, y0 - oy); y < Math.min(g.h, y1 - oy); y++)
    for (let x = Math.max(0, x0 - ox); x < Math.min(g.w, x1 - ox); x++)
      if (g.label[y * g.w + x] === a.id && nearRegion(g, x, y, b, reach)) return true;
  return false;
};

export const touchingIn = (
  g: LabelGrid,
  regions: ReadonlyArray<LabelRegion>,
  reach: number,
): ((a: number, b: number) => boolean) => {
  const read = new Map<string, boolean>();
  const byId = new Map(regions.map((r) => [r.id, r]));
  const touching = (ra: LabelRegion, rb: LabelRegion) =>
    boxesNear(ra.box, rb.box, reach) &&
    Bool.match(ra.size <= rb.size, {
      onTrue: () => reaches(g, ra, rb.id, reach),
      onFalse: () => reaches(g, rb, ra.id, reach),
    });
  return (a, b) => {
    const key = `${Math.min(a, b)} ${Math.max(a, b)}`;
    return Option.getOrElse(Option.fromUndefinedOr(read.get(key)), () => {
      const met = Option.match(
        Option.all([Option.fromUndefinedOr(byId.get(a)), Option.fromUndefinedOr(byId.get(b))]),
        { onNone: () => false, onSome: ([ra, rb]) => touching(ra, rb) },
      );
      read.set(key, met);
      return met;
    });
  };
};

const LARGEST = Order.combine(
  Order.mapInput(Order.flip(Order.Number), (r: LabelRegion) => r.size),
  Order.mapInput(Order.Number, (r: LabelRegion) => r.id),
);

export const labelRegions = <R extends LabelRegion>(
  regions: ReadonlyArray<R>,
  table: LabelTable,
  touches: (a: number, b: number) => boolean,
): LabelPicks<R> => {
  const picked = new Map<string, Option.Option<R>>();
  const making = new Set<string>();
  const refused: string[] = [];
  const refuse = (why: string) => {
    refused.push(why);
    return Option.none<R>();
  };
  const largest = (
    name: string,
    label: PartLabel,
    rules: ReadonlyArray<Rule>,
    held: ReadonlyArray<R>,
  ) =>
    Option.orElse(
      Arr.head(
        Arr.sort(
          regions.filter(
            (r) =>
              label.classes.includes(r.class) &&
              Arr.zip(rules, held).every(([rule, o]) => rule.holds(r, o)),
          ),
          LARGEST,
        ),
      ),
      () =>
        refuse(
          `the label ${name} picks no region (${[label.classes.join(' or '), ...rules.map((r) => r.words)].join(', ')})`,
        ),
    );
  const pickOf = (name: string, label: PartLabel): Option.Option<R> => {
    making.add(name);
    const rules = Arr.map(
      Option.getOrElse(Option.fromUndefinedOr(label.where), () => []),
      (w) => ruleOf(w, touches),
    );
    const against = Option.all(rules.map((rule) => pick(rule.of)));
    making.delete(name);
    return Option.flatMap(against, (held) => largest(name, label, rules, held));
  };
  const made = (name: string): Option.Option<R> =>
    Option.match(Option.fromUndefinedOr(table[name]), {
      onNone: () => refuse(`no label ${name}`),
      onSome: (label) =>
        Bool.match(making.has(name), {
          onTrue: () => refuse(`the label ${name} is made of itself`),
          onFalse: () => pickOf(name, label),
        }),
    });
  const pick = (name: string): Option.Option<R> =>
    Option.getOrElse(Option.fromUndefinedOr(picked.get(name)), () => {
      const region = made(name);
      picked.set(name, region);
      return region;
    });
  const out: Record<string, R> = {};
  for (const name of Object.keys(table)) Option.map(pick(name), (r) => (out[name] = r));
  return { picked: out, refused: Arr.dedupe(refused) };
};
