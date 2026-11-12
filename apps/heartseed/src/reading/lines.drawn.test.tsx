/* oxlint-disable effect/noNullish, effect/noAsyncFunction, effect/noTernary, eslint/no-await-in-loop -- a view test: it mounts Today's verse in happy-dom's document through React's promise-based `act`, one drawing after another, draws its verses and marks with plain branches, and reads nodes whose absent attributes are null. */

/**
 * The drawings agree (hspiece L2, L3): Today's verse (`Verse`,
 * `app/index.tsx`) mounted plain, read aloud, under first letters, under
 * empty slots and with a recital's marks, for generated verses of made-up
 * words and for `Isaiah 43:2`, `Isaiah 54:17` and `Psalms 91:1` by
 * reference. In every drawing the `break-<k>` set is `linesOf`'s line
 * starts after the first, each break a direct child of the verse's view
 * with no text and hidden from VoiceOver, and the word elements are
 * `word-0` … in order, direct children of that view beside the breaks. A
 * one-line verse has no `break-` and no `line-` element, and its plain
 * drawing is one `passage` text holding the verse. A lined verse's plain
 * drawing is `passage` holding `line-0` … with the breaks between, each a
 * text, and the lines joined by a space are the verse's text with its
 * whitespace single.
 *
 * It catches a drawing that breaks at other words than another, a break in
 * one drawing only, the plain verse left one text, a break counted as a
 * word, a line text that loses or repeats a character, and a short verse
 * given a break. It misses where the rows fall on a screen: the live rows.
 */

import { describe, expect, it } from 'bun:test';
import { Option } from 'effect';
import { act } from 'react';
import { createRoot } from 'react-dom/client';

import { Verse } from '../../app/index';
import { versesOf } from '../kjv';
import type { Cue, Mark, MarkStatus } from '../matcher';
import { sourceWords } from '../matcher/words';
import { below, random } from '../test/garden-model';
import type { VoiceView } from '../voice';
import { breaksOf, linesOf } from './lines';
import type { Hold } from './view';
import { type Box, wordAt } from './words';

const IDLE: Hold = {
  held: Option.none(),
  onHeld: () => undefined,
  onHold: () => undefined,
  onSeek: () => undefined,
  onLetGo: () => undefined,
};

type Drawing = 'plain' | 'read' | 'initials' | 'none' | 'marks';
const DRAWINGS: readonly Drawing[] = ['plain', 'read', 'initials', 'none', 'marks'];

const STATUSES: readonly MarkStatus[] = ['pending', 'tentative', 'matched', 'miss', 'peek'];

const readingOf = (text: string): VoiceView => {
  const words = sourceWords(text).length;
  return {
    choice: 'her',
    enabled: true,
    status: 'reading',
    verse: text,
    words,
    lit: Math.floor(words / 2),
    current: { first: 0, last: 0 },
    ended: null,
  };
};

const marksOf = (text: string, next: () => number): readonly Mark[] =>
  sourceWords(text).map((word, index) => {
    const status = STATUSES[below(next, STATUSES.length)] ?? 'pending';
    return {
      index,
      status,
      time: status === 'pending' ? null : { start: index * 300, end: index * 300 + 200 },
      revealed: status === 'peek' ? word : null,
    };
  });

/** The props that draw `text` as `drawing`. */
const propsOf = (text: string, drawing: Drawing, next: () => number) => {
  const cue: Cue = drawing === 'initials' ? 'initials' : drawing === 'none' ? 'none' : 'full';
  return {
    text,
    cue,
    marks: drawing === 'marks' ? Option.some(marksOf(text, next)) : Option.none(),
    voice: drawing === 'read' ? Option.some(readingOf(text)) : Option.none<VoiceView>(),
    hold: IDLE,
    onPeek: () => undefined,
  };
};

const idOf = (node: Element) => node.getAttribute('data-testid') ?? '';

