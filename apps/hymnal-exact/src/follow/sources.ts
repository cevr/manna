/* oxlint-disable effect/noNullish, effect/noAsyncFunction -- Exact's data module cannot import effect (docs/exact.md): it answers a Promise, and a hymn the book does not hold is undefined. */

/**
 * The follow's one data source, as `app.ts` registers it:
 * `followStep(kind, page, now, x, y, n, text)` runs one input of the page's
 * follow (`follow.ts`) at `now`, the host's ms, and answers its view. The
 * state lives here, one per launch of the data module, as the player's does;
 * nothing reads the clock.
 *
 * - `report`: the player's view on page `page`: its place `x` (sung ms), its
 *   rate `y`, the hymn it holds `n`, and `text` its phase, whether it counts
 *   in (1 or 0), its last seek's serial and its kept choices (`playerKept`).
 * - `wake`: wake `n` came. `drag`, `resume`, `relayout`: the reader's
 *   scroll began, Resume follow was pressed, the lines moved or came to rest.
 * - `down`, `move`, `up`: pointer `n` at `x`, `y` on the page's words;
 *   `text` the button, whether it is primary (1 or 0) and whether motion
 *   plays (1, or 0 under Reduce Motion). `deadline`: the hold's timer `n`.
 */

import type { Timeline } from '@manna/hymnal-app/player/stanzas';

import type { Book } from '../hymns/book.ts';
import { decodeChoices } from '../player/view.ts';
import { type Followed, type FollowView, followDesk } from './follow.ts';
import { timelineIn } from './marks.ts';

/**
 * The seam's feed: hymn `number`'s text and timeline, the whole one once
 * `words` has it (`src/timing/load.ts`), else the bundled lines-only one
 * `timing`. Each string is decoded once and its timeline kept, so the
 * follow sees a new timeline only when the words arrive.
 */
export const followedOf = (
  book: Book,
  timing: ReadonlyArray<readonly [number, string]>,
  words: (number: number) => string | undefined,
) => {
  const timed = new Map(timing);
  const byNumber = new Map(book.hymns.map((hymn) => [hymn.number, hymn]));
  const decoded = new Map<number, { text: string; timeline: Timeline | undefined }>();
  return (number: number): Followed | undefined => {
    const hymn = byNumber.get(number);
    if (hymn === undefined) return undefined;
    const text = words(number) ?? timed.get(number) ?? '';
    const kept = decoded.get(number);
    if (kept?.text === text) return { hymn, timeline: kept.timeline };
    const timeline = timelineIn(new Map([[number, text]]), number);
    decoded.set(number, { text, timeline });
    return { hymn, timeline };
  };
};

export const followSources = (
  book: Book,
  timing: ReadonlyArray<readonly [number, string]>,
  words: (number: number) => string | undefined = () => undefined,
) => {
  const desk = followDesk(followedOf(book, timing, words));
  const followStep = async ([kind, page, now, x, y, n, text]: readonly [
    string,
    number,
    number,
    number,
    number,
    number,
    string,
  ]): Promise<FollowView> => {
    const [first = '', second = '', third = '', kept = ''] = text.split(' ');
    if (kind === 'report')
      return desk.report(now, page, decodeChoices(kept)[`${page}`] ?? [], {
        number: n,
        phase: first,
        at: x,
        rate: y,
        counting: second === '1',
        seek: Number(third),
      });
    if (kind === 'wake') return desk.wake(now, n);
    if (kind === 'drag') return desk.drag(now);
    if (kind === 'resume') return desk.resume(now);
    if (kind === 'relayout') return desk.relayout(now);
    if (kind === 'deadline') return desk.deadline(now, n);
    const button = Number(first);
    const moves = third !== '0';
    if (kind === 'down')
      return desk.pointer(
        now,
        { _tag: 'Down', id: n, primary: second !== '0', button, x, y },
        moves,
      );
    if (kind === 'move') return desk.pointer(now, { _tag: 'Move', id: n, x, y }, moves);
    if (kind === 'up') return desk.pointer(now, { _tag: 'Up', id: n, button, x, y }, moves);
    return desk.view();
  };
  return { followStep };
};
