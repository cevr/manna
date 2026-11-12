/**
 * The verify-hymnal journey files: every `features/<feature>.journey.json`
 * loads as `sim journey` loads it and names its own feature, so a bad file
 * fails the gate rather than the verifier's first `sim journey`; no hold
 * checks that something is gone before the hold has landed; each open
 * that expects the no-chords notice opens a hymn the compiled data gives no
 * chords; and every pan fits on the screen of the simulator the journey
 * runs on, as agent-device requires.
 */
import * as BunServices from '@effect/platform-bun/BunServices';
import { describe, expect, it } from 'effect-bun-test';
import { Hymn } from '@manna/hymnal/hymn';
import { type Journey, loadJourneys, loadJourneyText } from '@manna/sim/check';
import { HOLD_SETTLE, panStart } from '@manna/sim/journey';
import { Effect, Exit, FileSystem, Match, Option, Path, Schema } from 'effect';

import { app } from '../sim-app.ts';

/**
 * Seconds after `sim hold` returns by which its press has landed: SKILL.md's
 * `sim hold` line, "the press lands 5 to 9 s after it returns".
 */
const HOLD_LANDS = 9;

/** Load each journey file in `dir`, by feature, or fail on the first file refused. */
const decodeAll = (dir: string) => loadJourneys(app, dir);

/** `text` as the hymnal's journey file of `feature`, loaded as `sim journey` loads it. */
const loadText = (feature: string, text: string) => loadJourneyText(app, feature, text);

/**
 * The holds that check for a target gone before the press can have landed:
 * a `hides` in the hold's own expects, or in the next step's when the hold
 * has none, after a settle shorter than `HOLD_LANDS`. A `hides` checked then
 * finds what the pending hold is about to remove.
 */
const hidesBeforeLanding = (journey: Journey) =>
  journey.steps.flatMap((step, index) => {
    if (step.action !== 'hold' || (step.settle ?? HOLD_SETTLE) >= HOLD_LANDS) return [];
    let after = step.expect;
    if (after.length === 0) after = journey.steps[index + 1]?.expect ?? [];
    if (!after.some((expect) => 'hides' in expect)) return [];
    return [`${journey.feature}/${step.name}`];
  });

/** The key button, whose hold with chords on opens its wheel and, let go in the middle, changes nothing. */
const KEY_BUTTON = 'id=key-button';

/**
 * The holds of the key button that expect something gone: in the hold's own
 * expects, or in the next step's when the hold has none. A hold of the key
 * button only turns chords on; with chords on it opens the wheel, and a
 * plain hold lets go in its middle, which does nothing, so chords off goes
 * through a `Chords` switch.
 */
const holdsHidingAtKey = (journey: Journey) =>
  journey.steps.flatMap((step, index) => {
    if (step.action !== 'hold' || step.target !== KEY_BUTTON) return [];
    let after = step.expect;
    if (after.length === 0) after = journey.steps[index + 1]?.expect ?? [];
    if (!after.some((expect) => 'hides' in expect)) return [];
    return [`${journey.feature}/${step.name}`];
  });

const toJson = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown));

/** A `role=tab` term in a step's JSON: in a selector string, between spaces or quotes. */
const ROLE_TAB = /["\s]role=tab["\s]/;

/**
 * The `role=tab` selectors in an iOS journey, by step. React Native gives the
 * `tab` role no iOS trait, so the runner lists a tab as `other` and a
 * `role=tab` selector answers `TargetMissing` there (browse.md's Gotchas).
 */
const tabRolesOnIos = (journey: Journey) => {
  if (journey.platform !== 'ios') return [];
  return journey.steps
    .filter((step) => ROLE_TAB.test(toJson(step)))
    .map((step) => `${journey.feature}/${step.name}`);
};

/** A screen's size in points. */
interface Screen {
  readonly width: number;
  readonly height: number;
}

/** The screen of each simulator device type an iOS journey runs on, in points, as agent-device reads its viewport. */
const SCREENS = new Map<string, Screen>([['iPhone 18 Pro', { width: 402, height: 874 }]]);

