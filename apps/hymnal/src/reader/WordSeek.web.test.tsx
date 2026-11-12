import { expect, it } from 'effect-bun-test';
import { Effect, Option, Predicate } from 'effect';
import { TestClock } from 'effect/testing';

import { Player } from '~/player/player';

import { LINE_STEP, WORD_STEP } from './word-seek';
import { inAct, mountSeekReader } from '~/test/reader-word-seek';
import { choiceShown, offers, type SeekPage, seeks, VIEWPORT } from '~/test/seek-page';
import { openWordSeek } from '~/test/word-seek';

it.effect('on the web only a still primary pointer holds, and only its main lift plays', () =>
  Effect.gen(function* () {
    const app = yield* openWordSeek(false);
    const page = yield* mountSeekReader(app, { viewport: VIEWPORT });
    yield* inAct(app.play);
    const ignored = [{ button: 2 }, { primary: false }, { x: 10 }].map((init) => {
      page.pointer('pointerdown', init);
      const armed = page.waiting().length;
      page.pointer('pointerup', init);
      return armed;
    });
    page.pointer('pointerdown');
    page.pointer('pointermove', { x: 100, y: 189 });
    const swiped = page.waiting().length;
    page.pointer('pointerup', { x: 100, y: 189 });
    const before = [page.heldBack('wheel'), page.heldBack('touchmove'), page.touch()];
    page.pointer('pointerdown');
    page.pointer('pointermove', { x: 103, y: 196 });
    const armed = page.waiting();
    page.elapse();
    yield* inAct(app.untilHold('Held'));
    const during = [page.heldBack('wheel'), page.heldBack('touchmove'), page.touch()];
    page.pointer('pointerdown', { id: 2, primary: false, x: 300, y: 300 });
    page.pointer('pointermove', { id: 2, x: 300, y: 0 });
    page.pointer('pointerup', { id: 2, x: 300, y: 0 });
    page.pointer('pointerup', { button: 2, x: 103, y: 196 }, 'area');
    const others = choiceShown(page);
    const trail = [
      [103 - WORD_STEP, 196 - LINE_STEP],
      [103 + WORD_STEP, 196 - 2 * LINE_STEP - 30],
      [103 - WORD_STEP, 196 - LINE_STEP],
    ].map(([x = 0, y = 0]) => {
      page.pointer('pointermove', { x, y }, 'area');
      return choiceShown(page);
    });
    page.pointer('pointerup', { x: 103 - WORD_STEP, y: 196 - LINE_STEP }, 'area');
    page.pointer('lostpointercapture', {}, 'area');
    yield* inAct(app.untilHold('Free'));
    expect([ignored, swiped, before, armed, during, others]).toEqual([
      [0, 0, 0],
      0,
      [false, false, ['pan-y', false]],
      [350],
      [true, true, ['none', true]],
      [0, 1, true],
    ]);
    expect([trail, seeks(app), page.cues, page.touch()]).toEqual([
      [
        [1, 0, true],
        [2, 1, true],
        [1, 0, true],
      ],
      [6100],
      ['seek-grab', 'seek-tick', 'seek-tick', 'seek-tick', 'seek-release'],
      ['pan-y', false],
    ]);
  }).pipe(Effect.scoped),
);

