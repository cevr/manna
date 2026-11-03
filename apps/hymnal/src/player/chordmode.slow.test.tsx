/**
 * Chords as a mode (unit chordmode): the hymn route as a singer and a player
 * meet it, held to the inventory of its controls. With chords off (the
 * default) the page, the bar and the player sheet show only what is sung and
 * heard, and the switch; with chords on, every control for playing comes in.
 * The switch is one setting (`chords`) with three doors here: a tap on the
 * bar's guitar head, the sheet's `Chords` switch, and a hold. While chords
 * are off the recording plays in the printed key, and a hymn's stored key is
 * heard again once they are on.
 *
 * The route is mounted as `thumb.slow.test.tsx` mounts it, in a browser's
 * document (`src/test/setup.ts`), over a player whose device the test holds
 * (`src/test/device.ts`): the hymn page with its own bar, the docked bar, and
 * the player sheet. The reader and the player share one set of settings over
 * a map the test holds, as `LivePlayer` builds its player over the app's:
 * the player hears `heardMove`.
 *
 * `rows` is the inventory this route reaches, each row by its handle (a test
 * id or an accessible label) and its sort; `check` reads every row in a state
 * and names each one out of place, so a row added to the table is checked
 * with no new code. No failure prints a hymn's words.
 */

import { RegistryContext } from '@effect/atom-react';
import { describe, expect, it } from 'effect-bun-test';
import { Duration, Effect, Layer, Option, Schedule } from 'effect';
import * as KeyValueStore from 'effect/persistence/KeyValueStore';
import * as AtomRegistry from 'effect/reactivity/AtomRegistry';
import { TestClock } from 'effect/testing';
import { act, type ReactNode } from 'react';
import { View } from 'react-native';
import { createRoot } from 'react-dom/client';

import { readChords } from '../../vite/chords';
import { chordBook, hasChords } from '~/hymns/chords';
import { hymnAt } from '~/hymns/hymns';
import type { ChordReader } from '~/reader/HymnPage';
import { HymnPage } from '~/reader/HymnPage';
import { Shown } from '~/reader/screen';
import { audioUrl } from '~/remote';
import { settingsOn } from '~/settings';
import { StackHeader } from '~/test/stack';

import { fakeDevice } from '../test/device';
import { params, routed } from '../test/one';
import { propsWith } from '../test/props';
import { PlayerContext } from './context';
import { ChordReaderContext, ResetClock } from './Dials';
import { FullPlayer } from './FullPlayer';
import { Player, playerOn } from './player';
import { PageBar, PlayerBar } from './PlayerBar';

const bundled = readChords();

/** A store over `map`: what the device keeps between two launches. */
const storeOver = (map: Map<string, string>) =>
  Layer.succeed(KeyValueStore.KeyValueStore)(
    KeyValueStore.makeStringOnly({
      get: (key) => Effect.sync(() => map.get(key)),
      set: (key, value) => Effect.sync(() => void map.set(key, value)),
      remove: (key) => Effect.sync(() => void map.delete(key)),
      clear: Effect.sync(() => map.clear()),
      size: Effect.sync(() => map.size),
      keys: Effect.sync(() => Array.from(map.keys())),
    }),
  );

/** Hymn 100 moved: two semitones up, capo 1, so every reset chip has a move to reset. */
const MOVED = '{"transpose":2,"capo":1}';

/** Where a row lies: the hymn page, the bar, the bar's overlay (its dials), the player sheet. */
const scopes = {
  page: '[data-testid="page"]',
  bar: '[role="region"][aria-label="Player"]',
  dials: '[data-testid="bar-overlay"]',
  sheet: '[data-testid="sheet"]',
} as const;

type Sort = 'simple' | 'switch' | 'with chords';

interface Row {
  /** The inventory's row, as the spec numbers it, and what of it this handle is. */
  readonly row: string;
  readonly where: keyof typeof scopes;
  /** A selector inside `where`. */
  readonly handle: string;
  readonly sort: Sort;
  /** When set, the handle is present only while its text matches. */
  readonly text?: RegExp;
}