/** The faults of the break elements in `host` against `want`: the set, and each with no text, hidden and with no role. */
const breakFaults = (host: Element, want: readonly string[], at: Drawing): readonly string[] => {
  const breaks = [...host.querySelectorAll('[data-testid^="break-"]')];
  const faults: string[] = [];
  if (breaks.map(idOf).join(',') !== want.join(','))
    faults.push(`${at}: breaks ${breaks.map(idOf).join(',')}, want ${want.join(',')}`);
  for (const node of breaks) {
    if ((node.textContent ?? '') !== '') faults.push(`${at}: ${idOf(node)} holds text`);
    if (node.getAttribute('aria-hidden') !== 'true') faults.push(`${at}: ${idOf(node)} not hidden`);
    if (node.getAttribute('role') !== null) faults.push(`${at}: ${idOf(node)} has a role`);
  }
  return faults;
};

/** The faults of a drawing word by word: `word-<i>` in order, the breaks their siblings, nothing else in the view, no line text. */
const wordViewFaults = (host: Element, text: string, want: readonly string[], at: Drawing) => {
  const faults: string[] = [];
  if (host.querySelectorAll('[data-testid^="line-"]').length > 0)
    faults.push(`${at}: line texts outside the plain drawing`);
  const view = host.querySelector('[data-testid="word-0"]')?.parentElement ?? null;
  const children = [...(view?.children ?? [])].map(idOf);
  const words = children.filter((id) => id.startsWith('word-'));
  const n = sourceWords(text).length;
  if (words.join(',') !== Array.from({ length: n }, (_, index) => `word-${index}`).join(','))
    faults.push(`${at}: words ${words.length} of ${n}, or out of order`);
  if (children.filter((id) => id.startsWith('break-')).join(',') !== want.join(','))
    faults.push(`${at}: the breaks are not the words' siblings`);
  if (children.length !== n + want.length) faults.push(`${at}: other children in the view`);
  return faults;
};

/** The faults of the plain drawing: one text for one line, else `line-<i>` and the breaks in turn, their texts joined the verse's. */
const plainFaults = (host: Element, text: string, want: readonly string[]) => {
  const passage = host.querySelector('[data-testid="passage"]');
  if (passage === null) return ['plain: no passage'];
  if (want.length === 0)
    return passage.children.length > 0 || passage.textContent !== text
      ? ['plain: a one-line verse not one text']
      : [];
  const faults: string[] = [];
  const children = [...passage.children].map(idOf);
  const order = want.flatMap((id, index) => [`line-${index}`, id]);
  if (children.join(',') !== [...order, `line-${want.length}`].join(','))
    faults.push(`plain: passage holds ${children.join(',')}`);
  const lines = [...passage.querySelectorAll('[data-testid^="line-"]')];
  const joined = lines.map((line) => line.textContent ?? '').join(' ');
  if (joined !== text.trim().replace(/\s+/gu, ' ')) faults.push(`plain: the lines' text differs`);
  return faults;
};

/** The faults of `host` drawing `text` as `drawing`. */
const faultsOf = (host: Element, text: string, drawing: Drawing): readonly string[] => {
  const want = [...breaksOf(linesOf(text))].map((word) => `break-${word}`);
  return [
    ...breakFaults(host, want, drawing),
    ...(drawing === 'plain'
      ? plainFaults(host, text, want)
      : wordViewFaults(host, text, want, drawing)),
  ];
};

/** Every drawing of `text`, each mounted alone, its faults. */
const drawn = async (text: string, next: () => number): Promise<readonly string[]> => {
  const faults: string[] = [];
  for (const drawing of DRAWINGS) {
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    await act(async () => root.render(<Verse {...propsOf(text, drawing, next)} />));
    faults.push(...faultsOf(host, text, drawing));
    await act(async () => root.unmount());
    host.remove();
  }
  return faults;
};

