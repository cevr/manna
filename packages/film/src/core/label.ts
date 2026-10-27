// A member's part labels: each part named once by its colour classes and,
// where one class holds more than one part, by where its region lies against
// another labelled part's (above, below, left or right of it, or touching
// it), never by a point in a sheet's pixels. A label picks the largest region
// its classes and its rules leave, so one table reads every view it is
// written for, whatever the view's place on its sheet (`core/trace.ts`
// traces a sheet's parts from it). Pure.

import { Array as Arr, Boolean as Bool, Option, Order } from 'effect';

/** A region of one colour class, as a label reads it: its id, its class, its centre, its box (left, top, right, bottom) and its size in pixels. */
export interface LabelRegion {
  readonly id: number;
  readonly class: string;
  readonly at: readonly [number, number];
  readonly box: readonly [number, number, number, number];
  readonly size: number;
}

/** Where a labelled region lies against another label's: its centre above, below, left or right of that one's box (past its edge), or within a line's width of it. */
type LabelWhere =
  | { readonly above: string }
  | { readonly below: string }
  | { readonly left: string }
  | { readonly right: string }
  | { readonly touching: string };

/** One part's label: the classes its region is of, and where it lies against other labels' (every rule held). */
interface PartLabel {
  readonly classes: ReadonlyArray<string>;
  readonly where?: ReadonlyArray<LabelWhere>;
  /**
   * Whether a render's region is compared with the sheet's by the fit rows
   * (`part.iou`, `part.edge`; true unless given): a region the sheet runs on
   * into another part with no line between them (a sleeve into its mantle,
   * which a render draws apart) is read for other labels' rules alone.
   */
  readonly compared?: boolean;
  /** What the label names, one line. */
  readonly doc?: string;
}

/** A member's labels, by part name. */
export type LabelTable = Readonly<Record<string, PartLabel>>;

/** The region each label picked, and why each label it could not read was refused (a label that names no label, one made of itself, one that picks no region). */
interface LabelPicks<R extends LabelRegion> {
  readonly picked: Readonly<Record<string, R>>;
  readonly refused: ReadonlyArray<string>;
}

/** A rule as it is held: the label it names, its words, and whether region `r` lies so against `o`. */
interface Rule {
  readonly of: string;
  readonly words: string;
  readonly holds: (r: LabelRegion, o: LabelRegion) => boolean;
}

/** A rule of a label, held against the region the label it names picked. */
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

/** A grid of region ids (any other value for none), its width and height, and where its top-left lies in the pixels its regions' boxes are in. */
interface LabelGrid {
  readonly label: Int32Array;
  readonly w: number;
  readonly h: number;
  readonly origin: readonly [number, number];
}

/** Whether boxes `a` and `b` come within `reach` of each other. */
const boxesNear = (a: LabelRegion['box'], b: LabelRegion['box'], reach: number) =>
  b[0] - a[2] < reach && a[0] - b[2] < reach && b[1] - a[3] < reach && a[1] - b[3] < reach;

/** Whether a pixel within `reach` of grid pixel (`x`, `y`), either way, is of region `b`. */
const nearRegion = (g: LabelGrid, x: number, y: number, b: number, reach: number) => {
  for (let ny = Math.max(0, y - reach); ny <= Math.min(g.h - 1, y + reach); ny++)
    for (let nx = Math.max(0, x - reach); nx <= Math.min(g.w - 1, x + reach); nx++)
      if (g.label[ny * g.w + nx] === b) return true;
  return false;
};

/** Whether region `a` has a pixel within `reach` (either way) of one of region `b`'s, scanning `a`'s box. */
const reaches = (g: LabelGrid, a: LabelRegion, b: number, reach: number) => {
  const [x0, y0, x1, y1] = a.box;
  const [ox, oy] = g.origin;
  for (let y = Math.max(0, y0 - oy); y < Math.min(g.h, y1 - oy); y++)
    for (let x = Math.max(0, x0 - ox); x < Math.min(g.w, x1 - ox); x++)
      if (g.label[y * g.w + x] === a.id && nearRegion(g, x, y, b, reach)) return true;
  return false;
};

/**
 * Whether two regions touch: a pixel of the one within `reach` of a pixel of
 * the other (either way), across the line a sheet draws between them, read
 * from the smaller. Each pair is read once.
 */
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

/** The largest region first, the first by id on a tie. */
const LARGEST = Order.combine(
  Order.mapInput(Order.flip(Order.Number), (r: LabelRegion) => r.size),
  Order.mapInput(Order.Number, (r: LabelRegion) => r.id),
);

/**
 * Each label's region: of its classes, every rule held against the regions
 * the labels it names picked, the largest left (the first by id on a tie).
 * `touches` says whether two regions lie within a line's width of each
 * other. With them, why each label it cannot read is refused: one that
 * names no label, one made of itself, one that picks no region.
 */
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
    // A rule against a label that picked nothing is that label's refusal, not this one's.
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
