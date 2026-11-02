/**
 * The count-in's line: the pulse is drawn over the line the follow holds when
 * the count-in starts, the first line the stanza choice keeps, and the page
 * is asked to bring that line into view as the count starts, wherever the
 * page was. The line stays marked and unlit through the count.
 *
 * Cases: hymn 78 with stanza 3 only (line 16) and stanza 2 only (line 8),
 * a seeded sample of hymns with one later stanza chosen, and hymn 78 with
 * every stanza (line 0) on a page the follow showed before (a page the
 * reader scrolled away from). The held line's oracle reads the hymn's
 * sections apart from the product: the first line of a section sung with
 * the chosen stanza.
 *
 * Hymn numbers, line indices and beats only: no hymn's words are read or printed.
 */

import { describe, expect, it } from 'bun:test';
import { RegistryContext } from '@effect/atom-react';
import { Array as Arr, Duration, Option } from 'effect';
import * as Atom from 'effect/reactivity/Atom';
import * as AtomRegistry from 'effect/reactivity/AtomRegistry';
import { act } from 'react';
import { createRoot } from 'react-dom/client';

import { CueProvider } from '~/feel/cue';
import { hymnAt } from '~/hymns/hymns';
import { PlayerContext } from '~/player/context';
import { type Beat, countInOf } from '~/player/countin';
import { Player, playerOn } from '~/player/player';
import { ALL, type Choice } from '~/player/stanzas';
import { HymnPage } from '~/reader/HymnPage';
import { settings } from '~/store';
import { fakeDevice } from '~/test/device';
import { readerOn } from '~/test/reader';

import { book } from './book';

const ACCENT = 'var(--accent)';

interface Case {
  readonly number: number;
  readonly choice: Choice;
}

/** The first line sung with `choice`'s lowest stanza, read from the sections: -1 when they disagree with the timing. */
const heldLineOf = ({ number, choice }: Case): number =>
  Option.match(Option.all([hymnAt(String(number)), book.of(number)]), {
    onNone: () => -1,
    onSome: ([hymn, timeline]) => {
      const owners = hymn.sections.flatMap((section) =>
        section.lines.map(() => {
          if (section.kind === 'stanza') return section.n;
          return section.stanza;
        }),
      );
      if (owners.length !== timeline.lines.length) return -1;
      const stanza = Math.min(...choice);
      if (choice.length === 0) return 0;
      return owners.findIndex((owner) => owner === 0 || owner === stanza);
    },
  });

/** Hymns with a timeline that agrees with their sections and more than one stanza, each with its stanza count. */
const candidates = Arr.range(1, 695).flatMap((number) =>
  Option.match(hymnAt(String(number)), {
    onNone: () => [],
    onSome: (hymn) => {
      const count = hymn.sections.filter((section) => section.kind === 'stanza').length;
      if (count < 2 || heldLineOf({ number, choice: [2] }) <= 0) return [];
      return [{ number, count }];
    },
  }),
);

/** A seeded sample of `size` hymns, each with one stanza from 2 to its count chosen. */
const sampleOf = (size: number): ReadonlyArray<Case> => {
  let seed = 78;
  const next = (below: number) => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed % below;
  };
  return Arr.makeBy(size, () => {
    const { number, count } = candidates[next(candidates.length)] ?? { number: 78, count: 4 };
    return { number, choice: [2 + next(count - 1)] };
  });
};

