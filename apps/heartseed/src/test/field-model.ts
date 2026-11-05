/* oxlint-disable effect/noNullish, effect/noGlobals, effect/noTernary, effect/noTryCatch, effect/noRuntimeTypeof -- the model writes the field's rule out as plain branches over undefined and plain JSON, apart from the field's Option code and the garden's schema, so the two cannot share a mistake; it names a UTC day by the ISO date of a Date. */

/**
 * The field's rule written plainly from the hsfield spec, over the records a
 * garden holds and ts-fsrs's stages (`garden-model.ts`), so `fieldOf` is
 * never its own oracle:
 *
 * - rows: the passages taught, in order, each verse at its stage or `not
 *   planted`; then each other reference held, alone, in the order first sown
 *   (earliest recall, then the reference by code units);
 * - days sown: the distinct UTC dates (`toISOString`'s date) of every recall;
 * - harvest: the references whose stage is full corn.
 *
 * It also holds the generators the field's tests share: references of any
 * non-empty string (any code unit or code point, combining marks, every
 * space, colons, the passage's look-alikes) beside their canonically
 * equivalent twins, counts with no ceiling (`countOf`), and a shrinker for a
 * failing garden; and the verse number rule (the text after the last colon).
 */

import type { Grade, Recall } from '../sayit';
import {
  below,
  DAY,
  emptyReference,
  PREFIX,
  pickOf,
  referenceNext,
  referenceStage,
  type ModelStage,
} from './garden-model';

export type ModelPlantStage = ModelStage | 'not planted';

export interface ModelPassage {
  readonly title: string;
  readonly verses: readonly string[];
}

export interface ModelField {
  readonly rows: readonly {
    readonly title: string;
    readonly plants: readonly { readonly reference: string; readonly stage: ModelPlantStage }[];
  }[];
  readonly sown: number;
  readonly harvest: number;
}

/** The recalls a complete read of `disk` keeps: each value under the prefix that is a recall of its own key, every field of its type. */
export const heldOn = (disk: ReadonlyMap<string, string | null>): Recall[] =>
  [...disk].flatMap(([key, text]) => {
    if (!key.startsWith(PREFIX) || text === null) return [];
    type Field = string | number | boolean | null | undefined;
    let r: Partial<Record<keyof Recall, Field>> | null;
    try {
      r = JSON.parse(text);
    } catch {
      return [];
    }
    if (typeof r !== 'object' || r === null) return [];
    const count = (field: Field) => Number.isInteger(field) && Number(field) >= 0;
    const valid =
      typeof r.reference === 'string' &&
      [r.startedAt, r.words, r.missed, r.peeked, r.extra].every(count) &&
      [1, 2, 3, 4].includes(Number(r.grade)) &&
      [1, 2, 3].includes(Number(r.suggested)) &&
      key === `${PREFIX}${String(r.reference)}/${String(r.startedAt)}`;
    if (!valid) return [];
    return [
      {
        reference: String(r.reference),
        startedAt: Number(r.startedAt),
        grade: ([1, 2, 3, 4] as const).find((grade) => grade === r.grade) ?? 1,
        suggested: ([1, 2, 3] as const).find((grade) => grade === r.suggested) ?? 1,
        words: Number(r.words),
        missed: Number(r.missed),
        peeked: Number(r.peeked),
        extra: Number(r.extra),
      },
    ];
  });

/** A recall's UTC date, as the ISO calendar names it. */
export const utcDate = (startedAt: number) => new Date(startedAt).toISOString().slice(0, 10);

/** A recall's date in the host's time zone. */
export const localDate = (startedAt: number) => new Date(startedAt).toDateString();

/** The field the rule gives over `records` (one per recital) and the passages taught. */
export const fieldRule = (
  records: readonly Recall[],
  passages: readonly ModelPassage[],
): ModelField => {
  const held = new Map<string, Recall[]>();
  for (const recall of records) {
    const list = held.get(recall.reference) ?? [];
    list.push(recall);
    held.set(recall.reference, list);
  }
  const stage = (reference: string): ModelPlantStage => {
    const recalls = held.get(reference);
    return recalls === undefined ? 'not planted' : referenceStage(recalls);
  };
  const taught = passages.flatMap((passage) => passage.verses);
  const others = [...held.keys()]
    .filter((reference) => !taught.includes(reference))
    .map((reference) => ({
      reference,
      first: Math.min(...(held.get(reference) ?? []).map((recall) => recall.startedAt)),
    }))
    .toSorted((a, b) => {
      if (a.first !== b.first) return a.first - b.first;
      if (a.reference === b.reference) return 0;
      return a.reference < b.reference ? -1 : 1;
    });
  return {
    rows: [
      ...passages.map((passage) => ({
        title: passage.title,
        plants: passage.verses.map((reference) => ({ reference, stage: stage(reference) })),
      })),
      ...others.map(({ reference }) => ({
        title: reference,
        plants: [{ reference, stage: stage(reference) }],
      })),
    ],
    sown: new Set(records.map((recall) => utcDate(recall.startedAt))).size,
    harvest: [...held.keys()].filter((reference) => stage(reference) === 'full corn').length,
  };
};