/**
 * The inventory rows the hymn route reaches over hymn 100, moved, with its
 * sheet open on its own page and the bar's dials open (a tap of the key
 * button while chords are on). Rows it cannot reach here: H1-H4 (home), A1
 * (the about sheet), T1-T4 (Settings: `settings.chordmode.test.tsx`), U1-U2
 * (routes); the bar's Tuner (`dials-tuner`) is drawn only on a device with
 * the ear, which the web lacks.
 */
const rows: ReadonlyArray<Row> = [
  { row: 'R1 about', where: 'page', handle: '[data-testid="hymn-about"]', sort: 'simple' },
  { row: 'R1 number', where: 'page', handle: '[data-testid="hymn-number"]', sort: 'simple' },
  { row: 'R1 title', where: 'page', handle: '[data-testid="hymn-name"]', sort: 'simple' },
  { row: 'R1 Favourite', where: 'page', handle: '[aria-label="Favourite"]', sort: 'simple' },
  {
    row: 'R2 syllables',
    where: 'page',
    handle: '[data-testid="line"] [data-testid^="syllable-"]',
    sort: 'simple',
  },
  { row: 'R3 chords', where: 'page', handle: '[data-testid="chord-1-1-1"]', sort: 'with chords' },
  { row: 'B1 Open player', where: 'bar', handle: '[aria-label="Open player"]', sort: 'simple' },
  { row: 'B1 grabber', where: 'bar', handle: '[data-testid="bar-grabber"]', sort: 'simple' },
  { row: 'B1 Sound', where: 'bar', handle: '[aria-label="Sound"]', sort: 'simple' },
  { row: 'B1 Play', where: 'bar', handle: '[aria-label="Play hymn 100"]', sort: 'simple' },
  {
    row: 'B2 key button',
    where: 'bar',
    handle: '[data-testid="key-button"][aria-label="Key"]',
    sort: 'switch',
  },
  {
    row: 'B3 key face',
    where: 'bar',
    handle: '[data-testid="key-face"]',
    sort: 'with chords',
    text: /^(KEY|CAPO \d+)\S/,
  },
  { row: 'B4 dials', where: 'dials', handle: '[data-testid="dials"]', sort: 'with chords' },
  {
    row: 'B4 dial-key',
    where: 'dials',
    handle: '[data-testid="dials"] [data-testid="dial-key"]',
    sort: 'with chords',
  },
  {
    row: 'B4 dial-capo',
    where: 'dials',
    handle: '[data-testid="dials"] [data-testid="dial-capo"]',
    sort: 'with chords',
  },
  {
    row: 'B4 dials-reset',
    where: 'dials',
    handle: '[data-testid="dials"] [data-testid="dials-reset"]',
    sort: 'with chords',
  },
  {
    row: 'B4 dials-backdrop',
    where: 'dials',
    handle: '[data-testid="dials-backdrop"]',
    sort: 'with chords',
  },
  {
    row: 'S1 Recording',
    where: 'sheet',
    handle: '[role="group"][aria-label="Recording"]',
    sort: 'simple',
  },
  { row: 'S1 scrubber', where: 'sheet', handle: '[aria-label="Position"]', sort: 'simple' },
  { row: 'S1 Play', where: 'sheet', handle: '[aria-label="Play hymn 100"]', sort: 'simple' },
  { row: 'S2 dial-tempo', where: 'sheet', handle: '[data-testid="dial-tempo"]', sort: 'simple' },
  { row: 'S2 tempo-bpm', where: 'sheet', handle: '[data-testid="tempo-bpm"]', sort: 'simple' },
  { row: 'S2 tempo-tap', where: 'sheet', handle: '[data-testid="tempo-tap"]', sort: 'simple' },
  { row: 'S3 stanzas', where: 'sheet', handle: '[data-testid="stanzas"]', sort: 'simple' },
  { row: 'S3 stanza-1', where: 'sheet', handle: '[data-testid="stanza-1"]', sort: 'simple' },
  { row: 'S4 start', where: 'sheet', handle: '[data-testid="start"]', sort: 'simple' },
  {
    row: 'S4 Intro',
    where: 'sheet',
    handle: '[data-testid="start"] [aria-label="Intro"]',
    sort: 'simple',
  },
  {
    row: 'S4 Click',
    where: 'sheet',
    handle: '[data-testid="start"] [aria-label="Click"]',
    sort: 'simple',
  },
  { row: 'S5 Chords switch', where: 'sheet', handle: '[aria-label="Chords"]', sort: 'switch' },
  { row: 'S6 dial-key', where: 'sheet', handle: '[data-testid="dial-key"]', sort: 'with chords' },
  { row: 'S6 dial-capo', where: 'sheet', handle: '[data-testid="dial-capo"]', sort: 'with chords' },
  {
    row: 'S6 dials-reset',
    where: 'sheet',
    handle: '[data-testid="dials-reset"]',
    sort: 'with chords',
  },
  {
    row: 'S7 dial-placement',
    where: 'sheet',
    handle: '[data-testid="dial-placement"]',
    sort: 'with chords',
  },
  {
    row: 'S7 Use global',
    where: 'sheet',
    handle: '[aria-label="Use global chord placement"]',
    sort: 'with chords',
  },
  { row: 'S8 dial-size', where: 'sheet', handle: '[data-testid="dial-size"]', sort: 'simple' },
  { row: 'S8 Font', where: 'sheet', handle: '[aria-label="Font"]', sort: 'simple' },
  { row: 'S8 Line spacing', where: 'sheet', handle: '[aria-label="Line spacing"]', sort: 'simple' },
  {
    row: 'S8 Keep screen on',
    where: 'sheet',
    handle: '[aria-label="Keep screen on"]',
    sort: 'simple',
  },
];