/** The screen of `app.deviceType`, the simulator every iOS journey of the hymnal runs on. */
const screenOf = (deviceType: string) => Option.fromNullishOr(SCREENS.get(deviceType));

/**
 * The pans of an iOS journey that do not fit on `screen`, by step: agent-device
 * refuses a pan any point of which leaves the screen. A pan from `x,y` must
 * end on it; a pan from a target starts wherever the target is drawn, so it
 * must fit from the screen's middle, each way no longer than half the screen.
 */
const pansOffScreen = (journey: Journey, screen: Screen) => {
  if (journey.platform !== 'ios') return [];
  const inside = (at: number, size: number) => at >= 1 && at <= size - 1;
  return journey.steps.flatMap((step) => {
    if (step.action !== 'gesture') return [];
    const fromTarget = () =>
      Math.abs(step.dx) <= screen.width / 2 - 1 && Math.abs(step.dy) <= screen.height / 2 - 1;
    const fits = Option.match(panStart(step.from), {
      onNone: () => false,
      onSome: (start) =>
        Match.value(start).pipe(
          Match.when(Match.string, fromTarget),
          Match.orElse(
            (point) =>
              inside(point.x + step.dx, screen.width) && inside(point.y + step.dy, screen.height),
          ),
        ),
    });
    if (fits) return [];
    return [`${journey.feature}/${step.name}`];
  });
};

const FEATURES = import.meta.dir + '/../../../../.claude/skills/verify-hymnal/features';

/** The compiled hymns, one `<nnn>.json` each, as `vite/words.ts` reads them. */
const HYMNS = import.meta.dir + '/../../../../packages/hymnal/data/sdah-1985';

/** What a hymn with no chords shows with chords on (`ChordNotice`). */
const NO_CHORDS = 'label=No chords for this hymn yet.';

/** The hymn an `open` of `hymns/<n>` shows. */
const HYMN_LINK = /^hymns\/(\d+)$/;

/**
 * The opens that expect the no-chords notice, by step, with the hymn each
 * opens: that hymn must have no chords, or the notice never shows.
 */
const noticeOpens = (journey: Journey) =>
  journey.steps.flatMap((step) => {
    if (step.action !== 'open') return [];
    if (!step.expect.some((expect) => 'shows' in expect && expect.shows === NO_CHORDS)) return [];
    return Option.toArray(
      Option.map(Option.fromNullishOr(HYMN_LINK.exec(step.link)?.[1]), (number) => ({
        step: `${journey.feature}/${step.name}`,
        number: Number(number),
      })),
    );
  });

/** Whether a compiled hymn has a guitar chord on a sung syllable: the app's `hasChords`. */
const chorded = (hymn: Hymn) =>
  [...hymn.stanzas, ...Option.toArray(Option.fromUndefinedOr(hymn.refrain?.part))].some(
    (part) =>
      part._tag === 'Sung' &&
      part.lines.some((line) => line.some((syllable) => 'guitar' in syllable)),
  );

const decodeHymn = Schema.decodeUnknownEffect(Schema.fromJsonString(Hymn));