/** References that look like `passage` but are other verses, and references of every shape the garden can store. */
export const trickyReferences = (passage: string): readonly [string, ...string[]] => [
  passage.slice(0, -1),
  `${passage}0`,
  `${passage} `,
  ` ${passage}`,
  passage.toLowerCase(),
  passage.replace(':', ': '),
  'Song of Solomon 2:1',
  'Ésaïe 41:10',
  'Psalm 23/1',
  'a/b:c',
  'Obadiah',
  '1 John 1:9',
  'Mark 4:28',
];

/**
 * A count with no ceiling: from 0 to `scale`, and each doubling of the top
 * as likely as not, so any count is reached with a chance that halves as it
 * doubles. A run's cost is kept by the number of runs, never by a cap.
 */
export const countOf = (next: () => number, scale: number) => {
  let top = scale;
  while (next() < 0.5) top *= 2;
  return below(next, top + 1);
};

/** Every character JavaScript's `\s` matches; the field collapses each run of them in a title. */
const SPACES = [
  '\t',
  '\n',
  '\v',
  '\f',
  '\r',
  ' ',
  '\u00a0',
  '\u1680',
  '\u2000',
  '\u2001',
  '\u2002',
  '\u2003',
  '\u2004',
  '\u2005',
  '\u2006',
  '\u2007',
  '\u2008',
  '\u2009',
  '\u200a',
  '\u2028',
  '\u2029',
  '\u202f',
  '\u205f',
  '\u3000',
  '\ufeff',
] as const;

/** Two or more spellings of one text. */
type Spellings = readonly [string, string, ...string[]];

/**
 * Canonically equivalent spellings that differ in code units, each group
 * one text to a reader: a composed letter and its decomposition, a
 * singleton (the angstrom and ohm signs, a CJK compatibility ideograph),
 * two marks in either order, a composition exclusion, a Hangul syllable and
 * its jamo. Each is another reference to the field, which matches exactly.
 */
export const EQUIVALENTS: readonly [Spellings, ...Spellings[]] = [
  ['\u00e9', 'e\u0301'],
  ['\u00c5', 'A\u030a', '\u212b'],
  ['\u03a9', '\u2126'],
  ['\u1e69', 's\u0323\u0307', 's\u0307\u0323', '\u1e63\u0307'],
  ['\u0915\u093c', '\u0958'],
  ['\uac00', '\u1100\u1161'],
  ['\u8c48', '\uf900'],
];

/** One code unit or code point of any kind: printable ASCII, a colon, any space, a combining mark, an equivalent spelling, any code unit at all (a lone surrogate, a control, a noncharacter), any astral code point, any letter of the BMP, or a piece of the passage. */
const unitOf = (next: () => number, own: readonly [string, ...string[]]): string => {
  const kind = below(next, 10);
  if (kind <= 1) return String.fromCharCode(0x20 + below(next, 95));
  if (kind === 2) return ':';
  if (kind === 3) return pickOf(next, SPACES);
  if (kind === 4)
    return String.fromCharCode(
      pickOf(next, [
        0x300 + below(next, 0x70),
        0x591 + below(next, 0x37),
        0x20d0 + below(next, 0x21),
      ]),
    );
  if (kind === 5) return pickOf(next, pickOf(next, EQUIVALENTS));
  if (kind === 6) return String.fromCharCode(below(next, 0x10000));
  if (kind === 7) return String.fromCodePoint(0x10000 + below(next, 0x100000));
  if (kind === 8) return String.fromCharCode(0xa0 + below(next, 0xff60));
  return pickOf(next, own);
};

/**
 * Any non-empty string a reference may be, of any length (`countOf`): a run
 * of units of every kind (`unitOf`), or the passage's own reference cut
 * short, extended, or with units put before, after or inside it.
 */
export const anyReference = (next: () => number, passage: string): string => {
  const own = passage.split(/(?=:)/u) as [string, ...string[]];
  const units = () =>
    Array.from({ length: 1 + countOf(next, 4) }, () => unitOf(next, own)).join('');
  if (next() < 0.25) {
    const at = below(next, passage.length + 1);
    return pickOf(next, [
      passage.slice(0, 1 + below(next, passage.length - 1)),
      `${passage}${units()}`,
      `${units()}${passage}`,
      `${passage.slice(0, at)}${units()}${passage.slice(at)}`,
    ]);
  }
  return units();
};

/** Two references a reader cannot tell apart, canonically equivalent and unequal: one spelling of an `EQUIVALENTS` group and another, put at the same place in `reference`. */
export const twinsOf = (next: () => number, reference: string): readonly [string, string] => {
  const group = pickOf(next, EQUIVALENTS);
  const first = below(next, group.length);
  const second = (first + 1 + below(next, group.length - 1)) % group.length;
  const at = below(next, reference.length + 1);
  const put = (spelling: string) => `${reference.slice(0, at)}${spelling}${reference.slice(at)}`;
  return [put(group[first] ?? ''), put(group[second] ?? '')];
};

