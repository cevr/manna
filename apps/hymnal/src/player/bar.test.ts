/**
 * Which hymn the bottom bar acts on, over every case of the player: on a
 * hymn page the page's hymn, unless another hymn sounds; off a page, the
 * held hymn, or nothing.
 */

import { describe, expect, it } from 'bun:test';
import { Option } from 'effect';

import {
  Bar,
  barFor,
  dialFind,
  dockedBar,
  Find,
  FindAct,
  FindAt,
  findAt,
  FindPress,
  findRoom,
  HASH,
  HASH_GAP,
  openAt,
  pageBar,
  playedShare,
  pressFind,
  REST,
  stackBottom,
  swipedDown,
  toggleFind,
  toldPlace,
} from './bar';
import { Player, type Track } from './player';

const three: Track = { number: 3, title: 'Three' };
const four: Track = { number: 4, title: 'Four' };
const length = Option.some(120);

/** Every state of the player holding `track`. */
const holding = (track: Track) => ({
  Loading: Player.Loading({ track }),
  Playing: Player.Playing({ track, at: 30, length }),
  Buffering: Player.Buffering({ track, at: 30, length, retry: false }),
  Paused: Player.Paused({ track, at: 30, length }),
  Ended: Player.Ended({ track, length }),
  Stopped: Player.Stopped({ track, at: Option.none() }),
  Failed: Player.Failed({ track, offline: true, at: Option.none() }),
});

describe('barFor', () => {
  it('shows nothing off a hymn page while the player holds no hymn', () => {
    expect(barFor(Player.Idle(), Option.none())).toEqual(Bar.Hidden());
  });

  it('shows the held hymn off a hymn page, in every state', () => {
    for (const state of Object.values(holding(three)))
      expect(barFor(state, Option.none())).toEqual(
        Bar.Shown({ track: three, state, page: Option.none() }),
      );
  });

  it("acts on the page's hymn while the player holds nothing", () => {
    expect(barFor(Player.Idle(), Option.some(four))).toEqual(
      Bar.Shown({ track: four, state: Player.Idle(), page: Option.none() }),
    );
  });

  it("acts on the page's hymn in every state the player holds it in", () => {
    for (const state of Object.values(holding(four)))
      expect(barFor(state, Option.some(four))).toEqual(
        Bar.Shown({ track: four, state, page: Option.none() }),
      );
  });

  it('shows another hymn that sounds, with the page hymn beside it', () => {
    const { Loading, Playing, Buffering } = holding(three);
    for (const state of [Loading, Playing, Buffering])
      expect(barFor(state, Option.some(four))).toEqual(
        Bar.Shown({ track: three, state, page: Option.some(four) }),
      );
  });

  it("gives a held hymn that does not sound way to the page's hymn", () => {
    const { Paused, Ended, Stopped, Failed } = holding(three);
    for (const state of [Paused, Ended, Stopped, Failed])
      expect(barFor(state, Option.some(four))).toEqual(
        Bar.Shown({ track: four, state: Player.Idle(), page: Option.none() }),
      );
  });
});

describe('where the bar is drawn', () => {
  it('is the page’s own while the player holds no hymn, so it comes and goes with the page', () => {
    expect(pageBar(Player.Idle(), four)).toEqual(barFor(Player.Idle(), Option.some(four)));
    expect(dockedBar(Player.Idle(), Option.some(four))).toEqual(Bar.Hidden());
    expect(dockedBar(Player.Idle(), Option.none())).toEqual(Bar.Hidden());
  });

  it('is docked under the stack, as barFor gives it, while the player holds a hymn in any state', () => {
    for (const state of [...Object.values(holding(three)), ...Object.values(holding(four))]) {
      expect(pageBar(state, four)).toEqual(Bar.Hidden());
      for (const page of [Option.none(), Option.some(four)])
        expect(dockedBar(state, page)).toEqual(barFor(state, page));
    }
  });
});

describe('the seek line', () => {
  it('fills the share played while the length is known, and nothing before', () => {
    const track = three;
    expect(playedShare(Player.Playing({ track, at: 30, length }))).toBe(0.25);
    expect(playedShare(Player.Paused({ track, at: 90, length }))).toBe(0.75);
    expect(playedShare(Player.Ended({ track, length }))).toBe(1);
    expect(playedShare(Player.Playing({ track, at: 30, length: Option.none() }))).toBe(0);
    expect(playedShare(Player.Playing({ track, at: 130, length }))).toBe(1);
    expect(playedShare(Player.Idle())).toBe(0);
    expect(playedShare(Player.Loading({ track }))).toBe(0);
    expect(playedShare(Player.Stopped({ track, at: Option.some(30) }))).toBe(0);
  });

  it('says the time gone and the length while both are known', () => {
    expect(toldPlace(Player.Playing({ track: three, at: 30, length }))).toEqual(
      Option.some('0:30 of 2:00'),
    );
    expect(toldPlace(Player.Playing({ track: three, at: 30, length: Option.none() }))).toEqual(
      Option.none(),
    );
    expect(toldPlace(Player.Idle())).toEqual(Option.none());
  });
});

