/* oxlint-disable effect/noTernary, effect/noNullish, effect/noNodeBuiltinImport, effect/noAsyncFunction -- a Bun test that awaits the current app's modules once and reads its own and the current app's source text; the port's held hymn is undefined when none is held, as `step`'s state has it. */

/**
 * The bar is the current app's (`bar.ts`, `button.ts`, `PlayerBar.tsx`),
 * over generated play histories of every input `step` takes: after each
 * step, the hymn the port's bar shows, the page's hymn beside it, the
 * player's button (its kind and the name VoiceOver reads), whether the
 * seeker shows and what the opener tells VoiceOver are what the current
 * app gives for the same player and page, Retry before Pause once a
 * buffering wait has run long (its `Buffering` `retry`, after its
 * `giveUpAfter`, the port's `WAIT`). The marks are the current
 * `BarMark.ios.tsx`'s symbols, the swipe up is `swipedDown` turned over,
 * and the Sound switch starts on, as the current `settings.ts` keeps it.
 */

import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';

import type { Player as TheirPlayer, Track as TheirTrack } from '@manna/hymnal-app/player/player';
import { clock } from '@manna/hymnal-app/player/time';
import { Option } from 'effect';

import { below, seeded } from '../../test/random.ts';
import { current } from '../current.testing.ts';
import { TRACKS, inputOf, titleOf } from '../fixtures.testing.ts';
import { type State, WAIT, initial, pageOf, step, timesOf } from '../step.ts';
import { barOf } from './view.ts';

declare module '@manna/hymnal-app/player/bar' {
  /** The time gone and the length as the bar tells them, while both are known. */
  export const toldPlace: (
    state: TheirPlayer,
  ) => { readonly _tag: 'None' } | { readonly _tag: 'Some'; readonly value: string };
  /** A drag let go on the drums is a swipe down past 24 pt, or flung down faster than 400 pt/s. */
  export const swipedDown: (translationY: number, velocityY: number) => boolean;
  /** The bar's height at rest, in points. */
  export const REST: number;
  /** The bar's height over the home indicator while it shows `state`, tall while the player sounds. */
  export const heightOf: (state: TheirPlayer) => number;
}

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

/** The bar's buttons in the order drawn, each its kind and name: Retry first while offered. */
const drawnOf = (ours: ReturnType<typeof barOf>) => [
  ...(ours.retry === '' ? [] : [['retry', ours.retry]]),
  [ours.kind, ours.label],
];

const statesOf = (seed: number, steps: number): ReadonlyArray<State> => {
  const random = seeded(seed);
  const states: Array<State> = [];
  let state = initial;
  for (let at = 0; at < steps; at++) {
    state = step(state, inputOf(random, state)).state;
    states.push(state);
  }
  return states;
};

