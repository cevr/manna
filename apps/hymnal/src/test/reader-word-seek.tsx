/**
 * The real hymn page over the silent word-seek player (`word-seek.ts`),
 * mounted by react-native-web under happy-dom with its layout given by the
 * test: the lyric viewport is told its height as the platform's layout
 * would tell it, each sung line measures as a rectangle the test chose
 * (below the page's top padding, as drawn), and the page's scroll records
 * each scroll it is asked for and whether it animates. The page's seek
 * targets are the fixture's, the same the player takes, and its cues are
 * recorded by name, with no body.
 *
 * The page draws its words as a Plain part does (`HangingLine`), as
 * syllables (`SyllableLine`, chords off), or boxed under chords
 * (`ChordLines`), from a chord book of the fixture's own words. The touch
 * path's time (a still pointer's deadline, a chord press's age) is the
 * fixture's clock, moved by hand, and the system's Reduce Motion is the
 * document's, set as the page mounts.
 */

import { RegistryContext } from '@effect/atom-react';
import { Effect, Option, Predicate } from 'effect';
import type * as Atom from 'effect/reactivity/Atom';
import { act, type ComponentProps } from 'react';
import { createRoot } from 'react-dom/client';

import { CueProvider } from '~/feel/cue';
import { targetsOf } from '~/follow/seek-targets';
import type { Box, HymnChords, Word } from '~/hymns/chords';
import { PlayerContext } from '~/player/context';
import { HymnPage } from '~/reader/HymnPage';
import {
  type HoldTimer,
  HoldTimerProvider,
  SeekTargetsProvider,
  ShownPagesProvider,
  shownPagesOf,
} from '~/reader/word-seek';

import { readerOn } from './reader';
import { type openWordSeek, seekText, seekTimeline } from './word-seek';

export type SeekApp = Effect.Success<ReturnType<typeof openWordSeek>>;

/** A sung line's block, from the top of the words under the page's own top padding. */
export interface Rect {
  readonly top: number;
  readonly height: number;
}

/** The fixture's four sung lines, each its own height. */
export const fixtureRects: ReadonlyArray<Rect> = [
  { top: 120, height: 48 },
  { top: 180, height: 96 },
  { top: 300, height: 30 },
  { top: 360, height: 1400 },
];

/** How the page draws the fixture's words: a Plain part's words, syllables, or syllables boxed under chords. */
export type WordsDrawn = 'plain' | 'syllables' | 'boxed';

const targetsFor = (number: number, choice: ReadonlyArray<number>) => {
  if (number !== 1) return Option.none();
  return targetsOf(seekText, seekTimeline, choice);
};

/** The fixture's hymn is the page seen, or another is (the pager's neighbour, a page over it). */
const pageOf = (visible: boolean) => {
  if (visible) return 1;
  return -1;
};

const box = (text: string, chorded: boolean): Box => ({
  text,
  chords: (chorded && [{ root: 0, quality: '' as const }]) || [],
});

/**
 * Each fixture line as the timing sings it: a word of two syllables (the
 * timing's word 0, its first two onsets) and a word of one (word 1), a
 * chord over the line's first syllable.
 */
const fixtureLine: ReadonlyArray<Word> = [
  [box('al', true), box('pha', false)],
  [box('beta', false)],
];

const fixtureChords: HymnChords = {
  number: 1,
  key: { tonic: 'C', minor: false },
  stanzas: seekText.sections.map((section) => ({
    _tag: 'Sung' as const,
    level: 'syllable' as const,
    lines: section.lines.map(() => fixtureLine),
  })),
  refrain: Option.none(),
};

const bookOf = (drawn: WordsDrawn) => {
  const chords = Option.some(fixtureChords).pipe(Option.filter(() => drawn !== 'plain'));
  return { of: () => chords, decodes: () => 0 };
};