/**
 * The hymn route at `/hymns/<n>`: its header, its page with the page's own
 * bar, as the screen draws them; the docked bar; and the player sheet on the
 * hymn when `sheet`.
 */
const route =
  (n: number, sheet = false) =>
  (reader: ChordReader) => {
    params['number'] = String(n);
    // The sheet's route names its hymn, as the bar opens it.
    if (sheet) params['hymn'] = String(n);
    const hymn = Option.getOrThrow(hymnAt(String(n)));
    return (
      <>
        <View testID="page">
          <StackHeader />
          <Shown hymn={hymn} />
          <HymnPage hymn={hymn} reader={reader} />
          <PageBar track={hymn} />
        </View>
        {sheet && (
          <View testID="sheet">
            <FullPlayer />
          </View>
        )}
        <PlayerBar />
      </>
    );
  };

/** The player sheet on hymn `n` off any page, as the docked bar opens it over home. */
const sheetAlone = (n: number) => () => {
  params['hymn'] = String(n);
  return (
    <View testID="sheet">
      <FullPlayer />
    </View>
  );
};

const clearParams = () => {
  for (const key of Object.keys(params)) delete params[key];
};

/**
 * `screen` over a fresh player and the settings `device` keeps, mounted; it
 * unmounts when the `using` ends. The reader and the player read one set of
 * settings, and the player hears each hymn's `heardMove`, as `LivePlayer`
 * builds it.
 */
const mount = (screen: (reader: ChordReader) => ReactNode, device: Map<string, string>) => {
  routed.splice(0);
  const played = fakeDevice();
  const settings = settingsOn(storeOver(device));
  const reader: ChordReader = {
    chords: settings.chords,
    style: settings.chordStyle,
    placement: settings.placement,
    placementFor: settings.placementFor,
    effectivePlacement: settings.effectivePlacement,
    move: settings.move,
    book: chordBook(bundled),
    reading: settings.reading,
    favourites: settings.lists.favourites,
  };
  const player = playerOn(played.layer, Duration.millis(1), settings.heardMove);
  const registry = AtomRegistry.make();
  // The player follows a key change while it plays, as `LivePlayer` keeps it mounted.
  const unmountKeys = registry.mount(player.keys);
  const clock = Effect.runSync(Effect.scoped(TestClock.make()));
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  act(() =>
    root.render(
      <RegistryContext value={registry}>
        <ChordReaderContext value={reader}>
          <ResetClock value={clock}>
            <PlayerContext value={Option.some(player)}>{screen(reader)}</PlayerContext>
          </ResetClock>
        </ChordReaderContext>
      </RegistryContext>,
    ),
  );
  const all = (selector: string) => [...host.querySelectorAll(selector)];
  const get = (selector: string) =>
    Option.getOrThrow(Option.fromNullishOr(host.querySelector(selector)));
  /** Wait until `holds` of what the device was asked to play, or fail naming `what`. */
  const untilPlayed = (holds: (played: ReadonlyArray<string>) => boolean, what: string) =>
    Effect.promise(() =>
      act(() =>
        Effect.runPromise(
          Effect.suspend(
            () => (holds(played.device.played) && Effect.void) || Effect.fail(what),
          ).pipe(
            Effect.retry({ schedule: Schedule.spaced(Duration.millis(5)), times: 1000 }),
            Effect.timeoutOrElse({
              duration: Duration.seconds(2),
              orElse: () =>
                Effect.die(
                  `the device was never asked for ${what}; it played ${played.device.played.length}`,
                ),
            }),
          ),
        ),
      ),
    );
  return {
    device: played.device,
    store: device,
    all,
    get,
    has: (selector: string) => all(selector).length > 0,
    click: (selector: string) =>
      act(() => {
        get(selector).dispatchEvent(
          new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }),
        );
      }),
    untilPlayed,
    player: () => registry.get(player.state),
    [Symbol.dispose]: () => {
      unmountKeys();
      act(() => root.unmount());
      host.remove();
      registry.dispose();
      clearParams();
    },
  };
};