const LEADS = ['', '', '', '', '(', '— '];
const TRAILS = ['', '', '', ',', ',', ';', ':', '.', '?', '!', ')', ' —', ' ...'];

const textOf = (next: () => number) =>
  Array.from(
    { length: 1 + below(next, 50) },
    (_, index) =>
      `${LEADS[below(next, LEADS.length)]}w${index}${TRAILS[below(next, TRAILS.length)]}`,
  ).join(next() < 0.2 ? '  ' : ' ');

interface Row {
  readonly top: number;
  readonly words: number[];
}

/**
 * Boxes for `lines` as the reading view lays them out on a 320 pt row:
 * words 36 tall and 20-80 wide, 7 apart, rows 2 apart inside a line, and a
 * break row (6 tall, the row gap on either side) before each line after
 * the first, so a break adds its height to every later row.
 */
const layoutOf = (next: () => number, lines: ReturnType<typeof linesOf>) => {
  const boxes = new Map<number, Box>();
  const rows: Row[] = [];
  let y = 0;
  lines.forEach((line, at) => {
    if (at > 0) y += 2 + 6 + 2;
    let x = 0;
    rows.push({ top: y, words: [] });
    for (let word = line.first; word <= line.last; word += 1) {
      const width = 20 + below(next, 60);
      if (x + width > 320 && (rows.at(-1)?.words.length ?? 0) > 0) {
        y += 36 + 2;
        x = 0;
        rows.push({ top: y, words: [] });
      }
      boxes.set(word, { x, y, width, height: 36 });
      rows.at(-1)?.words.push(word);
      x += width + 7;
    }
    y += 36;
  });
  return { boxes, rows };
};

describe('the verse’s three drawings', () => {
  it('break at linesOf’s line starts in every drawing, Isaiah 43:2, Isaiah 54:17 and Psalms 91:1 by reference', async () => {
    const next = random(43_2);
    const sizes: number[] = [];
    for (const [book, chapter, verse] of [
      [23, 43, 2],
      [23, 54, 17],
      [19, 91, 1],
    ] as const) {
      const text = versesOf(book, chapter)[verse - 1] ?? '';
      sizes.push(linesOf(text).length);
      expect(await drawn(text, next)).toEqual([]);
    }
    expect(sizes).toEqual([6, 4, 1]);
  });

  it('leave the hold’s word under the finger with break rows between the lines', () => {
    const faults: string[] = [];
    for (let seed = 1; seed <= 200; seed += 1) {
      const next = random(seed * 7_727);
      const text = textOf(next);
      const { boxes, rows } = layoutOf(next, linesOf(text));
      for (const [word, box] of boxes) {
        const got = wordAt(box.x + box.width / 2, box.y + 18, boxes);
        if (!Option.contains(got, word))
          faults.push(`seed ${seed}: word ${word} held as ${String(Option.getOrNull(got))}`);
      }
      rows.slice(1).forEach((row, at) => {
        const above = rows[at];
        if (above === undefined || row.top - above.top <= 38) return;
        const gapY = above.top + 36 + (row.top - above.top - 36) / 2 - 1;
        const got = wordAt(0, gapY, boxes);
        if (!Option.exists(got, (word) => above.words.includes(word)))
          faults.push(
            `seed ${seed}: the gap above row ${at + 1} held ${String(Option.getOrNull(got))}`,
          );
      });
    }
    expect(faults.slice(0, 3)).toEqual([]);
  });

  it('agree over generated verses, short and lined', async () => {
    const tally = { short: 0, lined: 0 };
    for (let seed = 1; seed <= 12; seed += 1) {
      const next = random(seed * 104_729);
      const text = textOf(next);
      if (linesOf(text).length > 1) tally.lined += 1;
      else tally.short += 1;
      expect({ seed, faults: await drawn(text, next) }).toEqual({ seed, faults: [] });
    }
    expect(tally.short >= 2 && tally.lined >= 2).toBe(true);
  });
});