describe('stackBottom', () => {
  it('leaves the stack the device inset while the bar is hidden', () => {
    expect(stackBottom(Bar.Hidden(), 34)).toBe(34);
    expect(stackBottom(Bar.Hidden(), -1)).toBe(0);
  });

  it('leaves none while the bar shows: the bar holds the home indicator', () => {
    for (const state of Object.values(holding(three))) {
      expect(stackBottom(barFor(state, Option.none()), 34)).toBe(0);
    }
    // A hymn page's own bar lies in the page: the stack reaches the window's edge.
    expect(stackBottom(dockedBar(Player.Idle(), Option.some(four)), 34)).toBe(34);
  });
});

describe('the find drums', () => {
  const shown = barFor(Player.Idle(), Option.some(four));

  it('open on the bar’s hymn, or on the first hymn while the bar shows none', () => {
    expect(openAt(shown)).toBe(4);
    expect(openAt(barFor(holding(three).Playing, Option.some(four)))).toBe(3);
    expect(openAt(Bar.Hidden())).toBe(1);
  });

  it('open on a press of the `#` and close on the next', () => {
    const open = toggleFind(Find.Closed(), shown);
    expect(open).toEqual(Find.Open({ number: 4 }));
    expect(toggleFind(open, shown)).toEqual(Find.Closed());
  });

  it('hold the number the drums dial to the book, while open', () => {
    const open = Find.Open({ number: 4 });
    expect(dialFind(open, 312)).toEqual(Find.Open({ number: 312 }));
    expect(dialFind(open, 0)).toEqual(Find.Open({ number: 1 }));
    expect(dialFind(open, 700)).toEqual(Find.Open({ number: 695 }));
  });

  it('take no dial while closed', () => {
    expect(dialFind(Find.Closed(), 312)).toEqual(Find.Closed());
  });
});

describe('a press on the find drums', () => {
  const shown = barFor(Player.Idle(), Option.some(four));
  const open = Find.Open({ number: 312 });

  it('opens and closes them on the `#`, asking nothing else', () => {
    expect(pressFind(Find.Closed(), shown, FindPress.Hash())).toEqual([
      Find.Open({ number: 4 }),
      FindAct.Stay(),
    ]);
    expect(pressFind(open, shown, FindPress.Hash())).toEqual([Find.Closed(), FindAct.Stay()]);
  });

  it('dials on a detent, held to the book, and never opens or starts a hymn', () => {
    expect(pressFind(open, shown, FindPress.Dial({ number: 13 }))).toEqual([
      Find.Open({ number: 13 }),
      FindAct.Stay(),
    ]);
    expect(pressFind(open, shown, FindPress.Dial({ number: 700 }))).toEqual([
      Find.Open({ number: 695 }),
      FindAct.Stay(),
    ]);
    expect(pressFind(Find.Closed(), shown, FindPress.Dial({ number: 13 }))).toEqual([
      Find.Closed(),
      FindAct.Stay(),
    ]);
  });

  it('opens or plays the dialled hymn on `Open` or `Play`, and closes them', () => {
    expect(pressFind(open, shown, FindPress.Open())).toEqual([
      Find.Closed(),
      FindAct.Open({ number: 312 }),
    ]);
    expect(pressFind(open, Bar.Hidden(), FindPress.Play())).toEqual([
      Find.Closed(),
      FindAct.Play({ number: 312 }),
    ]);
  });

  it('asks nothing of `Open` or `Play` while closed', () => {
    expect(pressFind(Find.Closed(), shown, FindPress.Open())).toEqual([
      Find.Closed(),
      FindAct.Stay(),
    ]);
    expect(pressFind(Find.Closed(), shown, FindPress.Play())).toEqual([
      Find.Closed(),
      FindAct.Stay(),
    ]);
  });

  it('closes them on a swipe down', () => {
    expect(pressFind(open, shown, FindPress.Swipe())).toEqual([Find.Closed(), FindAct.Stay()]);
  });

  it('counts a drag as a swipe down past 24 pt or faster than 400 pt/s', () => {
    expect(swipedDown(24, 0)).toBe(true);
    expect(swipedDown(23, 399)).toBe(false);
    expect(swipedDown(2, 400)).toBe(true);
    expect(swipedDown(-40, -900)).toBe(false);
  });
});

describe('where the `#` stands', () => {
  const shown = barFor(Player.Idle(), Option.some(four));

  it('over the bar while it shows, on any screen', () => {
    expect(findAt(shown, true)).toEqual(FindAt.OverBar({ state: Player.Idle() }));
    expect(findAt(shown, false)).toEqual(FindAt.OverBar({ state: Player.Idle() }));
  });

  it('docked alone on the home list with the bar hidden, and nowhere elsewhere', () => {
    expect(findAt(Bar.Hidden(), true)).toEqual(FindAt.Docked());
    expect(findAt(Bar.Hidden(), false)).toEqual(FindAt.Nowhere());
  });

  it('keeps a list’s end clear of it by its height over the screen’s bottom', () => {
    expect(findRoom(FindAt.Nowhere(), 34)).toBe(0);
    expect(findRoom(FindAt.OverBar({ state: Player.Idle() }), 34)).toBe(HASH_GAP + HASH);
    expect(findRoom(FindAt.Docked(), 34)).toBe(34 + (REST - HASH) / 2 + HASH);
    expect(findRoom(FindAt.Docked(), -1)).toBe((REST - HASH) / 2 + HASH);
  });
});