type Page = ReturnType<typeof mount>;

/** Whether `row` is drawn: its handle in its place, its text matching when it names one. */
const present = (page: Page, row: Row) =>
  page.all(`${scopes[row.where]} ${row.handle}`).some((found) =>
    Option.match(Option.fromUndefinedOr(row.text), {
      onNone: () => true,
      onSome: (text) => text.test(found.textContent ?? ''),
    }),
  );

/**
 * Every row of `table` out of place with chords `on`: a with-chords row shown
 * while off, or any row missing. Each names its row, its sort and its handle.
 */
const check = (page: Page, on: boolean, table: ReadonlyArray<Row> = rows) =>
  table.flatMap((row) => {
    const wanted = row.sort !== 'with chords' || on;
    if (present(page, row) === wanted) return [];
    return [
      `${row.row} (${row.sort}, ${row.where} ${row.handle}): ${(wanted && 'missing') || 'shown'}`,
    ];
  });

/** The rows drawn without the bar's dials open. */
const atRest = rows.filter((row) => row.where !== 'dials');

const KEY_BUTTON = '[data-testid="key-button"][aria-label="Key"]';
const BAR_DIALS = '[data-testid="bar-overlay"] [data-testid="dials"]';
/** The sheet's `Chords` switch: the input React Native's Switch draws on the web. */
const SWITCH = '[data-testid="sheet"] input[aria-label="Chords"]';

const keyButton = (page: Page) => page.get(KEY_BUTTON);
const tapKey = (page: Page) => page.click(KEY_BUTTON);
const switchOn = (page: Page) => (page.get(SWITCH) as HTMLInputElement).checked;
const flipSwitch = (page: Page) => act(() => (page.get(SWITCH) as HTMLInputElement).click());
/** The key button's hint (`accessibilityHint`, which react-native-web keeps off the DOM), if any. */
const hintOf = (page: Page) =>
  Option.liftThrowable(
    () => propsWith(keyButton(page), 'accessibilityHint')['accessibilityHint'],
  )();

/** A hymn the book has no chords for, the first by number. */
const chordless = (() => {
  const book = chordBook(bundled);
  const found = Array.from({ length: 695 }, (_, k) => k + 1).find(
    (n) => Option.isSome(hymnAt(String(n))) && !Option.exists(book.of(n), hasChords),
  );
  return Option.getOrThrow(Option.fromUndefinedOr(found));
})();