it.effect('on the web a cancel, a lost capture or Escape cancels once; a late timer is inert', () =>
  Effect.gen(function* () {
    const app = yield* openWordSeek(false);
    const page = yield* mountSeekReader(app, { viewport: VIEWPORT });
    yield* inAct(app.play);
    page.pointer('pointerdown');
    const menu = page.heldBack('contextmenu');
    page.pointer('pointerup');
    const lifted = page.waiting().length;
    const ends = (['pointercancel', 'lostpointercapture', 'Escape'] as const).map((end) =>
      Effect.gen(function* () {
        yield* inAct(Effect.andThen(TestClock.adjust(250), app.untilPlayer(Player.$is('Playing'))));
        page.pointer('pointerdown');
        page.elapse();
        yield* inAct(app.untilHold('Held'));
        page.pointer('pointermove', { y: 200 - LINE_STEP }, 'area');
        if (end === 'Escape') page.key('Escape');
        else page.pointer(end, {}, 'area');
        page.pointer('pointerup', { y: 200 - LINE_STEP }, 'area');
        yield* inAct(app.untilHold('Free'));
        return [page.chosenLines(), [...page.touch()]];
      }),
    );
    const ended = yield* Effect.all(ends);
    yield* inAct(Effect.andThen(TestClock.adjust(250), app.untilPlayer(Player.$is('Playing'))));
    page.act('seek');
    yield* inAct(app.untilHold('Held'));
    page.key('Escape');
    yield* inAct(app.untilHold('Free'));
    const steps = offers(page, 'cancel') || Option.isSome(page.find('reader-seek-status'));
    expect([menu, lifted, ended, steps, seeks(app)]).toEqual([
      true,
      0,
      Array.from({ length: 3 }, () => [[], ['pan-y', false]]),
      false,
      [],
    ]);
    expect(page.cues).toEqual([
      ...Array.from({ length: 3 }, () => ['seek-grab', 'seek-tick']).flat(),
      'seek-grab',
    ]);
  }).pipe(Effect.scoped),
);

it.effect('a web key cannot take a hold while a pointer waits on the words', () =>
  Effect.gen(function* () {
    const app = yield* openWordSeek(false);
    const page = yield* mountSeekReader(app, { viewport: VIEWPORT });
    yield* inAct(app.play);
    page.pointer('pointerdown');
    const before = [page.waiting(), page.touch(), [...page.cues], page.chosenLines()];
    for (const key of ['Enter', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'ArrowRight']) {
      page.keyOn(key);
      expect([page.waiting(), page.touch(), page.cues, page.chosenLines()]).toEqual(before);
      expect(app.registry.get(app.player.hold.state)._tag).toBe('Free');
    }
    page.elapse();
    yield* inAct(app.untilHold('Held'));
    expect([page.touch(), page.cues]).toEqual([['none', true], ['seek-grab']]);
    page.pointer('pointerup', {}, 'area');
    yield* inAct(app.untilHold('Free'));
    expect([seeks(app), page.cues]).toEqual([[1200], ['seek-grab', 'seek-release']]);
  }).pipe(Effect.scoped),
);

/** The names a seek's control would carry, as a button, a group or its text. */
const SEEK_CONTROL =
  /^(Seek|Seek by line or word|Previous line|Next line|Previous word|Next word|Play from here|Cancel)$/;

/**
 * What the page draws for the held seek beyond the hold's own marks: every
 * drawn tappable element outside the words except About, Favourite and
 * Resume follow, any element named as a seek's control, the old entry, dock
 * and panel by id, and the status drawn larger than its one clear point.
 */
const drawnForSeek = (page: SeekPage) => {
  const tappable = [...page.host.querySelectorAll<HTMLElement>('*')].filter((element) => {
    if (!Predicate.isFunction(element.onclick) && !element.hasAttribute('tabindex')) return false;
    if (element.closest('[data-testid="reader-word-seek-area"]')) return false;
    if (element.getAttribute('data-testid') === 'hymn-about') return false;
    if (['Favourite', 'Resume follow'].includes(element.getAttribute('aria-label') ?? ''))
      return false;
    let ancestor: Option.Option<HTMLElement> = Option.some(element);
    while (Option.isSome(ancestor) && ancestor.value !== page.host) {
      const style = getComputedStyle(ancestor.value);
      if (
        style.display === 'none' ||
        ['hidden', 'collapse'].includes(style.visibility) ||
        style.opacity === '0'
      )
        return false;
      ancestor = Option.fromNullishOr(ancestor.value.parentElement);
    }
    return true;
  }).length;
  const named = [...page.host.querySelectorAll('[role="button"], button, [role="group"]')].filter(
    (element) =>
      SEEK_CONTROL.test(element.getAttribute('aria-label') ?? '') ||
      SEEK_CONTROL.test((element.textContent ?? '').trim()),
  ).length;
  const byId = ['hymn-word-seek', 'reader-seek-dock', 'reader-seek-controls'].filter((id) =>
    Option.isSome(page.find(id)),
  );
  const status = Option.match(page.find('reader-seek-status'), {
    onNone: () => 'none',
    onSome: (it) => {
      const style = getComputedStyle(it);
      const unseen =
        style.width === '1px' &&
        style.height === '1px' &&
        /^(transparent|rgba\(.*,\s*0(\.0+)?\))$/.test(style.color);
      return (unseen && 'unseen') || 'seen';
    },
  });
  return { tappable, named, byId, status };
};

