/* oxlint-disable effect/noNullish, effect/noTernary -- the model is written as plain branches over null, apart from the app's Option code. */

/**
 * hslist L1 as a model apart from the app: what a list view's `Practice
 * this list` starts, the line under it and the list's caption, over plain
 * plan items, each reference's recall count now and the start rule of
 * `promise-model.ts`.
 */

import type { Recall } from '../sayit';
import { weakestModel } from './home-model';
import { startModel, type ModelStart, type ModelStartItem } from './promise-model';

/** What `Practice this list` starts, as the model holds it. */
export type ModelListStart<I extends ModelStartItem> =
  | { readonly tag: 'Open'; readonly items: readonly I[] }
  | { readonly tag: 'Weakest'; readonly verse: string; readonly start: ModelStart<I> }
  | { readonly tag: 'Learn'; readonly verse: string; readonly start: ModelStart<I> }
  | { readonly tag: 'None' };

/**
 * L1: none before a plan; the plan's items whose recalls are not past
 * their baseline and whose verse is one of `verses`, in plan order; else
 * the weakest of `verses` with recalls of its own that a tap starts
 * (`weakestModel`'s order); else the first of `verses`, in their order,
 * with none that a tap starts; else none.
 */
export const listStartModel = <I extends ModelStartItem>(
  plan: readonly I[] | null,
  verses: readonly string[],
  plants: ReadonlyMap<string, readonly Recall[]>,
  canon: ReadonlySet<string>,
  verseOf: (reference: string) => string,
): ModelListStart<I> => {
  if (plan === null) return { tag: 'None' };
  const recallsNow = (reference: string) => plants.get(reference)?.length ?? 0;
  const own = new Set(verses);
  const open = plan.filter(
    (item) => recallsNow(item.reference) <= item.recalls && own.has(verseOf(item.reference)),
  );
  if (open.length > 0) return { tag: 'Open', items: open };
  const start = (verse: string) => startModel(plan, verse, recallsNow, canon);
  const mine = new Map([...plants].filter(([reference]) => own.has(reference)));
  const weakest = weakestModel(mine, (reference) => start(reference) !== null);
  const weak = weakest === null ? null : start(weakest);
  if (weakest !== null && weak !== null) return { tag: 'Weakest', verse: weakest, start: weak };
  for (const verse of verses) {
    const learn = recallsNow(verse) === 0 ? start(verse) : null;
    if (learn !== null) return { tag: 'Learn', verse, start: learn };
  }
  return { tag: 'None' };
};

/** L1: the line under `Practice this list` over the start's items and their seconds; null when it starts nothing. */
export const listLineModel = (
  start: ModelListStart<ModelStartItem & { readonly seconds: number }>,
  verseOf: (reference: string) => string,
): string | null => {
  if (start.tag === 'None') return null;
  if (start.tag === 'Weakest') return `Starts with ${start.verse}, nothing is due`;
  if (start.tag === 'Learn') return `Starts with ${start.verse}, new today`;
  const verses = new Set(start.items.map((item) => verseOf(item.reference)));
  const seconds = start.items.reduce((sum, item) => sum + item.seconds, 0);
  return `${verses.size} ready today · about ${Math.ceil(seconds / 60)} min`;
};

/** L1: the list's caption over its plants' stages. */
export const listCaptionModel = (stages: readonly string[]) => {
  const n = stages.length === 1 ? '1 verse' : `${stages.length} verses`;
  const planted = stages.filter((stage) => stage !== 'not planted').length;
  const corn = stages.filter((stage) => stage === 'full corn').length;
  if (planted === 0) return `${n} · none planted yet`;
  if (corn === 0) return `${n} · ${planted} planted`;
  return `${n} · ${planted} planted · ${corn} at full corn`;
};