describe('chords off: the simple view', () => {
  it.live('c1 shows every simple row and the switch, reading off, and no row for playing', () =>
    Effect.sync(() => {
      for (const device of [new Map<string, string>(), new Map([['move.100', MOVED]])]) {
        const moved = device.has('move.100');
        using page = mount(route(100, true), device);
        expect({ moved, out: check(page, false) }).toEqual({ moved, out: [] });
        expect({ moved, switches: page.all(SWITCH).length }).toEqual({ moved, switches: 1 });
        expect(switchOn(page)).toBe(false);
        expect(keyButton(page).getAttribute('aria-valuetext')).toBe('Chords off');
        expect(page.has('[data-testid="chord-1-1-1"]')).toBe(false);
        // Nothing was written for the hymn by showing it.
        expect(device.get('chords') ?? 'false').toBe('false');
      }
    }),
  );

  it.live('c3 turns chords on by a tap on the guitar head, and opens nothing', () =>
    Effect.sync(() => {
      const device = new Map<string, string>();
      using page = mount(route(100), device);
      expect(hintOf(page)).toEqual(Option.some('Turns chords on'));
      tapKey(page);
      expect(device.get('chords')).toBe('true');
      expect(page.has('[data-testid="chord-1-1-1"]')).toBe(true);
      expect(
        present(page, {
          row: 'B3',
          where: 'bar',
          handle: '[data-testid="key-face"]',
          sort: 'with chords',
          text: /^KEY\S/,
        }),
      ).toBe(true);
      expect(page.has(BAR_DIALS)).toBe(false);
      expect(page.has('[data-testid="dials-backdrop"]')).toBe(false);
      expect(keyButton(page).getAttribute('aria-expanded')).toBe('false');
      expect(keyButton(page).getAttribute('aria-valuetext')).toBe('Db');
      // With chords on, the next tap opens the key and capo dials, as before.
      tapKey(page);
      expect(page.has(`${BAR_DIALS} [data-testid="dial-capo"]`)).toBe(true);
    }),
  );

  it.live('c5 turns chords on from a hymn with no chords, and its page says it has none', () =>
    Effect.sync(() => {
      const device = new Map<string, string>();
      using page = mount(route(chordless), device);
      const notice = () =>
        page.get('[data-testid="page"]').textContent.includes('No chords for this hymn yet.');
      expect(keyButton(page).getAttribute('aria-valuetext')).toBe('Chords off');
      expect(notice()).toBe(false);
      tapKey(page);
      expect({ hymn: chordless, chords: device.get('chords') }).toEqual({
        hymn: chordless,
        chords: 'true',
      });
      expect(notice()).toBe(true);
      expect(keyButton(page).getAttribute('aria-valuetext')).toBe('No chords');
      // With chords on, a hymn with no chords still opens no dials.
      tapKey(page);
      expect(page.has(BAR_DIALS)).toBe(false);
      expect(device.get('chords')).toBe('true');
    }),
  );
});

