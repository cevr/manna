/**
 * The real hymn page over the silent word-seek player (`word-seek.ts`),
 * mounted by react-native-web under happy-dom with its layout given by the
 * test: the lyric viewport is told its height as the platform's layout
 * would tell it, each sung line measures as a rectangle the test chose
 * (below the page's top padding, as drawn), and the page's scroll records
 * each scroll it is asked for and whether it animates. The page's seek
 * targets are the fixture's, the same the player takes, and its cues are
 * recorded by name, with no body.
 */

import { RegistryContext } from '@effect/atom-react';
import { Effect, Option, Predicate } from 'effect';
import { act, type ComponentProps } from 'react';
import { createRoot } from 'react-dom/client';

import { CueProvider } from '~/feel/cue';
import { targetsOf } from '~/follow/seek-targets';
import { PlayerContext } from '~/player/context';
import { HymnPage } from '~/reader/HymnPage';
import { SeekTargetsProvider } from '~/reader/word-seek';

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

const targetsFor = (number: number, choice: ReadonlyArray<number>) => {
  if (number !== 1) return Option.none();
  return targetsOf(seekText, seekTimeline, choice);
};

const noChords = { of: () => Option.none(), decodes: () => 0 };

/** Runs `effect` with the test's services inside React's `act`, so the page draws what it leads to. */
export const inAct = <A, E>(effect: Effect.Effect<A, E>) =>
  Effect.gen(function* () {
    const services = yield* Effect.context<never>();
    return yield* Effect.promise(() => act(() => Effect.runPromiseWith(services)(effect)));
  });

/** The page, mounted while the scope lasts. */
export const mountSeekReader = (
  app: SeekApp,
  {
    viewport = 800,
    rects = fixtureRects,
    shown = true,
    area,
  }: {
    readonly viewport?: number;
    readonly rects?: ReadonlyArray<Rect>;
    readonly shown?: boolean;
    /** The hold's touch: the phones' (`WordSeek.native.tsx`) where a test plays a native gesture. */
    readonly area?: ComponentProps<typeof HymnPage>['area'];
  } = {},
) =>
  Effect.acquireRelease(
    Effect.sync(() => {
      const cues: Array<string> = [];
      const scrolls: Array<{ readonly y: number; readonly animated: boolean }> = [];
      const reader = { ...readerOn(), book: noChords };
      const host = document.createElement('div');
      document.body.append(host);
      const root = createRoot(host);
      const draw = (visible: boolean) =>
        act(() =>
          root.render(
            <RegistryContext value={app.registry}>
              <PlayerContext value={Option.some(app.player)}>
                <CueProvider value={(cue) => void cues.push(cue._tag)}>
                  <SeekTargetsProvider value={targetsFor}>
                    <HymnPage hymn={seekText} reader={reader} shown={visible} area={area} />
                  </SeekTargetsProvider>
                </CueProvider>
              </PlayerContext>
            </RegistryContext>,
          ),
        );
      draw(shown);
      const find = (id: string) =>
        Option.fromNullishOr(host.querySelector<HTMLElement>(`[data-testid="${id}"]`));
      const scroll = Option.getOrThrow(find('hymn-scroll'));
      const inner = () => Option.getOrThrow(Option.fromNullishOr(scroll.firstElementChild));
      const padTop = () => Number.parseFloat(getComputedStyle(inner()).paddingTop) || 0;
      const lines = () => [...host.querySelectorAll<HTMLElement>('[data-testid="line"]')];
      const measure = () =>
        lines().forEach((line, k) =>
          Object.assign(line, {
            measureLayout: (
              _to: HTMLElement,
              done: (x: number, y: number, width: number, height: number) => void,
            ) => {
              const rect = rects[k] ?? { top: 0, height: 0 };
              done(0, padTop() + rect.top, 350, rect.height);
            },
          }),
        );
      measure();
      Object.assign(scroll, {
        scroll: (to: ScrollToOptions) =>
          scrolls.push({ y: to.top ?? 0, animated: to.behavior === 'smooth' }),
      });
      const lay = (height: number) =>
        act(() => {
          const told: unknown = Reflect.get(scroll, '__reactLayoutHandler');
          if (Predicate.isFunction(told))
            told({ nativeEvent: { layout: { x: 0, y: 0, width: 390, height } }, timeStamp: 0 });
        });
      lay(viewport);
      return {
        host,
        cues,
        scrolls,
        find,
        lines,
        padTop,
        /** The page's viewport is laid out `height` points tall. */
        lay,
        /** The page is shown, or another covers it. */
        show: (visible: boolean) => {
          draw(visible);
          measure();
        },
        press: (id: string) => act(() => Option.map(find(id), (found) => found.click())),
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
        /** Which words of line `k` are underlined, by their place. */
        underlined: (k: number) =>
          [...(lines()[k]?.children ?? [])].flatMap((one, w) =>
            [w].filter(
              () =>
                one instanceof HTMLElement && one.style.textDecorationLine.includes('underline'),
            ),
          ),
        unmount: () => {
          act(() => root.unmount());
          host.remove();
        },
      };
    }),
    (page) => Effect.sync(page.unmount),
  );
