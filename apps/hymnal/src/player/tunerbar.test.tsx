/**
 * The bar's columns (owner, 2026-11-11: the handle "exactly centred"),
 * mounted whole over a player and a reader's store (`src/test/bar.tsx`).
 *
 * - R1 on its own hymn's page the bar is three columns, the key button's and
 *   the marks' each the wider one's width, so the grabber's centre is the
 *   bar's, for chords on and off, with and without the ear, and every face;
 * - R2 while another hymn sounds, the row keeps its own widths and draws
 *   every item.
 *
 * A layout is told as the platform tells it, through each view's `onLayout`
 * (`src/test/props.ts`). Hymn numbers only: no hymn's words are read.
 */

import { describe, expect, it } from 'bun:test';
import { Effect, Option } from 'effect';
import { act } from 'react';

import { hymnAt } from '~/hymns/hymns';
import { Shown } from '~/reader/screen';

import { chordsOn, keyButton, morning, mount, type Mounted, onPage, px } from '../test/bar';
import { propsWith } from '../test/props';
import { PlayerBar } from './PlayerBar';

const other = Option.getOrThrow(hymnAt('225'));

/** The bar's width on a 393-point phone, and its padding at each side. */
const WIDTH = 393;

/** The view at `selector` laid out at `layout`, as the platform tells it. */
const layOut = (page: Mounted, selector: string, layout: Record<string, number>) =>
  act(() =>
    (
      propsWith(page.get(selector), 'onLayout')['onLayout'] as (event: {
        readonly nativeEvent: { readonly layout: Record<string, number> };
      }) => void
    )({ nativeEvent: { layout: { x: 0, y: 0, height: 44, ...layout } } }),
  );

/** The grabber's centre from the bar's left edge, as the row's padding, gap and side columns place the opener between them. */
const grabberCentre = (page: Mounted) => {
  const left = page.get('[data-testid="bar-side-key"]');
  const right = page.get('[data-testid="bar-side-marks"]');
  const row = Option.getOrThrow(Option.fromNullishOr(left.parentElement));
  const gap = px(row, 'column-gap') || px(row, 'gap');
  const from = px(row, 'padding-left') + px(left, 'width') + gap;
  const to = WIDTH - px(row, 'padding-right') - px(right, 'width') - gap;
  return (from + to) / 2;
};

describe('R1: the bar’s sides', () => {
  const faces = [
    { face: 'KEYF', move: { transpose: 4, capo: 0 }, key: 72, marks: 96 },
    { face: 'CAPO 2D', move: { transpose: 3, capo: 2 }, key: 86, marks: 60 },
    { face: 'KEYF#', move: { transpose: 5, capo: 0 }, key: 78, marks: 96 },
  ];
  for (const ear of [true, false]) {
    for (const { face, move, key, marks } of faces) {
      it(`${face}, ear ${ear}: the sides are one width, and the grabber is centred`, () => {
        using page = onPage(chordsOn(move), ear);
        expect(keyButton(page).textContent).toBe(face);
        layOut(page, '[data-testid="bar-side-key"]', { x: 12, y: 6, width: key });
        layOut(page, '[data-testid="key-button"]', { width: key });
        layOut(page, '[data-testid="bar-marks"]', { width: marks });
        const widths = ['bar-side-key', 'bar-side-marks'].map((id) =>
          px(page.get(`[data-testid="${id}"]`), 'width'),
        );
        const wider = Math.max(key, marks);
        expect(widths).toEqual([wider, wider]);
        expect(Math.abs(grabberCentre(page) - WIDTH / 2)).toBeLessThanOrEqual(0.5);
        expect(Option.isSome(page.find('[data-testid="bar-grabber"]'))).toBe(true);
      });
    }
    it(`chords off, ear ${ear}: the sides are one width, and the grabber is centred`, () => {
      using page = onPage(new Map(), ear);
      layOut(page, '[data-testid="key-button"]', { width: 44 });
      layOut(page, '[data-testid="bar-marks"]', { width: 96 });
      expect(Math.abs(grabberCentre(page) - WIDTH / 2)).toBeLessThanOrEqual(0.5);
      expect(px(page.get('[data-testid="bar-side-key"]'), 'width')).toBe(96);
    });
  }
});

describe('R2: another hymn sounding over the page', () => {
  it('keeps the row’s own widths and draws every item, the title unsqueezed', () =>
    Effect.runPromise(
      Effect.gen(function* () {
        using page = mount(
          <>
            <Shown hymn={morning} />
            <PlayerBar />
          </>,
          chordsOn(),
          true,
        );
        yield* page.start(other);
        layOut(page, '[data-testid="key-button"]', { width: 72 });
        layOut(page, '[data-testid="bar-marks"]', { width: 180 });
        const bar = page.get('[aria-label="Player"]');
        expect(
          [...bar.querySelectorAll('[role="button"]')].map((b) => b.getAttribute('aria-label')),
        ).toEqual(['Key', 'Open player', 'Play hymn 100', 'Sound']);
        expect(Option.isSome(page.find('[data-testid="bar-marks"] [aria-label$="hymn 225"]'))).toBe(
          true,
        );
        expect(bar.textContent).toContain('225');
        expect(getComputedStyle(page.get('[data-testid="bar-side-key"]')).width).not.toBe('180px');
        expect(Option.isNone(page.find('[data-testid="bar-grabber"]'))).toBe(true);
      }),
    ));
});