describe('chords on: every control', () => {
  it.live('c2 shows every row, the bar’s dials after a tap, and the switch reads on', () =>
    Effect.sync(() => {
      const device = new Map([
        ['chords', 'true'],
        ['move.100', MOVED],
      ]);
      using page = mount(route(100, true), device);
      expect(check(page, true, atRest)).toEqual([]);
      tapKey(page);
      expect(check(page, true)).toEqual([]);
      expect(page.all(SWITCH)).toHaveLength(1);
      expect(switchOn(page)).toBe(true);
      // One chord group in the sheet, after Start and before the reading: the switch, the key and capo (in either order), the placement. Each pair out of order is listed.
      const sheet = (id: string) => `[data-testid="sheet"] [data-testid="${id}"]`;
      const pairs = [
        [sheet('start'), SWITCH],
        [SWITCH, sheet('dial-key')],
        [SWITCH, sheet('dial-capo')],
        [sheet('dial-key'), sheet('dial-placement')],
        [sheet('dial-capo'), sheet('dial-placement')],
        [sheet('dial-placement'), sheet('dial-size')],
      ] as const;
      const out = pairs.filter(
        ([first, then]) =>
          (page.get(first).compareDocumentPosition(page.get(then)) &
            Node.DOCUMENT_POSITION_FOLLOWING) ===
          0,
      );
      expect(out).toEqual([]);
      expect(
        page.has(
          `[data-testid="sheet"] [role="group"][aria-label="Chord settings"] input[aria-label="Chords"]`,
        ),
      ).toBe(true);
    }),
  );

  it.live(
    'c4 closes the bar’s dials when the sheet’s switch turns chords off, and they stay closed when it turns them on',
    () =>
      Effect.sync(() => {
        const device = new Map([
          ['chords', 'true'],
          ['move.100', MOVED],
        ]);
        using page = mount(route(100, true), device);
        tapKey(page);
        expect(page.has(BAR_DIALS)).toBe(true);
        flipSwitch(page);
        expect(device.get('chords')).toBe('false');
        expect(switchOn(page)).toBe(false);
        expect(check(page, false)).toEqual([]);
        expect(keyButton(page).getAttribute('aria-expanded')).toBe('false');
        flipSwitch(page);
        expect(device.get('chords')).toBe('true');
        expect(switchOn(page)).toBe(true);
        expect(check(page, true, atRest)).toEqual([]);
        expect(page.has(BAR_DIALS)).toBe(false);
        expect(page.has('[data-testid="dials-backdrop"]')).toBe(false);
        expect(keyButton(page).getAttribute('aria-expanded')).toBe('false');
        // The hymn's move was kept through it all.
        expect(device.get('move.100')).toBe(MOVED);
      }),
  );

  it.live('c6 keeps chords on across a launch: the rows show with no touch', () =>
    Effect.sync(() => {
      const device = new Map<string, string>();
      {
        using first = mount(route(100), device);
        tapKey(first);
      }
      expect(device.get('chords')).toBe('true');
      using page = mount(route(100, true), device);
      expect(check(page, true, atRest)).toEqual([
        // Hymn 100 is not moved on this device: it has nothing to reset.
        'S6 dials-reset (with chords, sheet [data-testid="dials-reset"]): missing',
      ]);
      expect(switchOn(page)).toBe(true);
      // Chords are on, so a tap opens the dials.
      tapKey(page);
      expect(page.has(`${BAR_DIALS} [data-testid="dial-capo"]`)).toBe(true);
    }),
  );

  it.live('c8 holds the switch on a sheet off any page, with the placement but no key dials', () =>
    Effect.sync(() => {
      const device = new Map<string, string>();
      using page = mount(sheetAlone(100), device);
      expect(page.all(SWITCH)).toHaveLength(1);
      expect(switchOn(page)).toBe(false);
      expect(page.has('[data-testid="sheet"] [data-testid="dial-placement"]')).toBe(false);
      flipSwitch(page);
      expect(device.get('chords')).toBe('true');
      expect(page.all(SWITCH)).toHaveLength(1);
      expect(switchOn(page)).toBe(true);
      expect(page.has('[data-testid="sheet"] [data-testid="dial-placement"]')).toBe(true);
      // The key and capo dials belong to the hymn's own page.
      expect(page.has('[data-testid="sheet"] [data-testid="dial-key"]')).toBe(false);
      expect(page.has('[data-testid="sheet"] [data-testid="dial-capo"]')).toBe(false);
    }),
  );
});

describe('the key heard', () => {
  it.live(
    'c7 plays hymn 100 as printed while chords are off, and in its stored key once they are on',
    () =>
      Effect.gen(function* () {
        const device = new Map([['move.100', '{"transpose":2,"capo":0}']]);
        using page = mount(route(100, true), device);
        page.click('[data-testid="page"] [aria-label="Play hymn 100"]');
        yield* page.untilPlayed((played) => played.length > 0, 'any recording');
        expect(page.device.played).toEqual([audioUrl(100, 0)]);
        page.device.now = { state: 'playing', positionMs: 20_000, durationMs: 151_000 };
        yield* Effect.promise(() =>
          act(() =>
            Effect.runPromise(
              Effect.suspend(
                () =>
                  (Player.$is('Playing')(page.player()) && Effect.void) || Effect.fail('not yet'),
              ).pipe(
                Effect.retry({ schedule: Schedule.spaced(Duration.millis(5)), times: 1000 }),
                Effect.timeout(Duration.seconds(2)),
              ),
            ),
          ),
        );
        // Chords on, by the sheet's switch: the player switches to the stored key at its place.
        flipSwitch(page);
        yield* page.untilPlayed(
          (played) => played.at(-1) === audioUrl(100, 2),
          'offset 2 with chords on',
        );
        // Chords off again: back to the printed key; the stored move is kept.
        flipSwitch(page);
        yield* page.untilPlayed(
          (played) => played.at(-1) === audioUrl(100, 0),
          'offset 0 with chords off',
        );
        expect(device.get('move.100')).toBe('{"transpose":2,"capo":0}');
      }),
  );
});