describe('verify-hymnal journey files', () => {
  it.effect('every journey file decodes and names its own feature', () =>
    Effect.gen(function* () {
      const journeys = yield* decodeAll(FEATURES);
      expect(journeys.map((journey) => journey.feature)).toEqual([
        'about',
        'browse',
        'chords-and-capo',
        'feel',
        'follow',
        'hymn-list',
        'hymn-reader',
        'player',
        'search',
        'settings',
      ]);
    }).pipe(Effect.provide(BunServices.layer)),
  );

  it.effect('no shipped hold checks a target gone before its press lands', () =>
    Effect.gen(function* () {
      const journeys = yield* decodeAll(FEATURES);
      expect(journeys.flatMap(hidesBeforeLanding)).toEqual([]);
    }).pipe(Effect.provide(BunServices.layer)),
  );

  it.effect('no shipped hold of the key button expects anything gone', () =>
    Effect.gen(function* () {
      const journeys = yield* decodeAll(FEATURES);
      expect(journeys.flatMap(holdsHidingAtKey)).toEqual([]);
    }).pipe(Effect.provide(BunServices.layer)),
  );

  it.effect('a hold of the key button before a hides is named; one before a shows is not', () =>
    Effect.gen(function* () {
      const hold = { action: 'hold', target: KEY_BUTTON };
      const text = toJson({
        feature: 'chords-and-capo',
        platform: 'ios',
        steps: [
          { ...hold, name: 'off', expect: [{ hides: 'id=chord-1-1-1' }] },
          { ...hold, name: 'next' },
          { name: 'gone', action: 'back', expect: [{ hides: 'id=dials' }] },
          { ...hold, name: 'on', settle: 2, expect: [{ shows: 'id=chord-1-1-1' }] },
          { name: 'other', action: 'hold', target: 'id=row-1', expect: [{ hides: 'id=x' }] },
          {
            name: 'switch',
            action: 'tap',
            target: 'role=switch label=Chords',
            expect: [{ hides: 'id=dial-key' }],
          },
        ],
      });
      const journey = yield* loadText('chords-and-capo', text);
      expect(holdsHidingAtKey(journey)).toEqual(['chords-and-capo/off', 'chords-and-capo/next']);
    }).pipe(Effect.scoped, Effect.provide(BunServices.layer)),
  );

  it.effect('no shipped iOS journey selects by role=tab', () =>
    Effect.gen(function* () {
      const journeys = yield* decodeAll(FEATURES);
      expect(journeys.flatMap(tabRolesOnIos)).toEqual([]);
    }).pipe(Effect.provide(BunServices.layer)),
  );

  it.effect('every open that expects the no-chords notice opens a hymn with no chords', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const journeys = yield* decodeAll(FEATURES);
      const chordedOpens: Array<string> = [];
      for (const open of journeys.flatMap(noticeOpens)) {
        const file = `${HYMNS}/${String(open.number).padStart(3, '0')}.json`;
        if (chorded(yield* decodeHymn(yield* fs.readFileString(file))))
          chordedOpens.push(`${open.step} (hymn ${open.number})`);
      }
      expect(chordedOpens).toEqual([]);
    }).pipe(Effect.provide(BunServices.layer)),
  );

  it.effect('a compiled hymn with chords is chorded; one with none is not', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const read = (number: number) =>
        Effect.flatMap(
          fs.readFileString(`${HYMNS}/${String(number).padStart(3, '0')}.json`),
          decodeHymn,
        );
      expect({ 100: chorded(yield* read(100)), 181: chorded(yield* read(181)) }).toEqual({
        100: true,
        181: false,
      });
    }).pipe(Effect.provide(BunServices.layer)),
  );

  it.effect(
    'an open of a hymn that expects the no-chords notice is named; another open is not',
    () =>
      Effect.gen(function* () {
        const text = toJson({
          feature: 'chords-and-capo',
          platform: 'ios',
          steps: [
            { name: 'notice', action: 'open', link: 'hymns/181', expect: [{ shows: NO_CHORDS }] },
            {
              name: 'chords',
              action: 'open',
              link: 'hymns/100',
              expect: [{ shows: 'id=key-face' }],
            },
            { name: 'home', action: 'open', link: 'hymns', expect: [{ shows: NO_CHORDS }] },
          ],
        });
        const journey = yield* loadText('chords-and-capo', text);
        expect(noticeOpens(journey)).toEqual([{ step: 'chords-and-capo/notice', number: 181 }]);
      }).pipe(Effect.scoped, Effect.provide(BunServices.layer)),
  );

  it.effect('a role=tab selector in an iOS journey is named; role=other is not', () =>
    Effect.gen(function* () {
      const text = toJson({
        feature: 'hymn-list',
        platform: 'ios',
        steps: [
          { name: 'target', action: 'tap', target: 'role=tab label=Lists' },
          { name: 'expect', action: 'back', expect: [{ shows: 'role=tab label=Sections' }] },
          { name: 'other', action: 'tap', target: 'role=other label=Lists' },
        ],
      });
      const journey = yield* loadText('hymn-list', text);
      expect(tabRolesOnIos(journey)).toEqual(['hymn-list/target', 'hymn-list/expect']);
    }).pipe(Effect.scoped, Effect.provide(BunServices.layer)),
  );

  it.effect('a hold with a short settle before a hides is named; the default settle is not', () =>
    Effect.gen(function* () {
      const hold = { action: 'hold', target: 'id=key-button' };
      const text = toJson({
        feature: 'chords-and-capo',
        platform: 'ios',
        steps: [
          { ...hold, name: 'own', settle: 2, expect: [{ hides: 'id=chord-1-1-1' }] },
          { ...hold, name: 'next', settle: 2 },
          { name: 'gone', action: 'back', expect: [{ hides: 'id=chord-1-1-1' }] },
          { ...hold, name: 'shows-first', settle: 2, expect: [{ shows: 'id=chord-1-1-1' }] },
          { ...hold, name: 'default', expect: [{ hides: 'id=chord-1-1-1' }] },
        ],
      });
      const journey = yield* loadText('chords-and-capo', text);
      expect(hidesBeforeLanding(journey)).toEqual(['chords-and-capo/own', 'chords-and-capo/next']);
    }).pipe(Effect.scoped, Effect.provide(BunServices.layer)),
  );

  it.effect('every pan of a shipped journey fits on the screen of the simulator it runs on', () =>
    Effect.gen(function* () {
      const journeys = yield* decodeAll(FEATURES);
      const screen = screenOf(app.deviceType);
      expect(Option.isSome(screen)).toBe(true);
      expect(
        Option.match(screen, {
          onNone: () => ['no screen for the device type'],
          onSome: (known) => journeys.flatMap((journey) => pansOffScreen(journey, known)),
        }),
      ).toEqual([]);
    }).pipe(Effect.provide(BunServices.layer)),
  );

  it.effect(
    'a pan longer than half the screen from a target, or off it from a point, is named',
    () =>
      Effect.gen(function* () {
        const pan = { action: 'gesture', from: 'role=button label=Sheet Grabber', dx: 0 };
        const text = toJson({
          feature: 'feel',
          platform: 'ios',
          steps: [
            { ...pan, name: 'close', dy: 760 },
            { ...pan, name: 'short', dy: 400 },
            { ...pan, name: 'half', dy: 436 },
            { ...pan, name: 'over-half', dy: 437 },
            { ...pan, name: 'wide', dx: -202, dy: 0 },
            { name: 'edge', action: 'gesture', from: '3,437', dx: 200, dy: 0 },
            { name: 'off', action: 'gesture', from: '3,437', dx: -3, dy: 0 },
            { name: 'below', action: 'gesture', from: '201,500', dx: 0, dy: 400 },
          ],
        });
        const journey = yield* loadText('feel', text);
        expect(pansOffScreen(journey, { width: 402, height: 874 })).toEqual([
          'feel/close',
          'feel/over-half',
          'feel/wide',
          'feel/off',
          'feel/below',
        ]);
      }).pipe(Effect.scoped, Effect.provide(BunServices.layer)),
  );

  it.effect('a bad journey file is refused, naming the file', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const dir = yield* fs.makeTempDirectoryScoped();
      const file = path.join(dir, 'about.journey.json');
      yield* fs.writeFileString(
        file,
        '{"feature":"about","platform":"ios","steps":[{"name":"pan","action":"gesture","from":"3,437","dx":"left","dy":0}]}',
      );
      const exit = yield* Effect.exit(decodeAll(dir));
      expect(Exit.isFailure(exit)).toBe(true);
      if (Exit.isFailure(exit)) expect(String(exit.cause)).toContain('about.journey.json');
    }).pipe(Effect.scoped, Effect.provide(BunServices.layer)),
  );
});