/** A reference for an other verse: a tricky one, any string, or a plain generated one. */
export const otherReference = (next: () => number, passage: string) => {
  const roll = next();
  if (roll < 0.3) return pickOf(next, trickyReferences(passage));
  if (roll < 0.85) return anyReference(next, passage);
  return `Made ${1 + below(next, 9)}:${1 + below(next, 30)}`;
};

/**
 * Other references for a garden: `count` of them, distinct, none the
 * passage's, about one in five added with its canonical twin beside it.
 */
export const othersOf = (next: () => number, passage: string, count: number) => {
  const references = new Set<string>();
  while (references.size < count) {
    const reference = otherReference(next, passage);
    const pair = next() < 0.2 ? twinsOf(next, reference) : [reference];
    for (const each of pair) if (each !== passage && references.size < count) references.add(each);
  }
  return [...references];
};

/**
 * The smallest list of `items` found that still `fails`: halves, then
 * quarters and on down to single items are dropped while the failure holds,
 * at most `tries` times, so a failing garden is reported at a size a reader
 * can follow.
 */
export const shrunk = <A>(
  items: readonly A[],
  fails: (some: readonly A[]) => boolean,
  tries = 200,
) => {
  let now = [...items];
  let left = tries;
  for (let chunk = Math.ceil(now.length / 2); chunk >= 1; chunk = Math.floor(chunk / 2))
    for (let at = 0; at < now.length && left > 0; left -= 1) {
      const less = [...now.slice(0, at), ...now.slice(at + chunk)];
      if (fails(less)) now = less;
      else at += chunk;
    }
  return now;
};

/** A kind of reference a generated one reaches, for a test's coverage. */
export const referenceKinds = (reference: string) =>
  [
    reference.split(':').length > 2 && 'reference:colons',
    /[^\u0020-\u007e]/u.test(reference) && 'reference:beyond ascii',
    /\s/u.test(reference) && 'reference:space',
    !reference.includes(':') && 'reference:no colon',
    reference !== reference.normalize('NFC') && 'reference:not NFC',
    /\p{M}/u.test(reference) && 'reference:combining mark',
    /[\ud800-\udfff]/u.test(reference) && 'reference:lone surrogate',
    /[\u{10000}-\u{10ffff}]/u.test(reference) && 'reference:astral',
    reference.length > 12 && 'reference:long',
  ].filter((kind) => kind !== false);

/** The number shown under a plant, as the spec defines it: the text after the reference's last colon, nothing when it has none. */
export const verseNumberRule = (reference: string) => {
  const parts = reference.split(':');
  return parts.length < 2 ? '' : (parts.at(-1) ?? '');
};

export const HOUR = 3_600_000;

/** The times of day a recall starts at: each edge of the UTC day, hours either side of it, and anywhere. */
export const timeOfDay = (next: () => number) =>
  pickOf(next, [0, DAY - 1, 2 * HOUR, 6 * HOUR, 22 * HOUR, 23 * HOUR, below(next, DAY)] as const);

export const recallOf = (
  reference: string,
  startedAt: number,
  grade: Grade,
  peeked: number,
): Recall => ({
  reference,
  startedAt,
  grade,
  suggested: grade === 4 ? 3 : grade,
  words: 20,
  missed: peeked,
  peeked,
  extra: 0,
});

/** The next start after `at`: on the UTC day `days` on, at a chosen time, or a few minutes on when that is not later. */
export const after = (next: () => number, at: number, days: number) => {
  const then = (Math.floor(at / DAY) + days) * DAY + timeOfDay(next);
  return then > at ? then : at + 1 + below(next, 20) * 60_000;
};

/** A verse's history from its first UTC day: random grades and peeks, or a Good run on each due day to full corn, then maybe Again or more. */
export const historyOf = (next: () => number, reference: string, firstDay: number): Recall[] => {
  let at = firstDay * DAY + timeOfDay(next);
  const recalls: Recall[] = [];
  if (next() < 0.35) {
    let card = emptyReference();
    while (card.stability < 21) {
      recalls.push(recallOf(reference, at, 3, 0));
      card = referenceNext(card, 3, at);
      at = Math.max(card.due.getTime(), after(next, at, 1));
    }
    for (let i = below(next, 3); i > 0; i -= 1) {
      recalls.push(recallOf(reference, at, pickOf(next, [1, 1, 3, 2] as const), below(next, 2)));
      at = after(next, at, pickOf(next, [0, 1, 3] as const));
    }
    return recalls;
  }
  for (let i = 1 + below(next, 6); i > 0; i -= 1) {
    const grade = pickOf(next, [1, 2, 3, 3, 4] as const);
    recalls.push(recallOf(reference, at, grade, next() < 0.3 ? 1 + below(next, 2) : 0));
    at = after(next, at, pickOf(next, [0, 0, 1, 2, 5, 12] as const));
  }
  return recalls;
};
