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
 * It also holds the generator of references the field's tests share: the
 * passage's look-alikes (a prefix, an extension, a trailing space, a case
 * change), `/`, accents and spaces, no colon, and plain generated ones.
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

/** A reference for an other verse: a tricky one, or a plain generated one. */
export const otherReference = (next: () => number, passage: string) =>
  next() < 0.5
    ? pickOf(next, trickyReferences(passage))
    : `Made ${1 + below(next, 9)}:${1 + below(next, 30)}`;

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