it.effect(
  'the page draws no seek button or panel: idle, playing, held by a finger or by a screen reader',
  () =>
    Effect.gen(function* () {
      const app = yield* openWordSeek(false);
      const page = yield* mountSeekReader(app, { viewport: VIEWPORT, words: 'boxed' });
      const drawn = [drawnForSeek(page)];
      yield* inAct(app.play);
      drawn.push(drawnForSeek(page));
      page.act('seek');
      yield* inAct(app.untilHold('Held'));
      page.act('next-line');
      drawn.push(drawnForSeek(page));
      page.act('cancel');
      yield* inAct(Effect.andThen(TestClock.adjust(250), app.untilPlayer(Player.$is('Playing'))));
      page.pointer('pointerdown');
      page.elapse();
      yield* inAct(app.untilHold('Held'));
      drawn.push(drawnForSeek(page));
      page.pointer('pointerup', {}, 'area');
      yield* inAct(app.untilHold('Free'));
      expect(drawn).toEqual([
        { tappable: 0, named: 0, byId: [], status: 'none' },
        { tappable: 0, named: 0, byId: [], status: 'none' },
        { tappable: 0, named: 0, byId: [], status: 'unseen' },
        { tappable: 0, named: 0, byId: [], status: 'unseen' },
      ]);
    }).pipe(Effect.scoped),
);

it.effect(
  'on the web the focused words take Enter, the arrows and Escape, with no control drawn',
  () =>
    Effect.gen(function* () {
      const app = yield* openWordSeek(false);
      const page = yield* mountSeekReader(app, { viewport: VIEWPORT });
      yield* inAct(app.play);
      const area = Option.getOrThrow(page.find('reader-word-seek-area'));
      const focus = [area.tabIndex, area.getAttribute('aria-keyshortcuts')];
      page.keyOn('ArrowDown');
      const idleArrow = app.registry.get(app.player.hold.state)._tag;
      page.keyOn('Enter');
      yield* inAct(app.untilHold('Held'));
      const trail = ['ArrowDown', 'ArrowLeft', 'ArrowDown', 'ArrowUp', 'ArrowRight'].map((key) => {
        page.keyOn(key);
        return Option.getOrElse(page.status(), () => '');
      });
      page.keyOn('Enter');
      yield* inAct(app.untilHold('Free'));
      const released = [...page.cues];
      yield* inAct(Effect.andThen(TestClock.adjust(250), app.untilPlayer(Player.$is('Playing'))));
      page.keyOn('Enter');
      yield* inAct(app.untilHold('Held'));
      page.keyOn('ArrowDown');
      page.key('Escape');
      yield* inAct(app.untilHold('Free'));
      expect([focus, idleArrow, trail]).toEqual([
        [0, 'Enter ArrowUp ArrowDown ArrowLeft ArrowRight Escape'],
        'Free',
        [
          'row=2 line=2 word=2 targetMs=6200',
          'row=2 line=2 word=1 targetMs=6100',
          'row=3 line=3 word=1 targetMs=11100',
          'row=2 line=2 word=1 targetMs=6100',
          'row=2 line=2 word=2 targetMs=6200',
        ],
      ]);
      expect([released, seeks(app), page.cues.slice(released.length)]).toEqual([
        ['seek-grab', ...Array.from({ length: 5 }, () => 'seek-tick'), 'seek-release'],
        [6200],
        ['seek-grab', 'seek-tick'],
      ]);
    }).pipe(Effect.scoped),
);