/** The page of `number` with `choice`, under a player the test drives; each line the follow asks to scroll to. */
const mountPage = ({ number, choice }: Case) => {
  const timeline = Option.getOrThrow(book.of(number));
  const hymn = Option.getOrThrow(hymnAt(String(number)));
  const track = { number, title: hymn.title };
  const state = Atom.make<Player>(Player.Idle());
  const countIn = Atom.make<Option.Option<Beat>>(Option.none());
  const player = { ...playerOn(fakeDevice().layer, Duration.millis(1)), state, countIn };
  const registry = AtomRegistry.make();
  registry.set(settings.stanzas(number), choice);
  registry.set(settings.click, false);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const lines = () => [...host.querySelectorAll<HTMLElement>('[data-testid="line"]')];
  const asked: Array<number> = [];
  act(() =>
    root.render(
      <RegistryContext value={registry}>
        <CueProvider value={() => {}}>
          <PlayerContext value={Option.some(player)}>
            <HymnPage hymn={hymn} reader={readerOn(new Map())} />
          </PlayerContext>
        </CueProvider>
      </RegistryContext>,
    ),
  );
  // The follow measures a line's view as it scrolls to it: each measure is the line it asks for.
  lines().forEach((line, k) =>
    Object.assign(line, {
      measureLayout: () => {
        asked.push(k);
      },
    }),
  );
  const at = (kind: 'Playing' | 'Paused') => {
    const now = { track, at: timeline.first / 1000, length: Option.none<number>() };
    if (kind === 'Playing') return Player.Playing(now);
    return Player.Paused(now);
  };
  const n = countInOf(timeline.tempo).beats;
  return {
    n,
    asked,
    lines,
    /** The player at the first sung line, with no count-in. */
    tell: (kind: 'Playing' | 'Paused') => act(() => registry.set(state, at(kind))),
    /** The player counts beat `index` in, held at the first sung line. */
    beat: (index: number) =>
      act(() => {
        registry.set(state, at('Playing'));
        registry.set(countIn, Option.some({ index, of: n }));
      }),
    selected: () =>
      lines().flatMap((line, k) =>
        Arr.filter([k], () => line.getAttribute('aria-selected') === 'true'),
      ),
    pulses: () => [...host.querySelectorAll<HTMLElement>('[data-testid="count-in"]')],
    /** Whether a syllable or word of line `k` is lit in the accent. */
    lit: (k: number) =>
      Option.match(Arr.get(lines(), k), {
        onNone: () => false,
        onSome: (line) =>
          [...line.querySelectorAll<HTMLElement>('[data-testid^="syllable-"], :scope > *')].some(
            (el) => el.style.color === ACCENT,
          ),
      }),
    [Symbol.dispose]: () => {
      act(() => root.unmount());
      host.remove();
      registry.dispose();
    },
  };
};

type Page = ReturnType<typeof mountPage>;

/** Each beat of the count: the marked lines, the lines holding a pulse in their box, and line `k` lit. */
const countOf = (page: Page, k: number) =>
  Arr.makeBy(page.n, (index) => {
    page.beat(index);
    // Line j's own box: its parent, led by it, holding the pulse beside it, not in it.
    const over = (bar: HTMLElement) =>
      page.lines().flatMap((line, j) => {
        const box = line.parentElement;
        if (box?.firstElementChild !== line || !box.contains(bar) || line.contains(bar)) return [];
        return [j];
      });
    return {
      index,
      marked: page.selected(),
      pulseOver: page.pulses().flatMap(over),
      lit: page.lit(k),
    };
  });

const expected = (n: number, k: number) =>
  Arr.makeBy(n, (index) => ({ index, marked: [k], pulseOver: [k], lit: false }));

describe('the count-in over the line the follow holds', () => {
  it('reads line 16 for hymn 78 with stanza 3, line 8 with stanza 2, and a sample of later stanzas past line 0', () => {
    expect(heldLineOf({ number: 78, choice: [3] })).toBe(16);
    expect(heldLineOf({ number: 78, choice: [2] })).toBe(8);
    expect(candidates.length).toBeGreaterThan(100);
    for (const one of sampleOf(10))
      expect({ ...one, line: heldLineOf(one) > 0 }).toEqual({ ...one, line: true });
  });

  it('draws the pulse over the held line, keeps it marked and unlit, and asks for it as the count starts', () => {
    const cases = [{ number: 78, choice: [3] }, { number: 78, choice: [2] }, ...sampleOf(10)];
    for (const one of cases) {
      const k = heldLineOf(one);
      using page = mountPage(one);
      const beats = countOf(page, k);
      const askedAtStart = page.asked.slice(0, 1);
      expect({ ...one, beats, askedAtStart }).toEqual({
        ...one,
        beats: expected(page.n, k),
        askedAtStart: [k],
      });
    }
  });

  it('asks for the held line as the count starts on a page the follow showed before and the reader scrolled away from', () => {
    for (const one of [
      { number: 78, choice: ALL },
      { number: 78, choice: [3] },
    ]) {
      const k = heldLineOf(one);
      using page = mountPage(one);
      page.tell('Playing');
      page.tell('Paused');
      const before = page.asked.length;
      const beats = countOf(page, k);
      expect({ ...one, beats, asked: page.asked.slice(before) }).toEqual({
        ...one,
        beats: expected(page.n, k),
        asked: [k],
      });
    }
  });
});