describe('the bar is the current app’s over play histories', async () => {
  const { bar, player } = await current();
  const { Player } = player;
  const { buttonsOf } = await import('@manna/hymnal-app/player/button');

  /** The current app's player for the port's state: the held hymn's phase, place and length. */
  const theirsOf = (state: State): TheirPlayer => {
    const h = state.held;
    if (h === undefined) return Player.Idle();
    const track = { number: h.track.number, title: h.track.title };
    const { elapsed, total } = timesOf(state);
    const length = total > 0 ? Option.some(total) : Option.none();
    if (h.phase === 'loading') return Player.Loading({ track });
    if (h.phase === 'playing') return Player.Playing({ track, at: elapsed, length });
    if (h.phase === 'buffering')
      return Player.Buffering({ track, at: elapsed, length, retry: h.waited });
    if (h.phase === 'paused') return Player.Paused({ track, at: elapsed, length });
    if (h.phase === 'ended') return Player.Ended({ track, length });
    return Player.Failed({ track, offline: h.why === 'network', at: Option.none() });
  };

  it('shows the same hymn, button, seeker and told place after every step', () => {
    let shown = 0;
    let retries = 0;
    const kinds = new Set<string>();
    for (let seed = 1; seed <= 120; seed++)
      for (const state of statesOf(seed, 40)) {
        const page = pageOf(state);
        const pageTrack: Option.Option<TheirTrack> =
          page === undefined ? Option.none() : Option.some({ number: page, title: titleOf(page) });
        const theirs = bar.dockedBar(theirsOf(state), pageTrack);
        const ours = barOf(state, titleOf);
        expect(ours.shown).toBe(theirs._tag === 'Shown');
        if (theirs._tag !== 'Shown') continue;
        expect(ours.number).toBe(theirs.track.number);
        expect(ours.page).toBe(theirs.page._tag === 'Some' ? theirs.page.value.number : 0);
        expect(ours.seeker).toBe(bar.sounding(theirs.state));
        expect(ours.rise).toBe(bar.heightOf(theirs.state) - bar.REST);
        const told = bar.toldPlace(theirs.state);
        expect(ours.told).toBe(told._tag === 'Some' ? told.value : '');
        if (state.held?.why === 'missing' && ours.number === state.held.track.number) {
          expect(ours.kind).toBe('');
          continue;
        }
        const buttons = buttonsOf(theirs.state, theirs.track);
        const drawn = drawnOf(ours);
        expect(drawn).toEqual(buttons.map((button) => [button.kind, button.label]));
        retries += drawn.length - 1;
        kinds.add(ours.kind);
        shown++;
      }
    expect(shown).toBeGreaterThan(1000);
    expect(retries).toBeGreaterThan(0);
    expect([...kinds].toSorted()).toEqual(['again', 'loading', 'pause', 'play', 'retry']);
  });

  it('the seeker’s times are the place gone and left, as the current Seeker tells them', () => {
    for (let seed = 1; seed <= 40; seed++)
      for (const state of statesOf(seed, 40)) {
        const ours = barOf(state, titleOf);
        if (!ours.seeker) continue;
        const { elapsed, total } = timesOf(state);
        expect(ours.gone).toBe(clock(elapsed));
        expect(ours.left).toBe(total > 0 ? `−${clock(Math.max(total - elapsed, 0))}` : '–:––');
      }
  });

  it('draws each button’s mark as the current BarMark.ios.tsx does', () => {
    const marks = read('../../../../hymnal/src/player/BarMark.ios.tsx');
    const symbolOf = (kind: string) =>
      new RegExp(`Match\\.when\\('${kind}', \\(\\) => '([a-z0-9.]+)'`, 'u').exec(marks)?.[1];
    for (let seed = 1; seed <= 40; seed++)
      for (const state of statesOf(seed, 40)) {
        const ours = barOf(state, titleOf);
        if (ours.kind === '' || ours.kind === 'loading') expect(ours.mark).toBe('');
        else expect(ours.mark).toBe(`symbol:sf/${symbolOf(ours.kind)}`);
      }
    const contract = read('../../../features/bar.contract');
    expect(contract).toContain(
      `PlayerMark(symbol="symbol:sf/${symbolOf('retry')}", press=ask("retry", 0), id="bar-retry", name=player.bar.retry)`,
    );
    expect(contract).toContain(`"symbol:sf/${symbolOf('sound-on')}"`);
    expect(contract).toContain(`"symbol:sf/${symbolOf('sound-off')}"`);
  });

  it('a long wait offers Retry before Pause, as the current buttonsOf, and a press loads again from the place', () => {
    const track = TRACKS[0]!;
    const run = (state: State, inputs: ReadonlyArray<Parameters<typeof step>[1]>) =>
      inputs.reduce((at, input) => step(at, input).state, state);
    const started = run(initial, [{ _tag: 'play', track }]);
    const load = started.held?.load ?? 0;
    const buffering = run(started, [
      { _tag: 'loaded', id: load, duration: 30 },
      { _tag: 'played', id: load },
      { _tag: 'playing', id: load },
      { _tag: 'time', id: load, serial: 0, seconds: 4 },
      { _tag: 'waiting', id: load },
    ]);
    expect(barOf(buffering, titleOf).retry).toBe('');
    const waited = run(buffering, [{ _tag: 'waited', id: load }]);
    const { elapsed, total } = timesOf(waited);
    const theirs = buttonsOf(
      Player.Buffering({
        track: { number: track.number, title: track.title },
        at: elapsed,
        length: Option.some(total),
        retry: true,
      }),
      { number: track.number, title: track.title },
    );
    const bar = barOf(waited, titleOf);
    expect([bar.retry, bar.label]).toEqual(theirs.map((button) => button.label));
    expect(barOf(run(waited, [{ _tag: 'waited', id: load - 1 }]), titleOf).retry).toBe(bar.retry);
    expect(barOf(run(waited, [{ _tag: 'playing', id: load }]), titleOf).retry).toBe('');
    expect(barOf(run(waited, [{ _tag: 'pause' }]), titleOf).retry).toBe('');
    const retried = step(waited, { _tag: 'retry' });
    expect(retried.command).toEqual({
      _tag: 'load',
      url: track.url,
      id: load + 1,
      from: 4,
      rate: 1,
    });
    expect(barOf(retried.state, titleOf).retry).toBe('');
    expect(barOf(run(started, [{ _tag: 'waited', id: load }]), titleOf).retry).toBe('');
  });

  it('the wait before Retry is the current player’s, and the contract counts it', () => {
    expect(read('../../../../hymnal/src/player/player.ts')).toContain(
      `const giveUpAfter = Duration.seconds(${WAIT / 1000});`,
    );
    expect(read('../../../features/player.contract')).toContain(
      `  task playerWait when player.phase == "buffering" and playerPage.onLine key=player.load\n    after(${WAIT}, playerWaited)\n`,
    );
  });

  it('a swipe up is the current swipedDown turned over', () => {
    const contract = read('../../../features/bar.contract');
    const found =
      /fn playerSwipedUp\(pull: number, speed: number\): bool = pull <= -(\d+) or speed <= -(\d+)\n/u.exec(
        contract,
      );
    expect(found).not.toBeNull();
    const pull = Number(found?.[1]);
    const speed = Number(found?.[2]);
    const random = seeded(17);
    const edges = [0, -23, -24, -25, 23, 24, -399, -400, -401, 400, -1000];
    for (let run = 0; run < 2000; run++) {
      const y = run < 121 ? (edges[run % 11] ?? 0) : below(random, 2000) - 1000;
      const v = run < 121 ? (edges[Math.floor(run / 11)] ?? 0) : below(random, 4000) - 2000;
      expect(y <= -pull || v <= -speed).toBe(bar.swipedDown(-y, -v));
    }
  });

  it('the seeker’s row is the bar’s rise, and the find bar rides over it while the bar docks', () => {
    const forma = read('../../../app.forma');
    const length = (token: string) =>
      Number(
        new RegExp(`\\n\\s*${token.replace('.', '\\.')}: length = (\\d+)px\\n`, 'u').exec(
          forma,
        )?.[1],
      );
    expect(length('size.target') + length('space.s12')).toBe(bar.REST);
    const contract = read('../../../features/bar.contract');
    expect(contract).toContain(
      'row align-items="center" gap="space.s8" padding="0px space.s16" height="size.slider" testId="seeker"',
    );
    expect(contract).toContain('height="calc(size.target + space.s12)"');
    const sounding = barOf(
      step(step(initial, { _tag: 'play', track: TRACKS[0]! }).state, {
        _tag: 'screen',
        stack: ['/'],
      }).state,
      titleOf,
    );
    expect(sounding.seeker).toBe(true);
    expect(sounding.rise).toBe(length('size.slider'));
    const find = read('../../../features/find.contract');
    expect(find).toContain('overBar ? port.safeAreaBottom + at.rest + rise + at.gap');
    expect(find.split('playerShown.dock ? playerShown.bar.rise : 0)').length - 1).toBe(3);
    expect(find.split('findFoot(').length - 1).toBe(4);
  });

  it('the Sound switch starts on and is kept across launches, as the current settings keep it', () => {
    expect(read('../../../../hymnal/src/settings.ts')).toContain(
      "sound: setting('sound', Schema.Boolean, true),",
    );
    expect(read('../../../features/bar.contract')).toContain(
      '  state playerSound = true persist\n',
    );
  });
});