/**
 * The system's Reduce Motion, as the system sets it: happy-dom's
 * `prefersReducedMotion`, announced to `matchMedia`'s listeners by a
 * resize before and after (a listener takes its first state as not
 * matching until a resize).
 */
const setReducedMotion = (reduced: boolean) => {
  window.dispatchEvent(new Event('resize'));
  Object.assign(Reflect.get(window, 'happyDOM').settings.device, {
    prefersReducedMotion: (reduced && 'reduce') || 'no-preference',
  });
  window.dispatchEvent(new Event('resize'));
};

/** Runs `effect` with the test's services inside React's `act`, so the page draws what it leads to. */
export const inAct = <A, E>(effect: Effect.Effect<A, E>) =>
  Effect.gen(function* () {
    const services = yield* Effect.context<never>();
    return yield* Effect.promise(() => act(() => Effect.runPromiseWith(services)(effect)));
  });

const underlinedOne = (element: Element) =>
  element instanceof HTMLElement && element.style.textDecorationLine.includes('underline');

/** The page, mounted while the scope lasts. */
export const mountSeekReader = (
  app: SeekApp,
  {
    viewport = 800,
    rects = fixtureRects,
    shown = true,
    area,
    scroll: scrollArea,
    later = false,
    words = 'plain',
    reduced = false,
  }: {
    /** Measures answer only when the test says (`answer`), in the order it chooses. */
    readonly later?: boolean;
    readonly viewport?: number;
    readonly rects?: ReadonlyArray<Rect>;
    readonly shown?: boolean;
    /** The hold's touch: the phones' (`WordSeek.native.tsx`) where a test plays a native gesture. */
    readonly area?: ComponentProps<typeof HymnPage>['area'];
    /** The page's scroll to the hold's recognizer: the phones' where a test reads their graph. */
    readonly scroll?: ComponentProps<typeof HymnPage>['scroll'];
    readonly words?: WordsDrawn;
    /** The system's Reduce Motion, as the page mounts. */
    readonly reduced?: boolean;
  } = {},
) =>
  Effect.acquireRelease(
    Effect.sync(() => {
      setReducedMotion(reduced);
      const cues: Array<string> = [];
      const scrolls: Array<{ readonly y: number; readonly animated: boolean }> = [];
      const reader = { ...readerOn(), book: bookOf(words) };
      const asked: Array<() => void> = [];
      const answered = new Set<number>();
      const waiting = new Map<number, { readonly ms: number; readonly run: () => void }>();
      let timers = 0;
      let clock = 0;
      const timer: HoldTimer = {
        after: (ms, run) => {
          timers += 1;
          const id = timers;
          waiting.set(id, { ms, run });
          return () => void waiting.delete(id);
        },
        now: () => clock,
      };
      if (words === 'boxed') app.registry.set(reader.chords, true);
      const host = document.createElement('div');
      document.body.append(host);
      const root = createRoot(host);
      const seen = shownPagesOf(pageOf(shown));
      act(() =>
        root.render(
          <RegistryContext value={app.registry}>
            <PlayerContext value={Option.some(app.player)}>
              <CueProvider value={(cue) => void cues.push(cue._tag)}>
                <SeekTargetsProvider value={targetsFor}>
                  <HoldTimerProvider value={timer}>
                    <ShownPagesProvider value={seen}>
                      <HymnPage hymn={seekText} reader={reader} area={area} scroll={scrollArea} />
                    </ShownPagesProvider>
                  </HoldTimerProvider>
                </SeekTargetsProvider>
              </CueProvider>
            </PlayerContext>
          </RegistryContext>,
        ),
      );
      const find = (id: string) =>
        Option.fromNullishOr(host.querySelector<HTMLElement>(`[data-testid="${id}"]`));
      const scroll = Option.getOrThrow(find('hymn-scroll'));
      const inner = () => Option.getOrThrow(Option.fromNullishOr(scroll.firstElementChild));
      const padTop = () => Number.parseFloat(getComputedStyle(inner()).paddingTop) || 0;
      const lines = () => [...host.querySelectorAll<HTMLElement>('[data-testid="line"]')];
      /** Each sung line answers its measure with its rectangle: again after each step, so a line drawn anew answers too. */
      const measure = () =>
        lines().forEach((line, k) =>
          Object.assign(line, {
            measureLayout: (
              _to: HTMLElement,
              done: (x: number, y: number, width: number, height: number) => void,
            ) => {
              const answer = () => {
                const rect = rects[k] ?? { top: 0, height: 0 };
                done(0, padTop() + rect.top, 350, rect.height);
              };
              if (later) asked.push(answer);
              else answer();
            },
          }),
        );
      /** `step` inside React's `act`, the lines measured again after it. */
      const acted = (step: () => void) => {
        act(step);
        measure();
      };
      measure();
      Object.assign(scroll, {
        scroll: (to: ScrollToOptions) =>
          scrolls.push({ y: to.top ?? 0, animated: to.behavior === 'smooth' }),
      });
      const lay = (height: number) =>
        acted(() => {
          const told: unknown = Reflect.get(scroll, '__reactLayoutHandler');
          if (Predicate.isFunction(told))
            told({ nativeEvent: { layout: { x: 0, y: 0, width: 390, height } }, timeStamp: 0 });
        });
      lay(viewport);
      /** The open seek controls are laid out `height` points tall, as the platform's layout tells them. */
      const panel = (height: number) =>
        acted(() => {
          const told = Option.flatMap(find('reader-seek-controls'), (it) =>
            Option.liftPredicate(Reflect.get(it, '__reactLayoutHandler'), Predicate.isFunction),
          );
          Option.map(told, (it) =>
            it({ nativeEvent: { layout: { x: 0, y: 0, width: 350, height } }, timeStamp: 0 }),
          );
        });
      const chord = () =>
        Option.fromNullishOr(
          host.querySelector<HTMLElement>('[role="button"][data-testid^="chord-"]'),
        );
      const targetOf = (on: 'words' | 'area' | 'chord') => {
        if (on === 'words') return Option.fromNullishOr(lines()[0]);
        if (on === 'chord') return chord();
        return find('reader-word-seek-area');
      };
      const unanswered = () => asked.flatMap((_, k) => [k].filter((one) => !answered.has(one)));
      return {
        host,
        cues,
        scrolls,
        find,
        lines,
        padTop,
        /** The page's viewport is laid out `height` points tall. */
        lay,
        panel,
        /** The page is shown, or another covers it. */
        show: (visible: boolean) => acted(() => seen.show(pageOf(visible))),
        press: (id: string) => acted(() => Option.map(find(id), (found) => found.click())),
        /** Whether the button `id` is drawn and can be pressed. */
        enabled: (id: string) =>
          Option.exists(find(id), (found) => found.getAttribute('aria-disabled') !== 'true'),
        /** The status's numbers, while the controls are open. */
        status: () =>
          Option.flatMap(find('reader-seek-status'), (found) =>
            Option.fromNullishOr(found.getAttribute('aria-valuetext')),
          ),
        /** Which sung lines show the seek's outline, by their place. */
        chosenLines: () =>
          lines().flatMap((line, k) => [k].filter(() => line.style.outlineWidth !== '')),
        /**
         * Which words of line `k` are underlined, by their place: a word
         * drawn as syllables only when every syllable is.
         */
        underlined: (k: number) =>
          [...(lines()[k]?.children ?? [])].flatMap((word, w) => {
            const syllables = [...word.querySelectorAll('[data-testid^="syllable-"]')];
            const parts = (syllables.length > 0 && syllables) || [word];
            return [w].filter(() => parts.every(underlinedOne));
          }),
        /** Whether the page draws chords a press can take. */
        hasChord: () => Option.isSome(chord()),
        /** A press lands on the page's first chord and lifts, as the responder sees a mouse's. */
        pressChord: () =>
          acted(() =>
            Option.map(chord(), (it) => {
              const at = { button: 0, clientX: 10, clientY: 10, bubbles: true, cancelable: true };
              it.dispatchEvent(new MouseEvent('mousedown', at));
              it.dispatchEvent(new MouseEvent('mouseup', at));
            }),
          ),
        /** The hold timers waiting, by their time. */
        waiting: () => [...waiting.values()].map(({ ms }) => ms),
        /** How many measures were asked for, answered or not. */
        asked: () => asked.length,
        /** The measures asked for and not answered yet, by their place in asking order. */
        pending: unanswered,
        /** Measure `k` (in asking order) answers now; a measure answers once. */
        answer: (k: number) =>
          acted(() => {
            if (answered.has(k)) return;
            answered.add(k);
            Option.map(Option.fromUndefinedOr(asked[k]), (it) => it());
          }),
        /** The fixture's clock now: the touch path's time. */
        now: () => clock,
        /** The page's reading settings and chords switch, as the player sheet and the bar set them. */
        reading: reader.reading,
        chords: reader.chords,
        /** A setting is set, as its control sets it. */
        set: <A,>(atom: Atom.Writable<A>, value: A) => acted(() => app.registry.set(atom, value)),
        /** The system's Reduce Motion turns on or off while the page is drawn. */
        motion: (on: boolean) => acted(() => setReducedMotion(on)),
        /** The fixture's clock moves `ms` on. */
        advance: (ms: number) => {
          clock += ms;
        },
        /** The waiting hold timers' time comes: the clock moves to the latest of them. */
        elapse: () =>
          acted(() => {
            const due = [...waiting.values()];
            waiting.clear();
            clock += Math.max(0, ...due.map(({ ms }) => ms));
            due.forEach(({ run }) => run());
          }),
        /**
         * A pointer event on the web: on the first sung line's words, on a
         * chord, or on the lyric area itself, where a captured pointer's
         * events arrive wherever it is.
         */
        pointer: (
          type:
            | 'pointerdown'
            | 'pointermove'
            | 'pointerup'
            | 'pointercancel'
            | 'lostpointercapture',
          {
            id = 1,
            x = 100,
            y = 200,
            button = 0,
            primary = true,
          }: {
            readonly id?: number;
            readonly x?: number;
            readonly y?: number;
            readonly button?: number;
            readonly primary?: boolean;
          } = {},
          on: 'words' | 'area' | 'chord' = 'words',
        ) =>
          acted(() => {
            const target = Option.getOrThrow(targetOf(on));
            target.dispatchEvent(
              new PointerEvent(type, {
                pointerId: id,
                isPrimary: primary,
                button,
                clientX: x,
                clientY: y,
                bubbles: true,
                cancelable: true,
              }),
            );
          }),
        /** Whether the area held back a page scroll of `type` on its words. */
        heldBack: (type: 'wheel' | 'touchmove' | 'contextmenu') => {
          const event = new Event(type, { bubbles: false, cancelable: true });
          Option.map(find('reader-word-seek-area'), (area) => area.dispatchEvent(event));
          return event.defaultPrevented;
        },
        /** A key pressed on the page. */
        key: (key: string) =>
          acted(() => {
            document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
          }),
        /** Whether the area lets the browser scroll a touch on it, and whether it holds pointer `id`. */
        touch: (id = 1) => {
          const it = Option.getOrThrow(find('reader-word-seek-area'));
          return [it.style.touchAction, it.hasPointerCapture(id)] as const;
        },
        /** The page goes (once; again does nothing). */
        unmount: () => {
          if (!host.isConnected) return;
          act(() => root.unmount());
          host.remove();
        },
      };
    }),
    (page) =>
      Effect.sync(() => {
        page.unmount();
        setReducedMotion(false);
      }),
  );
